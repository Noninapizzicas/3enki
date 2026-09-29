/**
 * contabilidad-analitica/variacion-stock-valorada — REFLEJO STATELESS (H4, hoja del plan).
 *
 * LA VARIACION DE EXISTENCIAS VALORADA de un periodo: la ENTRADA por compra y la SALIDA por
 * consumo, ambas VALORADAS con la capa de valor (valoracion-existencia H1). Determinista.
 *
 * ATRIBUTOS del diseno: `entradas`, `salidas:Flujo<MovimientoStock>` y `valoracion:ValoracionExistencia`.
 *   - Los movimientos pueden llegar DECLARADOS (entradas/salidas en la peticion) o derivarse de
 *     los ACONTECIMIENTOS REALES del inventario, que este modulo ESCUCHA: `inventario.ajustado`
 *     (entrada de proveedor / merma / recuento) y `inventario.reserva.creada` (salida comprometida).
 *     El delta que publica `inventario` ES el movimiento: aqui no se reinterpreta, solo se acumula.
 *   - La VALORACION del movimiento es ParametroDeclarable: valor unitario declarado o traido de
 *     H1 POR EVENTO. Sin valor unitario, la variacion en CANTIDAD se declara igual, pero el FLUJO
 *     VALORADO (entradas/salidas/variancion en valor) queda `[ABIERTO]` — nada se estima.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos movimientos + misma valoracion → misma variacion (una sola respuesta).
 *  - Dato ausente = desconocido: sin movimientos declarados y sin nada recibido por eventos →
 *    `variacion:null` y `abierto:true`. Un flujo vacio NO se interpreta como variacion 0.
 *  - NO escribe, NO persiste: los movimientos son de `inventario`; este modulo solo los acumula
 *    en memoria y responde. Los eventos que escucha van a un buffer por proyecto (memoria viva).
 *
 * Forma: REFLEJO → STATELESS (buffer en memoria, sin PosPersistencia ni onProjectActivated).
 * Ver hoja H4 del plan-construccion y diseno-oop.md (CLASE VariacionStockValorada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class VariacionStockValorada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'variacion-stock-valorada';
    this.version = 'reflejo-0.1.0';
    // Buffer en memoria de los movimientos que llegan por EVENTO (no es persistencia).
    this._movimientos = new Map(); // project_id → [MovimientoStock]
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onVariacionRequest(e) {
    return this._atender(e, 'variacion', 'variacion-stock-valorada.variacion.response', async (d) => {
      const res = await this._variacion(d);
      if (res.status !== 200) this.eventBus?.publish('variacion-stock-valorada.variacion.failed', res);
      return res;
    });
  }

  // ── handlers fire-and-forget: los ACONTECIMIENTOS del inventario (entradas/salidas) ──
  // `inventario.ajustado` → delta real sobre el stock_real: signo = entrada/salida.
  onInventarioAjustado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || d.project_slug;
    if (!pid) return;
    this._acumular(pid, {
      producto_id: d.producto_id ?? null,
      delta: this._num(d.delta),
      motivo: d.motivo || 'ajuste',
      origen: 'inventario.ajustado',
      en: d.timestamp || new Date().toISOString()
    });
  }

  // `inventario.reserva.creada` → salida COMPROMETIDA de stock disponible.
  onInventarioReservaCreada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || d.project_slug;
    if (!pid) return;
    const cant = this._num(d.cantidad);
    this._acumular(pid, {
      producto_id: d.producto_id ?? null,
      // La reserva salida se acumula como movimiento negativo (salida por consumo).
      delta: cant === null ? null : -cant,
      motivo: d.motivo || 'reserva',
      origen: 'inventario.reserva.creada',
      en: d.timestamp || new Date().toISOString()
    });
  }

  _acumular(pid, mov) {
    const lista = this._movimientos.get(pid) || [];
    lista.push(mov);
    if (lista.length > 5000) lista.splice(0, lista.length - 5000); // cota honesta del buffer
    this._movimientos.set(pid, lista);
  }

  // ── proyeccion determinista: variacion(periodo) → Cuantía ──
  async _variacion(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) Los MOVIMIENTOS: declarados en la peticion, o los recibidos POR EVENTO (buffer).
    const declarados = Array.isArray(input.entradas) || Array.isArray(input.salidas)
      || Array.isArray(input.movimientos);
    const movimientos = declarados
      ? this._unificarDeclarados(input)
      : this._delBuffer(pid);
    const fuente_movimientos = declarados ? 'declarado' : (movimientos.length > 0 ? 'inventario' : null);

    if (movimientos.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid, periodo, fuente_movimientos: null,
          entradas_cantidad: null, salidas_cantidad: null, variacion_cantidad: null,
          entradas_valor: null, salidas_valor: null, variacion_valor: null,
          desglose: [],
          abierto: true, faltan: ['movimientos'],
          motivo: 'no hay movimientos declarados ni recibidos por evento: no se deriva variacion (un flujo vacio no es variacion 0)'
        }
      };
    }

    // 2) La VALORACION (ParametroDeclarable): unitaria global o por movimiento.
    const { valor_unitario, fuente_valor } = await this._valoracion(pid, input, movimientos);

    const entradas = movimientos.filter(m => this._num(m.delta) !== null && this._num(m.delta) > 0);
    const salidas = movimientos.filter(m => this._num(m.delta) !== null && this._num(m.delta) < 0);

    const ec = this._round(entradas.reduce((s, m) => s + this._num(m.delta), 0), 6);
    const sc = this._round(salidas.reduce((s, m) => s + this._num(m.delta), 0), 6);

    // La valoracion de cada movimiento es declarada (mov.valor_unitario) o la unitaria global.
    const valorado = valor_unitario !== null || movimientos.some(m => this._num(m.valor_unitario) !== null);
    const ev = valorado ? this._round(this._valorLado(entradas, valor_unitario), 2) : null;
    const sv = valorado ? this._round(this._valorLado(salidas, valor_unitario), 2) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        fuente_movimientos,
        valor_unitario,
        fuente_valor,
        entradas_cantidad: ec,
        salidas_cantidad: sc,
        // La variacion: entrada por compra − salida por consumo. Determinista.
        variacion_cantidad: this._round(ec + sc, 6),
        entradas_valor: ev,
        salidas_valor: sv,
        variacion_valor: (ev !== null && sv !== null) ? this._round(ev + sv, 2) : null,
        desglose: movimientos.map(m => ({
          producto_id: m.producto_id ?? null,
          delta: this._num(m.delta),
          origen: m.origen || null,
          en: m.en || null
        })),
        abierto: !valorado,
        faltan: valorado ? [] : ['valoracion'],
        motivo: valorado ? null : 'la variacion en cantidad se declara, pero el flujo VALORADO queda [ABIERTO]: falta valoracion'
      }
    };
  }

  _unificarDeclarados(input = {}) {
    const out = [];
    const push = (arr, signo, origen) => {
      for (const m of (Array.isArray(arr) ? arr : [])) {
        if (!m || typeof m !== 'object') continue;
        const cant = this._num(m.cantidad != null ? m.cantidad : m.delta);
        out.push({
          producto_id: m.producto_id ?? null,
          delta: cant === null ? null : Math.abs(cant) * signo,
          valor_unitario: this._num(m.valor_unitario != null ? m.valor_unitario : m.coste_unitario),
          motivo: m.motivo ?? null,
          origen,
          en: m.fecha ?? m.en ?? null
        });
      }
    };
    push(input.movimientos, 1, 'declarado'); // los movimientos ya traen su signo en delta
    push(input.entradas, 1, 'compra');
    push(input.salidas, -1, 'consumo');
    return out;
  }

  _delBuffer(pid) {
    return (this._movimientos.get(pid) || []).map(m => ({ ...m }));
  }

  // La valoracion: unitaria declarada, o POR MOVIMIENTO (viene con cada movimiento).
  async _valoracion(pid, input = {}, movimientos = []) {
    const u = this._num(input.valor_unitario != null ? input.valor_unitario : input.coste_unitario);
    if (u !== null) return { valor_unitario: u, fuente_valor: 'declarado' };
    if (movimientos.some(m => this._num(m.valor_unitario) !== null)) {
      return { valor_unitario: null, fuente_valor: 'movimiento' };
    }
    // Si el movimiento de inventario trajo su producto pero no su valor, se PIDE a H1 por EVENTO
    // solo cuando hay un unico producto en el flujo (ambiguo con varios: no se estima).
    const productos = [...new Set(movimientos.map(m => m.producto_id).filter(v => v != null))];
    if (productos.length !== 1) return { valor_unitario: null, fuente_valor: null };
    const r = await this._rpc('valoracion-existencia.valorar.request',
      { project_id: pid, producto_id: productos[0], fecha: input.hasta || input.fecha, metodo: input.metodo },
      { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const total = data ? this._num(data.valor) : null;
    const cant = data ? this._num(data.cantidad) : null;
    if (total !== null && cant !== null && cant > 0) {
      return { valor_unitario: this._round(total / cant, 6), fuente_valor: 'valoracion-existencia' };
    }
    return { valor_unitario: null, fuente_valor: null };
  }

  _valorLado(movs, unitarioGlobal) {
    let total = 0;
    for (const m of movs) {
      const u = this._num(m.valor_unitario);
      const d = this._num(m.delta);
      if (d === null) continue;
      const pu = u !== null ? u : unitarioGlobal;
      if (pu === null) continue;
      total += d * pu;
    }
    return total;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolVariacion(params) { return this._variacion(params); }
}

module.exports = VariacionStockValorada;
