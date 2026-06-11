/**
 * escandallo — REFLEJO JS (mitad determinista del módulo híbrido). Segundo caso
 * del Patrón Módulo Híbrido. El blueprint sirve lo FUZZY (calcular con Mercadona
 * via _precio_de_mercadona); este reflejo sirve el COSTEO determinista (_costear
 * es aritmética pura) en el bus, sin turno LLM. Lee datos via el reflejo de
 * recetas (JS↔JS, ms); persiste publicando escandallo.coste.calculado, que el
 * reflejo de recetas aplica al store. El bucle de costeo: sin LLM.
 *
 * Extiende ModuloHibridoReflejo (la base con toda la fontanería): aquí solo van
 * los handlers de una línea + la lógica de costeo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const ORDEN_TIPO = { masa: 0, salsa: 0, base: 0, pizza: 1 };

class EscandalloReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escandallo';
    this.version = 'reflejo-1.1.0';
  }

  // ── handlers RPC (una línea) ──
  onRecalcularSiguienteRequest(e) {
    return this._atender(e, 'recalcular_siguiente', 'escandallo.recalcular_siguiente.response', d => this._recalcularSiguiente(d));
  }
  onCostearRequest(e) {
    return this._atender(e, 'costear', 'escandallo.costear.response', d => this._costearReceta(d));
  }

  // ── ops deterministas ──

  async _recalcularSiguiente(input) {
    if (!input.project_id) return this._invalid('project_id');
    const soloPendientes = input.solo_pendientes !== false;

    const catalogo = await this._cargarCatalogo(input);
    let recetas = (await this._cargarRecetas(input, input.estado || 'en_servicio'))
      .filter(r => r && Array.isArray(r.lineas) && r.lineas.length > 0);

    for (const r of recetas) {
      if (typeof r.coste_unidad === 'number' && r.coste_unidad > 0) {
        catalogo.porId[r.id] = { id: r.id, nombre: r.nombre, precio: r.coste_unidad, compra_unidad: 'ud', fuente: 'sub_receta' };
      }
    }

    let pend = recetas.filter(r => soloPendientes ? !(typeof r.coste_unidad === 'number' && r.coste_unidad > 0) : true);
    pend = pend.sort((a, b) => (ORDEN_TIPO[a.tipo] != null ? ORDEN_TIPO[a.tipo] : 1) - (ORDEN_TIPO[b.tipo] != null ? ORDEN_TIPO[b.tipo] : 1));

    if (pend.length === 0) {
      return { status: 200, data: { terminado: true, faltan: 0, costeada: null, siguiente: 'completo' } };
    }

    const receta = pend[0];
    const r = await this._costear(input, receta, catalogo, []);
    this._persistir(input, receta, r);

    const faltan = pend.length - 1;
    return {
      status: 200,
      data: {
        costeada: { receta_id: receta.id, nombre: receta.nombre, coste_unidad: r.coste_unidad, lineas_sin_precio: r.sin_precio.length },
        faltan, terminado: faltan === 0,
        siguiente: faltan > 0 ? 'vuelve a llamar recalcular_siguiente para la proxima' : 'completo'
      }
    };
  }

  async _costearReceta(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.receta_id && !(Array.isArray(input.lineas) && input.lineas.length > 0 && input.rinde && input.rinde.cantidad > 0)) {
      return this._invalid('receta_id | {lineas, rinde}');
    }
    const catalogo = await this._cargarCatalogo(input);
    const receta = input.receta_id
      ? await this._cargarReceta(input, input.receta_id)
      : { id: null, lineas: input.lineas, rinde: input.rinde };
    if (!receta) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'receta no encontrada', { entity_type: 'recipe', id: input.receta_id });

    const r = await this._costear(input, receta, catalogo, []);
    if ((input.persistir !== undefined ? input.persistir : !!input.receta_id) && input.receta_id) {
      this._persistir(input, receta, r);
    }
    return {
      status: 200,
      data: {
        coste_total: r.coste_total, coste_unidad: r.coste_unidad, rinde: receta.rinde,
        lineas_detalle: r.desglose, lineas_sin_precio: r.sin_precio, fuentes_precios: r.fuentes
      }
    };
  }

  // ── núcleo determinista _costear (réplica fiel del pseudocódigo) ──

  async _costear(input, receta, catalogo, cadena = []) {
    if (receta.id && cadena.includes(receta.id)) {
      return { coste_total: null, coste_unidad: null, desglose: [], fuentes: ['no_disponible'], sin_precio: [(receta.nombre || '') + ' (ciclo)'] };
    }
    let coste = 0;
    const desglose = [];
    const sin_precio = [];
    const fuentes = new Set();
    for (const linea of (receta.lineas || [])) {
      const cant = (typeof linea.cantidad === 'number' && linea.cantidad > 0) ? linea.cantidad : 1;
      const { precio_u, fuente } = await this._resolverLinea(input, linea, catalogo, receta.id ? cadena.concat(receta.id) : cadena);
      if (precio_u == null) { sin_precio.push(linea.nombre); fuentes.add('no_disponible'); continue; }
      const v = this._round(cant * precio_u, 2);
      coste += v;
      desglose.push({ ref: linea.ref, nombre: linea.nombre, cantidad: cant, unidad: linea.unidad, precio_unitario: precio_u, valor_calculado: v, fuente });
      fuentes.add(fuente);
    }
    const coste_total = this._round(coste, 2);
    const coste_unidad = (receta.rinde && receta.rinde.cantidad > 0) ? this._round(coste_total / receta.rinde.cantidad, 2) : coste_total;
    return { coste_total, coste_unidad, desglose, fuentes: Array.from(fuentes), sin_precio };
  }

  async _resolverLinea(input, linea, catalogo, cadena) {
    const ing = (linea.ref && catalogo.porId[linea.ref]) || catalogo.porNombre[(linea.nombre || '').toLowerCase()];
    if (ing && typeof ing.precio === 'number') {
      return { precio_u: this._convertir(ing.precio, ing.compra_unidad, linea.unidad), fuente: (ing.fuente === 'sub_receta' ? 'sub_receta' : 'catalogo') };
    }
    if (linea.ref) {
      const sub = await this._cargarReceta(input, linea.ref);
      if (sub) {
        const rsub = await this._costear(input, sub, catalogo, cadena);
        if (typeof rsub.coste_unidad === 'number') return { precio_u: rsub.coste_unidad, fuente: 'sub_receta' };
      }
    }
    return { precio_u: null, fuente: 'sin_resolver' };
  }

  _convertir(precio, compra_unidad, unidad_linea) {
    if (['kg', 'l'].includes(compra_unidad) && ['g', 'ml'].includes(unidad_linea)) return precio / 1000;
    return precio;
  }

  _persistir(input, receta, r) {
    const now = new Date().toISOString();
    this.eventBus.publish('escandallo.coste.calculado', {
      project_id: input.project_id, receta_id: receta.id,
      coste_total: r.coste_total, coste_unidad: r.coste_unidad, coste_actualizado_at: now,
      fuentes_precios: r.fuentes, lineas_detalle: r.desglose, lineas_sin_precio: r.sin_precio,
      correlation_id: input.correlation_id, timestamp: now
    });
  }

  // ── carga de datos via el reflejo de recetas (JS↔JS, ms) ──

  async _cargarCatalogo(input) {
    const resp = await this._rpc('recetas.ingredientes.request', { project_id: input.project_id, correlation_id: input.correlation_id });
    const items = (resp && resp.status === 200 ? (resp.data?.ingredientes || []) : []);
    const porId = {}; const porNombre = {};
    for (const c of items) { if (c.id) porId[c.id] = c; if (c.nombre) porNombre[String(c.nombre).toLowerCase()] = c; }
    return { items, porId, porNombre };
  }

  async _cargarRecetas(input, estado) {
    const resp = await this._rpc('recetas.listar.request', { project_id: input.project_id, estado, incluir_lineas: true, limit: 1000, correlation_id: input.correlation_id });
    return (resp && resp.status === 200) ? (resp.data?.recetas || []) : [];
  }

  async _cargarReceta(input, id) {
    const resp = await this._rpc('recetas.obtener.request', { project_id: input.project_id, receta_id: id, correlation_id: input.correlation_id });
    return (resp && resp.status === 200) ? (resp.data?.receta || resp.data) : null;
  }
}

module.exports = EscandalloReflejo;
