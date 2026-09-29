/**
 * contabilidad-analitica/valoracion-existencia — REFLEJO STATELESS (H1, hoja del plan).
 *
 * LA CAPA DE VALOR sobre el inventario EXISTENTE. NO lo duplica: el stock sigue siendo
 * del modulo `inventario` (modulo REAL del repo, REUTILIZADO, no construido aqui); esta
 * pieza solo le pone VALOR encima. `stock:InventarioExistente` · `metodo:ParametroDeclarable`.
 *
 * EL METODO DE VALORACION ES DECLARABLE — PROHIBIDO CABLEARLO. Este reflejo NUNCA decide
 * que se valora "por FIFO" o "por precio medio": eso es un ParametroDeclarable del negocio
 * (o del JEFE, via cola-declaraciones-criterio). Lo que el reflejo SI conoce es la MECANICA
 * generica de agregacion que el propio metodo DECLARA en su campo `base`:
 *   base 'capas'    → suma de capas declaradas (cantidad x coste_unitario de cada capa)
 *   base 'unitario' → suma de existencias declaradas (cantidad x coste_unitario de cada item)
 *   base 'agregado' → suma de valores ya agregados declarados (item.valor)
 * El `nombre` del metodo (el que sea) viaja OPACO: se declara en la respuesta, jamas se
 * interpreta ni se compara contra ningun literal en el codigo. Una `base` no reconocida o
 * ausente → `[ABIERTO]`: no se elige una por defecto.
 *
 * De donde sale el STOCK: se consume `inventario` POR EVENTO (`inventario.stock.request`,
 * best-effort vía _rpc), o llega DECLARADO en la peticion. NUNCA por `require` cruzado.
 * Si ni el evento responde ni hay stock declarado → `[ABIERTO]` con lo que falta.
 *
 * Invariantes:
 *  - DETERMINISTA: mismo stock + mismo metodo declarado → mismo valor (una sola respuesta).
 *  - LEY COMO DATO: cero constantes de metodo en el codigo; el metodo es entrada.
 *  - Dato ausente = desconocido: sin stock, sin metodo o sin base declarada → `valor:null`,
 *    `abierto:true` y `faltan` con las piezas. Nada se estima; ningun valor se rellena con 0.
 *  - NO escribe, NO persiste, NO muta: el stock es de `inventario`.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja H1 del plan-construccion y diseno-oop.md (CLASE ValoracionExistencia).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Mecanicas de agregacion que un metodo DECLARADO puede pedir en su campo `base`.
// NO son metodos de valoracion: son formas de sumar lo declarado. El nombre del metodo
// (FIFO, medio ponderado, o cualquiera) es opaco y vive solo en los datos.
const BASES = ['capas', 'unitario', 'agregado'];

class ValoracionExistencia extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'valoracion-existencia';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onValorarRequest(e) {
    return this._atender(e, 'valorar', 'valoracion-existencia.valorar.response', async (d) => {
      const res = await this._valorar(d);
      if (res.status !== 200) this.eventBus?.publish('valoracion-existencia.valorar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: valorar(item|stock, fecha) → Cuantía ──
  async _valorar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const producto_id = input.producto_id != null ? String(input.producto_id)
      : (input.item && input.item.producto_id != null ? String(input.item.producto_id) : null);
    const fecha = input.fecha != null ? String(input.fecha) : null;

    // 1) El METODO declarado (ParametroDeclarable). Opaque: no se interpreta su nombre.
    const { metodo, base } = this._metodo(input);

    // 2) El STOCK: declarado en la peticion, o PEDIDO a `inventario` POR EVENTO.
    const { existencias, fuente_stock } = await this._stock(pid, producto_id, input);

    // 3) El VALOR solo existe con stock Y con una base de agregacion declarada.
    const faltan = [];
    if (metodo === null) faltan.push('metodo');
    if (base === null) faltan.push('metodo.base');
    if (existencias === null) faltan.push('stock');

    let valor = null;
    let desglose = null;
    let cantidad = null;
    if (faltan.length === 0) {
      const agg = this._agregar(base, existencias);
      valor = agg.total;
      cantidad = agg.cantidad;
      desglose = agg.desglose;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        producto_id,
        fecha,
        // El metodo se DECLARA en la respuesta tal cual llego — jamas se sustituye por uno fijo.
        metodo,
        base,
        fuente_stock,
        cantidad,
        valor,
        desglose,
        // Capa de valor SOBRE el inventario existente: se declara la frontera con quien lo posee.
        stock_propiedad: 'inventario',
        abierto: faltan.length > 0,
        faltan,
        motivo: faltan.length > 0
          ? `no se valora la existencia: falta ${faltan.join(' y ')} (nada se estima)`
          : null
      }
    };
  }

  // El METODO es ParametroDeclarable: entra declarado y se conserva opaco. Su `base` (la
  // mecanica de agregacion) es lo unico que el reflejo lee para saber como sumar.
  _metodo(input = {}) {
    const m = input.metodo != null ? input.metodo
      : (input.criterio && input.criterio.metodo != null ? input.criterio.metodo : null);
    if (m === null || m === undefined || m === '') return { metodo: null, base: null };

    const metodo = typeof m === 'object' ? { ...m } : { nombre: String(m) };
    const baseRaw = metodo.base != null ? String(metodo.base).toLowerCase() : null;
    const base = baseRaw && BASES.includes(baseRaw) ? baseRaw : null;
    return { metodo, base };
  }

  // El STOCK: declarado en la peticion, o consumido de `inventario` POR EVENTO (best-effort).
  async _stock(pid, producto_id, input = {}) {
    // Declarado: capas, existencias o items (cualquiera de las tres formas de la base).
    const declarado = input.capas || input.existencias || input.items || input.stock;
    if (Array.isArray(declarado)) return { existencias: declarado, fuente_stock: 'declarado' };
    if (declarado && typeof declarado === 'object') return { existencias: [declarado], fuente_stock: 'declarado' };

    // Sin stock declarado NO se estima: se pregunta a `inventario` por su puerta (EVENTO).
    if (!producto_id) return { existencias: null, fuente_stock: null };
    const r = await this._rpc('inventario.stock.request',
      { project_id: pid, project_slug: input.project_slug || pid, producto_id }, { timeout_ms: 4000 });
    const data = r && r.data ? r.data : null;
    const bruto = data && (data.capas || data.existencias || data.items || data.stock);
    if (Array.isArray(bruto)) return { existencias: bruto, fuente_stock: 'inventario' };
    if (bruto && typeof bruto === 'object') return { existencias: [bruto], fuente_stock: 'inventario' };
    return { existencias: null, fuente_stock: null };
  }

  // Agregacion PURA segun la base DECLARADA. Sin base reconocida no hay valor (es [ABIERTO]).
  _agregar(base, existencias = []) {
    let total = 0;
    let cantidad = 0;
    const desglose = [];
    for (const it of existencias) {
      if (!it || typeof it !== 'object') continue;
      const cant = this._num(it.cantidad);
      let linea = 0;
      if (base === 'capas' || base === 'unitario') {
        const cu = this._num(it.coste_unitario != null ? it.coste_unitario : it.coste);
        if (cant === null || cu === null) continue; // pieza incompleta: no se inventa su valor
        linea = cant * cu;
        cantidad += cant;
      } else if (base === 'agregado') {
        const v = this._num(it.valor);
        if (v === null) continue;
        linea = v;
        if (cant !== null) cantidad += cant;
      }
      total += linea;
      desglose.push({ producto_id: it.producto_id ?? null, cantidad: cant, valor: this._round(linea, 2) });
    }
    return { total: this._round(total, 2), cantidad: this._round(cantidad, 6), desglose };
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
