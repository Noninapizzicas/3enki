/**
 * Conversation Router
 *
 * Consume chat.message.saved y republica como chat.message.routed con
 * decision.module = page. Eso es todo.
 *
 * Historia:
 *   - El intent matching por patrón fue eliminado (lo decide el LLM con
 *     sus tools).
 *   - El path 'forward_agent' para multi-turn agents fue eliminado porque
 *     su consumer (agent-bridge) emitía a un evento sin consumidores
 *     reales (código aspiracional).
 */
class ConversationRouterModule {
  constructor() {
    this.name = 'conversation-router';
    this.version = '3.0.0';
    this.logger = null;
    this.eventBus = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.logger.info('conversation-router.loaded');
  }

  async onUnload() {}

  async onChatMessageSaved(event) {
    const data = event.data || event;
    const { conversation_id, content, page } = data;
    if (!conversation_id || !content) return;

    const decision = { path: 'llm', module: page || null };

    await this.eventBus.publish('chat.message.routed', {
      ...data,
      path: decision.path,
      decision
    });
  }
}

module.exports = ConversationRouterModule;
