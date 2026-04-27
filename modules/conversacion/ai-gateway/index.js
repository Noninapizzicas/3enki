/**
 * ai-gateway — Ejecutor del LLM
 *
 * Dos entry points (mismo `_executeLLM` por dentro):
 *   chat.prompt.ready       → publica ai.chat.response       (flujo del chat)
 *   llm.complete.request    → publica llm.complete.response  (flujo genérico, usado por agentes)
 *
 * Responsabilidades:
 *   - Cargar tools del moduleLoader y filtrar por page_id (+ globales)
 *   - Leer attachments con fs.read.request en paralelo
 *   - Resolver credenciales del provider via credential-manager
 *   - Llamar provider con fallback automático (priority order)
 *   - Agentic loop: ejecutar tool calls vía eventos {tool_name} → {tool_name}.response
 *   - Reintento con backoff (configurado en module.json)
 */

const crypto = require('crypto');
const path = require('path');

const DeepSeekProvider  = require('./providers/deepseek-provider');
const AnthropicProvider = require('./providers/anthropic-provider');
const OpenAIProvider    = require('./providers/openai-provider');
const GroqProvider      = require('./providers/groq-provider');
const GeminiProvider    = require('./providers/gemini-provider');
const OllamaProvider    = require('./providers/ollama-provider');
const ClaudeCliProvider = require('./providers/claude-cli-provider');

class AiGatewayModule {
  constructor() {
    this.name = 'ai-gateway';
    this.version = '1.0.0';
    this.logger = null;
    this.eventBus = null;
    this.config = null;
    this.moduleLoader = null;

    this.providers = new Map();
    this.credentialCache = new Map();    // provider → { apiKey, resolvedAt, projectId }
    this.pendingCredentials = new Map(); // request_id → { resolve, reject, timeout }
    this.pendingFsReads = new Map();     // request_id → { resolve, reject, timeout }
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};
    this.moduleLoader = context.moduleLoader || null;

