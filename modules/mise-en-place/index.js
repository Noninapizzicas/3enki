/**
 * Modulo `mise-en-place` v1.0.0
 *
 * Planificacion previa al servicio: escalado de recetas, planes de produccion,
 * consolidacion de listas de compra. Eventos canonicos con prefix `produccion.*`
 * (decision del sub-contrato).
 *
 * Cumple los 24 contratos transversales:
 *   - extends BaseModule.
 *   - Override _publicarEvento para anadir project_id + user_id canonicos.
 *   - Toda respuesta { status, data | error: { code, message, details? } }.
 *   - Persistencia json-per-project via bus.
 *   - Sin acceso cross-modulo: el caller pasa los datos de las recetas.
 *
 * Payloads canonicos: ver arquitectura/decisiones/_schemas/subsistema-recetario/.
 */

'use strict';

const crypto     = require('crypto');
const BaseModule = require('../_shared/base-module');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_USER_ID    = 'default';
const ENTITY_TYPE        = 'production-plan';

const VALID_FRANJAS         = new Set(['desayuno', 'comida', 'merienda', 'cena', 'all_day']);
const VALID_HORIZONTE_TIPOS = new Set(['servicio', 'dia', 'semana', 'evento', 'personalizado']);

class MiseEnPlaceModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'mise-en-place';
    this.version = '1.0.0';

    this.config = {
      data_file_pattern:      'data/projects/{slug}/mise-en-place.json',
      project_get_timeout_ms: 5000,
      fs_request_timeout_ms:  5000
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

    this.logger.info('mise-en-place.loaded', {
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

    this.logger?.info('mise-en-place.unloaded', { module: this.name });
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
      this.logger?.debug('mise-en-place.project.cached', { project_id: id, base_path: basePath });
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

  async onCalcularEscalado(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarEscalado(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ahora = new Date().toISOString();
        const { factor, ingredientes_escalados } = this._calcularEscalado(
          { ingredientes: params.ingredientes, porciones_origen: params.porciones_origen },
          params.porciones_destino
        );

        const escalado = {
          id:                     this._generarId('esc'),
          receta_id:              params.receta_id,
          porciones_origen:       params.porciones_origen,
          porciones_destino:      params.porciones_destino,
          factor,
          ingredientes_escalados,
          created_at:             ahora
        };
        store.escalados.push(escalado);

        const payload = {
          project_id,
          user_id:                params.user_id || DEFAULT_USER_ID,
          receta_id:              escalado.receta_id,
          porciones_origen:       escalado.porciones_origen,
          porciones_destino:      escalado.porciones_destino,
          factor:                 escalado.factor,
          ingredientes_escalados: escalado.ingredientes_escalados
        };

        await this._publicarEvento('produccion.escalado.calculado', payload, params);

        this.metrics?.increment(`${this.name}.escalado.calculado.total`, 1, { project_id });

        return {
          status: 201,
          data: {
            escalado_id:            escalado.id,
            receta_id:              escalado.receta_id,
            factor:                 escalado.factor,
            ingredientes_escalados: escalado.ingredientes_escalados
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.calcular_escalado', err, 'tool');
    }
  }

  async onPublicarPlan(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarPlan(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const ahora = new Date().toISOString();
        const plan_id = (typeof params.plan_id === 'string' && params.plan_id.trim() !== '')
          ? params.plan_id.trim()
          : this._generarId('plan');

        const lineas = params.lineas.map(l => {
          const linea = { receta_id: l.receta_id, porciones: l.porciones, franja: l.franja };
          if (typeof l.dia === 'string' && l.dia !== '') linea.dia = l.dia;
          return linea;
        });

        const plan = {
          id:              plan_id,
          horizonte_desde: params.horizonte_desde,
          horizonte_hasta: params.horizonte_hasta,
          lineas,
          created_at:      ahora
        };
        store.planes.push(plan);

        const payload = {
          project_id,
          user_id:         params.user_id || DEFAULT_USER_ID,
          plan_id:         plan.id,
          horizonte_desde: plan.horizonte_desde,
          horizonte_hasta: plan.horizonte_hasta,
          lineas:          plan.lineas
        };

        await this._publicarEvento('produccion.plan.publicado', payload, params);

        this.metrics?.increment(`${this.name}.plan.publicado.total`, 1, { project_id });
        this.metrics?.gauge(`${this.name}.planes.count`, store.planes.length, { project_id });

        return {
          status: 201,
          data: {
            plan_id:    plan.id,
            total_lineas: plan.lineas.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.publicar_plan', err, 'tool');
    }
  }

  async onCalcularCompra(params = {}) {
    const start = Date.now();
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    const errores = this._validarCompra(params);
    if (errores.length > 0) {
      return this._errorResponse(400, errores[0].code, errores[0].message, { ...errores[0].details, all_errors: errores });
    }

    try {
      return await this._withStore(project_id, async (store) => {
        const items = this._agregarCompra(params.recetas);
        const ahora = new Date().toISOString();

        const compra = {
          id:                     this._generarId('compra'),
          horizonte:              { ...params.horizonte },
          recetas_consideradas:   params.recetas.map(r => ({ receta_id: r.receta_id, porciones: r.porciones })),
          items,
          created_at:             ahora
        };
        store.compras.push(compra);

        const payload = {
          project_id,
          user_id:                params.user_id || DEFAULT_USER_ID,
          horizonte:              compra.horizonte,
          recetas_consideradas:   compra.recetas_consideradas,
          items:                  compra.items
        };

        await this._publicarEvento('produccion.compra.calculada', payload, params);

        this.metrics?.increment(`${this.name}.compra.calculada.total`, 1, { project_id });
        this.metrics?.timing(`${this.name}.compra.duration`, Date.now() - start);

        return {
          status: 201,
          data: {
            compra_id:         compra.id,
            items_total:       compra.items.length,
            items:             compra.items
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.calcular_compra', err, 'tool');
    }
  }

  async onObtenerPlan(params = {}) {
    const { project_id, plan_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });
    if (!plan_id)    return this._errorResponse(400, 'INVALID_INPUT', 'plan_id es obligatorio',    { field: 'plan_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        const plan = store.planes.find(p => p.id === plan_id);
        if (!plan) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Plan con id ${plan_id} no existe`, { entity_type: ENTITY_TYPE, entity_id: plan_id });
        }
        return { status: 200, data: plan };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.obtener_plan', err, 'tool');
    }
  }

  async onListarPlanes(params = {}) {
    const { project_id } = params;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id es obligatorio', { field: 'project_id' });

    try {
      return await this._withStore(project_id, async (store) => {
        return {
          status: 200,
          data: {
            planes: store.planes.map(p => ({
              id:               p.id,
              horizonte_desde:  p.horizonte_desde,
              horizonte_hasta:  p.horizonte_hasta,
              total_lineas:     p.lineas.length,
              created_at:       p.created_at
            })),
            total: store.planes.length
          }
        };
      });
    } catch (err) {
      return this._handleHandlerError('mise-en-place.listar_planes', err, 'tool');
    }
  }

  // ============================================================
  // Helpers POC2 — heredados de BaseModule + override _publicarEvento
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
  // Dominio protegido — validaciones + id + algoritmos
  // ============================================================

  _validarEscalado(data) {
    const errores = [];
    const { receta_id, porciones_origen, porciones_destino, ingredientes } = data;

    if (!receta_id || typeof receta_id !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'receta_id es obligatorio', details: { field: 'receta_id' } });
    }
    if (!Number.isInteger(porciones_origen) || porciones_origen < 1) {
      errores.push({ code: 'INVALID_INPUT', message: 'porciones_origen debe ser entero >= 1', details: { field: 'porciones_origen' } });
    }
    if (!Number.isInteger(porciones_destino) || porciones_destino < 1) {
      errores.push({ code: 'INVALID_INPUT', message: 'porciones_destino debe ser entero >= 1', details: { field: 'porciones_destino' } });
    }
    if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'ingredientes debe ser array no vacio', details: { field: 'ingredientes' } });
    } else {
      for (let i = 0; i < ingredientes.length; i++) {
        const ing = ingredientes[i];
        if (!ing || typeof ing.nombre !== 'string' || ing.nombre.trim() === '') {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].nombre obligatorio`, details: { field: 'ingredientes', index: i } });
          break;
        }
        if (typeof ing.cantidad !== 'number' || ing.cantidad < 0 || Number.isNaN(ing.cantidad)) {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].cantidad debe ser number >= 0`, details: { field: 'ingredientes', index: i } });
          break;
        }
        if (typeof ing.unidad !== 'string' || ing.unidad === '') {
          errores.push({ code: 'INVALID_INPUT', message: `ingredientes[${i}].unidad obligatorio`, details: { field: 'ingredientes', index: i } });
          break;
        }
      }
    }

    return errores;
  }

  _validarPlan(data) {
    const errores = [];
    const { horizonte_desde, horizonte_hasta, lineas } = data;

    if (!horizonte_desde || typeof horizonte_desde !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'horizonte_desde es obligatorio (ISO 8601 date-time)', details: { field: 'horizonte_desde' } });
    }
    if (!horizonte_hasta || typeof horizonte_hasta !== 'string') {
      errores.push({ code: 'INVALID_INPUT', message: 'horizonte_hasta es obligatorio (ISO 8601 date-time)', details: { field: 'horizonte_hasta' } });
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'lineas debe ser array no vacio', details: { field: 'lineas' } });
    } else {
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        if (!l || typeof l.receta_id !== 'string' || l.receta_id === '') {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].receta_id obligatorio`, details: { field: 'lineas', index: i } });
          break;
        }
        if (!Number.isInteger(l.porciones) || l.porciones < 1) {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].porciones debe ser entero >= 1`, details: { field: 'lineas', index: i } });
          break;
        }
        if (!VALID_FRANJAS.has(l.franja)) {
          errores.push({ code: 'INVALID_INPUT', message: `lineas[${i}].franja debe ser una de: ${Array.from(VALID_FRANJAS).join(', ')}`, details: { field: 'lineas', index: i, allowed: Array.from(VALID_FRANJAS) } });
          break;
        }
      }
    }

    return errores;
  }

  _validarCompra(data) {
    const errores = [];
    const { horizonte, recetas } = data;

    if (!horizonte || typeof horizonte !== 'object' || Array.isArray(horizonte)) {
      errores.push({ code: 'INVALID_INPUT', message: 'horizonte es obligatorio (objeto)', details: { field: 'horizonte' } });
    } else if (!VALID_HORIZONTE_TIPOS.has(horizonte.tipo)) {
      errores.push({ code: 'INVALID_INPUT', message: `horizonte.tipo debe ser uno de: ${Array.from(VALID_HORIZONTE_TIPOS).join(', ')}`, details: { field: 'horizonte.tipo', allowed: Array.from(VALID_HORIZONTE_TIPOS) } });
    }

    if (!Array.isArray(recetas) || recetas.length === 0) {
      errores.push({ code: 'INVALID_INPUT', message: 'recetas debe ser array no vacio', details: { field: 'recetas' } });
    } else {
      for (let i = 0; i < recetas.length; i++) {
        const r = recetas[i];
        if (!r || typeof r.receta_id !== 'string' || r.receta_id === '') {
          errores.push({ code: 'INVALID_INPUT', message: `recetas[${i}].receta_id obligatorio`, details: { field: 'recetas', index: i } });
          break;
        }
        if (!Number.isInteger(r.porciones) || r.porciones < 1) {
          errores.push({ code: 'INVALID_INPUT', message: `recetas[${i}].porciones debe ser entero >= 1`, details: { field: 'recetas', index: i } });
          break;
        }
        if (!Array.isArray(r.ingredientes) || r.ingredientes.length === 0) {
          errores.push({ code: 'INVALID_INPUT', message: `recetas[${i}].ingredientes debe ser array no vacio`, details: { field: 'recetas', index: i } });
          break;
        }
      }
    }

    return errores;
  }

  _generarId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  /**
   * Escalado lineal proporcional: factor = porciones_destino / porciones_origen.
   * cantidad_nueva = cantidad_original * factor.
   */
  _calcularEscalado(receta, porciones_destino) {
    const factor = porciones_destino / receta.porciones_origen;
    const ingredientes_escalados = receta.ingredientes.map(ing => ({
      nombre:   ing.nombre,
      cantidad: ing.cantidad * factor,
      unidad:   ing.unidad
    }));
    return { factor, ingredientes_escalados };
  }

  /**
   * Agregacion de compra por (ingrediente_nombre_lower, unidad). Aplica merma
   * cuando esta presente: cantidad_efectiva = cantidad * (1 + merma_pct/100).
   * El primer merma_pct visto para una clave (nombre,unidad) se preserva en el
   * item agregado.
   */
  _agregarCompra(recetas) {
    const acc = new Map();  // key -> { ingrediente, unidad, cantidad_neta, merma_pct? }
    for (const r of recetas) {
      for (const ing of r.ingredientes) {
        const nombre = String(ing.nombre);
        const unidad = String(ing.unidad);
        const key = `${nombre.toLowerCase()}|${unidad}`;
        const merma = (typeof ing.merma_pct === 'number') ? ing.merma_pct : null;
        const cantidad_efectiva = merma !== null
          ? ing.cantidad * (1 + merma / 100)
          : ing.cantidad;

        if (!acc.has(key)) {
          const item = { ingrediente: nombre, unidad, cantidad_neta: cantidad_efectiva };
          if (merma !== null) item.merma_pct = merma;
          acc.set(key, item);
        } else {
          const item = acc.get(key);
          item.cantidad_neta += cantidad_efectiva;
        }
      }
    }
    return Array.from(acc.values());
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
    const absPath = `${basePath}/mise-en-place.json`.replace(/\/+/g, '/');
    const content = await this._readFile(absPath);
    if (!content) return this._emptyStore();
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.planes))    parsed.planes = [];
      if (!Array.isArray(parsed.escalados)) parsed.escalados = [];
      if (!Array.isArray(parsed.compras))   parsed.compras = [];
      return parsed;
    } catch (err) {
      this.logger?.warn(`${this.name}.persist.parse_error`, { abs_path: absPath, error_message: err.message });
      return this._emptyStore();
    }
  }

  async _saveStore(basePath, store) {
    const absPath = `${basePath}/mise-en-place.json`.replace(/\/+/g, '/');
    store._version = this.version;
    store._updated = new Date().toISOString();
    await this._writeFile(absPath, JSON.stringify(store, null, 2));
  }

  _emptyStore() {
    return { _version: this.version, _updated: null, planes: [], escalados: [], compras: [] };
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

module.exports = MiseEnPlaceModule;
