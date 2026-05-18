'use strict';

/**
 * runtime-blueprint — interprete declarativo de modulos del subsistema.
 *
 * Lee blueprint.json + (opcional) blueprint padre + (opcional) helpers.js
 * del modulo y lo expone al bus como un modulo runtime mas. Cero codigo
 * del dominio aqui — los modulos del dominio conversacional son sus
 * blueprints, este es la maquina virtual que los ejecuta.
 *
 * MODELO DE EJECUCION (B hibrido, decision documentada en
 * subsistema-recetario.modulo-base.blueprint.json):
 *
 *   1. LLM razona el dominio, construye payload canonico, publica
 *      <modulo>.<operacion>.request al bus.
 *   2. Runtime recibe el request, lee el blueprint de la operacion,
 *      ejecuta su pseudocodigo paso a paso (read store, validar regla,
 *      mutar state, write store, publish evento dominio).
 *   3. Runtime publica <modulo>.<operacion>.response con shape canonico.
 *   4. LLM recibe la response, formula mensaje al usuario.
 *
 * VERSION PILOTO 0.1.0: solo cubre operaciones que siguen el patron
 * "leer store JSON → validar regla → mutar → escribir store → publicar
 *  evento dominio → responder". Cubre `recetas.crear`. Otros patrones
 * (queries readonly, multi-store, etc.) se anyadiran caso por caso.
 *
 * EL PSEUDOCODIGO NO SE EJECUTA MECANICAMENTE: el runtime piloto
 * implementa el patron canonico en JS. El pseudocodigo del blueprint
 * sirve como contrato legible para el LLM y para humanos — la
 * implementacion ejecutable la pone el runtime (no el blueprint).
 *
 * En iteraciones futuras puede evolucionarse a interprete real del
 * pseudocodigo si el modelo lo justifica.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_RESPONSE_TIMEOUT_MS = 10000;

class RuntimeBlueprint {
  /**
   * @param {object} context  — { logger, eventBus, metrics?, modulesDir }
   * @param {string} blueprintPath — path absoluto al blueprint.json del modulo
   */
  constructor(context, blueprintPath) {
    this.logger     = context.logger;
    this.eventBus   = context.eventBus;
    this.metrics    = context.metrics || null;
    this.modulesDir = context.modulesDir || path.dirname(blueprintPath);

    this.blueprintPath = blueprintPath;
    this.blueprint     = null;     // hijo
    this.parent        = null;     // padre abstracto (si extends)
    this.helpers       = null;     // funciones del dominio (modules/<modulo>/helpers.js)

    // Estado del runtime
    this.projectBasePaths = new Map(); // project_id → base_path
    this.pendingResponses = new Map(); // request_id → { resolve, reject, timeout }
    this.writeQueues      = new Map(); // project_id → Promise (serializa escrituras)

    this.name = null; // se setea tras cargar blueprint
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async load() {
    this.blueprint = JSON.parse(fs.readFileSync(this.blueprintPath, 'utf-8'));
    this.name = this.blueprint.id;

    // Cargar padre abstracto si extends
    const parentId = this.blueprint.extends_blueprint_abstract;
    if (parentId) {
      const parentPath = path.join(path.dirname(this.blueprintPath), `${parentId}.blueprint.json`);
      if (fs.existsSync(parentPath)) {
        this.parent = JSON.parse(fs.readFileSync(parentPath, 'utf-8'));
      } else {
        this.logger.warn('runtime-blueprint.parent.not_found', { parentId, expected: parentPath });
      }
    }

    // Cargar helpers del dominio si existen
    const helpersPath = path.join(path.dirname(this.blueprintPath), 'helpers.js');
    if (fs.existsSync(helpersPath)) {
      this.helpers = require(helpersPath);
    }

    this.logger.info('runtime-blueprint.loaded', {
      modulo: this.name,
      version: this.blueprint.version,
      parent: parentId || null,
      operaciones: Object.keys(this.blueprint.operaciones || {}),
      helpers: this.helpers ? Object.keys(this.helpers) : []
    });
  }

  async start() {
    // Suscribir al bus por cada operacion declarada
    for (const opName of Object.keys(this.blueprint.operaciones || {})) {
      const evento = `${this.name}.${opName}.request`;
      this.eventBus.subscribe?.(evento, (event) => this._onOperationRequest(opName, event));
    }
    // Suscribir a responses correlacionadas
    this.eventBus.subscribe?.('fs.read.response',  (event) => this._onPrimitivaResponse(event));
    this.eventBus.subscribe?.('fs.write.response', (event) => this._onPrimitivaResponse(event));
    this.eventBus.subscribe?.('project.get.response', (event) => this._onPrimitivaResponse(event));
    // Suscribir a project lifecycle para cachear base_path
    this.eventBus.subscribe?.('project.activated', (event) => this._onProjectActivated(event));
  }

  async stop() {
    for (const { timer, reject } of this.pendingResponses.values()) {
      clearTimeout(timer);
      reject(new Error('runtime stopped'));
    }
    this.pendingResponses.clear();
    this.writeQueues.clear();
    this.projectBasePaths.clear();
  }

  // =============================================================
  // Bus handlers
  // =============================================================

  _onProjectActivated(event) {
    const data = event?.data || event;
    const id = data.project_id || data.id;
    const basePath = data.base_path || data.project?.base_path;
    if (id && basePath) this.projectBasePaths.set(id, basePath);
  }

  _onPrimitivaResponse(event) {
    const payload = event?.data || event;
    const reqId = payload?.request_id;
    if (!reqId) return;
    const pending = this.pendingResponses.get(reqId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingResponses.delete(reqId);
    if (payload.error) pending.reject(new Error(payload.error?.message || payload.error));
    else pending.resolve(payload);
  }

  async _onOperationRequest(opName, event) {
    const op = this.blueprint.operaciones[opName];
    const input = event?.data || event;
    const responseEvent = `${this.name}.${opName}.response`;
    const requestId = input?.request_id;

    try {
      const result = await this._executePatronCanonico(op, input, opName);
      await this._publishResponse(responseEvent, requestId, result);
    } catch (err) {
      this.logger.error(`${this.name}.${opName}.failed`, { error: err.message, code: err._code });
      this.metrics?.increment?.(`${this.name}.errors`, { operacion: opName, code: err._code || 'UNKNOWN_ERROR' });
      await this._publishResponse(responseEvent, requestId, {
        status: this._statusFromCode(err._code) || 500,
        error: {
          code: err._code || 'UNKNOWN_ERROR',
          message: err.message,
          details: err._details
        }
      });
    }
  }

  // =============================================================
  // Patron canonico de ejecucion (B hibrido)
  // =============================================================

  /**
   * Ejecuta una operacion siguiendo el patron declarado en el blueprint:
   *   1. validar input contra obligatorios
   *   2. resolver base_path
   *   3. leer store (fs.read, con default si 404)
   *   4. evaluar regla del dominio (declarada como helper opcional)
   *   5. construir payload canonico (helper del dominio)
   *   6. mutar el store
   *   7. escribir store (fs.write atomico, serializado por project_id)
   *   8. publicar evento de dominio
   *   9. devolver respuesta canonica
   *
   * El piloto solo soporta el patron crear-like. Otras operaciones se
   * anyaden caso por caso.
   */
  async _executePatronCanonico(op, input, opName) {
    // Por ahora solo soportamos `crear` (recetas). Otros casos se
    // anyaden caso por caso cuando aparezcan.
    if (opName !== 'crear') {
      throw Object.assign(new Error(`operacion '${opName}' no soportada por runtime piloto v0.1`),
        { _code: 'PRECONDITION_FAILED' });
    }

    // 1. Validacion minima de input (los obligatorios declarados)
    if (!input.project_id) {
      throw Object.assign(new Error('project_id requerido'),
        { _code: 'INVALID_INPUT', _details: { field: 'project_id' } });
    }
    if (!input.nombre || !input.nombre.trim()) {
      throw Object.assign(new Error('nombre requerido'),
        { _code: 'INVALID_INPUT', _details: { field: 'nombre' } });
    }

    // 2. Resolver base_path
    const basePath = await this._resolveBasePath(input.project_id);

    // Serializar escritura por project_id (writeQueues)
    return this._withWriteQueue(input.project_id, async () => {
      // 3. Leer store (fs.read, 404 → store vacio)
      const store = await this._readStore(basePath);

      // 4. Evaluar regla "no duplicado activo" (declarada en blueprint)
      const dup = store.recetas.find(r =>
        r.nombre.toLowerCase().trim() === input.nombre.toLowerCase().trim() &&
        r.estado_operativo === 'en_servicio'
      );
      if (dup) {
        throw Object.assign(new Error(`Ya existe una receta activa con el nombre "${input.nombre}"`),
          { _code: 'ALREADY_EXISTS', _details: { existing_id: dup.id } });
      }

      // 5. Construir receta canonica usando helpers del dominio
      const receta = {
        id:            this._uuid(),
        nombre:        input.nombre.trim(),
        descripcion:   input.descripcion || null,
        ingredientes:  this.helpers.normalizarIngredientes(input.ingredientes),
        instrucciones: this.helpers.normalizarInstrucciones(input.instrucciones),
        porciones:     input.porciones ?? null,
        tiempo_min:    input.tiempo_min ?? null,
        dificultad:    input.dificultad ?? null,
        categorias:    Array.isArray(input.categorias) ? input.categorias : [],
        etiquetas:     Array.isArray(input.etiquetas) ? input.etiquetas : [],
        fuente:        input.fuente || 'manual',
        notas:         input.notas || null,
        created_at:    this._nowISO(),
        updated_at:    this._nowISO(),
        version:       1,
        history:       []
      };
      receta.campos_pendientes = this.helpers.camposPendientes(receta);
      receta.incompleta        = receta.campos_pendientes.length > 0;
      receta.estado_operativo  = receta.incompleta ? 'borrador' : 'en_servicio';

      // 6. Mutar store
      store.recetas.push(receta);
      store._updated_at = this._nowISO();

      // 7. Escribir store
      await this._writeStore(basePath, store);

      // 8. Publicar evento canonico de dominio
      await this._publishDomainEvent('receta.creada', input.project_id, input.user_id || 'system', input.correlation_id, {
        id:                receta.id,
        nombre:            receta.nombre,
        version:           1,
        estado_operativo:  receta.estado_operativo,
        incompleta:        receta.incompleta,
        campos_pendientes: receta.campos_pendientes
      });

      // 9. Respuesta canonica
      return {
        status: 201,
        data: {
          id:                receta.id,
          nombre:            receta.nombre,
          status:            'creada',
          incompleta:        receta.incompleta,
          campos_pendientes: receta.campos_pendientes,
          version:           1
        }
      };
    });
  }

  // =============================================================
  // Primitivas universales (las que declara el blueprint padre)
  // =============================================================

  async _resolveBasePath(projectId) {
    if (this.projectBasePaths.has(projectId)) return this.projectBasePaths.get(projectId);
    // Fallback: project.get.request
    const reqId = this._uuid();
    const respPromise = this._waitFor(reqId);
    this.eventBus.publish('project.get.request', { request_id: reqId, project_id: projectId });
    const resp = await respPromise;
    const basePath = resp.project?.base_path || resp.base_path;
    if (!basePath) {
      throw Object.assign(new Error(`No se pudo resolver base_path para project_id=${projectId}`),
        { _code: 'UPSTREAM_UNREACHABLE' });
    }
    this.projectBasePaths.set(projectId, basePath);
    return basePath;
  }

  async _readStore(basePath) {
    const reqId = this._uuid();
    const respPromise = this._waitFor(reqId);
    this.eventBus.publish('fs.read.request', { request_id: reqId, path: `${basePath}/recetas.json` });
    const resp = await respPromise;
    if (resp.status === 404 || resp.error?.code === 'RESOURCE_NOT_FOUND') {
      return { _version: '1.0', recetas: [], ingredientes_catalogo: [] };
    }
    if (resp.error || (resp.status && resp.status >= 400)) {
      throw Object.assign(new Error(resp.error?.message || `fs.read fallo status=${resp.status}`),
        { _code: 'UPSTREAM_UNREACHABLE' });
    }
    try {
      const parsed = typeof resp.content === 'string' ? JSON.parse(resp.content) : resp.content;
      parsed.recetas               = Array.isArray(parsed.recetas) ? parsed.recetas : [];
      parsed.ingredientes_catalogo = Array.isArray(parsed.ingredientes_catalogo) ? parsed.ingredientes_catalogo : [];
      return parsed;
    } catch (err) {
      throw Object.assign(new Error(`recetas.json corrupto: ${err.message}`),
        { _code: 'UNKNOWN_ERROR' });
    }
  }

  async _writeStore(basePath, store) {
    const reqId = this._uuid();
    const respPromise = this._waitFor(reqId);
    this.eventBus.publish('fs.write.request', {
      request_id: reqId,
      path: `${basePath}/recetas.json`,
      content: JSON.stringify(store, null, 2),
      encoding: 'utf-8'
    });
    const resp = await respPromise;
    if (resp.error || (resp.status && resp.status >= 400)) {
      throw Object.assign(new Error(resp.error?.message || `fs.write fallo status=${resp.status}`),
        { _code: 'UPSTREAM_UNREACHABLE' });
    }
    return true;
  }

  async _publishDomainEvent(eventName, projectId, userId, correlationId, payload) {
    await this.eventBus.publish(eventName, {
      project_id:     projectId,
      user_id:        userId,
      correlation_id: correlationId || this._uuid(),
      timestamp:      this._nowISO(),
      ...payload
    });
  }

  async _publishResponse(eventName, requestId, result) {
    await this.eventBus.publish(eventName, {
      request_id: requestId,
      ...result
    });
  }

  // =============================================================
  // Helpers built-in del runtime
  // =============================================================

  _uuid() { return crypto.randomUUID(); }

  _nowISO() { return new Date().toISOString(); }

  /**
   * Espera response correlacionada por request_id con timeout.
   * El que llama hace el `publish` despues de obtener la Promise.
   */
  _waitFor(requestId, timeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        reject(Object.assign(new Error(`timeout esperando response request_id=${requestId}`),
          { _code: 'UPSTREAM_TIMEOUT' }));
      }, timeoutMs);
      this.pendingResponses.set(requestId, { resolve, reject, timer });
    });
  }

  /**
   * Serializa una funcion async por project_id. Garantiza que dos escrituras
   * al mismo recetas.json no se pisen.
   */
  async _withWriteQueue(projectId, fn) {
    const prev = this.writeQueues.get(projectId) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.writeQueues.set(projectId, next);
    try { return await next; }
    finally {
      if (this.writeQueues.get(projectId) === next) this.writeQueues.delete(projectId);
    }
  }

  _statusFromCode(code) {
    switch (code) {
      case 'INVALID_INPUT':           return 400;
      case 'AUTHENTICATION_REQUIRED': return 401;
      case 'PERMISSION_DENIED':       return 403;
      case 'RESOURCE_NOT_FOUND':      return 404;
      case 'CONFLICT_STATE':
      case 'ALREADY_EXISTS':          return 409;
      case 'PRECONDITION_FAILED':     return 422;
      case 'RATE_LIMITED':            return 429;
      case 'UPSTREAM_INVALID_RESPONSE': return 502;
      case 'UPSTREAM_UNREACHABLE':
      case 'SYSTEM_RESOURCE_EXHAUSTED': return 503;
      case 'UPSTREAM_TIMEOUT':        return 504;
      default:                        return 500;
    }
  }
}

module.exports = RuntimeBlueprint;
