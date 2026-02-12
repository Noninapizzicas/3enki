/**
 * Project Manager - Session & AI Config
 * Save/restore session, last conversation, AI configuration
 */

const { EVENTS } = require('../../../core/constants');

module.exports = {

  /**
   * Save session state for a project
   */
  async saveSession(projectId, sessionData, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Saving project session');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();
    const sessionState = {
      ...project.session_state,
      ...sessionData,
      saved_at: now
    };

    try {
      await this.queryDatabase(
        'UPDATE projects SET session_state = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(sessionState), now, projectId],
        false,
        correlationId
      );

      project.session_state = sessionState;
      project.updated_at = now;
      this.projects.set(projectId, project);

      this.logger.info({ correlationId, projectId }, 'Project session saved');

      return sessionState;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to save session');
      throw error;
    }
  },

  /**
   * Restore session state for a project
   */
  async restoreSession(projectId, correlationId) {
    this.logger.debug({ correlationId, projectId }, 'Restoring project session');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return {
      last_conversation_id: project.last_conversation_id,
      session_state: project.session_state || {},
      provider: project.provider,
      model: project.model,
      prompt_id: project.prompt_id
    };
  },

  /**
   * Update last conversation ID for a project
   */
  async setLastConversation(projectId, conversationId, correlationId) {
    this.logger.debug({ correlationId, projectId, conversationId }, 'Setting last conversation');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();

    try {
      await this.queryDatabase(
        'UPDATE projects SET last_conversation_id = ?, updated_at = ? WHERE id = ?',
        [conversationId, now, projectId],
        false,
        correlationId
      );

      project.last_conversation_id = conversationId;
      project.updated_at = now;
      this.projects.set(projectId, project);

      this.logger.info({ correlationId, projectId, conversationId }, 'Last conversation updated');

      return project;
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to set last conversation');
      throw error;
    }
  },

  /**
   * Set AI configuration override for a project
   */
  async setProjectAIConfig(projectId, aiConfig, correlationId) {
    this.logger.info({ correlationId, projectId, aiConfig }, 'Setting project AI config');

    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();
    const { provider, model, prompt_id } = aiConfig;

    const queryParts = ['updated_at = ?'];
    const params = [now];

    if (provider !== undefined) {
      queryParts.push('provider = ?');
      params.push(provider);
      project.provider = provider;
    }

    if (model !== undefined) {
      queryParts.push('model = ?');
      params.push(model);
      project.model = model;
    }

    if (prompt_id !== undefined) {
      queryParts.push('prompt_id = ?');
      params.push(prompt_id);
      project.prompt_id = prompt_id;
    }

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
        updated_fields: ['provider', 'model', 'prompt_id'].filter(f => aiConfig[f] !== undefined),
        updated_at: now
      });

      this.logger.info({ correlationId, projectId }, 'Project AI config updated');

      return {
        provider: project.provider,
        model: project.model,
        prompt_id: project.prompt_id
      };
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message }, 'Failed to set AI config');
      throw error;
    }
  }
};
