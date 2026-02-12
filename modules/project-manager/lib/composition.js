/**
 * Project Manager - Composition (Phases 1-2)
 * Project links (inspired_by, related_to, evolved_from)
 * Project dependencies (data, code, api, context)
 */

const crypto = require('crypto');

module.exports = {

  // ==================== LINKS (PHASE 1) ====================

  /**
   * Create a link between two projects
   */
  async linkProjects(sourceProjectId, targetProjectId, linkType, reason, correlationId) {
    this.logger.info({ correlationId, sourceProjectId, targetProjectId, linkType }, 'Linking projects');

    const sourceProject = this.projects.get(sourceProjectId);
    const targetProject = this.projects.get(targetProjectId);

    if (!sourceProject) throw new Error(`Source project not found: ${sourceProjectId}`);
    if (!targetProject) throw new Error(`Target project not found: ${targetProjectId}`);
    if (sourceProjectId === targetProjectId) throw new Error('Cannot link a project to itself');

    // Check if link already exists
    const existingLinks = await this.queryDatabase(
      `SELECT id FROM project_links
       WHERE source_project_id = ? AND target_project_id = ? AND link_type = ?`,
      [sourceProjectId, targetProjectId, linkType],
      true, correlationId
    );

    if (existingLinks.length > 0) {
      throw new Error(`Link already exists between these projects with type '${linkType}'`);
    }

    const linkId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.queryDatabase(`
      INSERT INTO project_links (id, source_project_id, target_project_id, link_type, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [linkId, sourceProjectId, targetProjectId, linkType, reason || null, now], false, correlationId);

    await this.eventBus.publish('project.linked', {
      link_id: linkId,
      source_project_id: sourceProjectId,
      source_project_name: sourceProject.name,
      target_project_id: targetProjectId,
      target_project_name: targetProject.name,
      link_type: linkType,
      reason,
      created_at: now
    });

    this.logger.info({ correlationId, linkId, sourceProjectId, targetProjectId }, 'Projects linked successfully');

    return { id: linkId, sourceProjectId, targetProjectId, linkType, reason, createdAt: now };
  },

  /**
   * Remove a link between projects
   */
  async unlinkProjects(linkId, correlationId) {
    this.logger.info({ correlationId, linkId }, 'Unlinking projects');

    const links = await this.queryDatabase(
      'SELECT * FROM project_links WHERE id = ?',
      [linkId], true, correlationId
    );

    if (links.length === 0) throw new Error(`Link not found: ${linkId}`);

    const link = links[0];

    await this.queryDatabase('DELETE FROM project_links WHERE id = ?', [linkId], false, correlationId);

    await this.eventBus.publish('project.unlinked', {
      link_id: linkId,
      source_project_id: link.source_project_id,
      target_project_id: link.target_project_id,
      link_type: link.link_type,
      unlinked_at: new Date().toISOString()
    });

    this.logger.info({ correlationId, linkId }, 'Projects unlinked successfully');

    return { success: true, linkId };
  },

  /**
   * Get all links for a project (both as source and target)
   */
  async getProjectLinks(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting project links');

    const links = await this.queryDatabase(`
      SELECT
        pl.*,
        sp.name as source_project_name,
        tp.name as target_project_name
      FROM project_links pl
      LEFT JOIN projects sp ON pl.source_project_id = sp.id
      LEFT JOIN projects tp ON pl.target_project_id = tp.id
      WHERE pl.source_project_id = ? OR pl.target_project_id = ?
      ORDER BY pl.created_at DESC
    `, [projectId, projectId], true, correlationId);

    return links.map(link => ({
      id: link.id,
      sourceProjectId: link.source_project_id,
      sourceProjectName: link.source_project_name,
      targetProjectId: link.target_project_id,
      targetProjectName: link.target_project_name,
      linkType: link.link_type,
      reason: link.reason,
      createdAt: link.created_at,
      direction: link.source_project_id === projectId ? 'outgoing' : 'incoming'
    }));
  },

  /**
   * Get related projects (projects connected via links)
   */
  async getRelatedProjects(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting related projects');

    const links = await this.getProjectLinks(projectId, correlationId);

    const relatedIds = new Set();
    for (const link of links) {
      if (link.sourceProjectId !== projectId) relatedIds.add(link.sourceProjectId);
      if (link.targetProjectId !== projectId) relatedIds.add(link.targetProjectId);
    }

    const relatedProjects = [];
    for (const relatedId of relatedIds) {
      const project = this.projects.get(relatedId);
      if (project) {
        const connectingLinks = links.filter(
          l => l.sourceProjectId === relatedId || l.targetProjectId === relatedId
        );

        relatedProjects.push({
          id: project.id,
          name: project.name,
          description: project.description,
          color: project.metadata?.color || 'blue',
          icon: project.metadata?.icon || '📁',
          links: connectingLinks.map(l => ({
            linkType: l.linkType,
            reason: l.reason,
            direction: l.sourceProjectId === projectId ? 'outgoing' : 'incoming'
          }))
        });
      }
    }

    return relatedProjects;
  },

  // ==================== DEPENDENCIES (PHASE 2) ====================

  /**
   * Add a dependency between projects
   */
  async addDependency(projectId, dependsOnProjectId, dependencyType, description, correlationId) {
    this.logger.info({ correlationId, projectId, dependsOnProjectId, dependencyType }, 'Adding dependency');

    const project = this.projects.get(projectId);
    const dependsOnProject = this.projects.get(dependsOnProjectId);

    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (!dependsOnProject) throw new Error(`Dependency project not found: ${dependsOnProjectId}`);
    if (projectId === dependsOnProjectId) throw new Error('A project cannot depend on itself');

    const existingDeps = await this.queryDatabase(
      `SELECT id FROM project_dependencies
       WHERE project_id = ? AND depends_on_project_id = ?`,
      [projectId, dependsOnProjectId], true, correlationId
    );

    if (existingDeps.length > 0) {
      throw new Error(`Dependency already exists: ${project.name} → ${dependsOnProject.name}`);
    }

    const depId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.queryDatabase(`
      INSERT INTO project_dependencies (id, project_id, depends_on_project_id, dependency_type, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [depId, projectId, dependsOnProjectId, dependencyType || 'data', description || null, now], false, correlationId);

    await this.eventBus.publish('project.dependency.added', {
      dependency_id: depId,
      project_id: projectId,
      project_name: project.name,
      depends_on_project_id: dependsOnProjectId,
      depends_on_project_name: dependsOnProject.name,
      dependency_type: dependencyType,
      description,
      created_at: now
    });

    this.logger.info({ correlationId, depId, projectId, dependsOnProjectId }, 'Dependency added successfully');

    return { id: depId, projectId, dependsOnProjectId, dependencyType: dependencyType || 'data', description, createdAt: now };
  },

  /**
   * Remove a dependency
   */
  async removeDependency(dependencyId, correlationId) {
    this.logger.info({ correlationId, dependencyId }, 'Removing dependency');

    const deps = await this.queryDatabase(
      'SELECT * FROM project_dependencies WHERE id = ?',
      [dependencyId], true, correlationId
    );

    if (deps.length === 0) throw new Error(`Dependency not found: ${dependencyId}`);

    const dep = deps[0];

    await this.queryDatabase('DELETE FROM project_dependencies WHERE id = ?', [dependencyId], false, correlationId);

    await this.eventBus.publish('project.dependency.removed', {
      dependency_id: dependencyId,
      project_id: dep.project_id,
      depends_on_project_id: dep.depends_on_project_id,
      removed_at: new Date().toISOString()
    });

    this.logger.info({ correlationId, dependencyId }, 'Dependency removed successfully');

    return { success: true, dependencyId };
  },

  /**
   * Get all dependencies of a project (what this project depends on)
   */
  async getDependencies(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting project dependencies');

    const deps = await this.queryDatabase(`
      SELECT pd.*, p.name as depends_on_project_name, p.description as depends_on_project_description
      FROM project_dependencies pd
      LEFT JOIN projects p ON pd.depends_on_project_id = p.id
      WHERE pd.project_id = ?
      ORDER BY pd.created_at DESC
    `, [projectId], true, correlationId);

    return deps.map(dep => ({
      id: dep.id,
      projectId: dep.project_id,
      dependsOnProjectId: dep.depends_on_project_id,
      dependsOnProjectName: dep.depends_on_project_name,
      dependsOnProjectDescription: dep.depends_on_project_description,
      dependencyType: dep.dependency_type,
      description: dep.description,
      createdAt: dep.created_at
    }));
  },

  /**
   * Get all dependents of a project (projects that depend on this one)
   */
  async getDependents(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting project dependents');

    const deps = await this.queryDatabase(`
      SELECT pd.*, p.name as dependent_project_name, p.description as dependent_project_description
      FROM project_dependencies pd
      LEFT JOIN projects p ON pd.project_id = p.id
      WHERE pd.depends_on_project_id = ?
      ORDER BY pd.created_at DESC
    `, [projectId], true, correlationId);

    return deps.map(dep => ({
      id: dep.id,
      dependentProjectId: dep.project_id,
      dependentProjectName: dep.dependent_project_name,
      dependentProjectDescription: dep.dependent_project_description,
      dependencyType: dep.dependency_type,
      description: dep.description,
      createdAt: dep.created_at
    }));
  },

  /**
   * Check if a project has dependents (used before deletion)
   */
  async hasDependents(projectId, correlationId) {
    const dependents = await this.getDependents(projectId, correlationId);
    return {
      hasDependents: dependents.length > 0,
      count: dependents.length,
      dependents: dependents.map(d => ({
        id: d.dependentProjectId,
        name: d.dependentProjectName
      }))
    };
  }
};
