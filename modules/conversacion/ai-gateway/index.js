const fs = require('fs');
const DeepSeekProvider = require('./providers/deepseek-provider');
const AnthropicProvider = require('./providers/anthropic-provider');
const OpenAIProvider = require('./providers/openai-provider');
const OllamaProvider = require('./providers/ollama-provider');
const GroqProvider = require('./providers/groq-provider');
const GeminiProvider = require('./providers/gemini-provider');
const ClaudeCliProvider = require('./providers/claude-cli-provider');

const { EVENTS } = require('../../../core/constants');

/**
 * AI Gateway Module
 *
 * Entrada: chat.prompt.ready
 * Salida:  ai.chat.response
 *
 * Responsabilidades:
 * - Llamar al LLM con las tools disponibles
 * - Ejecutar tool calls vía events (agentic loop)
 * - Fallback automático entre providers
 * - Resolver API keys desde credential-manager
 */
class AIGatewayModule {
  constructor() {
    this.providers = new Map();
    this.config = null;
    this.logger = null;
    this.eventBus = null;

    // Credential resolution
    this.pendingCredentialRequests = new Map(); // requestId -> {resolve, reject, timeout}
    this.credentialCache = new Map(); // provider -> {apiKey, resolvedAt, projectId}
  }

  /**
   * Module lifecycle: onLoad
   */
  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.moduleLoader = context.moduleLoader; // Para acceder a tools registry
    this.activity = context.activity?.forModule('ai-gateway');

    this.activity?.action('module.loading', {});

    // Load config from loader-injected moduleConfig
    this.config = context.moduleConfig || {};

    // Initialize providers
    await this.initializeProviders();

    // Event subscriptions are auto-wired by the loader from module.json

    const availableProviders = await this.getAvailableProviderNames();

    this.activity?.action('module.loaded', {
      providers_count: this.providers.size,
      providers_available: availableProviders
    });

