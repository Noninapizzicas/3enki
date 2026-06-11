/**
 * recetas — REFLEJO JS (mitad determinista del módulo híbrido).
 *
 * recetas es un módulo HÍBRIDO: el blueprint (recetas.blueprint.json) sirve lo
 * FUZZY via LLM (crear desde intención, investigar_receta, editar...), y este
 * index.js sirve lo DETERMINISTA como reflejo — las LECTURAS de recetas.json.
 *
 * Por qué existe: cada lectura que pedía escandallo (recetas.listar/ingredientes/
 * obtener.request) se servía con un TURNO LLM sintético que arrastraba el
 * blueprint de recetas (~18K tokens) + leía el fichero. Medido en vivo: un
 * escandallo costaba 250-370K tokens. Servidas por este reflejo (lee el fichero
 * y proyecta, en milisegundos), el mismo contrato de bus responde igual pero
 * sin LLM: el coste cae ~10x y es instantáneo.
 *
 * Contrato idéntico al blueprint: <op> recibe el request, responde
 * recetas.<op>.response con { request_id, status, data } correlado. La proyección
 * replica EXACTAMENTE la del pseudocódigo (listar/ingredientes/obtener).
 *
 * El blueprint deja de declarar esas 3 en eventos_que_escucho con responde:true
 * (ya no hay turno sintético). Sus cajones listar/obtener/ingredientes siguen
 * existiendo para el LLM cuando está en la página de recetas.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');

const STORE_PATH = '/pizzepos/recetas.json';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class RecetasReflejo extends BaseModule {
  constructor() {
    super();
    this.name = 'recetas';
    this.version = 'reflejo-1.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    // Las suscripciones a recetas.{listar,ingredientes,obtener}.request las
    // wirea el loader desde manifest.subscribes a estos handlers.
    this.logger.info('recetas.reflejo.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    // Las suscripciones de manifest.subscribes las limpia el loader (_eventUnsubs).
    this.logger?.info('recetas.reflejo.unloaded', { module: this.name });
  }

  // =============================================================
  // Bus handlers — sirven las lecturas deterministas (reflejo, sin LLM)
  // =============================================================

  async onListarRequest(event) {
    const d = event?.data || event || {};
    const result = await this._guard('listar', () => this._listar(d));
    this._responder('recetas.listar.response', d.request_id, result);
  }

  async onIngredientesRequest(event) {
    const d = event?.data || event || {};
    const result = await this._guard('ingredientes', () => this._ingredientes(d));
    this._responder('recetas.ingredientes.response', d.request_id, result);
  }

  async onObtenerRequest(event) {
    const d = event?.data || event || {};
    const result = await this._guard('obtener', () => this._obtener(d));
    this._responder('recetas.obtener.response', d.request_id, result);
  }

  // =============================================================
  // Proyecciones (réplica fiel del pseudocódigo del blueprint)
  // =============================================================

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const estado = input.estado || 'en_servicio';
    if (!['borrador', 'en_servicio', 'archivada'].includes(estado)) return this._invalid('estado');
    const limit = (typeof input.limit === 'number' && input.limit > 0) ? input.limit : 50;

    const store = await this._leerStore(input.project_id);
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
    const store = await this._leerStore(input.project_id);
    if (store === null) return { status: 200, data: { total: 0, ingredientes: [] } };
    let arr = store.ingredientes_catalogo || [];
    if (input.categoria) arr = arr.filter(i => i.categoria === input.categoria);
    return { status: 200, data: { total: arr.length, ingredientes: arr } };
  }

  async _obtener(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.receta_id && !input.nombre) return this._invalid('receta_id|nombre');
    const store = await this._leerStore(input.project_id);
    if (store === null) {
      return { status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'recetas.json no existe', details: { entity_type: 'recipe' } } };
    }
    const ref = input.receta_id || input.nombre;
    const norm = String(ref).toLowerCase().trim();
    // robusto: por id (slug o uuid) y, si no, por nombre normalizado.
    const r = (store.recetas || []).find(x => x.id === ref)
      || (store.recetas || []).find(x => String(x.nombre || '').toLowerCase().trim() === norm);
    if (!r) {
      return { status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'receta no encontrada', details: { entity_type: 'recipe', entity_ref: ref } } };
    }
    const rest = {};
    for (const campo of Object.keys(r)) {
      if (campo !== 'history') rest[campo] = r[campo];
    }
    return { status: 200, data: { ...rest, versiones_anteriores: (r.history || []).length } };
  }

  // =============================================================
  // Privados
  // =============================================================

  // Lee /pizzepos/recetas.json via el reflejo fs (bus). Devuelve el store
  // parseado, o null si 404 / error. RPC JS↔JS: milisegundos.
  async _leerStore(project_id) {
    const request_id = crypto.randomUUID();
    const resp = await new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, 5000);
      try {
        unsub = this.eventBus.subscribe('fs.read.response', (event) => {
          const d = event?.data || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          resolve(d);
        });
        this.eventBus.publish('fs.read.request', {
          request_id, project_id, path: STORE_PATH, encoding: 'utf-8'
        });
      } catch (_) {
        clearTimeout(timeout);
        if (unsub) unsub();
        resolve(null);
      }
    });
    if (!resp || resp.status === 404 || !resp.content) return null;
    try { return JSON.parse(resp.content); } catch (_) { return null; }
  }

  _responder(evento, request_id, result) {
    this.eventBus.publish(evento, { request_id, ...result });
  }

  async _guard(kind, fn) {
    try {
      const r = await fn();
      this.metrics?.increment('recetas.reflejo.served', { op: kind });
      return r;
    } catch (err) {
      this.logger?.error('recetas.reflejo.failed', { kind, error: err.message });
      this.metrics?.increment('recetas.reflejo.errors', { op: kind });
      return { status: 500, error: { code: 'UNKNOWN_ERROR', message: err.message } };
    }
  }

  _invalid(field) {
    return { status: 400, error: { code: 'INVALID_INPUT', message: `${field} requerido`, details: { field } } };
  }
}

module.exports = RecetasReflejo;
