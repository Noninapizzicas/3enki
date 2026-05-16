/**
 * agent-observer v2.0.0 — POC2 canonico.
 *
 * Observer del subsistema agentes. Escucha los 4 eventos canonicos de
 * agent-flow (request/progress/response/failed) y los traduce a
 * chat.assistant.saved con metadata.block.type='agent_intervention' para
 * renderizar la tarjeta colapsable del agente inline en el chat.
 *
 * Politica fail-silent: si el evento no lleva conversation_id, NO emite nada.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');

const STEP_LABELS = {
  started:    'iniciando',
  thinking:   'pensando',
  tool_call:  'llamando tool',
  tool_result:'tool completada',
  iteration:  'iterando',
  finalizing: 'terminando'
};

const DEFAULT_SUMMARY_MAX_CHARS = 280;
const DEFAULT_MIN_PROGRESS_STEP = 'thinking';

class AgentObserverModule extends BaseModule {
  constructor() {
    super();
    this.name = 'agent-observer';
    this.version = '2.0.0';
    this.config = null;
    this.openCards = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics || null;
    this.config = context.moduleConfig || context.config || {};
    this.logger.info('agent-observer.loaded', {
      enabled: this.config.enabled !== false,
      min_message_for_progress: this.config.min_message_for_progress || DEFAULT_MIN_PROGRESS_STEP,
      summary_max_chars: this.config.summary_max_chars || DEFAULT_SUMMARY_MAX_CHARS
    });
  }

  async onUnload() {
    this.openCards.clear();
    this.logger?.info?.('agent-observer.unloaded', {});
  }

  // ============================================================
  // Bus API — handlers wireados por module.json.events.subscribes
  // (_publishCard es helper protegido invocado por estos)
  // ============================================================

  // Bus subscribers definidos abajo (onAgentExecute*). Los helpers de
  // dominio (_publishCard, _truncate, _stepLabel) y los overrides de
  // BaseModule estan en las secciones Dominio (protegido) y abajo.

  // ============================================================
  // HTTP / UI API — sin endpoints (modulo observer puro del bus)
  // ============================================================

  // ============================================================
  // Dominio (protegido) — overrides de helpers heredados con identidad
  // propia + utilidades del observer.
  // ============================================================

  /**
   * Override de BaseModule: firma local `{status, code}` (objeto) en vez
   * de string canonica. No llama super: la firma de retorno es distinta.
   * Reconoce ENOENT (errno) ademas de keywords genericos.
   */
  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/required|invalid|missing/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'UPSTREAM_TIMEOUT' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'subscribe') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('agent-observer.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      crypto.randomUUID();
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  // ============================================================
  // Bus subscribers (handlers de los 4 eventos de agent-flow)
  // ============================================================

  async onAgentExecuteRequest(event) {
    try {
      if (this.config.enabled === false) return;
      const data = event?.data || event;
      if (!data?.conversation_id) return;
      if (!data.request_id || !data.agent_name) return;

      this.openCards.set(data.request_id, {
        conversation_id: data.conversation_id,
        project_id: data.project_id ?? null,
        correlation_id: data.correlation_id,
        agent_name: data.agent_name,
        started_at: new Date().toISOString(),
        task: data.task || null
      });

      this.metrics?.increment?.('agent-observer.card.opened');
      await this._publishCard({
        data,
        status: 'open',
        assistant_message: `🤖 ${data.agent_name} iniciando${data.task ? `: ${this._truncate(data.task, 120)}` : ''}`
      });
    } catch (err) {
      this._handleHandlerError('agent-observer.request.error', err);
    }
  }

  async onAgentExecuteProgress(event) {
    try {
      if (this.config.enabled === false) return;
      const data = event?.data || event;
      if (!data?.conversation_id) return;
      const card = this.openCards.get(data.request_id);
      if (!card) return;

      const minStep = this.config.min_message_for_progress || DEFAULT_MIN_PROGRESS_STEP;
      if (data.step === 'started' && minStep !== 'started') return;
      if (data.step === 'finalizing' && (minStep === 'thinking' || minStep === 'tool_call')) return;

      const message = data.message
        || (data.tool_invoked ? `Llamando a ${data.tool_invoked}` : `${this._stepLabel(data.step)}…`);

      this.metrics?.increment?.('agent-observer.card.progress');
      await this._publishCard({
        data,
        status: 'open',
        assistant_message: `🤖 ${data.agent_name}: ${message}`,
        step: data.step,
        tool_invoked: data.tool_invoked
      });
    } catch (err) {
      this._handleHandlerError('agent-observer.progress.error', err);
    }
  }

  async onAgentExecuteResponse(event) {
    try {
      if (this.config.enabled === false) return;
      const data = event?.data || event;
      if (!data?.conversation_id) return;
      const card = this.openCards.get(data.request_id);
      if (!card) return;
      this.openCards.delete(data.request_id);

      const summaryMax = this.config.summary_max_chars || DEFAULT_SUMMARY_MAX_CHARS;
      const content = data.result?.content || '';
      const summary = this._truncate(content, summaryMax);

      this.metrics?.increment?.('agent-observer.card.closed', { status: 'closed' });
      await this._publishCard({
        data,
        status: 'closed',
        assistant_message: summary || `🤖 ${data.agent_name}: completado`,
        duration_ms: data.duration_ms,
        tool_calls_executed: data.tool_calls_executed,
        // Persistir TODA la info del agent.execute.response canonica
        // (agent-flow.contract): provider, model, tokens, cost, iterations,
        // finish_reason. Sin esto se pierde la traza del flow del agente.
        provider: data.provider,
        model: data.model,
        tokens: data.tokens,
        cost: data.cost,
        iterations: data.iterations,
        finish_reason: data.finish_reason,
        detail_voluminoso: content.length > summaryMax
      });
    } catch (err) {
      this._handleHandlerError('agent-observer.response.error', err);
    }
  }

  async onAgentExecuteFailed(event) {
    try {
      if (this.config.enabled === false) return;
      const data = event?.data || event;
      if (!data?.conversation_id) return;
      const card = this.openCards.get(data.request_id);
      if (!card) return;
      this.openCards.delete(data.request_id);

      const code = data.error?.code || 'UNKNOWN_ERROR';
      const msg = data.error?.message || 'Falló sin mensaje';

      this.metrics?.increment?.('agent-observer.card.closed', { status: 'failed' });
      await this._publishCard({
        data,
        status: 'failed',
        assistant_message: `⚠️ ${data.agent_name} falló (${code}): ${this._truncate(msg, 180)}`,
        error: { code, message: msg },
        duration_ms: data.duration_ms,
        provider_attempted: data.provider_attempted
      });
    } catch (err) {
      this._handleHandlerError('agent-observer.failed.error', err);
    }
  }

  // ============================================================
  // Privados — construccion de payloads del observer y utilidades de
  // formateo de texto. Sin side effects observables fuera del modulo.
  // ============================================================

  async _publishCard({ data, status, assistant_message, step, tool_invoked, duration_ms, tool_calls_executed, detail_voluminoso, error, provider_attempted, provider, model, tokens, cost, iterations, finish_reason }) {
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
    // Campos canonicos del agent.execute.response (agent-flow.contract).
    // Conservar para auditabilidad y debugging post-hoc.
    if (provider) block.provider = provider;
    if (model) block.model = model;
    if (tokens) block.tokens = tokens;
    if (cost) block.cost = cost;
    if (typeof iterations === 'number') block.iterations = iterations;
    if (finish_reason) block.finish_reason = finish_reason;

    const metadata = JSON.stringify({
      author: { kind: 'agent', id: data.agent_name, name: data.agent_name },
      block
    });

    const payload = {
      conversation_id: data.conversation_id,
      message_id: crypto.randomUUID(),
      assistant_message,
      metadata
    };

    try {
      await this._publicarEvento('chat.assistant.saved', payload, data);
    } catch (err) {
      this.logger.warn('agent-observer.publish.failed', {
        request_id: data.request_id,
        error_message: err.message
      });
      this.metrics?.increment?.('agent-observer.errors', { code: 'UNKNOWN_ERROR', kind: 'publish' });
    }
  }

  _truncate(s, max) {
    if (typeof s !== 'string') return '';
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }

  _stepLabel(step) {
    return STEP_LABELS[step] || step;
  }
}

module.exports = AgentObserverModule;
