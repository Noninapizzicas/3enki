/**
 * ai-agent-framework
 *
 * Al arrancar:
 *   - escanea agents/*.json y prompts/*.json (o *.md como fallback) → cache en memoria
 *   - registra la tool `invoke_agent` en moduleLoader.toolsRegistry con la lista
 *     de agentes habilitados (descripción + scope)
 *
 * Cuando el LLM principal llama invoke_agent (ai-gateway publica el evento):
 *   - localiza el agente
 *   - construye el system prompt del agente: base + prompt del agente + context + task
 *   - publica llm.complete.request a ai-gateway
 *   - cuando llega llm.complete.response, publica invoke_agent.response
 *
 * Sin agentic loop propio, sin lifecycle complejo, sin SQLite. El propio ai-gateway
 * dentro de llm.complete.request hace tools y todo lo demás.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AiAgentFrameworkModule {
  constructor() {
    this.name = 'ai-agent-framework';
    this.version = '1.0.0';
    this.logger = null;
    this.eventBus = null;
    this.moduleLoader = null;

    this.agents = new Map();          // name → { name, description, scope, tools, model, temperature, max_tokens, prompt_text, ... }
    this.basePromptText = null;
    this.pendingLlm = new Map();      // request_id (interno) → { invoke_request_id, agent_name, timeout }
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.moduleLoader = context.moduleLoader || null;

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
    for (const { timeout } of this.pendingLlm.values()) clearTimeout(timeout);
    this.pendingLlm.clear();
  }

  // ============================================================
  // Carga de base prompt + agentes
  // ============================================================

  _loadBasePrompt() {
    try {
      const p = path.join(__dirname, '../../_shared/base.prompt.json');
      this.basePromptText = JSON.stringify(JSON.parse(fs.readFileSync(p, 'utf8')), null, 2);
    } catch { /* opcional */ }
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

        // Cargar prompt del agente (json prioritario, md fallback)
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
          // Fallback: buscar prompts/{name}.json o {name}.md
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
          temperature: def.temperature ?? 0.7,
          max_tokens: def.max_tokens || 2000,
          timeout_ms: def.timeout_ms || 120000,
          prompt_text: promptText
        });
      } catch (err) {
        this.logger.warn('ai-agent-framework.agent.load.failed', { file, error: err.message });
      }
    }
  }

  // ============================================================
  // Registrar invoke_agent en moduleLoader.toolsRegistry
  // ============================================================

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
          context:    { type: 'object', description: 'Datos específicos que el agente necesita (receta_id, etc.)' }
        },
        required: ['agent_name', 'task']
      },
      module: 'ai-agent-framework',
      event_based: true,
      // Metadatos por si ai-gateway quiere filtrar por scope:
      _agents: enabledAgents.map(a => ({ name: a.name, scope: a.scope, description: a.description }))
    };

    this.moduleLoader.toolsRegistry.set('invoke_agent', tool);
    this.logger.info('ai-agent-framework.invoke_agent.registered', { agents: enabledAgents.length });
  }

  // ============================================================
  // Handler: invoke_agent (publicado por ai-gateway durante agentic loop del LLM)
  // Mantiene shape legacy — invoke_agent.response es el contrato propio del
  // ai-gateway tool flow, NO un evento agent_flow. Si en el futuro se canoniza,
  // sera migracion separada.
  // ============================================================

  async onInvokeAgent(event) {
    return this._runAgentLegacy(event);
  }

  // ============================================================
  // Handler: agent.execute.request (CANONICO agent-flow v1.0.0)
  //
  // Solo shape canonico segun arquitectura/decisiones/_schemas/agent-flow/
  // agent.execute.request.schema.json. El alias legacy 'agentName' fue
  // retirado tras migracion completa de pizzepos consumers.
  //
  // En SUCCESS: publica agent.execute.response canonico (result aplanado;
  // result.agent y result.tool_calls_executed se mantienen DUPLICADAMENTE
  // dentro de result para compat transitoria con consumers legacy — pizzepos
  // modules — hasta que se migren).
  //
  // En ERROR: publica agent.execute.failed canonico (NO inyecta error en
  // agent.execute.response). Cumple no_silent_failures.
  // ============================================================

  async onAgentExecuteRequest(event) {
    const data = event.data || event;

    const correlation_id  = data.correlation_id || crypto.randomUUID();
    const request_id      = data.request_id;
    const agent_name      = data.agent_name;
    const user_id         = data.user_id || 'default';
    const project_id      = data.project_id ?? null;
    const conversation_id = data.conversation_id ?? data.context?.conversation_id ?? null;
    const channel         = data.channel;
    const channel_context = data.channel_context;
    const task            = data.task;
    const context         = data.context || {};
    const settings        = data.settings || {};
    const session_id      = data.session_id ?? null;
    const prev_state      = data.prev_state ?? null;

    const startedAt = Date.now();
    const baseEnvelope = {
      correlation_id, request_id, user_id, agent_name,
      conversation_id, project_id, channel, channel_context, startedAt
    };

    if (!request_id) {
      this.logger.warn('ai-agent-framework.onAgentExecuteRequest.invalid_payload', {
        reason: 'request_id obligatorio'
      });
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

    // Validar al menos task O context (anyOf del schema)
    if (!task && (!context || Object.keys(context).length === 0)) {
      return this._publishAgentExecuteFailed({
        ...baseEnvelope,
        error: { code: 'AGENT_INPUT_INVALID', message: 'Debe proporcionar task o context' },
        iterations_completed: 0,
        provider_attempted: null
      });
    }

    return this._dispatchToLlm({
      ...baseEnvelope,
      shape: 'canonical',
      agent, task, context, session_id, prev_state, settings
    });
  }

  // ============================================================
  // Internals: dispatch comun al ai-gateway
  // ============================================================

  async _dispatchToLlm(ctx) {
    const { agent, task, context, session_id, prev_state, settings } = ctx;

    // System prompt
    const sections = [];
    if (this.basePromptText) sections.push(this.basePromptText);
    if (agent.prompt_text) sections.push(agent.prompt_text);
    const ctxToInject = { task, context };
    if (prev_state) ctxToInject.prev_state = prev_state;
    if (session_id) ctxToInject.session_id = session_id;
    sections.push('CONTEXTO ENTREGADO:\n' + JSON.stringify(ctxToInject, null, 2));
    const system = sections.join('\n\n---\n\n');

    // Tools del agente
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

    // Progress canonico (agent-flow.contract.chat_inline_rendering): step='started'.
    // Solo para shape canonico (no para legacy invoke_agent flow).
    if (ctx.shape === 'canonical') {
      this._publishProgress({
        ...ctx,
        original_request_id: ctx.request_id,
        step: 'started',
        message: `Agente ${ctx.agent_name} iniciando`
      });
    }

    await this.eventBus.publish('llm.complete.request', {
      request_id: llm_request_id,
      system,
      messages: [{ role: 'user', content: task || '' }],
      tools: toolsForAgent,
      settings: {
        temperature: settings?.temperature ?? agent.temperature,
        max_tokens:  settings?.max_tokens  ?? agent.max_tokens,
        ...(settings?.model || agent.model ? { model: settings?.model || agent.model } : {})
      },
      attachments: [],
      project_id: ctx.project_id ?? context?.project_id ?? null,
      conversation_id: ctx.conversation_id,
      page_id: null,
      provider: settings?.provider || agent.provider
    });
  }

  // ============================================================
  // Legacy invoke_agent path (NO migrado — shape propio del LLM tool flow)
  // ============================================================

  async _runAgentLegacy(event) {
    const data = event.data || event;
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

  // ============================================================
  // Handler: llm.complete.response
  // Despacha al shape canonico (agent.execute.response/failed) o al legacy
  // (invoke_agent.response) segun pending.shape.
  // ============================================================

  async onLlmCompleteResponse(event) {
    const data = event.data || event;
    const { request_id, success, error, content, tool_calls_executed, model, provider, usage } = data;

    const pending = this.pendingLlm.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingLlm.delete(request_id);

    if (pending.shape === 'canonical') {
      const duration_ms = Date.now() - pending.startedAt;
      // Progress canonico: step='finalizing' antes de publicar response/failed.
      this._publishProgress({
        ...pending,
        step: 'finalizing',
        message: success ? `Agente ${pending.agent_name} terminando` : `Agente ${pending.agent_name} fallando`
      });
      if (!success) {
        return this._publishAgentExecuteFailed({
          ...pending,
          error: this._classifyLlmError(error || 'agent execution failed'),
          duration_ms,
          iterations_completed: 0,
          provider_attempted: provider || null
        });
      }
      return this._publishAgentExecuteResponse({
        ...pending,
        content,
        tool_calls_executed: tool_calls_executed || [],
        model, provider, usage,
        duration_ms
      });
    }

    // Legacy invoke_agent.response (shape propio)
    if (!success) {
      const errObj = (typeof error === 'object' && error !== null)
        ? error
        : this._classifyLlmError(error || 'agent execution failed');
      return this.eventBus.publish('invoke_agent.response', {
        request_id: pending.original_request_id,
        session_id: pending.session_id,
        next_state: null, should_continue: false,
        error: errObj
      });
    }
    return this.eventBus.publish('invoke_agent.response', {
      request_id: pending.original_request_id,
      session_id: pending.session_id,
      next_state: null, should_continue: false,
      result: { agent: pending.agent_name, content, tool_calls_executed: tool_calls_executed || [] }
    });
  }

  // ============================================================
  // Publishers canonicos agent-flow
  // ============================================================

  async _publishAgentExecuteResponse(ctx) {
    const tool_calls = ctx.tool_calls_executed || [];
    const payload = {
      correlation_id: ctx.correlation_id,
      request_id:     ctx.original_request_id,
      user_id:        ctx.user_id,
      agent_name:     ctx.agent_name,
      result: {
        content: ctx.content || '',
        // COMPAT TRANSITORIA: legacy consumers (pizzepos modules) leen
        // result.agent y result.tool_calls_executed. Se elimina cuando los
        // consumers migren al shape canonico (root-level agent_name + root
        // tool_calls_executed).
        agent: ctx.agent_name,
        tool_calls_executed: tool_calls
      },
      duration_ms: ctx.duration_ms,
      timestamp:   new Date().toISOString(),
      tool_calls_executed: tool_calls,
      next_state:  null,
      should_continue: false
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (ctx.project_id !== null && ctx.project_id !== undefined) payload.project_id = ctx.project_id;
    if (ctx.channel)         payload.channel = ctx.channel;
    if (ctx.channel_context) payload.channel_context = ctx.channel_context;
    if (ctx.model)           payload.model = ctx.model;
    if (ctx.provider)        payload.provider = ctx.provider;
    if (ctx.usage) payload.tokens = {
      input:  ctx.usage.input_tokens  || 0,
      output: ctx.usage.output_tokens || 0,
      total:  ctx.usage.total_tokens  || ((ctx.usage.input_tokens || 0) + (ctx.usage.output_tokens || 0))
    };

    // Inyectar como mensaje en la conversacion si aplica (chat multi-participante).
    // Usa shape CANONICO de chat-flow (no el legacy con role/content).
    if (ctx.conversation_id) {
      try {
        await this.eventBus.publish('chat.assistant.saved', {
          correlation_id: ctx.correlation_id,
          project_id:     ctx.project_id ?? null,
          conversation_id: ctx.conversation_id,
          message_id:     crypto.randomUUID(),
          assistant_message: ctx.content || '',
          metadata: JSON.stringify({
            author: { kind: 'agent', id: ctx.agent_name, name: ctx.agent_name },
            block:  { type: 'agent_intervention', title: ctx.agent_name, status: 'closed' },
            tool_calls: tool_calls
          })
        });
      } catch (err) {
        this.logger?.warn?.('ai-agent-framework.chat.assistant.saved.publish.failed', {
          error: err.message, agent: ctx.agent_name
        });
      }
    }

    return this.eventBus.publish('agent.execute.response', payload);
  }

  async _publishAgentExecuteFailed(ctx) {
    this.logger.error('ai-agent-framework.agent.failed', {
      correlation_id: ctx.correlation_id,
      request_id:     ctx.original_request_id || ctx.request_id,
      agent_name:     ctx.agent_name,
      code:           ctx.error.code,
      message:        ctx.error.message
    });
    const payload = {
      correlation_id: ctx.correlation_id,
      request_id:     ctx.original_request_id || ctx.request_id,
      user_id:        ctx.user_id || 'default',
      agent_name:     ctx.agent_name || 'unknown',
      error:          ctx.error,
      timestamp:      new Date().toISOString()
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (ctx.project_id !== null && ctx.project_id !== undefined) payload.project_id = ctx.project_id;
    if (ctx.channel)         payload.channel = ctx.channel;
    if (ctx.channel_context) payload.channel_context = ctx.channel_context;
    if (typeof ctx.duration_ms === 'number') payload.duration_ms = ctx.duration_ms;
    else if (ctx.startedAt)  payload.duration_ms = Date.now() - ctx.startedAt;
    if (typeof ctx.iterations_completed === 'number') payload.iterations_completed = ctx.iterations_completed;
    if ('provider_attempted' in ctx) payload.provider_attempted = ctx.provider_attempted;

    return this.eventBus.publish('agent.execute.failed', payload);
  }

  // ============================================================
  // Publisher de agent.execute.progress (feedback intermedio canonico)
  // ============================================================

  _publishProgress(ctx) {
    if (!ctx.agent_name || !ctx.original_request_id) return;
    const payload = {
      correlation_id: ctx.correlation_id || crypto.randomUUID(),
      request_id:     ctx.original_request_id,
      user_id:        ctx.user_id || 'default',
      agent_name:     ctx.agent_name,
      step:           ctx.step,
      timestamp:      new Date().toISOString()
    };
    if (ctx.conversation_id) payload.conversation_id = ctx.conversation_id;
    if (ctx.project_id !== null && ctx.project_id !== undefined) payload.project_id = ctx.project_id;
    if (typeof ctx.iteration === 'number') payload.iteration = ctx.iteration;
    if (ctx.tool_invoked) payload.tool_invoked = ctx.tool_invoked;
    if (ctx.message) payload.message = ctx.message;
    if (ctx.metadata) payload.metadata = ctx.metadata;
    this.eventBus.publish('agent.execute.progress', payload).catch(err => {
      this.logger?.debug?.('ai-agent-framework.progress.publish.failed', { error: err.message });
    });
  }

  // ============================================================
  // Clasificacion canonica de errores LLM (heredada de ai-gateway)
  // ============================================================

  _classifyLlmError(rawMessage) {
    const raw = (rawMessage && typeof rawMessage === 'string') ? rawMessage : 'unknown error';
    const lower = raw.toLowerCase();

    let code = 'INTERNAL_ERROR';
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
