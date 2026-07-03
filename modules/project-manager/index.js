/**
 * project-manager v4.0.0 — Reescrito al canon (POC2 #3 del horizontal).
 *
 * Project lifecycle management: CRUD + activate/deactivate + session +
 * AI config + features/blueprints + bootstrap (Sistema + Mi Proyecto) +
 * resolución canónica de default conversation ("una vía fija").
 *
 * Tabla owned: projects (en DB system).
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers devuelven { status, data | error: { code, message, details? } }.
 *  - observability: log + metric en cada error path. correlation_id propagado.
 *  - events: publishes con correlation_id propagado + project_id en raíz.
 *  - lifecycle: onLoad/onUnload limpios, sin leak de pending requests.
 *  - persistence: DB access via db.query.request a database-manager.
 *  - resilience: timeouts en queries DB + composition. NO loops infinitos.
 *  - multi-tenancy: project_id propagado correctamente, aislamiento por proyecto.
 *  - tools: shape canónico { status, data | error: { code, message } }.
 *
 * 5 helpers privados POC2 (transferibles a otros módulos):
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, _normalizeError.
 *
 * Monolito anterior (1269 LOC) preservado en
 * arquitectura/migracion/_legacy/project-manager-monolito-pre-rewrite.js.bak
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');
const { EVENTS } = require('../../core/constants');

const DEFAULT_DB_TIMEOUT_MS = 10000;
const DEFAULT_COMPOSITION_TIMEOUT_MS = 10000;

class ProjectManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'project-manager';
    this.version = '4.0.0';
    this.uiHandler   = null;
    this.mqttRequest = null;
    this.config      = null;

    // State
    this.projects = new Map();
    this.activeProjectIds = new Set();
    this.pendingDbRequests = new Map();
    this.pendingCompositionRequests = new Map();
    this.pendingDefaultConversations = new Map();
    this.projectsBasePath = path.join(process.cwd(), 'data', 'projects');
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger      = core.logger;
    this.metrics     = core.metrics;
    this.eventBus    = core.eventBus;
    this.uiHandler   = core.uiHandler;
    this.mqttRequest = core.mqttRequest || null;
    this.config      = core.moduleConfig || {};

    this.logger.info('project-manager.loading', { module: this.name, version: this.version });

    await this._initializeSystemSchema();
    await this._loadExistingProjects();
    await this._ensureSystemProject();
    await this._ensureDefaultProject();
    await this._reactivateExistingProjects();

    this.logger.info('project-manager.loaded', {
      total: this.projects.size,
      active: this.activeProjectIds.size
    });
  }

  async onUnload() {
    this.logger.info('project-manager.unloading');
    for (const { timeout, reject } of this.pendingDbRequests.values()) {
      clearTimeout(timeout);
      try { reject(new Error('Module unloading')); } catch (_) {}
    }
    this.pendingDbRequests.clear();
    for (const { timeout, reject } of this.pendingCompositionRequests.values()) {
      clearTimeout(timeout);
      try { reject(new Error('Module unloading')); } catch (_) {}
    }
    this.pendingCompositionRequests.clear();
    this.pendingDefaultConversations.clear();
    this.projects.clear();
    this.activeProjectIds.clear();
    this.logger.info('project-manager.unloaded');
  }

  // ==========================================
  // DB access (via database-manager)
  // ==========================================

  async _queryDb(query, params = [], readOnly = true, correlation_id) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDbRequests.delete(request_id);
        this.metrics?.increment('project-manager.errors', { kind: 'db_timeout' });
        reject(new Error(`Database query timeout: ${query.substring(0, 80)}`));
      }, this.config.dbTimeout || DEFAULT_DB_TIMEOUT_MS);

      this.pendingDbRequests.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.query.request', {
        request_id, query, params, read_only: readOnly,
        project_id: 'system', correlation_id
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingDbRequests.delete(request_id);
        this.metrics?.increment('project-manager.errors', { kind: 'db_publish' });
        reject(err);
      });
    });
  }

  onDbQueryResponse(event) {
    const { request_id, success, data, error } = event.data || event;
    const pending = this.pendingDbRequests.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDbRequests.delete(request_id);
    if (success) pending.resolve(data || []);
    else pending.reject(new Error(error || 'Database query failed'));
  }

  // ==========================================
  // composition-manager RPC (via events)
  // ==========================================

  async _requestComposition(action, data) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCompositionRequests.delete(request_id);
        this.metrics?.increment('project-manager.errors', { kind: 'composition_timeout', action });
        reject(new Error(`Composition timeout: ${action}`));
      }, this.config.compositionTimeout || DEFAULT_COMPOSITION_TIMEOUT_MS);

      this.pendingCompositionRequests.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('composition.request', {
        request_id, action, ...data
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingCompositionRequests.delete(request_id);
        reject(err);
      });
    });
  }

  onCompositionResponse(event) {
    const { request_id, success, data, error } = event.data || event;
    const pending = this.pendingCompositionRequests.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingCompositionRequests.delete(request_id);
    if (success) pending.resolve(data);
    else pending.reject(new Error(error || 'Composition request failed'));
  }

  // ==========================================
  // Schema + load + bootstrap
  // ==========================================

  async _initializeSystemSchema() {
    const correlation_id = crypto.randomUUID();
    this.logger.info('project-manager.schema.initializing', { correlation_id });
    await this._queryDb(`
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
    `, [], false, correlation_id);
  }

  async _loadExistingProjects() {
    const correlation_id = crypto.randomUUID();
    try {
      const rows = await this._queryDb('SELECT * FROM projects', [], true, correlation_id);
      for (const row of rows) {
        const project = this._rowToProject(row);
        this.projects.set(project.id, project);
        if (project.is_active) this.activeProjectIds.add(project.id);
      }
      this.logger.info('project-manager.projects.loaded', {
        total: rows.length, active: this.activeProjectIds.size, correlation_id
      });
    } catch (err) {
      this.logger.error('project-manager.projects.load.failed', { error: err.message, correlation_id });
      this.metrics?.increment('project-manager.errors', { kind: 'load' });
    }
  }

  async _reactivateExistingProjects() {
    if (this.activeProjectIds.size === 0) return;
    const correlation_id = crypto.randomUUID();
    for (const projectId of this.activeProjectIds) {
      const project = this.projects.get(projectId);
      if (!project) continue;
      await this._publicarEvento(EVENTS.PROJECT.ACTIVATED, {
        project_id: projectId, name: project.name,
        base_path: project.base_path,
        metadata: project.metadata || {},
        activated_at: new Date().toISOString()
      }, { correlation_id });
    }
    this.logger.info('project-manager.reactivated', {
      count: this.activeProjectIds.size, projects: [...this.activeProjectIds]
    });
  }

  async _ensureSystemProject() {
    const SYSTEM_NAME = 'Sistema';
    const existing = Array.from(this.projects.values()).find(
      p => p.name === SYSTEM_NAME || p.metadata?.is_system
    );
    if (existing) {
      if (!existing.is_active) {
        existing.is_active = true;
        this.activeProjectIds.add(existing.id);
        await this._queryDb('UPDATE projects SET is_active = 1 WHERE id = ?',
          [existing.id], false, crypto.randomUUID());
      }
      return existing;
    }

    const correlation_id = crypto.randomUUID();
    try {
      const projectId = crypto.randomUUID();
      const now = new Date().toISOString();
      const metadata = { is_system: true, color: 'gray', icon: '⚙️', workspaceType: 'system', features: [] };

      await this._queryDb(`
        INSERT INTO projects (id, name, description, created_at, updated_at, is_active, metadata,
          last_conversation_id, provider, model, prompt_id, base_path, session_state, system_role)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        projectId, SYSTEM_NAME,
        'Proyecto padre del sistema. Gestiona configuración, módulos, logs.',
        now, now, JSON.stringify(metadata),
        null, null, null, null, process.cwd(), JSON.stringify({}), 'root'
      ], false, correlation_id);

      const project = {
        id: projectId, name: SYSTEM_NAME,
        description: 'Proyecto padre del sistema. Gestiona configuración, módulos, logs.',
        created_at: now, updated_at: now, is_active: true, metadata,
        last_conversation_id: null, provider: null, model: null, prompt_id: null,
        base_path: process.cwd(), session_state: {},
        system_id: null, system_role: 'root', parent_project_id: null
      };
      this.projects.set(projectId, project);
      this.activeProjectIds.add(projectId);

      // Create root system via composition-manager (best-effort)
      try {
        const system = await this._requestComposition('system.create', {
          name: 'Event-Core System',
          description: 'Sistema raíz que engloba todos los proyectos',
          metadata: { root_project_id: projectId }
        });
        await this._requestComposition('entity.join', {
          system_id: system.id, entity_id: projectId, role: 'root'
        });
        await this._queryDb(
          'UPDATE projects SET system_id = ?, system_role = ? WHERE id = ?',
          [system.id, 'root', projectId], false, correlation_id
        );
        project.system_id = system.id;
      } catch (err) {
        this.logger.warn('project-manager.system.composition.failed', { error: err.message });
      }

      this.logger.info('project-manager.system.created', { project_id: projectId });
      return project;
    } catch (err) {
      if (err.message?.includes('UNIQUE constraint')) return null;
      this.logger.error('project-manager.system.ensure.failed', { error: err.message });
      this.metrics?.increment('project-manager.errors', { kind: 'system_ensure' });
    }
  }

  async _ensureDefaultProject() {
    const existing = Array.from(this.projects.values()).find(
      p => !p.metadata?.is_system && !p.parent_project_id
    );
    if (existing) return existing;

    try {
      const project = await this._createProject({
        name: 'Mi Proyecto',
        description: 'Proyecto inicial creado automáticamente al primer arranque. Renombrar o crear adicionales.',
        metadata: { color: 'green', icon: '🌱', workspaceType: 'general', is_default_bootstrap: true },
        correlation_id: crypto.randomUUID()
      });
      // Activar
      await this._queryDb('UPDATE projects SET is_active = 1 WHERE id = ?',
        [project.id], false, crypto.randomUUID());
      project.is_active = true;
      this.activeProjectIds.add(project.id);
      this.logger.info('project-manager.default_bootstrap.created', { project_id: project.id });
      return project;
    } catch (err) {
      if (err._code === 'CONFLICT_STATE') return null;
      this.logger.error('project-manager.default_bootstrap.failed', { error: err.message });
      this.metrics?.increment('project-manager.errors', { kind: 'bootstrap' });
    }
  }

  // ==========================================
  // CRUD core (privados, lanzan errores con _code canonico)
  // ==========================================

  async _createProject({ name, description = '', metadata = {}, correlation_id, options = {} }) {
    // Defensa: name obligatorio + no vacio. Sin esta validacion, callers que envian
    // name=undefined/null/'' producian un directorio fantasma 'undefined/' en disco
    // (bug observado 2026-05-18 — /opt/enki/data/projects/undefined). Validamos
    // ANTES de cualquier IO o lookup para fallar barato.
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw Object.assign(new Error('name is required and must be a non-empty string'),
        { _code: 'INVALID_INPUT', _details: { field: 'name', received: typeof name === 'string' ? '(empty)' : typeof name } });
    }
    name = name.trim();

    if (await this._projectNameExists(name)) {
      throw Object.assign(new Error(`Project with name "${name}" already exists`),
        { _code: 'CONFLICT_STATE', _details: { kind: 'domain', field: 'name' } });
    }

    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();
    const basePath = await this._createProjectDirectories(projectId, name);
    const { provider = null, model = null, prompt_id = null, parent_project_id = null } = options;

    let parentSystemId = null;
    if (parent_project_id) {
      const parent = this.projects.get(parent_project_id);
      if (!parent) {
        throw Object.assign(new Error(`Parent project not found: ${parent_project_id}`),
          { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: parent_project_id } });
      }
      parentSystemId = parent.system_id || null;
    }

    await this._queryDb(`
      INSERT INTO projects (
        id, name, description, created_at, updated_at, is_active, metadata,
        last_conversation_id, provider, model, prompt_id, base_path, session_state,
        parent_project_id, system_id
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projectId, name, description, now, now,
      JSON.stringify(metadata), null, provider, model, prompt_id, basePath,
      JSON.stringify({}), parent_project_id, parentSystemId
    ], false, correlation_id);

    const project = {
      id: projectId, name, description, created_at: now, updated_at: now,
      is_active: false, metadata, last_conversation_id: null,
      provider, model, prompt_id, base_path: basePath, session_state: {},
      parent_project_id: parent_project_id || null,
      system_id: parentSystemId, system_role: null
    };
    this.projects.set(projectId, project);

    if (parentSystemId) {
      try {
        await this._requestComposition('entity.join', {
          system_id: parentSystemId, entity_id: projectId, role: 'member'
        });
        project.system_role = 'member';
        await this._queryDb('UPDATE projects SET system_role = ? WHERE id = ?',
          ['member', projectId], false, correlation_id);
      } catch (err) {
        this.logger.warn('project-manager.create.system_join.failed', {
          project_id: projectId, parent_system_id: parentSystemId, error: err.message
        });
      }
    }

    await this._initializeProjectSchema(projectId, correlation_id);
    await this._publicarEvento(EVENTS.PROJECT.CREATED, {
      project_id: projectId, name, description,
      parent_project_id: parent_project_id || null, created_at: now
    }, { correlation_id });
    this.metrics?.increment('project-manager.created');

    return project;
  }

  async _updateProject(projectId, updates, correlation_id) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }

    // TP6 — guardia anti-colision por rename. Si el name nuevo produce un slug
    // distinto al actual, el base_path persistido queda desfasado (apunta al
    // slug viejo) y el sistema queda en drift silencioso: name dice una cosa,
    // path fisico otra. Caso testigo (audit 2026-06-02): proyecto creado como
    // "Vaiers" (typo) con base_path=vaiers/, luego renombrado a "Vapers" via
    // _updateProject — name en BD quedo "Vapers" pero los datos siguieron en
    // /opt/enki/data/projects/vaiers/. Rechazamos el rename con cambio de slug
    // para forzar disciplina explicita (borrar + recrear con nombre correcto).
    // Si solo cambia capitalizacion/acentos (slug igual), permitir el rename.
    // Cierra storage-layout.contract.json TP6.
    if (updates.name !== undefined && typeof updates.name === 'string') {
      const newName = updates.name.trim();
      if (newName.length === 0) {
        throw Object.assign(new Error('name cannot be empty on update'),
          { _code: 'INVALID_INPUT', _details: { field: 'name' } });
      }
      const oldSlug = this._slugify(project.name);
      const newSlug = this._slugify(newName);
      if (newSlug !== oldSlug) {
        throw Object.assign(new Error(
            `Rename rejected: name "${newName}" produces slug "${newSlug}" but project base_path uses "${oldSlug}". ` +
            `Renombrar el slug implica mover el directorio fisico y todos los datos persistidos por modulos del vertical — operacion compleja no soportada via update. ` +
            `Si necesitas el nombre nuevo: (a) borra el proyecto y crealo limpio con el nombre correcto, o (b) usa --keep el id actual y solo ajusta name a algo cuyo slug coincida con "${oldSlug}".`
          ),
          { _code: 'CONFLICT_STATE', _details: {
              kind: 'rename_changes_slug',
              current_name: project.name, current_slug: oldSlug,
              requested_name: newName, requested_slug: newSlug
            } });
      }
      // Tambien chequear colision con otro proyecto existente (defensive — _projectNameExists
      // cubre creacion pero update podria llevar a colision si dos proyectos converjan a mismo slug).
      for (const other of this.projects.values()) {
        if (other.id === projectId) continue;
        if (this._slugify(other.name) === newSlug) {
          throw Object.assign(new Error(`Rename rejected: another project ("${other.name}", id ${other.id}) already uses slug "${newSlug}".`),
            { _code: 'ALREADY_EXISTS', _details: { kind: 'slug_collision', existing_project_id: other.id, slug: newSlug } });
        }
      }
      updates.name = newName;
    }

    const now = new Date().toISOString();
    const parts = [];
    const params = [];
    const updatedFields = [];

    if (updates.name !== undefined)        { parts.push('name = ?');        params.push(updates.name);                  project.name = updates.name; updatedFields.push('name'); }
    if (updates.description !== undefined) { parts.push('description = ?'); params.push(updates.description);           project.description = updates.description; updatedFields.push('description'); }
    if (updates.metadata !== undefined)    { parts.push('metadata = ?');    params.push(JSON.stringify(updates.metadata)); project.metadata = updates.metadata; updatedFields.push('metadata'); }

    if (parts.length === 0) return project;

    parts.push('updated_at = ?');
    params.push(now);
    params.push(projectId);

    await this._queryDb(`UPDATE projects SET ${parts.join(', ')} WHERE id = ?`,
      params, false, correlation_id);
    project.updated_at = now;

    await this._publicarEvento(EVENTS.PROJECT.UPDATED, {
      project_id: projectId,
      name: project.name,
      description: project.description,
      parent_project_id: project.parent_project_id || null,
      updated_fields: updatedFields,
      updated_at: now
    }, { correlation_id });
    this.metrics?.increment('project-manager.updated');

    return project;
  }

  async _deleteProject(projectId, correlation_id, { force = false } = {}) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }
    if (project.is_active) {
      throw Object.assign(new Error('Cannot delete active project. Deactivate first.'),
        { _code: 'CONFLICT_STATE', _details: { kind: 'state', state: 'active' } });
    }

    try {
      const depInfo = await this._requestComposition('dependents.has', { entity_id: projectId });
      if (depInfo?.hasDependents && !force) {
        const err = new Error(`Cannot delete project: ${depInfo.count} project(s) depend on it. Use force=true.`);
        err._code = 'CONFLICT_STATE';
        err._details = { dependents: depInfo.dependents };
        throw err;
      }
    } catch (err) {
      if (err._code === 'CONFLICT_STATE') throw err;
      this.logger.warn('project-manager.delete.dependents_check.failed', { error: err.message });
    }

    await this._queryDb('DELETE FROM projects WHERE id = ?', [projectId], false, correlation_id);
    if (project.base_path) await this._deleteProjectDirectories(project.base_path);
    this.projects.delete(projectId);

    await this._publicarEvento(EVENTS.PROJECT.DELETED, {
      project_id: projectId, name: project.name, deleted_at: new Date().toISOString()
    }, { correlation_id });
    this.metrics?.increment('project-manager.deleted');

    return { id: projectId };
  }

  async _activateProject(projectId, correlation_id) {
    const project = this._getProject(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }
    const realId = project.id;
    if (!this.activeProjectIds.has(realId)) {
      await this._queryDb('UPDATE projects SET is_active = 1 WHERE id = ?',
        [realId], false, correlation_id);
      project.is_active = true;
      this.activeProjectIds.add(realId);
    }

    await this._publicarEvento(EVENTS.PROJECT.ACTIVATED, {
      project_id: realId, name: project.name, base_path: project.base_path,
      metadata: project.metadata || {}, activated_at: new Date().toISOString()
    }, { correlation_id });
    this.metrics?.increment('project-manager.activated');

    // Auto-heal de symlinks: rehace los symlinks de las features instaladas (idempotente).
    // Un deploy con `rsync --delete` que tocara /opt/enki/public borraría /shop/<slug>; al
    // activar el proyecto se recrea solo. Nunca rompe la activación (best-effort).
    this._ensureFeatureSymlinks(project).catch(err =>
      this.logger?.warn('project-manager.ensure_symlinks.failed', { project_id: realId, error: err.message }));

    return project;
  }

  async _deactivateProject(projectId, correlation_id) {
    if (!this.activeProjectIds.has(projectId)) {
      throw Object.assign(new Error(`Project ${projectId} is not active`),
        { _code: 'CONFLICT_STATE', _details: { kind: 'state', state: 'inactive' } });
    }
    const project = this.projects.get(projectId);
    await this._queryDb('UPDATE projects SET is_active = 0 WHERE id = ?',
      [projectId], false, correlation_id);
    if (project) project.is_active = false;
    this.activeProjectIds.delete(projectId);

    await this._publicarEvento('project.deactivated', {
      project_id: projectId, name: project?.name || null,
      deactivated_at: new Date().toISOString()
    }, { correlation_id });
    this.metrics?.increment('project-manager.deactivated');
  }

  _getProject(projectId) {
    if (!projectId) return undefined;
    const direct = this.projects.get(projectId);
    if (direct) return direct;
    const slug = this._slugify(projectId);
    if (!slug) return undefined;
    for (const project of this.projects.values()) {
      if (this._slugify(project.name) === slug) return project;
    }
    return undefined;
  }

  // ==========================================
  // Session + AI config + Last conversation
  // ==========================================

  async _saveSession(projectId, sessionData, correlation_id) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }
    const now = new Date().toISOString();
    const sessionState = { ...project.session_state, ...sessionData, saved_at: now };
    await this._queryDb('UPDATE projects SET session_state = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(sessionState), now, projectId], false, correlation_id);
    project.session_state = sessionState;
    project.updated_at = now;
    return sessionState;
  }

  async _restoreSession(projectId) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }
    return {
      last_conversation_id: project.last_conversation_id,
      session_state: project.session_state || {},
      provider: project.provider, model: project.model, prompt_id: project.prompt_id
    };
  }

  async _setLastConversation(projectId, conversationId, correlation_id) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }
    const now = new Date().toISOString();
    await this._queryDb('UPDATE projects SET last_conversation_id = ?, updated_at = ? WHERE id = ?',
      [conversationId, now, projectId], false, correlation_id);
    project.last_conversation_id = conversationId;
    project.updated_at = now;
    return project;
  }

  async _setAIConfig(projectId, aiConfig, correlation_id) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }
    const { provider = null, model = null, prompt_id = null } = aiConfig;
    const now = new Date().toISOString();
    await this._queryDb(
      'UPDATE projects SET provider = ?, model = ?, prompt_id = ?, updated_at = ? WHERE id = ?',
      [provider, model, prompt_id, now, projectId], false, correlation_id
    );
    project.provider = provider;
    project.model = model;
    project.prompt_id = prompt_id;
    project.updated_at = now;
    return { provider, model, prompt_id };
  }

  /**
   * Modelo "una via fija" (agent-flow v1.3.0).
   * Cache de promesas in-flight evita race conditions en creates concurrentes.
   */
  async _getOrCreateDefaultConversation(projectId, correlation_id) {
    const project = this._getProject(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project not found: ${projectId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'project', entity_id: projectId } });
    }
    const realId = project.id;
    if (project.last_conversation_id) {
      return { conversation_id: project.last_conversation_id, created: false };
    }
    if (!this.mqttRequest) {
      throw Object.assign(new Error('mqttRequest not available — required to create canonical conversation'),
        { _code: 'UNKNOWN_ERROR' });
    }
    if (this.pendingDefaultConversations.has(realId)) {
      return await this.pendingDefaultConversations.get(realId);
    }
    const promise = (async () => {
      try {
        const result = await this.mqttRequest('chat-io', 'create', {
          project_id: realId,
          title: `Actividad del sistema — ${project.name}`
        }, { timeout_ms: 5000 });
        const conversation_id = result?.conversation_id || result?.conversation?.id;
        if (!conversation_id) {
          throw new Error('chat-io.create did not return conversation_id');
        }
        await this._setLastConversation(realId, conversation_id, correlation_id);
        this.logger.info('project-manager.default_conversation.created', {
          project_id: realId, conversation_id
        });
        return { conversation_id, created: true };
      } catch (err) {
        this.logger.error('project-manager.default_conversation.failed', {
          project_id: realId, error: err.message
        });
        this.metrics?.increment('project-manager.errors', { kind: 'default_conversation' });
        throw err;
      } finally {
        this.pendingDefaultConversations.delete(realId);
      }
    })();
    this.pendingDefaultConversations.set(realId, promise);
    return await promise;
  }

  // ==========================================
  // Bus event handlers
  // ==========================================

  async onProjectStateRequest() {
    await this._publishUIState();
  }

  async onGetProjectRequest(event) {
    const { request_id, project_id } = event.data || event;
    const project = this._getProject(project_id);
    await this.eventBus.publish(EVENTS.PROJECT.GET_RESPONSE, {
      request_id,
      success: !!project,
      project: project || null,
      error: project ? null : 'Project not found',
      timestamp: new Date().toISOString()
    });
  }

  async onListProjectsRequest(event) {
    const { request_id } = event.data || event;
    const projects = Array.from(this.projects.values());
    await this.eventBus.publish(EVENTS.PROJECT.LIST_RESPONSE, {
      request_id, success: true, projects, count: projects.length,
      active_project_ids: [...this.activeProjectIds],
      timestamp: new Date().toISOString()
    });
  }

  async onGetActiveProjectRequest(event) {
    const { request_id } = event.data || event;
    await this.eventBus.publish('project.active.response', {
      request_id, success: true,
      active_project_ids: [...this.activeProjectIds],
      timestamp: new Date().toISOString()
    });
  }

  async onProjectCreate(event) {
    const data = event.data || event;
    const { name, description, color, icon, workspaceType } = data;
    const correlation_id = data.correlation_id || crypto.randomUUID();
    if (!name || name.trim().length === 0) {
      this.logger.warn('project-manager.create.invalid_payload', { correlation_id });
      return;
    }
    try {
      await this._createProject({
        name: name.trim(),
        description: description?.trim() || '',
        metadata: { color: color || 'blue', icon: icon || '📁', workspaceType: workspaceType || 'general' },
        correlation_id
      });
      await this._publishUIState();
    } catch (err) {
      this.logger.error('project-manager.bus.create.failed', { error: err.message, correlation_id });
      this.metrics?.increment('project-manager.errors', { kind: 'bus_create' });
    }
  }

  async onProjectUpdate(event) {
    const data = event.data || event;
    const { id, name, description, color, icon, workspaceType } = data;
    const correlation_id = data.correlation_id || crypto.randomUUID();
    if (!id) return;
    try {
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      const project = this._getProject(id);
      if (project) {
        const metadata = { ...(project.metadata || {}) };
        if (color !== undefined) metadata.color = color;
        if (icon !== undefined) metadata.icon = icon;
        if (workspaceType !== undefined) metadata.workspaceType = workspaceType;
        updates.metadata = metadata;
      }
      await this._updateProject(id, updates, correlation_id);
      await this._publishUIState();
    } catch (err) {
      this.logger.error('project-manager.bus.update.failed', { id, error: err.message, correlation_id });
      this.metrics?.increment('project-manager.errors', { kind: 'bus_update' });
    }
  }

  async onProjectDelete(event) {
    const data = event.data || event;
    const { id } = data;
    const correlation_id = data.correlation_id || crypto.randomUUID();
    if (!id) return;
    try {
      await this._deleteProject(id, correlation_id);
      await this._publishUIState();
    } catch (err) {
      this.logger.error('project-manager.bus.delete.failed', { id, error: err.message, correlation_id });
      this.metrics?.increment('project-manager.errors', { kind: 'bus_delete' });
    }
  }

  async onProjectActivate(event) {
    const data = event.data || event;
    const { id } = data;
    const correlation_id = data.correlation_id || crypto.randomUUID();
    if (!id) return;
    try {
      await this._activateProject(id, correlation_id);
      await this._publishUIState();
    } catch (err) {
      this.logger.error('project-manager.bus.activate.failed', { id, error: err.message, correlation_id });
      this.metrics?.increment('project-manager.errors', { kind: 'bus_activate' });
    }
  }

  // ==========================================
  // HTTP API handlers
  // ==========================================

  async handleCreateProject(req, context) {
    try {
      const { name, description, metadata, parent_project_id } = req.body || {};
      if (!name || name.trim().length === 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Project name is required',
          { kind: 'domain', field: 'name' });
      }
      const project = await this._createProject({
        name: name.trim(),
        description: description || '',
        metadata: metadata || {},
        correlation_id: context?.correlationId || crypto.randomUUID(),
        options: { parent_project_id }
      });
      return { status: 201, data: { project } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.create.failed', err, 'http_create');
    }
  }

  async handleListProjects() {
    try {
      const projects = Array.from(this.projects.values());
      return {
        status: 200,
        data: { projects, count: projects.length, active_project_ids: [...this.activeProjectIds] }
      };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.list.failed', err, 'http_list');
    }
  }

  async handleGetProject(req) {
    try {
      const project = this._getProject(req.params?.id);
      if (!project) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Project not found',
          { entity_type: 'project', entity_id: req.params?.id });
      }
      return { status: 200, data: { project } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.get.failed', err, 'http_get');
    }
  }

  async handleUpdateProject(req, context) {
    try {
      const project = await this._updateProject(req.params?.id, req.body || {},
        context?.correlationId || crypto.randomUUID());
      return { status: 200, data: { project } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.update.failed', err, 'http_update');
    }
  }

  async handleDeleteProject(req, context) {
    try {
      const result = await this._deleteProject(req.params?.id,
        context?.correlationId || crypto.randomUUID());
      return { status: 200, data: { id: result.id } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.delete.failed', err, 'http_delete');
    }
  }

  async handleActivateProject(req, context) {
    try {
      const project = await this._activateProject(req.params?.id,
        context?.correlationId || crypto.randomUUID());
      return { status: 200, data: { project } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.activate.failed', err, 'http_activate');
    }
  }

  async handleGetActiveProject() {
    try {
      if (this.activeProjectIds.size === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No active projects');
      }
      const projects = [...this.activeProjectIds].map(id => this._getProject(id)).filter(Boolean);
      return { status: 200, data: { projects, active_project_ids: [...this.activeProjectIds] } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.get_active.failed', err, 'http_get_active');
    }
  }

  async handleSaveSession(req, context) {
    try {
      const session = await this._saveSession(req.params?.id, req.body || {},
        context?.correlationId || crypto.randomUUID());
      return { status: 200, data: { session } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.save_session.failed', err, 'http_save_session');
    }
  }

  async handleRestoreSession(req) {
    try {
      const session = await this._restoreSession(req.params?.id);
      return { status: 200, data: session };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.restore_session.failed', err, 'http_restore_session');
    }
  }

  async handleSetAIConfig(req, context) {
    try {
      const config = await this._setAIConfig(req.params?.id, req.body || {},
        context?.correlationId || crypto.randomUUID());
      return { status: 200, data: config };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.set_ai_config.failed', err, 'http_set_ai_config');
    }
  }

  async handleSetLastConversation(req, context) {
    try {
      const { conversation_id } = req.body || {};
      if (!conversation_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'conversation_id is required',
          { kind: 'domain', field: 'conversation_id' });
      }
      const project = await this._setLastConversation(req.params?.id, conversation_id,
        context?.correlationId || crypto.randomUUID());
      return { status: 200, data: { last_conversation_id: project.last_conversation_id } };
    } catch (err) {
      return this._handleHandlerError('project-manager.http.set_last_conversation.failed', err, 'http_set_last_conversation');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name, version: this.version,
        projects_count: this.projects.size,
        active_projects: [...this.activeProjectIds],
        uptime: process.uptime()
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        module: this.name,
        metrics: {
          total_projects: this.projects.size,
          active_project_ids: [...this.activeProjectIds],
          pending_db_requests: this.pendingDbRequests.size,
          pending_composition_requests: this.pendingCompositionRequests.size,
          pending_default_conversations: this.pendingDefaultConversations.size
        }
      }
    };
  }

  // ==========================================
  // UI Handlers (mqttRequest cross-modulo)
  // ==========================================

  async handleUIList() {
    try {
      const projects = Array.from(this.projects.values()).map(p => this._toUIFormat(p));
      return {
        status: 200,
        data: { projects, activeProjectIds: [...this.activeProjectIds], count: projects.length }
      };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.list.failed', err, 'ui_list');
    }
  }

  async handleUIGet(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      const project = this._getProject(id);
      if (!project) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Project not found',
        { entity_type: 'project', entity_id: id });
      return { status: 200, data: { project: this._toUIFormat(project) } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.get.failed', err, 'ui_get');
    }
  }

  async handleUICreate(data) {
    try {
      const { name, description, color, icon, workspaceType, parentProjectId } = data || {};
      if (!name || name.trim().length === 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Project name is required',
          { kind: 'domain', field: 'name' });
      }
      const project = await this._createProject({
        name: name.trim(),
        description: description?.trim() || '',
        metadata: { color: color || 'blue', icon: icon || '📁', workspaceType: workspaceType || 'general' },
        correlation_id: crypto.randomUUID(),
        options: { parent_project_id: parentProjectId || null }
      });
      const basePath = project.base_path;
      try {
        await fs.promises.mkdir(path.join(basePath, 'config'), { recursive: true });
        await fs.promises.mkdir(path.join(basePath, 'handlers'), { recursive: true });
      } catch (mkErr) {
        this.logger.warn('project-manager.ui.create.mkdir.failed', { error: mkErr.message });
      }
      return { status: 201, data: { project: this._toUIFormat(project), created: true } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.create.failed', err, 'ui_create');
    }
  }

  async handleUIUpdate(data) {
    try {
      const { id, name, description, color, icon, workspaceType } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });

      const existing = this._getProject(id);
      if (!existing) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Project not found',
        { entity_type: 'project', entity_id: id });

      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      const metadata = { ...(existing.metadata || {}) };
      if (color !== undefined) metadata.color = color;
      if (icon !== undefined) metadata.icon = icon;
      if (workspaceType !== undefined) metadata.workspaceType = workspaceType;
      updates.metadata = metadata;

      const project = await this._updateProject(id, updates, crypto.randomUUID());
      return { status: 200, data: { project: this._toUIFormat(project), updated: true } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.update.failed', err, 'ui_update');
    }
  }

  async handleUIDelete(data) {
    try {
      const { id, force } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      if (!this._getProject(id)) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Project not found',
        { entity_type: 'project', entity_id: id });
      await this._deleteProject(id, crypto.randomUUID(), { force: !!force });
      return { status: 200, data: { deleted: true, id } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.delete.failed', err, 'ui_delete');
    }
  }

  async handleUIActivate(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      const project = this._getProject(id);
      if (!project) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Project not found',
        { entity_type: 'project', entity_id: id });
      await this._activateProject(project.id, crypto.randomUUID());
      return {
        status: 200,
        data: {
          activated: true,
          id: project.id,
          slug: this._slugify(project.name),
          activeProjectIds: [...this.activeProjectIds]
        }
      };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.activate.failed', err, 'ui_activate');
    }
  }

  async handleUIDeactivate(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      await this._deactivateProject(id, crypto.randomUUID());
      await this._publishUIState();
      return {
        status: 200,
        data: { deactivated: true, activeProjectIds: [...this.activeProjectIds] }
      };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.deactivate.failed', err, 'ui_deactivate');
    }
  }

  async handleUISaveSession(data) {
    try {
      const { id, ...sessionData } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      const session = await this._saveSession(id, sessionData, crypto.randomUUID());
      return { status: 200, data: { saved: true, session } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.save_session.failed', err, 'ui_save_session');
    }
  }

  async handleUIRestoreSession(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      const session = await this._restoreSession(id);
      return { status: 200, data: session };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.restore_session.failed', err, 'ui_restore_session');
    }
  }

  async handleUISetAIConfig(data) {
    try {
      const { id, provider, model, prompt_id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      const config = await this._setAIConfig(id, { provider, model, prompt_id }, crypto.randomUUID());
      return { status: 200, data: { updated: true, ...config } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.set_ai_config.failed', err, 'ui_set_ai_config');
    }
  }

  async handleUISetLastConversation(data) {
    try {
      const { id, conversationId } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });
      if (!conversationId) return this._errorResponse(400, 'INVALID_INPUT', 'Conversation ID is required',
        { kind: 'domain', field: 'conversationId' });
      await this._setLastConversation(id, conversationId, crypto.randomUUID());
      return { status: 200, data: { updated: true, lastConversationId: conversationId } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.set_last_conversation.failed', err, 'ui_set_last_conversation');
    }
  }

  async handleUIGetDefaultConversation(data) {
    try {
      const { project_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required',
        { kind: 'domain', field: 'project_id' });
      if (!this._getProject(project_id)) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Project not found',
        { entity_type: 'project', entity_id: project_id });
      const result = await this._getOrCreateDefaultConversation(project_id, crypto.randomUUID());
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.get_default_conversation.failed', err, 'ui_get_default_conversation');
    }
  }

  async handleUIListFeatures(data) {
    try {
      const { projectId } = data || {};
      const bpDir = path.join(process.cwd(), 'blueprints', 'project-types');

      let installedFeatures = [];
      if (projectId) {
        const project = this._getProject(projectId);
        if (project) installedFeatures = project.metadata?.features || [];
      }

      let files;
      try { files = await fs.promises.readdir(bpDir); }
      catch (_) { return { status: 200, data: { features: [], projectId: projectId || null } }; }

      const features = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = JSON.parse(await fs.promises.readFile(path.join(bpDir, file), 'utf-8'));
          const featureId = content.id || file.replace('.json', '');
          let handlersAvailable = true;
          if (content.copyHandlersFrom) {
            const sourcePath = path.join(this.projectsBasePath, content.copyHandlersFrom, 'handlers');
            try { await fs.promises.access(sourcePath); } catch { handlersAvailable = false; }
          }
          features.push({
            id: featureId,
            label: content.label || featureId,
            icon: content.icon || '',
            description: content.description || '',
            dependencies: content.dependencies || [],
            installed: installedFeatures.includes(featureId),
            handlersAvailable
          });
        } catch (err) {
          this.logger.warn('project-manager.blueprint.invalid', { file, error: err.message });
        }
      }
      return { status: 200, data: { features, projectId: projectId || null } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.list_features.failed', err, 'ui_list_features');
    }
  }

  async handleUIAddFeatures(data) {
    try {
      const { id, features } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'id' });

      const project = this._getProject(id);
      if (!project) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Project not found',
        { entity_type: 'project', entity_id: id });

      const selectedFeatures = Array.isArray(features) ? features : [];
      if (selectedFeatures.length === 0) return this._errorResponse(400, 'INVALID_INPUT',
        'At least one feature is required', { kind: 'domain', field: 'features' });

      const existingFeatures = project.metadata?.features || [];
      const newFeatures = selectedFeatures.filter(f => !existingFeatures.includes(f));
      if (newFeatures.length === 0) {
        return { status: 200, data: { applied: [], skipped: selectedFeatures, reason: 'all_already_installed' } };
      }

      // Load blueprints
      const bpDir = path.join(process.cwd(), 'blueprints', 'project-types');
      const blueprints = new Map();
      const loadErrors = [];
      for (const featureId of newFeatures) {
        try {
          const bpPath = path.join(bpDir, `${featureId}.json`);
          blueprints.set(featureId, JSON.parse(await fs.promises.readFile(bpPath, 'utf-8')));
        } catch (err) {
          loadErrors.push({ featureId, error: err.message });
        }
      }

      // Validar dependencias
      const missingDeps = [];
      for (const [featureId, blueprint] of blueprints) {
        for (const dep of (blueprint.dependencies || [])) {
          if (!existingFeatures.includes(dep) && !newFeatures.includes(dep)) {
            missingDeps.push({ feature: featureId, requires: dep });
          }
        }
      }
      if (missingDeps.length > 0) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `Dependencias no satisfechas: ${missingDeps.map(d => `${d.feature} requiere ${d.requires}`).join(', ')}`,
          { kind: 'domain', missingDeps });
      }

      // Resolver slug del proyecto desde name (project-identity: slug es interno a
      // project-manager, derivado de name via _slugify). Si name es vacio, slug es null.
      const projectSlug = (project.name && this._slugify(project.name)) || null;

      // Validar slug_required: si algun blueprint declara slug_required:true y el proyecto
      // no tiene slug derivable, rechazar antes de aplicar nada.
      // Canonizado en project-feature-blueprints.contract.json principio slug_requirement_explicito.
      const slugRequiredBy = [];
      for (const [featureId, blueprint] of blueprints) {
        if (blueprint.slug_required === true && !projectSlug) {
          slugRequiredBy.push(featureId);
        }
      }
      if (slugRequiredBy.length > 0) {
        return this._errorResponse(412, 'PRECONDITION_FAILED',
          `Features que requieren slug del proyecto pero el proyecto no lo tiene derivable: ${slugRequiredBy.join(', ')}`,
          { kind: 'slug_required_but_undefined', features: slugRequiredBy, project_id: id });
      }

      // Aplicar blueprints
      const correlation_id = crypto.randomUUID();
      const basePath = project.base_path;
      const applied = [];
      const warnings = [];

      for (const [featureId, blueprint] of blueprints) {
        try {
          await this._initializeFromBlueprint(basePath, featureId, blueprint, projectSlug);
          applied.push(featureId);
          this.logger.info('project-manager.feature.installed', {
            project_id: id, feature_id: featureId, base_path: basePath, correlation_id
          });
          this.metrics?.increment('project-manager.feature_installed', { feature: featureId });
        } catch (err) {
          this.logger.error('project-manager.feature.install.failed', {
            project_id: id, feature_id: featureId, error: err.message, correlation_id
          });
          this.metrics?.increment('project-manager.errors', { kind: 'feature_install', feature: featureId });
          warnings.push({ featureId, warning: `Error: ${err.message}` });
        }
      }

      // Update metadata.features
      const updatedFeatures = [...new Set([...existingFeatures, ...applied])];
      await this._updateProject(id, {
        metadata: { ...(project.metadata || {}), features: updatedFeatures }
      }, correlation_id);

      return {
        status: 200,
        data: {
          applied, projectId: id,
          skipped: selectedFeatures.filter(f => existingFeatures.includes(f)),
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(loadErrors.length > 0 ? { loadErrors } : {})
        }
      };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.add_features.failed', err, 'ui_add_features');
    }
  }

  // RPC de bus (patrón híbrido reflejo→reflejo): otro módulo (p.ej. carta-digital al
  // publicar) pide asegurar una feature en un proyecto sin pasar por la UI. Delega en
  // handleUIAddFeatures (idempotente: si ya está instalada, no re-inicializa) y correla
  // la respuesta con request_id. project-manager sigue siendo el ÚNICO dueño del symlink.
  async onEnsureFeatureRequest(event) {
    const d = event?.data || event || {};
    const { request_id, id, project_id, features } = d;
    let result;
    try {
      result = await this.handleUIAddFeatures({ id: id || project_id, features });
    } catch (err) {
      result = { status: 500, error: { code: 'UNKNOWN_ERROR', message: err.message } };
    }
    try {
      await this.eventBus.publish('project.ensure-feature.response', {
        request_id, status: result.status, data: result.data, error: result.error,
        correlation_id: d.correlation_id || crypto.randomUUID(), timestamp: new Date().toISOString()
      });
    } catch (_) { /* best-effort: el caller cae por timeout y usa su aviso */ }
  }

  async handleUIGetUnassigned() {
    try {
      const allProjectIds = Array.from(this.projects.keys());
      let unassignedIds = null;
      try {
        unassignedIds = await this._requestComposition('entity.unassigned', { entity_ids: allProjectIds });
      } catch (_) {
        unassignedIds = null;
      }
      let projects;
      if (unassignedIds && Array.isArray(unassignedIds)) {
        projects = unassignedIds.map(id => {
          const project = this.projects.get(id);
          return project
            ? { id, name: project.name, description: project.description }
            : { id };
        });
      } else {
        projects = Array.from(this.projects.values())
          .filter(p => !p.system_id)
          .map(p => ({ id: p.id, name: p.name, description: p.description }));
      }
      return { status: 200, data: { projects, count: projects.length } };
    } catch (err) {
      return this._handleHandlerError('project-manager.ui.get_unassigned.failed', err, 'ui_get_unassigned');
    }
  }

  // ==========================================
  // Internals — UI state + helpers
  // ==========================================

  async _publishUIState() {
    if (!this.eventBus) return;
    const projects = Array.from(this.projects.values()).map(p => this._toUIFormat(p));
    await this.eventBus.publish('project.state', {
      projects,
      activeProjectIds: [...this.activeProjectIds],
      count: projects.length,
      timestamp: new Date().toISOString()
    });
  }

  _toUIFormat(p) {
    return {
      id: p.id, name: p.name, slug: this._slugify(p.name),
      description: p.description || '',
      color: p.metadata?.color || 'blue',
      icon: p.metadata?.icon || '📁',
      workspaceType: p.metadata?.workspaceType || 'general',
      metadata: p.metadata || {},
      isActive: p.is_active === true || p.is_active === 1,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      systemId: p.system_id || null,
      systemRole: p.system_role || null,
      parentProjectId: p.parent_project_id || null
    };
  }

  _slugify(name) {
    return String(name || '').toLowerCase().trim()
      .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i').replace(/[óòöôõ]/g, 'o')
      .replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
      .replace(/[^a-z0-9\s-]/g, '').replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  async _projectNameExists(name) {
    const slug = this._slugify(name);
    if (!slug) return false;
    for (const project of this.projects.values()) {
      if (this._slugify(project.name) === slug) return true;
    }
    const basePath = path.join(this.projectsBasePath, slug);
    try { await fs.promises.access(basePath); return true; } catch { return false; }
  }

  async _createProjectDirectories(projectId, name) {
    const slug = this._slugify(name);
    const basePath = path.join(this.projectsBasePath, slug);
    await fs.promises.mkdir(path.join(basePath, 'db'), { recursive: true });
    await fs.promises.mkdir(path.join(basePath, 'storage'), { recursive: true });
    const persistenciaBase = path.join(basePath, 'persistencia');
    await fs.promises.mkdir(path.join(persistenciaBase, 'eventos'), { recursive: true });
    await fs.promises.mkdir(path.join(persistenciaBase, 'ventas'), { recursive: true });
    await fs.promises.mkdir(path.join(persistenciaBase, 'current'), { recursive: true });
    await fs.promises.mkdir(path.join(persistenciaBase, 'backups'), { recursive: true });
    await fs.promises.mkdir(path.join(basePath, 'contabilidad', 'cierres'), { recursive: true });
    return basePath;
  }

  async _deleteProjectDirectories(basePath) {
    try {
      await fs.promises.rm(basePath, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn('project-manager.directories.delete.failed', { basePath, error: err.message });
      this.metrics?.increment('project-manager.errors', { kind: 'directories_delete' });
    }
  }

  async _initializeProjectSchema(projectId, correlation_id) {
    if (!this.config.defaultSchema) return;
    try {
      await this.eventBus.publish('db.schema.init.request', {
        project_id: projectId,
        schema: this.config.defaultSchema,
        correlation_id
      });
    } catch (err) {
      this.logger.warn('project-manager.project_schema.init.failed', { project_id: projectId, error: err.message });
    }
  }

  /**
   * Aplica un blueprint (feature) sobre un proyecto existente.
   * Crea directorios + merge config.json + copia handlers + escribe initialFiles
   * con namespacing por featureId en storage/.
   */
  /**
   * Aplica un feature blueprint sobre el base_path del proyecto.
   * Sigue project-feature-blueprints.contract.json v1.0.0.
   *
   * @param basePath  Absolute path del proyecto (project.base_path).
   * @param featureId Id del feature (filename sin .json).
   * @param projectDef Contenido del blueprint feature.
   * @param projectSlug Slug del proyecto. Sustituye {{slug}}. null si no definido.
   */
  // Aplica los symlinks de un feature blueprint (mkdir parent → unlink previo → symlink).
  // Idempotente. source es relativo al base_path; target absoluto. Ambos admiten {{slug}}.
  async _applySymlinks(basePath, symlinks, slug, featureId) {
    if (!Array.isArray(symlinks)) return;
    // Sustituye {{slug}} Y {{public_ns}} (el prefijo público global, lib/public-ns.js).
    // El bug: solo se sustituía {{slug}} → el target quedaba con la LITERAL {{public_ns}}
    // (/opt/enki/public/{{public_ns}}/shop/<slug>), fuera del root /opt/enki/public/<ns> que
    // sirve Caddy → 404. _initializeFromBlueprint sí lo sustituía; el auto-heal (este método) no.
    let publicNs = 'a';
    try { publicNs = require('../../lib/public-ns.js').publicNs(); } catch (_) { /* default 'a' */ }
    const sub = (s) => {
      if (typeof s !== 'string') return s;
      let out = s.replace(/\{\{public_ns\}\}/g, publicNs);
      if (slug !== null) out = out.replace(/\{\{slug\}\}/g, slug);
      return out;
    };
    for (const link of symlinks) {
      if (!link || typeof link.source !== 'string' || typeof link.target !== 'string') continue;
      const sourceAbs = path.join(basePath, sub(link.source));
      const targetAbs = sub(link.target);
      try {
        await fs.promises.mkdir(path.dirname(targetAbs), { recursive: true });
        try { await fs.promises.unlink(targetAbs); } catch (_) { /* no existe previo */ }
        await fs.promises.symlink(sourceAbs, targetAbs);
      } catch (err) {
        this.logger.warn('project-manager.symlink_failed', {
          feature: featureId, source: sourceAbs, target: targetAbs, error: err.message
        });
        this.metrics?.increment('project-manager.errors', { kind: 'symlink' });
      }
    }
  }

  // Rehace los symlinks de TODAS las features instaladas del proyecto. Se llama al activar
  // → cualquier symlink perdido (p.ej. /opt/enki/public/shop/<slug> tras un deploy que tocó
  // public/) se restaura solo, para cualquier proyecto, sin pasos manuales.
  async _ensureFeatureSymlinks(project) {
    const features = (project && project.metadata && project.metadata.features) || [];
    if (!Array.isArray(features) || features.length === 0 || !project.base_path) return;
    const slug = (project.name && this._slugify(project.name)) || null;
    const bpDir = path.join(process.cwd(), 'blueprints', 'project-types');
    for (const featureId of features) {
      try {
        const bp = JSON.parse(await fs.promises.readFile(path.join(bpDir, `${featureId}.json`), 'utf-8'));
        if (Array.isArray(bp.symlinks) && bp.symlinks.length) {
          await this._applySymlinks(project.base_path, bp.symlinks, slug, featureId);
        }
      } catch (_) { /* feature sin blueprint o sin symlinks → ignorar */ }
    }
  }

  async _initializeFromBlueprint(basePath, featureId, projectDef, projectSlug = null) {
    // Helper canonico: sustituye {{slug}} por projectSlug (NO por featureId) y
    // {{public_ns}} por el prefijo publico global (config.json web.public_ns, el
    // "botón único" — ver lib/public-ns.js). Asi el prefijo /a/ (o /es/, …) vive en
    // UN sitio y los blueprints (symlink target, public_url, start_url) lo siguen.
    // El bug previo (sustituir {{slug}} por featureId) producia paths con literal
    // 'tienda'. Si slug_required:true y projectSlug es null, el caller ya rechazo.
    let publicNs = 'a';
    try { publicNs = require('../../lib/public-ns.js').publicNs(); } catch (_) { /* default 'a' */ }
    const substituteSlug = (s) => {
      if (typeof s !== 'string') return s;
      let out = s.replace(/\{\{public_ns\}\}/g, publicNs);
      if (projectSlug !== null) out = out.replace(/\{\{slug\}\}/g, projectSlug);
      return out;
    };

    // 1. Directorios (relativos al base_path; prefijo storage/ se renamespacia
    //    a storage/<featureId>/ EXCEPTO si el path ya empieza por
    //    storage/<featureId>/ — opt-out para features que declaran explicitamente
    //    su propio namespace bajo storage).
    for (const dir of (projectDef.directories || [])) {
      const namespacedDir = (dir.startsWith('storage/') && !dir.startsWith(`storage/${featureId}/`))
        ? dir.replace('storage/', `storage/${featureId}/`)
        : dir;
      await fs.promises.mkdir(path.join(basePath, substituteSlug(namespacedDir)), { recursive: true });
    }

    // 2. Config: mergea fragmento en config/config.json con {{slug}} sustituido
    if (projectDef.config && Object.keys(projectDef.config).length > 0) {
      const configDir = path.join(basePath, 'config');
      await fs.promises.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, 'config.json');

      let existingConfig = {};
      try {
        existingConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
      } catch (_) { /* no existing config */ }

      const newConfig = JSON.parse(substituteSlug(JSON.stringify(projectDef.config)));
      const mergedConfig = { ...existingConfig, ...newConfig };
      await fs.promises.writeFile(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
    }

    // 3. Copy handlers (compat con pizzepos/facturas; sin cambios)
    if (projectDef.copyHandlersFrom) {
      const sourcePath = path.join(this.projectsBasePath, projectDef.copyHandlersFrom, 'handlers');
      const targetPath = path.join(basePath, 'handlers');
      try {
        await fs.promises.mkdir(targetPath, { recursive: true });
        const files = await fs.promises.readdir(sourcePath);
        for (const file of files) {
          if (!file.endsWith('.js')) continue;
          const srcFile = path.join(sourcePath, file);
          const stat = await fs.promises.stat(srcFile);
          if (stat.isFile()) await fs.promises.copyFile(srcFile, path.join(targetPath, file));
        }
      } catch (err) {
        this.logger.warn('project-manager.blueprint.handlers_copy.failed', {
          source: projectDef.copyHandlersFrom, error: err.message
        });
        this.metrics?.increment('project-manager.errors', { kind: 'blueprint_handlers_copy' });
      }
    }

    // 4. Initial files. Cambio canonico v1.0:
    //    - Si valor es string → se escribe COMO STRING (no JSON.stringify).
    //      Razon: initialFiles puede contener HTML/SVG/JS plano.
    //    - Si valor es objeto/array → se escribe JSON.stringify pretty.
    //    - Si valor es string que empieza por 'template:', se lee del template path.
    //    - {{slug}} se sustituye tanto en el path como en el contenido string.
    if (projectDef.initialFiles) {
      for (const [filePath, content] of Object.entries(projectDef.initialFiles)) {
        // Mismo opt-out del renamespacing que en directories[]
        const namespacedPath = (filePath.startsWith('storage/') && !filePath.startsWith(`storage/${featureId}/`))
          ? filePath.replace('storage/', `storage/${featureId}/`)
          : filePath;
        const fullPath = path.join(basePath, substituteSlug(namespacedPath));
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

        let textToWrite;
        if (typeof content === 'string' && content.startsWith('template:')) {
          const templateRel = content.slice('template:'.length);
          const templatePath = path.join(process.cwd(), 'blueprints', 'project-types', '_templates', templateRel);
          try {
            textToWrite = await fs.promises.readFile(templatePath, 'utf-8');
            textToWrite = substituteSlug(textToWrite);
          } catch (err) {
            this.logger.warn('project-manager.blueprint.template_missing', {
              feature: featureId, template: templateRel, error: err.message
            });
            this.metrics?.increment('project-manager.errors', { kind: 'blueprint_template_missing' });
            continue;
          }
        } else if (typeof content === 'string') {
          textToWrite = substituteSlug(content);
        } else {
          // Objeto / array / primitivo: stringify pretty con sustitucion.
          textToWrite = substituteSlug(JSON.stringify(content, null, 2));
        }
        await fs.promises.writeFile(fullPath, textToWrite, 'utf-8');
      }
    }

    // 5. Symlinks (nuevo v1.0). Crea enlaces simbolicos fuera del base_path.
    //    Target absoluto puede usar {{slug}}. Source es relativo al base_path.
    //    Crea el dir parent del target si no existe. Si el symlink ya existe, lo
    //    reemplaza (idempotente).
    await this._applySymlinks(basePath, projectDef.symlinks, projectSlug, featureId);

    // 6. Verify_after (nuevo v1.0). Post-condition: paths que deben existir tras aplicar.
    //    Si falta alguno, lanza error — el caller lo captura como warning de feature.
    if (Array.isArray(projectDef.verify_after)) {
      const missing = [];
      for (const p of projectDef.verify_after) {
        const fullPath = path.join(basePath, substituteSlug(p));
        try { await fs.promises.access(fullPath); }
        catch (_) { missing.push(p); }
      }
      if (missing.length > 0) {
        throw new Error(`verify_after failed: paths missing ${missing.join(', ')}`);
      }
    }
  }

  _rowToProject(row) {
    return {
      id: row.id, name: row.name, description: row.description || '',
      created_at: row.created_at, updated_at: row.updated_at,
      is_active: row.is_active === 1 || row.is_active === true,
      metadata: row.metadata ? this._safeParse(row.metadata) : {},
      last_conversation_id: row.last_conversation_id || null,
      provider: row.provider || null,
      model: row.model || null,
      prompt_id: row.prompt_id || null,
      base_path: row.base_path || null,
      session_state: row.session_state ? this._safeParse(row.session_state) : {},
      system_id: row.system_id || null,
      system_role: row.system_role || null,
      parent_project_id: row.parent_project_id || null
    };
  }

  _safeParse(val) {
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return {}; }
  }

  // ==========================================
  // Helpers canonicos POC2 (5 transferibles)
  // ==========================================

  // Reglas especificas del dominio del modulo. BaseModule cubre los keywords genericos.
  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('cannot delete active') || msg.includes('already exists') || msg.includes('depend')) return 'CONFLICT_STATE';
    return super._classifyHandlerError(err);
  }
}

module.exports = ProjectManagerModule;
