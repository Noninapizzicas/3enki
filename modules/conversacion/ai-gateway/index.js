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
    this.version = '2.0.0';
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
        await p.configure();
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
        if (data.error) {
          // El error puede venir como string (legacy) o como { code, message } (canonico).
          const msg = (typeof data.error === 'object' && data.error !== null) ? data.error.message : data.error;
          reject(new Error(msg));
        } else resolve(data.result);
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
    let totalInput = 0, totalOutput = 0, totalCost = 0;
    const allToolResults = [];

    while (iteration < maxIterations) {
      iteration++;
      result = await provider.withRetry(
        () => provider.chatCompletion(workingMessages, chatOptions),
        chatOptions.retryConfig
      );
      totalInput  += result.usage?.input_tokens  || 0;
      totalOutput += result.usage?.output_tokens || 0;
      totalCost   += result.cost || 0;

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
      tokens: { input: totalInput, output: totalOutput, total: totalInput + totalOutput },
      cost: totalCost,
      model: result?.model,
      provider: providerNameUsed,
      finish_reason: result?.finish_reason
    };
  }

  // ============================================================
  // Entry 1: chat.prompt.ready → ai.chat.response
  // ============================================================

  async onChatPromptReady(event) {
    const data = event.data || event;

    const correlation_id  = data.correlation_id;
    const conversation_id = data.conversation_id;
    const project_id      = data.project_id ?? null;
    const user_id         = data.user_id || 'default';
    const channel         = data.channel || 'web';
    const channel_context = data.channel_context || {};
    const message_id      = data.message_id;
    const page_id         = data.page_id;
    const settings        = data.settings;
    const attachments     = data.attachments;
    const intencion       = data.intencion ?? null;
    const tools_disponibles = data.tools_disponibles;
    const systemPrompt    = data.system_prompt ?? '';
    const history = Array.isArray(data.messages) ? data.messages : [];

    if (!conversation_id || !message_id) {
      this.logger.warn('ai-gateway.onChatPromptReady.invalid_payload', { conversation_id, message_id });
      return;
    }

    const tools = tools_disponibles && tools_disponibles.length > 0
      ? tools_disponibles
      : this._getTools(page_id);

    const startedAt = Date.now();
    let providerAttempted = null;

    try {
      const llmResult = await this._executeLLM({
        system: systemPrompt,
        messages: history,
        tools,
        settings,
        attachments,
        project_id,
        conversation_id,
        page_id,
        prompt: systemPrompt,
        intencion
      });
      providerAttempted = llmResult.provider || null;

      const payload = {
        correlation_id:       correlation_id || crypto.randomUUID(),
        conversation_id,
        project_id,
        user_id,
        channel,
        channel_context,
        message_id,
        message_id_assistant: crypto.randomUUID(),
        assistant_message:    llmResult.content || '',
        model:                llmResult.model || 'unknown',
        provider:             llmResult.provider || 'unknown',
        tokens:               llmResult.tokens,
        duration_ms:          Date.now() - startedAt,
        timestamp:            new Date().toISOString()
      };
      if (Array.isArray(llmResult.tool_calls_executed) && llmResult.tool_calls_executed.length > 0) {
        payload.tool_calls_executed = llmResult.tool_calls_executed
          .map(t => ({
            name:          t.name,
            args:          (typeof t.args === 'object' && t.args !== null) ? t.args : {},
            result_status: t.status === 'success' ? 'ok' : (t.status === 'timeout' ? 'timeout' : 'error'),
            ...(t.duration_ms !== undefined ? { duration_ms: t.duration_ms } : {}),
            ...(t.error ? { error_code: 'INTERNAL_ERROR' } : {})
          }));
      }
      if (typeof llmResult.iterations === 'number' && llmResult.iterations >= 1) {
        payload.iterations = llmResult.iterations;
      }
      if (typeof llmResult.cost === 'number' && llmResult.cost > 0) {
        payload.cost = { amount: llmResult.cost, currency: 'USD' };
      }
      if (llmResult.finish_reason) payload.finish_reason = llmResult.finish_reason;

      await this.eventBus.publish('ai.chat.response', payload);
    } catch (err) {
      const error = this._classifyError(err);
      this.logger.error('ai-gateway.chat.failed', { code: error.code, error: error.message, conversation_id, message_id });

      await this.eventBus.publish('ai.chat.failed', {
        correlation_id: correlation_id || crypto.randomUUID(),
        conversation_id,
        project_id,
        user_id,
        channel,
        channel_context,
        message_id,
        error,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        provider_attempted: providerAttempted
      });
    }
  }

  // ============================================================
  // Clasificacion canonica de errores LLM/credenciales/red
  // ============================================================

  _classifyError(err) {
    const raw = (err && err.message) ? String(err.message) : 'unknown error';
    const lower = raw.toLowerCase();

    let code = 'INTERNAL_ERROR';
    if (/credential .*timeout|sin credencial|no api key|api key not|credential not found/i.test(raw)) {
      code = 'CREDENTIAL_NOT_FOUND';
    } else if (/no hay providers?.*disponibles?|no providers? available/i.test(raw)) {
      code = 'CREDENTIAL_NOT_FOUND';
    } else if (lower.includes('timeout') || lower.includes('etimedout')) {
      code = 'UPSTREAM_TIMEOUT';
    } else if (/429|rate.?limit/.test(lower)) {
      code = 'UPSTREAM_RATE_LIMITED';
    } else if (/401|403|unauthorized|forbidden|invalid api key/.test(lower)) {
      code = 'UPSTREAM_AUTH_FAILED';
    } else if (/5\d\d|internal server error|bad gateway|service unavailable/.test(lower)) {
      code = 'UPSTREAM_5XX';
    } else if (/econnrefused|enotfound|network|unreachable|fetch failed/.test(lower)) {
      code = 'UPSTREAM_UNREACHABLE';
    } else if (/invalid response|malformed|parse|unexpected token/.test(lower)) {
      code = 'UPSTREAM_INVALID_RESPONSE';
    }

    return { code, message: raw, details: {} };
  }

  // ============================================================
  // Entry 2: llm.complete.request → llm.complete.response
  // ============================================================

  async onLlmCompleteRequest(event) {
    const data = event.data || event;
    const {
      request_id, correlation_id, system, messages, tools, settings,
      attachments, project_id, conversation_id, page_id, provider: providerName
    } = data;

    if (!request_id) {
      this.logger.warn('ai-gateway.llm.invalid_payload', { has_request_id: false });
      return;
    }

    const cid = correlation_id || crypto.randomUUID();
    const started = Date.now();

    try {
      const result = await this._executeLLM({
        system, messages, tools, settings, attachments,
        project_id, conversation_id, page_id, providerName
      });

      await this._publicarEvento('llm.complete.response', {
        request_id,
        project_id,
        ...result,
        duration_ms: Date.now() - started
      }, { correlation_id: cid });
    } catch (err) {
      const error = this._classifyExecutionError(err);
      this.logger.error('ai-gateway.llm.failed', {
        error: error.message, code: error.code, request_id, correlation_id: cid
      });

      await this._publicarEvento('llm.complete.failed', {
        request_id,
        error,
        duration_ms: Date.now() - started
      }, { correlation_id: cid });
    }
  }

  // ============================================================
  // Entry 3: embedding.generate.request → embedding.generate.response | failed
  // ============================================================

  async onEmbeddingGenerateRequest(event) {
    const data = event.data || event;
    const {
      correlation_id, request_id, project_id, user_id, content,
      settings, source
    } = data;

    if (!correlation_id || !request_id || !project_id || !content) {
      this.logger.warn('ai-gateway.embedding.invalid_payload', {
        has_correlation: !!correlation_id, has_request: !!request_id,
        has_project: !!project_id, has_content: !!content
      });
      return;
    }

    const start = Date.now();
    const desiredProvider = settings?.provider;
    let providerInstance = null;
    let providerName = null;

    try {
      const selected = await this._selectEmbeddingProvider(desiredProvider, project_id);
      providerInstance = selected.provider;
      providerName = selected.name;
      providerInstance.setContext({ projectId: project_id });

      const opts = {
        model: settings?.model,
        dimensions: settings?.dimensions
      };
      const result = await providerInstance.generateEmbedding(content, opts);

      const duration_ms = Date.now() - start;
      this.logger.info('ai-gateway.embedding.completed', {
        provider: providerName, model: result.model,
        dimensions: result.dimensions, duration_ms,
        source: source || 'unknown'
      });

      await this.eventBus.publish('embedding.generate.response', {
        correlation_id,
        request_id,
        vector: result.vector,
        dimensions: result.dimensions,
        model: result.model,
        provider: providerName,
        tokens: result.tokens || { input: 0 },
        duration_ms,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      const duration_ms = Date.now() - start;
      const classified = this._classifyError(err);
      this.logger.error('ai-gateway.embedding.failed', {
        error: err.message, code: classified.code, request_id,
        provider_attempted: providerName, duration_ms
      });

      await this.eventBus.publish('embedding.generate.failed', {
        correlation_id,
        request_id,
        error: { code: classified.code, message: classified.message },
        ...(providerName ? { provider_attempted: providerName } : {}),
        ...(settings?.model ? { model_attempted: settings.model } : {}),
        duration_ms,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Selecciona provider para embeddings. A diferencia de _selectProvider (LLM),
   * filtra por providers que SOPORTAN embeddings (gemini, openai). Si el caller
   * pide explicitamente uno que no soporta o no esta disponible, lanza con
   * mensaje claro. Si no pide ninguno, prefiere por priority entre los que
   * soportan embeddings.
   */
  async _selectEmbeddingProvider(requestedName, projectId) {
    if (requestedName && requestedName !== 'auto') {
      const p = this.providers.get(requestedName);
      if (!p) throw new Error(`Provider '${requestedName}' no disponible`);
      if (!p.supportsEmbeddings()) throw new Error(`Provider '${requestedName}' no soporta embeddings`);
      if (!await p.isAvailable({ projectId })) throw new Error(`Provider '${requestedName}' sin credencial`);
      return { name: requestedName, provider: p };
    }
    const candidates = Array.from(this.providers.entries())
      .filter(([, p]) => p.supportsEmbeddings())
      .map(([name, p]) => ({ name, provider: p, priority: this.config.providers?.[name]?.priority || 99 }))
      .sort((a, b) => a.priority - b.priority);
    for (const e of candidates) {
      if (await e.provider.isAvailable({ projectId })) return { name: e.name, provider: e.provider };
    }
    throw new Error('No hay providers de embeddings disponibles. Verifica las API keys (gemini, openai).');
  }

  // ============================================================
  // Helpers POC2 (transferibles) + auxiliares del dominio
  // ============================================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code    = err._code || this._classifyHandlerError(err);
    const status  = code === 'VALIDATION_FAILED'      ? 400 :
                    code === 'RESOURCE_NOT_FOUND'     ? 404 :
                    code === 'AUTHORIZATION_REQUIRED' ? 403 :
                    code === 'CONFLICT'               ? 409 :
                    code === 'UPSTREAM_UNAVAILABLE'   ? 503 :
                                                        500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid')) return 'VALIDATION_FAILED';
    if (msg.includes('unauthorized') || msg.includes('forbidden')) return 'AUTHORIZATION_REQUIRED';
    if (msg.includes('unavailable') || msg.includes('not available')) return 'UPSTREAM_UNAVAILABLE';
    return 'INTERNAL_ERROR';
  }

  // Helper auxiliar especifico del dominio LLM:
  // mapea errores de providers/HTTP/CLI a codigos canonicos del agentic loop.
  // Renombrado de _classifyError para alinear con el contrato POC2
  // (HELPERS_AUXILIARES). Preserva los codes existentes consumidos por chat
  // y embedding paths.
  _classifyExecutionError(err) {
    return this._classifyError(err);
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      timestamp: new Date().toISOString(),
      ...payload
    };
    if (sourcePayload?.correlation_id) enriched.correlation_id = sourcePayload.correlation_id;
    else if (!enriched.correlation_id)  enriched.correlation_id = crypto.randomUUID();
    await this.eventBus.publish(name, enriched);
  }
}

module.exports = AiGatewayModule;
