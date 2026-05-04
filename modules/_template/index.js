/**
 * _template — Modulo plantilla canonico (NO se carga en runtime).
 *
 * Sirve de referencia visual cuando reescribes cualquiera de los 73 modulos
 * del repo durante la fase horizontal. Cumple los 24 contratos transversales:
 *
 *   - events.contract: publish/subscribe via this.eventBus, NO acceso directo.
 *   - errors.contract: handlers devuelven { status, data | error: { code, message } }
 *     con error.code del catalogo. NUNCA throw no capturado.
 *   - lifecycle.contract: onLoad recibe context, onUnload limpia state runtime.
 *   - observability.contract: logger + metrics emitidos en cada handler.
 *   - persistence.contract: pattern declarado (json-file-per-project / sqlite / in-memory).
 *     Si SQLite o persistente: usar db.query.request a database-manager.
 *   - http.contract: aplicar si el modulo llama a upstream HTTP (no aplica aqui).
 *   - tools.contract: cada tool en module.json.tools[] tiene handler async que
 *     devuelve shape canonico, errores_conocidos del catalogo, name kebab-case
 *     prefijado por modulo, parameters JSON Schema valido.
 *   - chat-flow / agent-flow / llm-flow: si el modulo participa, usar shapes canonicos
 *     y declarar request_schema_ref / response_schema_ref en publishes/subscribes.
 *   - multi-tenancy.contract: TODA operacion lleva project_id. Aislamiento por proyecto.
 *   - resilience.contract: timeouts y retries declarativos, sin loops infinitos.
 *   - testing.contract: suite con mocks canonicos en tests/unit/<modulo>.test.js.
 *
 * Para usar este template:
 *   1. cp -r modules/_template modules/<nombre-real>
 *   2. Renombrar archivo y clase y referencias internas (_template -> <nombre>).
 *   3. Eliminar prefijo '_' del nombre (so el moduleLoader lo carga).
 *   4. Rellenar logica del dominio en los handlers marcados como TODO.
 *   5. Crear tests/unit/<nombre>.test.js basado en tests/_template-test.js.
 *   6. Wire en .github/workflows/validate.yml + package.json scripts.
 *   7. Correr 24 validators: deben pasar sin drift nuevo (solo dominio nuevo).
 */

'use strict';

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs').promises;

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

class TemplateModule {
  constructor() {
    this.name    = '_template';
    this.version = '1.0.0';

    // Inyectados en onLoad
    this.logger    = null;
    this.eventBus  = null;
    this.metrics   = null;
    this.config    = null;
    this.uiHandler = null;
    this.mqttRequest = null;

    // Estado runtime (NO persistido en archivos declarativos):
    this.pendingDb     = new Map();   // request_id -> { resolve, reject, timeout }
    this.schemaReady   = new Set();   // project_ids con schema inicializado
    this.cacheVolatil  = new Map();   // ejemplo de cache in-memory
  }

  // ==========================================
  // Lifecycle
  // ==========================================

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
    // Cancelar pending requests
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
    this.schemaReady.clear();
    this.cacheVolatil.clear();
    this.logger.info('_template.unloaded', { module: this.name });
  }

  // ==========================================
  // Project Lifecycle (handlers de eventos canonicos)
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id } = data;
    if (!project_id) return;
    try {
      await this._ensureSchema(project_id);
      this.logger.info('_template.project.activated', { project_id });
    } catch (err) {
      this.logger.error('_template.project.activated.failed', { project_id, error: err.message });
    }
  }

  async onProjectDeactivated(event) {
    const data = event.data || event;
    const { project_id } = data;
    if (!project_id) return;
    this.cacheVolatil.delete(project_id);
    this.logger.info('_template.project.deactivated', { project_id });
  }

  // ==========================================
  // Tools (declarados en module.json.tools[])
  // ==========================================

  async toolCrear(args, sourcePayload = null) {
    const correlation_id = sourcePayload?.correlation_id;
    const startTime = Date.now();

    // 1. Validacion defensiva
    if (!args || typeof args !== 'object') {
      this.logger.warn('_template.crear.invalid_args');
      this.metrics?.increment('_template.crear.errors', { code: 'VALIDATION_FAILED' });
      return {
        status: 400,
        error: { code: 'VALIDATION_FAILED', message: 'args debe ser un object', details: { kind: 'shape' } }
      };
    }
    const { project_id, datos } = args;
    if (!project_id || typeof project_id !== 'string') {
      this.metrics?.increment('_template.crear.errors', { code: 'VALIDATION_FAILED' });
      return {
        status: 400,
        error: { code: 'VALIDATION_FAILED', message: 'project_id requerido (string)', details: { kind: 'domain', field: 'project_id' } }
      };
    }
    if (!datos || typeof datos !== 'object') {
      this.metrics?.increment('_template.crear.errors', { code: 'VALIDATION_FAILED' });
      return {
        status: 400,
        error: { code: 'VALIDATION_FAILED', message: 'datos requerido (object)', details: { kind: 'domain', field: 'datos' } }
      };
    }

    try {
      await this._ensureSchema(project_id);

      // 2. Logica del dominio (reemplazar)
      const id = `tpl_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      await this._db(project_id,
        `INSERT INTO _template_entidades (id, project_id, datos, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, project_id, JSON.stringify(datos), now, now]);

      // 3. Publish evento de dominio (canonico, con correlation_id propagado)
      await this._publicarEvento('_template.entidad.creada', {
        project_id,
        id,
        datos
      }, sourcePayload);

      // 4. Telemetria + retorno canonico
      this.metrics?.increment('_template.entidad.creada');
      this.metrics?.timing('_template.crear.duration_ms', Date.now() - startTime);
      this.logger.info('_template.entidad.creada', { project_id, id, correlation_id });

      return { status: 200, data: { id, project_id, datos, created_at: new Date(now).toISOString() } };
    } catch (err) {
      this.logger.error('_template.crear.failed', {
        project_id, error: err.message, correlation_id
      });
      this.metrics?.increment('_template.crear.errors', { code: 'INTERNAL_ERROR' });
      return {
        status: 500,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      };
    }
  }

  // ==========================================
  // UI Handlers (mqttRequest cross-modulo)
  // ==========================================

  async handleUiList(data) {
    const { project_id } = data || {};
    if (!project_id) {
      throw { status: 400, code: 'VALIDATION_FAILED', message: 'project_id requerido' };
    }
    try {
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
      this.logger.error('_template.ui.list.failed', { project_id, error: err.message });
      throw { status: 500, code: 'INTERNAL_ERROR', message: err.message };
    }
  }

  // ==========================================
  // DB handlers (response del database-manager)
  // ==========================================

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

  // ==========================================
  // Internals
  // ==========================================

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }

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

  async _ensureSchema(project_id) {
    if (this.schemaReady.has(project_id)) return;
    for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
      await this._db(project_id, stmt, []);
    }
    this.schemaReady.add(project_id);
  }
}

module.exports = TemplateModule;
