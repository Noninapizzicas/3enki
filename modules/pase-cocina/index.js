/**
 * Modulo `pase-cocina` v1.0.0
 *
 * Cara-al-servicio. Materializa fichas de pase (snapshot operativo de receta
 * para el servicio en curso), registra incidencias del servicio, registra
 * sustituciones de emergencia. NO toma decisiones reactivas — solo registra.
 *
 * Cumple los 24 contratos transversales:
 *   - extends BaseModule.
 *   - Override _publicarEvento para anadir project_id + user_id canonicos.
 *   - Toda respuesta { status, data | error: { code, message, details? } }.
 *   - Persistencia json-per-project via bus.
 *   - Sin acceso cross-modulo: caller pasa receta_id + version_receta + nombre.
 *
 * Payloads canonicos: ver arquitectura/decisiones/_schemas/subsistema-recetario/.
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';
const ENTITY_TYPE        = 'pass-card';

const VALID_INCIDENCIA_TIPOS = new Set([
  'rotura_genero',
  'rotura_equipamiento',
  'queja_cliente',
  'falta_ingrediente',
  'error_coccion',
  'tiempo_excedido',
  'alergia_no_declarada',
  'otro'
]);
const VALID_SEVERIDADES = new Set(['baja', 'media', 'alta', 'critica']);
const VALID_ESTADOS     = new Set(['activa', 'cerrada']);

class PaseCocinaModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'pase-cocina';
    this.version = '1.0.0';

    this.config = {
      data_file_pattern:         'data/projects/{slug}/pase-cocina.json',
      max_nombre_length:         200,
      max_servicio_length:       100,
      max_descripcion_length:    1000,
      max_motivo_length:         500,
      max_ingrediente_length:    100,
      project_get_timeout_ms:    5000,
      fs_request_timeout_ms:     5000
    };

    this.projectBasePaths = new Map();
    this.pendingProject   = new Map();
    this.pendingFs        = new Map();
    this.writeQueues      = new Map();
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    if (core.config?.[this.name]) {
      this.config = { ...this.config, ...core.config[this.name] };
    }

    this.logger.info('pase-cocina.loaded', {
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

    this.logger?.info('pase-cocina.unloaded', { module: this.name });
  }

  // ============================================================
  // Bus subscribers (lifecycle + fs responses)
  // ============================================================

  onProjectActivated(event) {
    const data = event?.data || event || {};
    const id = data.project_id || data.id;
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) {
      this.projectBasePaths.set(id, basePath);
      this.logger?.debug('pase-cocina.project.cached', { project_id: id, base_path: basePath });
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
        pending.resolve(null);
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
  // Tools (invocadas por bus)
  // ============================================================

  async onCrearFicha(params = {}) {
    const { project_id } = params;
    if (!project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    }

    const errores = this._validarCrearFicha(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ahora = new Date().toISOString();
        const ficha = {
          id:              this._generarId('ficha'),
          receta_id:       params.receta_id,
          version_receta:  params.version_receta,
          nombre:          params.nombre.trim(),
          servicio:        params.servicio.trim(),
          estado:          'activa',
          incidencias:    [],
          sustituciones:  [],
          created_at:      ahora,
          closed_at:       null
        };

        store.fichas.push(ficha);

        const payload = {
          project_id,
          user_id:        params.user_id || DEFAULT_USER_ID,
          ficha_pase_id:  ficha.id,
          receta_id:      ficha.receta_id,
          version_receta: ficha.version_receta,
          nombre:         ficha.nombre,
          servicio:       ficha.servicio
        };

        await this._publicarEvento('pase.ficha.creada', payload, params);

        const activas = store.fichas.filter(f => f.estado === 'activa').length;
        this.metrics?.increment(`${this.name}.ficha.creada.total`, 1, { project_id });
        this.metrics?.gauge(`${this.name}.fichas.activas.count`, activas, { project_id });

        return {
          status: 201,
          data: {
            ficha_pase_id: ficha.id,
            receta_id:     ficha.receta_id,
            servicio:      ficha.servicio,
            estado:        ficha.estado
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('pase-cocina.crear_ficha', err, 'tool');
    }
  }

  async onRegistrarIncidencia(params = {}) {
    const { project_id, ficha_pase_id } = params;
    if (!project_id)    return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',    { field: 'project_id' });
    if (!ficha_pase_id) return this._errorResponse(400, 'INVALID_INPUT', 'ficha_pase_id es obligatorio', { field: 'ficha_pase_id' });

    const errores = this._validarIncidencia(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ficha = store.fichas.find(f => f.id === ficha_pase_id);
        if (!ficha) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Ficha de pase con id ${ficha_pase_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: ficha_pase_id });
        }

        const ahora = new Date().toISOString();
        const incidencia = {
          id:           this._generarId('inc'),
          tipo:         params.tipo,
          descripcion:  params.descripcion.trim(),
          severidad:    VALID_SEVERIDADES.has(params.severidad) ? params.severidad : 'media',
          timestamp:    ahora
        };
        ficha.incidencias.push(incidencia);

        const payload = {
          project_id,
          user_id:        params.user_id || DEFAULT_USER_ID,
          incidencia_id:  incidencia.id,
          tipo:           incidencia.tipo,
          ficha_pase_id:  ficha.id,
          descripcion:    incidencia.descripcion,
          severidad:      incidencia.severidad
        };

        await this._publicarEvento('pase.incidencia.registrada', payload, params);

        this.metrics?.increment(`${this.name}.incidencia.registrada.total`, 1, { project_id, tipo: incidencia.tipo, severidad: incidencia.severidad });

        return {
          status: 201,
          data: {
            incidencia_id:        incidencia.id,
            ficha_pase_id:        ficha.id,
            total_incidencias:    ficha.incidencias.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('pase-cocina.registrar_incidencia', err, 'tool');
    }
  }

  async onRegistrarSustitucion(params = {}) {
    const { project_id, ficha_pase_id } = params;
    if (!project_id)    return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',    { field: 'project_id' });
    if (!ficha_pase_id) return this._errorResponse(400, 'INVALID_INPUT', 'ficha_pase_id es obligatorio', { field: 'ficha_pase_id' });

    const errores = this._validarSustitucion(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ficha = store.fichas.find(f => f.id === ficha_pase_id);
        if (!ficha) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Ficha de pase con id ${ficha_pase_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: ficha_pase_id });
        }

        const ahora = new Date().toISOString();
        const sustitucion = {
          id:                    this._generarId('sust'),
          ingrediente_original:  params.ingrediente_original.trim(),
          ingrediente_sustituto: params.ingrediente_sustituto.trim(),
          motivo:                params.motivo.trim(),
          timestamp:             ahora
        };
        if (typeof params.cantidad === 'number') sustitucion.cantidad = params.cantidad;
        if (typeof params.unidad === 'string')   sustitucion.unidad   = params.unidad;

        ficha.sustituciones.push(sustitucion);

        const payload = {
          project_id,
          user_id:                params.user_id || DEFAULT_USER_ID,
          ficha_pase_id:          ficha.id,
          ingrediente_original:   sustitucion.ingrediente_original,
          ingrediente_sustituto:  sustitucion.ingrediente_sustituto,
          motivo:                 sustitucion.motivo
        };
        if (sustitucion.cantidad !== undefined) payload.cantidad = sustitucion.cantidad;
        if (sustitucion.unidad   !== undefined) payload.unidad   = sustitucion.unidad;

        await this._publicarEvento('pase.sustitucion.registrada', payload, params);

        this.metrics?.increment(`${this.name}.sustitucion.registrada.total`, 1, { project_id });

        return {
          status: 201,
          data: {
            ficha_pase_id:        ficha.id,
            total_sustituciones:  ficha.sustituciones.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('pase-cocina.registrar_sustitucion', err, 'tool');
    }
  }

  async onObtenerFicha(params = {}) {
    const { project_id, ficha_pase_id } = params;
    if (!project_id)    return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',    { field: 'project_id' });
    if (!ficha_pase_id) return this._errorResponse(400, 'INVALID_INPUT', 'ficha_pase_id es obligatorio', { field: 'ficha_pase_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const ficha = store.fichas.find(f => f.id === ficha_pase_id);
        if (!ficha) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Ficha de pase con id ${ficha_pase_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: ficha_pase_id });
        }
        return { status: 200, data: ficha };
      });
    } catch (err) {
      return this._handleHandlerError('pase-cocina.obtener_ficha', err, 'tool');
    }
  }

  async onListarFichas(params = {}) {
    const { project_id, servicio, estado } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    if (estado !== undefined && !VALID_ESTADOS.has(estado)) {
      return this._errorResponse(400, 'INVALID_INPUT', `estado debe ser uno de: ${Array.from(VALID_ESTADOS).join(', ')}`, { field: 'estado', allowed: Array.from(VALID_ESTADOS) });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        let fichas = store.fichas;
        if (servicio) fichas = fichas.filter(f => f.servicio === servicio);
        if (estado)   fichas = fichas.filter(f => f.estado === estado);
        return {
          status: 200,
          data: {
            fichas: fichas.map(f => ({
              id:                  f.id,
              receta_id:           f.receta_id,
              version_receta:      f.version_receta,
              nombre:              f.nombre,
              servicio:            f.servicio,
              estado:              f.estado,
              total_incidencias:   f.incidencias.length,
              total_sustituciones: f.sustituciones.length
            })),
            total: fichas.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('pase-cocina.listar_fichas', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — _errorResponse, _classifyHandlerError, _handleHandlerError,
  // _statusFromCode, _enrich vienen de BaseModule. Override _publicarEvento.
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

  _validarCrearFicha(data) {
    const errores = [];
    const { receta_id, version_receta, nombre, servicio } = data;

    if (!receta_id || typeof receta_id !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'receta_id es obligatorio', details: { field: 'receta_id' } });
    }
    if (!Number.isInteger(version_receta) || version_receta < 1) {
      errores.push({ code: 'INVALID_INPUT', message: 'version_receta debe ser entero >= 1', details: { field: 'version_receta' } });
    }
    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'nombre es obligatorio', details: { field: 'nombre' } });
    } else if (nombre.length > this.config.max_nombre_length) {
      errores.push({ code: 'INVALID_INPUT', message: `nombre excede ${this.config.max_nombre_length} caracteres`, details: { field: 'nombre', max: this.config.max_nombre_length } });
    }
    if (!servicio || typeof servicio !== 'string' || servicio.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'servicio es obligatorio', details: { field: 'servicio' } });
    } else if (servicio.length > this.config.max_servicio_length) {
      errores.push({ code: 'INVALID_INPUT', message: `servicio excede ${this.config.max_servicio_length} caracteres`, details: { field: 'servicio', max: this.config.max_servicio_length } });
    }

    return errores;
  }

  _validarIncidencia(data) {
    const errores = [];
    const { tipo, descripcion, severidad } = data;

    if (!tipo || !VALID_INCIDENCIA_TIPOS.has(tipo)) {
      errores.push({ code: 'INVALID_INPUT', message: `tipo debe ser uno de: ${Array.from(VALID_INCIDENCIA_TIPOS).join(', ')}`, details: { field: 'tipo', allowed: Array.from(VALID_INCIDENCIA_TIPOS) } });
    }
    if (!descripcion || typeof descripcion !== 'string' || descripcion.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'descripcion es obligatoria', details: { field: 'descripcion' } });
    } else if (descripcion.length > this.config.max_descripcion_length) {
      errores.push({ code: 'INVALID_INPUT', message: `descripcion excede ${this.config.max_descripcion_length} caracteres`, details: { field: 'descripcion', max: this.config.max_descripcion_length } });
    }
    if (severidad !== undefined && !VALID_SEVERIDADES.has(severidad)) {
      errores.push({ code: 'INVALID_INPUT', message: `severidad debe ser una de: ${Array.from(VALID_SEVERIDADES).join(', ')}`, details: { field: 'severidad', allowed: Array.from(VALID_SEVERIDADES) } });
    }

    return errores;
  }

  _validarSustitucion(data) {
    const errores = [];
    const { ingrediente_original, ingrediente_sustituto, motivo, cantidad } = data;

    for (const [k, v] of [['ingrediente_original', ingrediente_original], ['ingrediente_sustituto', ingrediente_sustituto]]) {
      if (!v || typeof v !== 'string' || v.trim() === '') {
        errores.push({ code: 'INVALID_INPUT', message: `${k} es obligatorio`, details: { field: k } });
      } else if (v.length > this.config.max_ingrediente_length) {
        errores.push({ code: 'INVALID_INPUT', message: `${k} excede ${this.config.max_ingrediente_length} caracteres`, details: { field: k, max: this.config.max_ingrediente_length } });
      }
    }

    if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'motivo es obligatorio', details: { field: 'motivo' } });
    } else if (motivo.length > this.config.max_motivo_length) {
      errores.push({ code: 'INVALID_INPUT', message: `motivo excede ${this.config.max_motivo_length} caracteres`, details: { field: 'motivo', max: this.config.max_motivo_length } });
    }

    if (cantidad !== undefined && (typeof cantidad !== 'number' || cantidad < 0 || Number.isNaN(cantidad))) {
      errores.push({ code: 'INVALID_INPUT', message: 'cantidad debe ser number >= 0', details: { field: 'cantidad' } });
    }

    return errores;
  }

  _generarId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  // ============================================================
  // Persistencia json-per-project
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
    const absPath = `${basePath}/pase-cocina.json`.replace(/\/+/g, '/');
    const content = await this._readFile(absPath);
    if (!content) return this._emptyStore();
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.fichas)) parsed.fichas = [];
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { abs_path: absPath, error_message: err.message });
      return this._emptyStore();
    }
  }

  async _saveStore(basePath, store) {
    const absPath = `${basePath}/pase-cocina.json`.replace(/\/+/g, '/');
    store._version = this.version;
    store._updated = new Date().toISOString();
    await this._writeFile(absPath, JSON.stringify(store, null, 2));
  }

  _emptyStore() {
    return { _version: this.version, _updated: null, fichas: [] };
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

module.exports = PaseCocinaModule;
