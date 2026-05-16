/**
 * composition-manager v2.0.0 — Reescrito al canon (POC2 #5 del horizontal).
 *
 * Servicio genérico de composición de entidades. Trabaja con entity_id
 * abstracto — NO conoce de proyectos, prompts ni dominios específicos.
 * Cualquier módulo puede usarlo via composition.request/response o via
 * UI handlers directos.
 *
 * Tres sub-áreas dentro del mismo dominio:
 *  - Systems: contenedores lógicos que agrupan entidades.
 *  - Links: relaciones direccionales entre entidades.
 *  - Dependencies: dependencias funcionales (data, code, api, context).
 *
 * Tablas owned: systems, system_members, project_links, project_dependencies.
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers UI devuelven { status, data | error: { code, message } }.
 *    Métodos privados lanzan con _code canónico.
 *  - observability: log + metric en cada error path. Prefix 'composition-manager.*'.
 *  - events: 10 eventos canónicos preservados invariantes. correlation_id
 *    propagado.
 *  - lifecycle: onLoad inicializa schema, onUnload limpia pendingDb.
 *  - persistence: DB access via db.query.request a database-manager.
 *  - resilience: timeout configurable + cleanup en onUnload.
 *  - tools: este módulo no expone tools del LLM (operación cross-módulo
 *    via bus, no via LLM).
 *
 * 5 helpers POC2 transferibles:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar específico _queryDb.
 *
 * Monolito (709 LOC) preservado en
 * arquitectura/migracion/_legacy/composition-manager-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/composition-manager-mapa.md
 */

'use strict';

const crypto = require('crypto');

const DEFAULT_DB_TIMEOUT_MS = 10000;

const VALID_LINK_TYPES = ['inspired_by', 'related_to', 'evolved_from'];
const VALID_DEP_TYPES = ['data', 'code', 'api', 'context'];

class CompositionManagerModule {
  constructor() {
    this.name    = 'composition-manager';
    this.version = '2.0.0';

    this.logger    = null;
    this.metrics   = null;
    this.eventBus  = null;
    this.uiHandler = null;
    this.config    = null;

    this.pendingDbRequests = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger    = core.logger;
    this.metrics   = core.metrics;
    this.eventBus  = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config    = core.moduleConfig || {};

    this.logger.info('composition-manager.loading', {
      module: this.name, version: this.version
    });

    await this._initializeSchema();

    this.logger.info('composition-manager.loaded');
  }

  async onUnload() {
    this.logger.info('composition-manager.unloading', {
      pending_db_requests: this.pendingDbRequests.size
    });
    const pending = Array.from(this.pendingDbRequests.values());
    this.pendingDbRequests.clear();
    for (const { timeout, reject } of pending) {
      clearTimeout(timeout);
      try {
        reject(new Error('Module unloading'));
      } catch (rejectErr) {
        this.metrics?.increment('composition-manager.errors', { kind: 'unload_reject' });
      }
    }
  }

  // ==========================================
  // DB access (via database-manager)
  // ==========================================

