/**
 * ConversationRouter — núcleo sin dependencias de módulo.
 *
 * Capas 2 y 3 de la arquitectura conversation-routing:
 *   - Capa 2: Si hay agente activo → forward_agent (sin pasar por matcher)
 *   - Capa 3: Intent matching con IntentRegistry
 *
 * No contiene lógica de dominio. No sabe qué hace cada tool o agente.
 *
 * Posibles retornos de route():
 *   { path: 'forward_agent', agent_name, started_at, conversation_id }
 *   { path: 'tool_call',     tool, module, confidence, level }
 *   { path: 'agent',         agent, module, multi_turn, confidence, level }
 *   { path: 'llm',           candidates, reason }
 */

class ConversationRouter {
  constructor({ intentRegistry, chatSession, logger } = {}) {
    this.intentRegistry = intentRegistry || null;
    this.chatSession = chatSession || null;
    this.logger = logger || null;
  }

  /**
   * Enruta un mensaje a la acción correcta.
   *
   * @param {string} message - Mensaje del usuario
   * @param {string} conversationId - ID de la conversación activa
   * @returns {object} Decisión de enrutamiento
   */
  route(message, conversationId) {
    // Capa 2: ¿Hay un agente esperando respuesta en esta conversación?
    if (this.chatSession && this.chatSession.isAwaitingAgent(conversationId)) {
      const agent = this.chatSession.getActiveAgent(conversationId);

      if (this.logger) {
        this.logger.debug('router.forward_agent', { conversationId, agent: agent?.agent_name });
      }

      return {
        path: 'forward_agent',
        agent_name: agent?.agent_name || null,
        started_at: agent?.started_at || null,
        conversation_id: conversationId
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

    if (this.logger) {
      this.logger.debug('router.intent_match', {
        conversationId,
        level: match.level,
        confidence: match.confidence,
        action: match.intent.action,
        module: match.intent.module
      });
    }

    // Baja confianza → delegar al LLM con candidatos como contexto
    if (match.level === 'low') {
      const candidates = this.intentRegistry.matchAll(message).slice(0, 5);
      return { path: 'llm', candidates, reason: 'low_confidence', best: match };
    }

    // Alta o media confianza → actuar directamente
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

    // Acción desconocida — fallback seguro
    return { path: 'llm', candidates: [match], reason: 'unknown_action' };
  }
}

module.exports = ConversationRouter;
