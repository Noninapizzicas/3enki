
const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');
/**
 * AI Connector Module
 * Multi-provider AI integration using event-driven credential resolution
 *
 * Providers: Deepseek, OpenAI, Anthropic
 *
 * Follows event-driven architecture - NO HTTP internal calls
 */

class AIConnectorModule {
  constructor() {
    this.name = 'ai-connector';
    this.version = '2.0.0';

    // State
    this.pendingCredentialRequests = new Map(); // requestId -> { resolve, reject, timeout }
    this.pendingRequests = 0;

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Subscribe to events
    await this.subscribeToEvents();

    // Update metrics
    // REMOVED (migrate-to-event-metrics): this.metrics.gauge('ai.pending.requests', 0);
    // → Emit ai.connector.loaded event with pending: 0

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      default_provider: this.config.defaultProvider || 'deepseek',
      providers: Object.keys(this.config.providers || {})
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Clean up pending requests
    for (const [requestId, pending] of this.pendingCredentialRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Module unloading'));
    }
    this.pendingCredentialRequests.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe(
      EVENTS.AI.GENERATE_REQUEST,
      this.onGenerateRequest.bind(this)
    );

    await this.eventBus.subscribe(
      EVENTS.CREDENTIAL.RESOLVE_RESPONSE,
      this.onCredentialResponse.bind(this)
    );

    this.logger.info('events.subscribed', {
      events: [EVENTS.AI.GENERATE_REQUEST, EVENTS.CREDENTIAL.RESOLVE_RESPONSE]
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onGenerateRequest(event) {
    const {
      prompt,
      messages,
      provider,
      model,
      project_id,
      client_id,
      custom_id,
      temperature,
      max_tokens,
      request_id,
      correlation_id
    } = event.payload || event;

    this.logger.info('ai.generate.request.received', {
      provider: provider || this.config.defaultProvider,
      request_id,
      correlation_id
    });

    const startTime = Date.now();

    try {
      const result = await this.generateAI({
        prompt,
        messages,
        provider,
        model,
        projectId: project_id,
        clientId: client_id,
        customId: custom_id,
        temperature,
        maxTokens: max_tokens,
        correlationId: correlation_id
      });

      const duration = Date.now() - startTime;

      this.logger.info('ai.generate.request.success', {
        provider: result.provider,
        model: result.model,
        duration,
        correlation_id
      });

      await this.publishGenerateResponse(
        request_id,
        true,
        result.response,
        result.provider,
        result.model,
        result.usage,
        duration,
        null,
        correlation_id
      );
    } catch (error) {
      this.logger.error('ai.generate.request.error', {
        error: error.message,
        correlation_id
      });

      await this.publishGenerateResponse(
        request_id,
        false,
        null,
        provider || this.config.defaultProvider,
        model,
        null,
        Date.now() - startTime,
        error.message,
        correlation_id
      );
    }
  }

  onCredentialResponse(event) {
    const { request_id, success, api_key, error } = event.payload || event;

    const pending = this.pendingCredentialRequests.get(request_id);
    if (!pending) {
      this.logger.warn('credential.response.no_pending', { request_id });
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingCredentialRequests.delete(request_id);

    if (success) {
      pending.resolve(api_key);
    } else {
      pending.reject(new Error(error || 'Credential resolution failed'));
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleGenerate(req, context) {
    const startTime = Date.now();

    this.logger.info('ai.generate.start', {
      correlation_id: context.correlationId
    });

    this.pendingRequests++;
    // REMOVED (migrate-to-event-metrics): this.metrics.gauge('ai.pending.requests', this.pendingRequests);
    // → Add `pending: this.pendingRequests` to next event

    try {
      const {
        prompt,
        messages,
        provider,
        model,
        project_id,
        client_id,
        custom_id,
        temperature,
        max_tokens
      } = context.body;

      const result = await this.generateAI({
        prompt,
        messages,
        provider,
        model,
        projectId: project_id,
        clientId: client_id,
        customId: custom_id,
        temperature,
        maxTokens: max_tokens,
        correlationId: context.correlationId
      });

      const duration = Date.now() - startTime;

      // Metrics
      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('ai.request.total');
    // → Counter extracted from events
    // → Counter extracted from ai.request.* events
      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('ai.request.success');
    // → Counter extracted from events
    // → Use success: true in event
      // REMOVED (migrate-to-event-metrics): this.metrics.increment(`ai.request.${result.provider}`);
    // → Counter extracted from events
      // REMOVED (migrate-to-event-metrics): this.metrics.timing('ai.request.duration', duration);
    // → Add duration_ms to ai.request.completed event

      // Publish event
      await this.eventBus.publish('ai.response.generated', {
        provider: result.provider,
        model: result.model,
        duration,
        tokens_used: result.usage?.total_tokens || 0,
        prompt_length: prompt.length,
        response_length: result.response.length
      }, { correlationId: context.correlationId });

      this.logger.info('ai.generated', {
        provider: result.provider,
        model: result.model,
        duration,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          response: result.response,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          duration
        }
      };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('ai.request.total');
    // → Counter extracted from events
    // → Counter extracted from ai.request.* events
      // REMOVED (migrate-to-event-metrics): // REMOVED (migrate-to-event-metrics): this.metrics.increment('ai.request.failed');
    // → Counter extracted from events
    // → Use success: false in event

      const provider = context.body.provider || this.config.defaultProvider;

      await this.eventBus.publish('ai.response.failed', {
        provider,
        model: context.body.model || this.config.providers?.[provider]?.model,
        error: error.message,
        error_code: error.code || 'UNKNOWN'
      }, { correlationId: context.correlationId });

      this.logger.error('ai.generate.error', {
        provider,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'AI generation failed',
          message: error.message,
          provider
        }
      };
    } finally {
      this.pendingRequests--;
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('ai.pending.requests', this.pendingRequests);
    // → Add `pending: this.pendingRequests` to next event
    }
  }

  async handleListProviders(req, context) {
    const providers = Object.entries(this.config.providers || {}).map(([name, config]) => ({
      name,
      model: config.model,
      endpoint: config.endpoint,
      credential_provider: config.credentialProvider
    }));

    this.logger.info('ai.providers.listed', {
      count: providers.length,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: {
        success: true,
        providers,
        default_provider: this.config.defaultProvider,
        total: providers.length
      }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        default_provider: this.config.defaultProvider,
        pending_requests: this.pendingRequests
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'ai.request.total': this.metrics.getCounter('ai.request.total') || 0,
          'ai.request.success': this.metrics.getCounter('ai.request.success') || 0,
          'ai.request.failed': this.metrics.getCounter('ai.request.failed') || 0
        },
        gauges: {
          'ai.pending.requests': this.pendingRequests
        }
      }
    };
  }

  // ==========================================
  // Core Logic
  // ==========================================

  async generateAI({
    prompt,
    messages,
    provider,
    model,
    projectId,
    clientId,
    customId,
    temperature = 0.7,
    maxTokens = 2000,
    correlationId
  }) {
    const selectedProvider = provider || this.config.defaultProvider || 'deepseek';
    const providerConfig = this.config.providers?.[selectedProvider];

    if (!providerConfig) {
      throw new Error(`Unknown provider: ${selectedProvider}`);
    }

    const selectedModel = model || providerConfig.model;

    // Get API key via event-driven credential resolution
    const credStartTime = Date.now();
    const apiKey = await this.resolveCredential(
      providerConfig.credentialProvider,
      { projectId, clientId, customId },
      correlationId
    );
    // REMOVED: this.metrics.timing('ai.credential.resolve.duration', Date.now() - credStartTime);

    // Build messages array
    const chatMessages = messages || [{ role: 'user', content: prompt }];

    // Call provider API
    const response = await this.callProviderAPI(
      selectedProvider,
      providerConfig,
      selectedModel,
      apiKey,
      chatMessages,
      temperature,
      maxTokens
    );

    return {
      response: response.content,
      provider: selectedProvider,
      model: selectedModel,
      usage: response.usage
    };
  }

  async resolveCredential(credentialProvider, { projectId, clientId, customId }, correlationId) {
    const requestId = `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const credentialPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCredentialRequests.delete(requestId);
        reject(new Error('Credential resolution timeout'));
      }, 5000);

      this.pendingCredentialRequests.set(requestId, { resolve, reject, timeout });
    });

    // Publish credential request
    await this.eventBus.publish(EVENTS.CREDENTIAL.RESOLVE_REQUEST, {
      provider: credentialProvider,
      project_id: projectId,
      client_id: clientId,
      custom_id: customId,
      request_id: requestId,
      correlation_id: correlationId
    });

    return await credentialPromise;
  }

  async callProviderAPI(provider, config, model, apiKey, messages, temperature, maxTokens) {
    const timeout = this.config.timeout || 30000;

    if (provider === 'anthropic') {
      return await this.callAnthropic(config.endpoint, apiKey, model, messages, temperature, maxTokens, timeout);
    } else {
      // OpenAI-compatible (Deepseek, OpenAI)
      return await this.callOpenAICompatible(config.endpoint, apiKey, model, messages, temperature, maxTokens, timeout);
    }
  }

  async callOpenAICompatible(endpoint, apiKey, model, messages, temperature, maxTokens, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API error ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();

      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage || {}
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async callAnthropic(endpoint, apiKey, model, messages, temperature, maxTokens, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Convert to Anthropic format
    let systemPrompt = '';
    const anthropicMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      }
    }

    try {
      const body = {
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API error ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();

      return {
        content: data.content?.[0]?.text || '',
        usage: {
          prompt_tokens: data.usage?.input_tokens || 0,
          completion_tokens: data.usage?.output_tokens || 0,
          total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        }
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishGenerateResponse(requestId, success, response, provider, model, usage, duration, error, correlationId) {
    await this.eventBus.publish(EVENTS.AI.GENERATE_RESPONSE, {
      request_id: requestId,
      success,
      response,
      provider,
      model,
      usage,
      duration,
      error
    }, { correlationId });
  }
}

module.exports = AIConnectorModule;