    this.logger.info('ai-gateway.loaded', {
      providers_count: this.providers.size,
      providers_available: availableProviders
    });
  }

  // Event handlers (onChatPromptReady, onCredentialResponse, etc.)
  // se conectan por el loader desde module.json.subscribes.

  /**
   * Resolve credential from credential-manager via events
   * Supports cascade: CUSTOM → CLIENT → PROJECT → GLOBAL
   */
  async resolveCredential(providerName, { projectId, clientId, customId } = {}) {
    // Check cache first (valid for 5 minutes)
    const cacheKey = `${providerName}:${projectId || 'global'}:${clientId || ''}:${customId || ''}`;
    const cached = this.credentialCache.get(cacheKey);
    if (cached && (Date.now() - cached.resolvedAt) < 300000) {
      return cached.apiKey;
    }

    const requestId = `cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      // Set timeout for credential resolution
      const timeout = setTimeout(() => {
        this.pendingCredentialRequests.delete(requestId);
        reject(new Error(`Credential resolution timeout for ${providerName}`));
      }, 5000);

      // Store pending request
      this.pendingCredentialRequests.set(requestId, { resolve, reject, timeout, providerName, cacheKey });

      // Publish request to credential-manager
      this.eventBus.publish(EVENTS.CREDENTIAL.RESOLVE_REQUEST, {
        provider: providerName.toUpperCase(),
        project_id: projectId,
        client_id: clientId,
        custom_id: customId,
        request_id: requestId
      });

      this.logger.debug('ai-gateway.credential.request', {
        request_id: requestId,
        provider: providerName,
        project_id: projectId
      });
    });
  }

  /**
   * Handle credential resolution response from credential-manager
   */
  async onCredentialResponse(event) {
    const { request_id, success, api_key, resolved_from, error } = event.data || event.payload || event;

    const pending = this.pendingCredentialRequests.get(request_id);
    if (!pending) {
      // Not our request or already timed out
      return;
    }

    // Clean up
    clearTimeout(pending.timeout);
    this.pendingCredentialRequests.delete(request_id);

    if (success && api_key) {
      // Cache the credential
      this.credentialCache.set(pending.cacheKey, {
        apiKey: api_key,
        resolvedAt: Date.now(),
        resolvedFrom: resolved_from
      });

      this.logger.info('ai-gateway.credential.resolved', {
        provider: pending.providerName,
        resolved_from,
        request_id
      });

      pending.resolve(api_key);
    } else {
      this.logger.warn('ai-gateway.credential.failed', {
        provider: pending.providerName,
        error,
        request_id
      });

      pending.reject(new Error(error || `No credential found for ${pending.providerName}`));
    }
  }

  onCredentialSaved(event) {
    const { provider, level, identifier } = event.data || event;
    if (!provider) return;
    // Invalidate all cache entries for this provider
    for (const key of this.credentialCache.keys()) {
      if (key.startsWith(provider.toLowerCase() + ':')) this.credentialCache.delete(key);
    }
    this.logger.debug('ai-gateway.credential.cache.invalidated', { provider, level, identifier });
  }

  onCredentialDeleted(event) {
    this.onCredentialSaved(event);
  }

  // Event Handler: chat.prompt.ready — nuevo flujo event-driven
  _resolveAttachments(messages) {
    const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    return messages.map(msg => {
      if (!msg.attachments?.length) return msg;
      const { attachments, ...rest } = msg;
      let content = rest.content || '';
      let image_base64 = null;
      let image_type = null;

      for (const att of attachments) {
        if (!att.path) continue;
        try {
          if (att.type === 'image') {
            const ext = att.name?.split('.').pop()?.toLowerCase() || 'jpeg';
            image_base64 = fs.readFileSync(att.path).toString('base64');
            image_type = MIME[ext] || 'image/jpeg';
          } else {
            const text = fs.readFileSync(att.path, 'utf8');
            content = content ? `${content}\n\n[${att.name}]\n${text}` : `[${att.name}]\n${text}`;
          }
        } catch { /* archivo no accesible — continuar sin él */ }
      }

      return image_base64
        ? { ...rest, content, image_base64, image_type }
        : { ...rest, content };
    });
  }

  async onChatPromptReady(event) {
    const data = event.data || event;
    const { conversation_id, project_id, content, prompt, messages, decision, request_id } = data;
    const target_module = decision?.module || null;
    if (!conversation_id || !content) return;

    const rawHistory = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: 'user', content }];

    const history = this._resolveAttachments(rawHistory);

    const allTools = this.getAvailableTools();
    let tools;
    if (target_module) {
      tools = allTools.filter(t => (t.name || '').startsWith(target_module + '.'));
      // Always include invoke_agent, scoped to this module
      const rawInvokeAgent = this.moduleLoader?.getTool('invoke_agent');
      if (rawInvokeAgent?._agentsList) {
        const scopedAgents = rawInvokeAgent._agentsList.filter(a => {
          const scope = a.scope || ['*'];
          return scope.includes('*') || scope.includes(target_module);
        });
        if (scopedAgents.length > 0) {
          const desc = scopedAgents.map(a => `  - ${a.name}: ${a.description}`).join('\n');
          tools.push({
            name: 'invoke_agent',
            description: `Invoca un agente especialista para realizar una tarea compleja.\n\nAgentes disponibles:\n${desc}\n\nDevuelve cuando el agente termina con su resultado.`,
            parameters: {
              ...rawInvokeAgent.parameters,
              properties: {
                ...rawInvokeAgent.parameters.properties,
                agent_name: { ...rawInvokeAgent.parameters.properties.agent_name, enum: scopedAgents.map(a => a.name) }
              }
            },
            confirmation: false
          });
        }
      }
    } else {
      tools = allTools;
    }

    this.logger.info('ai-gateway.tools.filtered', {
      conversation_id,
      project_id,
      target_module,
      all_tools_count: allTools.length,
      filtered_tools_count: tools.length,
      decision_keys: decision ? Object.keys(decision) : []
    });

    await this.onAIChatRequest({
      data: {
        request_id: request_id || require('crypto').randomUUID(),
        messages: [
          ...(prompt ? [{ role: 'system', content: prompt }] : []),
          ...history
        ],
        tools: tools.length > 0 ? tools : true,
        execute_tools: true,
        project_id,
        conversation_id,
        stream: false
      }
    });
  }

  async onAIChatRequest(event) {
    // EventEnvelope uses .data, legacy uses .payload
    const {
      request_id,
      messages,
      tools,
      execute_tools,
      max_tool_iterations,
      provider: requestedProvider,
      model,
      temperature,
      max_tokens,
      project_id,
      correlation_id,
      stream
    } = event.data || event.payload || event;

    const correlationId = correlation_id || event.correlationId;
    const endTimer = this.activity?.timer('chat.request');

    this.activity?.action('chat.request.received', {
      request_id,
      provider: requestedProvider,
      model,
      messages_count: messages?.length || 0,
      tools_count: tools?.length || 0
    });

    this.logger.info('ai-gateway.chat.request.received', {
      request_id,
      provider: requestedProvider,
      has_messages: !!messages,
      has_tools: !!(tools && tools.length),
      tools_count: tools?.length || 0,
      project_id,
      correlation_id: correlationId
    });

    try {
      // Procesar la solicitud (streaming eliminado — nadie consume ai.chat.chunk)
      const result = await this.handleChatCompletion({
        body: {
          messages,
          tools,
          execute_tools,
          max_tool_iterations,
          provider: requestedProvider,
          model,
          temperature,
          max_tokens,
          metadata: { request_id, project_id }
        }
      }, { correlationId, projectId: project_id });

      // Publicar respuesta exitosa
      const responsePayload = {
        request_id,
        conversation_id: event.data?.conversation_id || null,
        project_id: project_id || null,
        correlation_id: correlationId,
        success: result.status === 200,
        message: result.data?.content,
        content: result.data?.content,
        tool_calls: result.data?.tool_calls || null,
        tool_calls_executed: result.data?.tool_results || [],
        iterations: result.data?.iterations || 1,
        tokens: result.data?.usage?.total_tokens || 0,
        cost: result.data?.cost || 0,
        model: result.data?.model,
        provider: result.data?.provider || requestedProvider,
        error: result.status !== 200 ? result.data?.message : null
      };

      await this.eventBus.publish(EVENTS.AI.CHAT_RESPONSE, responsePayload, { correlationId });

      endTimer?.({
        success: result.status === 200,
        provider: result.data?.provider,
        model: result.data?.model,
        tokens: result.data?.usage?.total_tokens || 0
      });

      this.activity?.action('chat.response.sent', {
        request_id,
        success: result.status === 200,
        provider: result.data?.provider,
        model: result.data?.model,
        tokens: result.data?.usage?.total_tokens || 0,
        has_tool_calls: !!(result.data?.tool_calls)
      });

      this.logger.info('ai-gateway.chat.response.sent', {
        request_id,
        success: result.status === 200,
        has_tool_calls: !!(result.data?.tool_calls),
        correlation_id: correlationId
      });

    } catch (error) {
      endTimer?.({ success: false, error: error.message });
      this.activity?.error('chat.request', error, { request_id, provider: requestedProvider });

      this.logger.error('ai-gateway.chat.request.error', {
        request_id,
        error: error.message,
        correlation_id: correlationId
      });

      // Publicar error — incluir scope para que chat-session pueda guardar mensaje de error
      await this.eventBus.publish(EVENTS.AI.CHAT_RESPONSE, {
        request_id,
        conversation_id: event.data?.conversation_id || null,
        project_id: event.data?.project_id || null,
        correlation_id: correlationId,
        success: false,
        message: null,
        content: `Error del LLM: ${error.message}`,
        tool_calls: null,
        tokens: 0,
        cost: 0,
        model: null,
        provider: requestedProvider,
        error: error.message
      }, { correlationId });
    }
  }

  /**
   * Module lifecycle: onUnload
   */
  async onUnload() {
    this.logger.info('ai-gateway.unloaded');
  }

  /**
   * Initialize all providers
   */
  async initializeProviders() {
    const providerClasses = {
      deepseek: DeepSeekProvider,
      anthropic: AnthropicProvider,
      openai: OpenAIProvider,
      ollama: OllamaProvider,
      groq: GroqProvider,
      gemini: GeminiProvider,
      'claude-cli': ClaudeCliProvider
    };

    // Create credential resolver bound to this gateway
    const credentialResolver = this.resolveCredential.bind(this);

    for (const [name, ProviderClass] of Object.entries(providerClasses)) {
      const providerConfig = this.config.providers?.[name];

      if (providerConfig && providerConfig.enabled) {
        const provider = new ProviderClass(providerConfig, this.logger, credentialResolver);
        await provider.initialize();
        this.providers.set(name, provider);
      }
    }
  }

  /**
   * Get available provider names
   */
  async getAvailableProviderNames() {
    const names = [];
    for (const [name, provider] of this.providers.entries()) {
      if (await provider.isAvailable()) {
        names.push(name);
      }
    }
    return names;
  }

  /**
   * Get provider by priority
   */
  async getProvidersByPriority() {
    const available = [];

    for (const [name, provider] of this.providers.entries()) {
      if (await provider.isAvailable()) {
        available.push({
          name,
          provider,
          priority: this.config.providers[name].priority
        });
      }
    }

    // Sort by priority (1 = highest)
    available.sort((a, b) => a.priority - b.priority);

    return available.map(item => ({ name: item.name, provider: item.provider }));
  }

  /**
   * API Handler: Chat Completion
   * Format: return { status, data }
   * Supports tools for function calling with optional auto-execution
   *
   * Options:
   * - tools: Array of tools to make available
   * - execute_tools: If true, auto-execute tool calls and continue conversation
   * - max_tool_iterations: Max tool call loops (default: 10)
   */
  async handleChatCompletion(req, context) {
    try {
      const {
        messages: initialMessages,
        tools: requestedTools,
        provider: requestedProvider,
        model,
        temperature,
        max_tokens,
        top_p,
        metadata,
        execute_tools,
        max_tool_iterations
      } = req.body || {};
      const projectId = context?.projectId || metadata?.project_id;

      if (!initialMessages || !Array.isArray(initialMessages) || initialMessages.length === 0) {
        return {
          status: 400,
          data: { error: 'INVALID_REQUEST', message: 'messages array is required' }
        };
      }

      const startTime = Date.now();
      const maxIterations = max_tool_iterations || 10;
      let messages = [...initialMessages];
      let totalTokens = 0;
      let totalCost = 0;
      let allToolResults = [];

      // Get tools - use provided array, or if true/truthy load from moduleLoader
      let tools = null;
      if (Array.isArray(requestedTools) && requestedTools.length > 0) {
        // Explicit tools array provided
        tools = requestedTools;
      } else if (requestedTools && this.moduleLoader) {
        // tools=true or truthy - load from moduleLoader
        const availableTools = this.getAvailableTools();
        if (availableTools.length > 0) {
          tools = availableTools;
        }
      }

      // Determine provider first
      let providerName;
      let provider;

      if (requestedProvider && requestedProvider !== 'auto') {
        provider = this.providers.get(requestedProvider);
        if (!provider) {
          return {
            status: 400,
            data: { error: 'PROVIDER_NOT_FOUND', message: `Provider '${requestedProvider}' not found or not enabled` }
          };
        }
        if (!await provider.isAvailable({ projectId })) {
          return {
            status: 503,
            data: { error: 'PROVIDER_NOT_AVAILABLE', message: `Provider '${requestedProvider}' not available` }
          };
        }
        providerName = requestedProvider;
      } else {
        const providers = await this.getProvidersByPriority();
        if (providers.length === 0) {
          return {
            status: 503,
            data: { error: 'NO_PROVIDERS_AVAILABLE', message: 'No AI providers available. Check your API keys in credentials.' }
          };
        }
        providerName = providers[0].name;
        provider = providers[0].provider;
      }

      // Translate tools to provider format
      const translatedTools = tools ? this.translateToolsForProvider(tools, providerName) : null;

      // Chat options
      const chatOptions = {
        model,
        temperature,
        max_tokens,
        top_p,
        tools: translatedTools,
        projectId,
        retryConfig: this.config.retry
      };

      // Agentic loop - execute tools and continue conversation
      let result;
      let iteration = 0;
      let consecutiveToolErrors = 0;
      const MAX_CONSECUTIVE_TOOL_ERRORS = 3;

      while (iteration < maxIterations) {
        iteration++;

        this.logger.info('ai-gateway.chat.iteration', {
          iteration,
          messages_count: messages.length,
          has_tools: !!translatedTools
        });

        result = await this.chatWithRetry(provider, messages, chatOptions);

        // Accumulate usage
        totalTokens += result.usage?.total_tokens || 0;
        totalCost += result.cost || 0;

        // Check for tool calls
        if (!result.tool_calls || result.tool_calls.length === 0) {
          // No tool calls - we're done
          break;
        }

        // If execute_tools is not enabled, return with tool_calls for caller to handle
        if (!execute_tools) {
          break;
        }

        this.logger.info('ai-gateway.tools.executing', {
          iteration,
          tool_calls_count: result.tool_calls.length,
          tools: result.tool_calls.map(tc => tc.function?.name || tc.name)
        });

        // Parse and execute tool calls
        const toolCalls = this.parseToolCallsFromProvider(result, providerName);
        const toolResults = await this.executeToolCalls(toolCalls, context);
        allToolResults.push(...toolResults);

        // Check if any tool requires confirmation (pause the loop)
        const pendingConfirmation = toolResults.find(r => r.requires_confirmation);
        if (pendingConfirmation) {
          this.logger.info('ai-gateway.tools.pending_confirmation', {
            tool: pendingConfirmation.name
          });
          result.pending_confirmation = pendingConfirmation;
          break;
        }

        // Track consecutive tool errors to break infinite retry loops
        // (e.g. DeepSeek repeatedly sending truncated JSON that always fails)
        const allFailed = toolResults.length > 0 && toolResults.every(r => r.status === 'error');
        if (allFailed) {
          consecutiveToolErrors++;
          this.logger.warn('ai-gateway.tools.consecutive_errors', {
            iteration,
            consecutive: consecutiveToolErrors,
            max: MAX_CONSECUTIVE_TOOL_ERRORS,
            tools: toolResults.map(r => r.name)
          });

          if (consecutiveToolErrors >= MAX_CONSECUTIVE_TOOL_ERRORS) {
            this.logger.error('ai-gateway.tools.error_loop_broken', {
              iterations: iteration,
              consecutive_errors: consecutiveToolErrors,
              last_errors: toolResults.map(r => ({ name: r.name, error: r.error }))
            });

            // Inject a system hint so the LLM can give a human-readable error
            messages.push({
              role: 'assistant',
              content: result.content || null,
              tool_calls: result._raw_tool_calls || result.tool_calls
            });
            const errorToolMessages = this.formatToolResultsForProvider(
              toolResults.map(r => ({
                ...r,
                result: `Error after ${consecutiveToolErrors} retries: ${r.error}. ` +
                  'Do NOT retry. Tell the user what went wrong and suggest a simpler request.'
              })),
              providerName
            );
            messages.push(...errorToolMessages);

            // One last call so the LLM can compose a final user-facing message
            if (iteration < maxIterations) {
              const finalOpts = { ...chatOptions, tools: null }; // strip tools to force text
              result = await this.chatWithRetry(provider, messages, finalOpts);
              totalTokens += result.usage?.total_tokens || 0;
              totalCost += result.cost || 0;
            }
            break;
          }
        } else {
          consecutiveToolErrors = 0;
        }

        // Add assistant message with tool calls to conversation
        // Use raw API names (_raw_tool_calls) so the provider sees its own names echoed back
        messages.push({
          role: 'assistant',
          content: result.content || null,
          tool_calls: result._raw_tool_calls || result.tool_calls
        });

        // Add tool results to conversation
        const toolResultMessages = this.formatToolResultsForProvider(toolResults, providerName);
        messages.push(...toolResultMessages);
      }

      const latencyMs = Date.now() - startTime;

      return {
        status: 200,
        data: {
          ...result,
          usage: {
            ...result.usage,
            total_tokens: totalTokens
          },
          cost: totalCost,
          latency_ms: latencyMs,
          iterations: iteration,
          tool_results: allToolResults.length > 0 ? allToolResults : undefined,
          metadata
        }
      };
    } catch (error) {
      this.logger.error('ai-gateway.chat.error', { error: error.message });
      return {
        status: 500,
        data: { error: 'CHAT_FAILED', message: error.message }
      };
    }
  }

  // ============ TOOLS INTEGRATION ============

  /**
   * Get available tools from Module Loader
   * Returns tools in format suitable for AI providers
   */
  getAvailableTools() {
    if (!this.moduleLoader) {
      return [];
    }

    return this.moduleLoader.getToolsForAI();
  }

  /**
   * Execute tool calls from AI response
   * @param {Array} toolCalls - Array of tool calls from AI
   * @param {Object} context - Execution context
   * @returns {Array} Results for each tool call
   */
  async executeToolCalls(toolCalls, context = {}) {
    if (!toolCalls || !Array.isArray(toolCalls)) return [];

    const results = [];

    for (const call of toolCalls) {
      const { id, name: rawName, arguments: args } = call;
      const name = this.normalizeToolName(rawName);

      const enrichedArgs = {
        ...args,
        ...(context.projectId && !args.project_id ? { project_id: context.projectId } : {}),
        ...(context.conversationId && !args.conversation_id ? { conversation_id: context.conversationId } : {})
      };

      try {
        this.logger.info('ai-gateway.tool.executing', { tool: name, call_id: id });

        const timeoutMs = name === 'invoke_agent' ? 150000 : 15000;
        const result = await this._executeToolViaEvent(name, enrichedArgs, timeoutMs);

        results.push({ tool_call_id: id, name, status: 'success', result });
        this.logger.info('ai-gateway.tool.executed', { tool: name, call_id: id });

      } catch (error) {
        this.logger.error('ai-gateway.tool.error', { tool: name, call_id: id, error: error.message });
        results.push({ tool_call_id: id, name, status: 'error', result: `Error: ${error.message}`, error: error.message });
      }
    }

    return results;
  }

  // Emite el evento del tool y espera su respuesta por request_id
  async _executeToolViaEvent(toolName, args, timeoutMs = 15000) {
    const crypto = require('crypto');
    const request_id = crypto.randomUUID();
    const responseEvent = `${toolName}.response`;

    return new Promise((resolve, reject) => {
      let unsub;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        reject(new Error(`Tool timeout: ${toolName}`));
      }, timeoutMs);

      unsub = this.eventBus.subscribe(responseEvent, (event) => {
        const data = event.data || event;
        if (data.request_id !== request_id) return;
        unsub();
        clearTimeout(timeout);
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      });

      this.eventBus.publish(toolName, { request_id, ...args });
    });
  }

  /**
   * Translate tools to provider-specific format
   * @param {Array} tools - Tools from moduleLoader (internal format)
   * @param {string} providerName - Target provider name
   * @returns {Array} Provider-formatted tools
   */
  translateToolsForProvider(tools, providerName) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return [];
    }

    switch (providerName) {
      case 'anthropic':
        // Anthropic format: { name, description, input_schema }
        return tools.map(tool => ({
          name: tool.name,
          description: tool.description || '',
          input_schema: tool.parameters || {
            type: 'object',
            properties: {},
            required: []
          }
        }));

      case 'gemini':
        // Gemini format: handled inside gemini-provider.convertTools()
        // Pass through as-is — the provider will convert
        return tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || {
              type: 'object',
              properties: {},
              required: []
            }
          }
        }));

      case 'openai':
      case 'deepseek':
      case 'groq':
      case 'ollama':
      default:
        // OpenAI-compatible format (DeepSeek, Groq, Ollama all use this)
        return tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || {
              type: 'object',
              properties: {},
              required: []
            }
          }
        }));
    }
  }

  /**
   * Safely parse JSON arguments from tool calls
   * Handles truncated JSON from providers that exceed token limits
   * by attempting partial field recovery before giving up.
   *
   * @param {string|object} args - Arguments to parse
   * @returns {object} Parsed arguments or recovered fields
   */
  safeParseArguments(args) {
    if (typeof args !== 'string') return args || {};
    try {
      return JSON.parse(args);
    } catch (e) {
      this.logger?.warn('ai-gateway.tool-args-parse-error', {
        error: e.message,
        args_length: args.length,
        truncated: args.substring(0, 200)
      });

      // Attempt partial recovery: extract top-level string fields from truncated JSON
      // This handles the common case where DeepSeek truncates a long "content" value
      const recovered = this._recoverFieldsFromTruncatedJSON(args);
      if (recovered && Object.keys(recovered).length > 0) {
        this.logger?.info('ai-gateway.tool-args-partial-recovery', {
          recovered_fields: Object.keys(recovered),
          original_length: args.length
        });
        recovered._partial_recovery = true;
        return recovered;
      }

      return { _parse_error: e.message, _raw: args };
    }
  }

  /**
   * Attempt to recover key-value pairs from truncated JSON
   * Extracts complete "key":"value" pairs that appear before the truncation point.
   * For the last (truncated) string value, captures what's available.
   *
   * @param {string} raw - Truncated JSON string
   * @returns {object|null} Recovered fields or null
   */
  _recoverFieldsFromTruncatedJSON(raw) {
    if (!raw || typeof raw !== 'string') return null;

    const result = {};

    // Match complete "key": "value" pairs (handles escaped quotes inside values)
    const completeFieldRegex = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let match;
    let lastIndex = 0;

    while ((match = completeFieldRegex.exec(raw)) !== null) {
      result[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      lastIndex = completeFieldRegex.lastIndex;
    }

    // Try to recover the last truncated string field
    // Pattern: after the last complete pair, look for "key": "value... (unterminated)
    const remainder = raw.slice(lastIndex);
    const truncatedMatch = remainder.match(/"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (truncatedMatch) {
      const key = truncatedMatch[1];
      let value = truncatedMatch[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      // Mark truncated content so consumers know it's incomplete
      if (value.length > 0) {
        result[key] = value;
        result._truncated_field = key;
      }
    }

    // Also try to recover non-string fields: "key": number/boolean/null
    const nonStringRegex = /"([^"]+)"\s*:\s*(true|false|null|\d+(?:\.\d+)?)\s*[,}]/g;
    while ((match = nonStringRegex.exec(raw)) !== null) {
      if (!(match[1] in result)) {
        try {
          result[match[1]] = JSON.parse(match[2]);
        } catch {
          result[match[1]] = match[2];
        }
      }
    }

    return Object.keys(result).filter(k => !k.startsWith('_')).length > 0 ? result : null;
  }

  /**
   * Parse tool calls from provider response to internal format
   * @param {Object} response - Provider response
   * @param {string} providerName - Source provider name
   * @returns {Array} Normalized tool calls: [{ id, name, arguments }]
   */
  parseToolCallsFromProvider(response, providerName) {
    if (!response) return [];

    let toolCalls = [];

    switch (providerName) {
      case 'anthropic':
        // Anthropic provider already normalizes tool_use blocks to OpenAI-compatible
        // tool_calls format in chatCompletion(), so read from response.tool_calls
        if (response.tool_calls && Array.isArray(response.tool_calls)) {
          toolCalls = response.tool_calls.map(tc => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: this.safeParseArguments(tc.function?.arguments)
          }));
        }
        break;

      case 'openai':
      case 'deepseek':
        // OpenAI/DeepSeek: message.tool_calls array
        if (response.tool_calls && Array.isArray(response.tool_calls)) {
          toolCalls = response.tool_calls.map(tc => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: this.safeParseArguments(tc.function?.arguments)
          }));
        }
        // Also check choices[0].message.tool_calls for raw API responses
        else if (response.choices?.[0]?.message?.tool_calls) {
          toolCalls = response.choices[0].message.tool_calls.map(tc => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: this.safeParseArguments(tc.function?.arguments)
          }));
        }
        break;

      case 'groq':
        // Groq: OpenAI-compatible format
        if (response.tool_calls && Array.isArray(response.tool_calls)) {
          toolCalls = response.tool_calls.map(tc => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: this.safeParseArguments(tc.function?.arguments)
          }));
        }
        break;

      case 'gemini':
        // Gemini: tool_calls already normalized by gemini-provider
        if (response.tool_calls && Array.isArray(response.tool_calls)) {
          toolCalls = response.tool_calls.map(tc => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: this.safeParseArguments(tc.function?.arguments)
          }));
        }
        break;

      case 'ollama':
        // Ollama: similar to OpenAI when tools are supported
        if (response.message?.tool_calls) {
          toolCalls = response.message.tool_calls.map(tc => ({
            id: tc.id || `ollama-${Date.now()}`,
            name: tc.function?.name,
            arguments: this.safeParseArguments(tc.function?.arguments)
          }));
        }
        break;

      default:
        // Try OpenAI format as default
        if (response.tool_calls && Array.isArray(response.tool_calls)) {
          toolCalls = response.tool_calls.map(tc => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: this.safeParseArguments(tc.function?.arguments)
          }));
        }
    }

    return toolCalls;
  }

  /**
   * Format tool results for provider
   * @param {Array} results - Tool execution results: [{ tool_call_id, result }]
   * @param {string} providerName - Target provider name
   * @returns {Array} Provider-formatted tool result messages
   */
  formatToolResultsForProvider(results, providerName) {
    if (!results || !Array.isArray(results)) return [];

    switch (providerName) {
      case 'anthropic':
        // Anthropic: { role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }
        return [{
          role: 'user',
          content: results.map(r => ({
            type: 'tool_result',
            tool_use_id: r.tool_call_id,
            content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
          }))
        }];

      case 'openai':
      case 'deepseek':
        // OpenAI/DeepSeek: { role: 'tool', tool_call_id, content }
        return results.map(r => ({
          role: 'tool',
          tool_call_id: r.tool_call_id,
          content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
        }));

      case 'groq':
      case 'ollama':
        // Groq/Ollama: same as OpenAI
        return results.map(r => ({
          role: 'tool',
          tool_call_id: r.tool_call_id,
          content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
        }));

      case 'gemini':
        // Gemini: functionResponse parts
        return results.map(r => ({
          role: 'tool',
          tool_call_id: r.tool_call_id,
          name: r.name,
          content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
        }));

      default:
        return results.map(r => ({
          role: 'tool',
          tool_call_id: r.tool_call_id,
          content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
        }));
    }
  }

  // ============ HELPER METHODS ============

  /**
   * Normalize tool name for lookup
   * Converts dots to underscores for provider tools
   * Example: "gmail.send" -> "gmail_send"
   *
   * @param {string} name - Tool name from AI response
   * @returns {string} Normalized tool name
   */
  normalizeToolName(name) {
    if (!name || typeof name !== 'string') return name;

    // First try exact match
    if (this.moduleLoader?.getTool(name)) {
      return name;
    }

    // Try converting dots to underscores (provider tool format)
    const normalized = name.replace(/\./g, '_');
    if (this.moduleLoader?.getTool(normalized)) {
      return normalized;
    }

    // Return original if no match found (will error later with proper message)
    return name;
  }

  /**
   * Chat with retry
   */
  async chatWithRetry(provider, messages, options) {
    return provider.withRetry(
      () => provider.chatCompletion(messages, options),
      options.retryConfig
    );
  }
}

module.exports = AIGatewayModule;
