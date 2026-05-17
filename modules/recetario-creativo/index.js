/**
 * Modulo `recetario-creativo` v1.0.0
 *
 * Soporte al proceso creativo del chef: prototipos (que aun no son recetas),
 * iteraciones anotadas, manifiesto creativo del proyecto, scoring de alineacion
 * determinista (sin LLM).
 *
 * Cumple los 24 contratos transversales:
 *   - extends BaseModule (helpers POC2 heredados).
 *   - Override _publicarEvento para anadir project_id + user_id canonicos.
 *   - Toda respuesta { status, data | error: { code, message, details? } }.
 *   - Persistencia json-per-project via fs.read.request / fs.write.request.
 *   - Sin acceso directo a otros modulos (no recetas.obtener; el caller pasa los datos).
 *
 * Payloads canonicos: ver arquitectura/decisiones/_schemas/subsistema-recetario/.
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';
const ENTITY_TYPE        = 'recipe-prototype';

const VALID_ITERACION_RESULTADOS = new Set(['aceptada', 'rechazada', 'indeterminada']);
const VALID_OBJETO_TIPOS         = new Set(['prototipo', 'receta']);

class RecetarioCreativoModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'recetario-creativo';
    this.version = '1.0.0';

    this.config = {
      data_file_pattern:            'data/projects/{slug}/recetario-creativo.json',
      max_nombre_length:            100,
      max_descripcion_length:       1000,
      max_anotacion_length:         1000,
      max_tag_length:               50,
      max_tradicion_length:         200,
      max_notas_libres_length:      2000,
      project_get_timeout_ms:       5000,
      fs_request_timeout_ms:        5000,
      alineacion_valor_bonus:       10,
      alineacion_prohibido_penalty: 25,
      alineacion_score_base:        50
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

    this.logger.info('recetario-creativo.loaded', {
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

    this.logger?.info('recetario-creativo.unloaded', { module: this.name });
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
      this.logger?.debug('recetario-creativo.project.cached', { project_id: id, base_path: basePath });
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

  async onCrearPrototipo(params = {}) {
    const { project_id } = params;
    if (!project_id) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    }

    const errores = this._validarCrearPrototipo(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ahora = new Date().toISOString();
        const prototipo = {
          id:                this._generarId('proto'),
          nombre:            params.nombre.trim(),
          tags_creativos:    Array.isArray(params.tags_creativos) ? params.tags_creativos.map(t => String(t)) : [],
          descripcion:       typeof params.descripcion === 'string' ? params.descripcion : '',
          receta_id_origen:  typeof params.receta_id_origen === 'string' ? params.receta_id_origen : null,
          estado:            'en_desarrollo',
          iteraciones:       [],
          version:           1,
          created_at:        ahora,
          updated_at:        null
        };

        store.prototipos.push(prototipo);

        const payload = {
          project_id,
          user_id:      params.user_id || DEFAULT_USER_ID,
          prototipo_id: prototipo.id,
          nombre:       prototipo.nombre
        };
        if (prototipo.tags_creativos.length > 0) payload.tags_creativos = prototipo.tags_creativos;
        if (prototipo.receta_id_origen)          payload.receta_id_origen = prototipo.receta_id_origen;

        await this._publicarEvento('creativo.prototipo.creado', payload, params);

        this.metrics?.increment(`${this.name}.prototipo.creado.total`, 1, { project_id });
        this.metrics?.gauge(`${this.name}.prototipos.count`, store.prototipos.length, { project_id });

        return {
          status: 201,
          data: {
            prototipo_id: prototipo.id,
            nombre:       prototipo.nombre,
            version:      prototipo.version
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetario-creativo.crear_prototipo', err, 'tool');
    }
  }

  async onIterar(params = {}) {
    const { project_id, prototipo_id } = params;
    if (!project_id)   return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',   { field: 'project_id' });
    if (!prototipo_id) return this._errorResponse(400, 'INVALID_INPUT', 'prototipo_id es obligatorio', { field: 'prototipo_id' });

    const errores = this._validarIterar(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const proto = store.prototipos.find(p => p.id === prototipo_id);
        if (!proto) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prototipo con id ${prototipo_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: prototipo_id });
        }

        const iter_id = `iter-${proto.iteraciones.length + 1}`;
        const ahora = new Date().toISOString();
        const iteracion = {
          id:         iter_id,
          anotacion:  params.anotacion.trim(),
          resultado:  VALID_ITERACION_RESULTADOS.has(params.resultado) ? params.resultado : 'indeterminada',
          timestamp:  ahora
        };
        proto.iteraciones.push(iteracion);
        proto.version   += 1;
        proto.updated_at = ahora;

        const payload = {
          project_id,
          user_id:       params.user_id || DEFAULT_USER_ID,
          prototipo_id:  proto.id,
          iteracion_id:  iter_id,
          anotacion:     iteracion.anotacion,
          resultado:     iteracion.resultado
        };
        await this._publicarEvento('creativo.iteracion.registrada', payload, params);

        this.metrics?.increment(`${this.name}.iteracion.registrada.total`, 1, { project_id, resultado: iteracion.resultado });

        return {
          status: 200,
          data: {
            prototipo_id:        proto.id,
            iteracion_id:        iter_id,
            total_iteraciones:   proto.iteraciones.length,
            version:             proto.version
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetario-creativo.iterar', err, 'tool');
    }
  }

  async onEvaluarAlineacion(params = {}) {
    const start = Date.now();
    const { project_id, objeto_tipo } = params;

    if (!project_id)  return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',  { field: 'project_id' });
    if (!objeto_tipo) return this._errorResponse(400, 'INVALID_INPUT', 'objeto_tipo es obligatorio', { field: 'objeto_tipo' });
    if (!VALID_OBJETO_TIPOS.has(objeto_tipo)) {
      return this._errorResponse(400, 'INVALID_INPUT', `objeto_tipo debe ser uno de: ${Array.from(VALID_OBJETO_TIPOS).join(', ')}`, { field: 'objeto_tipo', allowed: Array.from(VALID_OBJETO_TIPOS) });
    }

    const errores = this._validarEvaluarAlineacion(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const manifiesto = store.manifiesto || { valores: [], prohibido: [] };

        let objeto_id;
        let objeto;
        if (objeto_tipo === 'prototipo') {
          const proto = store.prototipos.find(p => p.id === params.prototipo_id);
          if (!proto) {
            return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prototipo con id ${params.prototipo_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: params.prototipo_id });
          }
          objeto_id = proto.id;
          objeto    = { nombre: proto.nombre, tags: proto.tags_creativos || [] };
        } else {
          objeto_id = params.receta_id;
          objeto    = { nombre: params.nombre, tags: Array.isArray(params.tags) ? params.tags : [] };
        }

        const { score, resaltan, disuenan } = this._calcularAlineacion(objeto, manifiesto);

        const payload = {
          project_id,
          user_id:     params.user_id || DEFAULT_USER_ID,
          objeto_tipo,
          objeto_id,
          score
        };
        if (resaltan.length > 0) payload.resaltan = resaltan;
        if (disuenan.length > 0) payload.disuenan = disuenan;

        await this._publicarEvento('creativo.alineacion.validada', payload, params);

        this.metrics?.increment(`${this.name}.alineacion.validada.total`, 1, { project_id, objeto_tipo });
        this.metrics?.timing(`${this.name}.alineacion.duration`, Date.now() - start);

        return {
          status: 200,
          data: { score, resaltan, disuenan, objeto_tipo, objeto_id }
        };
      });
    } catch (err) {
      return this._handleHandlerError('recetario-creativo.evaluar_alineacion', err, 'tool');
    }
  }

  async onActualizarManifiesto(params = {}) {
    const { project_id, manifiesto } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!manifiesto || typeof manifiesto !== 'object' || Array.isArray(manifiesto)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'manifiesto debe ser objeto', { field: 'manifiesto' });
    }

    const errores = this._validarManifiesto(manifiesto);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const prev = store.manifiesto || { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' };
        const next = { ...prev };
        if (Array.isArray(manifiesto.valores))            next.valores              = manifiesto.valores.map(v => String(v));
        if (Array.isArray(manifiesto.prohibido))          next.prohibido            = manifiesto.prohibido.map(p => String(p));
        if (typeof manifiesto.tradicion_referencia === 'string') next.tradicion_referencia = manifiesto.tradicion_referencia;
        if (typeof manifiesto.notas_libres === 'string')         next.notas_libres         = manifiesto.notas_libres;
        store.manifiesto = next;

        this.metrics?.increment(`${this.name}.manifiesto.actualizado.total`, 1, { project_id });

        return { status: 200, data: { manifiesto: next } };
      });
    } catch (err) {
      return this._handleHandlerError('recetario-creativo.actualizar_manifiesto', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — _errorResponse, _classifyHandlerError, _handleHandlerError,
  // _statusFromCode, _enrich vienen de BaseModule. Override _publicarEvento
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
  // Dominio protegido — validaciones, id, alineacion
  // ============================================================

  _validarCrearPrototipo(data) {
    const errores = [];
    const { nombre, tags_creativos, descripcion } = data;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'nombre es obligatorio', details: { field: 'nombre' } });
    } else if (nombre.length > this.config.max_nombre_length) {
      errores.push({ code: 'INVALID_INPUT', message: `nombre excede ${this.config.max_nombre_length} caracteres`, details: { field: 'nombre', max: this.config.max_nombre_length } });
    }

    if (tags_creativos !== undefined) {
      if (!Array.isArray(tags_creativos)) {
        errores.push({ code: 'INVALID_INPUT', message: 'tags_creativos debe ser array', details: { field: 'tags_creativos' } });
      } else {
        for (let i = 0; i < tags_creativos.length; i++) {
          const t = tags_creativos[i];
          if (typeof t !== 'string') {
            errores.push({ code: 'INVALID_INPUT', message: `tags_creativos[${i}] debe ser string`, details: { field: 'tags_creativos', index: i } });
            break;
          }
          if (t.length > this.config.max_tag_length) {
            errores.push({ code: 'INVALID_INPUT', message: `tags_creativos[${i}] excede ${this.config.max_tag_length} caracteres`, details: { field: 'tags_creativos', index: i, max: this.config.max_tag_length } });
            break;
          }
        }
      }
    }

    if (descripcion !== undefined) {
      if (typeof descripcion !== 'string') {
        errores.push({ code: 'INVALID_INPUT', message: 'descripcion debe ser string', details: { field: 'descripcion' } });
      } else if (descripcion.length > this.config.max_descripcion_length) {
        errores.push({ code: 'INVALID_INPUT', message: `descripcion excede ${this.config.max_descripcion_length} caracteres`, details: { field: 'descripcion', max: this.config.max_descripcion_length } });
      }
    }

    return errores;
  }

  _validarIterar(data) {
    const errores = [];
    const { anotacion, resultado } = data;

    if (!anotacion || typeof anotacion !== 'string' || anotacion.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'anotacion es obligatoria', details: { field: 'anotacion' } });
    } else if (anotacion.length > this.config.max_anotacion_length) {
      errores.push({ code: 'INVALID_INPUT', message: `anotacion excede ${this.config.max_anotacion_length} caracteres`, details: { field: 'anotacion', max: this.config.max_anotacion_length } });
    }

    if (resultado !== undefined && !VALID_ITERACION_RESULTADOS.has(resultado)) {
      errores.push({ code: 'INVALID_INPUT', message: `resultado debe ser uno de: ${Array.from(VALID_ITERACION_RESULTADOS).join(', ')}`, details: { field: 'resultado', allowed: Array.from(VALID_ITERACION_RESULTADOS) } });
    }

    return errores;
  }

  _validarEvaluarAlineacion(data) {
    const errores = [];
    const { objeto_tipo, prototipo_id, receta_id, nombre, tags } = data;

    if (objeto_tipo === 'prototipo') {
      if (!prototipo_id || typeof prototipo_id !== 'string') {
        errores.push({ code: 'INVALID_INPUT', message: 'prototipo_id es obligatorio cuando objeto_tipo=prototipo', details: { field: 'prototipo_id' } });
      }
    } else if (objeto_tipo === 'receta') {
      if (!receta_id || typeof receta_id !== 'string') {
        errores.push({ code: 'INVALID_INPUT', message: 'receta_id es obligatorio cuando objeto_tipo=receta', details: { field: 'receta_id' } });
      }
      if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
        errores.push({ code: 'INVALID_INPUT', message: 'nombre es obligatorio cuando objeto_tipo=receta', details: { field: 'nombre' } });
      }
      if (tags !== undefined && !Array.isArray(tags)) {
        errores.push({ code: 'INVALID_INPUT', message: 'tags debe ser array de strings', details: { field: 'tags' } });
      }
    }

    return errores;
  }

  _validarManifiesto(m) {
    const errores = [];
    const { valores, prohibido, tradicion_referencia, notas_libres } = m;

    for (const [key, val] of [['valores', valores], ['prohibido', prohibido]]) {
      if (val === undefined) continue;
      if (!Array.isArray(val)) {
        errores.push({ code: 'INVALID_INPUT', message: `manifiesto.${key} debe ser array`, details: { field: `manifiesto.${key}` } });
        continue;
      }
      for (let i = 0; i < val.length; i++) {
        if (typeof val[i] !== 'string') {
          errores.push({ code: 'INVALID_INPUT', message: `manifiesto.${key}[${i}] debe ser string`, details: { field: `manifiesto.${key}`, index: i } });
          break;
        }
      }
    }

    if (tradicion_referencia !== undefined) {
      if (typeof tradicion_referencia !== 'string') {
        errores.push({ code: 'INVALID_INPUT', message: 'manifiesto.tradicion_referencia debe ser string', details: { field: 'manifiesto.tradicion_referencia' } });
      } else if (tradicion_referencia.length > this.config.max_tradicion_length) {
        errores.push({ code: 'INVALID_INPUT', message: `manifiesto.tradicion_referencia excede ${this.config.max_tradicion_length} caracteres`, details: { field: 'manifiesto.tradicion_referencia', max: this.config.max_tradicion_length } });
      }
    }

    if (notas_libres !== undefined) {
      if (typeof notas_libres !== 'string') {
        errores.push({ code: 'INVALID_INPUT', message: 'manifiesto.notas_libres debe ser string', details: { field: 'manifiesto.notas_libres' } });
      } else if (notas_libres.length > this.config.max_notas_libres_length) {
        errores.push({ code: 'INVALID_INPUT', message: `manifiesto.notas_libres excede ${this.config.max_notas_libres_length} caracteres`, details: { field: 'manifiesto.notas_libres', max: this.config.max_notas_libres_length } });
      }
    }

    return errores;
  }

  _generarId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  /**
   * Heuristica determinista: score base 50, +bonus por valor del manifiesto que
   * aparece en nombre/tags del objeto, -penalty por prohibido detectado.
   * Match es case-insensitive y substring (un valor "estacionalidad" matchea
   * la tag "estacionalidad-extrema" y el nombre "Plato de estacionalidad").
   */
  _calcularAlineacion(objeto, manifiesto) {
    const { alineacion_score_base, alineacion_valor_bonus, alineacion_prohibido_penalty } = this.config;
    const haystack = [
      String(objeto?.nombre || ''),
      ...(Array.isArray(objeto?.tags) ? objeto.tags : [])
    ].join(' ').toLowerCase();

    const valores   = Array.isArray(manifiesto?.valores)   ? manifiesto.valores   : [];
    const prohibido = Array.isArray(manifiesto?.prohibido) ? manifiesto.prohibido : [];

    let score = alineacion_score_base;
    const resaltan = [];
    const disuenan = [];

    for (const v of valores) {
      if (typeof v !== 'string' || !v) continue;
      if (haystack.includes(v.toLowerCase())) {
        score += alineacion_valor_bonus;
        resaltan.push(v);
      }
    }
    for (const p of prohibido) {
      if (typeof p !== 'string' || !p) continue;
      if (haystack.includes(p.toLowerCase())) {
        score -= alineacion_prohibido_penalty;
        disuenan.push(p);
      }
    }

    score = Math.max(0, Math.min(100, score));
    return { score, resaltan, disuenan };
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
    const absPath = `${basePath}/recetario-creativo.json`.replace(/\/+/g, '/');
    const content = await this._readFile(absPath);
    if (!content) {
      return this._emptyStore();
    }
    try {
      const parsed = JSON.parse(content);
      if (!parsed.manifiesto)              parsed.manifiesto = { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' };
      if (!Array.isArray(parsed.prototipos)) parsed.prototipos = [];
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { abs_path: absPath, error_message: err.message });
      return this._emptyStore();
    }
  }

  async _saveStore(basePath, store) {
    const absPath = `${basePath}/recetario-creativo.json`.replace(/\/+/g, '/');
    store._version = this.version;
    store._updated = new Date().toISOString();
    await this._writeFile(absPath, JSON.stringify(store, null, 2));
  }

  _emptyStore() {
    return {
      _version: this.version,
      _updated: null,
      manifiesto: { valores: [], prohibido: [], tradicion_referencia: '', notas_libres: '' },
      prototipos: []
    };
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

module.exports = RecetarioCreativoModule;
