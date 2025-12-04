const BaseProvider = require('./base-provider');

/**
 * Anthropic Provider
 *
 * Implementación del proveedor Anthropic Claude (https://api.anthropic.com)
 * Priority: 2
 */
class AnthropicProvider extends BaseProvider {
  constructor(config, logger) {
    super(config, logger);
    this.name = 'anthropic';
    this.apiVersion = '2023-06-01';
  }

  /**
   * Initialize
   */
  async initialize() {
    // Get API key from environment (support both formats)
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_GLOBAL || null;

    if (!this.apiKey) {
      this.logger.warn('anthropic.no-api-key', {
        message: 'ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_GLOBAL not found in environment'
      });
    }

    this.logger.info('anthropic.initialized', {
      available: await this.isAvailable(),
      models: this.config.models
    });
  }

  /**
   * Convert OpenAI format messages to Anthropic format
   */
  convertMessages(messages) {
    const systemMessages = messages.filter(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const system = systemMessages.map(m => m.content).join('\n');

    const anthropicMessages = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    return { system, messages: anthropicMessages };
  }

  /**
   * Chat completion
   */
  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Anthropic provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;

    // Convert messages
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    // Estimate tokens
    const messagesText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    // Check rate limit
    const rateLimitCheck = this.checkRateLimit(estimatedTokens);
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
    }

    // Build request
    const requestData = {
      model,
      messages: anthropicMessages,
      max_tokens: options.max_tokens || 2000,
      temperature: options.temperature || 0.7,
      top_p: options.top_p || 1,
      stream: false
    };

    if (system) {
      requestData.system = system;
    }

    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion
    };

    // Make request with retry
    const response = await this.withRetry(
      () => this.makeRequest('POST', '/messages', requestData, headers),
      options.retryConfig || {}
    );

    // Extract response
    const content = response.content[0]?.text || '';
    const inputTokens = response.usage?.input_tokens || estimatedTokens;
    const outputTokens = response.usage?.output_tokens || this.countTokens(content);
    const totalTokens = inputTokens + outputTokens;

    // Record usage
    this.recordUsage(totalTokens);

    // Calculate cost
    const cost = this.calculateCost(inputTokens, outputTokens);

    return {
      provider: this.name,
      model,
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens
      },
      cost,
      finish_reason: response.stop_reason || 'stop'
    };
  }

  /**
   * Chat completion (streaming)
   */
  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Anthropic provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;

    // Convert messages
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    // Estimate tokens
    const messagesText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    // Check rate limit
    const rateLimitCheck = this.checkRateLimit(estimatedTokens);
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
    }

    // Build request
    const requestData = {
      model,
      messages: anthropicMessages,
      max_tokens: options.max_tokens || 2000,
      temperature: options.temperature || 0.7,
      top_p: options.top_p || 1,
      stream: true
    };

    if (system) {
      requestData.system = system;
    }

    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion
    };

    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';

      this.makeStreamRequest(
        'POST',
        '/messages',
        requestData,
        headers,
        (chunk) => {
          buffer += chunk.toString();

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'content_block_delta') {
                  const delta = parsed.delta?.text || '';

                  if (delta) {
                    fullContent += delta;

                    if (options.onChunk) {
                      options.onChunk(delta);
                    }
                  }
                }
              } catch (error) {
                // Ignore parse errors
              }
            }
          }
        },
        () => {
          const outputTokens = this.countTokens(fullContent);
          const totalTokens = estimatedTokens + outputTokens;

          this.recordUsage(totalTokens);

          const cost = this.calculateCost(estimatedTokens, outputTokens);

          resolve({
            provider: this.name,
            model,
            content: fullContent,
            usage: {
              input_tokens: estimatedTokens,
              output_tokens: outputTokens,
              total_tokens: totalTokens
            },
            cost,
            finish_reason: 'stop'
          });
        },
        (error) => {
          reject(error);
        }
      );
    });
  }
}

module.exports = AnthropicProvider;
