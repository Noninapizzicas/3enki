/**
 * Project Manager - Systems (Phase 3)
 * Logical containers for related projects
 */

const crypto = require('crypto');

module.exports = {

  /**
   * Create a new system
   */
  async createSystem(name, description, metadata = {}, correlationId) {
    this.logger.info({ correlationId, name }, 'Creating system');

    if (!name || name.trim().length === 0) {
      throw new Error('System name is required');
    }

    const systemId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.queryDatabase(`
      INSERT INTO systems (id, name, description, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [systemId, name.trim(), description || null, now, now, JSON.stringify(metadata)], false, correlationId);

    await this.eventBus.publish('system.created', {
      system_id: systemId, name: name.trim(), description, created_at: now
    });

    this.logger.info({ correlationId, systemId, name }, 'System created successfully');

    return { id: systemId, name: name.trim(), description: description || '', metadata, createdAt: now, updatedAt: now, projects: [] };
  },

  /**
   * Get a system by ID with its associated projects
   */
  async getSystem(systemId, correlationId) {
    this.logger.debug({ correlationId, systemId }, 'Getting system');

    const systems = await this.queryDatabase(
      'SELECT * FROM systems WHERE id = ?', [systemId], true, correlationId
    );

    if (systems.length === 0) return null;

    const system = systems[0];

    const projects = await this.queryDatabase(`
      SELECT id, name, description, system_role, created_at, updated_at, metadata
      FROM projects WHERE system_id = ? ORDER BY system_role, name
    `, [systemId], true, correlationId);

    return {
      id: system.id,
      name: system.name,
      description: system.description || '',
      metadata: system.metadata ? JSON.parse(system.metadata) : {},
      createdAt: system.created_at,
      updatedAt: system.updated_at,
      projects: projects.map(p => ({
        id: p.id, name: p.name, description: p.description || '',
        role: p.system_role,
        metadata: p.metadata ? JSON.parse(p.metadata) : {},
        createdAt: p.created_at, updatedAt: p.updated_at
      }))
    };
  },

  /**
   * List all systems
   */
  async listSystems(correlationId) {
    this.logger.debug({ correlationId }, 'Listing systems');

    const systems = await this.queryDatabase(`
      SELECT s.*, COUNT(p.id) as project_count
      FROM systems s LEFT JOIN projects p ON p.system_id = s.id
      GROUP BY s.id ORDER BY s.name
    `, [], true, correlationId);

    return systems.map(system => ({
      id: system.id,
      name: system.name,
      description: system.description || '',
      metadata: system.metadata ? JSON.parse(system.metadata) : {},
      createdAt: system.created_at,
      updatedAt: system.updated_at,
      projectCount: system.project_count || 0
    }));
  },

  /**
   * Update a system
   */
  async updateSystem(systemId, updates, correlationId) {
    this.logger.info({ correlationId, systemId, updates }, 'Updating system');

    const system = await this.getSystem(systemId, correlationId);
    if (!system) throw new Error(`System not found: ${systemId}`);

    const now = new Date().toISOString();
    const queryParts = ['updated_at = ?'];
    const params = [now];

    if (updates.name !== undefined) { queryParts.push('name = ?'); params.push(updates.name.trim()); }
    if (updates.description !== undefined) { queryParts.push('description = ?'); params.push(updates.description); }
    if (updates.metadata !== undefined) { queryParts.push('metadata = ?'); params.push(JSON.stringify(updates.metadata)); }

    params.push(systemId);

    await this.queryDatabase(
      `UPDATE systems SET ${queryParts.join(', ')} WHERE id = ?`, params, false, correlationId
    );

    await this.eventBus.publish('system.updated', {
      system_id: systemId, updated_fields: Object.keys(updates), updated_at: now
    });

    this.logger.info({ correlationId, systemId }, 'System updated successfully');

    return await this.getSystem(systemId, correlationId);
  },

  /**
   * Delete a system (does not delete projects, just removes their system_id)
   */
  async deleteSystem(systemId, correlationId) {
    this.logger.info({ correlationId, systemId }, 'Deleting system');

    const system = await this.getSystem(systemId, correlationId);
    if (!system) throw new Error(`System not found: ${systemId}`);

    // Remove system_id from all associated projects
    await this.queryDatabase(
      'UPDATE projects SET system_id = NULL, system_role = NULL WHERE system_id = ?',
      [systemId], false, correlationId
    );

    // Update in-memory cache
    for (const project of this.projects.values()) {
      if (project.system_id === systemId) {
        project.system_id = null;
        project.system_role = null;
      }
    }

    await this.queryDatabase('DELETE FROM systems WHERE id = ?', [systemId], false, correlationId);

    await this.eventBus.publish('system.deleted', {
      system_id: systemId, name: system.name,
      affected_projects: system.projects.length,
      deleted_at: new Date().toISOString()
    });

    this.logger.info({ correlationId, systemId }, 'System deleted successfully');

    return { success: true, systemId, affectedProjects: system.projects.length };
  },

  /**
   * Add a project to a system
   */
  async addProjectToSystem(systemId, projectId, role, correlationId) {
    this.logger.info({ correlationId, systemId, projectId, role }, 'Adding project to system');

    const system = await this.getSystem(systemId, correlationId);
    if (!system) throw new Error(`System not found: ${systemId}`);

    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    if (project.system_id && project.system_id !== systemId) {
      throw new Error(`Project '${project.name}' is already in another system`);
    }

    const now = new Date().toISOString();

    await this.queryDatabase(
      'UPDATE projects SET system_id = ?, system_role = ?, updated_at = ? WHERE id = ?',
      [systemId, role || null, now, projectId], false, correlationId
    );

    project.system_id = systemId;
    project.system_role = role || null;
    project.updated_at = now;

    await this.eventBus.publish('project.joined_system', {
      project_id: projectId, project_name: project.name,
      system_id: systemId, system_name: system.name,
      role, joined_at: now
    });

    this.logger.info({ correlationId, systemId, projectId }, 'Project added to system successfully');

    return { projectId, projectName: project.name, systemId, systemName: system.name, role };
  },

  /**
   * Remove a project from its system
   */
  async removeProjectFromSystem(projectId, correlationId) {
    this.logger.info({ correlationId, projectId }, 'Removing project from system');

    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (!project.system_id) throw new Error(`Project '${project.name}' is not in any system`);

    const previousSystemId = project.system_id;
    const previousRole = project.system_role;
    const now = new Date().toISOString();

    await this.queryDatabase(
      'UPDATE projects SET system_id = NULL, system_role = NULL, updated_at = ? WHERE id = ?',
      [now, projectId], false, correlationId
    );

    project.system_id = null;
    project.system_role = null;
    project.updated_at = now;

    await this.eventBus.publish('project.left_system', {
      project_id: projectId, project_name: project.name,
      system_id: previousSystemId, previous_role: previousRole,
      left_at: now
    });

    this.logger.info({ correlationId, projectId, previousSystemId }, 'Project removed from system successfully');

    return { projectId, projectName: project.name, previousSystemId, previousRole };
  },

  /**
   * Get projects not assigned to any system
   */
  async getUnassignedProjects(correlationId) {
    this.logger.debug({ correlationId }, 'Getting unassigned projects');

    return Array.from(this.projects.values())
      .filter(p => !p.system_id)
      .map(p => ({
        id: p.id, name: p.name, description: p.description || '',
        metadata: p.metadata || {},
        createdAt: p.created_at, updatedAt: p.updated_at
      }));
  }
};
