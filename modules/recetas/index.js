'use strict';

const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
// ============================================================
// Tools que el LLM puede invocar
// ============================================================
const TOOL_HANDLERS = {
  'recetas.crear':            'crear',
  'recetas.listar':           'listar',
  'recetas.obtener':          'obtener',
  'recetas.buscar':           'buscar',
  'recetas.actualizar':       'actualizar',
  'recetas.historial':        'historial',
  'recetas.revertir':         'revertir',
  'recetas.eliminar':         'eliminar',
  'recetas.estadisticas':     'estadisticas',
  'recetas.ingredientes':     'ingredientes',
  'recetas.actualizar_precio':'actualizarPrecio',
  'recetas.analizar':         'analizar',
  'recetas.investigar_receta':'investigarReceta'
};

// Campos sin los cuales una receta se considera incompleta
const CAMPOS_REQUERIDOS_PARA_COMPLETA = ['ingredientes', 'porciones', 'instrucciones'];

// ============================================================

const DEFAULT_PROJECT_ID = 'default';

class RecetasModule extends BaseModule {
  constructor() {
    super();
    this.name = 'recetas';
    this.version = '3.0.0';
    // project_id → base_path absoluto (cache, poblado por project.activated)
    this.projectBasePaths = new Map();

    // project_id → Promise (cola para serializar writes)
    this.writeQueues = new Map();

    // request_id → { resolve, reject, timer } para fs.* y project.*
    this.pendingFs = new Map();
    this.pendingProject = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.logger.info('recetas.loaded', { storage: 'json-per-project' });
  }

  async onUnload() {
    for (const { timer } of this.pendingFs.values()) clearTimeout(timer);
    for (const { timer } of this.pendingProject.values()) clearTimeout(timer);
    this.pendingFs.clear();
    this.pendingProject.clear();
    this.writeQueues.clear();
    this.projectBasePaths.clear();
  }

  // ============================================================
  // POC2 Helpers
  // ============================================================

  _errorResponse(status, code, message, details) {
    const err = { code, message };
    if (details !== undefined) err.details = details;
    return { status, error: err };
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrad') || msg.includes('no existe')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('requerido') || msg.includes('inválid') || msg.includes('invalid')) return 'INVALID_INPUT';
    if (msg.includes('timeout')) return 'UPSTREAM_TIMEOUT';
    if (msg.includes('corrupto') || msg.includes('parse') || msg.includes('json')) return 'UNKNOWN_ERROR';
    return 'UNKNOWN_ERROR';
  }

