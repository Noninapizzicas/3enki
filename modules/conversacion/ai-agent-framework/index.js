/**
 * ai-agent-framework v2.0.0 — POC2 canonico.
 *
 * Carga agentes desde agents/*.json + prompts/*.json (o *.md). Registra la
 * tool `invoke_agent` (LLM tool flow legacy) en moduleLoader.toolsRegistry y
 * escucha `agent.execute.request` (entry point canonico agent-flow v1.0.0+)
 * desde modulos del dominio / cron / channels.
 *
 * Publishes canonicos agent-flow:
 *   - agent.execute.response (success)
 *   - agent.execute.failed   (no_silent_failures)
 *   - agent.execute.progress (feedback intermedio chat_inline_rendering)
 *
 * Cuando se incluye conversation_id tambien publica chat.assistant.saved con
 * metadata.author del agente para chat multi-participante.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CONVERSATION_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_AGENT_TIMEOUT_MS = 120000;
const DEFAULT_AGENT_TEMPERATURE = 0.7;
const DEFAULT_AGENT_MAX_TOKENS = 2000;
const DEFAULT_RESOLVE_TIMEOUT_MS = 5000;

class AiAgentFrameworkModule {
  constructor() {
    this.name = 'ai-agent-framework';
    this.version = '2.0.0';
    this.logger = null;
    this.eventBus = null;
    this.metrics = null;
    this.moduleLoader = null;
    this.mqttRequest = null;
    this.config = null;

    this.agents = new Map();
    this.basePromptText = null;
    this.pendingLlm = new Map();
    this._conversationCache = new Map();
    this._conversationCacheTTL = DEFAULT_CONVERSATION_CACHE_TTL_MS;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics || null;
    this.moduleLoader = context.moduleLoader || null;
    this.mqttRequest = context.mqttRequest || null;
    this.config = context.moduleConfig || context.config || {};
    this._conversationCacheTTL = this.config.conversation_cache_ttl_ms || DEFAULT_CONVERSATION_CACHE_TTL_MS;

    this._loadBasePrompt();
    this._loadAgents();

    if (this.moduleLoader?.toolsRegistry) {
      this._registerInvokeAgentTool();
    }

    this.logger.info('ai-agent-framework.loaded', {
      agents: this.agents.size,
      base: !!this.basePromptText
    });
  }

  async onUnload() {
    for (const pending of this.pendingLlm.values()) {
      clearTimeout(pending.timeout);
    }
    this.pendingLlm.clear();
    this._conversationCache.clear();
    this.agents.clear();
    this.basePromptText = null;
    this.logger?.info?.('ai-agent-framework.unloaded', {});
  }

  // ============================================================
  // Helpers POC2
  // ============================================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'TIMEOUT' };
    if (/required|invalid|missing/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'subscribe') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('ai-agent-framework.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
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
  // Carga de base prompt + agentes
  // ============================================================

  _loadBasePrompt() {
    try {
      const p = path.join(__dirname, '../../_shared/base.prompt.json');
      this.basePromptText = JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8')), null, 2);
    } catch {
      this.basePromptText = null;
    }
  }

  _loadAgents() {
    const agentsDir = path.join(__dirname, 'agents');
    const promptsDir = path.join(__dirname, 'prompts');

    let files;
    try { files = fs.readdirSync(agentsDir); } catch { return; }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const def = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
        if (def.enabled === false) continue;
        if (!def.name) continue;

        let promptText = null;
        const promptFile = def.prompt_file
          ? path.join(__dirname, def.prompt_file)
          : null;

        if (promptFile && fs.existsSync(promptFile)) {
          const raw = fs.readFileSync(promptFile, 'utf8');
          promptText = promptFile.endsWith('.json')
            ? JSON.stringify(JSON.parse(raw), null, 2)
            : raw;
        } else {
          for (const ext of ['.json', '.md']) {
            const tryPath = path.join(promptsDir, def.name + ext);
            if (fs.existsSync(tryPath)) {
              const raw = fs.readFileSync(tryPath, 'utf8');
              promptText = ext === '.json' ? JSON.stringify(JSON.parse(raw), null, 2) : raw;
              break;
            }
          }
        }

        this.agents.set(def.name, {
          name: def.name,
          description: def.description || '',
          scope: Array.isArray(def.scope) ? def.scope : (def.scope ? [def.scope] : ['*']),
          tools: Array.isArray(def.tools) ? def.tools : [],
          provider: def.provider || 'auto',
          model: def.model || null,
          temperature: def.temperature ?? DEFAULT_AGENT_TEMPERATURE,
          max_tokens: def.max_tokens || DEFAULT_AGENT_MAX_TOKENS,
          timeout_ms: def.timeout_ms || DEFAULT_AGENT_TIMEOUT_MS,
          prompt_text: promptText
        });
      } catch (err) {
        this.logger.warn('ai-agent-framework.agent.load.failed', {
          file, error_message: err.message
        });
        this.metrics?.increment?.('ai-agent-framework.errors', { code: 'AGENT_LOAD_FAILED', kind: 'load' });
      }
    }
  }

  _registerInvokeAgentTool() {
    const enabledAgents = Array.from(this.agents.values());
    const lines = enabledAgents.map(a => `  - ${a.name}: ${a.description}`).join('\n');

    const tool = {
      name: 'invoke_agent',
      description: `Invoca un agente especialista para una tarea concreta. Cada agente sabe su dominio.\n\nAgentes disponibles:\n${lines}\n\nDevuelve cuando el agente termina con el resultado.`,
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: 'Nombre exacto del agente', enum: enabledAgents.map(a => a.name) },
          task:       { type: 'string', description: 'Tarea concreta en lenguaje natural' },
          context:    { type: 'object', description: 'Datos especificos que el agente necesita (receta_id, etc.)' }
        },
        required: ['agent_name', 'task']
      },
      module: 'ai-agent-framework',
      event_based: true,
      _agents: enabledAgents.map(a => ({ name: a.name, scope: a.scope, description: a.description }))
    };

    this.moduleLoader.toolsRegistry.set('invoke_agent', tool);
    this.logger.info('ai-agent-framework.invoke_agent.registered', { agents: enabledAgents.length });
  }

  // ============================================================
  // Bus subscribers
  // ============================================================

  async onInvokeAgent(event) {
    try {
      return await this._runAgentLegacy(event);
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.invoke_agent.error', err);
    }
  }

  async onAgentExecuteRequest(event) {
    try {
      const data = event?.data || event;

      const correlation_id = data.correlation_id || crypto.randomUUID();
      const request_id = data.request_id;
      const agent_name = data.agent_name;
      const user_id = data.user_id || 'default';
      const project_id = data.project_id ?? null;
      const conversation_id = data.conversation_id ?? data.context?.conversation_id ?? null;
      const channel = data.channel;
      const channel_context = data.channel_context;
      const task = data.task;
      const context = data.context || {};
      const settings = data.settings || {};
      const session_id = data.session_id ?? null;
      const prev_state = data.prev_state ?? null;

      const startedAt = Date.now();
      const baseEnvelope = {
        correlation_id, request_id, user_id, agent_name,
        conversation_id, project_id, channel, channel_context, startedAt
      };

      if (!request_id) {
        this.logger.warn('ai-agent-framework.agent_execute.invalid_payload', {
          reason: 'request_id obligatorio'
        });
        this.metrics?.increment?.('ai-agent-framework.errors', { code: 'INVALID_INPUT', kind: 'agent_execute' });
        return;
      }
      if (!agent_name) {
        return this._publishAgentExecuteFailed({
          ...baseEnvelope,
          error: { code: 'AGENT_INPUT_INVALID', message: 'agent_name obligatorio' },
          iterations_completed: 0,
          provider_attempted: null
        });
      }

      const agent = this.agents.get(agent_name);
      if (!agent) {
        return this._publishAgentExecuteFailed({
          ...baseEnvelope,
          error: { code: 'AGENT_NOT_FOUND', message: `Agente '${agent_name}' no encontrado` },
          iterations_completed: 0,
          provider_attempted: null
        });
      }

      if (!task && (!context || Object.keys(context).length === 0)) {
        return this._publishAgentExecuteFailed({
          ...baseEnvelope,
          error: { code: 'AGENT_INPUT_INVALID', message: 'Debe proporcionar task o context' },
          iterations_completed: 0,
          provider_attempted: null
        });
      }

      let resolved_conversation_id = conversation_id;
      if (!resolved_conversation_id && project_id) {
        resolved_conversation_id = await this._resolveDefaultConversationId(project_id);
      }

      this.metrics?.increment?.('ai-agent-framework.agent.executed', { agent_name });
      return this._dispatchToLlm({
        ...baseEnvelope,
        conversation_id: resolved_conversation_id,
        shape: 'canonical',
        agent, task, context, session_id, prev_state, settings
      });
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.agent_execute.error', err);
    }
  }

  async _resolveDefaultConversationId(project_id) {
    if (!project_id) return null;
    const cached = this._conversationCache.get(project_id);
    if (cached && (Date.now() - cached.at) < this._conversationCacheTTL) {
      return cached.conversation_id;
    }
    if (!this.mqttRequest) {
      this.logger?.warn?.('ai-agent-framework.resolve_conversation.no_mqtt_request', {
        project_id, reason: 'mqttRequest no disponible'
      });
      return null;
    }
    try {
      const result = await this.mqttRequest('project', 'get-default-conversation',
        { project_id }, { timeout_ms: DEFAULT_RESOLVE_TIMEOUT_MS });
      const conversation_id = result?.conversation_id || null;
      if (conversation_id) {
        this._conversationCache.set(project_id, { conversation_id, at: Date.now() });
      }
      return conversation_id;
    } catch (err) {
      this.logger?.warn?.('ai-agent-framework.resolve_conversation.failed', {
        project_id, error_message: err.message
      });
      return null;
    }
  }

  async _dispatchToLlm(ctx) {
    const { agent, task, context, session_id, prev_state, settings } = ctx;

    const sections = [];
    if (this.basePromptText) sections.push(this.basePromptText);
    if (agent.prompt_text) sections.push(agent.prompt_text);
    const ctxToInject = { task, context };
    if (prev_state) ctxToInject.prev_state = prev_state;
    if (session_id) ctxToInject.session_id = session_id;
    sections.push('CONTEXTO ENTREGADO:\n' + JSON.stringify(ctxToInject, null, 2));
    const system = sections.join('\n\n---\n\n');

    const allTools = this.moduleLoader?.getToolsForAI?.() || [];
    const toolsForAgent = agent.tools.length > 0
      ? allTools.filter(t => agent.tools.includes(t.name))
      : [];

    const llm_request_id = crypto.randomUUID();
    const timeout_ms = settings?.timeout_ms || agent.timeout_ms;

    const timeout = setTimeout(() => {
      const pending = this.pendingLlm.get(llm_request_id);
      if (!pending) return;
      this.pendingLlm.delete(llm_request_id);
      if (pending.shape === 'canonical') {
        this._publishAgentExecuteFailed({
          ...pending,
          error: { code: 'AGENT_TIMEOUT', message: `Timeout esperando agente ${pending.agent_name} (${timeout_ms}ms)` },
          iterations_completed: 0,
          provider_attempted: null
        });
      } else {
        this.eventBus.publish(pending.response_event, {
          request_id: pending.original_request_id, session_id: pending.session_id,
          error: { code: 'AGENT_TIMEOUT', message: `Timeout esperando agente ${pending.agent_name} (${timeout_ms}ms)` }
        });
      }
    }, timeout_ms);

    this.pendingLlm.set(llm_request_id, {
      ...ctx,
      original_request_id: ctx.request_id,
      session_id,
      timeout
    });

    if (ctx.shape === 'canonical') {
      this._publishProgress({
        ...ctx,
        original_request_id: ctx.request_id,
        step: 'started',
        message: `Agente ${ctx.agent_name} iniciando`
      });
    }

    await this._publicarEvento('llm.complete.request', {
      request_id: llm_request_id,
      system,
      messages: [{ role: 'user', content: task || '' }],
      tools: toolsForAgent,
      settings: {
        temperature: settings?.temperature ?? agent.temperature,
        max_tokens: settings?.max_tokens ?? agent.max_tokens,
        ...(settings?.model || agent.model ? { model: settings?.model || agent.model } : {})
      },
      attachments: [],
      project_id: ctx.project_id ?? context?.project_id ?? null,
      conversation_id: ctx.conversation_id,
      page_id: null,
      provider: settings?.provider || agent.provider
    }, { correlation_id: ctx.correlation_id, project_id: ctx.project_id });
  }

  async _runAgentLegacy(event) {
    const data = event?.data || event;
    const request_id = data.request_id;
    const agent_name = data.agent_name || data.agentName;
    const task = data.task;
    const context = data.context || {};
    const session_id = data.session_id ?? null;
    const prev_state = data.prev_state ?? null;
    const conversation_id = data.conversation_id ?? context.conversation_id ?? null;

    const agent = this.agents.get(agent_name);
    if (!agent) {
      return this.eventBus.publish('invoke_agent.response', {
        request_id, session_id,
        error: { code: 'AGENT_NOT_FOUND', message: `Agente '${agent_name}' no encontrado` }
      });
    }

    return this._dispatchToLlm({
      shape: 'legacy',
      response_event: 'invoke_agent.response',
      original_request_id: request_id,
      request_id,
      agent_name,
      agent,
      task, context,
      session_id, prev_state,
      conversation_id,
      project_id: context.project_id || null,
      settings: {}
    });
  }

  async onLlmCompleteResponse(event) {
    try {
      const data = event?.data || event;
      const { request_id, content, tool_calls_executed, model, provider, usage } = data;
      // Por contrato llm-flow: llm.complete.response cierra exito (sin flag success).
      // Los fallos vienen por evento separado llm.complete.failed, handler distinto.

      const pending = this.pendingLlm.get(request_id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pendingLlm.delete(request_id);

      if (pending.shape === 'canonical') {
        const duration_ms = Date.now() - pending.startedAt;
        this._publishProgress({
          ...pending,
          step: 'finalizing',
          message: `Agente ${pending.agent_name} terminando`
        });
        return this._publishAgentExecuteResponse({
          ...pending,
          content,
          tool_calls_executed: tool_calls_executed || [],
          model, provider, usage,
          duration_ms
        });
      }

      // Legacy invoke_agent.response — exito
      return this.eventBus.publish('invoke_agent.response', {
        request_id: pending.original_request_id,
        session_id: pending.session_id,
        next_state: null, should_continue: false,
        result: { agent: pending.agent_name, content, tool_calls_executed: tool_calls_executed || [] }
      });
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.llm_complete_response.error', err);
    }
  }

  async onLlmCompleteFailed(event) {
    try {
      const data = event?.data || event;
      const { request_id, error, provider, usage } = data;

      const pending = this.pendingLlm.get(request_id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pendingLlm.delete(request_id);

      if (pending.shape === 'canonical') {
        const duration_ms = Date.now() - pending.startedAt;
        this._publishProgress({
          ...pending,
          step: 'finalizing',
          message: `Agente ${pending.agent_name} fallando`
        });
        return this._publishAgentExecuteFailed({
          ...pending,
          error: this._classifyLlmError(error || 'agent execution failed'),
          duration_ms,
          iterations_completed: 0,
          provider_attempted: provider || null
        });
      }

      // Legacy invoke_agent.response — error
      const errObj = (typeof error === 'object' && error !== null)
        ? error
        : this._classifyLlmError(error || 'agent execution failed');
      return this.eventBus.publish('invoke_agent.response', {
        request_id: pending.original_request_id,
        session_id: pending.session_id,
        next_state: null, should_continue: false,
        error: errObj
      });
    } catch (err) {
      this._handleHandlerError('ai-agent-framework.llm_complete_failed.error', err);
    }
  }

  // ============================================================
  // Publishers canonicos agent-flow
  // ============================================================

  async _publishAgentExecuteResponse(ctx) {
    const tool_calls = ctx.tool_calls_executed || [];
    const payload = {
      request_id: ctx.original_request_id,
      user_id: ctx.user_id,
      agent_name: ctx.agent_name,
      result: {
        content: ctx.content || '',
        agent: ctx.agent_name,
        tool_calls_executed: tool_calls
      },
      duration_ms: ctx.duration_ms,
      tool_calls_executed: tool_calls,
      next_state: null,
      should_continue: false
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (ctx.channel) payload.channel = ctx.channel;
    if (ctx.channel_context) payload.channel_context = ctx.channel_context;
    if (ctx.model) payload.model = ctx.model;
    if (ctx.provider) payload.provider = ctx.provider;
    if (ctx.usage) payload.tokens = {
      input: ctx.usage.input_tokens || 0,
      output: ctx.usage.output_tokens || 0,
      total: ctx.usage.total_tokens || ((ctx.usage.input_tokens || 0) + (ctx.usage.output_tokens || 0))
    };

    // chat.assistant.saved se delega a agent-observer (adaptador canonico
    // agent-flow → chat-flow). agent-observer escucha agent.execute.response/
    // failed/progress y traduce a chat.assistant.saved con metadata.author +
    // metadata.block. Si ai-agent-framework lo publicara aqui tambien,
    // chat-io persistiria la tarjeta dos veces (mismo contenido, dos rows).

    return this._publicarEvento('agent.execute.response', payload, {
      correlation_id: ctx.correlation_id, project_id: ctx.project_id
    });
  }

  async _publishAgentExecuteFailed(ctx) {
    this.logger.error('ai-agent-framework.agent.failed', {
      correlation_id: ctx.correlation_id,
      request_id: ctx.original_request_id || ctx.request_id,
      agent_name: ctx.agent_name,
      code: ctx.error.code,
      message: ctx.error.message
    });
    this.metrics?.increment?.('ai-agent-framework.errors', { code: ctx.error.code, kind: 'agent' });
    const payload = {
      request_id: ctx.original_request_id || ctx.request_id,
      user_id: ctx.user_id || 'default',
      agent_name: ctx.agent_name || 'unknown',
      error: ctx.error
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (ctx.channel) payload.channel = ctx.channel;
    if (ctx.channel_context) payload.channel_context = ctx.channel_context;
    if (typeof ctx.duration_ms === 'number') payload.duration_ms = ctx.duration_ms;
    else if (ctx.startedAt) payload.duration_ms = Date.now() - ctx.startedAt;
    if (typeof ctx.iterations_completed === 'number') payload.iterations_completed = ctx.iterations_completed;
    if ('provider_attempted' in ctx) payload.provider_attempted = ctx.provider_attempted;

    return this._publicarEvento('agent.execute.failed', payload, {
      correlation_id: ctx.correlation_id, project_id: ctx.project_id
    });
  }

  _publishProgress(ctx) {
    if (!ctx.agent_name || !ctx.original_request_id) return;
    const payload = {
      request_id: ctx.original_request_id,
      user_id: ctx.user_id || 'default',
      agent_name: ctx.agent_name,
      step: ctx.step
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (typeof ctx.iteration === 'number') payload.iteration = ctx.iteration;
    if (ctx.tool_invoked) payload.tool_invoked = ctx.tool_invoked;
    if (ctx.message) payload.message = ctx.message;
    if (ctx.metadata) payload.metadata = ctx.metadata;
    this._publicarEvento('agent.execute.progress', payload, {
      correlation_id: ctx.correlation_id, project_id: ctx.project_id
    }).catch(err => {
      this.logger?.debug?.('ai-agent-framework.progress.publish.failed', { error_message: err.message });
    });
  }

  _classifyLlmError(rawMessage) {
    const raw = (rawMessage && typeof rawMessage === 'string') ? rawMessage : 'unknown error';
    const lower = raw.toLowerCase();

    let code = 'UNKNOWN_ERROR';
    if (/credential .*timeout|sin credencial|no api key|api key not|credential not found/i.test(raw)) code = 'CREDENTIAL_NOT_FOUND';
    else if (/no hay providers? disponibles?|no providers available/i.test(raw)) code = 'CREDENTIAL_NOT_FOUND';
    else if (lower.includes('timeout') || lower.includes('etimedout')) code = 'UPSTREAM_TIMEOUT';
    else if (/429|rate.?limit/.test(lower)) code = 'UPSTREAM_RATE_LIMITED';
    else if (/401|403|unauthorized|forbidden|invalid api key/.test(lower)) code = 'UPSTREAM_AUTH_FAILED';
    else if (/5\d\d|internal server error|bad gateway|service unavailable/.test(lower)) code = 'UPSTREAM_5XX';
    else if (/econnrefused|enotfound|network|unreachable|fetch failed/.test(lower)) code = 'UPSTREAM_UNREACHABLE';
    else if (/invalid response|malformed|parse|unexpected token/.test(lower)) code = 'UPSTREAM_INVALID_RESPONSE';

    return { code, message: raw, details: {} };
  }
}

module.exports = AiAgentFrameworkModule;
