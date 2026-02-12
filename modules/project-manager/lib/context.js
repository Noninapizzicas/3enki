/**
 * Project Manager - Shared Context (Phase 4)
 * Import/export conversations between projects
 */

const crypto = require('crypto');

module.exports = {

  /**
   * Import a conversation from one project to another
   */
  async importContext(toProjectId, fromProjectId, conversationId, reason, correlationId) {
    this.logger.info({ correlationId, toProjectId, fromProjectId, conversationId }, 'Importing context');

    const toProject = this.projects.get(toProjectId);
    const fromProject = this.projects.get(fromProjectId);

    if (!toProject) throw new Error(`Target project not found: ${toProjectId}`);
    if (!fromProject) throw new Error(`Source project not found: ${fromProjectId}`);
    if (toProjectId === fromProjectId) throw new Error('Cannot import context from same project');

    const existing = await this.queryDatabase(
      `SELECT id FROM shared_context
       WHERE to_project_id = ? AND from_project_id = ? AND conversation_id = ?`,
      [toProjectId, fromProjectId, conversationId], true, correlationId
    );

    if (existing.length > 0) throw new Error('This conversation is already shared with this project');

    const shareId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.queryDatabase(`
      INSERT INTO shared_context (id, from_project_id, to_project_id, conversation_id, reason, imported_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [shareId, fromProjectId, toProjectId, conversationId, reason || null, now], false, correlationId);

    await this.eventBus.publish('context.imported', {
      share_id: shareId,
      from_project_id: fromProjectId, from_project_name: fromProject.name,
      to_project_id: toProjectId, to_project_name: toProject.name,
      conversation_id: conversationId, reason, imported_at: now
    });

    this.logger.info({ correlationId, shareId, toProjectId, fromProjectId }, 'Context imported successfully');

    return {
      id: shareId, fromProjectId, fromProjectName: fromProject.name,
      toProjectId, toProjectName: toProject.name,
      conversationId, reason, importedAt: now
    };
  },

  /**
   * Remove shared context
   */
  async removeSharedContext(shareId, correlationId) {
    this.logger.info({ correlationId, shareId }, 'Removing shared context');

    const shares = await this.queryDatabase(
      'SELECT * FROM shared_context WHERE id = ?', [shareId], true, correlationId
    );

    if (shares.length === 0) throw new Error(`Shared context not found: ${shareId}`);

    const share = shares[0];

    await this.queryDatabase('DELETE FROM shared_context WHERE id = ?', [shareId], false, correlationId);

    await this.eventBus.publish('context.removed', {
      share_id: shareId,
      from_project_id: share.from_project_id, to_project_id: share.to_project_id,
      conversation_id: share.conversation_id,
      removed_at: new Date().toISOString()
    });

    this.logger.info({ correlationId, shareId }, 'Shared context removed successfully');

    return { success: true, shareId };
  },

  /**
   * Get all shared context for a project (imported from other projects)
   */
  async getSharedContext(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting shared context');

    const shares = await this.queryDatabase(`
      SELECT sc.*, p.name as from_project_name, p.description as from_project_description
      FROM shared_context sc
      LEFT JOIN projects p ON sc.from_project_id = p.id
      WHERE sc.to_project_id = ?
      ORDER BY sc.imported_at DESC
    `, [projectId], true, correlationId);

    return shares.map(share => ({
      id: share.id,
      fromProjectId: share.from_project_id, fromProjectName: share.from_project_name,
      fromProjectDescription: share.from_project_description,
      toProjectId: share.to_project_id,
      conversationId: share.conversation_id,
      reason: share.reason, importedAt: share.imported_at
    }));
  },

  /**
   * Get context that this project has shared with others
   */
  async getExportedContext(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting exported context');

    const shares = await this.queryDatabase(`
      SELECT sc.*, p.name as to_project_name, p.description as to_project_description
      FROM shared_context sc
      LEFT JOIN projects p ON sc.to_project_id = p.id
      WHERE sc.from_project_id = ?
      ORDER BY sc.imported_at DESC
    `, [projectId], true, correlationId);

    return shares.map(share => ({
      id: share.id,
      fromProjectId: share.from_project_id,
      toProjectId: share.to_project_id, toProjectName: share.to_project_name,
      toProjectDescription: share.to_project_description,
      conversationId: share.conversation_id,
      reason: share.reason, importedAt: share.imported_at
    }));
  },

  /**
   * Get available context sources for a project
   */
  async getAvailableContextSources(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting available context sources');

    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const relatedProjects = await this.getRelatedProjects(projectId, correlationId);
    const dependencies = await this.getDependencies(projectId, correlationId);

    let systemProjects = [];
    if (project.system_id) {
      const system = await this.getSystem(project.system_id, correlationId);
      if (system) {
        systemProjects = system.projects
          .filter(p => p.id !== projectId)
          .map(p => ({ id: p.id, name: p.name, description: p.description, role: p.role, source: 'system', systemName: system.name }));
      }
    }

    const alreadyImported = await this.getSharedContext(projectId, correlationId);
    const importedMap = new Map(alreadyImported.map(s => [s.fromProjectId, s]));

    const sourceMap = new Map();

    for (const rel of relatedProjects) {
      if (!sourceMap.has(rel.id)) {
        sourceMap.set(rel.id, {
          id: rel.id, name: rel.name, description: rel.description,
          source: 'link', linkType: rel.links?.[0]?.linkType,
          hasImportedContext: importedMap.has(rel.id)
        });
      }
    }

    for (const dep of dependencies) {
      if (!sourceMap.has(dep.dependsOnProjectId)) {
        sourceMap.set(dep.dependsOnProjectId, {
          id: dep.dependsOnProjectId, name: dep.dependsOnProjectName,
          description: dep.dependsOnProjectDescription,
          source: 'dependency', dependencyType: dep.dependencyType,
          hasImportedContext: importedMap.has(dep.dependsOnProjectId)
        });
      }
    }

    for (const sp of systemProjects) {
      if (!sourceMap.has(sp.id)) {
        sourceMap.set(sp.id, { ...sp, hasImportedContext: importedMap.has(sp.id) });
      }
    }

    return { projectId, projectName: project.name, sources: Array.from(sourceMap.values()), importedCount: alreadyImported.length };
  },

  /**
   * Get full context for a project (for AI/agent use)
   */
  async getFullProjectContext(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Getting full project context');

    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const sharedContext = await this.getSharedContext(projectId, correlationId);
    const dependencies = await this.getDependencies(projectId, correlationId);

    let systemInfo = null;
    if (project.system_id) {
      const system = await this.getSystem(project.system_id, correlationId);
      if (system) {
        systemInfo = {
          id: system.id, name: system.name, description: system.description,
          role: project.system_role,
          siblingProjects: system.projects
            .filter(p => p.id !== projectId)
            .map(p => ({ id: p.id, name: p.name, role: p.role }))
        };
      }
    }

    const relatedProjects = await this.getRelatedProjects(projectId, correlationId);

    return {
      project: { id: project.id, name: project.name, description: project.description },
      system: systemInfo,
      dependencies: dependencies.map(d => ({
        projectId: d.dependsOnProjectId, projectName: d.dependsOnProjectName,
        type: d.dependencyType, description: d.description
      })),
      relatedProjects: relatedProjects.map(r => ({ id: r.id, name: r.name, links: r.links })),
      sharedContext: sharedContext.map(s => ({
        fromProject: s.fromProjectName, conversationId: s.conversationId, reason: s.reason
      })),
      inheritedContextCount: sharedContext.length
    };
  }
};