    await this._initializeProviders();
    this.logger.info('ai-gateway.loaded', { providers: this.providers.size });
  }

  async onUnload() {
    this.providers.clear();
    this.credentialCache.clear();
    for (const { timeout } of this.pendingCredentials.values()) clearTimeout(timeout);
    this.pendingCredentials.clear();
    for (const { timeout } of this.pendingFsReads.values()) clearTimeout(timeout);
    this.pendingFsReads.clear();
  }

  // ============================================================
  // Providers
  // ============================================================

  async _initializeProviders() {
    const classes = {
      deepseek: DeepSeekProvider,
      anthropic: AnthropicProvider,
      openai: OpenAIProvider,
      groq: GroqProvider,
      gemini: GeminiProvider,
      ollama: OllamaProvider,
      'claude-cli': ClaudeCliProvider
    };
    const credentialResolver = (provider, projectId) => this._resolveCredential(provider, projectId);

    for (const [name, Cls] of Object.entries(classes)) {
      const cfg = this.config.providers?.[name];
      if (!cfg?.enabled) continue;
      try {
        const p = new Cls(cfg, this.logger, credentialResolver);
        await p.initialize();
        this.providers.set(name, p);
      } catch (err) {
        this.logger.warn('ai-gateway.provider.init.failed', { provider: name, error: err.message });
      }
    }
  }

  async _selectProvider(requestedName, projectId) {
    if (requestedName && requestedName !== 'auto') {
      const p = this.providers.get(requestedName);
      if (!p) throw new Error(`Provider '${requestedName}' no disponible`);
      if (!await p.isAvailable({ projectId })) throw new Error(`Provider '${requestedName}' sin credencial`);
      return { name: requestedName, provider: p };
    }
    // Fallback por priority
    const enabled = Array.from(this.providers.entries())
      .map(([name, p]) => ({ name, provider: p, priority: this.config.providers?.[name]?.priority || 99 }))
      .sort((a, b) => a.priority - b.priority);
    for (const e of enabled) {
      if (await e.provider.isAvailable({ projectId })) return { name: e.name, provider: e.provider };
    }
    throw new Error('No hay providers disponibles. Verifica las API keys en credentials.');
  }

  // ============================================================
  // Credential resolver (event-driven a credential-manager)
  // ============================================================

  async _resolveCredential(provider, projectId) {
    const cached = this.credentialCache.get(provider);
    if (cached && cached.projectId === projectId && Date.now() - cached.resolvedAt < 300000) {
      return cached.apiKey;
    }
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCredentials.delete(request_id);
        reject(new Error(`credential resolve timeout: ${provider}`));
      }, 5000);
      this.pendingCredentials.set(request_id, { resolve, reject, timeout, provider, projectId });
      this.eventBus.publish('credential.resolve.request', { request_id, provider, project_id: projectId });
    });
  }

  onCredentialResponse(event) {
    const { request_id, api_key, error } = event.data || event;
    const pending = this.pendingCredentials.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingCredentials.delete(request_id);
    if (error || !api_key) return pending.reject(new Error(error || 'no api key'));
    this.credentialCache.set(pending.provider, { apiKey: api_key, resolvedAt: Date.now(), projectId: pending.projectId });
    pending.resolve(api_key);
  }

  onCredentialSaved(event) {
    const { provider } = event.data || event;
    if (provider) this.credentialCache.delete(provider);
  }
  onCredentialDeleted(event) {
    const { provider } = event.data || event;
    if (provider) this.credentialCache.delete(provider);
  }

  // ============================================================
  // Tools desde moduleLoader (filtradas por page_id)
  // ============================================================

  _getTools(page_id) {
    if (!this.moduleLoader) return [];
    const all = this.moduleLoader.getToolsForAI?.() || [];
    if (!page_id) return all;
    // Construcción lazy del mapa page_id → prefijos válidos. La primera vez que
    // se invoca, se escanean todos los módulos cargados y se cachea.
    if (this.pagePrefixes === undefined) this._buildPagePrefixes();
    // Tools globales que SIEMPRE se exponen al LLM principal aunque haya page_id activo.
    // Necesarias para que el LLM pueda delegar a agentes (invoke_agent), leer ficheros
    // del proyecto (fs.read), etc., independientemente de en qué módulo esté.
    const GLOBAL_TOOLS = new Set(['invoke_agent', 'fs.read', 'fs.write', 'fs.list', 'fs.search']);
    // Prefijos de tools válidos para este page_id. Permite que módulos como
    // menu-generator (tools 'menu.*') matcheen aunque el name del módulo y el
    // prefijo de la tool no coincidan literalmente — sin renombrar nada.
    const allowedPrefixes = this.pagePrefixes?.get(page_id);
    return all.filter(t => {
      const name = t.name || '';
      if (GLOBAL_TOOLS.has(name)) return true;
      if (allowedPrefixes && name.includes('.') && allowedPrefixes.has(name.split('.')[0])) return true;
      // Fallback: tool name empieza por page_id (caso recetas — name del módulo coincide con prefijo)
      if (name.startsWith(page_id + '.')) return true;
      return false;
    });
  }

  /**
   * Auto-deriva el mapa page_id → prefijos válidos de tools al arrancar.
   * Para cada módulo cargado, lee los prefijos únicos de sus tools[].name
   * y los asocia al name del módulo.
   *
   * Se llama en onLoad después de _initializeProviders.
   */
  _buildPagePrefixes() {
    this.pagePrefixes = new Map();
    const loaded = this.moduleLoader?.loadedModules;
    if (!loaded || typeof loaded[Symbol.iterator] !== 'function') {
      this.logger.warn('ai-gateway.page-prefixes.unavailable', {
        reason: 'moduleLoader.loadedModules no disponible'
      });
      return;
    }
    for (const [name, mod] of loaded) {
      const tools = mod?.manifest?.tools || [];
      const prefixes = new Set();
      for (const t of tools) {
        const tn = t?.name || '';
        if (tn.includes('.')) prefixes.add(tn.split('.')[0]);
      }
      if (prefixes.size > 0) this.pagePrefixes.set(name, prefixes);
    }
    this.logger.info('ai-gateway.page-prefixes.built', {
      modules: this.pagePrefixes.size,
      mapping: Object.fromEntries([...this.pagePrefixes].map(([k, v]) => [k, [...v]]))
    });
  }

  // ============================================================
  // Attachments — fs.read.request
  // ============================================================

  async _readAttachment(project_id, attachmentPath, encoding = 'utf8') {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingFsReads.delete(request_id);
        reject(new Error(`fs.read timeout: ${attachmentPath}`));
      }, 10000);
      this.pendingFsReads.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('fs.read.request', { request_id, path: attachmentPath, project_id, encoding });
    });
  }

  onFsReadResponse(event) {
    const { request_id, content, mime_type, error } = event.data || event;
    const pending = this.pendingFsReads.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingFsReads.delete(request_id);
    if (error) pending.reject(new Error(error));
    else pending.resolve({ content, mime_type });
  }

  async _resolveAttachments(project_id, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];
    const results = await Promise.allSettled(
      attachments.map(a => {
        const path = typeof a === 'string' ? a : a.path;
        const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(path);
        return this._readAttachment(project_id, path, isImage ? 'base64' : 'utf8')
          .then(r => ({ path, ...r, isImage }));
      })
    );
    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
  }

  _injectAttachmentsInMessages(messages, resolved) {
    if (resolved.length === 0) return messages;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') return messages;

    const images = resolved.filter(r => r.isImage);
    const texts = resolved.filter(r => !r.isImage);

    let userContent;
    if (images.length > 0) {
      // Formato multimodal genérico (ai-gateway lo deja "rich" y cada provider lo traduce)
      userContent = [{ type: 'text', text: last.content }];
      for (const img of images) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mime_type || 'image/jpeg', data: img.content }
        });
      }
    } else {
      userContent = last.content;
    }

    if (texts.length > 0) {
      const block = texts.map(t => `[Adjunto: ${path.basename(t.path)}]\n${t.content}`).join('\n\n');
      if (typeof userContent === 'string') userContent = `${userContent}\n\n${block}`;
      else userContent[0].text = `${userContent[0].text}\n\n${block}`;
    }

    return [...messages.slice(0, -1), { role: 'user', content: userContent }];
  }

  // ============================================================
  // Ejecución de tool calls (event-driven)
  // ============================================================

  async _executeToolCall(toolName, args, chatContext) {
    const ctx = chatContext || {};
    // Enriquecemos args con los 9 campos del contrato chat-io. Los args que
    // venían del LLM (tool_call.arguments) tienen prioridad — solo rellenamos
    // los que no estén ya en args. Esto garantiza que cualquier handler de
    // tool de un módulo reciba el contexto completo y pueda propagarlo al
    // evento agent.execute.request si invoca a un agente.
    const enrichedArgs = {
      ...args,
      project_id:      args.project_id      ?? ctx.project_id      ?? null,
      page_id:         args.page_id         ?? ctx.page_id         ?? null,
      conversation_id: args.conversation_id ?? ctx.conversation_id ?? null,
      settings:        args.settings        ?? ctx.settings        ?? null,
      attachments:     args.attachments     ?? ctx.attachments     ?? null,
      prompt:          args.prompt          ?? ctx.prompt          ?? null,
      intencion:       args.intencion       ?? ctx.intencion       ?? null,
      // El campo "context" del payload chat-io se preserva como _chat_context
      // para no colisionar con args.context que pueda venir del LLM.
      _chat_context:   ctx.context          ?? null
    };

    // PATH 1 — invocación directa del handler si está registrado en toolsRegistry.
    // Los módulos que declaran tools con handler (todos los que usan
    // moduleLoader.registerToolsForAI) tienen el handler bindeado a su instance.
    // Llamarlo directamente evita la dependencia de que el módulo haya declarado
    // también un subscribe al evento <toolName>. Esto desbloquea menu-generator,
    // carta-manager, etc. que tienen handler pero no subscribe explícito.
    const tool = this.moduleLoader?.toolsRegistry?.get(toolName);
    if (tool?.handler && typeof tool.handler === 'function') {
      try {
        const result = await tool.handler(enrichedArgs);
        // Convención: si el handler devuelve { error } o { status: 4xx+, error }, propagamos como error.
        if (result && typeof result === 'object') {
          if (result.error && (result.status == null || result.status >= 400)) {
            throw new Error(result.error);
          }
          // Si devuelve { status, data } estilo HTTP, devolvemos data; si no, el objeto entero.
          if ('status' in result && 'data' in result && result.status >= 200 && result.status < 400) {
            return result.data;
          }
        }
        return result;
      } catch (err) {
        throw err;
      }
    }

    // PATH 2 — fallback por evento (para tools que dependen estrictamente del bus).
    const request_id = crypto.randomUUID();
    const timeoutMs = toolName === 'invoke_agent' ? 150000 : (this.config.tool_timeout_ms || 15000);
    return new Promise((resolve, reject) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        reject(new Error(`tool timeout: ${toolName}`));
      }, timeoutMs);
      unsub = this.eventBus.subscribe(`${toolName}.response`, (event) => {
        const data = event.data || event;
        if (data.request_id !== request_id) return;
        clearTimeout(timeout);
        if (unsub) unsub();
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      });
      this.eventBus.publish(toolName, { request_id, ...enrichedArgs });
    });
  }

  // ============================================================
  // Núcleo: _executeLLM (agentic loop compartido)
  // ============================================================

  async _executeLLM({ system, messages, tools, settings, attachments, project_id, conversation_id, page_id, context, prompt, intencion, providerName }) {
    const { name: providerNameUsed, provider } = await this._selectProvider(providerName, project_id);

    // Resolver attachments y mezclarlos con el último mensaje user
    const resolvedAtt = await this._resolveAttachments(project_id, attachments);
    let workingMessages = [{ role: 'system', content: system }, ...messages];
    workingMessages = this._injectAttachmentsInMessages(workingMessages, resolvedAtt);

    const translatedTools = tools && tools.length > 0
      ? provider.translateTools?.(tools) || tools
      : null;

    const chatOptions = {
      temperature: settings?.temperature ?? 0.7,
      max_tokens: settings?.max_tokens ?? 2000,
      tools: translatedTools,
      projectId: project_id,
      retryConfig: this.config.retry
    };

    // Contexto completo del chat (9 campos del contrato chat-io) que se propaga
    // a cada tool call. Cualquier handler de tool de un módulo lo recibe en sus
    // args y puede propagarlo al evento agent.execute.request si invoca un agente.
    const chatContext = {
      project_id, page_id, conversation_id,
      settings, attachments, prompt, intencion, context
    };

    const maxIterations = this.config.max_tool_iterations || 10;
    let result, iteration = 0;
    let totalTokens = 0, totalCost = 0;
    const allToolResults = [];

    while (iteration < maxIterations) {
      iteration++;
      result = await provider.withRetry(
        () => provider.chatCompletion(workingMessages, chatOptions),
        chatOptions.retryConfig
      );
      totalTokens += result.usage?.total_tokens || 0;
      totalCost += result.cost || 0;

      if (!result.tool_calls || result.tool_calls.length === 0) break;

      // Parsear tool calls al formato genérico
      const toolCalls = (provider.parseToolCalls?.(result) || result.tool_calls).map(tc => ({
        id: tc.id || crypto.randomUUID(),
        name: tc.function?.name || tc.name,
        arguments: tc.function?.arguments || tc.arguments || {}
      }));

      // Ejecutar todas las tool calls
      const toolResults = [];
      for (const tc of toolCalls) {
        try {
          const args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments;
          const result = await this._executeToolCall(tc.name, args, chatContext);
          toolResults.push({ tool_call_id: tc.id, name: tc.name, status: 'success', result });
        } catch (err) {
          toolResults.push({ tool_call_id: tc.id, name: tc.name, status: 'error', error: err.message });
        }
      }
      allToolResults.push(...toolResults);

      // Añadir el assistant turn con tool_calls + los tool results
      workingMessages.push({ role: 'assistant', content: result.content || null, tool_calls: result._raw_tool_calls || result.tool_calls });
      const toolMessages = provider.formatToolResults?.(toolResults) || toolResults.map(tr => ({
        role: 'tool',
        tool_call_id: tr.tool_call_id,
        content: tr.status === 'error' ? `Error: ${tr.error}` : JSON.stringify(tr.result)
      }));
      workingMessages.push(...toolMessages);
    }

    return {
      content: result?.content || '',
      tool_calls_executed: allToolResults,
      iterations: iteration,
      tokens: totalTokens,
      cost: totalCost,
      model: result?.model,
      provider: providerNameUsed
    };
  }

  // ============================================================
  // Entry 1: chat.prompt.ready → ai.chat.response
  // ============================================================

  async onChatPromptReady(event) {
    const data = event.data || event;
    const {
      project_id, page_id, conversation_id,
      context, settings, prompt: systemPrompt,
      attachments, intencion, message, messages,
      message_id
    } = data;

    if (!project_id || !conversation_id) return;

    const tools = this._getTools(page_id);
    const history = Array.isArray(messages) ? messages : [{ role: 'user', content: message }];

    let llmResult;
    try {
      llmResult = await this._executeLLM({
        system: systemPrompt,
        messages: history,
        tools,
        settings,
        attachments,
        project_id,
        conversation_id,
        page_id,
        context,
        prompt: systemPrompt,
        intencion
      });
    } catch (err) {
      this.logger.error('ai-gateway.chat.failed', { error: err.message, conversation_id });
      llmResult = { content: `Error: ${err.message}`, tool_calls_executed: [], iterations: 0, tokens: 0, cost: 0 };
    }

    await this.eventBus.publish('ai.chat.response', {
      project_id,
      page_id,
      conversation_id,
      context: context || {},
      settings,
      prompt: systemPrompt,
      attachments: attachments || [],
      intencion: intencion ?? null,
      message: llmResult.content,
      message_id_user: message_id,
      tool_calls_executed: llmResult.tool_calls_executed,
      iterations: llmResult.iterations,
      tokens: llmResult.tokens,
      cost: llmResult.cost,
      model: llmResult.model,
      provider: llmResult.provider
    });
  }

  // ============================================================
  // Entry 2: llm.complete.request → llm.complete.response
  // ============================================================

  async onLlmCompleteRequest(event) {
    const data = event.data || event;
    const {
      request_id, system, messages, tools, settings,
      attachments, project_id, conversation_id, page_id, provider: providerName
    } = data;

    let result, error = null;
    try {
      result = await this._executeLLM({
        system, messages, tools, settings, attachments,
        project_id, conversation_id, page_id, providerName
      });
    } catch (err) {
      error = err.message;
      this.logger.error('ai-gateway.llm.failed', { error, request_id });
    }

    await this.eventBus.publish('llm.complete.response', {
      request_id,
      success: !error,
      ...(error ? { error } : { ...result })
    });
  }
}

module.exports = AiGatewayModule;
