/**
 * contabilidad-entrada/antiguedad-de-saldos — REFLEJO STATELESS (N8, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * LO PENDIENTE CLASIFICADO POR VENCIMIENTO: quien y cuanto esta vencido.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Es el ESPEJO de N6 (vencimiento-pago) del lado del cobro/pago: N6 dice CUANDO vence cada
 * factura; N8 dice CUANTO y de QUIEN esta vencido, repartido en tramos de antiguedad.
 *
 * Calculo determinista: para cada factura toma su fecha_vencimiento (declarada, o SUBIDA por
 * EVENTO a vencimiento-pago.calcular.request — best-effort) y la clasifica en un TRAMO segun
 * los dias transcurridos desde el vencimiento hasta la fecha de corte.
 *
 * Invariante (13): dato ausente = desconocido. Sin facturas NO se inventa una antiguedad; una
 * factura sin fecha_vencimiento no se puede clasificar y se declara en `abierto` (no se mete en
 * un tramo a ojo). La suma de los tramos solo se afirma sobre lo CLASIFICABLE.
 *
 * R2 · no aplica: N8 no escribe estado (solo clasifica) → no hay hecho que anunciar. Se SUBE
 * best-effort motor-avisos.producir.request cuando hay pendiente vencido que avisar.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * RPC clasificar es CLASE PREGUNTA → SIN ui_handler.
 * Ver hoja N8 del plan-construccion y diseno-oop.md (CLASE AntiguedadSaldos).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los TRAMOS de antiguedad (dias vencidos). Dato declarable; por defecto el corte clasico 30/60/90.
const TRAMOS_DEFECTO = [
  { nombre: 'corriente', desde: -Infinity, hasta: 0 },
  { nombre: '1_30', desde: 1, hasta: 30 },
  { nombre: '31_60', desde: 31, hasta: 60 },
  { nombre: '61_90', desde: 61, hasta: 90 },
  { nombre: 'mas_90', desde: 91, hasta: Infinity }
];

class AntiguedadSaldos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'antiguedad-de-saldos';
    this.version = 'reflejo-0.1.0';
    // Facturas observadas por proyecto (memoria acotada, no store).
    this._facturas = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'antiguedad-de-saldos.clasificar.response', async (d) => {
      const res = await this._clasificar(d);
      // Reflejo: clasifica; no escribe estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) {
        this.eventBus?.publish('antiguedad-de-saldos.clasificar.failed', res);
      } else if (res.data && res.data.vencido_total > 0) {
        // SUBE (best-effort por EVENTO) el aviso del pendiente vencido a motor-avisos (K2).
        this.eventBus?.publish('motor-avisos.producir.request', {
          project_id: res.data.project_id,
          tipo: 'plazo',
          titulo: 'Saldos vencidos',
          detalle: `pendiente vencido: ${res.data.vencido_total}`,
          severidad: 'aviso',
          origen: 'antiguedad-de-saldos',
          ref: res.data.fecha_corte
        });
      }
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid || !d.asiento) return;
    const lista = this._facturas.get(pid) || [];
    lista.push(d.asiento);
    if (lista.length > 1000) lista.shift();
    this._facturas.set(pid, lista);
  }

  // ══════════════════════════════════════════════════════════════════════
  // _clasificar(input) → { status, data }  ·  reparto por tramos de antiguedad
  // ══════════════════════════════════════════════════════════════════════
  async _clasificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const facturas = await this._facturasDe(input, pid);
    // Sin fecha de corte declarada, se usa hoy (determinista por el reloj del sistema).
    const fecha_corte = this._fecha(input.fecha_corte ?? input.corte ?? input.fecha) || new Date().toISOString().slice(0, 10);

    const tramos = Array.isArray(input.tramos) && input.tramos.length
      ? input.tramos.map((t) => ({ nombre: String(t.nombre), desde: this._num(t.desde), hasta: this._num(t.hasta) }))
      : TRAMOS_DEFECTO.map((t) => ({ ...t }));

    const reparto = new Map(tramos.map((t) => [t.nombre, { tramo: t.nombre, total: 0, pendiente: 0, n: 0, terceros: [] }]));
    const sin_vencimiento = [];
    let pendiente_total = 0;
    let vencido_total = 0;

    for (const f of facturas) {
      const pendiente = this._num(f && (f.pendiente != null ? f.pendiente : (f.importe != null ? f.importe : f.total)));
      if (pendiente === null || pendiente === 0) continue;
      const venc = this._fecha(f && (f.fecha_vencimiento ?? f.vencimiento));
      const tercero = f && (f.tercero != null ? f.tercero : (f.nif != null ? f.nif : null));
      if (!venc) {
        // Sin vencimiento NO se clasifica a ojo: se declara abierto.
        sin_vencimiento.push({ tercero: tercero != null ? String(tercero) : null, pendiente });
        pendiente_total = this._round(pendiente_total + pendiente, 2);
        continue;
      }
      const dias = this._diasEntre(venc, fecha_corte);   // vencido = dias > 0
      const t = tramos.find((x) => dias >= x.desde && dias <= x.hasta) || tramos[tramos.length - 1];
      const r = reparto.get(t.nombre);
      if (r) {
        r.pendiente = this._round(r.pendiente + pendiente, 2);
        r.total = r.pendiente;
        r.n += 1;
        if (tercero != null) r.terceros.push(String(tercero));
      }
      pendiente_total = this._round(pendiente_total + pendiente, 2);
      if (dias > 0) vencido_total = this._round(vencido_total + pendiente, 2);
    }

    const clasificable = [...reparto.values()].filter((r) => r.n > 0);
    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'antiguedad-de-saldos',
        fuente: Array.isArray(input.facturas) ? 'declarado' : 'observado',
        fecha_corte,
        convenio_vencimiento: 'dias = fecha_corte - fecha_vencimiento; > 0 = VENCIDO',
        tramos: reparto.size ? [...reparto.values()] : [],
        tramos_con_saldo: clasificable,
        pendiente_total,
        vencido_total,
        // Lo clasificable es lo unico sobre lo que la suma se afirma.
        clasificable: sin_vencimiento.length === 0 && facturas.length > 0,
        total_facturas: facturas.length,
        abierto: {
          facturas: facturas.length === 0
            ? 'no se recibieron facturas (ni declaradas ni observadas): la antiguedad no se inventa'
            : null,
          sin_vencimiento: sin_vencimiento.length
            ? `${sin_vencimiento.length} factura(s) sin fecha_vencimiento declarada: no se meten en un tramo a ojo`
            : null
        },
        sin_vencimiento: sin_vencimiento.length ? sin_vencimiento : null
      }
    };
  }

  // Trae las facturas: declaradas en el input, o pedidas por EVENTO a vencimiento-pago (N6).
  async _facturasDe(input, pid) {
    if (Array.isArray(input.facturas)) return input.facturas;
    if (Array.isArray(input.saldos)) return input.saldos;
    // SUBE best-effort a vencimiento-pago.calcular.request: si N6 responde con facturas, se usan.
    const resp = await this._rpc('vencimiento-pago.calcular.request', {
      project_id: pid, fecha_corte: input.fecha_corte
    }, { timeout_ms: 800 });
    const d = (resp && (resp.data || resp)) || null;
    if (d && Array.isArray(d.facturas)) return d.facturas;
    // Si N6 no devuelve la lista, se usan las facturas observadas del libro (ventana acotada).
    return this._facturas.get(pid) || [];
  }

  // Dias entre dos fechas ISO (vencimiento -> corte). En UTC para no depender del huso.
  _diasEntre(desdeISO, hastaISO) {
    const [y1, m1, d1] = String(desdeISO).split('-').map(Number);
    const [y2, m2, d2] = String(hastaISO).split('-').map(Number);
    if (!y1 || !y2) return 0;
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.floor((b - a) / 86400000);
  }

  _fecha(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolClasificar(params) { return this._clasificar(params); }
}

module.exports = AntiguedadSaldos;
