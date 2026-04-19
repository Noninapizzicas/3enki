const ConversationRouter = require('./core/router');

class ConversationRouterModule {
  constructor() {
    this.name = 'conversation-router';
    this.version = '1.0.0';

    this.logger = null;
    this.eventBus = null;
    this.moduleLoader = null;
    this.router = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus || null;
    this.moduleLoader = context.moduleLoader || null;

    const intentRegistry = this.moduleLoader?.intentRegistry || null;

    // chat-session puede estar cargado antes o después.
    // Si no está disponible ahora, se resuelve de forma lazy en route().
    const chatSession = this.moduleLoader?.getModule('chat-session')?.instance || null;

    this.router = new ConversationRouter({ intentRegistry, chatSession, logger: this.logger });

    this.logger.info('conversation-router.loaded', {
      module: this.name,
      intents_registered: intentRegistry?.getStats()?.total || 0,
      chat_session_available: !!chatSession
    });
  }

  async onUnload() {
    this.router = null;
    this.logger?.info('conversation-router.unloaded', { module: this.name });
  }

  /**
   * Enruta un mensaje de usuario.
   *
   * @param {string} message - Texto del usuario
   * @param {string} conversationId - ID de la conversación activa
   * @returns {object} Decisión: { path, tool?, agent?, module?, confidence?, level?, reason? }
   */
  route(message, conversationId) {
    if (!this.router) {
      return { path: 'llm', candidates: [], reason: 'router_not_ready' };
    }

    // Resolución lazy de chat-session si no estaba disponible en onLoad
    if (!this.router.chatSession && this.moduleLoader) {
      this.router.chatSession = this.moduleLoader.getModule('chat-session')?.instance || null;
    }

    const decision = this.router.route(message, conversationId);

    if (this.eventBus) {
      this.eventBus.publish('conversation.routed', {
        conversation_id: conversationId,
        ...decision
      }).catch(() => {});
    }

    return decision;
  }

  async onChatMessageSaved(event) {
    const data = event.data || event;
    const { conversation_id, content, project_id, message_id } = data;
    if (!conversation_id || !content) return;

    const decision = this.route(content, conversation_id);

    await this.eventBus.publish('chat.message.routed', {
      conversation_id, content, project_id, message_id,
      path: decision.path,
      decision
    });
  }
}

module.exports = ConversationRouterModule;
