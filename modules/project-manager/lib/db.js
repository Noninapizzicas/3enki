/**
 * Project Manager - Database Layer
 * queryDatabase, event-based DB communication, initialization, migration
 */

const crypto = require('crypto');
const SYSTEM_PROJECT_NAME = 'Sistema';

module.exports = {

  /**
   * Query database via event-based request/response
   */
  async queryDatabase(query, params = [], readOnly = true, correlationId) {
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDbRequests.delete(requestId);
        reject(new Error(`Database query timeout (${this.config.dbTimeout || 10000}ms): ${query.substring(0, 100)}`));
      }, this.config.dbTimeout || 10000);

      this.pendingDbRequests.set(requestId, { resolve, reject, timeout });

      this.eventBus.publish('db.query.request', {
        request_id: requestId,
        query,
        params,
        read_only: readOnly,
        project_id: 'system',
        correlation_id: correlationId
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingDbRequests.delete(requestId);
        reject(err);
      });
    });
  },

  /**
   * Handle db.query.response - resolve pending database requests
   */
  async onDbQueryResponse(event) {
    const eventData = event.data || event;
    const { request_id, success, data, error } = eventData;

    const pending = this.pendingDbRequests.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingDbRequests.delete(request_id);

    if (success) {
      pending.resolve(data || []);
    } else {
      pending.reject(new Error(error || 'Database query failed'));
    }
  },

  /**
   * Initialize the system database schema (projects table + composition tables)
   * Must be called before any queries against the system database
   */
  async initializeSystemSchema() {
    const correlationId = crypto.randomUUID();
    this.logger.info('project-manager.schema.initializing', { correlationId });

    try {
      // Create the projects table
      await this.queryDatabase(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          is_active INTEGER DEFAULT 0,
          metadata TEXT,
          last_conversation_id TEXT,
          provider TEXT,
          model TEXT,
          prompt_id TEXT,
          base_path TEXT,
          session_state TEXT,
          system_id TEXT,
          system_role TEXT,
          parent_project_id TEXT
        )
      `, [], false, correlationId);

      // Create composition tables
      await this.initializeCompositionTables(correlationId);

      this.logger.info('project-manager.schema.initialized', { correlationId });
    } catch (error) {
      this.logger.error('project-manager.schema.failed', { correlationId, error: error.message });
    }
  },

  /**
   * Load existing projects from database on startup
   */
  async loadExistingProjects() {
    const correlationId = crypto.randomUUID();
    this.logger.info('project-manager.db.loading', { correlationId });

    try {
      const projects = await this.queryDatabase(
        'SELECT * FROM projects ORDER BY created_at',
        [],
        true,
        correlationId
      );

      for (const row of projects) {
        const project = {
          id: row.id,
          name: row.name,
          description: row.description,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_active: row.is_active === 1,
          metadata: row.metadata ? JSON.parse(row.metadata) : {},
          last_conversation_id: row.last_conversation_id,
          provider: row.provider,
          model: row.model,
          prompt_id: row.prompt_id,
          base_path: row.base_path,
          session_state: row.session_state ? JSON.parse(row.session_state) : {},
          system_id: row.system_id || null,
          system_role: row.system_role || null,
          parent_project_id: row.parent_project_id || null
        };

        this.projects.set(project.id, project);

        if (project.is_active) {
          this.activeProjectId = project.id;
        }
      }

      this.logger.info('project-manager.db.loaded', { correlationId, count: projects.length, activeProjectId: this.activeProjectId });
    } catch (error) {
      this.logger.error('project-manager.db.load.failed', { correlationId, error: error.message });
    }
  },

  /**
   * Ensure the system project exists
   */
  async ensureSystemProject() {
    const correlationId = crypto.randomUUID();
    this.logger.debug('project-manager.system.ensuring', { correlationId });

    // Check if system project already exists
    const existingSystem = Array.from(this.projects.values()).find(
      p => p.name === SYSTEM_PROJECT_NAME || p.metadata?.is_system
    );

    if (existingSystem) {
      this.logger.debug('project-manager.system.exists', { correlationId, projectId: existingSystem.id });
      return existingSystem;
    }

    try {
      const projectId = crypto.randomUUID();
      const now = new Date().toISOString();
      const basePath = process.cwd();
      const metadata = {
        is_system: true,
        color: 'gray',
        icon: '⚙️',
        workspaceType: 'system',
        features: []
      };

      // Check for name conflict
      if (await this.projectNameExists(SYSTEM_PROJECT_NAME, correlationId)) {
        this.logger.debug('project-manager.system.name-exists', { correlationId });
        return;
      }

      await this.queryDatabase(`
        INSERT INTO projects (
          id, name, description, created_at, updated_at, is_active, metadata,
          last_conversation_id, provider, model, prompt_id, base_path, session_state,
          system_role
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        projectId,
        SYSTEM_PROJECT_NAME,
        'Proyecto padre del sistema. Gestiona la configuración, módulos, logs y todos los directorios del sistema event-core.',
        now,
        now,
        JSON.stringify(metadata),
        null, null, null, null,
        basePath,
        JSON.stringify({}),
        'root'
      ], false, correlationId);

      const project = {
        id: projectId,
        name: SYSTEM_PROJECT_NAME,
        description: 'Proyecto padre del sistema. Gestiona la configuración, módulos, logs y todos los directorios del sistema event-core.',
        created_at: now,
        updated_at: now,
        is_active: false,
        metadata,
        last_conversation_id: null,
        provider: null,
        model: null,
        prompt_id: null,
        base_path: basePath,
        session_state: {},
        system_id: null,
        system_role: 'root',
        parent_project_id: null
      };

      this.projects.set(projectId, project);

      // Initialize project database schema
      await this.initializeProjectSchema(projectId, correlationId);

      // Create a system entry so other projects can reference it
      const systemId = crypto.randomUUID();
      await this.queryDatabase(`
        INSERT OR IGNORE INTO systems (id, name, description, created_at, updated_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        systemId,
        'Event-Core System',
        'Sistema raíz que engloba todos los proyectos',
        now,
        now,
        JSON.stringify({ root_project_id: projectId })
      ], false, correlationId);

      // Assign the sistema project to this system
      await this.queryDatabase(
        'UPDATE projects SET system_id = ?, system_role = ? WHERE id = ?',
        [systemId, 'root', projectId],
        false, correlationId
      );
      project.system_id = systemId;

      this.logger.info('project-manager.system.created', { correlationId, projectId, basePath });

      return project;
    } catch (error) {
      // If it's a duplicate name error, that's fine - project already exists
      if (error.code === 'PROJECT_NAME_EXISTS' || error.message?.includes('UNIQUE constraint')) {
        this.logger.debug('project-manager.system.exists-constraint', { correlationId });
        return;
      }
      this.logger.error('project-manager.system.ensure-failed', { correlationId, error: error.message });
    }
  },

  /**
   * Migrate existing databases: add composition columns if missing
   * Safe to run multiple times - checks existing columns first via PRAGMA
   */
  async migrateCompositionColumns(correlationId) {
    const columnsToAdd = [
      { name: 'system_id', type: 'TEXT' },
      { name: 'system_role', type: 'TEXT' },
      { name: 'parent_project_id', type: 'TEXT' }
    ];

    // Get existing columns from table schema
    let existingColumns = [];
    try {
      const tableInfo = await this.queryDatabase(
        'PRAGMA table_info(projects)',
        [], true, correlationId
      );
      existingColumns = tableInfo.map(col => col.name);
    } catch (error) {
      this.logger.warn('project-manager.migration.table-info-failed', { correlationId, error: error.message });
      return;
    }

    for (const col of columnsToAdd) {
      // Skip if column already exists
      if (existingColumns.includes(col.name)) {
        this.logger.debug('project-manager.migration.column-exists', { correlationId, column: col.name });
        continue;
      }

      try {
        await this.queryDatabase(
          `ALTER TABLE projects ADD COLUMN ${col.name} ${col.type}`,
          [], false, correlationId
        );
        this.logger.info('project-manager.migration.column-added', { correlationId, column: col.name });
      } catch (error) {
        this.logger.warn('project-manager.migration.column-failed', { correlationId, column: col.name, error: error.message });
      }
    }
  },

  /**
   * Initialize composition tables for project relationships
   * Creates: systems, project_links, project_dependencies, shared_context
   */
  async initializeCompositionTables(correlationId) {
    this.logger.debug('project-manager.composition.initializing', { correlationId });

    // Table: systems - Logical containers for related projects
    await this.queryDatabase(`
      CREATE TABLE IF NOT EXISTS systems (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT
      )
    `, [], false, correlationId);

    // Table: project_links - Relationships between projects
    await this.queryDatabase(`
      CREATE TABLE IF NOT EXISTS project_links (
        id TEXT PRIMARY KEY,
        source_project_id TEXT NOT NULL,
        target_project_id TEXT NOT NULL,
        link_type TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (target_project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `, [], false, correlationId);

    // Table: project_dependencies - Explicit dependencies between projects
    await this.queryDatabase(`
      CREATE TABLE IF NOT EXISTS project_dependencies (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        depends_on_project_id TEXT NOT NULL,
        dependency_type TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `, [], false, correlationId);

    // Table: shared_context - Conversations shared between projects
    await this.queryDatabase(`
      CREATE TABLE IF NOT EXISTS shared_context (
        id TEXT PRIMARY KEY,
        from_project_id TEXT NOT NULL,
        to_project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        reason TEXT,
        imported_at TEXT NOT NULL,
        FOREIGN KEY (from_project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (to_project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `, [], false, correlationId);

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_projects_system ON projects(system_id)',
      'CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_project_id)',
      'CREATE INDEX IF NOT EXISTS idx_links_source ON project_links(source_project_id)',
      'CREATE INDEX IF NOT EXISTS idx_links_target ON project_links(target_project_id)',
      'CREATE INDEX IF NOT EXISTS idx_deps_project ON project_dependencies(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_deps_depends ON project_dependencies(depends_on_project_id)',
      'CREATE INDEX IF NOT EXISTS idx_shared_from ON shared_context(from_project_id)',
      'CREATE INDEX IF NOT EXISTS idx_shared_to ON shared_context(to_project_id)'
    ];

    for (const indexSql of indexes) {
      try {
        await this.queryDatabase(indexSql, [], false, correlationId);
      } catch (error) {
        // Index might already exist - not a problem
        this.logger.debug('project-manager.composition.index-skipped', { correlationId, error: error.message });
      }
    }

    this.logger.info('project-manager.composition.initialized', { correlationId });
  }
};
