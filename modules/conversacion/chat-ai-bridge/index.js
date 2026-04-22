const crypto = require('crypto');

/**
 * ChatAiBridge — puerta de entrada del frontend al pipeline de chat.
 *
 * Contrato: el frontend es la ÚNICA fuente de verdad del scope de la conexión.
 * En cada mensaje envía (project_id, conversation_id, page, content). El backend
 * no cachea activeProjectId ni pregunta por él vía eventos — lee del payload.
 *
 * Responsabilidades mínimas:
 *   1. Validar que los tres campos de scope vienen en el payload
 *   2. Si no hay conversation_id, crear una via session.create.request
 *   3. Emitir chat.send.request con todo el scope dentro
 */
class ChatAiBridgeModule {
  constructor() {
    this.name = 'chat-ai-bridge';
    this.version = '2.0.0';

    this.logger = null;
    this.eventBus = null;
    this.config = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    this.logger.info('chat-ai-bridge.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger?.info('chat-ai-bridge.unloaded', { module: this.name });
  }

  // ==========================================
  // Helper: crear conversación si no hay (event-driven request/response)
  // ==========================================

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
    const {
      project_id,
      conversationId,
      page,
      content,
      attachments
    } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!project_id) {
      throw { status: 400, code: 'NO_PROJECT', message: 'project_id is required' };
    }
    if (!content?.trim()) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Content is required' };
    }

    const convId = await this._ensureConversation(project_id, conversationId, correlationId);

    await this.eventBus.publish('chat.send.request', {
      request_id: crypto.randomUUID(),
      project_id,
      conversation_id: convId,
      page: page || null,
      content,
      attachments: attachments || [],
      use_tools: true,
      correlation_id: correlationId
    });

    return { conversationId: convId, status: 'processing' };
  }

  // ==========================================
  // REST API: POST /send
  // ==========================================

  async handleSendMessage(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { project_id, conversation_id, page, content } = req.body || {};

    if (!project_id) {
      return { status: 400, data: { success: false, error: 'project_id is required' } };
    }
    if (!conversation_id) {
      return { status: 400, data: { success: false, error: 'conversation_id is required' } };
    }
    if (!content?.trim()) {
      return { status: 400, data: { success: false, error: 'content is required' } };
    }

    await this.eventBus.publish('chat.send.request', {
      request_id: crypto.randomUUID(),
      project_id,
      conversation_id,
      page: page || null,
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
        version: this.version
      }
    };
  }
}

module.exports = ChatAiBridgeModule;
