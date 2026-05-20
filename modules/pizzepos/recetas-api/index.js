/**
 * recetas-api — Bridge lecto-puro del store de recetas.
 *
 * Lee /recetas.json del proyecto activo via fs.read.request al filesystem y
 * devuelve slices ordenados al caller. Sin escrituras, sin invocacion al LLM,
 * sin transformaciones de dominio — devuelve lo que esta en el storage tal
 * cual, derivando solo lo trivial (ingredientes_count = r.ingredientes.length).
 *
 * El blueprint del modulo recetas (modules/pizzepos/recetas/) sigue siendo el
 * runtime LLM para operaciones complejas (crear, validar, editar, eliminar).
 * Este bridge es la capa rapida para el frontend.
 *
 * tools.contract v1.2: las 4 tools[] declaradas en module.json quedan auto-
 * registradas en los 3 destinos por core/modules/loader.js::registerToolsForAI:
 *   - toolsRegistry (LLM via ai-gateway)
 *   - Bus event `<toolName>` (modulos del backend)
 *   - uiHandler con domain='recetas' (frontend via mqttRequest)
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');

class RecetasApiModule extends BaseModule {
  constructor() {
    super();
    this.name = 'recetas-api';
    this.version = '1.0.0';
    this.config = null;
    this.pendingFs = new Map(); // request_id -> { resolve, reject, timer }
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics || null;
    this.eventBus = core.eventBus;
    const cfg = core.moduleConfig || {};
    this.config = {
      fs_request_timeout_ms: cfg.fs_request_timeout_ms || 10000,
      default_list_limit:    cfg.default_list_limit    || 100
    };

    this.logger?.info?.('recetas-api.loaded', {
      module: this.name,
      version: this.version
    });
  }

  async onUnload() {
    for (const { timer, reject } of this.pendingFs.values()) {
      clearTimeout(timer);
      try { reject(Object.assign(new Error('recetas-api shutting down'), { _code: 'SYSTEM_RESOURCE_EXHAUSTED' })); } catch (_) {}
    }
    this.pendingFs.clear();
    this.logger?.info?.('recetas-api.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus subscribers (wired from manifest.events.subscribes)
  // ==========================================

  onFsReadResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingFs.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingFs.delete(request_id);

    if (data.error) {
      // Filesystem 404 → null (store vacio, no es error real)
      if (data.error.code === 'RESOURCE_NOT_FOUND' || data.error.kind === 'enoent') {
        pending.resolve(null);
        return;
      }
      pending.reject(Object.assign(
        new Error(data.error.message || 'fs.read.failed'),
        { _code: data.error.code || 'UPSTREAM_INVALID_RESPONSE' }
      ));
      return;
    }
    pending.resolve(data.content ?? null);
  }

  // ==========================================
  // Tool handlers (declarados en manifest.tools[])
  // ==========================================

  async handleListar(args = {}) {
    if (!args.project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { field: 'project_id' });
    }
    const estado = args.estado_operativo;
    if (estado && !['borrador', 'en_servicio', 'archivada'].includes(estado)) {
      return this._errorResponse(400, 'INVALID_INPUT', `estado_operativo invalid: ${estado}`, { field: 'estado_operativo' });
    }
    const limit = (typeof args.limit === 'number' && args.limit > 0) ? args.limit : this.config.default_list_limit;

    let store;
    try {
      store = await this._readStore(args.project_id);
    } catch (err) {
      return this._handleHandlerError('recetas-api.listar.error', err, 'listar');
    }

    if (!store) {
      this.metrics?.increment?.('recetas-api.listar.total', { project_id: args.project_id, status: '200_empty' });
      return { status: 200, data: { total: 0, recetas: [] } };
    }

    let items = Array.isArray(store.recetas) ? store.recetas : [];
    if (estado) items = items.filter(r => r && r.estado_operativo === estado);

    const total = items.length;
    const sorted = items
      .slice()
      .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
      .slice(0, limit)
      .map(r => this._summarize(r));

    this.metrics?.increment?.('recetas-api.listar.total', { project_id: args.project_id, status: '200' });
    return { status: 200, data: { total, recetas: sorted } };
  }

  async handleObtener(args = {}) {
    if (!args.id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { field: 'id' });
    }
    if (!args.project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { field: 'project_id' });
    }

    let store;
    try {
      store = await this._readStore(args.project_id);
    } catch (err) {
      return this._handleHandlerError('recetas-api.obtener.error', err, 'obtener');
    }

    if (!store) {
      this.metrics?.increment?.('recetas-api.obtener.total', { project_id: args.project_id, status: '404_no_store' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `Recetas store not found for project ${args.project_id}`,
        { entity_type: 'recipe_store', project_id: args.project_id });
    }

    const items = Array.isArray(store.recetas) ? store.recetas : [];
    const receta = items.find(r => r && r.id === args.id);
    if (!receta) {
      this.metrics?.increment?.('recetas-api.obtener.total', { project_id: args.project_id, status: '404' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `Receta ${args.id} not found`,
        { entity_type: 'recipe', id: args.id });
    }

    this.metrics?.increment?.('recetas-api.obtener.total', { project_id: args.project_id, status: '200' });
    return {
      status: 200,
      data: {
        ...receta,
        ingredientes_count: Array.isArray(receta.ingredientes) ? receta.ingredientes.length : 0
      }
    };
  }

  async handleIngredientes(args = {}) {
    if (!args.project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { field: 'project_id' });
    }

    let store;
    try {
      store = await this._readStore(args.project_id);
    } catch (err) {
      return this._handleHandlerError('recetas-api.ingredientes.error', err, 'ingredientes');
    }

    if (!store) {
      this.metrics?.increment?.('recetas-api.ingredientes.total', { project_id: args.project_id, status: '200_empty' });
      return { status: 200, data: { total: 0, ingredientes: [] } };
    }

    const items = Array.isArray(store.ingredientes_catalogo) ? store.ingredientes_catalogo : [];
    const sorted = items.slice().sort((a, b) =>
      String(a?.nombre || '').localeCompare(String(b?.nombre || ''))
    );

    this.metrics?.increment?.('recetas-api.ingredientes.total', { project_id: args.project_id, status: '200' });
    return { status: 200, data: { total: items.length, ingredientes: sorted } };
  }

  async handleEstadisticas(args = {}) {
    if (!args.project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { field: 'project_id' });
    }

    let store;
    try {
      store = await this._readStore(args.project_id);
    } catch (err) {
      return this._handleHandlerError('recetas-api.estadisticas.error', err, 'estadisticas');
    }

    if (!store) {
      this.metrics?.increment?.('recetas-api.estadisticas.total', { project_id: args.project_id, status: '200_empty' });
      return {
        status: 200,
        data: {
          total_recetas: 0,
          por_estado: { borrador: 0, en_servicio: 0, archivada: 0 },
          incompletas: 0,
          ingredientes_catalogo: 0,
          ingredientes_usados_unicos: 0
        }
      };
    }

    const recetas = Array.isArray(store.recetas) ? store.recetas : [];
    const por_estado = { borrador: 0, en_servicio: 0, archivada: 0 };
    let incompletas = 0;
    const usados = new Set();
    for (const r of recetas) {
      if (!r) continue;
      if (r.estado_operativo && Object.prototype.hasOwnProperty.call(por_estado, r.estado_operativo)) {
        por_estado[r.estado_operativo]++;
      }
      if (r.incompleta) incompletas++;
      if (Array.isArray(r.ingredientes)) {
        for (const ing of r.ingredientes) {
          if (ing && typeof ing.nombre === 'string') usados.add(ing.nombre.toLowerCase());
        }
      }
    }

    const ingredientes_catalogo = Array.isArray(store.ingredientes_catalogo)
      ? store.ingredientes_catalogo.length
      : 0;

    this.metrics?.increment?.('recetas-api.estadisticas.total', { project_id: args.project_id, status: '200' });
    return {
      status: 200,
      data: {
        total_recetas: recetas.length,
        por_estado,
        incompletas,
        ingredientes_catalogo,
        ingredientes_usados_unicos: usados.size
      }
    };
  }

  // ==========================================
  // Helpers privados
  // ==========================================

  /**
   * Lee /recetas.json del proyecto via bus fs.read.request.
   * Devuelve el objeto parseado, null si el archivo no existe (404).
   * Throws con err._code canonico si hay otro error.
   */
  async _readStore(project_id) {
    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para fs.read.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }

    const request_id = crypto.randomUUID();
    const raw = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error('fs.read timeout para /recetas.json');
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.fs_request_timeout_ms);

      this.pendingFs.set(request_id, { resolve, reject, timer });

      this.eventBus.publish('fs.read.request', {
        request_id,
        project_id,
        path: '/recetas.json',
        encoding: 'utf8'
      }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });

    if (raw === null) return null; // 404 → store vacio

    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      const err = new Error(`recetas.json no parseable: ${parseErr.message}`);
      err._code = 'UPSTREAM_INVALID_RESPONSE';
      throw err;
    }
  }

  /**
   * Construye el resumen de una receta para el listado.
   * Solo lo que esta en el storage canonico + ingredientes_count derivado.
   * NO inventa campos (categoria, coste_total, coste_porcion) — el frontend
   * muestra lo que hay; si quiere mas info, la pide al chat.
   */
  _summarize(receta) {
    if (!receta || typeof receta !== 'object') return null;
    return {
      id: receta.id,
      nombre: receta.nombre,
      porciones: receta.porciones,
      dificultad: receta.dificultad,
      estado_operativo: receta.estado_operativo,
      incompleta: receta.incompleta === true,
      campos_pendientes: Array.isArray(receta.campos_pendientes) ? receta.campos_pendientes : [],
      version: receta.version,
      updated_at: receta.updated_at,
      ingredientes_count: Array.isArray(receta.ingredientes) ? receta.ingredientes.length : 0
    };
  }
}

module.exports = RecetasApiModule;
