/**
 * Modulo `tecnicas` v1.0.0
 *
 * Libreria de tecnicas culinarias codificadas del proyecto. Cada tecnica es
 * referenciable por id desde recetas y prototipos. Modulo del subsistema-recetario.
 *
 * Cumple los 24 contratos transversales:
 *   - Emite eventos canonicos del bus, no llama directamente a otros modulos.
 *   - Toda respuesta sigue { status, data | error: { code, message, details? } }.
 *   - Cada error genera log + metric automaticos (helpers POC2).
 *   - Stack jamas en respuesta — solo en logs.
 *   - Persistencia json-per-project via fs.read.request / fs.write.request.
 *   - project_id obligatorio (multi-tenancy.contract).
 *   - correlation_id propagado en todos los publishes via _publicarEvento.
 *
 * Payloads canonicos: ver arquitectura/decisiones/_schemas/subsistema-recetario/.
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';
const ENTITY_TYPE        = 'culinary-technique';

class TecnicasModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'tecnicas';
    this.version = '1.0.0';

    this.config = {
      data_file_pattern:        'data/projects/{slug}/tecnicas.json',
      max_nombre_length:        100,
      max_categoria_length:     50,
      max_instrucciones_length: 5000,
      max_material_length:      100,
      project_get_timeout_ms:   5000,
      fs_request_timeout_ms:    5000
    };

    // Estado interno (init en constructor; reset en onUnload)
    this.projectBasePaths = new Map();  // project_id -> base_path
    this.pendingProject   = new Map();  // request_id -> { resolve, reject, timer }
    this.pendingFs        = new Map();  // request_id -> { resolve, reject, timer }
    this.writeQueues      = new Map();  // project_id -> Promise (serializa escrituras)
  }

  // ============================================================
  // Lifecycle (canonical signatures)
  // ============================================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    if (core.config?.[this.name]) {
      this.config = { ...this.config, ...core.config[this.name] };
    }

    this.logger.info('tecnicas.loaded', {
      module:  this.name,
      version: this.version,
      storage: 'json-per-project'
    });
  }

  async onUnload() {
    for (const { timer } of this.pendingProject.values()) clearTimeout(timer);
    for (const { timer } of this.pendingFs.values())      clearTimeout(timer);

    this.pendingProject.clear();
    this.pendingFs.clear();
    this.writeQueues.clear();
    this.projectBasePaths.clear();

    this.logger?.info('tecnicas.unloaded', { module: this.name });
  }

  // ============================================================
  // Bus subscribers (lifecycle de project + fs responses)
  // ============================================================

  onProjectActivated(event) {
    const data = event?.data || event || {};
    const id = data.project_id || data.id;
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) {
      this.projectBasePaths.set(id, basePath);
      this.logger?.debug('tecnicas.project.cached', { project_id: id, base_path: basePath });
    }
  }

  onProjectGetResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingProject.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingProject.delete(request_id);

    if (data.error) {
      pending.reject(Object.assign(new Error(data.error.message || 'project.get.failed'), { _code: data.error.code || 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    const basePath = data.base_path || data.project?.base_path;
    if (!basePath) {
      pending.reject(Object.assign(new Error('project.get response sin base_path'), { _code: 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    pending.resolve(basePath);
  }

  onFsReadResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingFs.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingFs.delete(request_id);

    if (data.error) {
      if (data.error.code === 'RESOURCE_NOT_FOUND' || data.error.kind === 'enoent') {
        pending.resolve(null);  // archivo no existe → store vacio
        return;
      }
      pending.reject(Object.assign(new Error(data.error.message || 'fs.read.failed'), { _code: data.error.code || 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    pending.resolve(data.content ?? null);
  }

  onFsWriteResponse(event) {
    const data = event?.data || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this.pendingFs.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingFs.delete(request_id);

    if (data.error) {
      pending.reject(Object.assign(new Error(data.error.message || 'fs.write.failed'), { _code: data.error.code || 'UPSTREAM_INVALID_RESPONSE' }));
      return;
    }
    pending.resolve(true);
  }

  // ============================================================
  // Tools (invocadas por bus desde ai-gateway u otros modulos)
  // Forma de respuesta canonica: { status, data | error: { code, message, details? } }
  // ============================================================

  async onCodificar(params = {}) {
    const start = Date.now();
    const { project_id } = params;

    if (!project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    }

    const errores = this._validarCodificar(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ahora = new Date().toISOString();
        const tecnica = {
          id:            this._generarId(),
          nombre:        params.nombre.trim(),
          categoria:     params.categoria.trim(),
          parametros:    params.parametros && typeof params.parametros === 'object' ? { ...params.parametros } : {},
          instrucciones: typeof params.instrucciones === 'string' ? params.instrucciones : '',
          materiales:    Array.isArray(params.materiales) ? params.materiales.map(m => String(m)) : [],
          version:       1,
          created_at:    ahora,
          updated_at:    null
        };

        store.tecnicas.push(tecnica);

        await this._publicarEvento('tecnica.creada', {
          project_id,
          user_id:    params.user_id || DEFAULT_USER_ID,
          tecnica_id: tecnica.id,
          nombre:     tecnica.nombre,
          categoria:  tecnica.categoria
        }, params);

        this.metrics?.increment(`${this.name}.codificar.total`, 1, { project_id });
        this.metrics?.timing(`${this.name}.codificar.duration`, Date.now() - start);
        this.metrics?.gauge(`${this.name}.activas.count`, store.tecnicas.length, { project_id });

        return {
          status: 201,
          data: {
            tecnica_id: tecnica.id,
            nombre:     tecnica.nombre,
            categoria:  tecnica.categoria,
            version:    tecnica.version
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('tecnicas.codificar', err, 'tool');
    }
  }

  async onListar(params = {}) {
    const { project_id, categoria } = params;
    if (!project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    }
    try {
      return await this._withStore(project_id, async (store) => {
        let tecnicas = store.tecnicas;
        if (categoria) tecnicas = tecnicas.filter(t => t.categoria === categoria);
        return {
          status: 200,
          data: {
            tecnicas: tecnicas.map(t => ({
              id:        t.id,
              nombre:    t.nombre,
              categoria: t.categoria,
              version:   t.version
            })),
            total: tecnicas.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('tecnicas.listar', err, 'tool');
    }
  }

  async onObtener(params = {}) {
    const { project_id, tecnica_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!tecnica_id) return this._errorResponse(400, 'INVALID_INPUT', 'tecnica_id es obligatorio', { field: 'tecnica_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const t = store.tecnicas.find(x => x.id === tecnica_id);
        if (!t) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Tecnica con id ${tecnica_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: tecnica_id });
        }
        return { status: 200, data: t };
      });
    } catch (err) {
      return this._handleHandlerError('tecnicas.obtener', err, 'tool');
    }
  }

  async onActualizar(params = {}) {
    const start = Date.now();
    const { project_id, tecnica_id, cambios } = params;

    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!tecnica_id) return this._errorResponse(400, 'INVALID_INPUT', 'tecnica_id es obligatorio', { field: 'tecnica_id' });
    if (!cambios || typeof cambios !== 'object') {
      return this._errorResponse(400, 'INVALID_INPUT', 'cambios debe ser un objeto', { field: 'cambios' });
    }

    const errores = this._validarActualizar(cambios);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const idx = store.tecnicas.findIndex(x => x.id === tecnica_id);
        if (idx === -1) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Tecnica con id ${tecnica_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: tecnica_id });
        }

        const t = store.tecnicas[idx];
        const aplicados = [];

        if ('nombre'        in cambios) { t.nombre        = cambios.nombre.trim();    aplicados.push('nombre'); }
        if ('categoria'     in cambios) { t.categoria     = cambios.categoria.trim(); aplicados.push('categoria'); }
        if ('parametros'    in cambios) { t.parametros    = { ...cambios.parametros }; aplicados.push('parametros'); }
        if ('instrucciones' in cambios) { t.instrucciones = cambios.instrucciones;    aplicados.push('instrucciones'); }
        if ('materiales'    in cambios) { t.materiales    = Array.isArray(cambios.materiales) ? cambios.materiales.map(m => String(m)) : []; aplicados.push('materiales'); }

        if (aplicados.length === 0) {
          return this._errorResponse(400, 'INVALID_INPUT', 'cambios no incluye ningun campo conocido', { field: 'cambios', allowed: ['nombre', 'categoria', 'parametros', 'instrucciones', 'materiales'] });
        }

        t.version    = (t.version || 1) + 1;
        t.updated_at = new Date().toISOString();

        await this._publicarEvento('tecnica.actualizada', {
          project_id,
          user_id:               params.user_id || DEFAULT_USER_ID,
          tecnica_id:            t.id,
          nombre:                t.nombre,
          campos_actualizados:   aplicados
        }, params);

        this.metrics?.increment(`${this.name}.actualizar.total`, 1, { project_id });
        this.metrics?.timing(`${this.name}.actualizar.duration`, Date.now() - start);

        return {
          status: 200,
          data: {
            tecnica_id:           t.id,
            nombre:               t.nombre,
            version:              t.version,
            campos_actualizados:  aplicados
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('tecnicas.actualizar', err, 'tool');
    }
  }

  async onParametros(params = {}) {
    const { project_id, tecnica_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!tecnica_id) return this._errorResponse(400, 'INVALID_INPUT', 'tecnica_id es obligatorio', { field: 'tecnica_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const t = store.tecnicas.find(x => x.id === tecnica_id);
        if (!t) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Tecnica con id ${tecnica_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: tecnica_id });
        }
        return {
          status: 200,
          data: {
            tecnica_id: t.id,
            nombre:     t.nombre,
            parametros: t.parametros || {}
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('tecnicas.parametros', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — _errorResponse, _classifyHandlerError, _handleHandlerError,
  // _statusFromCode, _enrich vienen de BaseModule. Solo override _publicarEvento
  // para enriquecer con project_id + user_id del subsistema-recetario.
  // ============================================================

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) {
      this.logger?.warn(`${this.name}.publish.bus_no_disponible`, { event: name });
      return;
    }

    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID,
      user_id:        payload?.user_id    || sourcePayload?.user_id    || DEFAULT_USER_ID,
      timestamp:      new Date().toISOString(),
      ...payload
    };

    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.error(`${this.name}.publish_error`, {
        event:         name,
        error_message: err.message,
        stack:         err.stack
      });
      this.metrics?.increment(`${this.name}.publish_error`, 1, { event: name });
    }
  }

  // ============================================================
  // Dominio protegido — validaciones + id
  // ============================================================

  _validarCodificar(data) {
    const errores = [];
    const { nombre, categoria, instrucciones, materiales, parametros } = data;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'nombre es obligatorio', details: { field: 'nombre' } });
    } else if (nombre.length > this.config.max_nombre_length) {
      errores.push({ code: 'INVALID_INPUT', message: `nombre excede ${this.config.max_nombre_length} caracteres`, details: { field: 'nombre', max: this.config.max_nombre_length } });
    }

    if (!categoria || typeof categoria !== 'string' || categoria.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'categoria es obligatoria', details: { field: 'categoria' } });
    } else if (categoria.length > this.config.max_categoria_length) {
      errores.push({ code: 'INVALID_INPUT', message: `categoria excede ${this.config.max_categoria_length} caracteres`, details: { field: 'categoria', max: this.config.max_categoria_length } });
    }

    if (instrucciones !== undefined) {
      if (typeof instrucciones !== 'string') {
        errores.push({ code: 'INVALID_INPUT', message: 'instrucciones debe ser string', details: { field: 'instrucciones' } });
      } else if (instrucciones.length > this.config.max_instrucciones_length) {
        errores.push({ code: 'INVALID_INPUT', message: `instrucciones excede ${this.config.max_instrucciones_length} caracteres`, details: { field: 'instrucciones', max: this.config.max_instrucciones_length } });
      }
    }

    if (materiales !== undefined) {
      if (!Array.isArray(materiales)) {
        errores.push({ code: 'INVALID_INPUT', message: 'materiales debe ser array', details: { field: 'materiales' } });
      } else {
        for (let i = 0; i < materiales.length; i++) {
          const m = materiales[i];
          if (typeof m !== 'string') {
            errores.push({ code: 'INVALID_INPUT', message: `materiales[${i}] debe ser string`, details: { field: 'materiales', index: i } });
            break;
          }
          if (m.length > this.config.max_material_length) {
            errores.push({ code: 'INVALID_INPUT', message: `materiales[${i}] excede ${this.config.max_material_length} caracteres`, details: { field: 'materiales', index: i, max: this.config.max_material_length } });
            break;
          }
        }
      }
    }

    if (parametros !== undefined && (parametros === null || typeof parametros !== 'object' || Array.isArray(parametros))) {
      errores.push({ code: 'INVALID_INPUT', message: 'parametros debe ser objeto', details: { field: 'parametros' } });
    }

    return errores;
  }

  _validarActualizar(cambios) {
    const errores = [];
    const { nombre, categoria, instrucciones, materiales, parametros } = cambios;

    if (nombre !== undefined) {
      if (typeof nombre !== 'string' || nombre.trim() === '') {
        errores.push({ code: 'INVALID_INPUT', message: 'nombre no puede estar vacio', details: { field: 'nombre' } });
      } else if (nombre.length > this.config.max_nombre_length) {
        errores.push({ code: 'INVALID_INPUT', message: `nombre excede ${this.config.max_nombre_length} caracteres`, details: { field: 'nombre', max: this.config.max_nombre_length } });
      }
    }

    if (categoria !== undefined) {
      if (typeof categoria !== 'string' || categoria.trim() === '') {
        errores.push({ code: 'INVALID_INPUT', message: 'categoria no puede estar vacia', details: { field: 'categoria' } });
      } else if (categoria.length > this.config.max_categoria_length) {
        errores.push({ code: 'INVALID_INPUT', message: `categoria excede ${this.config.max_categoria_length} caracteres`, details: { field: 'categoria', max: this.config.max_categoria_length } });
      }
    }

    if (instrucciones !== undefined && typeof instrucciones === 'string' && instrucciones.length > this.config.max_instrucciones_length) {
      errores.push({ code: 'INVALID_INPUT', message: `instrucciones excede ${this.config.max_instrucciones_length} caracteres`, details: { field: 'instrucciones', max: this.config.max_instrucciones_length } });
    }
    if (instrucciones !== undefined && typeof instrucciones !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'instrucciones debe ser string', details: { field: 'instrucciones' } });
    }

    if (materiales !== undefined) {
      if (!Array.isArray(materiales)) {
        errores.push({ code: 'INVALID_INPUT', message: 'materiales debe ser array', details: { field: 'materiales' } });
      } else {
        for (let i = 0; i < materiales.length; i++) {
          if (typeof materiales[i] !== 'string') {
            errores.push({ code: 'INVALID_INPUT', message: `materiales[${i}] debe ser string`, details: { field: 'materiales', index: i } });
            break;
          }
          if (materiales[i].length > this.config.max_material_length) {
            errores.push({ code: 'INVALID_INPUT', message: `materiales[${i}] excede ${this.config.max_material_length} caracteres`, details: { field: 'materiales', index: i, max: this.config.max_material_length } });
            break;
          }
        }
      }
    }

    if (parametros !== undefined && (parametros === null || typeof parametros !== 'object' || Array.isArray(parametros))) {
      errores.push({ code: 'INVALID_INPUT', message: 'parametros debe ser objeto', details: { field: 'parametros' } });
    }

    return errores;
  }

  _generarId() {
    return `tec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  // ============================================================
  // Persistencia json-per-project (patron canonico del subsistema)
  // ============================================================

  async _basePathForProject(project_id) {
    if (!project_id) {
      const err = new Error('project_id requerido');
      err._code = 'INVALID_INPUT';
      throw err;
    }
    if (this.projectBasePaths.has(project_id)) return this.projectBasePaths.get(project_id);

    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para project.get.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }

    const request_id = crypto.randomUUID();
    const basePath = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProject.delete(request_id);
        const err = new Error(`project.get timeout para ${project_id}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.project_get_timeout_ms);
      this.pendingProject.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('project.get.request', { request_id, project_id }).catch(err => {
        clearTimeout(timer);
        this.pendingProject.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });

    this.projectBasePaths.set(project_id, basePath);
    return basePath;
  }

  async _loadStore(basePath) {
    const fileRelPath = this.config.data_file_pattern.replace('{slug}', '');
    // base_path ya apunta a data/projects/<slug>/; concatenamos el nombre del archivo
    const absPath = `${basePath}/tecnicas.json`.replace(/\/+/g, '/');
    const content = await this._readFile(absPath);
    if (!content) {
      return { _version: this.version, _updated: null, tecnicas: [] };
    }
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.tecnicas)) parsed.tecnicas = [];
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { abs_path: absPath, error_message: err.message });
      return { _version: this.version, _updated: null, tecnicas: [] };
    }
  }

  async _saveStore(basePath, store) {
    const absPath = `${basePath}/tecnicas.json`.replace(/\/+/g, '/');
    store._version = this.version;
    store._updated = new Date().toISOString();
    await this._writeFile(absPath, JSON.stringify(store, null, 2));
  }

  async _withStore(project_id, mutator) {
    const basePath = await this._basePathForProject(project_id);

    const prev = this.writeQueues.get(project_id) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const store  = await this._loadStore(basePath);
        const result = await mutator(store);
        if (!result || result.status === undefined || result.status < 400) {
          await this._saveStore(basePath, store);
        }
        return result;
      });

    this.writeQueues.set(project_id, next);
    try {
      return await next;
    } finally {
      if (this.writeQueues.get(project_id) === next) this.writeQueues.delete(project_id);
    }
  }

  async _readFile(absPath) {
    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para fs.read.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.read timeout para ${absPath}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.fs_request_timeout_ms);
      this.pendingFs.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('fs.read.request', { request_id, path: absPath, encoding: 'utf8' }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });
  }

  async _writeFile(absPath, content) {
    if (!this.eventBus?.publish) {
      const err = new Error('eventBus no disponible para fs.write.request');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        const err = new Error(`fs.write timeout para ${absPath}`);
        err._code = 'UPSTREAM_TIMEOUT';
        reject(err);
      }, this.config.fs_request_timeout_ms);
      this.pendingFs.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('fs.write.request', { request_id, path: absPath, content, encoding: 'utf8', atomic: true }).catch(err => {
        clearTimeout(timer);
        this.pendingFs.delete(request_id);
        err._code = err._code || 'UPSTREAM_UNREACHABLE';
        reject(err);
      });
    });
  }
}

module.exports = TecnicasModule;
