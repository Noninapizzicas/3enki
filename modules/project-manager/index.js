const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');

/**
 * Project Manager Module
 *
 * Event-driven project lifecycle management with database integration.
 * - 100% event-driven (no HTTP interno)
 * - Uses database-manager via events for all persistence
 * - Tracks active project
 * - Publishes lifecycle events (created, updated, deleted, activated)
 */
class ProjectManagerModule {
  constructor() {
    this.name = 'project-manager';
    this.version = '1.0.0';

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.uiHandler = null;  // UI Request/Response handler
    this.config = null;

    // State
    this.projects = new Map(); // In-memory cache: projectId -> project
    this.activeProjectId = null;

    // Pending database requests
    this.pendingDbRequests = new Map(); // requestId -> {resolve, reject, timeout}

    // Unsubscribe functions
    this.unsubscribes = [];

    // Base path for project directories
    this.projectsBasePath = path.join(process.cwd(), 'data', 'projects');
  }

  // ==================== HELPERS ====================

  /**
   * Create a URL-safe slug from a name
   */
  slugify(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[áàäâã]/g, 'a')
      .replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i')
      .replace(/[óòöôõ]/g, 'o')
      .replace(/[úùüû]/g, 'u')
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Create project directory structure
   * Structure: /projects/{slug}/
   *   ├── db/       # SQLite database
   *   └── storage/  # Project files
   */
  async createProjectDirectories(projectId, name, correlationId) {
    const slug = this.slugify(name);
    const basePath = path.join(this.projectsBasePath, slug);

    this.logger.debug({ correlationId, projectId, basePath }, 'Creating project directories');

    try {
      // Create base directory and subdirectories
      const dirs = [
        basePath,
        path.join(basePath, 'db'),
        path.join(basePath, 'storage')
      ];

      for (const dir of dirs) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      this.logger.info({ correlationId, projectId, basePath }, 'Project directories created');
      return basePath;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to create project directories');
      throw error;
    }
  }

  /**
   * Check if a project name already exists
   */
  async projectNameExists(name, correlationId) {
    const slug = this.slugify(name);
    const basePath = path.join(this.projectsBasePath, slug);

    try {
      await fs.promises.access(basePath);
      return true; // Directory exists
    } catch {
      return false; // Directory doesn't exist
    }
  }

