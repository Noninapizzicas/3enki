class ConversationRouterModule {
  constructor() {
    this.name = 'conversation-router';
    this.version = '1.0.0';

    this.logger = null;
    this.eventBus = null;
    this.intentRegistry = null;

    // conversation_id → { agent_name, started_at }
    // Actualizado por eventos — sin dependencia de chat-session
    this.awaitingAgents = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.intentRegistry = context.moduleLoader?.intentRegistry || null;

    this.logger.info('conversation-router.loaded', {
      module: this.name,
      intents_registered: this.intentRegistry?.getStats()?.total || 0
    });
  }

  async onUnload() {
    this.awaitingAgents.clear();
    this.logger?.info('conversation-router.unloaded', { module: this.name });
  }

  // ==========================================
  // Estado de agentes activos (via eventos)
  // ==========================================

  onAgentExecute(event) {
    const { conversation_id, agent_name } = event.data || event;
    if (conversation_id) {
      this.awaitingAgents.set(conversation_id, {
        agent_name: agent_name || null,
        started_at: new Date().toISOString()
      });
      this.logger.debug('router.agent.awaiting', { conversation_id, agent_name });
    }
  }

  onAgentActive(event) {
    const { conversation_id, agent_name } = event.data || event;
    if (conversation_id) {
      this.awaitingAgents.set(conversation_id, {
        agent_name: agent_name || null,
        started_at: new Date().toISOString()
      });
      this.logger.info('router.agent.recovered', { conversation_id, agent_name });
    }
  }

  onAgentCompleted(event) {
    const { conversation_id } = event.data || event;
    if (conversation_id) {
      this.awaitingAgents.delete(conversation_id);
      this.logger.debug('router.agent.cleared', { conversation_id, reason: 'completed' });
    }
  }

  onAgentFailed(event) {
    const { conversation_id } = event.data || event;
    if (conversation_id) {
      this.awaitingAgents.delete(conversation_id);
      this.logger.debug('router.agent.cleared', { conversation_id, reason: 'failed' });
    }
  }

  // ==========================================
  // Routing
  // ==========================================

  route(message, conversation_id) {
    // Capa 2: ¿Hay agente esperando respuesta en esta conversación?
    const awaiting = this.awaitingAgents.get(conversation_id);
    if (awaiting) {
      this.logger.debug('router.forward_agent', { conversation_id, agent: awaiting.agent_name });
      return {
        path: 'forward_agent',
        agent_name: awaiting.agent_name,
        started_at: awaiting.started_at,
        conversation_id
      };
    }

    // Capa 3: Intent matching
    if (!this.intentRegistry) {
      return { path: 'llm', candidates: [], reason: 'no_intent_registry' };
    }

    const match = this.intentRegistry.match(message);

    if (!match) {
      return { path: 'llm', candidates: [], reason: 'no_match' };
    }

    if (match.level === 'low') {
      return {
        path: 'llm',
        candidates: this.intentRegistry.matchAll(message).slice(0, 5),
        reason: 'low_confidence',
        best: match
      };
    }

    const { intent } = match;

    if (intent.action === 'tool_call') {
      return {
        path: 'tool_call',
        tool: intent.tool,
        module: intent.module,
        confidence: match.confidence,
        level: match.level
      };
    }

    if (intent.action === 'agent') {
      return {
        path: 'agent',
        agent: intent.agent,
        module: intent.module,
        multi_turn: intent.multi_turn || false,
        confidence: match.confidence,
        level: match.level
      };
    }

    return { path: 'llm', candidates: [match], reason: 'unknown_action' };
  }

  async onChatMessageSaved(event) {
    const data = event.data || event;
    const { conversation_id, content, project_id, message_id, messages, page_context, request_id } = data;
    if (!conversation_id || !content) return;

    const decision = this.route(content, conversation_id);
    if (page_context?.route) decision.page_route = page_context.route;

    await this.eventBus.publish('chat.message.routed', {
      conversation_id, content, project_id, message_id, messages,
      request_id: request_id || null,
      path: decision.path,
      decision
    });
  }
}

module.exports = ConversationRouterModule;
