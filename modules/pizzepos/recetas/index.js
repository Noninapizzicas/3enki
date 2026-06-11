/**
 * recetas — REFLEJO JS (mitad determinista del módulo híbrido). Primer caso del
 * Patrón Módulo Híbrido. El blueprint sirve lo FUZZY (crear/investigar/editar via
 * LLM); este reflejo sirve las LECTURAS deterministas + el persist del coste, en
 * el bus, sin turno LLM. Réplica fiel de la proyección del blueprint.
 *
 * Extiende ModuloHibridoReflejo (la base con toda la fontanería): aquí solo van
 * los handlers de una línea + las proyecciones.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const STORE_PATH = '/pizzepos/recetas.json';

class RecetasReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'recetas';
    this.version = 'reflejo-1.1.0';
  }

  // ── handlers RPC (una línea: delegan a _atender de la base) ──
  onListarRequest(e) { return this._atender(e, 'listar', 'recetas.listar.response', d => this._listar(d)); }
  onIngredientesRequest(e) { return this._atender(e, 'ingredientes', 'recetas.ingredientes.response', d => this._ingredientes(d)); }
  onObtenerRequest(e) { return this._atender(e, 'obtener', 'recetas.obtener.response', d => this._obtener(d)); }

  // ── proyecciones deterministas (réplica fiel del pseudocódigo) ──

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const estado = input.estado || 'en_servicio';
    if (!['borrador', 'en_servicio', 'archivada'].includes(estado)) return this._invalid('estado');
    const limit = (typeof input.limit === 'number' && input.limit > 0) ? input.limit : 50;

    const store = await this._leerJson(input.project_id, STORE_PATH);
    if (store === null) return { status: 200, data: { total: 0, recetas: [] } };

    let items = (store.recetas || []).filter(r => r.estado_operativo === estado);
    if (input.solo_incompletas === true) items = items.filter(r => r.incompleta === true);

    return {
      status: 200,
      data: {
        total: items.length,
        recetas: items.slice(0, limit).map(r => ({
          receta_id: r.id, nombre: r.nombre, tipo: r.tipo, rinde: r.rinde,
          lineas_count: Array.isArray(r.lineas) ? r.lineas.length : 0,
          incompleta: r.incompleta, campos_pendientes: r.campos_pendientes,
          estado_operativo: r.estado_operativo, version: r.version, updated_at: r.updated_at,
          ...(input.incluir_lineas === true
            ? { lineas: Array.isArray(r.lineas) ? r.lineas : [], coste_unidad: r.coste_unidad }
            : {})
        }))
      }
    };
  }

  async _ingredientes(input) {
    if (!input.project_id) return this._invalid('project_id');
    const store = await this._leerJson(input.project_id, STORE_PATH);
    if (store === null) return { status: 200, data: { total: 0, ingredientes: [] } };
    let arr = store.ingredientes_catalogo || [];
    if (input.categoria) arr = arr.filter(i => i.categoria === input.categoria);
    return { status: 200, data: { total: arr.length, ingredientes: arr } };
  }

  async _obtener(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.receta_id && !input.nombre) return this._invalid('receta_id|nombre');
    const store = await this._leerJson(input.project_id, STORE_PATH);
    if (store === null) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'recetas.json no existe', { entity_type: 'recipe' });
    }
    const ref = input.receta_id || input.nombre;
    const norm = String(ref).toLowerCase().trim();
    const r = (store.recetas || []).find(x => x.id === ref)
      || (store.recetas || []).find(x => String(x.nombre || '').toLowerCase().trim() === norm);
    if (!r) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'receta no encontrada', { entity_type: 'recipe', entity_ref: ref });
    }
    const rest = {};
    for (const campo of Object.keys(r)) {
      if (campo !== 'history') rest[campo] = r[campo];
    }
    return { status: 200, data: { ...rest, versiones_anteriores: (r.history || []).length } };
  }

  // ── persist WRITE (fire-and-forget): aplica el coste de escandallo al store.
  //    Antes era un turno LLM sintético por cada coste; ahora es código. ──
  async onCosteCalculado(event) {
    const d = (event && event.data) || event || {};
    if (!d.project_id || !d.receta_id) return;
    try {
      const store = await this._leerJson(d.project_id, STORE_PATH);
      if (!store) return;
      const idx = (store.recetas || []).findIndex(r => r.id === d.receta_id);
      if (idx < 0) return;
      const r = store.recetas[idx];
      const aplicados = [];
      for (const campo of ['coste_total', 'coste_unidad', 'coste_actualizado_at', 'fuentes_precios', 'lineas_detalle', 'lineas_sin_precio']) {
        if (d[campo] !== undefined && d[campo] !== null) { r[campo] = d[campo]; aplicados.push(campo); }
      }
      if (aplicados.length === 0) return;
      const now = new Date().toISOString();
      await this._editarJson(d.project_id, STORE_PATH, [
        { op: 'test', path: `/recetas/${idx}/id`, value: d.receta_id },
        { op: 'replace', path: `/recetas/${idx}`, value: r },
        { op: 'replace', path: '/_updated_at', value: now }
      ]);
      this.eventBus.publish('receta.actualizada', {
        receta_id: r.id, nombre: r.nombre, version: r.version,
        campos_actualizados: aplicados, origen: 'escandallo.coste.calculado',
        correlation_id: d.correlation_id || null, timestamp: now
      });
      this.metrics?.increment('recetas.reflejo.served', { op: 'aplicar_coste' });
    } catch (err) {
      this.logger?.error('recetas.reflejo.aplicar_coste.failed', { error: err.message });
      this.metrics?.increment('recetas.reflejo.errors', { op: 'aplicar_coste' });
    }
  }
}

module.exports = RecetasReflejo;
