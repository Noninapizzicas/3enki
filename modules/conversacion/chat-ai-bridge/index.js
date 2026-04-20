const crypto = require('crypto');

class ChatAiBridgeModule {
  constructor() {
    this.name = 'chat-ai-bridge';
    this.version = '1.0.0';

    this.logger = null;
    this.eventBus = null;
    this.config = null;
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
  // UI Handler: conversation.send
  // ==========================================

  async handleConversationSend(data, request) {
    const { conversationId, projectId, content, attachments, pageContext } = data;
    const correlationId = request?.correlationId || crypto.randomUUID();

    if (!content?.trim()) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Content is required' };
    }
    if (!projectId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId is required' };
    }

    await this.eventBus.publish('chat.send.request', {
      request_id: crypto.randomUUID(),
      conversation_id: conversationId || null,
      project_id: projectId,
      content,
      attachments: attachments || [],
      page_context: pageContext || null,
      correlation_id: correlationId
    });

    return { conversationId: conversationId || null, status: 'processing' };
  }

  // ==========================================
  // REST API: POST /send
  // ==========================================

  async handleSendMessage(req, context) {
    const correlationId = context?.correlationId || crypto.randomUUID();
    const { conversation_id, project_id, content } = req.body || {};

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
      conversation_id,
      project_id,
      content,
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
        status: 'ok'
      }
    };
  }
}

module.exports = ChatAiBridgeModule;
