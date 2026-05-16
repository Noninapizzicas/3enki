/**
 * database-manager v3.0.0 — Reescrito al canon (POC2 #4 del horizontal).
 *
 * Acceso a SQLite por proyecto. Una DB por proyecto en
 * <basePath>/db/<slug>.sqlite (estructura nueva) o data/projects/<id>/db.sqlite
 * (legacy para system + _prompts).
 *
 * Responsabilidades acotadas (NO descomponer — un solo dominio):
 *  - Apertura/cache de conexiones SQLite por projectId.
 *  - Resolución de path con cascada: system → cache → query system DB → fallback legacy.
 *  - Ejecución de queries (read-only o write) con response correlacionada por request_id.
 *  - Inicialización de schemas (idempotente, ignora 'already exists').
 *  - Persist de alto nivel (insert/update/delete sin SQL crudo).
 *  - Tools del LLM: query (SELECT only), tables, schema, execute (DML/DDL).
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers devuelven { status, data | error: { code, message, details? } }.
 *  - observability: métricas con prefijo 'database-manager.*' + log + metric en cada path.
 *  - events: 8 eventos canónicos preservados invariantes (db.created/deleted/...).
 *  - lifecycle: onLoad inicializa, onUnload cierra TODAS las conexiones.
 *  - persistence: SQLite native escribe directo. saveDatabase es no-op preservado por API symmetry.
 *  - tools: 4 tools con shape canónico { status, data | error } + errores_conocidos declarados.
 *
 * 5 helpers POC2 transferibles + auxiliar específico:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError, _publicarEvento,
 *  + auxiliar: _slugify (resolución de paths).
 *
 * Monolito (1321 LOC) preservado en
 * arquitectura/migracion/_legacy/database-manager-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/database-manager-mapa.md
 */

'use strict';

const fs       = require('fs').promises;
const fsSync   = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const sqlite3  = require('sqlite3').verbose();

const { EVENTS } = require('../../core/constants');

const SYSTEM_PROJECTS = new Set(['system', '_prompts']);

class DatabaseManagerModule {
  constructor() {
    this.name    = 'database-manager';
    this.version = '3.0.0';

    this.logger    = null;
    this.metrics   = null;
    this.eventBus  = null;
    this.config    = null;

    // State runtime (NO persistido en archivos declarativos)
    this.databases    = new Map();  // projectId -> sqlite3.Database
    this.projectPaths = new Map();  // projectId -> { basePath, slug }
    this.projectsPath = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger    = core.logger;
    this.metrics   = core.metrics;
    this.eventBus  = core.eventBus;
    this.config    = core.moduleConfig || {};

    this.logger.info('database-manager.loading', {
      module: this.name, version: this.version
    });

    this.projectsPath = path.resolve(this.config.projectsPath || './data/projects');
    await this._ensureProjectsDirectory();

    this.logger.info('database-manager.loaded', {
      projects_path: this.projectsPath
    });
  }

  async onUnload() {
    this.logger.info('database-manager.unloading');
    for (const [projectId, db] of this.databases.entries()) {
      try {
        await new Promise(resolve => db.close(err => {
          if (err) {
            this.logger.error('database-manager.db.close.failed', {
              project_id: projectId, error: err.message
            });
            this.metrics?.increment('database-manager.errors', { kind: 'close' });
          }
          resolve();
        }));
      } catch (err) {
        this.logger.error('database-manager.db.close.unexpected', {
          project_id: projectId, error: err.message
        });
      }
    }
    this.databases.clear();
    this.projectPaths.clear();
    this.logger.info('database-manager.unloaded');
  }

  // ==========================================
  // Helpers internos privados (Promise-wrappers de sqlite3)
  // ==========================================

  _all(db, query, params = []) {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
  }