  /**
   * Delete project directory structure
   */
  async deleteProjectDirectories(basePath, correlationId) {
    if (!basePath || !basePath.startsWith(this.projectsBasePath)) {
      this.logger.warn({ correlationId, basePath }, 'Invalid base path, skipping directory deletion');
      return;
    }

    this.logger.debug({ correlationId, basePath }, 'Deleting project directories');

    try {
      await fs.promises.rm(basePath, { recursive: true, force: true });
      this.logger.info({ correlationId, basePath }, 'Project directories deleted');
    } catch (error) {
      this.logger.warn({ correlationId, basePath, error: error.message }, 'Failed to delete project directories');
      // Don't throw - directory deletion is not critical
    }
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    // Load config from module.json (core.config may not include module-specific config)
    try {
      const moduleJsonPath = path.join(__dirname, 'module.json');
      const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
      const moduleConfig = moduleJson.config || {};

      // Merge configs, but only use core.config values that are actually defined
      // This prevents undefined values from overwriting module.json defaults
      const coreConfig = core.config || {};
      this.config = { ...moduleConfig };
      for (const [key, value] of Object.entries(coreConfig)) {
        if (value !== undefined && value !== null) {
          this.config[key] = value;
        }
      }
    } catch (err) {
      this.logger.warn('project-manager.config.load.error', { error: err.message });
      this.config = core.config || {};
    }

    this.logger.info('project-manager.loading', { module: this.name, configLoaded: !!this.config.defaultSchema });

    // Subscribe to database responses
    const unsubDbResponse = await this.eventBus.subscribe(EVENTS.DB.QUERY_RESPONSE,
      this.onDbQueryResponse.bind(this));
    this.unsubscribes.push(unsubDbResponse);

    // Subscribe to query events
    const unsubGet = await this.eventBus.subscribe(EVENTS.PROJECT.GET_REQUEST,
      this.onGetProjectRequest.bind(this));
    this.unsubscribes.push(unsubGet);

    const unsubList = await this.eventBus.subscribe(EVENTS.PROJECT.LIST_REQUEST,
      this.onListProjectsRequest.bind(this));
    this.unsubscribes.push(unsubList);

    const unsubActive = await this.eventBus.subscribe('project.active.request',
      this.onGetActiveProjectRequest.bind(this));
    this.unsubscribes.push(unsubActive);

    // ==================== UI EVENT HANDLERS ====================
    // Comunicación via eventBus (que usa MQTT internamente con topics transformados)
    // Frontend suscribe a core/*/events/project/state, etc.

    const unsubStateReq = await this.eventBus.subscribe('project/state/request',
      this.onProjectStateRequest.bind(this));
    this.unsubscribes.push(unsubStateReq);

    const unsubCreate = await this.eventBus.subscribe('project/create',
      this.onProjectCreate.bind(this));
    this.unsubscribes.push(unsubCreate);

    const unsubUpdate = await this.eventBus.subscribe('project/update',
      this.onProjectUpdate.bind(this));
    this.unsubscribes.push(unsubUpdate);

    const unsubDelete = await this.eventBus.subscribe('project/delete',
      this.onProjectDelete.bind(this));
    this.unsubscribes.push(unsubDelete);

    const unsubActivate = await this.eventBus.subscribe('project/activate',
      this.onProjectActivate.bind(this));
    this.unsubscribes.push(unsubActivate);

    this.logger.info('project-manager.eventbus.subscribed', {
      topics: ['project/state/request', 'project/create', 'project/update', 'project/delete', 'project/activate']
    });

    // ==================== UI REQUEST/RESPONSE HANDLERS ====================
    // Patrón Request/Response sobre MQTT para comunicación frontend
    // Frontend usa: await mqttRequest('project', 'list')
    if (this.uiHandler) {
      this.uiHandler.register('project', 'list', this.handleUIList.bind(this));
      this.uiHandler.register('project', 'get', this.handleUIGet.bind(this));
      this.uiHandler.register('project', 'create', this.handleUICreate.bind(this));
      this.uiHandler.register('project', 'update', this.handleUIUpdate.bind(this));
      this.uiHandler.register('project', 'delete', this.handleUIDelete.bind(this));
      this.uiHandler.register('project', 'activate', this.handleUIActivate.bind(this));
      // Session & AI Config handlers
      this.uiHandler.register('project', 'saveSession', this.handleUISaveSession.bind(this));
      this.uiHandler.register('project', 'restoreSession', this.handleUIRestoreSession.bind(this));
      this.uiHandler.register('project', 'setAIConfig', this.handleUISetAIConfig.bind(this));
      this.uiHandler.register('project', 'setLastConversation', this.handleUISetLastConversation.bind(this));

      this.logger.info('project-manager.ui_handlers.registered', {
        handlers: ['list', 'get', 'create', 'update', 'delete', 'activate', 'saveSession', 'restoreSession', 'setAIConfig', 'setLastConversation']
      });
    }

    // Load existing projects from database
    await this.loadExistingProjects();

    this.logger.info('project-manager.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info({ correlationId: 'system' }, 'Project Manager module unloading');

    // Unregister UI handlers
    if (this.uiHandler) {
      this.uiHandler.unregister('project', 'list');
      this.uiHandler.unregister('project', 'get');
      this.uiHandler.unregister('project', 'create');
      this.uiHandler.unregister('project', 'update');
      this.uiHandler.unregister('project', 'delete');
      this.uiHandler.unregister('project', 'activate');
      this.uiHandler.unregister('project', 'saveSession');
      this.uiHandler.unregister('project', 'restoreSession');
      this.uiHandler.unregister('project', 'setAIConfig');
      this.uiHandler.unregister('project', 'setLastConversation');
    }

    // Unsubscribe all eventBus subscriptions
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.unsubscribes = [];

    // Clear pending requests
    for (const [requestId, pending] of this.pendingDbRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Module unloading'));
    }
    this.pendingDbRequests.clear();

    this.logger.info({ correlationId: 'system' }, 'Project Manager module unloaded');
  }

  // ==================== DATABASE HELPERS ====================

  /**
   * Query database via events
   */
  async queryDatabase(query, params = [], readOnly = false, correlationId) {
    const requestId = crypto.randomUUID();

    const dbPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDbRequests.delete(requestId);
        reject(new Error('Database query timeout'));
      }, this.config.dbTimeout || 10000);

