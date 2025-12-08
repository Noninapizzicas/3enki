/**
 * Database Manager Module
 * SQLite database management using sql.js (JavaScript-only)
 *
 * Follows event-driven architecture - NO HTTP internal calls
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');

class DatabaseManagerModule {
  constructor() {
    this.name = 'database-manager';
    this.version = '2.0.0';

    // State
    this.databases = new Map(); // projectId -> db instance
    this.SQL = null;
    this.projectsPath = null;

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Configure projects path
    this.projectsPath = path.resolve(
      this.config.projectsPath || './data/projects'
    );

    // Initialize sql.js
    await this.initializeSqlJs();

    // Create projects directory
    await this.ensureProjectsDirectory();

    // Subscribe to events
    await this.subscribeToEvents();

    // Update metrics
    // REMOVED (migrate-to-event-metrics): this.metrics.gauge('db.loaded.count', this.databases.size);
    // → Emit db.loaded event with `count: this.databases.size`
    // REMOVED (migrate-to-event-metrics): this.metrics.gauge('db.projects.count', await this.countProjects()
    // → Add `projects_count` to db events);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      projects_path: this.projectsPath
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Close all database connections
    for (const [projectId, db] of this.databases.entries()) {
      try {
        db.close();
        this.logger.info('db.closed', { project_id: projectId });
      } catch (error) {
        this.logger.error('db.close.error', {
          project_id: projectId,
          error: error.message
        });
      }
    }

    this.databases.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Initialization Helpers
  // ==========================================

  async initializeSqlJs() {
    try {
      this.SQL = await initSqlJs();
      this.logger.info('sql.js.initialized', {
        version: this.SQL.version || 'unknown'
      });
    } catch (error) {
      this.logger.error('sql.js.init.failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async ensureProjectsDirectory() {
    if (!fsSync.existsSync(this.projectsPath)) {
      await fs.mkdir(this.projectsPath, { recursive: true });
      this.logger.info('projects.directory.created', {
        path: this.projectsPath
      });
    }
  }

  async countProjects() {
    try {
      if (!fsSync.existsSync(this.projectsPath)) return 0;
      const entries = await fs.readdir(this.projectsPath, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).length;
    } catch {
      return 0;
    }
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe(
      EVENTS.DB.QUERY_REQUEST,
      this.onQueryRequest.bind(this)
    );

    await this.eventBus.subscribe(
      EVENTS.DB.SCHEMA_INIT_REQUEST,
      this.onSchemaInitRequest.bind(this)
    );

    this.logger.info('events.subscribed', {
      events: [EVENTS.DB.QUERY_REQUEST, EVENTS.DB.SCHEMA_INIT_REQUEST]
    });
  }

  // ==========================================
  // Event Handlers (from other modules)
  // ==========================================

  async onQueryRequest(event) {
    const {
      project_id,
      query,
      params = [],
      read_only = false,
      request_id,
      correlation_id
    } = event.payload || event;

    this.logger.info('query.request.received', {
      project_id,
      query: query.substring(0, 100),
      read_only,
      request_id,
      correlation_id
    });

    const startTime = Date.now();

    try {
      const db = await this.getDatabase(project_id);
      const results = [];

      const stmt = db.prepare(query);
      if (params.length > 0) {
        stmt.bind(params);
      }

      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();

      if (!read_only && this.config.autoSave !== false) {
        await this.saveDatabase(project_id);
      }

      const duration = Date.now() - startTime;

      this.logger.info('query.request.success', {
        project_id,
        result_count: results.length,
        duration,
        correlation_id
      });

      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.query.total');
    // → Counter extracted from events
    // → Counter from db.query.completed events
      // REMOVED: this.metrics.timing('db.query.duration', duration);

      // Publish response event
      await this.publishQueryResponse(
        project_id,
        request_id,
        true,
        results,
        null,
        correlation_id
      );
    } catch (error) {
      this.logger.error('query.request.error', {
        project_id,
        error: error.message,
        correlation_id
      });

      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.query.errors');
    // → Counter extracted from events
    // → Use error field in db.query.completed

      await this.publishQueryResponse(
        project_id,
        request_id,
        false,
        null,
        error.message,
        correlation_id
      );
    }
  }

  async onSchemaInitRequest(event) {
    const {
      project_id,
      schema,
      request_id,
      correlation_id
    } = event.payload || event;

    this.logger.info('schema.init.request.received', {
      project_id,
      request_id,
      correlation_id
    });

    try {
      const db = await this.getDatabase(project_id);
      db.exec(schema);
      await this.saveDatabase(project_id);

      this.logger.info('schema.init.request.success', {
        project_id,
        correlation_id
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.schema.init.total');
    // → Counter extracted from events

      // Publish response event
      await this.publishSchemaInitResponse(
        project_id,
        request_id,
        true,
        null,
        correlation_id
      );

      // Publish schema initialized event
      await this.eventBus.publish(EVENTS.DB.SCHEMA_INITIALIZED, {
        project_id,
        initialized_at: new Date().toISOString()
      }, { correlationId: correlation_id });
    } catch (error) {
      this.logger.error('schema.init.request.error', {
        project_id,
        error: error.message,
        correlation_id
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.schema.init.errors');
    // → Counter extracted from events

      await this.publishSchemaInitResponse(
        project_id,
        request_id,
        false,
        error.message,
        correlation_id
      );
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleListDatabases(req, context) {
    this.logger.info('databases.list.start', {
      correlation_id: context.correlationId
    });

    try {
      const databases = [];

      if (fsSync.existsSync(this.projectsPath)) {
        const entries = await fs.readdir(this.projectsPath, {
          withFileTypes: true
        });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const projectId = entry.name;
            const dbPath = path.join(this.projectsPath, projectId, 'db.sqlite');

            const dbInfo = {
              project_id: projectId,
              loaded: this.databases.has(projectId),
              exists: fsSync.existsSync(dbPath)
            };

            if (dbInfo.exists) {
              const stats = await fs.stat(dbPath);
              dbInfo.size = stats.size;
              dbInfo.last_modified = stats.mtime.toISOString();
            }

            databases.push(dbInfo);
          }
        }
      }

      this.logger.info('databases.listed', {
        count: databases.length,
        correlation_id: context.correlationId
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('db.projects.count', databases.length);
    // → Add `projects_count` to db events

      return {
        status: 200,
        data: {
          success: true,
          databases,
          total: databases.length,
          projects_path: this.projectsPath
        }
      };
    } catch (error) {
      this.logger.error('databases.list.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to list databases',
          message: error.message
        }
      };
    }
  }

  async handleExecuteQuery(req, context) {
    const startTime = Date.now();
    const { projectId } = context.params;
    const { query, params = [], read_only = false } = context.body;

    this.logger.info('query.execute.start', {
      project_id: projectId,
      query: query.substring(0, 100),
      read_only,
      correlation_id: context.correlationId
    });

    try {
      const db = await this.getDatabase(projectId);
      const results = [];

      const stmt = db.prepare(query);
      if (params.length > 0) {
        stmt.bind(params);
      }

      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();

      if (!read_only && this.config.autoSave !== false) {
        await this.saveDatabase(projectId);
      }

      const duration = Date.now() - startTime;

      // Metrics
      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.query.total');
    // → Counter extracted from events
    // → Counter from db.query.completed events
      // REMOVED: this.metrics.timing('db.query.duration', duration);

      // Publish event
      await this.publishQueryExecuted(projectId, results.length, read_only, duration, context.correlationId);

      this.logger.info('query.executed', {
        project_id: projectId,
        result_count: results.length,
        duration,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          project_id: projectId,
          results,
          count: results.length,
          duration
        }
      };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.query.errors');
    // → Counter extracted from events
    // → Use error field in db.query.completed

      this.logger.error('query.execute.error', {
        project_id: projectId,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          project_id: projectId,
          error: 'Query execution failed',
          message: error.message
        }
      };
    }
  }

  async handleGetSchema(req, context) {
    const { projectId } = context.params;

    this.logger.info('schema.get.start', {
      project_id: projectId,
      correlation_id: context.correlationId
    });

    try {
      const db = await this.getDatabase(projectId);

      const stmt = db.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tables = [];

      while (stmt.step()) {
        tables.push(stmt.getAsObject());
      }
      stmt.free();

      this.logger.info('schema.retrieved', {
        project_id: projectId,
        table_count: tables.length,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          project_id: projectId,
          tables,
          table_count: tables.length
        }
      };
    } catch (error) {
      this.logger.error('schema.get.error', {
        project_id: projectId,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          project_id: projectId,
          error: 'Failed to retrieve schema',
          message: error.message
        }
      };
    }
  }

  async handleInitSchema(req, context) {
    const { projectId } = context.params;
    const { schema } = context.body;

    this.logger.info('schema.init.start', {
      project_id: projectId,
      correlation_id: context.correlationId
    });

    try {
      const db = await this.getDatabase(projectId);
      db.exec(schema);
      await this.saveDatabase(projectId);

      // Metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.schema.init.total');
    // → Counter extracted from events

      // Publish event
      await this.eventBus.publish('db.schema.initialized', {
        project_id: projectId,
        initialized_at: new Date().toISOString()
      }, { correlationId: context.correlationId });

      this.logger.info('schema.initialized', {
        project_id: projectId,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          project_id: projectId,
          message: 'Schema initialized successfully'
        }
      };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.schema.init.errors');
    // → Counter extracted from events

      this.logger.error('schema.init.error', {
        project_id: projectId,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          project_id: projectId,
          error: 'Schema initialization failed',
          message: error.message
        }
      };
    }
  }

  async handleDeleteDatabase(req, context) {
    const { projectId } = context.params;

    this.logger.info('db.delete.start', {
      project_id: projectId,
      correlation_id: context.correlationId
    });

    try {
      // Close connection if open
      if (this.databases.has(projectId)) {
        const db = this.databases.get(projectId);
        db.close();
        this.databases.delete(projectId);
      }

      const dbPath = path.join(this.projectsPath, projectId, 'db.sqlite');

      if (fsSync.existsSync(dbPath)) {
        await fs.unlink(dbPath);

        // Metrics
        // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.deleted.total');
    // → Counter extracted from events
        // REMOVED (migrate-to-event-metrics): this.metrics.gauge('db.loaded.count', this.databases.size);
    // → Emit db.loaded event with `count: this.databases.size`

        // Publish event
        await this.eventBus.publish('db.deleted', {
          project_id: projectId,
          deleted_at: new Date().toISOString()
        }, { correlationId: context.correlationId });

        this.logger.info('db.deleted', {
          project_id: projectId,
          correlation_id: context.correlationId
        });

        return {
          status: 200,
          data: {
            success: true,
            project_id: projectId,
            message: 'Database deleted successfully'
          }
        };
      } else {
        return {
          status: 404,
          data: {
            success: false,
            project_id: projectId,
            error: 'Database not found'
          }
        };
      }
    } catch (error) {
      this.logger.error('db.delete.error', {
        project_id: projectId,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          project_id: projectId,
          error: 'Failed to delete database',
          message: error.message
        }
      };
    }
  }

  async handleListTables(req, context) {
    const { projectId } = context.params;

    this.logger.info('tables.list.start', {
      project_id: projectId,
      correlation_id: context.correlationId
    });

    try {
      const db = await this.getDatabase(projectId);

      const stmt = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      const tables = [];

      while (stmt.step()) {
        const row = stmt.getAsObject();
        tables.push(row.name);
      }
      stmt.free();

      this.logger.info('tables.listed', {
        project_id: projectId,
        count: tables.length,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          project_id: projectId,
          tables,
          count: tables.length
        }
      };
    } catch (error) {
      this.logger.error('tables.list.error', {
        project_id: projectId,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          project_id: projectId,
          error: 'Failed to list tables',
          message: error.message
        }
      };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        loaded_databases: this.databases.size,
        projects_path: this.projectsPath
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'db.created.total': this.metrics.getCounter('db.created.total') || 0,
          'db.deleted.total': this.metrics.getCounter('db.deleted.total') || 0,
          'db.query.total': this.metrics.getCounter('db.query.total') || 0,
          'db.query.errors': this.metrics.getCounter('db.query.errors') || 0,
          'db.schema.init.total': this.metrics.getCounter('db.schema.init.total') || 0,
          'db.schema.init.errors': this.metrics.getCounter('db.schema.init.errors') || 0
        },
        gauges: {
          'db.loaded.count': this.databases.size,
          'db.projects.count': await this.countProjects()
        }
      }
    };
  }

  // ==========================================
  // Database Operations
  // ==========================================

  async getDatabase(projectId) {
    if (this.databases.has(projectId)) {
      return this.databases.get(projectId);
    }

    const startTime = Date.now();
    const projectDir = path.join(this.projectsPath, projectId);
    const dbPath = path.join(projectDir, 'db.sqlite');

    this.logger.info('db.loading', {
      project_id: projectId,
      db_path: dbPath
    });

    try {
      let db;

      if (fsSync.existsSync(dbPath)) {
        const fileBuffer = await fs.readFile(dbPath);
        db = new this.SQL.Database(fileBuffer);
        this.logger.info('db.loaded.existing', { project_id: projectId });
      } else {
        if (!fsSync.existsSync(projectDir)) {
          await fs.mkdir(projectDir, { recursive: true });
        }
        db = new this.SQL.Database();

        // Metrics
        // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.created.total');
    // → Counter extracted from events

        // Publish event
        await this.eventBus.publish('db.created', {
          project_id: projectId,
          created_at: new Date().toISOString()
        });

        this.logger.info('db.created.new', { project_id: projectId });
      }

      this.databases.set(projectId, db);

      const duration = Date.now() - startTime;
      // REMOVED: this.metrics.timing('db.load.duration', duration);
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('db.loaded.count', this.databases.size);
    // → Emit db.loaded event with `count: this.databases.size`

      return db;
    } catch (error) {
      this.logger.error('db.load.error', {
        project_id: projectId,
        error: error.message
      });
      throw error;
    }
  }

  async saveDatabase(projectId) {
    if (!this.databases.has(projectId)) {
      this.logger.warn('db.save.not_loaded', { project_id: projectId });
      return false;
    }

    const startTime = Date.now();
    const db = this.databases.get(projectId);
    const projectDir = path.join(this.projectsPath, projectId);
    const dbPath = path.join(projectDir, 'db.sqlite');

    try {
      if (!fsSync.existsSync(projectDir)) {
        await fs.mkdir(projectDir, { recursive: true });
      }

      const data = db.export();
      const buffer = Buffer.from(data);
      await fs.writeFile(dbPath, buffer);

      const duration = Date.now() - startTime;

      this.logger.info('db.saved', {
        project_id: projectId,
        duration
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.saved.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.timing('db.save.duration', duration);

      return true;
    } catch (error) {
      this.logger.error('db.save.error', {
        project_id: projectId,
        error: error.message
      });

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('db.save.errors');
    // → Counter extracted from events
      throw error;
    }
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishQueryExecuted(projectId, resultCount, readOnly, duration, correlationId) {
    await this.eventBus.publish('db.query.executed', {
      project_id: projectId,
      result_count: resultCount,
      read_only: readOnly,
      duration
    }, { correlationId });
  }

  async publishQueryResponse(projectId, requestId, success, data, error, correlationId) {
    await this.eventBus.publish(EVENTS.DB.QUERY_RESPONSE, {
      project_id: projectId,
      request_id: requestId,
      success,
      data: data || [],
      error: error || null
    }, { correlationId });
  }

  async publishSchemaInitResponse(projectId, requestId, success, error, correlationId) {
    await this.eventBus.publish(EVENTS.DB.SCHEMA_INIT_RESPONSE, {
      project_id: projectId,
      request_id: requestId,
      success,
      error: error || null
    }, { correlationId });
  }
}

module.exports = DatabaseManagerModule;