  _run(db, query, params = []) {
    return new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        err ? reject(err) : resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  _exec(db, sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, err => err ? reject(err) : resolve());
    });
  }

  async _ensureProjectsDirectory() {
    if (!fsSync.existsSync(this.projectsPath)) {
      await fs.mkdir(this.projectsPath, { recursive: true });
      this.logger.info('database-manager.projects_directory.created', {
        path: this.projectsPath
      });
    }
  }

  // ==========================================
  // Event handlers (subscribes del bus)
  // ==========================================

  async onQueryRequest(event) {
    const data = event.data || event;
    const { project_id, query, params = [], read_only = false, request_id, correlation_id } = data;
    const startTime = Date.now();

    if (!project_id || !query) {
      this.logger.warn('database-manager.query.invalid_payload', {
        has_project: !!project_id, has_query: !!query, request_id
      });
      this.metrics?.increment('database-manager.errors', { kind: 'query_invalid' });
      await this._publishQueryResponse(project_id, request_id, false, null,
        'project_id and query are required', correlation_id);
      return;
    }

    try {
      const db = await this._getDatabase(project_id);
      const results = await this._all(db, query, params);
      if (!read_only && this.config.autoSave !== false) {
        await this._saveDatabase(project_id);
      }
      const duration = Date.now() - startTime;

      this.metrics?.increment('database-manager.query.success', { read_only: read_only ? 'true' : 'false' });
      this.metrics?.timing('database-manager.query.duration', duration);
      this.logger.info('database-manager.query.success', {
        project_id, result_count: results.length, duration, request_id, correlation_id
      });

      await this._publishQueryResponse(project_id, request_id, true, results, null, correlation_id);
      // Background: emitir db.query.executed con métricas
      this._publishQueryExecuted(project_id, results.length, read_only, duration, correlation_id).catch(() => {});
    } catch (err) {
      const errorMsg = err?.message || String(err);
      this.logger.error('database-manager.query.failed', {
        project_id, error: errorMsg, request_id, correlation_id
      });
      this.metrics?.increment('database-manager.errors', { kind: 'query' });
      await this._publishQueryResponse(project_id, request_id, false, null, errorMsg, correlation_id);
    }
  }

  async onPersistRequest(event) {
    const data = event.data || event;
    const { project_id, table, operation, data: rowData, where, request_id, correlation_id } = data;

    if (!project_id || !table || !operation || !rowData) {
      this.logger.warn('database-manager.persist.invalid_payload', {
        request_id, missing: { project_id: !project_id, table: !table, operation: !operation, data: !rowData }
      });
      this.metrics?.increment('database-manager.errors', { kind: 'persist_invalid' });
      await this.eventBus.publish('db.persist.response', {
        request_id, success: false, error: 'missing required fields',
        timestamp: new Date().toISOString(),
        ...(correlation_id ? { correlation_id } : {})
      });
      return;
    }

    try {
      const db = await this._getDatabase(project_id);
      let query, sqlParams;

      if (operation === 'insert') {
        const cols = Object.keys(rowData);
        const placeholders = cols.map(() => '?').join(', ');
        query = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
        sqlParams = Object.values(rowData);
      } else if (operation === 'update') {
        const sets = Object.keys(rowData).map(k => `${k} = ?`).join(', ');
        const wheres = Object.keys(where || {}).map(k => `${k} = ?`).join(' AND ');
        query = `UPDATE ${table} SET ${sets}${wheres ? ` WHERE ${wheres}` : ''}`;
        sqlParams = [...Object.values(rowData), ...Object.values(where || {})];
      } else if (operation === 'delete') {
        const wheres = Object.keys(where || {}).map(k => `${k} = ?`).join(' AND ');
        query = `DELETE FROM ${table}${wheres ? ` WHERE ${wheres}` : ''}`;
        sqlParams = Object.values(where || {});
      } else {
        throw Object.assign(new Error(`unknown operation: ${operation}`),
          { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'operation' } });
      }

      await this._run(db, query, sqlParams);
      if (this.config.autoSave !== false) await this._saveDatabase(project_id);

      this.metrics?.increment('database-manager.persist.success', { operation });
      await this.eventBus.publish('db.persist.response', {
        request_id, success: true, table, operation,
        timestamp: new Date().toISOString(),
        ...(correlation_id ? { correlation_id } : {})
      });
    } catch (err) {
      this.logger.error('database-manager.persist.failed', {
        project_id, table, operation, error: err.message, request_id, correlation_id
      });
      this.metrics?.increment('database-manager.errors', { kind: 'persist' });
      await this.eventBus.publish('db.persist.response', {
        request_id, success: false, error: err.message,
        timestamp: new Date().toISOString(),
        ...(correlation_id ? { correlation_id } : {})
      });
    }
  }

  async onSchemaInitRequest(event) {
    const data = event.data || event;
    const { project_id, schema, request_id, correlation_id } = data;

    if (!schema || typeof schema !== 'string' || schema.trim().length === 0) {
      this.logger.warn('database-manager.schema_init.invalid_payload', {
        project_id, request_id, schema_type: typeof schema
      });
      this.metrics?.increment('database-manager.errors', { kind: 'schema_invalid' });
      await this._publishSchemaInitResponse(project_id, request_id, false,
        'Schema is required and must be a non-empty string', correlation_id);
      return;
    }

    try {
      const db = await this._getDatabase(project_id);
      const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        await this._exec(db, stmt + ';').catch(err => {
          // Ignorar errores de tabla/índice ya existente (idempotencia)
          if (!err.message.includes('already exists') &&
              !err.message.includes('more than one primary key')) {
            throw err;
          }
        });
      }
      await this._saveDatabase(project_id);

      this.metrics?.increment('database-manager.schema_init.success');
      this.logger.info('database-manager.schema_init.success', {
        project_id, request_id, correlation_id, statements: statements.length
      });

      await this._publishSchemaInitResponse(project_id, request_id, true, null, correlation_id);
      await this._publicarEvento(EVENTS.DB.SCHEMA_INITIALIZED, {
        project_id,
        initialized_at: new Date().toISOString()
      }, { correlation_id });
    } catch (err) {
      const errorMsg = err.message;
      this.logger.error('database-manager.schema_init.failed', {
        project_id, error: errorMsg, request_id, correlation_id
      });
      this.metrics?.increment('database-manager.errors', { kind: 'schema_init' });
      await this._publishSchemaInitResponse(project_id, request_id, false, errorMsg, correlation_id);
    }
  }

  // ==========================================
  // HTTP API handlers
  // ==========================================

  async handleListDatabases() {
    try {
      const databases = [];
      if (fsSync.existsSync(this.projectsPath)) {
        const entries = await fs.readdir(this.projectsPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const dirName = entry.name;
          const legacyPath = path.join(this.projectsPath, dirName, 'db.sqlite');
          const newPath    = path.join(this.projectsPath, dirName, 'db', `${dirName}.sqlite`);
          let dbPath = null;
          if (fsSync.existsSync(newPath))      dbPath = newPath;
          else if (fsSync.existsSync(legacyPath)) dbPath = legacyPath;

          const dbInfo = {
            project_id: dirName,
            loaded: this.databases.has(dirName),
            exists: !!dbPath
          };
          if (dbPath) {
            const stats = await fs.stat(dbPath);
            dbInfo.size = stats.size;
            dbInfo.last_modified = stats.mtime.toISOString();
            dbInfo.path = dbPath;
          }
          databases.push(dbInfo);
        }
      }
      return {
        status: 200,
        data: { databases, total: databases.length, projects_path: this.projectsPath }
      };
    } catch (err) {
      return this._handleHandlerError('database-manager.http.list.failed', err, 'http_list');
    }
  }

  async handleExecuteQuery(req, context) {
    const startTime = Date.now();
    const { projectId } = context.params;
    const { query, params = [], read_only = false } = context.body || {};

    if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
      { kind: 'domain', field: 'projectId' });
    if (!query) return this._errorResponse(400, 'INVALID_INPUT', 'query is required',
      { kind: 'domain', field: 'query' });

    try {
      const db = await this._getDatabase(projectId);
      const results = await this._all(db, query, params);
      if (!read_only && this.config.autoSave !== false) await this._saveDatabase(projectId);
      const duration = Date.now() - startTime;

      this.metrics?.increment('database-manager.http.execute_query.success');
      this.metrics?.timing('database-manager.query.duration', duration);
      await this._publishQueryExecuted(projectId, results.length, read_only, duration, context?.correlationId);

      return { status: 200, data: { project_id: projectId, results, count: results.length, duration } };
    } catch (err) {
      return this._handleHandlerError('database-manager.http.execute_query.failed', err, 'http_execute_query');
    }
  }

  async handleGetSchema(req, context) {
    const { projectId } = context.params;
    if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
      { kind: 'domain', field: 'projectId' });

    try {
      const db = await this._getDatabase(projectId);
      const tables = await this._all(db,
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      return {
        status: 200,
        data: { project_id: projectId, tables, table_count: tables.length }
      };
    } catch (err) {
      return this._handleHandlerError('database-manager.http.get_schema.failed', err, 'http_get_schema');
    }
  }

  async handleInitSchema(req, context) {
    const { projectId } = context.params;
    const { schema } = context.body || {};
    if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
      { kind: 'domain', field: 'projectId' });
    if (!schema) return this._errorResponse(400, 'INVALID_INPUT', 'schema is required',
      { kind: 'domain', field: 'schema' });

    try {
      const db = await this._getDatabase(projectId);
      await this._exec(db, schema);
      await this._saveDatabase(projectId);

      this.metrics?.increment('database-manager.http.init_schema.success');
      await this._publicarEvento('db.schema.initialized', {
        project_id: projectId,
        initialized_at: new Date().toISOString()
      }, { correlation_id: context?.correlationId });

      return { status: 200, data: { project_id: projectId, message: 'Schema initialized successfully' } };
    } catch (err) {
      return this._handleHandlerError('database-manager.http.init_schema.failed', err, 'http_init_schema');
    }
  }

  async handleDeleteDatabase(req, context) {
    const { projectId } = context.params;
    if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
      { kind: 'domain', field: 'projectId' });

    try {
      if (this.databases.has(projectId)) {
        const db = this.databases.get(projectId);
        try { db.close(); } catch (_) {}
        this.databases.delete(projectId);
      }
      this.projectPaths.delete(projectId);

      const { dbPath } = await this._resolveDatabasePath(projectId);

      if (!fsSync.existsSync(dbPath)) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Database not found',
          { entity_type: 'database', entity_id: projectId });
      }

      await fs.unlink(dbPath);
      this.metrics?.increment('database-manager.http.delete.success');

      await this._publicarEvento('db.deleted', {
        project_id: projectId,
        deleted_at: new Date().toISOString()
      }, { correlation_id: context?.correlationId });

      return { status: 200, data: { project_id: projectId, message: 'Database deleted successfully' } };
    } catch (err) {
      return this._handleHandlerError('database-manager.http.delete.failed', err, 'http_delete');
    }
  }

  async handleListTables(req, context) {
    const { projectId } = context.params;
    if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
      { kind: 'domain', field: 'projectId' });

    try {
      const db = await this._getDatabase(projectId);
      const rows = await this._all(db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const tables = rows.map(row => row.name);
      return { status: 200, data: { project_id: projectId, tables, count: tables.length } };
    } catch (err) {
      return this._handleHandlerError('database-manager.http.list_tables.failed', err, 'http_list_tables');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        loaded_databases: this.databases.size,
        projects_path: this.projectsPath
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        module: this.name,
        metrics: {
          loaded_databases: this.databases.size,
          cached_paths: this.projectPaths.size
        }
      }
    };
  }

  // ==========================================
  // Tools del LLM (shape canónico)
  // ==========================================

  async handleToolQuery(args) {
    try {
      const { projectId, query, params = [] } = args || {};
      if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
        { kind: 'domain', field: 'projectId' });
      if (!query) return this._errorResponse(400, 'INVALID_INPUT', 'query is required',
        { kind: 'domain', field: 'query' });

      const normalizedQuery = query.trim().toUpperCase();
      if (!normalizedQuery.startsWith('SELECT')) {
        return this._errorResponse(403, 'PERMISSION_DENIED',
          'Only SELECT queries allowed via db.query — use db.execute for INSERT/UPDATE/DELETE',
          { kind: 'security', allowed: 'SELECT' });
      }

      const startTime = Date.now();
      const db = await this._getDatabase(projectId);
      const results = await this._all(db, query, params);
      const duration = Date.now() - startTime;

      this.metrics?.increment('database-manager.tool.query.success');
      this.metrics?.timing('database-manager.query.duration', duration);

      return {
        status: 200,
        data: { projectId, results, count: results.length, duration }
      };
    } catch (err) {
      return this._handleHandlerError('database-manager.tool.query.failed', err, 'tool_query');
    }
  }

  async handleToolTables(args) {
    try {
      const { projectId } = args || {};
      if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
        { kind: 'domain', field: 'projectId' });

      const db = await this._getDatabase(projectId);
      const rows = await this._all(db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const tables = rows.map(row => row.name);
      this.metrics?.increment('database-manager.tool.tables.success');
      return { status: 200, data: { projectId, tables, count: tables.length } };
    } catch (err) {
      return this._handleHandlerError('database-manager.tool.tables.failed', err, 'tool_tables');
    }
  }

  async handleToolSchema(args) {
    try {
      const { projectId, tableName } = args || {};
      if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
        { kind: 'domain', field: 'projectId' });
      if (!tableName) return this._errorResponse(400, 'INVALID_INPUT', 'tableName is required',
        { kind: 'domain', field: 'tableName' });

      const db = await this._getDatabase(projectId);
      const columnRows = await this._all(db, `PRAGMA table_info("${tableName}")`);
      const columns = columnRows.map(row => ({
        name: row.name,
        type: row.type,
        notnull: row.notnull === 1,
        default_value: row.dflt_value,
        primary_key: row.pk === 1
      }));

      if (columns.length === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Table '${tableName}' not found`,
          { entity_type: 'table', entity_id: tableName });
      }

      const fkRows = await this._all(db, `PRAGMA foreign_key_list("${tableName}")`);
      const foreignKeys = fkRows.map(row => ({
        column: row.from, references_table: row.table,
        references_column: row.to, on_update: row.on_update, on_delete: row.on_delete
      }));

      const idxRows = await this._all(db, `PRAGMA index_list("${tableName}")`);
      const indexes = idxRows.map(row => ({ name: row.name, unique: row.unique === 1 }));

      const sqlRows = await this._all(db,
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [tableName]);
      const createStatement = sqlRows.length > 0 ? sqlRows[0].sql : null;

      this.metrics?.increment('database-manager.tool.schema.success');
      return {
        status: 200,
        data: { projectId, tableName, columns, foreignKeys, indexes, createStatement }
      };
    } catch (err) {
      return this._handleHandlerError('database-manager.tool.schema.failed', err, 'tool_schema');
    }
  }

  async handleToolExecute(args) {
    try {
      const { projectId, query, params = [] } = args || {};
      if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'projectId is required',
        { kind: 'domain', field: 'projectId' });
      if (!query) return this._errorResponse(400, 'INVALID_INPUT', 'query is required',
        { kind: 'domain', field: 'query' });

      const normalizedQuery = query.trim().toUpperCase();
      if (normalizedQuery.startsWith('SELECT')) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Use db.query for SELECT statements — db.execute is for INSERT/UPDATE/DELETE/CREATE/ALTER/DROP',
          { kind: 'domain', allowed: 'NOT SELECT' });
      }

      const startTime = Date.now();
      const db = await this._getDatabase(projectId);
      const runResult = await this._run(db, query, params);
      const affectedRows = runResult.changes;
      const lastInsertId = normalizedQuery.startsWith('INSERT') ? runResult.lastID : null;
      if (this.config.autoSave !== false) await this._saveDatabase(projectId);
      const duration = Date.now() - startTime;

      this.metrics?.increment('database-manager.tool.execute.success');
      this.metrics?.timing('database-manager.query.duration', duration);
      await this._publishQueryExecuted(projectId, affectedRows, false, duration, null);

      return {
        status: 200,
        data: { projectId, affectedRows, lastInsertId, duration }
      };
    } catch (err) {
      return this._handleHandlerError('database-manager.tool.execute.failed', err, 'tool_execute');
    }
  }

  // ==========================================
  // Resolución de paths + apertura SQLite
  // ==========================================

  async _resolveDatabasePath(projectId) {
    if (SYSTEM_PROJECTS.has(projectId)) {
      const projectDir = path.join(this.projectsPath, projectId);
      return { projectDir, dbPath: path.join(projectDir, 'db.sqlite'), isSystem: true };
    }

    if (this.projectPaths.has(projectId)) {
      const cached = this.projectPaths.get(projectId);
      return {
        projectDir: cached.basePath,
        dbPath: path.join(cached.basePath, 'db', `${cached.slug}.sqlite`),
        isSystem: false
      };
    }

    try {
      const systemDb = await this._getDatabase('system');
      const result = await this._all(systemDb,
        'SELECT base_path, name FROM projects WHERE id = ?', [projectId]);
      if (result.length > 0 && result[0].base_path) {
        const { base_path: basePath, name } = result[0];
        const slug = this._slugify(name) || projectId.slice(0, 8);
        this.projectPaths.set(projectId, { basePath, slug });
        return {
          projectDir: basePath,
          dbPath: path.join(basePath, 'db', `${slug}.sqlite`),
          isSystem: false
        };
      }
    } catch (err) {
      this.logger.debug('database-manager.resolve.fallback', {
        project_id: projectId, error: err.message
      });
    }

    // Fallback legacy
    const projectDir = path.join(this.projectsPath, projectId);
    return { projectDir, dbPath: path.join(projectDir, 'db.sqlite'), isSystem: true };
  }

  async _getDatabase(projectId) {
    if (this.databases.has(projectId)) return this.databases.get(projectId);

    const { dbPath, isSystem } = await this._resolveDatabasePath(projectId);
    const dbDir = path.dirname(dbPath);
    if (!fsSync.existsSync(dbDir)) await fs.mkdir(dbDir, { recursive: true });
    const isNew = !fsSync.existsSync(dbPath);

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          this.logger.error('database-manager.db.open.failed', {
            project_id: projectId, db_path: dbPath, error: err.message
          });
          this.metrics?.increment('database-manager.errors', { kind: 'open' });
          return reject(err);
        }
        this.databases.set(projectId, db);
        if (isNew) {
          this._publicarEvento('db.created', {
            project_id: projectId,
            created_at: new Date().toISOString()
          }).catch(() => {});
          this.metrics?.increment('database-manager.created');
          this.logger.info('database-manager.created.new', { project_id: projectId, db_path: dbPath, is_system: isSystem });
        } else {
          this.logger.debug('database-manager.loaded.existing', { project_id: projectId });
        }
        resolve(db);
      });
    });
  }

  async _saveDatabase(_projectId) {
    // sqlite3 nativo escribe directo a disco — preservado por API symmetry
    return true;
  }

  // ==========================================
  // Event publishers privados
  // ==========================================

  async _publishQueryResponse(projectId, requestId, success, data, error, correlationId) {
    const payload = {
      request_id: requestId,
      project_id: projectId,
      success,
      timestamp: new Date().toISOString()
    };
    if (success) payload.data = data || [];
    else payload.error = error || 'Unknown error';
    if (correlationId) payload.correlation_id = correlationId;
    await this.eventBus.publish('db.query.response', payload);
  }

  async _publishSchemaInitResponse(projectId, requestId, success, error, correlationId) {
    const payload = {
      request_id: requestId,
      project_id: projectId,
      success,
      timestamp: new Date().toISOString()
    };
    if (!success && error) payload.error = error;
    if (correlationId) payload.correlation_id = correlationId;
    await this.eventBus.publish('db.schema.init.response', payload);
  }

  async _publishQueryExecuted(projectId, resultCount, readOnly, duration, correlationId) {
    const payload = {
      project_id: projectId,
      result_count: resultCount,
      read_only: readOnly,
      duration,
      executed_at: new Date().toISOString()
    };
    if (correlationId) payload.correlation_id = correlationId;
    await this.eventBus.publish('db.query.executed', payload);
  }

  // ==========================================
  // Helpers POC2 (transferibles)
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT' ? 400 :
                   code === 'RESOURCE_NOT_FOUND' ? 404 :
                   code === 'PERMISSION_DENIED' ? 403 :
                   code === 'CONFLICT_STATE' ? 409 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('database-manager.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no such table')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('syntax error')) return 'INVALID_INPUT';
    if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('not allowed')) return 'PERMISSION_DENIED';
    if (msg.includes('unique') || msg.includes('constraint') || msg.includes('already exists')) return 'CONFLICT_STATE';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      timestamp: new Date().toISOString(),
      ...payload
    };
    if (sourcePayload?.correlation_id) enriched.correlation_id = sourcePayload.correlation_id;
    else enriched.correlation_id = crypto.randomUUID();
    await this.eventBus.publish(name, enriched);
  }

  _slugify(name) {
    return String(name || '').toLowerCase().trim()
      .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i').replace(/[óòöôõ]/g, 'o')
      .replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
      .replace(/[^a-z0-9\s-]/g, '').replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
}

module.exports = DatabaseManagerModule;
