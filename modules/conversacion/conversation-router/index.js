/**
 * Conversation Router
 *
 * Punto único de decisión para cada mensaje del usuario:
 *
 *   - Si hay un agente multi-turn activo en esta conversación
 *     → path: 'forward_agent' (agent-bridge reenvía al agente)
 *
 *   - En cualquier otro caso → path: 'llm'
 *     El LLM decide con sus tools (incluida invoke_agent) qué hacer.
 *
 * El intent-matching por patrón se eliminó: duplicaba la decisión del LLM
 * y generaba paths (tool_call, agent) que ya no tenían consumidores.
 */
class ConversationRouterModule {
  constructor() {
    this.name = 'conversation-router';
    this.version = '2.0.0';
    this.logger = null;
    this.eventBus = null;

    // conversation_id → { agent_name, started_at }
    this.awaitingAgents = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.logger.info('conversation-router.loaded', { module: this.name });
  }

  async onUnload() {
    this.awaitingAgents.clear();
  }

  // Agent-bridge nos avisa cuando un agente queda activo esperando respuesta del usuario
  onAgentActive(event) {
    const { conversation_id, agent_name } = event.data || event;
    if (!conversation_id) return;
    this.awaitingAgents.set(conversation_id, {
      agent_name: agent_name || null,
      started_at: new Date().toISOString()
    });
  }

  // Cuando el agente termina (ok o error), deja de esperar
  onAgentCleared(event) {
    const { conversation_id } = event.data || event;
    if (conversation_id) this.awaitingAgents.delete(conversation_id);
  }

  async onChatMessageSaved(event) {
    const data = event.data || event;
    const { conversation_id, content, page } = data;
    if (!conversation_id || !content) return;

    const awaiting = this.awaitingAgents.get(conversation_id);
    const decision = awaiting
      ? { path: 'forward_agent', agent_name: awaiting.agent_name, started_at: awaiting.started_at, module: page || null }
      : { path: 'llm', module: page || null };

    await this.eventBus.publish('chat.message.routed', {
      ...data,
      path: decision.path,
      decision
    });
  }
}

module.exports = ConversationRouterModule;
