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
  // ============================================================

  async onInvokeAgent(event) {
    return this._runAgent(event, 'invoke_agent.response');
  }

  // ============================================================
  // Handler: agent.execute.request (publicado por módulos del dominio)
  //
  // Mismo flujo que onInvokeAgent. Cambia el evento de respuesta y permite
  // que módulos como menu-generator, carta-digital, carta-impresion, etc.
  // disparen agentes desde su lógica event-driven (no solo desde el LLM).
  // ============================================================

  async onAgentExecuteRequest(event) {
    return this._runAgent(event, 'agent.execute.response');
  }

  // ============================================================
  // Helper común — ejecuta un agente y devuelve el resultado al evento dado
  //
  // Acepta payload:
  //   - request_id (obligatorio)
  //   - agent_name | agentName (obligatorio, soporta ambos por compat)
  //   - task (obligatorio)
  //   - context (opcional, objeto)
  //   - session_id (opcional, para sesiones persistentes futuras)
  //   - prev_state (opcional, estado de turno anterior — futuro)
  //   - conversation_id (opcional, para inyectar mensaje del agente — futuro)
  // ============================================================

  async _runAgent(event, responseEventName) {
    const data = event.data || event;
    const request_id = data.request_id;
    const agent_name = data.agent_name || data.agentName;
    const task = data.task;
    const context = data.context || {};
    // Cimentaciones para visión futura — hoy se preservan tal cual, se devuelven en la respuesta
    const session_id = data.session_id ?? null;
    const prev_state = data.prev_state ?? null;
    const conversation_id = data.conversation_id ?? context.conversation_id ?? null;

    const agent = this.agents.get(agent_name);
    if (!agent) {
      return this.eventBus.publish(responseEventName, {
        request_id, session_id,
        error: `Agente '${agent_name}' no encontrado`
      });
    }

    // Construir el system prompt del agente
    const sections = [];
    if (this.basePromptText) sections.push(this.basePromptText);
    if (agent.prompt_text) sections.push(agent.prompt_text);
    const ctxToInject = { task, context };
    if (prev_state) ctxToInject.prev_state = prev_state;
    if (session_id) ctxToInject.session_id = session_id;
    sections.push('CONTEXTO ENTREGADO:\n' + JSON.stringify(ctxToInject, null, 2));
    const system = sections.join('\n\n---\n\n');

    // Tools del agente: filtramos del moduleLoader las que el agente declara
    const allTools = this.moduleLoader?.getToolsForAI?.() || [];
    const toolsForAgent = agent.tools.length > 0
      ? allTools.filter(t => agent.tools.includes(t.name))
      : [];

    // Pedimos al ai-gateway que ejecute la completion
    const llm_request_id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      const pending = this.pendingLlm.get(llm_request_id);
      if (!pending) return;
      this.pendingLlm.delete(llm_request_id);
      this.eventBus.publish(responseEventName, {
        request_id, session_id,
        error: `Timeout esperando agente ${agent_name} (${agent.timeout_ms}ms)`
      });
    }, agent.timeout_ms);

    this.pendingLlm.set(llm_request_id, {
      original_request_id: request_id,
      response_event: responseEventName,
      agent_name,
      session_id,
      conversation_id
    });
    // Guardamos timeout aparte para no perder la referencia
    this.pendingLlm.get(llm_request_id).timeout = timeout;

    await this.eventBus.publish('llm.complete.request', {
      request_id: llm_request_id,
      system,
      messages: [{ role: 'user', content: task }],
      tools: toolsForAgent,
      settings: { temperature: agent.temperature, max_tokens: agent.max_tokens },
      attachments: [],
      project_id: context.project_id || null,
      conversation_id,
      page_id: null,
      provider: agent.provider
    });
  }

  // ============================================================
  // Handler: llm.complete.response
  //
  // Despacha la respuesta del LLM al evento original (invoke_agent.response
  // o agent.execute.response) según haya sido el origen.
  // ============================================================

  async onLlmCompleteResponse(event) {
    const data = event.data || event;
    const { request_id, success, error, content, tool_calls_executed } = data;

    const pending = this.pendingLlm.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingLlm.delete(request_id);

    const basePayload = {
      request_id: pending.original_request_id,
      session_id: pending.session_id,
      // Cimentaciones futuras — hoy fijas
      next_state: null,
      should_continue: false
    };

    if (!success) {
      return this.eventBus.publish(pending.response_event, {
        ...basePayload,
        error: error || 'agent execution failed'
      });
    }

    // Inyectar mensaje del agente en la conversación si se nos dio conversation_id
    // (Cimentación para Fase 8 — chat multi-participante. Hoy conversation_id casi siempre es null.)
    if (pending.conversation_id) {
      try {
        await this.eventBus.publish('chat.assistant.saved', {
          conversation_id: pending.conversation_id,
          role: 'agent',
          content,
          metadata: {
            author: { kind: 'agent', id: pending.agent_name, name: pending.agent_name },
            block: { type: 'agent_intervention', title: pending.agent_name, status: 'closed' },
            tool_calls: tool_calls_executed || []
          }
        });
      } catch (err) {
        this.logger?.warn?.('agent.message.publish.failed', { error: err.message, agent: pending.agent_name });
      }
    }

    return this.eventBus.publish(pending.response_event, {
      ...basePayload,
      result: {
        agent: pending.agent_name,
        content,
        tool_calls_executed: tool_calls_executed || []
      }
    });
  }
}

module.exports = AiAgentFrameworkModule;
