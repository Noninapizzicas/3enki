/**
 * Project Manager - EventBus Handlers
 * Event-driven request/response and MQTT bridge handlers
 */

const crypto = require('crypto');
const { EVENTS } = require('../../../core/constants');

module.exports = {

  /**
   * Handle project.get.request
   */
  async onGetProjectRequest(event) {
    const eventData = event.data || event;
    const { request_id, project_id, correlation_id } = eventData;
    this.logger.debug('project.get.request.received', { correlationId: correlation_id, requestId: request_id, projectId: project_id });

    const project = this.getProject(project_id);

    await this.eventBus.publish(EVENTS.PROJECT.GET_RESPONSE, {
      request_id,
      success: !!project,
      project: project || null,
      error: project ? null : 'Project not found'
    });
  },

  /**
   * Handle project.list.request
   */
  async onListProjectsRequest(event) {
    const eventData = event.data || event;
    const { request_id, correlation_id } = eventData;
    this.logger.debug('project.list.request.received', { correlationId: correlation_id, requestId: request_id });

    const projects = this.listProjects();

    await this.eventBus.publish(EVENTS.PROJECT.LIST_RESPONSE, {
      request_id,
      success: true,
      projects,
      count: projects.length,
      active_project_id: this.activeProjectId
    });
  },

  /**
   * Handle project.active.request
   */
  async onGetActiveProjectRequest(event) {
    const eventData = event.data || event;
    const { request_id, correlation_id } = eventData;
    this.logger.debug('project.active.request.received', { correlationId: correlation_id, requestId: request_id });

    await this.eventBus.publish('project.active.response', {
      request_id,
      success: true,
      active_project_id: this.activeProjectId
    });
  },

  /**
   * Handle context.full.request (Phase 5)
   */
  async onContextFullRequest(event) {
    const eventData = event.data || event;
    const { request_id, project_id, correlation_id } = eventData;

    this.logger.debug('context.full.request.received', { correlationId: correlation_id, requestId: request_id, projectId: project_id });

    try {
      const fullContext = await this.getFullProjectContext(project_id, correlation_id || crypto.randomUUID());

      await this.eventBus.publish('context.full.response', {
        request_id, success: true, context: fullContext, correlation_id
      });
    } catch (error) {
      this.logger.warn('context.full.request.failed', { correlationId: correlation_id, error: error.message });

      await this.eventBus.publish('context.full.response', {
        request_id, success: false, context: null, error: error.message, correlation_id
      });
    }
  },

  // ==================== MQTT BRIDGE HANDLERS ====================

  /**
   * Handle project/state/request - UI solicita estado
   */
  async onProjectStateRequest(event) {
    this.logger.debug('mqtt.project.state.request');
    await this.publishUIState();
  },

  /**
   * Handle project/create - UI crea proyecto
   */
  async onProjectCreate(event) {
    const eventData = event.data || event;
    const { name, description, color, icon, workspaceType } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info('mqtt.project.create', { correlationId, name });

    if (!name || name.trim().length === 0) {
      this.logger.warn('mqtt.project.create.name-required', { correlationId });
      return;
    }

    try {
      await this.createProject(
        name.trim(), description?.trim() || '',
        { color: color || 'blue', icon: icon || '📁', workspaceType: workspaceType || 'general' },
        correlationId
      );
      await this.publishUIState();
    } catch (error) {
      this.logger.error('mqtt.project.create.failed', { correlationId, error: error.message });
    }
  },

  /**
   * Handle project/update - UI actualiza proyecto
   */
  async onProjectUpdate(event) {
    const eventData = event.data || event;
    const { id, name, description, color, icon, workspaceType } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info('mqtt.project.update', { correlationId, id });

    if (!id) {
      this.logger.warn('mqtt.project.update.id-required', { correlationId });
      return;
    }

    try {
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();

      const project = this.getProject(id);
      if (project) {
        const metadata = { ...(project.metadata || {}) };
        if (color !== undefined) metadata.color = color;
        if (icon !== undefined) metadata.icon = icon;
        if (workspaceType !== undefined) metadata.workspaceType = workspaceType;
        updates.metadata = metadata;
      }

      await this.updateProject(id, updates, correlationId);
      await this.publishUIState();
    } catch (error) {
      this.logger.error('mqtt.project.update.failed', { correlationId, id, error: error.message });
    }
  },

  /**
   * Handle project/delete - UI elimina proyecto
   */
  async onProjectDelete(event) {
    const eventData = event.data || event;
    const { id } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info('mqtt.project.delete', { correlationId, id });

    if (!id) {
      this.logger.warn('mqtt.project.delete.id-required', { correlationId });
      return;
    }

    try {
      await this.deleteProject(id, correlationId);
      await this.publishUIState();
    } catch (error) {
      this.logger.error('mqtt.project.delete.failed', { correlationId, id, error: error.message });
    }
  },

  /**
   * Handle project/activate - UI activa proyecto
   */
  async onProjectActivate(event) {
    const eventData = event.data || event;
    const { id } = eventData;
    const correlationId = crypto.randomUUID();

    this.logger.info('mqtt.project.activate', { correlationId, id });

    if (!id) {
      this.logger.warn('mqtt.project.activate.id-required', { correlationId });
      return;
    }

    try {
      await this.activateProject(id, correlationId);
      await this.publishUIState();
    } catch (error) {
      this.logger.error('mqtt.project.activate.failed', { correlationId, id, error: error.message });
    }
  }
};
