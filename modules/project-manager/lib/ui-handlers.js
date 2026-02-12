/**
 * Project Manager - UI Request/Response Handlers
 * Thin adapter: MQTT request → business logic → response
 * Pattern: await mqttRequest('project', 'action', data)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = {

  // ==================== PROJECT CRUD ====================

  async handleUIList(data, request) {
    const projects = this.listProjects().map(p => this.toUIFormat(p));
    return { projects, activeProjectId: this.activeProjectId, count: projects.length };
  },

  async handleUIGet(data, request) {
    const { id } = data;
    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(id);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    return { project: this.toUIFormat(project) };
  },

  async handleUICreate(data, request) {
    const { name, description, color, icon, workspaceType } = data;
    const correlationId = crypto.randomUUID();

    if (!name || name.trim().length === 0) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project name is required' };
    }

    const project = await this.createProject(
      name.trim(), description?.trim() || '',
      { color: color || 'blue', icon: icon || '📁', workspaceType: workspaceType || 'general' },
      correlationId
    );

    const basePath = project.base_path;
    await fs.promises.mkdir(path.join(basePath, 'config'), { recursive: true });
    await fs.promises.mkdir(path.join(basePath, 'handlers'), { recursive: true });

    return { project: this.toUIFormat(project), created: true };
  },

  async handleUIUpdate(data, request) {
    const { id, name, description, color, icon, workspaceType } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const existing = this.getProject(id);
    if (!existing) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();

    const metadata = { ...(existing.metadata || {}) };
    if (color !== undefined) metadata.color = color;
    if (icon !== undefined) metadata.icon = icon;
    if (workspaceType !== undefined) metadata.workspaceType = workspaceType;
    updates.metadata = metadata;

    const project = await this.updateProject(id, updates, correlationId);

    return { project: this.toUIFormat(project), updated: true };
  },

  async handleUIDelete(data, request) {
    const { id, force } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const existing = this.getProject(id);
    if (!existing) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    try {
      await this.deleteProject(id, correlationId, { force: !!force });
      return { deleted: true, id };
    } catch (error) {
      if (error.code === 'HAS_DEPENDENTS') {
        throw { status: 409, code: 'HAS_DEPENDENTS', message: error.message, dependents: error.dependents };
      }
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIActivate(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const existing = this.getProject(id);
    if (!existing) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    await this.activateProject(id, correlationId);

    return { activated: true, activeProjectId: id };
  },

  async handleUIDeactivate(data, request) {
    const correlationId = crypto.randomUUID();

    if (!this.activeProjectId) return { deactivated: true, activeProjectId: null };

    const previousId = this.activeProjectId;
    const prevProject = this.projects.get(previousId);

    await this.queryDatabase(
      'UPDATE projects SET is_active = 0 WHERE id = ?',
      [previousId], false, correlationId
    );

    if (prevProject) {
      prevProject.is_active = false;
      this.projects.set(previousId, prevProject);
    }
    this.activeProjectId = null;

    await this.eventBus.publish('project.deactivated', {
      project_id: previousId, name: prevProject?.name,
      deactivated_at: new Date().toISOString()
    });

    await this.publishUIState();

    return { deactivated: true, activeProjectId: null };
  },

  // ==================== SESSION & AI CONFIG ====================

  async handleUISaveSession(data, request) {
    const { id, ...sessionData } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const existing = this.getProject(id);
    if (!existing) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const session = await this.saveSession(id, sessionData, correlationId);
    return { saved: true, session };
  },

  async handleUIRestoreSession(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const existing = this.getProject(id);
    if (!existing) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    return await this.restoreSession(id, correlationId);
  },

  async handleUISetAIConfig(data, request) {
    const { id, provider, model, prompt_id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const existing = this.getProject(id);
    if (!existing) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const config = await this.setProjectAIConfig(id, { provider, model, prompt_id }, correlationId);
    return { updated: true, ...config };
  },

  async handleUISetLastConversation(data, request) {
    const { id, conversationId } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    if (!conversationId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Conversation ID is required' };

    const existing = this.getProject(id);
    if (!existing) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    await this.setLastConversation(id, conversationId, correlationId);
    return { updated: true, lastConversationId: conversationId };
  },

  // ==================== COMPOSITION (Phase 1) ====================

  async handleUILink(data, request) {
    const { sourceId, targetId, linkType, reason } = data;
    const correlationId = crypto.randomUUID();

    if (!sourceId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Source project ID is required' };
    if (!targetId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Target project ID is required' };
    if (!linkType) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Link type is required (inspired_by, related_to, evolved_from)' };

    const validTypes = ['inspired_by', 'related_to', 'evolved_from'];
    if (!validTypes.includes(linkType)) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: `Invalid link type. Must be one of: ${validTypes.join(', ')}` };
    }

    try {
      const link = await this.linkProjects(sourceId, targetId, linkType, reason, correlationId);
      return { linked: true, link };
    } catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      if (error.message.includes('already exists')) throw { status: 409, code: 'CONFLICT', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIUnlink(data, request) {
    const { linkId } = data;
    const correlationId = crypto.randomUUID();

    if (!linkId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Link ID is required' };

    try {
      await this.unlinkProjects(linkId, correlationId);
      return { unlinked: true, linkId };
    } catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIGetLinks(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(id);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const links = await this.getProjectLinks(id, correlationId);
    return { projectId: id, links, count: links.length };
  },

  async handleUIGetRelated(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(id);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const relatedProjects = await this.getRelatedProjects(id, correlationId);
    return { projectId: id, relatedProjects, count: relatedProjects.length };
  },

  // ==================== DEPENDENCIES (Phase 2) ====================

  async handleUIAddDependency(data, request) {
    const { projectId, dependsOnProjectId, dependencyType, description } = data;
    const correlationId = crypto.randomUUID();

    if (!projectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };
    if (!dependsOnProjectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Depends on project ID is required' };

    const validTypes = ['data', 'code', 'api', 'context'];
    if (dependencyType && !validTypes.includes(dependencyType)) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: `Invalid dependency type. Must be one of: ${validTypes.join(', ')}` };
    }

    try {
      const dependency = await this.addDependency(projectId, dependsOnProjectId, dependencyType, description, correlationId);
      return { added: true, dependency };
    } catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      if (error.message.includes('already exists')) throw { status: 409, code: 'CONFLICT', message: error.message };
      if (error.message.includes('cannot depend on itself')) throw { status: 400, code: 'VALIDATION_ERROR', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIRemoveDependency(data, request) {
    const { dependencyId } = data;
    const correlationId = crypto.randomUUID();

    if (!dependencyId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Dependency ID is required' };

    try {
      await this.removeDependency(dependencyId, correlationId);
      return { removed: true, dependencyId };
    } catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIGetDependencies(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(id);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const dependencies = await this.getDependencies(id, correlationId);
    return { projectId: id, dependencies, count: dependencies.length };
  },

  async handleUIGetDependents(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(id);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    const dependents = await this.getDependents(id, correlationId);
    return { projectId: id, dependents, count: dependents.length };
  },

  // ==================== SYSTEMS (Phase 3) ====================

  async handleUISystemCreate(data, request) {
    const { name, description, metadata } = data;
    const correlationId = crypto.randomUUID();

    if (!name || name.trim().length === 0) throw { status: 400, code: 'VALIDATION_ERROR', message: 'System name is required' };

    try { return { created: true, system: await this.createSystem(name, description, metadata, correlationId) }; }
    catch (error) { throw { status: 500, code: 'INTERNAL_ERROR', message: error.message }; }
  },

  async handleUISystemList(data, request) {
    const correlationId = crypto.randomUUID();

    try { const systems = await this.listSystems(correlationId); return { systems, count: systems.length }; }
    catch (error) { throw { status: 500, code: 'INTERNAL_ERROR', message: error.message }; }
  },

  async handleUISystemGet(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'System ID is required' };

    try {
      const system = await this.getSystem(id, correlationId);
      if (!system) throw { status: 404, code: 'NOT_FOUND', message: 'System not found' };
      return { system };
    } catch (error) {
      if (error.status) throw error;
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUISystemUpdate(data, request) {
    const { id, name, description, metadata } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'System ID is required' };

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (metadata !== undefined) updates.metadata = metadata;

    try { return { updated: true, system: await this.updateSystem(id, updates, correlationId) }; }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUISystemDelete(data, request) {
    const { id } = data;
    const correlationId = crypto.randomUUID();

    if (!id) throw { status: 400, code: 'VALIDATION_ERROR', message: 'System ID is required' };

    try { return { deleted: true, ...await this.deleteSystem(id, correlationId) }; }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUISystemAddProject(data, request) {
    const { systemId, projectId, role } = data;
    const correlationId = crypto.randomUUID();

    if (!systemId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'System ID is required' };
    if (!projectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    try { return { added: true, ...await this.addProjectToSystem(systemId, projectId, role, correlationId) }; }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      if (error.message.includes('already in another system')) throw { status: 409, code: 'CONFLICT', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUISystemRemoveProject(data, request) {
    const { projectId } = data;
    const correlationId = crypto.randomUUID();

    if (!projectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    try { return { removed: true, ...await this.removeProjectFromSystem(projectId, correlationId) }; }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      if (error.message.includes('not in any system')) throw { status: 400, code: 'VALIDATION_ERROR', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUISystemGetUnassigned(data, request) {
    const correlationId = crypto.randomUUID();

    try { const projects = await this.getUnassignedProjects(correlationId); return { projects, count: projects.length }; }
    catch (error) { throw { status: 500, code: 'INTERNAL_ERROR', message: error.message }; }
  },

  // ==================== CONTEXT (Phase 4) ====================

  async handleUIContextImport(data, request) {
    const { toProjectId, fromProjectId, conversationId, reason } = data;
    const correlationId = crypto.randomUUID();

    if (!toProjectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Target project ID is required' };
    if (!fromProjectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Source project ID is required' };
    if (!conversationId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Conversation ID is required' };

    try { return { imported: true, ...await this.importContext(toProjectId, fromProjectId, conversationId, reason, correlationId) }; }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      if (error.message.includes('already shared')) throw { status: 409, code: 'CONFLICT', message: error.message };
      if (error.message.includes('same project')) throw { status: 400, code: 'VALIDATION_ERROR', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIContextRemove(data, request) {
    const { shareId } = data;
    const correlationId = crypto.randomUUID();

    if (!shareId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Share ID is required' };

    try { await this.removeSharedContext(shareId, correlationId); return { removed: true, shareId }; }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIContextGetShared(data, request) {
    const { projectId } = data;
    const correlationId = crypto.randomUUID();

    if (!projectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(projectId);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    try { const sharedContext = await this.getSharedContext(projectId, correlationId); return { projectId, sharedContext, count: sharedContext.length }; }
    catch (error) { throw { status: 500, code: 'INTERNAL_ERROR', message: error.message }; }
  },

  async handleUIContextGetExported(data, request) {
    const { projectId } = data;
    const correlationId = crypto.randomUUID();

    if (!projectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    const project = this.getProject(projectId);
    if (!project) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' };

    try { const exportedContext = await this.getExportedContext(projectId, correlationId); return { projectId, exportedContext, count: exportedContext.length }; }
    catch (error) { throw { status: 500, code: 'INTERNAL_ERROR', message: error.message }; }
  },

  async handleUIContextGetSources(data, request) {
    const { projectId } = data;
    const correlationId = crypto.randomUUID();

    if (!projectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    try { return await this.getAvailableContextSources(projectId, correlationId); }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  },

  async handleUIContextGetFull(data, request) {
    const { projectId } = data;
    const correlationId = crypto.randomUUID();

    if (!projectId) throw { status: 400, code: 'VALIDATION_ERROR', message: 'Project ID is required' };

    try { return await this.getFullProjectContext(projectId, correlationId); }
    catch (error) {
      if (error.message.includes('not found')) throw { status: 404, code: 'NOT_FOUND', message: error.message };
      throw { status: 500, code: 'INTERNAL_ERROR', message: error.message };
    }
  }
};
