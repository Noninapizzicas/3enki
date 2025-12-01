const DeepSeekProvider = require('./providers/deepseek-provider');
const AnthropicProvider = require('./providers/anthropic-provider');
const OpenAIProvider = require('./providers/openai-provider');
const OllamaProvider = require('./providers/ollama-provider');

/**
 * AI Gateway Module
 *
 * Cliente unificado para múltiples proveedores LLM con:
 * - Rate limiting
 * - Retry con exponential backoff
 * - Streaming SSE
 * - Cost tracking
 * - Fallback automático entre proveedores
 */
class AIGatewayModule {
  constructor() {
    this.providers = new Map();
    this.usage = new Map(); // Track usage per provider
    this.config = null;
    this.logger = null;
    this.eventBus = null;
  }

  /**
   * Module lifecycle: onLoad
   */
  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    // Initialize providers
    await this.initializeProviders();

    this.logger.info('ai-gateway.loaded', {
      providers_count: this.providers.size,
      providers_available: this.getAvailableProviderNames()
    });
  }

  /**
   * Module lifecycle: onUnload
   */
  async onUnload() {
    this.logger.info('ai-gateway.unloaded', {
      total_requests: Array.from(this.usage.values()).reduce((sum, u) => sum + u.requests, 0),
      total_cost: Array.from(this.usage.values()).reduce((sum, u) => sum + u.cost, 0)
    });
  }

  /**
   * Initialize all providers
   */
  async initializeProviders() {
    const providerClasses = {
      deepseek: DeepSeekProvider,
      anthropic: AnthropicProvider,
      openai: OpenAIProvider,
      ollama: OllamaProvider
    };

    for (const [name, ProviderClass] of Object.entries(providerClasses)) {
      const providerConfig = this.config.providers?.[name];

      if (providerConfig && providerConfig.enabled) {
        const provider = new ProviderClass(providerConfig, this.logger);
        await provider.initialize();

        this.providers.set(name, provider);

        // Initialize usage tracking
        this.usage.set(name, {
          requests: 0,
          tokens: 0,
          cost: 0,
          errors: 0
        });
      }
    }
  }

  /**
   * Get available provider names
   */
  getAvailableProviderNames() {
    return Array.from(this.providers.entries())
      .filter(async ([_, provider]) => await provider.isAvailable())
      .map(([name, _]) => name);
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
   */
  async handleChatCompletion(req, context) {
    try {
      const { messages, provider: requestedProvider, model, temperature, max_tokens, top_p, metadata } = req.body || {};

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return {
          status: 400,
          data: { error: 'INVALID_REQUEST', message: 'messages array is required' }
        };
      }

      const startTime = Date.now();

      // Determine provider
      let result;
      let providerName;

      if (requestedProvider && requestedProvider !== 'auto') {
        // Use specific provider
        const provider = this.providers.get(requestedProvider);

        if (!provider) {
          return {
            status: 400,
            data: { error: 'PROVIDER_NOT_FOUND', message: `Provider '${requestedProvider}' not found or not enabled` }
          };
        }

        if (!await provider.isAvailable()) {
          return {
            status: 503,
            data: { error: 'PROVIDER_NOT_AVAILABLE', message: `Provider '${requestedProvider}' not available` }
          };
        }

        providerName = requestedProvider;
        result = await this.chatWithRetry(provider, messages, {
          model,
          temperature,
          max_tokens,
          top_p,
          retryConfig: this.config.retry
        });
      } else {
        // Auto fallback
        const providers = await this.getProvidersByPriority();

        if (providers.length === 0) {
          return {
            status: 503,
            data: { error: 'NO_PROVIDERS_AVAILABLE', message: 'No AI providers available. Check your API keys in credentials.' }
          };
        }

        // Try providers in order of priority
        let lastError;

        for (const { name, provider } of providers) {
          try {
            providerName = name;
            result = await this.chatWithRetry(provider, messages, {
              model,
              temperature,
              max_tokens,
              top_p,
              retryConfig: this.config.retry
            });

            break; // Success, exit loop
          } catch (error) {
            this.logger.warn('ai-gateway.provider.failed', {
              provider: name,
              error: error.message
            });

            lastError = error;

            // Record error
            const usage = this.usage.get(name);
            if (usage) {
              usage.errors++;
            }

            // Continue to next provider
          }
        }

        if (!result) {
          return {
            status: 503,
            data: { error: 'ALL_PROVIDERS_FAILED', message: `All providers failed. Last error: ${lastError?.message}` }
          };
        }
      }

      const latencyMs = Date.now() - startTime;

      // Record usage
      const usage = this.usage.get(providerName);
      if (usage) {
        usage.requests++;
        usage.tokens += result.usage?.total_tokens || 0;
        usage.cost += result.cost || 0;
      }

      // Publish completion event
      if (this.config.analytics?.enabled && this.eventBus) {
        this.eventBus.publish('ai.completion.completed', {
          provider: providerName,
          model: result.model,
          prompt_id: metadata?.prompt_id,
          tokens_used: result.usage?.total_tokens || 0,
          latency_ms: latencyMs,
          cost: result.cost || 0,
          metadata
        });
      }

      return {
        status: 200,
        data: {
          ...result,
          latency_ms: latencyMs,
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

  /**
   * API Handler: Chat Completion Stream (SSE)
   * Note: Streaming requires special handling
   */
  async handleChatStream(req, context) {
    // For now, return error - streaming needs special HTTP handling
    return {
      status: 501,
      data: { error: 'NOT_IMPLEMENTED', message: 'Streaming requires SSE, use /chat for now' }
    };
  }

  /**
   * API Handler: List Providers
   */
  async handleListProviders(req, context) {
    try {
      const providers = [];

      for (const [name, provider] of this.providers.entries()) {
        const available = await provider.isAvailable();
        const usage = this.usage.get(name);

        providers.push({
          name,
          priority: this.config.providers?.[name]?.priority || 99,
          available,
          models: this.config.providers?.[name]?.models || [],
          default_model: this.config.providers?.[name]?.default_model,
          usage: usage || { requests: 0, tokens: 0, cost: 0, errors: 0 }
        });
      }

      // Sort by priority
      providers.sort((a, b) => a.priority - b.priority);

      return { status: 200, data: { providers } };
    } catch (error) {
      this.logger.error('ai-gateway.list-providers.error', { error: error.message });
      return { status: 500, data: { error: 'LIST_PROVIDERS_FAILED', message: error.message } };
    }
  }

  /**
   * API Handler: List Models
   */
  async handleListModels(req, context) {
    try {
      const { provider: providerName } = req.query || {};
      const models = [];

      if (providerName) {
        const providerConfig = this.config.providers?.[providerName];
        if (providerConfig) {
          for (const model of providerConfig.models || []) {
            models.push({
              provider: providerName,
              model,
              default: model === providerConfig.default_model
            });
          }
        }
      } else {
        // All models from all providers
        for (const [name, config] of Object.entries(this.config.providers || {})) {
          if (config.enabled) {
            for (const model of config.models || []) {
              models.push({
                provider: name,
                model,
                default: model === config.default_model
              });
            }
          }
        }
      }

      return { status: 200, data: { models, total: models.length } };
    } catch (error) {
      this.logger.error('ai-gateway.list-models.error', { error: error.message });
      return { status: 500, data: { error: 'LIST_MODELS_FAILED', message: error.message } };
    }
  }

  /**
   * API Handler: Get Usage
   */
  async handleGetUsage(req, context) {
    try {
      const { provider: providerName } = req.query || {};

      const usageData = [];

      if (providerName) {
        const usage = this.usage.get(providerName);
        if (usage) {
          usageData.push({ provider: providerName, ...usage });
        }
      } else {
        // All providers
        for (const [name, usage] of this.usage.entries()) {
          usageData.push({ provider: name, ...usage });
        }
      }

      // Calculate totals
      const totals = usageData.reduce(
        (acc, u) => ({
          requests: acc.requests + u.requests,
          tokens: acc.tokens + u.tokens,
          cost: acc.cost + u.cost,
          errors: acc.errors + u.errors
        }),
        { requests: 0, tokens: 0, cost: 0, errors: 0 }
      );

      return { status: 200, data: { usage: usageData, totals } };
    } catch (error) {
      this.logger.error('ai-gateway.usage.error', { error: error.message });
      return { status: 500, data: { error: 'GET_USAGE_FAILED', message: error.message } };
    }
  }

  /**
   * API Handler: Test Provider
   */
  async handleTestProvider(req, context) {
    try {
      const { provider: providerName } = req.body || {};

      if (!providerName) {
        return { status: 400, data: { error: 'INVALID_REQUEST', message: 'provider is required' } };
      }

      const provider = this.providers.get(providerName);

      if (!provider) {
        return { status: 404, data: { error: 'PROVIDER_NOT_FOUND', message: `Provider '${providerName}' not found` } };
      }

      const available = await provider.isAvailable();

      if (!available) {
        return {
          status: 503,
          data: { provider: providerName, available: false, message: 'Provider not available (check API key)' }
        };
      }

      // Test with simple message
      const testMessages = [
        { role: 'user', content: 'Say "OK" if you can receive this message' }
      ];

      const startTime = Date.now();

      const result = await provider.chatCompletion(testMessages, { max_tokens: 10 });

      const latencyMs = Date.now() - startTime;

      return {
        status: 200,
        data: {
          provider: providerName,
          available: true,
          latency_ms: latencyMs,
          response_preview: result.content?.slice(0, 50),
          model: result.model
        }
      };
    } catch (error) {
      this.logger.error('ai-gateway.test.error', { error: error.message });
      return { status: 500, data: { error: 'TEST_FAILED', message: error.message } };
    }
  }

  // ============ HELPER METHODS ============

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
