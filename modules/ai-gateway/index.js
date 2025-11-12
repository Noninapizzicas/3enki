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
   */
  async chatCompletion(req, res) {
    try {
      const { messages, provider: requestedProvider, model, temperature, max_tokens, top_p, metadata } = req.body;

      const startTime = Date.now();

      // Determine provider
      let result;
      let providerName;

      if (requestedProvider && requestedProvider !== 'auto') {
        // Use specific provider
        const provider = this.providers.get(requestedProvider);

        if (!provider) {
          return res.status(400).json({
            error: 'PROVIDER_NOT_FOUND',
            message: `Provider '${requestedProvider}' not found or not enabled`
          });
        }

        if (!await provider.isAvailable()) {
          return res.status(503).json({
            error: 'PROVIDER_NOT_AVAILABLE',
            message: `Provider '${requestedProvider}' not available`
          });
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
          return res.status(503).json({
            error: 'NO_PROVIDERS_AVAILABLE',
            message: 'No AI providers available'
          });
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
          return res.status(503).json({
            error: 'ALL_PROVIDERS_FAILED',
            message: `All providers failed. Last error: ${lastError?.message}`
          });
        }
      }

      const latencyMs = Date.now() - startTime;

      // Record usage
      const usage = this.usage.get(providerName);
      if (usage) {
        usage.requests++;
        usage.tokens += result.usage.total_tokens;
        usage.cost += result.cost;
      }

      // Publish completion event
      if (this.config.analytics?.enabled) {
        this.eventBus.publish('ai.completion.completed', {
          provider: providerName,
          model: result.model,
          prompt_id: metadata?.prompt_id,
          tokens_used: result.usage.total_tokens,
          latency_ms: latencyMs,
          cost: result.cost,
          metadata
        });
      }

      return res.status(200).json({
        ...result,
        latency_ms: latencyMs,
        metadata
      });
    } catch (error) {
      this.logger.error('ai-gateway.chat.error', { error: error.message });
      return res.status(500).json({
        error: 'CHAT_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Chat Completion Stream
   */
  async chatCompletionStream(req, res) {
    try {
      const { messages, provider: requestedProvider, model, temperature, max_tokens, top_p, metadata } = req.body;

      // Determine provider
      let provider;
      let providerName;

      if (requestedProvider && requestedProvider !== 'auto') {
        provider = this.providers.get(requestedProvider);

        if (!provider) {
          return res.status(400).json({
            error: 'PROVIDER_NOT_FOUND',
            message: `Provider '${requestedProvider}' not found`
          });
        }

        if (!await provider.isAvailable()) {
          return res.status(503).json({
            error: 'PROVIDER_NOT_AVAILABLE',
            message: `Provider '${requestedProvider}' not available`
          });
        }

        providerName = requestedProvider;
      } else {
        // Use first available provider
        const providers = await this.getProvidersByPriority();

        if (providers.length === 0) {
          return res.status(503).json({
            error: 'NO_PROVIDERS_AVAILABLE',
            message: 'No AI providers available'
          });
        }

        providerName = providers[0].name;
        provider = providers[0].provider;
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const startTime = Date.now();

      // Stream chat completion
      const result = await provider.chatCompletionStream(messages, {
        model,
        temperature,
        max_tokens,
        top_p,
        onChunk: (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }
      });

      const latencyMs = Date.now() - startTime;

      // Send final message
      res.write(`data: ${JSON.stringify({
        type: 'done',
        provider: providerName,
        model: result.model,
        usage: result.usage,
        cost: result.cost,
        latency_ms: latencyMs
      })}\n\n`);

      res.end();

      // Record usage
      const usage = this.usage.get(providerName);
      if (usage) {
        usage.requests++;
        usage.tokens += result.usage.total_tokens;
        usage.cost += result.cost;
      }

      // Publish event
      if (this.config.analytics?.enabled) {
        this.eventBus.publish('ai.completion.completed', {
          provider: providerName,
          model: result.model,
          prompt_id: metadata?.prompt_id,
          tokens_used: result.usage.total_tokens,
          latency_ms: latencyMs,
          cost: result.cost,
          stream: true,
          metadata
        });
      }
    } catch (error) {
      this.logger.error('ai-gateway.stream.error', { error: error.message });

      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);

      res.end();
    }
  }

  /**
   * API Handler: List Providers
   */
  async listProviders(req, res) {
    try {
      const providers = [];

      for (const [name, provider] of this.providers.entries()) {
        const available = await provider.isAvailable();
        const usage = this.usage.get(name);

        providers.push({
          name,
          priority: this.config.providers[name].priority,
          available,
          models: this.config.providers[name].models,
          default_model: this.config.providers[name].default_model,
          rate_limit: this.config.providers[name].rate_limit,
          cost_per_1k_tokens: this.config.providers[name].cost_per_1k_tokens,
          usage: usage || { requests: 0, tokens: 0, cost: 0, errors: 0 }
        });
      }

      // Sort by priority
      providers.sort((a, b) => a.priority - b.priority);

      return res.status(200).json({ providers });
    } catch (error) {
      this.logger.error('ai-gateway.list-providers.error', { error: error.message });
      return res.status(500).json({
        error: 'LIST_PROVIDERS_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: List Models
   */
  async listModels(req, res) {
    try {
      const { provider: providerName } = req.query;
      const models = [];

      if (providerName) {
        const providerConfig = this.config.providers[providerName];
        if (providerConfig) {
          for (const model of providerConfig.models) {
            models.push({
              provider: providerName,
              model,
              default: model === providerConfig.default_model
            });
          }
        }
      } else {
        // All models from all providers
        for (const [name, config] of Object.entries(this.config.providers)) {
          if (config.enabled) {
            for (const model of config.models) {
              models.push({
                provider: name,
                model,
                default: model === config.default_model
              });
            }
          }
        }
      }

      return res.status(200).json({ models, total: models.length });
    } catch (error) {
      this.logger.error('ai-gateway.list-models.error', { error: error.message });
      return res.status(500).json({
        error: 'LIST_MODELS_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Get Usage
   */
  async getUsage(req, res) {
    try {
      const { provider: providerName, days } = req.query;

      const usageData = [];

      if (providerName) {
        const usage = this.usage.get(providerName);
        if (usage) {
          usageData.push({
            provider: providerName,
            ...usage
          });
        }
      } else {
        // All providers
        for (const [name, usage] of this.usage.entries()) {
          usageData.push({
            provider: name,
            ...usage
          });
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

      return res.status(200).json({
        usage: usageData,
        totals
      });
    } catch (error) {
      this.logger.error('ai-gateway.usage.error', { error: error.message });
      return res.status(500).json({
        error: 'GET_USAGE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * API Handler: Test Provider
   */
  async testProvider(req, res) {
    try {
      const { provider: providerName } = req.body;

      const provider = this.providers.get(providerName);

      if (!provider) {
        return res.status(404).json({
          error: 'PROVIDER_NOT_FOUND',
          message: `Provider '${providerName}' not found`
        });
      }

      const available = await provider.isAvailable();

      if (!available) {
        return res.status(503).json({
          provider: providerName,
          available: false,
          message: 'Provider not available (check API key)'
        });
      }

      // Test with simple message
      const testMessages = [
        { role: 'user', content: 'Say "OK" if you can receive this message' }
      ];

      const startTime = Date.now();

      const result = await provider.chatCompletion(testMessages, {
        max_tokens: 10
      });

      const latencyMs = Date.now() - startTime;

      return res.status(200).json({
        provider: providerName,
        available: true,
        latency_ms: latencyMs,
        response_preview: result.content.slice(0, 50),
        model: result.model
      });
    } catch (error) {
      this.logger.error('ai-gateway.test.error', { error: error.message });
      return res.status(500).json({
        error: 'TEST_FAILED',
        message: error.message
      });
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
