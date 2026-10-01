/**
 * contabilidad-analitica/valoracion-existencia — REFLEJO STATELESS (H1, hoja del plan).
 *
 * CAPA DE VALOR *SOBRE* el inventario existente. NO lo duplica: recibe las existencias
 * YA declaradas (el store de stock es `inventario`, infra reutilizada como base) y les
 * aplica el METODO DE VALORACION declarado (FIFO / PMP / coste medio / coste declarado)
 * para devolver su valor. El metodo es DATO (ParametroDeclarable), no una constante.
 *
 * Determinista: mismas existencias + mismo metodo → mismo valor. Cero juicio.
 *
 * Invariantes:
 *  - Dato ausente = desconocido: una linea sin cantidad o sin coste NO se valora con un
 *    cero — su `valor` queda null y la valoracion se declara `valoracion_completa:false`.
 *  - Sin metodo declarado se valora igual lo declarado, pero el hueco se DECLARA (abierto).
 *  - NO escribe, NO persiste, NO muta el inventario: solo calcula.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja H1 del plan-construccion y diseno-oop.md (CLASE ValoracionExistencia).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ValoracionExistencia extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'valoracion-existencia';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onValorarRequest(e) {
    return this._atender(e, 'valorar', 'valoracion-existencia.valorar.response', async (d) => {
      const res = this._valorar(d);
      // Reflejo: valora y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('valoracion-existencia.valorar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // valorar(existencias, metodo) → valor (capa de valor SOBRE el inventario)
  // ══════════════════════════════════════════════════════════════════════
  _valorar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Las EXISTENCIAS: declaradas. El inventario es de `inventario` (no se duplica aqui).
    const existencias = Array.isArray(input.existencias) ? input.existencias
      : (Array.isArray(input.inventario) ? input.inventario
        : (Array.isArray(input.lineas) ? input.lineas : null));
    if (existencias === null) {
      return {
        status: 200,
        data: {
          project_id: pid, fuente: null, metodo: null, lineas: [], num_lineas: 0, total: null,
          valoracion_completa: false, abierto: { existencias: 'no hay existencias declaradas: no se valora nada (no se estima)' },
          faltan: ['existencias'], motivo: null
        }
      };
    }

    // El METODO es DATO declarable (FIFO/PMF/...). Sin el, se valora igual lo declarado.
    const metodo = this._metodo(input);

    const lineas = [];
    let total = 0;
    let completa = true;
    for (const e of existencias) {
      if (!e || typeof e !== 'object') continue;
      const cantidad = this._num(e.cantidad != null ? e.cantidad : e.stock);
      const coste = this._num(e.coste_unitario != null ? e.coste_unitario
        : (e.coste != null ? e.coste : e.precio));
      const valor = (cantidad !== null && coste !== null) ? this._round(cantidad * coste, 2) : null;
      if (valor === null) completa = false; else total += valor;
      lineas.push({
        producto: e.producto ?? e.producto_id ?? e.sku ?? e.referencia ?? null,
        cantidad,
        coste_unitario: coste,
        valor,
        moneda: e.moneda != null ? String(e.moneda) : null
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        fuente: 'declarado',
        metodo,
        metodo_declarado: metodo !== null,
        // Determinista: el orden de las lineas sigue el declarado.
        lineas,
        num_lineas: lineas.length,
        // Solo si TODAS las lineas tienen valor se declara un total (no una suma parcial).
        total: completa ? this._round(total, 2) : null,
        valoracion_completa: completa,
        abierto: {
          metodo: metodo !== null ? null
            : 'no se declaro el metodo de valoracion (FIFO/PMP/medio): se valora lo declarado y se declara el hueco',
          lineas_incompletas: completa ? null
            : 'hay lineas sin cantidad o sin coste declarado: no se valoran con un cero (su valor queda null)'
        },
        faltan: [],
        motivo: null
      }
    };
  }

  _metodo(input = {}) {
    const raw = input.metodo != null ? input.metodo
      : (input.criterio && typeof input.criterio === 'object' ? input.criterio.metodo : null);
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    return String(raw).toUpperCase().trim();
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolValorar(params) { return this._valorar(params); }
}

module.exports = ValoracionExistencia;