      this.pendingDbRequests.set(requestId, { resolve, reject, timeout });
    });

    await this.eventBus.publish(EVENTS.DB.QUERY_REQUEST, {
      project_id: 'system', // Project metadata stored in system DB
      query,
      params,
      read_only: readOnly,
      request_id: requestId,
      correlation_id: correlationId
    });

    return await dbPromise;
  }

  /**
   * Handle database query responses
   */
  async onDbQueryResponse(event) {
    // El EventBus envía un envelope, los datos están en event.data
    const eventData = event.data || event;
    const { request_id, success, data, error } = eventData;

    const pending = this.pendingDbRequests.get(request_id);
    if (!pending) {
      return; // Response for unknown/expired request
    }

    clearTimeout(pending.timeout);
    this.pendingDbRequests.delete(request_id);

    if (success) {
      pending.resolve(data || []);
    } else {
      pending.reject(new Error(error || 'Database query failed'));
    }
  }

  // ==================== INITIALIZATION ====================

  /**
   * Load existing projects from database
   */
  async loadExistingProjects() {
    const correlationId = crypto.randomUUID();
    this.logger.debug({ correlationId }, 'Loading existing projects from database');

    try {
      // Ensure projects table exists with all required fields
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
          session_state TEXT
        )
      `, [], false, correlationId);

      // Note: All columns are now defined in CREATE TABLE above
      // Legacy migration code removed - columns already exist in schema

      // Load all projects
      const rows = await this.queryDatabase(
        'SELECT * FROM projects ORDER BY created_at DESC',
        [],
        true,
        correlationId
      );

      for (const row of rows) {
        const project = {
          id: row.id,
          name: row.name,
          description: row.description || '',
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_active: row.is_active === 1,
          metadata: row.metadata ? JSON.parse(row.metadata) : {},
          // New session/config fields
          last_conversation_id: row.last_conversation_id || null,
          provider: row.provider || null,
          model: row.model || null,
          prompt_id: row.prompt_id || null,
          base_path: row.base_path || null,
          session_state: row.session_state ? JSON.parse(row.session_state) : {}
        };

        this.projects.set(project.id, project);

        if (project.is_active) {
          this.activeProjectId = project.id;
        }
      }

      this.logger.info({ correlationId, count: this.projects.size }, 'Loaded existing projects');
      // REMOVED: this.metrics.gauge('project.total.count', this.projects.size);

      if (this.activeProjectId) {
        // REMOVED: this.metrics.gauge('project.active.count', 1);
      }
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'Failed to load projects');
    }
  }

  // ==================== PROJECT CRUD ====================

  /**
   * Create new project
   * @param {string} name - Project name
   * @param {string} description - Project description
   * @param {object} metadata - Additional metadata (color, icon, workspaceType)
   * @param {string} correlationId - Correlation ID for tracing
   * @param {object} options - Optional: { provider, model, prompt_id }
   */
  async createProject(name, description = '', metadata = {}, correlationId, options = {}) {
    const startTime = Date.now();
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.logger.info({ correlationId, projectId, name }, 'Creating project');

    try {
      // Check if project name already exists
      if (await this.projectNameExists(name, correlationId)) {
        const error = new Error(`Project with name "${name}" already exists`);
        error.code = 'PROJECT_NAME_EXISTS';
        throw error;
      }

      // Create project directories
      const basePath = await this.createProjectDirectories(projectId, name, correlationId);

      // Extract optional AI config
      const { provider = null, model = null, prompt_id = null } = options;

      // Insert into database with all fields
      await this.queryDatabase(`
        INSERT INTO projects (
          id, name, description, created_at, updated_at, is_active, metadata,
          last_conversation_id, provider, model, prompt_id, base_path, session_state
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `, [
        projectId,
        name,
        description,
        now,
        now,
        JSON.stringify(metadata),
        null,  // last_conversation_id
        provider,
        model,
        prompt_id,
        basePath,
        JSON.stringify({})  // session_state
      ], false, correlationId);

      // Create project object with all fields
      const project = {
        id: projectId,
        name,
        description,
        created_at: now,
        updated_at: now,
        is_active: false,
        metadata,
        // New fields
        last_conversation_id: null,
        provider,
        model,
        prompt_id,
        base_path: basePath,
        session_state: {}
      };

      // Store in cache
      this.projects.set(projectId, project);

      // Initialize project database schema
      await this.initializeProjectSchema(projectId, correlationId);

      // Update metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.created.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.gauge('project.total.count', this.projects.size);
      // REMOVED: this.metrics.timing('project.creation.duration', Date.now() - startTime);

      // Publish event
      await this.eventBus.publish(EVENTS.PROJECT.CREATED, {
        project_id: projectId,
        name,
        description,
        created_at: now
      });

      this.logger.info({ correlationId, projectId, name }, 'Project created successfully');

      return project;
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.error.total', 1, { operation: 'create' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, name, error: error.message }, 'Failed to create project');
      throw error;
    }
  }

  /**
   * Initialize database schema for new project
   * Note: This is fire-and-forget - we don't wait for completion
   * since the project can be used immediately with default schema
   */
  async initializeProjectSchema(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Initializing project database schema');

    // Fire-and-forget: publish schema init request without waiting
    // The database manager will handle it asynchronously
    try {
      await this.eventBus.publish('db.schema.init.request', {
        project_id: projectId,
        schema: this.config.defaultSchema,
        correlation_id: correlationId
      });
      this.logger.debug({ correlationId, projectId }, 'Project schema initialization requested');
    } catch (err) {
      // Log but don't fail - schema init is optional
      this.logger.warn({ correlationId, projectId, error: err.message }, 'Schema init request failed (non-fatal)');
    }
  }

  /**
   * Update project
   */
  async updateProject(projectId, updates, correlationId) {
    this.logger.info({ correlationId, projectId, updates }, 'Updating project');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();
    const updatedFields = [];
    const queryParts = [];
    const params = [];

    if (updates.name !== undefined) {
      queryParts.push('name = ?');
      params.push(updates.name);
      project.name = updates.name;
      updatedFields.push('name');
    }

    if (updates.description !== undefined) {
      queryParts.push('description = ?');
      params.push(updates.description);
      project.description = updates.description;
      updatedFields.push('description');
    }

    if (updates.metadata !== undefined) {
      queryParts.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
      project.metadata = updates.metadata;
      updatedFields.push('metadata');
    }

    if (queryParts.length === 0) {
      this.logger.warn({ correlationId, projectId }, 'No fields to update');
      return project;
    }

    queryParts.push('updated_at = ?');
    params.push(now);
    params.push(projectId);

    try {
      await this.queryDatabase(
        `UPDATE projects SET ${queryParts.join(', ')} WHERE id = ?`,
        params,
        false,
        correlationId
      );

      project.updated_at = now;
      this.projects.set(projectId, project);

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.updated.total');
    // → Counter extracted from events

      await this.eventBus.publish(EVENTS.PROJECT.UPDATED, {
        project_id: projectId,
        updated_fields: updatedFields,
        updated_at: now
      });

      this.logger.info({ correlationId, projectId }, 'Project updated successfully');

      return project;
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.error.total', 1, { operation: 'update' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to update project');
      throw error;
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectId, correlationId) {
    this.logger.info({ correlationId, projectId }, 'Deleting project');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Cannot delete active project
    if (project.is_active) {
      throw new Error('Cannot delete active project. Deactivate first.');
    }

    try {
      await this.queryDatabase(
        'DELETE FROM projects WHERE id = ?',
        [projectId],
        false,
        correlationId
      );

      // Delete project directories
      if (project.base_path) {
        await this.deleteProjectDirectories(project.base_path, correlationId);
      }

      this.projects.delete(projectId);

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.deleted.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.gauge('project.total.count', this.projects.size);

      await this.eventBus.publish(EVENTS.PROJECT.DELETED, {
        project_id: projectId,
        name: project.name,
        deleted_at: new Date().toISOString()
      });

      this.logger.info({ correlationId, projectId }, 'Project deleted successfully');

      return { success: true, id: projectId };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.error.total', 1, { operation: 'delete' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to delete project');
      throw error;
    }
  }

  // ==================== SESSION & AI CONFIG ====================

  /**
   * Save session state for a project
   * @param {string} projectId - Project ID
   * @param {object} sessionData - Session data: { scroll_position, context_config, ui_state }
   * @param {string} correlationId - Correlation ID for tracing
   */
  async saveSession(projectId, sessionData, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Saving project session');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();
    const sessionState = {
      ...project.session_state,
      ...sessionData,
      saved_at: now
    };

    try {
      await this.queryDatabase(
        'UPDATE projects SET session_state = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(sessionState), now, projectId],
        false,
        correlationId
      );

      project.session_state = sessionState;
      project.updated_at = now;
      this.projects.set(projectId, project);

      this.logger.info({ correlationId, projectId }, 'Project session saved');

      return sessionState;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to save session');
      throw error;
    }
  }

  /**
   * Restore session state for a project
   * @param {string} projectId - Project ID
   * @param {string} correlationId - Correlation ID for tracing
   */
  async restoreSession(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Restoring project session');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return {
      last_conversation_id: project.last_conversation_id,
      session_state: project.session_state || {},
      provider: project.provider,
      model: project.model,
      prompt_id: project.prompt_id
    };
  }

  /**
   * Update last conversation ID for a project
   * @param {string} projectId - Project ID
   * @param {string} conversationId - Last active conversation ID
   * @param {string} correlationId - Correlation ID for tracing
   */
  async setLastConversation(projectId, conversationId, correlationId) {
    this.logger.debug({ correlationId, projectId, conversationId }, 'Setting last conversation');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();

    try {
      await this.queryDatabase(
        'UPDATE projects SET last_conversation_id = ?, updated_at = ? WHERE id = ?',
        [conversationId, now, projectId],
        false,
        correlationId
      );

      project.last_conversation_id = conversationId;
      project.updated_at = now;
      this.projects.set(projectId, project);

      this.logger.info({ correlationId, projectId, conversationId }, 'Last conversation updated');

      return project;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to set last conversation');
      throw error;
    }
  }

  /**
   * Set AI configuration override for a project
   * @param {string} projectId - Project ID
   * @param {object} aiConfig - AI config: { provider, model, prompt_id }
   * @param {string} correlationId - Correlation ID for tracing
   */
  async setProjectAIConfig(projectId, aiConfig, correlationId) {
    this.logger.info({ correlationId, projectId, aiConfig }, 'Setting project AI config');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();
    const { provider, model, prompt_id } = aiConfig;

    const queryParts = ['updated_at = ?'];
    const params = [now];

    if (provider !== undefined) {
      queryParts.push('provider = ?');
      params.push(provider);
      project.provider = provider;
    }

    if (model !== undefined) {
      queryParts.push('model = ?');
      params.push(model);
      project.model = model;
    }

    if (prompt_id !== undefined) {
      queryParts.push('prompt_id = ?');
      params.push(prompt_id);
      project.prompt_id = prompt_id;
    }

    params.push(projectId);

    try {
      await this.queryDatabase(
        `UPDATE projects SET ${queryParts.join(', ')} WHERE id = ?`,
        params,
        false,
        correlationId
      );

      project.updated_at = now;
      this.projects.set(projectId, project);

      await this.eventBus.publish(EVENTS.PROJECT.UPDATED, {
        project_id: projectId,
        updated_fields: ['provider', 'model', 'prompt_id'].filter(f => aiConfig[f] !== undefined),
        updated_at: now
      });

      this.logger.info({ correlationId, projectId }, 'Project AI config updated');

      return {
        provider: project.provider,
        model: project.model,
        prompt_id: project.prompt_id
      };
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to set AI config');
      throw error;
    }
  }

  /**
   * Activate project
   */
  async activateProject(projectId, correlationId) {
    this.logger.info({ correlationId, projectId }, 'Activating project');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Si ya está activo, solo re-emitir el evento (útil para que módulos reciban el contexto al reconectar)
    if (this.activeProjectId === projectId) {
      this.logger.info({ correlationId, projectId }, 'Project already active, re-emitting event');

      await this.eventBus.publish(EVENTS.PROJECT.ACTIVATED, {
        project_id: projectId,
        name: project.name,
        base_path: project.base_path,
        activated_at: new Date().toISOString()
      });

      return project;
    }

    try {
      // Deactivate all projects
      await this.queryDatabase(
        'UPDATE projects SET is_active = 0',
        [],
        false,
        correlationId
      );

      // Activate target project
      await this.queryDatabase(
        'UPDATE projects SET is_active = 1 WHERE id = ?',
        [projectId],
        false,
        correlationId
      );

      // Update cache
      const previousActiveId = this.activeProjectId;

      if (previousActiveId) {
        const prevProject = this.projects.get(previousActiveId);
        if (prevProject) {
          prevProject.is_active = false;
          this.projects.set(previousActiveId, prevProject);
        }

        await this.eventBus.publish('project.deactivated', {
          project_id: previousActiveId,
          name: prevProject?.name,
          deactivated_at: new Date().toISOString()
        });
      }

      project.is_active = true;
      this.projects.set(projectId, project);
      this.activeProjectId = projectId;

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.activated.total');
    // → Counter extracted from events
      // REMOVED: this.metrics.gauge('project.active.count', 1);

      await this.eventBus.publish(EVENTS.PROJECT.ACTIVATED, {
        project_id: projectId,
        name: project.name,
        base_path: project.base_path,
        activated_at: new Date().toISOString()
      });

      this.logger.info({ correlationId, projectId }, 'Project activated successfully');

      return project;
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('project.error.total', 1, { operation: 'activate' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to activate project');
      throw error;
    }
  }

  /**
   * Get project by ID
   */
  getProject(projectId) {
    return this.projects.get(projectId);
  }

  /**
   * List all projects
   */
  listProjects() {
    return Array.from(this.projects.values());
  }

  /**
   * Get active project ID
   */
  getActiveProjectId() {
    return this.activeProjectId;
  }

  // ==================== EVENT HANDLERS ====================

  /**
   * Handle project.get.request
   */
  async onGetProjectRequest(event) {
    // Handle wrapped event format: event.data contains the actual payload
    const eventData = event.data || event;
    const { request_id, project_id, correlation_id } = eventData;
    this.logger.debug({ correlationId: correlation_id, requestId: request_id, projectId: project_id },
      'Received project.get.request');

    const project = this.getProject(project_id);

    await this.eventBus.publish(EVENTS.PROJECT.GET_RESPONSE, {
      request_id,
      success: !!project,
      project: project || null,
      error: project ? null : 'Project not found'
    });
  }

  /**
   * Handle project.list.request
   */
  async onListProjectsRequest(event) {
    // Handle wrapped event format: event.data contains the actual payload
    const eventData = event.data || event;
    const { request_id, correlation_id } = eventData;
    this.logger.debug({ correlationId: correlation_id, requestId: request_id },
      'Received project.list.request');

    const projects = this.listProjects();

    await this.eventBus.publish(EVENTS.PROJECT.LIST_RESPONSE, {
      request_id,
      success: true,
      projects,
      count: projects.length,
      active_project_id: this.activeProjectId
    });
  }

  /**
   * Handle project.active.request
   */
  async onGetActiveProjectRequest(event) {
    // Handle wrapped event format: event.data contains the actual payload
    const eventData = event.data || event;
    const { request_id, correlation_id } = eventData;
    this.logger.debug({ correlationId: correlation_id, requestId: request_id },
      'Received project.active.request');

    await this.eventBus.publish('project.active.response', {
      request_id,
      success: true,
      active_project_id: this.activeProjectId
    });
  }

  // ==================== UI EVENT HANDLERS (via EventBus) ====================
  // Comunicación frontend ↔ backend via eventBus
  // EventBus transforma topics: 'project.state' → 'core/*/events/project/state'

  /**
   * Publica estado completo para UI via eventBus
   * EventBus transforma 'project.state' → 'core/{coreId}/events/project/state'
   * Frontend suscribe a 'core/{coreId}/events/project/state'
   * @private
   */
  async publishUIState() {
    const projects = this.listProjects().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      color: p.metadata?.color || 'blue',
      icon: p.metadata?.icon || '📁',
      workspaceType: p.metadata?.workspaceType || 'general',
      isActive: p.is_active === true || p.is_active === 1,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    const state = {
      projects,
      activeProjectId: this.activeProjectId,
      count: projects.length
    };

    // Publicar via eventBus → MQTT topic: core/*/events/project/state
    await this.eventBus.emit('project/state', state);
    this.logger.debug('project-manager.state.published', { count: projects.length });
  }

  /**
   * Handle project/state/request - UI solicita estado
   */
  async onProjectStateRequest(event) {
    this.logger.debug('MQTT: project/state/request received');
    await this.publishUIState();
  }

  /**
   * Handle project/create - UI crea proyecto
   */
  async onProjectCreate(event) {
    const eventData = event.data || event;
    const { name, description, color, icon, workspaceType } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info({ correlationId, name }, 'MQTT: project/create');

    if (!name || name.trim().length === 0) {
      this.logger.warn({ correlationId }, 'MQTT: project/create - name required');
      return;
    }

    try {
      await this.createProject(
        name.trim(),
        description?.trim() || '',
        {
          color: color || 'blue',
          icon: icon || '📁',
          workspaceType: workspaceType || 'general'
        },
        correlationId
      );

      // Publicar estado actualizado
      await this.publishUIState();
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'MQTT: project/create failed');
    }
  }

  /**
   * Handle project/update - UI actualiza proyecto
   */
  async onProjectUpdate(event) {
    const eventData = event.data || event;
    const { id, name, description, color, icon, workspaceType } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info({ correlationId, id }, 'MQTT: project/update');

    if (!id) {
      this.logger.warn({ correlationId }, 'MQTT: project/update - id required');
      return;
    }

    try {
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();

      // Metadata updates
      const project = this.getProject(id);
      if (project) {
        const metadata = { ...(project.metadata || {}) };
        if (color !== undefined) metadata.color = color;
        if (icon !== undefined) metadata.icon = icon;
        if (workspaceType !== undefined) metadata.workspaceType = workspaceType;
        updates.metadata = metadata;
      }

      await this.updateProject(id, updates, correlationId);

      // Publicar estado actualizado
      await this.publishUIState();
    } catch (error) {
      this.logger.error({ correlationId, id, error: error.message }, 'MQTT: project/update failed');
    }
  }

  /**
   * Handle project/delete - UI elimina proyecto
   */
  async onProjectDelete(event) {
    const eventData = event.data || event;
    const { id } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info({ correlationId, id }, 'MQTT: project/delete');

    if (!id) {
      this.logger.warn({ correlationId }, 'MQTT: project/delete - id required');
      return;
    }

    try {
      await this.deleteProject(id, correlationId);

      // Publicar estado actualizado
      await this.publishUIState();
    } catch (error) {
      this.logger.error({ correlationId, id, error: error.message }, 'MQTT: project/delete failed');
    }
  }

  /**
   * Handle project/activate - UI activa proyecto
   */
  async onProjectActivate(event) {
    const eventData = event.data || event;
    const { id } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info({ correlationId, id }, 'MQTT: project/activate');

    if (!id) {
      this.logger.warn({ correlationId }, 'MQTT: project/activate - id required');
      return;
    }

    try {
      await this.activateProject(id, correlationId);

      // Publicar estado actualizado
      await this.publishUIState();
    } catch (error) {
      this.logger.error({ correlationId, id, error: error.message }, 'MQTT: project/activate failed');
    }
  }

  // ==================== UI REQUEST/RESPONSE HANDLERS ====================
  // Patrón Request/Response sobre MQTT
  // Frontend usa: await mqttRequest('project', 'list')
  // Retornan datos directamente, errores via throw { status, code, message }

  /**
   * UI Handler: Listar proyectos
   * Request: mqttRequest('project', 'list')
   */
  async handleUIList(data, request) {
    const projects = this.listProjects().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      color: p.metadata?.color || 'blue',
      icon: p.metadata?.icon || '📁',
      workspaceType: p.metadata?.workspaceType || 'general',
      isActive: p.is_active === true || p.is_active === 1,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    return {
      projects,
      activeProjectId: this.activeProjectId,
      count: projects.length
    };
  }

  /**
   * UI Handler: Obtener proyecto por ID
   * Request: mqttRequest('project', 'get', { id: '...' })
   */
  async handleUIGet(data, request) {
    const { id } = data;

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    const project = this.getProject(id);
    if (!project) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description || '',
        color: project.metadata?.color || 'blue',
        icon: project.metadata?.icon || '📁',
        workspaceType: project.metadata?.workspaceType || 'general',
        isActive: project.is_active === true || project.is_active === 1,
        createdAt: project.created_at,
        updatedAt: project.updated_at
      }
    };
  }

  /**
   * UI Handler: Crear proyecto
   * Request: mqttRequest('project', 'create', { name, description, color, icon, workspaceType })
   */
  async handleUICreate(data, request) {
    const { name, description, color, icon, workspaceType } = data;
    const correlationId = crypto.randomUUID();

    if (!name || name.trim().length === 0) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project name is required' };
    }

    const project = await this.createProject(
      name.trim(),
      description?.trim() || '',
      {
        color: color || 'blue',
        icon: icon || '📁',
        workspaceType: workspaceType || 'general'
      },
      correlationId
    );

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description || '',
        color: project.metadata?.color || 'blue',
        icon: project.metadata?.icon || '📁',
        workspaceType: project.metadata?.workspaceType || 'general',
        isActive: project.is_active === true || project.is_active === 1,
        createdAt: project.created_at,
        updatedAt: project.updated_at
      },
      created: true
    };
  }

  /**
   * UI Handler: Actualizar proyecto
   * Request: mqttRequest('project', 'update', { id, name?, description?, color?, icon?, workspaceType? })
   */
  async handleUIUpdate(data, request) {
    const { id, name, description, color, icon, workspaceType } = data;
    const correlationId = crypto.randomUUID();

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    const existing = this.getProject(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();

    // Metadata updates
    const metadata = { ...(existing.metadata || {}) };
    if (color !== undefined) metadata.color = color;
    if (icon !== undefined) metadata.icon = icon;
    if (workspaceType !== undefined) metadata.workspaceType = workspaceType;
    updates.metadata = metadata;

    const project = await this.updateProject(id, updates, correlationId);

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description || '',
        color: project.metadata?.color || 'blue',
        icon: project.metadata?.icon || '📁',
        workspaceType: project.metadata?.workspaceType || 'general',
        isActive: project.is_active === true || project.is_active === 1,
        createdAt: project.created_at,
        updatedAt: project.updated_at
      },
      updated: true
    };
  }

  /**
   * UI Handler: Eliminar proyecto
   * Request: mqttRequest('project', 'delete', { id })
   */
  async handleUIDelete(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    const existing = this.getProject(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    await this.deleteProject(id, correlationId);

    return { deleted: true, id };
  }

  /**
   * UI Handler: Activar proyecto
   * Request: mqttRequest('project', 'activate', { id })
   */
  async handleUIActivate(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    const existing = this.getProject(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    await this.activateProject(id, correlationId);

    return {
      activated: true,
      activeProjectId: id
    };
  }

  // ==================== UI SESSION & AI CONFIG HANDLERS ====================

  /**
   * UI Handler: Save session state
   * Request: mqttRequest('project', 'saveSession', { id, scroll_position, context_config, ui_state })
   */
  async handleUISaveSession(data, request) {
    const { id, ...sessionData } = data;
    const correlationId = crypto.randomUUID();

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    const existing = this.getProject(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    const session = await this.saveSession(id, sessionData, correlationId);

    return { saved: true, session };
  }

  /**
   * UI Handler: Restore session state
   * Request: mqttRequest('project', 'restoreSession', { id })
   */
  async handleUIRestoreSession(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    const existing = this.getProject(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    const session = await this.restoreSession(id, correlationId);

    return session;
  }

  /**
   * UI Handler: Set AI configuration
   * Request: mqttRequest('project', 'setAIConfig', { id, provider?, model?, prompt_id? })
   */
  async handleUISetAIConfig(data, request) {
    const { id, provider, model, prompt_id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    const existing = this.getProject(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    const config = await this.setProjectAIConfig(id, { provider, model, prompt_id }, correlationId);

    return { updated: true, ...config };
  }

  /**
   * UI Handler: Set last conversation
   * Request: mqttRequest('project', 'setLastConversation', { id, conversationId })
   */
  async handleUISetLastConversation(data, request) {
    const { id, conversationId } = data;
    const correlationId = crypto.randomUUID();

    if (!id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    }

    if (!conversationId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Conversation ID is required' };
    }

    const existing = this.getProject(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };
    }

    await this.setLastConversation(id, conversationId, correlationId);

    return { updated: true, lastConversationId: conversationId };
  }

  // ==================== HTTP API HANDLERS ====================
  // Handlers use new gateway API style: return { status, data } instead of res.json()

  async handleCreateProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { name, description, metadata } = req.body || {};

    this.logger.info({ correlationId, name }, 'HTTP: Create project');

    if (!name || name.trim().length === 0) {
      return { status: 400, data: { success: false, error: 'Project name is required' } };
    }

    try {
      const project = await this.createProject(name, description, metadata, correlationId);
      return { status: 201, data: { success: true, project } };
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'HTTP: Failed to create project');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleListProjects(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    this.logger.debug({ correlationId }, 'HTTP: List projects');

    try {
      const projects = this.listProjects();
      return {
        status: 200,
        data: {
          success: true,
          projects,
          count: projects.length,
          active_project_id: this.activeProjectId
        }
      };
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'HTTP: Failed to list projects');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    this.logger.debug({ correlationId, projectId: id }, 'HTTP: Get project');

    try {
      const project = this.getProject(id);
      if (!project) {
        return { status: 404, data: { success: false, error: 'Project not found' } };
      }
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to get project');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleUpdateProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const updates = req.body || {};

    this.logger.info({ correlationId, projectId: id, updates }, 'HTTP: Update project');

    try {
      const project = await this.updateProject(id, updates, correlationId);
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to update project');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleDeleteProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    this.logger.info({ correlationId, projectId: id }, 'HTTP: Delete project');

    try {
      const result = await this.deleteProject(id, correlationId);
      return { status: 200, data: { success: true, id: result.id, message: 'Project deleted successfully' } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to delete project');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      if (error.message.includes('Cannot delete active')) {
        return { status: 400, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleActivateProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    this.logger.info({ correlationId, projectId: id }, 'HTTP: Activate project');

    try {
      const project = await this.activateProject(id, correlationId);
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to activate project');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleGetActiveProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    this.logger.debug({ correlationId }, 'HTTP: Get active project');

    try {
      if (!this.activeProjectId) {
        return { status: 404, data: { success: false, error: 'No active project' } };
      }

      const project = this.getProject(this.activeProjectId);
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'HTTP: Failed to get active project');
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  // ==================== SESSION & AI CONFIG HTTP HANDLERS ====================

  async handleSaveSession(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const sessionData = req.body || {};

    this.logger.info({ correlationId, projectId: id }, 'HTTP: Save session');

    try {
      const session = await this.saveSession(id, sessionData, correlationId);
      return { status: 200, data: { success: true, session } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to save session');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleRestoreSession(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    this.logger.debug({ correlationId, projectId: id }, 'HTTP: Restore session');

    try {
      const session = await this.restoreSession(id, correlationId);
      return { status: 200, data: { success: true, ...session } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to restore session');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleSetAIConfig(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const aiConfig = req.body || {};

    this.logger.info({ correlationId, projectId: id, aiConfig }, 'HTTP: Set AI config');

    try {
      const config = await this.setProjectAIConfig(id, aiConfig, correlationId);
      return { status: 200, data: { success: true, ...config } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to set AI config');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  async handleSetLastConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const { conversation_id } = req.body || {};

    this.logger.info({ correlationId, projectId: id, conversationId: conversation_id }, 'HTTP: Set last conversation');

    if (!conversation_id) {
      return { status: 400, data: { success: false, error: 'conversation_id is required' } };
    }

    try {
      const project = await this.setLastConversation(id, conversation_id, correlationId);
      return { status: 200, data: { success: true, last_conversation_id: project.last_conversation_id } };
    } catch (error) {
      this.logger.error({ correlationId, projectId: id, error: error.message }, 'HTTP: Failed to set last conversation');

      if (error.message.includes('not found')) {
        return { status: 404, data: { success: false, error: error.message } };
      }
      return { status: 500, data: { success: false, error: error.message } };
    }
  }

  // ==================== HEALTH & METRICS ====================

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: 'project-manager',
        projects_count: this.projects.size,
        active_project: this.activeProjectId,
        uptime: process.uptime()
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        module: 'project-manager',
        metrics: {
          total_projects: this.projects.size,
          active_project_id: this.activeProjectId,
          pending_db_requests: this.pendingDbRequests.size
        }
      }
    };
  }
}

module.exports = ProjectManagerModule;
