/**
 * Project Manager - Helpers
 * Utilidades: slugify, formato UI, publicación de estado
 */

module.exports = {

  /**
   * Create URL-safe slug from project name
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
  },

  /**
   * Convert a project object to the standard UI format.
   * Single source of truth for project→UI transformation.
   * @param {Object} p - Raw project object from DB/cache
   * @returns {Object} Formatted project for UI consumption
   */
  toUIFormat(p) {
    return {
      id: p.id,
      name: p.name,
      description: p.description || '',
      color: p.metadata?.color || 'blue',
      icon: p.metadata?.icon || '📁',
      workspaceType: p.metadata?.workspaceType || 'general',
      isActive: p.is_active === true || p.is_active === 1,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      systemId: p.system_id || null,
      systemRole: p.system_role || null,
      parentProjectId: p.parent_project_id || null
    };
  },

  /**
   * Publica estado completo para UI via eventBus
   * EventBus transforma 'project.state' → 'core/{coreId}/events/project/state'
   * Frontend suscribe a 'core/{coreId}/events/project/state'
   * @private
   */
  async publishUIState() {
    const projects = this.listProjects().map(p => this.toUIFormat(p));

    const state = {
      projects,
      activeProjectId: this.activeProjectId,
      count: projects.length
    };

    // Publicar via eventBus → MQTT topic: core/*/events/project/state
    await this.eventBus.emit('project/state', state);
    this.logger.debug('project-manager.state.published', { count: projects.length });
  }
};
