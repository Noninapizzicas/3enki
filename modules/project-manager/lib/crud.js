/**
 * Project Manager - CRUD Operations
 * Create, Update, Delete, Activate, Get, List
 */

const crypto = require('crypto');
const { EVENTS } = require('../../../core/constants');

module.exports = {

  /**
   * Create new project
   */
  async createProject(name, description = '', metadata = {}, correlationId, options = {}) {
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
        projectId, name, description, now, now,
        JSON.stringify(metadata),
        null, provider, model, prompt_id, basePath,
        JSON.stringify({})
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
      this.logger.error({ correlationId, projectId, name, error: error.message }, 'Failed to create project');
      throw error;
    }
  },

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

      await this.eventBus.publish(EVENTS.PROJECT.UPDATED, {
        project_id: projectId,
        updated_fields: updatedFields,
        updated_at: now
      });

      this.logger.info({ correlationId, projectId }, 'Project updated successfully');

      return project;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to update project');
      throw error;
    }
  },

  /**
   * Delete project
   */
  async deleteProject(projectId, correlationId, options = {}) {
    this.logger.info({ correlationId, projectId }, 'Deleting project');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Cannot delete active project
    if (project.is_active) {
      throw new Error('Cannot delete active project. Deactivate first.');
    }

    // Check for dependents (Phase 2)
    const dependentsInfo = await this.hasDependents(projectId, correlationId);
    if (dependentsInfo.hasDependents && !options.force) {
      const dependentNames = dependentsInfo.dependents.map(d => d.name).join(', ');
      const error = new Error(`Cannot delete project: ${dependentsInfo.count} project(s) depend on it: ${dependentNames}. Use force=true to delete anyway.`);
      error.code = 'HAS_DEPENDENTS';
      error.dependents = dependentsInfo.dependents;
      throw error;
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

      await this.eventBus.publish(EVENTS.PROJECT.DELETED, {
        project_id: projectId,
        name: project.name,
        deleted_at: new Date().toISOString()
      });

      this.logger.info({ correlationId, projectId }, 'Project deleted successfully');

      return { success: true, id: projectId };
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to delete project');
      throw error;
    }
  },

  /**
   * Activate project
   */
  async activateProject(projectId, correlationId) {
    this.logger.info({ correlationId, projectId }, 'Activating project');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Si ya está activo, solo re-emitir el evento
    if (this.activeProjectId === projectId) {
      this.logger.info({ correlationId, projectId }, 'Project already active, re-emitting event');

      await this.eventBus.publish(EVENTS.PROJECT.ACTIVATED, {
        project_id: projectId,
        name: project.name,
        base_path: project.base_path,
        metadata: project.metadata || {},
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

      await this.eventBus.publish(EVENTS.PROJECT.ACTIVATED, {
        project_id: projectId,
        name: project.name,
        base_path: project.base_path,
        metadata: project.metadata || {},
        activated_at: new Date().toISOString()
      });

      this.logger.info({ correlationId, projectId }, 'Project activated successfully');

      return project;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to activate project');
      throw error;
    }
  },

  /**
   * Get project by ID
   */
  getProject(projectId) {
    return this.projects.get(projectId);
  },

  /**
   * List all projects
   */
  listProjects() {
    return Array.from(this.projects.values());
  },

  /**
   * Get active project ID
   */
  getActiveProjectId() {
    return this.activeProjectId;
  }
};
