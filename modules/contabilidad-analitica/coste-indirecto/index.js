/**
 * contabilidad-analitica/coste-indirecto — REFLEJO STATELESS (J5, hoja del plan).
 *
 * Aplica el REPARTO DECLARADO de los gastos NO directos (los que no se pueden imputar a un solo
 * destino). Cubre, para grupo, lo que la pieza existente no cubre.
 *
 * EL CERROJO: no se reparte con un criterio inventado. El reparto (base + porcentajes por destino)
 * se DECLARA (atributo `reparto`); si no viene declarado, se SUBE por EVENTO a
 * cola-declaraciones-criterio.fijar.request (best-effort, el jefe lo fija) y el resultado queda
 * `imputado:0` con `abierto` — NO se usa un 50/50 por defecto (dato ausente = desconocido).
 *
 * Determinista: mismo importe + mismo reparto declarado → misma imputacion por destino.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (repartir) → sin ui_handler.
 * Ver hoja J5 del plan-construccion y diseno-oop.md (CLASE CosteIndirecto).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CosteIndirecto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'coste-indirecto';
    this.version = 'reflejo-0.1.0';
    this._criterios = new Map();   // project_id -> Map<clave, valor declarado>
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea). CLASE PREGUNTA → sin ui_handler ──
  onRepartirRequest(e) {
    return this._atender(e, 'repartir', 'coste-indirecto.repartir.response', async (d) => {
      const res = await this._repartir(d);
      if (res.status !== 200) this.eventBus?.publish('coste-indirecto.repartir.failed', res);
      return res;
    });
  }

  // ── handler de dominio: el libro cambio → se observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  // ── handler de dominio: K9 fijo un criterio → se registra (p.ej. el reparto) ──
  onCriterioFijado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const clave = d.clave != null ? String(d.clave) : (d.criterio && d.criterio.clave ? String(d.criterio.clave) : null);
    if (!pid || !clave) return;
    let m = this._criterios.get(pid);
    if (!m) { m = new Map(); this._criterios.set(pid, m); }
    m.set(clave, (d.criterio && d.criterio.valor) != null ? d.criterio.valor : d.valor);
  }

  // ══════════════════════════════════════════════════════════════════════
  // repartir(importe, reparto) → { imputaciones por destino }
  // ══════════════════════════════════════════════════════════════════════
  async _repartir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const importe = this._num(input.importe != null ? input.importe : input.gasto);
    if (input.importe === undefined && input.gasto === undefined) return this._invalid('importe');

    const reparto = this._repartoDe(input, pid);

    // SIN REPARTO DECLARADO: no se inventa. Se sube el hueco a la cola (best-effort) y se declara.
    if (!reparto) {
      await this._subirHueco(pid, input);
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'coste-indirecto',
          importe,
          reparto: null,
          imputaciones: [],
          imputado: 0,
          repartido: false,
          determinista: true,
          abierto: {
            reparto: 'no hay reparto declarado: NO se usa un criterio por defecto. Se subio el hueco a cola-declaraciones-criterio y queda ABIERTO hasta que el jefe lo declare'
          }
        }
      };
    }

    const destinos = this._destinos(reparto);
    const suma_base = destinos.reduce((t, d) => t + this._num(d.base != null ? d.base : d.peso), 0);
    if (destinos.length === 0 || suma_base === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'coste-indirecto',
          importe,
          reparto,
          imputaciones: [],
          imputado: 0,
          repartido: false,
          determinista: true,
          abierto: { reparto: 'el reparto declarado no trae destinos con base/peso > 0: no se reparte' }
        }
      };
    }

    // Reparto determinista proporcional a la base declarada (redondeo con resto al mayor).
    const imputaciones = destinos.map((d) => ({
      destino: d.destino,
      base: this._num(d.base != null ? d.base : d.peso),
      importe: this._round(importe * (this._num(d.base != null ? d.base : d.peso) / suma_base), 2)
    }));
    this._cuadrarResto(imputaciones, importe);

    const imputado = this._round(imputaciones.reduce((t, i) => t + i.importe, 0), 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'coste-indirecto',
        importe,
        reparto,
        imputaciones,
        imputado,
        repartido: true,
        determinista: true,
        abierto: { reparto: null }
      }
    };
  }

  _repartoDe(input, pid) {
    if (input.reparto && typeof input.reparto === 'object') return input.reparto;
    const m = this._criterios.get(pid);
    if (m && m.has('reparto')) return m.get('reparto');
    if (m && m.has('reparto_costes_indirectos')) return m.get('reparto_costes_indirectos');
    return null;
  }

  _destinos(reparto) {
    const raw = Array.isArray(reparto) ? reparto
      : (Array.isArray(reparto.destinos) ? reparto.destinos
      : (reparto.destino != null ? [reparto] : []));
    return raw.filter((d) => d && typeof d === 'object' && d.destino != null);
  }

  // El redondeo puede dejar centimos fuera: el resto va al destino de mayor importe (determinista).
  _cuadrarResto(imputaciones, importe) {
    const suma = this._round(imputaciones.reduce((t, i) => t + i.importe, 0), 2);
    const dif = this._round(importe - suma, 2);
    if (dif !== 0 && imputaciones.length) {
      let idx = 0;
      for (let i = 1; i < imputaciones.length; i++) if (imputaciones[i].importe > imputaciones[idx].importe) idx = i;
      imputaciones[idx].importe = this._round(imputaciones[idx].importe + dif, 2);
    }
  }

  // Sube (best-effort) el hueco del criterio para que el jefe lo declare.
  async _subirHueco(pid, input) {
    try {
      await this._rpc('cola-declaraciones-criterio.fijar.request', {
        project_id: pid, rol: 'JEFE_CRITERIO', clave: 'reparto', valor: null,
        nota: 'coste-indirecto necesita el reparto declarado', correlation_id: input.correlation_id
      }, { timeout_ms: 800 });
    } catch (_) { /* best-effort: el reflejo no cuelga */ }
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolRepartir(params) { return this._repartir(params); }
}

module.exports = CosteIndirecto;
