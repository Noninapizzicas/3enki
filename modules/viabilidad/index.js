/**
 * Modulo `viabilidad` v1.0.0
 *
 * Evaluador previo del subsistema-recetario. Calcula viabilidad ECONOMICA de
 * una idea de producto ANTES de invertir tiempo en prototipar. Algoritmo
 * determinista (sin LLM interno): coste estimado a partir de ingredientes
 * propuestos + food cost previsto si hay PVP objetivo.
 *
 * Decision arquitectonica: solo dimension ECONOMICA. Las dimensiones
 * cualitativas (diferenciacion comercial, encaje en oferta, estilo) las
 * decide el LLM principal que invoca la tool. Las dimensiones operativas
 * (tecnicas disponibles, estacionalidad) las cubre el caller pasando los
 * catalogos correspondientes.
 *
 * Cumple los 24 contratos transversales:
 *   - class ViabilidadModule extends BaseModule.
 *   - Override _publicarEvento para anadir project_id + user_id canonicos.
 *   - Toda respuesta { status, data | error: { code, message, details? } }.
 *   - Persistencia json-per-project via bus.
 *   - 2 publishes canonicos con AJV strict:
 *     viabilidad.evaluacion.completada, viabilidad.evaluacion.descartada.
 *
 * Flujo del subsistema:
 *   IDEA -> viabilidad.evaluar -> recetario-creativo.prototipo.crear ->
 *   iteraciones -> recetas.crear (canonico) -> mise-en-place / pase-cocina.
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';
const ENTITY_TYPE        = 'viability-record';

const VEREDICTOS = Object.freeze({
  VIABLE:                     'viable',
  VIABLE_CON_ADVERTENCIAS:    'viable_con_advertencias',
  NO_VIABLE_ECONOMICAMENTE:   'no_viable_economicamente',
  SIN_PVP_OBJETIVO:           'sin_pvp_objetivo'
});
const VEREDICTOS_VALIDOS = new Set(Object.values(VEREDICTOS));

const ESTADOS = Object.freeze({
  EVALUADA:   'evaluada',
  DESCARTADA: 'descartada'
});
const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS));

class ViabilidadModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'viabilidad';
    this.version = '1.0.0';

    this.config = {
      data_file_pattern:            'data/projects/{slug}/viabilidad.json',
      max_nombre_idea_length:       200,
      max_motivo_length:            500,
      food_cost_umbral_alerta:      35,
      food_cost_umbral_advertencia: 30,
      project_get_timeout_ms:       5000,
      fs_request_timeout_ms:        5000
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

    this.logger.info('viabilidad.loaded', {
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

    this.logger?.info('viabilidad.unloaded', { module: this.name });
  }

  // ============================================================
  // Bus subscribers — lifecycle de project + fs responses
  // ============================================================

  onProjectActivated(event) {
    const data = event?.data || event || {};
    const id = data.project_id || data.id;
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) {
      this.projectBasePaths.set(id, basePath);
      this.logger?.debug('viabilidad.project.cached', { project_id: id, base_path: basePath });
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
  // Tools — viabilidad
  // ============================================================

  async onEvaluar(params = {}) {
    const start = Date.now();
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarEvaluar(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const calculo = this._calcularViabilidad({
          ingredientes:           params.ingredientes_estimados,
          precios_catalogo:       params.precios_catalogo,
          porciones:              params.porciones,
          precio_venta_objetivo:  typeof params.precio_venta_objetivo === 'number' ? params.precio_venta_objetivo : null
        });

        const now = new Date().toISOString();
        const expediente = {
          id:                      this._generarId('viab'),
          nombre_idea:             params.nombre_idea.trim(),
          ingredientes_estimados:  params.ingredientes_estimados.map(i => ({
            nombre: String(i.nombre), cantidad: i.cantidad, unidad: String(i.unidad)
          })),
          porciones:               params.porciones,
          precio_venta_objetivo:   typeof params.precio_venta_objetivo === 'number' ? params.precio_venta_objetivo : null,
          coste_total:             calculo.coste_total,
          coste_por_porcion:       calculo.coste_por_porcion,
          coste_es_real:           calculo.coste_es_real,
          food_cost_pct:           calculo.food_cost_pct,
          veredicto:               calculo.veredicto,
          advertencias:            calculo.advertencias,
          ingredientes_sin_precio: calculo.ingredientes_sin_precio,
          estado_expediente:       ESTADOS.EVALUADA,
          motivo_descarte:         null,
          created_at:              now,
          updated_at:              now
        };
        store.expedientes.push(expediente);

        // Publish payload canonico (segun schema oficial)
        const payload = {
          project_id,
          user_id:           params.user_id || DEFAULT_USER_ID,
          expediente_id:     expediente.id,
          nombre_idea:       expediente.nombre_idea,
          veredicto:         expediente.veredicto,
          coste_total:       expediente.coste_total,
          coste_por_porcion: expediente.coste_por_porcion,
          coste_es_real:     expediente.coste_es_real
        };
        if (expediente.food_cost_pct !== null && expediente.food_cost_pct !== undefined) {
          payload.food_cost_pct = expediente.food_cost_pct;
        }
        if (expediente.precio_venta_objetivo !== null) {
          payload.precio_venta_objetivo = expediente.precio_venta_objetivo;
        }
        if (expediente.ingredientes_sin_precio.length > 0) {
          payload.ingredientes_sin_precio = expediente.ingredientes_sin_precio;
        }
        if (expediente.advertencias.length > 0) {
          payload.advertencias = expediente.advertencias;
        }

        await this._publicarEvento('viabilidad.evaluacion.completada', payload, params);

        this.metrics?.increment(`${this.name}.evaluacion.completada.total`, 1, { project_id, veredicto: expediente.veredicto });
        this.metrics?.timing(`${this.name}.evaluar.duration`, Date.now() - start);
        this.metrics?.gauge(`${this.name}.expedientes.count`, store.expedientes.length, { project_id });

        return {
          status: 201,
          data: {
            expediente_id:     expediente.id,
            nombre_idea:       expediente.nombre_idea,
            veredicto:         expediente.veredicto,
            coste_total:       expediente.coste_total,
            coste_por_porcion: expediente.coste_por_porcion,
            coste_es_real:     expediente.coste_es_real,
            food_cost_pct:     expediente.food_cost_pct,
            advertencias:      expediente.advertencias
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('viabilidad.evaluar', err, 'tool');
    }
  }

  async onObtener(params = {}) {
    const { project_id, expediente_id } = params;
    if (!project_id)    return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',    { field: 'project_id' });
    if (!expediente_id) return this._errorResponse(400, 'INVALID_INPUT', 'expediente_id es obligatorio', { field: 'expediente_id' });

    try {
      return await this._readOnly(project_id, async (store) => {
        const exp = store.expedientes.find(e => e.id === expediente_id);
        if (!exp) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Expediente ${expediente_id} no encontrado`,
            { entity_type: ENTITY_TYPE, entity_id: expediente_id });
        }
        return { status: 200, data: exp };
      });
    } catch (err) {
      return this._handleHandlerError('viabilidad.obtener', err, 'tool');
    }
  }

  async onListar(params = {}) {
    const { project_id, veredicto, estado } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (veredicto !== undefined && !VEREDICTOS_VALIDOS.has(veredicto)) {
      return this._errorResponse(400, 'INVALID_INPUT', `veredicto debe ser uno de: ${Array.from(VEREDICTOS_VALIDOS).join(', ')}`,
        { field: 'veredicto', allowed: Array.from(VEREDICTOS_VALIDOS) });
    }
    if (estado !== undefined && !ESTADOS_VALIDOS.has(estado)) {
      return this._errorResponse(400, 'INVALID_INPUT', `estado debe ser uno de: ${Array.from(ESTADOS_VALIDOS).join(', ')}`,
        { field: 'estado', allowed: Array.from(ESTADOS_VALIDOS) });
    }

    try {
      return await this._readOnly(project_id, async (store) => {
        let items = store.expedientes;
        if (veredicto) items = items.filter(e => e.veredicto === veredicto);
        if (estado)    items = items.filter(e => e.estado_expediente === estado);
        return {
          status: 200,
          data: {
            total: items.length,
            expedientes: items.map(e => ({
              expediente_id:    e.id,
              nombre_idea:      e.nombre_idea,
              veredicto:        e.veredicto,
              coste_por_porcion:e.coste_por_porcion,
              food_cost_pct:    e.food_cost_pct,
              estado:           e.estado_expediente,
              created_at:       e.created_at
            }))
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('viabilidad.listar', err, 'tool');
    }
  }

  async onDescartar(params = {}) {
    const { project_id, expediente_id, motivo } = params;
    if (!project_id)    return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio',    { field: 'project_id' });
    if (!expediente_id) return this._errorResponse(400, 'INVALID_INPUT', 'expediente_id es obligatorio', { field: 'expediente_id' });
    if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
      return this._errorResponse(400, 'INVALID_INPUT', 'motivo es obligatorio', { field: 'motivo' });
    }
    if (motivo.length > this.config.max_motivo_length) {
      return this._errorResponse(400, 'INVALID_INPUT', `motivo excede ${this.config.max_motivo_length} caracteres`,
        { field: 'motivo', max: this.config.max_motivo_length });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const exp = store.expedientes.find(e => e.id === expediente_id);
        if (!exp) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Expediente ${expediente_id} no encontrado`,
            { entity_type: ENTITY_TYPE, entity_id: expediente_id });
        }
        if (exp.estado_expediente === ESTADOS.DESCARTADA) {
          return this._errorResponse(409, 'CONFLICT_STATE', 'Expediente ya estaba descartado',
            { kind: 'invalid_state_transition', estado_anterior: ESTADOS.DESCARTADA });
        }

        const veredictoSnapshot = exp.veredicto;
        exp.estado_expediente   = ESTADOS.DESCARTADA;
        exp.motivo_descarte     = motivo.trim();
        exp.updated_at          = new Date().toISOString();

        const payload = {
          project_id,
          user_id:        params.user_id || DEFAULT_USER_ID,
          expediente_id:  exp.id,
          nombre_idea:    exp.nombre_idea,
          motivo:         exp.motivo_descarte,
          veredicto_economico: veredictoSnapshot
        };

        await this._publicarEvento('viabilidad.evaluacion.descartada', payload, params);

        this.metrics?.increment(`${this.name}.evaluacion.descartada.total`, 1, { project_id, veredicto_economico: veredictoSnapshot });

        return {
          status: 200,
          data: {
            expediente_id:    exp.id,
            estado:           exp.estado_expediente,
            motivo_descarte:  exp.motivo_descarte
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('viabilidad.descartar', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — heredados de BaseModule. Override _publicarEvento.
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
  // Dominio protegido — validaciones + algoritmo + id
  // ============================================================

  _validarEvaluar(data) {
    const errores = [];
    const { nombre_idea, ingredientes_estimados, porciones, precios_catalogo, precio_venta_objetivo } = data;

    if (!nombre_idea || typeof nombre_idea !== 'string' || nombre_idea.trim() === '') {
      errores.push({ code: 'INVALID_INPUT', message: 'nombre_idea es obligatorio', details: { field: 'nombre_idea' } });
    } else if (nombre_idea.length > this.config.max_nombre_idea_length) {
      errores.push({ code: 'INVALID_INPUT', message: `nombre_idea excede ${this.config.max_nombre_idea_length} caracteres`,
        details: { field: 'nombre_idea', max: this.config.max_nombre_idea_length } });
    }

    if (!Array.isArray(ingredientes_estimados) || ingredientes_estimados.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'ingredientes_estimados debe ser array no vacio', details: { field: 'ingredientes_estimados' } });
    } else {
      for (let i = 0; i < ingredientes_estimados.length; i++) {
        const ing = ingredientes_estimados[i];
        if (!ing || typeof ing.nombre !== 'string' || ing.nombre.trim() === '') {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes_estimados[${i}].nombre obligatorio`, details: { field: 'ingredientes_estimados', index: i } });
          break;
        }
        if (typeof ing.cantidad !== 'number' || ing.cantidad < 0) {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes_estimados[${i}].cantidad debe ser number >= 0`, details: { field: 'ingredientes_estimados', index: i } });
          break;
        }
        if (typeof ing.unidad !== 'string' || ing.unidad === '') {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes_estimados[${i}].unidad obligatorio`, details: { field: 'ingredientes_estimados', index: i } });
          break;
        }
      }
    }

    if (!Number.isInteger(porciones) || porciones < 1) {
      errores.push({ code: 'INVALID_INPUT', message: 'porciones debe ser entero >= 1', details: { field: 'porciones' } });
    }

    if (!precios_catalogo || typeof precios_catalogo !== 'object' || Array.isArray(precios_catalogo)) {
      errores.push({ code: 'INVALID_INPUT', message: 'precios_catalogo es obligatorio (objeto)', details: { field: 'precios_catalogo' } });
    }

    if (precio_venta_objetivo !== undefined && precio_venta_objetivo !== null) {
      if (typeof precio_venta_objetivo !== 'number' || precio_venta_objetivo <= 0 || Number.isNaN(precio_venta_objetivo)) {
        errores.push({ code: 'INVALID_INPUT', message: 'precio_venta_objetivo debe ser number > 0 si se pasa', details: { field: 'precio_venta_objetivo' } });
      }
    }

    return errores;
  }

  /**
   * Algoritmo determinista de viabilidad economica.
   *   coste_total = suma(cantidad * precio_por_unidad) si esta en catalogo
   *   coste_es_real = todos los ingredientes tenian precio
   *   coste_por_porcion = coste_total / porciones
   *   food_cost_pct = (coste_por_porcion / precio_venta_objetivo) * 100 (si hay PVP)
   *   veredicto:
   *     - sin PVP: 'sin_pvp_objetivo' (informativo)
   *     - food_cost <= umbral_advertencia: 'viable'
   *     - umbral_advertencia < food_cost <= umbral_alerta: 'viable_con_advertencias'
   *     - food_cost > umbral_alerta: 'no_viable_economicamente'
   *
   * precios_catalogo acepta dos shapes por ingrediente:
   *   number puro (precio_por_unidad directo)
   *   { precio_por_unidad: number, unidad?: string }
   */
  _calcularViabilidad({ ingredientes, precios_catalogo, porciones, precio_venta_objetivo }) {
    const { food_cost_umbral_alerta, food_cost_umbral_advertencia } = this.config;
    let coste_total = 0;
    const ingredientes_sin_precio = [];

    for (const ing of ingredientes) {
      const precio = precios_catalogo[ing.nombre];
      let precio_unitario = null;
      if (typeof precio === 'number' && precio >= 0) {
        precio_unitario = precio;
      } else if (precio && typeof precio === 'object' && typeof precio.precio_por_unidad === 'number' && precio.precio_por_unidad >= 0) {
        precio_unitario = precio.precio_por_unidad;
      }

      if (precio_unitario !== null) {
        coste_total += ing.cantidad * precio_unitario;
      } else {
        ingredientes_sin_precio.push(ing.nombre);
      }
    }

    const coste_es_real     = ingredientes_sin_precio.length === 0;
    const coste_por_porcion = porciones > 0 ? coste_total / porciones : 0;

    let food_cost_pct = null;
    let veredicto;
    const advertencias = [];

    if (typeof precio_venta_objetivo === 'number' && precio_venta_objetivo > 0) {
      food_cost_pct = (coste_por_porcion / precio_venta_objetivo) * 100;
      if (food_cost_pct > food_cost_umbral_alerta) {
        veredicto = VEREDICTOS.NO_VIABLE_ECONOMICAMENTE;
      } else if (food_cost_pct > food_cost_umbral_advertencia) {
        veredicto = VEREDICTOS.VIABLE_CON_ADVERTENCIAS;
        advertencias.push(`food cost al limite (${food_cost_pct.toFixed(1)}% > umbral advertencia ${food_cost_umbral_advertencia}%)`);
      } else {
        veredicto = VEREDICTOS.VIABLE;
      }
    } else {
      veredicto = VEREDICTOS.SIN_PVP_OBJETIVO;
    }

    if (!coste_es_real) {
      advertencias.push(`ingredientes sin precio en catalogo: ${ingredientes_sin_precio.join(', ')}`);
    }

    return { coste_total, coste_por_porcion, coste_es_real, food_cost_pct, ingredientes_sin_precio, veredicto, advertencias };
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
    const absPath = `${basePath}/viabilidad.json`.replace(/\/+/g, '/');
    const content = await this._readFile(absPath);
    if (!content) return this._emptyStore();
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.expedientes)) parsed.expedientes = [];
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { abs_path: absPath, error_message: err.message });
      return this._emptyStore();
    }
  }

  async _saveStore(basePath, store) {
    const absPath = `${basePath}/viabilidad.json`.replace(/\/+/g, '/');
    store._version    = this.version;
    store._updated_at = new Date().toISOString();
    await this._writeFile(absPath, JSON.stringify(store, null, 2));
  }

  _emptyStore() {
    return { _version: this.version, _updated_at: null, expedientes: [] };
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

  async _readOnly(project_id, reader) {
    const basePath = await this._basePathForProject(project_id);
    const store    = await this._loadStore(basePath);
    return reader(store);
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

module.exports = ViabilidadModule;