  _handleHandlerError(logKey, err, kind) {
    const code = err._code || this._classifyHandlerError(err);
    const statusMap = { RESOURCE_NOT_FOUND: 404, INVALID_INPUT: 400, ALREADY_EXISTS: 409, UPSTREAM_TIMEOUT: 503, UNKNOWN_ERROR: 500 };
    const status = statusMap[code] || 500;
    this.logger.error('recetas.handler_error', { handler: logKey, error: err.message, code });
    this.metrics?.increment('recetas.error', { kind: kind || logKey, code });
    return this._errorResponse(status, code, err.message, err._details);
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || payload?.proyecto_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('recetas.publish_error', { event: name, error: err.message });
      this.metrics?.increment('recetas.error', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — alias canonico para escritura atomica.
  // Delegacion al filesystem module via bus (fs.write.request es atomico end-to-end).
  async _atomicWriteFile(slug, contents) {
    return this._writeFile(slug, contents);
  }

  // 6o helper — alias canonico para lectura JSON segura.
  async _readJsonSafe(slug, _kind) {
    try {
      const raw = await this._readFile(slug);
      if (raw == null) return null;
      return JSON.parse(raw);
    } catch (err) {
      this.logger.warn('recetas.read_json_error', { slug, error: err.message });
      this.metrics?.increment('recetas.error', { kind: 'read_json', code: 'UNKNOWN_ERROR' });
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('recetas.error', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  _calcIncompleta(receta) {
    const pendientes = [];
    for (const campo of CAMPOS_REQUERIDOS_PARA_COMPLETA) {
      const v = receta[campo];
      const vacio = v == null || (Array.isArray(v) && v.length === 0) || v === '';
      if (vacio) pendientes.push(campo);
    }
    receta.incompleta = pendientes.length > 0;
    receta.campos_pendientes = pendientes;
    return receta;
  }

  // ============================================================
  // Eventos del proyecto — cacheamos slug
  // ============================================================

  onProjectActivated(event) {
    const data = event.data || event;
    const id = data.project_id || data.id;
    // base_path canónico viene en el payload top-level (project-identity.contract P1/D1).
    // Fallback a data.project.base_path por compat con publishers legacy.
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) this.projectBasePaths.set(id, basePath);
  }

  onProjectDeactivated() { /* no-op; mantenemos cache */ }

  // ============================================================
  // Resolver project_id → base_path absoluto
  // Patrón canónico: cache poblado por project.activated. Fallback a
  // project.get.request para proyectos no activos aún.
  // ============================================================

  async _basePathForProject(project_id) {
    if (!project_id) {
      const err = new Error('proyecto_id requerido');
      err._code = 'INVALID_INPUT';
      throw err;
    }
    if (this.projectBasePaths.has(project_id)) return this.projectBasePaths.get(project_id);

    const request_id = crypto.randomUUID();
    const basePath = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProject.delete(request_id);
        const err = new Error(`project.get timeout para ${project_id}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, 5000);
      this.pendingProject.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('project.get.request', { request_id, project_id });
    });
    this.projectBasePaths.set(project_id, basePath);
    return basePath;
  }

  onProjectGetResponse(event) {
    const { request_id, project, error } = event.data || event;
    const p = this.pendingProject.get(request_id);
    if (!p) return;
    clearTimeout(p.timer); this.pendingProject.delete(request_id);
    if (error || !project) return p.reject(new Error(error || 'Project not found'));
    if (!project.base_path) return p.reject(new Error('project.base_path missing in response'));
    p.resolve(project.base_path);
  }

  // ============================================================
  // Filesystem — leer/escribir archivo JSON del proyecto
  // ============================================================

  _pathFor(basePath) {
    return `${basePath}/recetas.json`;
  }

  async _readFile(slug) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.read timeout: ${slug}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, 8000);
      this.pendingFs.set(request_id, { resolve, reject, timer, op: 'read' });
      this.eventBus.publish('fs.read.request', { request_id, path: this._pathFor(slug) });
    });
  }

  async _writeFile(slug, content) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.write timeout: ${slug}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, 8000);
      this.pendingFs.set(request_id, { resolve, reject, timer, op: 'write' });
      this.eventBus.publish('fs.write.request', {
        request_id, path: this._pathFor(slug), content, encoding: 'utf-8'
      });
    });
  }

  onFsReadResponse(event) {
    const { request_id, content, status, error } = event.data || event;
    const p = this.pendingFs.get(request_id);
    if (!p) return;
    clearTimeout(p.timer); this.pendingFs.delete(request_id);
    // filesystem moderno usa { error: { code, message, details } } sin status numerico.
    // RESOURCE_NOT_FOUND equivale a 404: archivo no existe → resolvemos null.
    if (status === 404 || error?.code === 'RESOURCE_NOT_FOUND') return p.resolve(null);
    if (error || status >= 400) {
      const msg = typeof error === 'object' && error !== null
        ? (error.message || JSON.stringify(error))
        : (error || `fs.read status ${status}`);
      return p.reject(new Error(msg));
    }
    p.resolve(content);
  }

  onFsWriteResponse(event) {
    const { request_id, error, status } = event.data || event;
    const p = this.pendingFs.get(request_id);
    if (!p) return;
    clearTimeout(p.timer); this.pendingFs.delete(request_id);
    if (error || status >= 400) {
      const msg = typeof error === 'object' && error !== null
        ? (error.message || JSON.stringify(error))
        : (error || `fs.write status ${status}`);
      return p.reject(new Error(msg));
    }
    p.resolve(true);
  }

  // ============================================================
  // Carga / guardado del store — con cola por proyecto
  // ============================================================

  _emptyStore() {
    return {
      _version: '1.0',
      _updated_at: new Date().toISOString(),
      recetas: [],
      ingredientes_catalogo: []
    };
  }

  async _loadStore(slug) {
    const raw = await this._readFile(slug);
    if (raw == null) return this._emptyStore();
    try {
      const parsed = JSON.parse(raw);
      parsed.recetas = Array.isArray(parsed.recetas) ? parsed.recetas : [];
      parsed.ingredientes_catalogo = Array.isArray(parsed.ingredientes_catalogo) ? parsed.ingredientes_catalogo : [];
      return parsed;
    } catch (err) {
      this.logger.error('recetas.store.parse.failed', { slug, error: err.message });
      const e = new Error('recetas.json corrupto: ' + err.message);
      e._code = 'UNKNOWN_ERROR';
      throw e;
    }
  }

  async _saveStore(slug, store) {
    store._updated_at = new Date().toISOString();
    await this._writeFile(slug, JSON.stringify(store, null, 2));
  }

  async _withStore(project_id, mutator) {
    const slug = await this._basePathForProject(project_id);
    const prev = this.writeQueues.get(project_id) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const store = await this._loadStore(slug);
        const result = await mutator(store);
        if (!result || !(result.status >= 400)) await this._saveStore(slug, store);
        return result;
      });
    this.writeQueues.set(project_id, next);
    try { return await next; }
    finally {
      if (this.writeQueues.get(project_id) === next) this.writeQueues.delete(project_id);
    }
  }

  async _readOnly(project_id, reader) {
    const slug = await this._basePathForProject(project_id);
    const store = await this._loadStore(slug);
    return reader(store);
  }

  // ============================================================
  // Helpers de dominio
  // ============================================================

  _normalizeIngredientes(ingredientes) {
    if (ingredientes == null) return [];
    if (typeof ingredientes === 'string') {
      return [{ nombre: ingredientes.trim(), cantidad: null, unidad: null, notas: 'texto libre' }];
    }
    if (!Array.isArray(ingredientes)) return [];
    return ingredientes.map(it => {
      if (typeof it === 'string') return { nombre: it.trim(), cantidad: null, unidad: null };
      if (typeof it !== 'object' || it == null) return { nombre: String(it), cantidad: null, unidad: null };
      return {
        nombre: (it.nombre ?? it.name ?? it.ingrediente ?? '').toString().trim(),
        cantidad: it.cantidad ?? it.quantity ?? null,
        unidad:   it.unidad   ?? it.unit     ?? null,
        notas:    it.notas    ?? it.notes    ?? undefined
      };
    }).filter(i => i.nombre);
  }

  _normalizeInstrucciones(input) {
    if (input == null) return [];
    if (typeof input === 'string') return input.split(/\n+|\.\s+/).map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(input)) return [];
    return input.map(s => String(s).trim()).filter(Boolean);
  }

  _formatIngredientesText(arr) {
    if (!arr || !arr.length) return null;
    return arr.map(i => {
      const head = [i.cantidad, i.unidad].filter(v => v != null && v !== '').join(' ').trim();
      const body = head && i.nombre ? `${head} de ${i.nombre}` : (i.nombre || head || '');
      const suffix = i.notas ? ` (${i.notas})` : '';
      return body ? `- ${body}${suffix}` : null;
    }).filter(Boolean).join('\n');
  }

  _findRecetaByRefBuilder(store) {
    return (ref) => {
      if (!ref) return null;
      let r = store.recetas.find(x => x.id === ref);
      if (r) return r;
      const refLower = String(ref).toLowerCase().trim();
      r = store.recetas.find(x => x.nombre.toLowerCase() === refLower && x.estado === 'activa');
      if (r) return r;
      r = store.recetas.find(x => x.nombre.toLowerCase().includes(refLower) && x.estado === 'activa');
      return r || null;
    };
  }

  // ============================================================
  // Tools — implementaciones sobre el store JSON
  // ============================================================

  async crear(params) {
    const { proyecto_id, nombre } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.crear.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'crear', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    if (!nombre || !nombre.trim()) {
      this.logger.warn('recetas.crear.validation', { field: 'nombre' });
      this.metrics?.increment('recetas.error', { kind: 'crear', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'nombre requerido');
    }

    const ingredientes = this._normalizeIngredientes(params.ingredientes);
    const instrucciones = this._normalizeInstrucciones(params.instrucciones);

    return this._withStore(proyecto_id, async (store) => {
      const dup = store.recetas.find(r => r.nombre.toLowerCase() === nombre.toLowerCase().trim() && r.estado === 'activa');
      if (dup) {
        this.logger.warn('recetas.crear.duplicate', { nombre, proyecto_id });
        this.metrics?.increment('recetas.error', { kind: 'crear', code: 'ALREADY_EXISTS' });
        return this._errorResponse(409, 'ALREADY_EXISTS', 'Ya existe una receta activa con ese nombre', { existing_id: dup.id });
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      const receta = {
        id, nombre: nombre.trim(),
        descripcion: params.descripcion || null,
        ingredientes, instrucciones,
        porciones: params.porciones ?? null,
        tiempo_min: params.tiempo_min ?? params.tiempo_preparacion ?? null,
        dificultad: params.dificultad ?? null,
        categorias: Array.isArray(params.categorias) ? params.categorias : [],
        etiquetas: Array.isArray(params.etiquetas) ? params.etiquetas : [],
        estado: 'activa',
        fuente: params.fuente || 'manual',
        notas: params.notas || null,
        created_at: now, updated_at: now,
        version: 1, history: []
      };
      this._calcIncompleta(receta);
      store.recetas.push(receta);

      await this._publicarEvento('receta.creada', { project_id: proyecto_id, id, nombre: receta.nombre }, params);
      this.metrics?.increment('recetas.receta.creada', { project_id: proyecto_id });

      return {
        status: 201,
        data: {
          id, nombre: receta.nombre, status: 'creada',
          incompleta: receta.incompleta, campos_pendientes: receta.campos_pendientes,
          ingredientes_formateados: this._formatIngredientesText(ingredientes),
          version: 1
        }
      };
    });
  }

  async listar(params) {
    const { proyecto_id } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.listar.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'listar', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      let r = store.recetas;
      if (params.estado) r = r.filter(x => x.estado === params.estado);
      else r = r.filter(x => x.estado !== 'archivada');
      if (params.solo_incompletas) r = r.filter(x => x.incompleta);
      const limit = params.limit ?? 100;
      const items = r
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
        .slice(0, limit)
        .map(x => ({ id: x.id, nombre: x.nombre, porciones: x.porciones, dificultad: x.dificultad,
                     incompleta: x.incompleta, campos_pendientes: x.campos_pendientes,
                     estado: x.estado, version: x.version, updated_at: x.updated_at }));
      return { status: 200, data: { total: items.length, recetas: items } };
    });
  }

  async obtener(params) {
    const { proyecto_id, receta_id, nombre } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.obtener.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'obtener', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id || nombre);
      if (!r) {
        this.logger.warn('recetas.obtener.not_found', { ref: receta_id || nombre, proyecto_id });
        this.metrics?.increment('recetas.error', { kind: 'obtener', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Receta no encontrada', { ref: receta_id || nombre });
      }
      const { history, ...rest } = r;
      return {
        status: 200,
        data: { ...rest, ingredientes_formateados: this._formatIngredientesText(r.ingredientes), versiones_anteriores: history.length }
      };
    });
  }

  async buscar(params) {
    const { proyecto_id } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.buscar.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'buscar', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      let r = store.recetas.filter(x => x.estado === 'activa');
      if (params.texto) {
        const t = params.texto.toLowerCase();
        r = r.filter(x => x.nombre.toLowerCase().includes(t)
                       || (x.descripcion || '').toLowerCase().includes(t)
                       || x.ingredientes.some(i => (i.nombre || '').toLowerCase().includes(t)));
      }
      if (params.ingrediente) {
        const t = params.ingrediente.toLowerCase();
        r = r.filter(x => x.ingredientes.some(i => (i.nombre || '').toLowerCase().includes(t)));
      }
      if (params.categoria) r = r.filter(x => (x.categorias || []).some(c => c.toLowerCase() === params.categoria.toLowerCase()));
      if (params.etiqueta)   r = r.filter(x => (x.etiquetas   || []).some(e => e.toLowerCase() === params.etiqueta.toLowerCase()));
      if (params.dificultad_max != null) r = r.filter(x => x.dificultad != null && x.dificultad <= params.dificultad_max);
      if (params.dificultad_min != null) r = r.filter(x => x.dificultad != null && x.dificultad >= params.dificultad_min);
      if (params.tiempo_max != null)     r = r.filter(x => x.tiempo_min != null && x.tiempo_min <= params.tiempo_max);
      if (params.porciones != null)      r = r.filter(x => x.porciones === params.porciones);
      const limit = params.limit ?? 50;
      const items = r.slice(0, limit).map(x => ({
        id: x.id, nombre: x.nombre, porciones: x.porciones, tiempo_min: x.tiempo_min,
        dificultad: x.dificultad, categorias: x.categorias, etiquetas: x.etiquetas
      }));
      return { status: 200, data: { total: items.length, recetas: items } };
    });
  }

  async actualizar(params) {
    const { proyecto_id, receta_id, cambios = {} } = params;
    if (!receta_id) {
      this.logger.warn('recetas.actualizar.validation', { field: 'receta_id' });
      this.metrics?.increment('recetas.error', { kind: 'actualizar', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'receta_id requerido');
    }

    return this._withStore(proyecto_id, async (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) {
        this.logger.warn('recetas.actualizar.not_found', { receta_id, proyecto_id });
        this.metrics?.increment('recetas.error', { kind: 'actualizar', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Receta no encontrada', { ref: receta_id });
      }

      const { history: _h, ...snapshot } = r;
      r.history.push({ ...snapshot, _archived_at: Date.now() });

      const aplicados = {};
      const setIf = (k, transform) => {
        if (k in cambios) {
          const v = transform ? transform(cambios[k]) : cambios[k];
          aplicados[k] = { antes: r[k], despues: v };
          r[k] = v;
        }
      };
      setIf('nombre'); setIf('descripcion'); setIf('porciones'); setIf('tiempo_min');
      setIf('dificultad'); setIf('estado'); setIf('notas'); setIf('fuente');
      setIf('ingredientes', this._normalizeIngredientes.bind(this));
      setIf('instrucciones', this._normalizeInstrucciones.bind(this));
      if ('categorias' in cambios) { aplicados.categorias = { antes: r.categorias, despues: cambios.categorias }; r.categorias = cambios.categorias; }
      if ('etiquetas' in cambios)  { aplicados.etiquetas  = { antes: r.etiquetas,  despues: cambios.etiquetas  }; r.etiquetas  = cambios.etiquetas; }

      r.version += 1;
      r.updated_at = Date.now();
      this._calcIncompleta(r);

      await this._publicarEvento('receta.actualizada', { project_id: proyecto_id, id: r.id, nombre: r.nombre, version: r.version }, params);
      this.metrics?.increment('recetas.receta.actualizada', { project_id: proyecto_id });

      return {
        status: 200,
        data: { id: r.id, nombre: r.nombre, version: r.version, cambios_aplicados: aplicados,
                incompleta: r.incompleta, campos_pendientes: r.campos_pendientes }
      };
    });
  }

  async historial(params) {
    const { proyecto_id, receta_id } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.historial.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'historial', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) {
        this.logger.warn('recetas.historial.not_found', { receta_id, proyecto_id });
        this.metrics?.increment('recetas.error', { kind: 'historial', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Receta no encontrada', { ref: receta_id });
      }
      const versiones = r.history.map(h => ({
        version: h.version, archived_at: h._archived_at,
        nombre: h.nombre, porciones: h.porciones, dificultad: h.dificultad,
        ingredientes_count: (h.ingredientes || []).length
      }));
      return {
        status: 200,
        data: {
          receta_id: r.id, nombre: r.nombre, version_actual: r.version,
          versiones_anteriores: versiones.length, historial: versiones
        }
      };
    });
  }

  async revertir(params) {
    const { proyecto_id, receta_id, target_version } = params;
    if (target_version == null) {
      this.logger.warn('recetas.revertir.validation', { field: 'target_version' });
      this.metrics?.increment('recetas.error', { kind: 'revertir', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'target_version requerido');
    }

    return this._withStore(proyecto_id, async (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) {
        this.logger.warn('recetas.revertir.not_found', { receta_id, proyecto_id });
        this.metrics?.increment('recetas.error', { kind: 'revertir', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Receta no encontrada', { ref: receta_id });
      }

      const target = r.history.find(h => h.version === target_version);
      if (!target) {
        this.logger.warn('recetas.revertir.version_not_found', { receta_id, target_version });
        this.metrics?.increment('recetas.error', { kind: 'revertir', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `version ${target_version} no encontrada`, { versiones_disponibles: r.history.map(h => h.version) });
      }

      const { history: _h, ...snapshot } = r;
      r.history.push({ ...snapshot, _archived_at: Date.now() });

      const { _archived_at, version: _v, history: _hh, ...restore } = target;
      Object.assign(r, restore);
      r.version += 1;
      r.updated_at = Date.now();
      this._calcIncompleta(r);

      await this._publicarEvento('receta.actualizada', { project_id: proyecto_id, id: r.id, nombre: r.nombre, version: r.version, motivo: 'revertir' }, params);

      return {
        status: 200,
        data: { id: r.id, nombre: r.nombre, revertida_a_version: target_version, version_actual: r.version }
      };
    });
  }

  async eliminar(params) {
    const { proyecto_id, receta_id } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.eliminar.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'eliminar', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._withStore(proyecto_id, async (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) {
        this.logger.warn('recetas.eliminar.not_found', { receta_id, proyecto_id });
        this.metrics?.increment('recetas.error', { kind: 'eliminar', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Receta no encontrada', { ref: receta_id });
      }
      if (r.estado === 'archivada') {
        return { status: 200, data: { id: r.id, nombre: r.nombre, status: 'ya_estaba_archivada' } };
      }
      r.estado = 'archivada';
      r.updated_at = Date.now();
      await this._publicarEvento('receta.eliminada', { project_id: proyecto_id, id: r.id, nombre: r.nombre }, params);
      this.metrics?.increment('recetas.receta.eliminada', { project_id: proyecto_id });
      return { status: 200, data: { id: r.id, nombre: r.nombre, status: 'archivada' } };
    });
  }

  async estadisticas(params) {
    const { proyecto_id } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.estadisticas.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'estadisticas', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      const por_estado = { activa: 0, archivada: 0, borrador: 0 };
      let incompletas = 0;
      let con_precios = 0;
      const ingredientesUsados = new Set();
      for (const r of store.recetas) {
        por_estado[r.estado] = (por_estado[r.estado] || 0) + 1;
        if (r.incompleta) incompletas += 1;
        for (const i of r.ingredientes || []) ingredientesUsados.add((i.nombre || '').toLowerCase());
      }
      for (const ing of store.ingredientes_catalogo) {
        if (ing.precio_mercado != null) con_precios += 1;
      }
      return {
        status: 200,
        data: {
          total_recetas: store.recetas.length, por_estado, incompletas,
          ingredientes_catalogo: store.ingredientes_catalogo.length,
          ingredientes_con_precio: con_precios,
          ingredientes_usados_unicos: ingredientesUsados.size
        }
      };
    });
  }

  async ingredientes(params) {
    const { proyecto_id } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.ingredientes.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'ingredientes', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      let arr = store.ingredientes_catalogo;
      if (params.categoria) arr = arr.filter(i => (i.categoria || '').toLowerCase() === params.categoria.toLowerCase());
      return { status: 200, data: { total: arr.length, ingredientes: arr } };
    });
  }

  async actualizarPrecio(params) {
    const { proyecto_id, nombre, precio_mercado, unidad, fuente, categoria } = params;
    if (!nombre) {
      this.logger.warn('recetas.actualizar_precio.validation', { field: 'nombre' });
      this.metrics?.increment('recetas.error', { kind: 'actualizar_precio', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'nombre requerido');
    }
    if (precio_mercado == null) {
      this.logger.warn('recetas.actualizar_precio.validation', { field: 'precio_mercado' });
      this.metrics?.increment('recetas.error', { kind: 'actualizar_precio', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'precio_mercado requerido');
    }

    return this._withStore(proyecto_id, async (store) => {
      const nombreLower = nombre.toLowerCase().trim();
      let item = store.ingredientes_catalogo.find(i => (i.nombre || '').toLowerCase() === nombreLower);
      const now = Date.now();
      if (!item) {
        item = { nombre: nombre.trim(), categoria: categoria || null, unidad: unidad || null,
                 precio_mercado, fuente: fuente || 'manual', created_at: now, updated_at: now };
        store.ingredientes_catalogo.push(item);
      } else {
        item.precio_mercado = precio_mercado;
        if (unidad) item.unidad = unidad;
        if (categoria) item.categoria = categoria;
        if (fuente) item.fuente = fuente;
        item.updated_at = now;
      }
      await this._publicarEvento('ingrediente.precio.actualizado', { project_id: proyecto_id, nombre: item.nombre, precio_mercado }, params);
      this.metrics?.increment('recetas.ingrediente.precio.actualizado', { project_id: proyecto_id });
      return { status: 200, data: { nombre: item.nombre, precio_mercado, unidad: item.unidad, status: 'actualizado' } };
    });
  }

  async analizar(params) {
    const { proyecto_id, receta_id } = params;
    if (!proyecto_id) {
      this.logger.warn('recetas.analizar.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'analizar', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) {
        this.logger.warn('recetas.analizar.not_found', { receta_id, proyecto_id });
        this.metrics?.increment('recetas.error', { kind: 'analizar', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Receta no encontrada', { ref: receta_id });
      }
      if (r.incompleta) {
        this.logger.warn('recetas.analizar.incompleta', { receta_id, campos_pendientes: r.campos_pendientes });
        this.metrics?.increment('recetas.error', { kind: 'analizar', code: 'PRECONDITION_FAILED' });
        return this._errorResponse(422, 'PRECONDITION_FAILED', 'Receta incompleta — faltan campos para analizar', { campos_pendientes: r.campos_pendientes });
      }

      const cat = new Map(store.ingredientes_catalogo.map(i => [(i.nombre || '').toLowerCase(), i]));
      let costeTotal = 0;
      let costeReal = true;
      const detalles = (r.ingredientes || []).map(i => {
        const matched = cat.get((i.nombre || '').toLowerCase());
        const precio_mercado = matched?.precio_mercado ?? null;
        if (precio_mercado == null) costeReal = false;
        let coste = null;
        if (precio_mercado != null && i.cantidad != null && (matched.unidad === i.unidad || !matched.unidad)) {
          coste = Number((i.cantidad * precio_mercado).toFixed(4));
          costeTotal += coste;
        }
        return { nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, precio_mercado, coste, en_catalogo: !!matched };
      });
      const costePorPorcion = (r.porciones && r.porciones > 0 && costeReal) ? Number((costeTotal / r.porciones).toFixed(2)) : null;

      return {
        status: 200,
        data: {
          receta_id: r.id, nombre: r.nombre, porciones: r.porciones,
          tiempo_min: r.tiempo_min, dificultad: r.dificultad,
          ingredientes: detalles,
          coste_total: costeReal ? Number(costeTotal.toFixed(2)) : null,
          coste_por_porcion: costePorPorcion,
          coste_es_real: costeReal,
          nota: costeReal ? 'Coste calculado con precios reales del catálogo' : 'Faltan precios en catálogo para algunos ingredientes — coste no calculable'
        }
      };
    });
  }

  async investigarReceta(params) {
    const { proyecto_id, nombre_receta } = params;
    if (!nombre_receta) {
      this.logger.warn('recetas.investigar.validation', { field: 'nombre_receta' });
      this.metrics?.increment('recetas.error', { kind: 'investigar', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'nombre_receta requerido');
    }
    if (!proyecto_id) {
      this.logger.warn('recetas.investigar.validation', { field: 'proyecto_id' });
      this.metrics?.increment('recetas.error', { kind: 'investigar', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'proyecto_id requerido');
    }
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const existing = find(nombre_receta);
      if (existing) {
        return {
          status: 200,
          data: {
            existe_en_proyecto: true,
            receta: { id: existing.id, nombre: existing.nombre, version: existing.version,
                      incompleta: existing.incompleta, ingredientes: existing.ingredientes,
                      porciones: existing.porciones, instrucciones: existing.instrucciones }
          }
        };
      }
      return {
        status: 200,
        data: {
          existe_en_proyecto: false,
          nombre_receta,
          instruccion_para_llm: 'No existe esta receta en el proyecto. Proponla al usuario con ingredientes (cantidad, unidad), instrucciones, porciones, tiempo y dificultad estimados. Cuando el usuario confirme, llama recetas.crear con esos datos.'
        }
      };
    });
  }

  // ============================================================
  // Wrapper de tools — recibe evento, normaliza project_id, llama handler
  // ============================================================

  async _toolDispatch(toolName, event) {
    const data = event.data || event;
    const { request_id, project_id, ...rest } = data;
    const params = { ...rest, proyecto_id: project_id ?? rest.proyecto_id };
    const handlerName = TOOL_HANDLERS[toolName];
    if (!handlerName) {
      this.logger.warn('recetas.tool.unknown', { tool: toolName });
      this.metrics?.increment('recetas.error', { kind: 'dispatch', code: 'INVALID_INPUT' });
      await this.eventBus.publish(`${toolName}.response`, {
        request_id,
        error: { code: 'INVALID_INPUT', message: `unknown tool ${toolName}` }
      });
      return;
    }
    try {
      const result = await this[handlerName](params);
      await this.eventBus.publish(`${toolName}.response`, { request_id, result });
    } catch (err) {
      const code = err._code || this._classifyHandlerError(err);
      this.logger.error('recetas.tool.failed', { tool: toolName, error: err.message, code });
      this.metrics?.increment('recetas.error', { kind: 'dispatch', code });
      await this.eventBus.publish(`${toolName}.response`, {
        request_id,
        error: { code, message: err.message }
      });
    }
  }

  // Handlers expuestos al loader (subscribes en module.json)
  async onToolCrear(e)             { return this._toolDispatch('recetas.crear', e); }
  async onToolListar(e)            { return this._toolDispatch('recetas.listar', e); }
  async onToolObtener(e)           { return this._toolDispatch('recetas.obtener', e); }
  async onToolBuscar(e)            { return this._toolDispatch('recetas.buscar', e); }
  async onToolActualizar(e)        { return this._toolDispatch('recetas.actualizar', e); }
  async onToolHistorial(e)         { return this._toolDispatch('recetas.historial', e); }
  async onToolRevertir(e)          { return this._toolDispatch('recetas.revertir', e); }
  async onToolEliminar(e)          { return this._toolDispatch('recetas.eliminar', e); }
  async onToolEstadisticas(e)      { return this._toolDispatch('recetas.estadisticas', e); }
  async onToolIngredientes(e)      { return this._toolDispatch('recetas.ingredientes', e); }
  async onToolActualizarPrecio(e)  { return this._toolDispatch('recetas.actualizar_precio', e); }
  async onToolAnalizar(e)          { return this._toolDispatch('recetas.analizar', e); }
  async onToolInvestigarReceta(e)  { return this._toolDispatch('recetas.investigar_receta', e); }

  // UI handlers
  async _uiAdapt(handlerName, request) {
    const params = { ...request, proyecto_id: request.project_id ?? request.proyecto_id };
    try {
      return await this[handlerName](params);
    } catch (err) {
      return this._handleHandlerError(`ui.${handlerName}`, err, 'ui');
    }
  }

  async handleCrear(req)            { return this._uiAdapt('crear', req); }
  async handleListar(req)           { return this._uiAdapt('listar', req); }
  async handleObtener(req)          { return this._uiAdapt('obtener', req); }
  async handleBuscar(req)           { return this._uiAdapt('buscar', req); }
  async handleActualizar(req)       { return this._uiAdapt('actualizar', req); }
  async handleHistorial(req)        { return this._uiAdapt('historial', req); }
  async handleRevertir(req)         { return this._uiAdapt('revertir', req); }
  async handleEliminar(req)         { return this._uiAdapt('eliminar', req); }
  async handleEstadisticas(req)     { return this._uiAdapt('estadisticas', req); }
  async handleIngredientes(req)     { return this._uiAdapt('ingredientes', req); }
  async handleActualizarPrecio(req) { return this._uiAdapt('actualizarPrecio', req); }
  async handleAnalizar(req)         { return this._uiAdapt('analizar', req); }
  async handleInvestigarReceta(req) { return this._uiAdapt('investigarReceta', req); }
}

module.exports = RecetasModule;
