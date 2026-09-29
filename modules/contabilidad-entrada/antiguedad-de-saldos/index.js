/**
 * contabilidad-entrada/antiguedad-de-saldos — REFLEJO STATELESS (N8, hoja del plan).
 *
 * **LO PENDIENTE CLASIFICADO POR VENCIMIENTO: QUIEN Y CUANTO ESTA VENCIDO. (Aging.)**
 *
 * Determinista: toma los vencimientos (el tipo `Vencimiento` con dos lados, N6) y clasifica lo
 * pendiente en tramos de antiguedad. Es el espejo de `vencimiento-pago` (N6) del lado del cobro
 * — aqui no se calcula la fecha de vencimiento (eso es N6), se CLASIFICA lo que ya vence.
 *
 * 🔴 **LOS TRAMOS SON DECLARABLES.** En este fichero NO hay ningun 30, 60 ni 90 escrito: los
 * tramos los DECLARA el negocio (`tramos:[30,60,90]` o `tramos:[{desde,hasta,etiqueta}]`). Si no
 * los declara, NO se clasifica por tramos: se declara `clasificado:false`, `tabla:[]` y
 * `abierto:['tramos']` — el sistema NO inventa los tramos del negocio.
 *
 * 🔴 **SIN `hoy` DECLARADO NO SE SABE QUE ESTA VENCIDO.** La antiguedad se mide contra una fecha
 * de referencia DECLARADA: sin ella, `dias_vencido:null`, `vencido:null` y se declara `[ABIERTO]`.
 * Nada se estima (ni se usa "hoy" por sorpresa como si fuera un dato del negocio).
 *
 * ATRIBUTOS del diseno: `vencimientos:Set<Vencimiento>`.
 * METODOS: `clasificar():Tabla`.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos vencimientos + mismos tramos + misma fecha de referencia → misma tabla.
 *  - Dato ausente = desconocido: un vencimiento sin fecha no se coloca en ningun tramo (va a
 *    `sin_clasificar`); un vencimiento sin importe tampoco (va a `sin_importe`). Nada se estima.
 *  - NO escribe, NO persiste, NO muta y NO decide: la tabla es un DERIVADO; reclamar es del negocio.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja N8 del plan-construccion y diseno-oop.md (CLASE AntiguedadSaldos).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AntiguedadSaldos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'antiguedad-de-saldos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'antiguedad-de-saldos.clasificar.response', async (d) => {
      const res = await this._clasificar(d);
      if (res.status !== 200) this.eventBus?.publish('antiguedad-de-saldos.clasificar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // clasificar() → Tabla (lo pendiente clasificado por antiguedad, quien y cuanto)
  // ══════════════════════════════════════════════════════════════════════
  async _clasificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La FECHA DE REFERENCIA (`hoy`): DECLARADA. Sin ella no se sabe que esta vencido ([ABIERTO]).
    const hoy = this._fecha(input.hoy !== undefined ? input.hoy
      : (input.fecha_referencia !== undefined ? input.fecha_referencia : null));
    const hoy_declarado = input.hoy !== undefined || input.fecha_referencia !== undefined;

    // Los VENCIMIENTOS: declarados, o calculados por vencimiento-pago (N6) POR EVENTO.
    const fuente = await this._vencimientos(pid, input);

    // Los TRAMOS de antiguedad: DECLARABLES. Sin tramos no se clasifica (no se inventan 30/60/90).
    const tramos = this._tramos(input);

    const items = fuente.items;
    const conFecha = [];
    const sinFecha = [];
    const sinImporte = [];
    let orden = 0;
    for (const v of items) {
      orden += 1;
      const fecha = this._fecha(v && (v.fecha_vencimiento !== undefined ? v.fecha_vencimiento : v.fecha));
      const pendiente = this._num(v && (v.pendiente !== undefined ? v.pendiente
        : (v.importe !== undefined ? v.importe : (v.total !== undefined ? v.total : null))));
      if (pendiente === null) { sinImporte.push({ ...v, motivo: 'el vencimiento no declara importe/pendiente: no se lee como 0 (nada se estima)' }); continue; }
      if (!fecha) { sinFecha.push({ ...v, motivo: 'el vencimiento no declara fecha: no se coloca en ningun tramo' }); continue; }
      // Los dias vencidos SOLO si hay fecha de referencia declarada.
      const dias_vencido = hoy ? this._diffDias(fecha, hoy) : null;
      conFecha.push({
        clave: v.clave_natural !== undefined ? v.clave_natural : (v.clave !== undefined ? v.clave : null),
        tercero: v.tercero !== undefined ? v.tercero : (v.nif !== undefined ? v.nif : null),
        lado: v.lado !== undefined ? v.lado : null,
        fecha_vencimiento: fecha,
        pendiente: this._round(Math.abs(pendiente), 2),
        dias_vencido,
        vencido: dias_vencido === null ? null : dias_vencido > 0,
        _orden: orden,
        vencimiento: v
      });
    }

    // 1 · La TABLA por tramos declarados (solo lo VENCIDO entra en tramos; el no vencido se agrega aparte).
    const tabla = [];
    const fuera_de_tramos = [];
    if (tramos) {
      for (const t of tramos) tabla.push({ tramo: t, num: 0, total_pendiente: 0, terceros: new Set() });
      for (const it of conFecha) {
        if (it.dias_vencido === null || it.dias_vencido <= 0) continue;    // no vencido: fuera de los tramos de vencido
        const t = tramos.find((x) => (x.desde === null || it.dias_vencido >= x.desde) && (x.hasta === null || it.dias_vencido <= x.hasta));
        if (!t) { fuera_de_tramos.push({ ...it, motivo: 'el vencimiento esta vencido pero no cae en ningun tramo declarado' }); continue; }
        const fila = tabla.find((f) => f.tramo === t);
        fila.num += 1;
        fila.total_pendiente = this._round(fila.total_pendiente + it.pendiente, 2);
        if (it.tercero !== null && it.tercero !== undefined) fila.terceros.add(String(it.tercero));
      }
    }

    const vencidos = conFecha.filter((x) => x.vencido === true);
    const noVencidos = conFecha.filter((x) => x.vencido === false);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'antiguedad-de-saldos',
        lado: input.lado != null ? String(input.lado) : null,
        // La fecha de referencia DECLARADA de la antiguedad (o null: [ABIERTO], no se estima).
        hoy,
        hoy_declarado,
        // 🔴 La tabla por tramos DECLARADOS. Sin tramos declarados no hay tabla (no se inventan).
        clasificado: Boolean(tramos) && hoy !== null,
        tabla: tabla.map((f) => ({
          desde: f.tramo.desde, hasta: f.tramo.hasta, etiqueta: f.tramo.etiqueta,
          num: f.num, total_pendiente: f.total_pendiente, terceros: [...f.terceros]
        })),
        tramos_declarados: tramos ? tramos.map((t) => ({ desde: t.desde, hasta: t.hasta, etiqueta: t.etiqueta })) : null,
        // QUIEN y CUANTO: los vencidos, ordenados de mas antiguo a mas reciente (determinista).
        vencidos: vencidos.slice().sort((a, b) => (b.dias_vencido - a.dias_vencido) || (a._orden - b._orden))
          .map((x) => ({ clave: x.clave, tercero: x.tercero, lado: x.lado, fecha_vencimiento: x.fecha_vencimiento, pendiente: x.pendiente, dias_vencido: x.dias_vencido })),
        num_vencidos: vencidos.length,
        total_vencido: vencidos.length > 0 || fuente.disponible
          ? this._round(vencidos.reduce((s, x) => s + x.pendiente, 0), 2) : null,
        total_no_vencido: this._round(noVencidos.reduce((s, x) => s + x.pendiente, 0), 2),
        total_pendiente: this._round(conFecha.reduce((s, x) => s + x.pendiente, 0), 2),
        // Lo que NO se pudo clasificar se declara aparte: nada se coloca a la fuerza en un tramo.
        fuera_de_tramos,
        sin_fecha: sinFecha,
        sin_importe: sinImporte,
        fuente_vencimientos: fuente.fuente,
        deriva_de: ['vencimiento-pago (N6)', 'escritor-diario (B2)'],
        // Alimenta la reclamacion del cobro y la politica declarada (E6): lo LEEN, no lo recalculan.
        alimenta: ['reclamacion', 'politica-cobro-pago (E6)'],
        decide: 'el negocio reclamar (la tabla es un DERIVADO)',
        abierto: {
          // 🔴 Sin tramos declarados no hay clasificacion: el sistema no inventa 30/60/90.
          tramos: tramos ? null : 'no se declararon tramos de antiguedad: no se clasifica (el sistema NO inventa los tramos del negocio)',
          hoy: hoy !== null ? null : (hoy_declarado
            ? 'la fecha de referencia declarada no es una fecha valida: no se sabe que esta vencido'
            : 'no se declaro fecha de referencia (`hoy`): no se sabe que esta vencido (nada se estima)'),
          vencimientos: fuente.disponible ? null : 'no hay vencimientos declarados y vencimiento-pago (N6)/escritor-diario (B2) no respondieron: no hay saldo que clasificar',
          sin_fecha: sinFecha.length > 0 ? `hay ${sinFecha.length} vencimiento(s) sin fecha: no se colocan en ningun tramo` : null,
          sin_importe: sinImporte.length > 0 ? `hay ${sinImporte.length} vencimiento(s) sin importe: no se leen como 0` : null
        }
      }
    };
  }

  // Los VENCIMIENTOS: declarados, o pedidos a vencimiento-pago (N6) POR EVENTO (best-effort),
  // o leidos del diario (B2) POR EVENTO si llegan facturas sin politica.
  async _vencimientos(pid, input) {
    if (Array.isArray(input.vencimientos)) {
      return { items: input.vencimientos, fuente: 'declarados', disponible: true };
    }
    if (Array.isArray(input.facturas)) {
      const out = [];
      for (const f of input.facturas) {
        const r = await this._rpc('vencimiento-pago.calcular.request', {
          project_id: pid, factura: f, lado: input.lado ?? null, politica: input.politica ?? null,
          base: input.base ?? null, hoy: input.hoy ?? null
        }, { timeout_ms: 4000 });
        const v = r && r.data && r.data.vencimiento ? r.data.vencimiento : null;
        if (v) out.push(v);
      }
      return { items: out, fuente: out.length > 0 ? 'vencimiento-pago' : null, disponible: out.length > 0 };
    }
    // Sin nada declarado: se pide al diario el material crudo (B2) POR EVENTO, sin asumir fechas.
    const r = await this._rpc('escritor-diario.asientos.request',
      { project_id: pid, periodo: input.periodo ?? null }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    if (data && Array.isArray(data.asientos)) {
      const items = data.asientos.filter((a) => a && a.fecha_vencimiento != null);
      return { items, fuente: items.length > 0 ? 'escritor-diario' : null, disponible: items.length > 0 };
    }
    return { items: [], fuente: null, disponible: false };
  }

  // Los TRAMOS: DECLARABLES. `[30,60,90]` (limites) o `[{desde,hasta,etiqueta}]`. Sin declarar → null.
  _tramos(input) {
    const raw = input.tramos !== undefined ? input.tramos
      : (input.antiguedad_tramos !== undefined ? input.antiguedad_tramos
        : (input.tramos_antiguedad !== undefined ? input.tramos_antiguedad : null));
    if (raw === null || raw === undefined) return null;
    const lista = Array.isArray(raw) ? raw : [raw];
    if (lista.length === 0) return null;

    const out = [];
    if (lista.every((x) => this._num(x) !== null && typeof x !== 'object')) {
      // Limites declarados: se construyen los tramos CONSECUTIVOS a partir de los cortes declarados.
      const cortes = lista.map((x) => Math.floor(this._num(x))).sort((a, b) => a - b);
      let desde = 1;
      for (const corte of cortes) {
        out.push({ desde, hasta: corte, etiqueta: `${desde}-${corte}` });
        desde = corte + 1;
      }
      out.push({ desde, hasta: null, etiqueta: `>${cortes[cortes.length - 1]}` });
      return out;
    }

    for (const t of lista) {
      if (t === null || t === undefined) continue;
      if (typeof t !== 'object') continue;
      const desde = t.desde !== undefined ? this._num(t.desde) : null;
      const hasta = t.hasta !== undefined ? this._num(t.hasta) : null;
      // Un tramo sin ningun limite no clasifica nada: no se admite (no se asume rango).
      if (desde === null && hasta === null) continue;
      out.push({
        desde: desde === null ? null : Math.floor(desde),
        hasta: hasta === null ? null : Math.floor(hasta),
        // La ETIQUETA la declara el negocio; si no, se compone de sus limites (nunca se cablea).
        etiqueta: t.etiqueta != null ? String(t.etiqueta) : `${desde === null ? '' : desde}-${hasta === null ? '' : hasta}`
      });
    }
    return out.length > 0 ? out : null;
  }

  _fecha(v) {
    if (v === undefined || v === null || v === '') return null;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }

  _diffDias(desde_iso, hasta_iso) {
    const a = Date.parse(desde_iso), b = Date.parse(hasta_iso);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolClasificar(params) { return this._clasificar(params); }
}

module.exports = AntiguedadSaldos;
