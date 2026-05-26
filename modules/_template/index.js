/**
 * _template — Modulo plantilla canonico (NO se carga en runtime).
 *
 * Sirve de referencia visual cuando reescribes cualquiera de los modulos
 * del repo. Cumple los 25 contratos transversales, en particular:
 *
 *   - modulo-clase-robusta.contract: clase extends BaseModule, constructor
 *     declarativo, 5 secciones canonicas con banners, naming on/handle/_,
 *     polimorfismo con super(), onUnload limpia recursos.
 *   - events.contract: publish via this._publicarEvento (heredado), nunca
 *     this.eventBus.publish directo.
 *   - errors.contract: handlers devuelven { status, data | error: { code, message } }
 *     con codigos del catalogo simplificado (13 canonicos). Nunca throw no capturado.
 *   - lifecycle.contract: onLoad asigna context, onUnload limpia state runtime.
 *   - observability.contract: logger + metrics en cada handler.
 *   - persistence.contract: pattern declarado (json-file-per-project / sqlite / in-memory).
 *   - tools.contract: tools declarados en module.json con shape canonico.
 *   - multi-tenancy.contract: toda operacion lleva project_id.
 *
 * Para usar este template:
 *   1. cp -r modules/_template modules/<nombre-real>
 *   2. Renombrar archivo, clase y referencias internas (_template -> <nombre>).
 *   3. Eliminar prefijo '_' del nombre (asi el moduleLoader lo carga).
 *   4. Rellenar logica del dominio en los handlers marcados como TODO.
 *   5. Crear tests/unit/<nombre>.test.js basado en tests/_template-test.js.
 *   6. Wire en .github/workflows/validate.yml + package.json scripts.
 *   7. Correr `npm run validate:ci`: PASS sin drift nuevo.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

// ============================================================
// SCHEMA SQL (solo si el modulo usa SQLite via database-manager).
// Borrar entera si el modulo no persiste en SQLite.
// ============================================================
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS _template_entidades (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  datos TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx__template_entidades_project ON _template_entidades(project_id);
`;

class TemplateModule extends BaseModule {
  constructor() {
    super();
    this.name    = '_template';
    this.version = '1.0.0';

    // Inyectados en onLoad — declarados aqui con valor null/inicial vacio
    // (constructor declarativo: este es el contrato de estado de la clase)
    this.config      = null;
    this.uiHandler   = null;
    this.mqttRequest = null;

    // Estado runtime
    this.pendingDb    = new Map();    // request_id -> { resolve, reject, timeout }
    this.schemaReady  = new Set();    // project_ids con schema inicializado
    this.cacheVolatil = new Map();    // ejemplo de cache in-memory
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    this.logger      = context.logger;
    this.eventBus    = context.eventBus;
    this.metrics     = context.metrics;
    this.config      = context.moduleConfig || {};
    this.uiHandler   = context.uiHandler   || null;
    this.mqttRequest = context.mqttRequest || null;

    this.logger.info('_template.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    // Cerrar TODO lo que onLoad u otros metodos abrieron
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
    this.schemaReady.clear();
    this.cacheVolatil.clear();
    this.logger.info('_template.unloaded', { module: this.name });
  }

  // =============================================================
  // Bus API — handlers wireados por module.json.events.subscribes
  // Naming canonico: onXxx (PascalCase tras `on`, traduce del kebab del evento)
  // =============================================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id } = data;
    if (!project_id) return;
    try {
      await this._ensureSchema(project_id);
      this.logger.info('_template.project.activated', { project_id });
    } catch (err) {
      this._handleHandlerError('_template.project.activated', err, 'lifecycle');
    }
  }

  async onProjectDeactivated(event) {
    const data = event.data || event;
    const { project_id } = data;
    if (!project_id) return;
    this.cacheVolatil.delete(project_id);
    this.logger.info('_template.project.deactivated', { project_id });
  }

  onDbQueryResponse(event) {
    const payload = event.data || event;
    const { request_id, error } = payload;
    const pending = this.pendingDb.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDb.delete(request_id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(payload.data ?? payload.rows ?? []);
  }

  // =============================================================
  // HTTP / UI API — handlers wireados por module.json.apis_http o ui_handlers
  // Naming canonico: handleXxx. Firma: (req, context) o (data).
  // Retorno canonico: { status, data | error: { code, message, details? } }
  // =============================================================

  async handleUiList(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', {
          entity_type: 'project', field: 'project_id'
        });
      }
      await this._ensureSchema(project_id);
      const rows = await this._db(project_id,
        `SELECT id, project_id, datos, created_at, updated_at FROM _template_entidades
         WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`,
        [project_id], true);
      const entidades = (rows || []).map(r => ({
        ...r,
        datos: typeof r.datos === 'string' ? JSON.parse(r.datos) : r.datos
      }));
      return { status: 200, data: { entidades, count: entidades.length } };
    } catch (err) {
      return this._handleHandlerError('_template.ui.list.failed', err, 'ui_list');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        ready: this.schemaReady.size > 0,
        pending_db: this.pendingDb.size,
        cache_entries: this.cacheVolatil.size
      }
    };
  }

  // =============================================================
  // Tools — handlers wireados por module.json.tools[]
  // (Aceptan args como objeto desde LLM via ai-gateway.)
  // =============================================================

  async toolCrear(args, sourcePayload = null) {
    const correlation_id = sourcePayload?.correlation_id;
    const startTime = Date.now();
    try {
      // 1. Validacion defensiva — devuelve shape canonico, no throw
      if (!args || typeof args !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'args debe ser un object',
          { kind: 'shape' });
      }
      const { project_id, datos } = args;
      if (!project_id || typeof project_id !== 'string') {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido (string)',
          { field: 'project_id', entity_type: 'project' });
      }
      if (!datos || typeof datos !== 'object') {
        return this._errorResponse(400, 'INVALID_INPUT', 'datos requerido (object)',
          { field: 'datos' });
      }

      await this._ensureSchema(project_id);

      // 2. Logica del dominio (reemplazar por la tuya)
      const id = `tpl_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      await this._db(project_id,
        `INSERT INTO _template_entidades (id, project_id, datos, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, project_id, JSON.stringify(datos), now, now]);

      // 3. Publish evento de dominio via helper (correlation_id automatico)
      await this._publicarEvento('_template.entidad.creada', {
        project_id, id, datos
      }, sourcePayload);

      // 4. Telemetria + retorno canonico
      this.metrics?.increment('_template.entidad.creada');
      this.metrics?.timing('_template.crear.duration_ms', Date.now() - startTime);
      this.logger.info('_template.entidad.creada', { project_id, id, correlation_id });

      return { status: 200, data: { id, project_id, datos, created_at: new Date(now).toISOString() } };
    } catch (err) {
      return this._handleHandlerError('_template.crear.failed', err, 'tool_crear');
    }
  }

  // =============================================================
  // Dominio (protegido) — helpers del modulo, prefijo `_`
  // No son API publica. Implementan el saber hacer del dominio.
  // =============================================================

  /**
   * Inicializa el schema de SQLite para un project_id si todavia no esta.
   * Idempotente — usa Set in-memory para evitar repetir.
   */
  async _ensureSchema(project_id) {
    if (this.schemaReady.has(project_id)) return;
    for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
      await this._db(project_id, stmt, []);
    }
    this.schemaReady.add(project_id);
  }

  /**
   * Ejemplo de extension del clasificador heredado: si el modulo necesita
   * mapear keywords del dominio a codigos canonicos especificos, lo hace
   * aqui Y DELEGA al super() para el resto. Borrar este metodo si BaseModule
   * cubre todos los casos.
   *
   * NOTA: BaseModule cubre keywords genericos (not found, required, invalid,
   * timeout, unavailable, etc.). Solo override si tu dominio tiene mensajes
   * propios que no encajan en esa heuristica.
   */
  // _classifyHandlerError(err) {
  //   const msg = (err?.message || '').toLowerCase();
  //   if (msg.includes('entidad-especifica-del-dominio')) return 'INVALID_INPUT';
  //   return super._classifyHandlerError(err);
  // }

  // =============================================================
  // Privados — utilidades del modulo. No deben tener side effects
  // observables fuera del propio modulo.
  // =============================================================

  /**
   * Wrapper canonico para ejecutar query contra database-manager via bus.
   * Promise que resuelve con la response del db.query.response correlacionada
   * por request_id, con timeout configurable.
   */
  async _db(project_id, query, params = [], read_only = false) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        reject(new Error(`db timeout: ${query.slice(0, 40)}`));
      }, 10000);
      this.pendingDb.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.query.request', { project_id, query, params, read_only, request_id });
    });
  }
}

module.exports = TemplateModule;