  async _queryDb(query, params = [], readOnly = true, correlation_id) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDbRequests.delete(request_id);
        this.metrics?.increment('composition-manager.errors', { kind: 'db_timeout' });
        reject(new Error(`DB timeout: ${query.substring(0, 80)}`));
      }, this.config.dbTimeout || DEFAULT_DB_TIMEOUT_MS);

      this.pendingDbRequests.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.query.request', {
        request_id, query, params, read_only: readOnly,
        project_id: 'system', correlation_id
      }).catch(err => {
        clearTimeout(timeout);
        this.pendingDbRequests.delete(request_id);
        this.metrics?.increment('composition-manager.errors', { kind: 'db_publish' });
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
  // Schema init (idempotente)
  // ==========================================

  async _initializeSchema() {
    const correlation_id = crypto.randomUUID();
    this.logger.info('composition-manager.schema.initializing', { correlation_id });

    const tables = [
      `CREATE TABLE IF NOT EXISTS systems (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS system_members (
        system_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (system_id, entity_id),
        FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS project_links (
        id TEXT PRIMARY KEY,
        source_project_id TEXT NOT NULL,
        target_project_id TEXT NOT NULL,
        link_type TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS project_dependencies (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        depends_on_project_id TEXT NOT NULL,
        dependency_type TEXT,
        description TEXT,
        created_at TEXT NOT NULL
      )`
    ];

    for (const sql of tables) {
      await this._queryDb(sql, [], false, correlation_id);
    }

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_sm_system ON system_members(system_id)',
      'CREATE INDEX IF NOT EXISTS idx_sm_entity ON system_members(entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_links_source ON project_links(source_project_id)',
      'CREATE INDEX IF NOT EXISTS idx_links_target ON project_links(target_project_id)',
      'CREATE INDEX IF NOT EXISTS idx_deps_project ON project_dependencies(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_deps_depends ON project_dependencies(depends_on_project_id)'
    ];
    const skipped = await this._applyIndexes(indexes, correlation_id);
    this.logger.info('composition-manager.schema.initialized', {
      correlation_id, indexes_skipped: skipped
    });
  }

  async _applyIndexes(indexes, correlation_id) {
    let skipped = 0;
    for (const sql of indexes) {
      try { await this._queryDb(sql, [], false, correlation_id); }
      catch (_) { skipped++; }
    }
    return skipped;
  }

  // ==========================================
  // Systems (privados, lanzan errores con _code canonico)
  // ==========================================

  async _createSystem(name, description, metadata = {}, correlation_id) {
    if (!name || name.trim().length === 0) {
      throw Object.assign(new Error('System name is required'),
        { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'name' } });
    }

    const systemId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this._queryDb(`
      INSERT INTO systems (id, name, description, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [systemId, name.trim(), description || null, now, now, JSON.stringify(metadata)],
       false, correlation_id);

    await this._publicarEvento('system.created', {
      system_id: systemId,
      name: name.trim(),
      description: description || null,
      created_at: now
    }, { correlation_id });
    this.metrics?.increment('composition-manager.system.created');

    return {
      id: systemId,
      name: name.trim(),
      description: description || '',
      metadata,
      createdAt: now,
      updatedAt: now,
      members: [],
      projects: []
    };
  }

  async _getSystem(systemId, correlation_id) {
    const systems = await this._queryDb(
      'SELECT * FROM systems WHERE id = ?', [systemId], true, correlation_id
    );
    if (systems.length === 0) return null;

    const system = systems[0];
    const members = await this._queryDb(
      'SELECT entity_id, role, joined_at FROM system_members WHERE system_id = ? ORDER BY role, joined_at',
      [systemId], true, correlation_id
    );

    return {
      id: system.id,
      name: system.name,
      description: system.description || '',
      metadata: system.metadata ? this._safeParse(system.metadata) : {},
      createdAt: system.created_at,
      updatedAt: system.updated_at,
      members: members.map(m => ({
        entityId: m.entity_id, role: m.role, joinedAt: m.joined_at
      })),
      // Backward-compat: project-manager y context-manager esperan 'projects'
      projects: members.map(m => ({ id: m.entity_id, role: m.role }))
    };
  }

  async _listSystems(correlation_id) {
    const systems = await this._queryDb(`
      SELECT s.*, COUNT(sm.entity_id) as member_count
      FROM systems s LEFT JOIN system_members sm ON sm.system_id = s.id
      GROUP BY s.id ORDER BY s.name
    `, [], true, correlation_id);

    return systems.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      metadata: s.metadata ? this._safeParse(s.metadata) : {},
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      projectCount: s.member_count || 0
    }));
  }

  async _updateSystem(systemId, updates, correlation_id) {
    const system = await this._getSystem(systemId, correlation_id);
    if (!system) {
      throw Object.assign(new Error(`System not found: ${systemId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'system', entity_id: systemId } });
    }

    const now = new Date().toISOString();
    const parts = ['updated_at = ?'];
    const params = [now];

    if (updates.name !== undefined)        { parts.push('name = ?');        params.push(updates.name.trim()); }
    if (updates.description !== undefined) { parts.push('description = ?'); params.push(updates.description); }
    if (updates.metadata !== undefined)    { parts.push('metadata = ?');    params.push(JSON.stringify(updates.metadata)); }

    params.push(systemId);
    await this._queryDb(`UPDATE systems SET ${parts.join(', ')} WHERE id = ?`,
      params, false, correlation_id);

    await this._publicarEvento('system.updated', {
      system_id: systemId,
      updated_fields: Object.keys(updates),
      updated_at: now
    }, { correlation_id });
    this.metrics?.increment('composition-manager.system.updated');

    return await this._getSystem(systemId, correlation_id);
  }

  async _deleteSystem(systemId, correlation_id) {
    const system = await this._getSystem(systemId, correlation_id);
    if (!system) {
      throw Object.assign(new Error(`System not found: ${systemId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'system', entity_id: systemId } });
    }

    await this._queryDb('DELETE FROM system_members WHERE system_id = ?',
      [systemId], false, correlation_id);
    await this._queryDb('DELETE FROM systems WHERE id = ?',
      [systemId], false, correlation_id);

    await this._publicarEvento('system.deleted', {
      system_id: systemId,
      name: system.name,
      affected_members: system.members.length,
      deleted_at: new Date().toISOString()
    }, { correlation_id });
    this.metrics?.increment('composition-manager.system.deleted');

    return { systemId, affectedProjects: system.members.length };
  }

  async _addEntityToSystem(systemId, entityId, role, correlation_id) {
    const system = await this._getSystem(systemId, correlation_id);
    if (!system) {
      throw Object.assign(new Error(`System not found: ${systemId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'system', entity_id: systemId } });
    }

    const existing = await this._queryDb(
      'SELECT system_id FROM system_members WHERE entity_id = ?',
      [entityId], true, correlation_id
    );

    if (existing.length > 0) {
      if (existing[0].system_id === systemId) {
        return { entityId, systemId, systemName: system.name, role };
      }
      throw Object.assign(new Error('Entity is already in another system'),
        { _code: 'CONFLICT_STATE', _details: {
          kind: 'state', state: 'already_assigned',
          current_system: existing[0].system_id
        } });
    }

    const now = new Date().toISOString();
    await this._queryDb(
      'INSERT INTO system_members (system_id, entity_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [systemId, entityId, role || null, now], false, correlation_id
    );

    await this._publicarEvento('entity.joined_system', {
      entity_id: entityId,
      system_id: systemId,
      system_name: system.name,
      role: role || null,
      joined_at: now
    }, { correlation_id });
    this.metrics?.increment('composition-manager.entity.joined');

    return { entityId, systemId, systemName: system.name, role };
  }

  async _removeEntityFromSystem(entityId, correlation_id) {
    const membership = await this._queryDb(
      'SELECT system_id, role FROM system_members WHERE entity_id = ?',
      [entityId], true, correlation_id
    );
    if (membership.length === 0) {
      throw Object.assign(new Error('Entity is not in any system'),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'membership', entity_id: entityId } });
    }

    const { system_id: systemId, role } = membership[0];
    await this._queryDb(
      'DELETE FROM system_members WHERE entity_id = ?',
      [entityId], false, correlation_id
    );

    await this._publicarEvento('entity.left_system', {
      entity_id: entityId,
      system_id: systemId,
      previous_role: role,
      left_at: new Date().toISOString()
    }, { correlation_id });
    this.metrics?.increment('composition-manager.entity.left');

    return { entityId, previousSystemId: systemId, previousRole: role };
  }

  async _getEntitySystem(entityId, correlation_id) {
    const membership = await this._queryDb(
      'SELECT system_id, role FROM system_members WHERE entity_id = ?',
      [entityId], true, correlation_id
    );
    if (membership.length === 0) return null;

    const system = await this._getSystem(membership[0].system_id, correlation_id);
    return system ? { ...system, entityRole: membership[0].role } : null;
  }

  async _getUnassignedEntities(entityIds, correlation_id) {
    if (!entityIds || entityIds.length === 0) return [];
    const placeholders = entityIds.map(() => '?').join(',');
    const assigned = await this._queryDb(
      `SELECT entity_id FROM system_members WHERE entity_id IN (${placeholders})`,
      entityIds, true, correlation_id
    );
    const assignedSet = new Set(assigned.map(r => r.entity_id));
    return entityIds.filter(id => !assignedSet.has(id));
  }

  // ==========================================
  // Links
  // ==========================================

  async _linkEntities(sourceId, targetId, linkType, reason, correlation_id) {
    if (sourceId === targetId) {
      throw Object.assign(new Error('Cannot link an entity to itself'),
        { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'targetId' } });
    }

    const existing = await this._queryDb(
      `SELECT id FROM project_links
       WHERE source_project_id = ? AND target_project_id = ? AND link_type = ?`,
      [sourceId, targetId, linkType], true, correlation_id
    );
    if (existing.length > 0) {
      throw Object.assign(new Error(`Link already exists with type '${linkType}'`),
        { _code: 'CONFLICT_STATE', _details: { existing_link_id: existing[0].id } });
    }

    const linkId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this._queryDb(`
      INSERT INTO project_links (id, source_project_id, target_project_id, link_type, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [linkId, sourceId, targetId, linkType, reason || null, now], false, correlation_id);

    await this._publicarEvento('entity.linked', {
      link_id: linkId,
      source_id: sourceId,
      target_id: targetId,
      link_type: linkType,
      reason: reason || null,
      created_at: now
    }, { correlation_id });
    this.metrics?.increment('composition-manager.link.created', { type: linkType });

    return { id: linkId, sourceId, targetId, linkType, reason: reason || null, createdAt: now };
  }

  async _unlinkEntities(linkId, correlation_id) {
    const links = await this._queryDb(
      'SELECT * FROM project_links WHERE id = ?', [linkId], true, correlation_id
    );
    if (links.length === 0) {
      throw Object.assign(new Error(`Link not found: ${linkId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'link', entity_id: linkId } });
    }

    await this._queryDb('DELETE FROM project_links WHERE id = ?',
      [linkId], false, correlation_id);

    await this._publicarEvento('entity.unlinked', {
      link_id: linkId,
      source_id: links[0].source_project_id,
      target_id: links[0].target_project_id,
      unlinked_at: new Date().toISOString()
    }, { correlation_id });
    this.metrics?.increment('composition-manager.link.deleted');

    return { linkId };
  }

  async _getEntityLinks(entityId, correlation_id) {
    const links = await this._queryDb(`
      SELECT * FROM project_links
      WHERE source_project_id = ? OR target_project_id = ?
      ORDER BY created_at DESC
    `, [entityId, entityId], true, correlation_id);

    return links.map(l => ({
      id: l.id,
      sourceId: l.source_project_id,
      targetId: l.target_project_id,
      linkType: l.link_type,
      reason: l.reason,
      createdAt: l.created_at,
      direction: l.source_project_id === entityId ? 'outgoing' : 'incoming'
    }));
  }

  async _getRelatedEntities(entityId, correlation_id) {
    const links = await this._getEntityLinks(entityId, correlation_id);
    const relatedIds = new Set();
    for (const l of links) {
      if (l.sourceId !== entityId) relatedIds.add(l.sourceId);
      if (l.targetId !== entityId) relatedIds.add(l.targetId);
    }

    const related = [];
    for (const relatedId of relatedIds) {
      const connectingLinks = links.filter(
        l => l.sourceId === relatedId || l.targetId === relatedId
      );
      related.push({
        id: relatedId,
        links: connectingLinks.map(l => ({
          linkType: l.linkType,
          reason: l.reason,
          direction: l.sourceId === entityId ? 'outgoing' : 'incoming'
        }))
      });
    }
    return related;
  }

  // ==========================================
  // Dependencies
  // ==========================================

  async _addDependency(entityId, dependsOnId, dependencyType, description, correlation_id) {
    if (entityId === dependsOnId) {
      throw Object.assign(new Error('An entity cannot depend on itself'),
        { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'dependsOnId' } });
    }

    const existing = await this._queryDb(
      `SELECT id FROM project_dependencies
       WHERE project_id = ? AND depends_on_project_id = ?`,
      [entityId, dependsOnId], true, correlation_id
    );
    if (existing.length > 0) {
      throw Object.assign(new Error('Dependency already exists'),
        { _code: 'CONFLICT_STATE', _details: { existing_dependency_id: existing[0].id } });
    }

    const depId = crypto.randomUUID();
    const now = new Date().toISOString();
    const depType = dependencyType || 'data';

    await this._queryDb(`
      INSERT INTO project_dependencies (id, project_id, depends_on_project_id, dependency_type, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [depId, entityId, dependsOnId, depType, description || null, now], false, correlation_id);

    await this._publicarEvento('entity.dependency.added', {
      dependency_id: depId,
      entity_id: entityId,
      depends_on_id: dependsOnId,
      dependency_type: depType,
      description: description || null,
      created_at: now
    }, { correlation_id });
    this.metrics?.increment('composition-manager.dependency.added', { type: depType });

    return {
      id: depId, entityId, dependsOnId,
      dependencyType: depType, description: description || null,
      createdAt: now
    };
  }

  async _removeDependency(dependencyId, correlation_id) {
    const deps = await this._queryDb(
      'SELECT * FROM project_dependencies WHERE id = ?',
      [dependencyId], true, correlation_id
    );
    if (deps.length === 0) {
      throw Object.assign(new Error(`Dependency not found: ${dependencyId}`),
        { _code: 'RESOURCE_NOT_FOUND', _details: { entity_type: 'dependency', entity_id: dependencyId } });
    }

    await this._queryDb('DELETE FROM project_dependencies WHERE id = ?',
      [dependencyId], false, correlation_id);

    await this._publicarEvento('entity.dependency.removed', {
      dependency_id: dependencyId,
      entity_id: deps[0].project_id,
      depends_on_id: deps[0].depends_on_project_id,
      removed_at: new Date().toISOString()
    }, { correlation_id });
    this.metrics?.increment('composition-manager.dependency.removed');

    return { dependencyId };
  }

  async _getDependencies(entityId, correlation_id) {
    const deps = await this._queryDb(
      'SELECT * FROM project_dependencies WHERE project_id = ? ORDER BY created_at DESC',
      [entityId], true, correlation_id
    );

    return deps.map(d => ({
      id: d.id,
      entityId: d.project_id,
      dependsOnId: d.depends_on_project_id,
      dependencyType: d.dependency_type,
      description: d.description,
      createdAt: d.created_at
    }));
  }

  async _getDependents(entityId, correlation_id) {
    const deps = await this._queryDb(
      'SELECT * FROM project_dependencies WHERE depends_on_project_id = ? ORDER BY created_at DESC',
      [entityId], true, correlation_id
    );

    return deps.map(d => ({
      id: d.id,
      dependentId: d.project_id,
      dependencyType: d.dependency_type,
      description: d.description,
      createdAt: d.created_at
    }));
  }

  async _hasDependents(entityId, correlation_id) {
    const dependents = await this._getDependents(entityId, correlation_id);
    return {
      hasDependents: dependents.length > 0,
      count: dependents.length,
      dependents: dependents.map(d => ({ id: d.dependentId }))
    };
  }

  // ==========================================
  // Bus handler genérico (composition.request → 18 actions)
  // ==========================================

  async onCompositionRequest(event) {
    const eventData = event.data || event;
    const { request_id, action, correlation_id, ...data } = eventData;

    if (!request_id || !action) {
      this.logger.warn('composition-manager.request.invalid_payload', {
        has_request_id: !!request_id, has_action: !!action
      });
      this.metrics?.increment('composition-manager.errors', { kind: 'invalid_payload' });
      return;
    }

    const cid = correlation_id || crypto.randomUUID();

    try {
      let result;
      switch (action) {
        case 'system.create':
          result = await this._createSystem(data.name, data.description, data.metadata, cid);
          break;
        case 'system.get':
          result = await this._getSystem(data.system_id, cid);
          break;
        case 'system.list':
          result = await this._listSystems(cid);
          break;
        case 'system.update':
          result = await this._updateSystem(data.system_id, data.updates, cid);
          break;
        case 'system.delete':
          result = await this._deleteSystem(data.system_id, cid);
          break;
        case 'entity.join':
          result = await this._addEntityToSystem(data.system_id, data.entity_id, data.role, cid);
          break;
        case 'entity.leave':
          result = await this._removeEntityFromSystem(data.entity_id, cid);
          break;
        case 'entity.system':
          result = await this._getEntitySystem(data.entity_id, cid);
          break;
        case 'entity.unassigned':
          result = await this._getUnassignedEntities(data.entity_ids, cid);
          break;
        case 'link':
          result = await this._linkEntities(data.source_id, data.target_id, data.link_type, data.reason, cid);
          break;
        case 'unlink':
          result = await this._unlinkEntities(data.link_id, cid);
          break;
        case 'links.get':
          result = await this._getEntityLinks(data.entity_id, cid);
          break;
        case 'related.get':
          result = await this._getRelatedEntities(data.entity_id, cid);
          break;
        case 'dep.add':
          result = await this._addDependency(data.entity_id, data.depends_on_id,
            data.dependency_type, data.description, cid);
          break;
        case 'dep.remove':
          result = await this._removeDependency(data.dependency_id, cid);
          break;
        case 'deps.get':
          result = await this._getDependencies(data.entity_id, cid);
          break;
        case 'dependents.get':
          result = await this._getDependents(data.entity_id, cid);
          break;
        case 'dependents.has':
          result = await this._hasDependents(data.entity_id, cid);
          break;
        default:
          throw Object.assign(new Error(`Unknown composition action: ${action}`),
            { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'action' } });
      }

      await this.eventBus.publish('composition.response', {
        request_id, success: true, data: result,
        correlation_id: cid,
        timestamp: new Date().toISOString()
      });
      this.metrics?.increment('composition-manager.request.success', { action });
    } catch (err) {
      const code = err._code || this._classifyHandlerError(err);
      this.logger.warn('composition-manager.request.failed', {
        action, error: err.message, code, correlation_id: cid
      });
      this.metrics?.increment('composition-manager.errors', { kind: 'request', action, code });
      await this.eventBus.publish('composition.response', {
        request_id, success: false,
        error: err.message,
        error_code: code,
        ...(err._details ? { error_details: err._details } : {}),
        correlation_id: cid,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ==========================================
  // UI Handlers — Systems
  // ==========================================

  async handleUISystemCreate(data) {
    try {
      const { name, description, metadata } = data || {};
      const system = await this._createSystem(name, description, metadata, crypto.randomUUID());
      return { status: 201, data: { created: true, system } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_create.failed', err, 'ui_system_create');
    }
  }

  async handleUISystemList() {
    try {
      const systems = await this._listSystems(crypto.randomUUID());
      return { status: 200, data: { systems, count: systems.length } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_list.failed', err, 'ui_system_list');
    }
  }

  async handleUISystemGet(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'System ID is required',
        { kind: 'domain', field: 'id' });
      const system = await this._getSystem(id, crypto.randomUUID());
      if (!system) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'System not found',
        { entity_type: 'system', entity_id: id });
      return { status: 200, data: { system } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_get.failed', err, 'ui_system_get');
    }
  }

  async handleUISystemUpdate(data) {
    try {
      const { id, name, description, metadata } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'System ID is required',
        { kind: 'domain', field: 'id' });

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (metadata !== undefined) updates.metadata = metadata;

      const system = await this._updateSystem(id, updates, crypto.randomUUID());
      return { status: 200, data: { updated: true, system } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_update.failed', err, 'ui_system_update');
    }
  }

  async handleUISystemDelete(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'System ID is required',
        { kind: 'domain', field: 'id' });
      const result = await this._deleteSystem(id, crypto.randomUUID());
      return { status: 200, data: { deleted: true, ...result } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_delete.failed', err, 'ui_system_delete');
    }
  }

  async handleUISystemAddEntity(data) {
    try {
      const { systemId, projectId, role } = data || {};
      if (!systemId) return this._errorResponse(400, 'INVALID_INPUT', 'System ID is required',
        { kind: 'domain', field: 'systemId' });
      if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'projectId' });
      const result = await this._addEntityToSystem(systemId, projectId, role, crypto.randomUUID());
      return { status: 200, data: { added: true, ...result } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_add_entity.failed', err, 'ui_system_add_entity');
    }
  }

  async handleUISystemRemoveEntity(data) {
    try {
      const { projectId } = data || {};
      if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'Project ID is required',
        { kind: 'domain', field: 'projectId' });
      const result = await this._removeEntityFromSystem(projectId, crypto.randomUUID());
      return { status: 200, data: { removed: true, ...result } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_remove_entity.failed', err, 'ui_system_remove_entity');
    }
  }

  async handleUISystemGetUnassigned(data) {
    try {
      const { entityIds } = data || {};
      const unassigned = await this._getUnassignedEntities(entityIds || [], crypto.randomUUID());
      return { status: 200, data: { entityIds: unassigned, count: unassigned.length } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.system_unassigned.failed', err, 'ui_system_unassigned');
    }
  }

  // ==========================================
  // UI Handlers — Links
  // ==========================================

  async handleUILink(data) {
    try {
      const { sourceId, targetId, linkType, reason } = data || {};
      if (!sourceId) return this._errorResponse(400, 'INVALID_INPUT', 'Source ID is required',
        { kind: 'domain', field: 'sourceId' });
      if (!targetId) return this._errorResponse(400, 'INVALID_INPUT', 'Target ID is required',
        { kind: 'domain', field: 'targetId' });
      if (!linkType) return this._errorResponse(400, 'INVALID_INPUT', 'Link type is required',
        { kind: 'domain', field: 'linkType' });
      if (!VALID_LINK_TYPES.includes(linkType)) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `Invalid link type. Must be one of: ${VALID_LINK_TYPES.join(', ')}`,
          { kind: 'domain', field: 'linkType', allowed: VALID_LINK_TYPES });
      }
      const link = await this._linkEntities(sourceId, targetId, linkType, reason, crypto.randomUUID());
      return { status: 201, data: { linked: true, link } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.link.failed', err, 'ui_link');
    }
  }

  async handleUIUnlink(data) {
    try {
      const { linkId } = data || {};
      if (!linkId) return this._errorResponse(400, 'INVALID_INPUT', 'Link ID is required',
        { kind: 'domain', field: 'linkId' });
      await this._unlinkEntities(linkId, crypto.randomUUID());
      return { status: 200, data: { unlinked: true, linkId } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.unlink.failed', err, 'ui_unlink');
    }
  }

  async handleUIGetLinks(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Entity ID is required',
        { kind: 'domain', field: 'id' });
      const links = await this._getEntityLinks(id, crypto.randomUUID());
      return { status: 200, data: { projectId: id, links, count: links.length } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.get_links.failed', err, 'ui_get_links');
    }
  }

  async handleUIGetRelated(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Entity ID is required',
        { kind: 'domain', field: 'id' });
      const relatedEntities = await this._getRelatedEntities(id, crypto.randomUUID());
      return {
        status: 200,
        data: { projectId: id, relatedProjects: relatedEntities, count: relatedEntities.length }
      };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.get_related.failed', err, 'ui_get_related');
    }
  }

  // ==========================================
  // UI Handlers — Dependencies
  // ==========================================

  async handleUIAddDependency(data) {
    try {
      const { projectId, dependsOnProjectId, dependencyType, description } = data || {};
      if (!projectId) return this._errorResponse(400, 'INVALID_INPUT', 'Entity ID is required',
        { kind: 'domain', field: 'projectId' });
      if (!dependsOnProjectId) return this._errorResponse(400, 'INVALID_INPUT',
        'Depends-on entity ID is required',
        { kind: 'domain', field: 'dependsOnProjectId' });
      if (dependencyType && !VALID_DEP_TYPES.includes(dependencyType)) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `Invalid dependency type. Must be one of: ${VALID_DEP_TYPES.join(', ')}`,
          { kind: 'domain', field: 'dependencyType', allowed: VALID_DEP_TYPES });
      }
      const dependency = await this._addDependency(projectId, dependsOnProjectId,
        dependencyType, description, crypto.randomUUID());
      return { status: 201, data: { added: true, dependency } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.add_dependency.failed', err, 'ui_add_dependency');
    }
  }

  async handleUIRemoveDependency(data) {
    try {
      const { dependencyId } = data || {};
      if (!dependencyId) return this._errorResponse(400, 'INVALID_INPUT',
        'Dependency ID is required',
        { kind: 'domain', field: 'dependencyId' });
      await this._removeDependency(dependencyId, crypto.randomUUID());
      return { status: 200, data: { removed: true, dependencyId } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.remove_dependency.failed', err, 'ui_remove_dependency');
    }
  }

  async handleUIGetDependencies(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Entity ID is required',
        { kind: 'domain', field: 'id' });
      const dependencies = await this._getDependencies(id, crypto.randomUUID());
      return { status: 200, data: { projectId: id, dependencies, count: dependencies.length } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.get_dependencies.failed', err, 'ui_get_dependencies');
    }
  }

  async handleUIGetDependents(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'Entity ID is required',
        { kind: 'domain', field: 'id' });
      const dependents = await this._getDependents(id, crypto.randomUUID());
      return { status: 200, data: { projectId: id, dependents, count: dependents.length } };
    } catch (err) {
      return this._handleHandlerError('composition-manager.ui.get_dependents.failed', err, 'ui_get_dependents');
    }
  }

  // ==========================================
  // Helpers POC2 (transferibles) + auxiliares
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
    this.metrics?.increment('composition-manager.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('cannot link') || msg.includes('cannot depend')) return 'INVALID_INPUT';
    if (msg.includes('already') || msg.includes('another system')) return 'CONFLICT_STATE';
    if (msg.includes('unauthorized') || msg.includes('forbidden')) return 'PERMISSION_DENIED';
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

  _safeParse(val) {
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return {}; }
  }
}

module.exports = CompositionManagerModule;
