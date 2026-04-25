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
  // Handler: invoke_agent (publicado por ai-gateway durante agentic loop)
  // ============================================================

  async onInvokeAgent(event) {
    const data = event.data || event;
    const { request_id, agent_name, task, context = {} } = data;

    const agent = this.agents.get(agent_name);
    if (!agent) {
      return this.eventBus.publish('invoke_agent.response', {
        request_id, error: `Agente '${agent_name}' no encontrado`
      });
    }

    // Construir el system prompt del agente
    const sections = [];
    if (this.basePromptText) sections.push(this.basePromptText);
    if (agent.prompt_text) sections.push(agent.prompt_text);
    sections.push('CONTEXTO ENTREGADO:\n' + JSON.stringify({ task, context }, null, 2));
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
      this.eventBus.publish('invoke_agent.response', {
        request_id, error: `Timeout esperando agente ${agent_name} (${agent.timeout_ms}ms)`
      });
    }, agent.timeout_ms);

    this.pendingLlm.set(llm_request_id, {
      invoke_request_id: request_id,
      agent_name,
      timeout
    });

    await this.eventBus.publish('llm.complete.request', {
      request_id: llm_request_id,
      system,
      messages: [{ role: 'user', content: task }],
      tools: toolsForAgent,
      settings: { temperature: agent.temperature, max_tokens: agent.max_tokens },
      attachments: [],
      project_id: context.project_id || null,
      conversation_id: context.conversation_id || null,
      page_id: null,
      provider: agent.provider
    });
  }

  // ============================================================
  // Handler: llm.complete.response
  // ============================================================

  async onLlmCompleteResponse(event) {
    const data = event.data || event;
    const { request_id, success, error, content, tool_calls_executed } = data;

    const pending = this.pendingLlm.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingLlm.delete(request_id);

    if (!success) {
      return this.eventBus.publish('invoke_agent.response', {
        request_id: pending.invoke_request_id,
        error: error || 'agent execution failed'
      });
    }

    return this.eventBus.publish('invoke_agent.response', {
      request_id: pending.invoke_request_id,
      result: {
        agent: pending.agent_name,
        content,
        tool_calls_executed: tool_calls_executed || []
      }
    });
  }
}

module.exports = AiAgentFrameworkModule;
