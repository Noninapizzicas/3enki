/**
 * agent-observer — observer canonico del subsistema agentes.
 *
 * Escucha los 4 eventos canonicos agent_flow (request, progress, response,
 * failed). Cuando hay conversation_id presente, traduce a chat.assistant.saved
 * con metadata.author={kind:'agent'} y metadata.block.type='agent_intervention'
 * para que la tarjeta colapsable del agente aparezca inline en el chat.
 *
 * Patron canonico documentado en:
 *   arquitectura/decisiones/_contratos/agent-flow.contract.json
 *     -> chat_inline_rendering
 *   arquitectura/decisiones/_contratos/frontend.contract.json
 *     -> bloques_canonicos_inline_render.tipos.agent_intervention
 *
 * Ciclo de vida de UNA tarjeta (correlacionada por request_id del agent.execute):
 *   1. agent.execute.request con conversation_id -> publica chat.assistant.saved
 *      status='open', mensaje "🤖 <agent_name> iniciando...". Guarda la tarjeta
 *      en this.openCards.
 *   2. agent.execute.progress (opcional, varios) -> publica chat.assistant.saved
 *      adicional con metadata.block.status='open' actualizando step. El frontend
 *      muta la misma tarjeta por request_id (no crea card nueva).
 *   3. agent.execute.response -> publica chat.assistant.saved status='closed',
 *      assistant_message = resumen del result. Limpia this.openCards[request_id].
 *   4. agent.execute.failed -> publica chat.assistant.saved status='failed',
 *      assistant_message = error.message legible. Limpia openCards.
 *
 * Si NO hay conversation_id en el evento (agente disparado por cron sin chat),
 * el observer NO emite nada. Politica fail-silent — la observabilidad estandar
 * (logs/metricas) ya cubre esos casos.
 */

'use strict';

const crypto = require('crypto');

class AgentObserverModule {
  constructor() {
    this.name     = 'agent-observer';
    this.version  = '1.0.0';
    this.logger   = null;
    this.eventBus = null;
    this.config   = null;
    this.openCards = new Map();
  }

  async onLoad(context) {
    this.logger   = context.logger;
    this.eventBus = context.eventBus;
    this.config   = context.moduleConfig || {};
    this.logger.info('agent-observer.loaded', { enabled: this.config.enabled !== false });
  }

  async onUnload() {
    this.openCards.clear();
  }

  // ============================================================
  // Handlers
  // ============================================================

  async onAgentExecuteRequest(event) {
    if (this.config.enabled === false) return;
    const data = event.data || event;
    if (!data.conversation_id) return;
    if (!data.request_id || !data.agent_name) return;

    this.openCards.set(data.request_id, {
      conversation_id: data.conversation_id,
      project_id:      data.project_id ?? null,
      correlation_id:  data.correlation_id,
      agent_name:      data.agent_name,
      started_at:      new Date().toISOString(),
      task:            data.task || null
    });

    await this._publishCard({
      data,
      status: 'open',
      assistant_message: `🤖 ${data.agent_name} iniciando${data.task ? `: ${this._truncate(data.task, 120)}` : ''}`
    });
  }

  async onAgentExecuteProgress(event) {
    if (this.config.enabled === false) return;
    const data = event.data || event;
    if (!data.conversation_id) return;
    const card = this.openCards.get(data.request_id);
    if (!card) return;

    const minStep = this.config.min_message_for_progress || 'thinking';
    if (data.step === 'started' && minStep !== 'started') return;
    if (data.step === 'finalizing' && (minStep === 'thinking' || minStep === 'tool_call')) return;

    const message = data.message
      || (data.tool_invoked ? `Llamando a ${data.tool_invoked}` : `${this._stepLabel(data.step)}…`);

    await this._publishCard({
      data,
      status: 'open',
      assistant_message: `🤖 ${data.agent_name}: ${message}`,
      step: data.step,
      tool_invoked: data.tool_invoked
    });
  }

  async onAgentExecuteResponse(event) {
    if (this.config.enabled === false) return;
    const data = event.data || event;
    if (!data.conversation_id) return;
    const card = this.openCards.get(data.request_id);
    if (!card) return;
    this.openCards.delete(data.request_id);

    const content = data.result?.content || '';
    const summary = this._truncate(content, this.config.summary_max_chars || 280);

    await this._publishCard({
      data,
      status: 'closed',
      assistant_message: summary || `🤖 ${data.agent_name}: completado`,
      duration_ms: data.duration_ms,
      tool_calls_executed: data.tool_calls_executed,
      detail_voluminoso: content.length > (this.config.summary_max_chars || 280)
    });
  }

  async onAgentExecuteFailed(event) {
    if (this.config.enabled === false) return;
    const data = event.data || event;
    if (!data.conversation_id) return;
    const card = this.openCards.get(data.request_id);
    if (!card) return;
    this.openCards.delete(data.request_id);

    const code = data.error?.code || 'INTERNAL_ERROR';
    const msg  = data.error?.message || 'Falló sin mensaje';

    await this._publishCard({
      data,
      status: 'failed',
      assistant_message: `⚠️ ${data.agent_name} falló (${code}): ${this._truncate(msg, 180)}`,
      error: { code, message: msg },
      duration_ms: data.duration_ms,
      provider_attempted: data.provider_attempted
    });
  }

  // ============================================================
  // Internals
  // ============================================================

  async _publishCard({ data, status, assistant_message, step, tool_invoked, duration_ms, tool_calls_executed, detail_voluminoso, error, provider_attempted }) {
    const block = {
      type: 'agent_intervention',
      title: data.agent_name,
      status,
      request_id: data.request_id,
      agent_name: data.agent_name
    };
    const card = this.openCards.get(data.request_id);
    if (card?.started_at) block.started_at = card.started_at;
    if (status !== 'open') block.ended_at = new Date().toISOString();
    if (typeof duration_ms === 'number') block.duration_ms = duration_ms;
    if (Array.isArray(tool_calls_executed) && tool_calls_executed.length > 0) {
      block.tool_calls_executed = tool_calls_executed;
    }
    if (step) block.step = step;
    if (tool_invoked) block.tool_invoked = tool_invoked;
    if (detail_voluminoso) block.detail_url = `/agent/intervention/${data.request_id}/detail`;
    if (error) block.error = error;
    if (provider_attempted) block.provider_attempted = provider_attempted;

    const metadata = JSON.stringify({
      author: { kind: 'agent', id: data.agent_name, name: data.agent_name },
      block
    });

    const payload = {
      correlation_id:  data.correlation_id || crypto.randomUUID(),
      conversation_id: data.conversation_id,
      message_id:      crypto.randomUUID(),
      assistant_message,
      metadata
    };
    if (data.project_id !== null && data.project_id !== undefined) payload.project_id = data.project_id;

    try {
      await this.eventBus.publish('chat.assistant.saved', payload);
    } catch (err) {
      this.logger.warn('agent-observer.publish.failed', {
        request_id: data.request_id,
        error: err.message
      });
    }
  }

  _truncate(s, max) {
    if (typeof s !== 'string') return '';
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }

  _stepLabel(step) {
    const labels = {
      started:    'iniciando',
      thinking:   'pensando',
      tool_call:  'llamando tool',
      tool_result:'tool completada',
      iteration:  'iterando',
      finalizing: 'terminando'
    };
    return labels[step] || step;
  }
}

module.exports = AgentObserverModule;
