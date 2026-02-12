/**
 * Project Manager - HTTP API Handlers
 * Thin adapter: HTTP request → business logic → HTTP response
 */

const crypto = require('crypto');

module.exports = {

  async handleCreateProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { name, description, metadata } = req.body || {};

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
  },

  async handleListProjects(req, context) {
    try {
      const projects = this.listProjects();
      return {
        status: 200,
        data: { success: true, projects, count: projects.length, active_project_id: this.activeProjectId }
      };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleGetProject(req, context) {
    const { id } = req.params || {};

    try {
      const project = this.getProject(id);
      if (!project) return { status: 404, data: { success: false, error: 'Project not found' } };
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleUpdateProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const updates = req.body || {};

    try {
      const project = await this.updateProject(id, updates, correlationId);
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      if (error.message.includes('not found')) return { status: 404, data: { success: false, error: error.message } };
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleDeleteProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    try {
      const result = await this.deleteProject(id, correlationId);
      return { status: 200, data: { success: true, id: result.id, message: 'Project deleted successfully' } };
    } catch (error) {
      if (error.message.includes('not found')) return { status: 404, data: { success: false, error: error.message } };
      if (error.message.includes('Cannot delete active')) return { status: 400, data: { success: false, error: error.message } };
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleActivateProject(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    try {
      const project = await this.activateProject(id, correlationId);
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      if (error.message.includes('not found')) return { status: 404, data: { success: false, error: error.message } };
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleGetActiveProject(req, context) {
    try {
      if (!this.activeProjectId) return { status: 404, data: { success: false, error: 'No active project' } };
      const project = this.getProject(this.activeProjectId);
      return { status: 200, data: { success: true, project } };
    } catch (error) {
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleSaveSession(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const sessionData = req.body || {};

    try {
      const session = await this.saveSession(id, sessionData, correlationId);
      return { status: 200, data: { success: true, session } };
    } catch (error) {
      if (error.message.includes('not found')) return { status: 404, data: { success: false, error: error.message } };
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleRestoreSession(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};

    try {
      const session = await this.restoreSession(id, correlationId);
      return { status: 200, data: { success: true, ...session } };
    } catch (error) {
      if (error.message.includes('not found')) return { status: 404, data: { success: false, error: error.message } };
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleSetAIConfig(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const aiConfig = req.body || {};

    try {
      const config = await this.setProjectAIConfig(id, aiConfig, correlationId);
      return { status: 200, data: { success: true, ...config } };
    } catch (error) {
      if (error.message.includes('not found')) return { status: 404, data: { success: false, error: error.message } };
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleSetLastConversation(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { id } = req.params || {};
    const { conversation_id } = req.body || {};

    if (!conversation_id) return { status: 400, data: { success: false, error: 'conversation_id is required' } };

    try {
      const project = await this.setLastConversation(id, conversation_id, correlationId);
      return { status: 200, data: { success: true, last_conversation_id: project.last_conversation_id } };
    } catch (error) {
      if (error.message.includes('not found')) return { status: 404, data: { success: false, error: error.message } };
      return { status: 500, data: { success: false, error: error.message } };
    }
  },

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy', module: 'project-manager',
        projects_count: this.projects.size,
        active_project: this.activeProjectId,
        uptime: process.uptime()
      }
    };
  },

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
};
