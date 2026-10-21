/**
 * contabilidad-analitica/variacion-stock-valorada — REFLEJO STATELESS (H4, hoja del plan).
 *
 * Entrada por COMPRA / salida por CONSUMO, VALORADAS. Determinista: mismas existencias +
 * mismo metodo → misma variacion.
 *
 * La hoja NO duplica el inventario (eso es de `inventario`, infra reutilizada) ni el valor
 * (eso es de `valoracion-existencia` H1, al que SUBE por EVENTO). Aqui solo se DERIVA la
 * variacion valorada del movimiento y se acumula su derivado en memoria.
 *
 * Invariantes:
 *  - Dato ausente = desconocido: sin cantidad o sin valor unitario NO se estima la variacion;
 *    queda `valor:null` y se declara ABIERTO.
 *  - Entrada suma, salida resta: la polaridad la decide el tipo declarado, no una constante oculta.
 *  - ESCUCHA `contabilidad.hecho_recibido` (A1 puerto-evento-vertical) y deriva la variacion del
 *    hecho; NO escribe el diario (lo hace escritor-diario B2) — solo sube el asiento si el hecho YA lo declara.
 *  - NO escribe, NO persiste: su acumulado es un DERIVADO en memoria.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja H4 del plan-construccion y diseno-oop.md (CLASE VariacionStockValorada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class VariacionStockValorada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'variacion-stock-valorada';
    this.version = 'reflejo-0.1.0';
    // Derivado en memoria: project_id -> [variaciones]
    this._variaciones = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onVariacionRequest(e) {
    return this._atender(e, 'variacion', 'variacion-stock-valorada.variacion.response', async (d) => {
      const res = await this._variacion(d);
      // Reflejo: deriva y declara; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('variacion-stock-valorada.variacion.failed', res);
      else this._encolar(res, d);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego un hecho de la operacion (A1) ──
  async onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      if (!pid) return;
      const hecho = d.hecho && typeof d.hecho === 'object' ? d.hecho : null;
      if (!hecho) return;
      const res = await this._variacion({ project_id: pid, hecho, correlation_id: d.correlation_id });
      if (res.status === 200 && res.data && res.data.variacion) this._acumular(pid, res.data.variacion);
      // No responde (no es RPC). Solo sube el asiento si el hecho YA lo declara (no se inventa).
      if (hecho.asiento) {
        this.eventBus?.publish('escritor-diario.asentar.request', {
          project_id: pid, asiento: hecho.asiento, origen: 'variacion-stock-valorada', correlation_id: d.correlation_id
        });
      }
    } catch (err) {
      this.logger?.error(`${this.name}.hecho_recibido.error`, { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // variacion(movimiento) → variacion valorada (entrada/salida)
  // ══════════════════════════════════════════════════════════════════════
  async _variacion(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const movimiento = input.movimiento && typeof input.movimiento === 'object' ? input.movimiento
      : (input.hecho && typeof input.hecho === 'object' ? input.hecho : null);
    if (!movimiento) return this._invalid('movimiento');

    const tipo = this._tipo(input, movimiento);   // 'entrada' | 'salida'
    const cantidad = this._num(input.cantidad != null ? input.cantidad : movimiento.cantidad);
    if (cantidad == null) {
      return this._abierto(pid, tipo, movimiento, null, 'el movimiento no declara cantidad: no se estima la variacion');
    }

    // El valor unitario puede venir declarado o se pide a valoracion-existencia (H1) por EVENTO.
    let valorUnitario = this._num(input.valor_unitario != null ? input.valor_unitario : movimiento.valor_unitario != null ? movimiento.valor_unitario : movimiento.coste);
    let fuente = valorUnitario != null ? 'declarado' : null;

    if (valorUnitario == null) {
      const resp = await this._rpc('valoracion-existencia.valorar.request', {
        project_id: pid,
        existencias: input.existencias || movimiento.existencias || [{ articulo: movimiento.articulo, cantidad: 1, coste: movimiento.coste }],
        metodo: input.metodo
      }, { timeout_ms: 3000 });
      const v = resp && resp.data ? resp.data : null;
      if (v && typeof v.valor_unitario === 'number') { valorUnitario = v.valor_unitario; fuente = 'valoracion-existencia'; }
      else if (v && Array.isArray(v.lineas) && v.lineas[0] && typeof v.lineas[0].valor === 'number' && v.lineas[0].cantidad) {
        valorUnitario = this._round(v.lineas[0].valor / v.lineas[0].cantidad, 4); fuente = 'valoracion-existencia';
      }
    }

    if (valorUnitario == null) {
      return this._abierto(pid, tipo, movimiento, cantidad, 'no hay valor unitario (ni declarado ni de valoracion-existencia): la variacion queda sin valorar');
    }

    const signo = tipo === 'salida' ? -1 : 1;
    const valor = this._round(signo * cantidad * valorUnitario, 2);
    const variacion = {
      articulo: movimiento.articulo != null ? String(movimiento.articulo) : null,
      tipo,
      cantidad,
      valor_unitario: valorUnitario,
      valor,
      signo,
      fuente_valor: fuente,
      periodo: movimiento.periodo != null ? String(movimiento.periodo) : null,
      en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        variacion,
        valorada: true,
        determinista: true,
        abierto: {
          articulo: variacion.articulo ? null : 'el movimiento no declara articulo'
        }
      }
    };
  }

  _abierto(pid, tipo, movimiento, cantidad, motivo) {
    return {
      status: 200,
      data: {
        project_id: pid,
        variacion: null,
        tipo,
        cantidad,
        valorada: false,
        determinista: true,
        abierto: { valor: motivo, articulo: movimiento && movimiento.articulo == null ? 'el movimiento no declara articulo' : null }
      }
    };
  }

  _encolar(res, d) {
    // Acumula el derivado y sube el asiento SOLO si el origen ya lo declara (no se inventa).
    if (res.data && res.data.variacion) this._acumular(res.data.project_id, res.data.variacion);
    const mov = (d && (d.movimiento || d.hecho)) || null;
    if (mov && mov.asiento) {
      this.eventBus?.publish('escritor-diario.asentar.request', {
        project_id: res.data.project_id, asiento: mov.asiento, origen: 'variacion-stock-valorada', correlation_id: d.correlation_id
      });
    }
  }

  _acumular(pid, variacion) {
    let arr = this._variaciones.get(pid);
    if (!arr) { arr = []; this._variaciones.set(pid, arr); }
    arr.push(variacion);
  }

  _tipo(input, movimiento) {
    const raw = input.tipo != null ? input.tipo : movimiento.tipo;
    return String(raw || '').toLowerCase().trim() === 'salida' ? 'salida' : 'entrada';
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolVariacion(params) { return this._variacion(params); }
}

module.exports = VariacionStockValorada;
