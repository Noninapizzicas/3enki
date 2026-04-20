const crypto = require('crypto');

class ChatAiBridgeModule {
  constructor() {
    this.name = 'chat-ai-bridge';
    this.version = '1.0.0';

    this.logger = null;
    this.eventBus = null;
    this.config = null;

    this.activeProjectId = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    this.logger.info('chat-ai-bridge.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger?.info('chat-ai-bridge.unloaded', { module: this.name });
  }

  // ==========================================
  // Project lifecycle
  // ==========================================

  onProjectActivated(event) {
    const { project_id } = event.data || event;
    if (project_id) this.activeProjectId = project_id;
  }

  onProjectDeactivated(event) {
    const { project_id } = event.data || event;
    if (this.activeProjectId === project_id) this.activeProjectId = null;
  }

  // ==========================================
  // Helpers
  // ==========================================

  async _getProjectId(correlationId) {
    if (this.activeProjectId) return this.activeProjectId;

    const requestId = crypto.randomUUID();
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => { unsub(); resolve(null); }, 5000);
      const unsub = await this.eventBus.subscribe('project.active.response', (event) => {
        const d = event.data || event;
        if (d.request_id !== requestId) return;
        clearTimeout(timeout);
        unsub();
        if (d.active_project_id) this.activeProjectId = d.active_project_id;
        resolve(d.active_project_id || null);
      });
      await this.eventBus.publish('project.active.request', { request_id: requestId, correlation_id: correlationId });
    });
  }

  async _ensureConversation(projectId, conversationId, correlationId) {
    if (conversationId) return conversationId;

    const requestId = crypto.randomUUID();
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => { unsub(); reject(new Error('Create conversation timeout')); }, 10000);
      const unsub = await this.eventBus.subscribe('session.create.response', (event) => {
        const d = event.data || event;
        if (d.request_id !== requestId) return;
        clearTimeout(timeout);
        unsub();
        if (!d.success) reject(new Error(d.error || 'Failed to create conversation'));
        else resolve(d.conversation?.id);
      });
      await this.eventBus.publish('session.create.request', {
        request_id: requestId,
        project_id: projectId,
        correlation_id: correlationId
      });
    });
  }

  // ==========================================
  // UI Handler: conversation.send
  // ==========================================

  async handleConversationSend(data, request) {
    const { conversationId, content, attachments, pageContext } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!content?.trim()) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Content is required' };
    }

    const projectId = await this._getProjectId(correlationId);
    if (!projectId) {
      throw { status: 400, code: 'NO_PROJECT', message: 'No active project' };
    }

    const convId = await this._ensureConversation(projectId, conversationId, correlationId);

    await this.eventBus.publish('chat.send.request', {
      request_id: crypto.randomUUID(),
      conversation_id: convId,
      project_id: projectId,
      content,
      attachments: attachments || [],
      use_tools: true,
      page_context: pageContext || null,
      correlation_id: correlationId
    });

    return { conversationId: convId, status: 'processing' };
  }

  // ==========================================
  // REST API: POST /send
  // ==========================================

  async handleSendMessage(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { conversation_id, content } = req.body || {};

    if (!conversation_id) {
      return { status: 400, data: { success: false, error: 'conversation_id is required' } };
    }
    if (!content?.trim()) {
      return { status: 400, data: { success: false, error: 'content is required' } };
    }

    const projectId = await this._getProjectId(correlationId);
    if (!projectId) {
      return { status: 400, data: { success: false, error: 'No active project' } };
    }

    await this.eventBus.publish('chat.send.request', {
      request_id: crypto.randomUUID(),
      conversation_id,
      project_id: projectId,
      content,
      use_tools: true,
      correlation_id: correlationId
    });

    return { status: 202, data: { success: true, status: 'processing', conversation_id } };
  }

  // ==========================================
  // REST API: GET /health
  // ==========================================

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'ok',
        module: this.name,
        version: this.version,
        active_project: this.activeProjectId || null
      }
    };
  }
}

module.exports = ChatAiBridgeModule;
