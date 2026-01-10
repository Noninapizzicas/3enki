const BaseProvider = require('./base-provider');

/**
 * DeepSeek Provider
 *
 * Implementación del proveedor DeepSeek (https://api.deepseek.com)
 * Priority: 1 (primera opción por costo/performance)
 */
class DeepSeekProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'deepseek';
  }

  /**
   * Initialize
   */
  async initialize() {
    await this.refreshApiKey();

    if (!this.apiKey) {
      this.logger.warn('deepseek.no-api-key', {
        message: 'No DeepSeek API key found (checked credential-manager and environment)'
      });
    }

    this.logger.info('deepseek.initialized', {
      available: await this.isAvailable(),
      models: this.config.models
    });
  }

  /**
   * Refresh API key from environment (fallback when credential resolver unavailable)
   */
  refreshApiKeyFromEnv() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY_GLOBAL || null;
  }

  /**
   * Check if messages contain images (vision content)
   */
  hasVisionContent(messages) {
    return messages.some(m =>
      m.image_base64 ||
      (Array.isArray(m.content) && m.content.some(c => c.type === 'image_url' || c.type === 'image'))
    );
  }

  /**
   * Convert messages to DeepSeek VL format with vision support
   * DeepSeek VL uses OpenAI-compatible format for images
   */
  convertMessagesForVision(messages) {
    return messages.map(m => {
      // Check if message has image_base64 field (our internal format)
      if (m.image_base64) {
        const mediaType = m.image_type || 'image/jpeg';
        const imageUrl = `data:${mediaType};base64,${m.image_base64}`;

        const content = [
          {
            type: 'image_url',
            image_url: { url: imageUrl }
          }
        ];

        // Add text content if present
        if (m.content && typeof m.content === 'string') {
          content.push({ type: 'text', text: m.content });
        }

        return { role: m.role, content };
      }

      // Handle array content format (already in correct format)
      if (Array.isArray(m.content)) {
        return m;
      }

      // Standard text message
      return m;
    });
  }

  /**
   * Chat completion
   */
  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('DeepSeek provider not available (check API key)');
    }

    // Check for vision content and select appropriate model
    const hasImages = this.hasVisionContent(messages);
    // Use deepseek-vl-7b-chat for vision, or specified model, or default
    const model = options.model || (hasImages ? 'deepseek-chat' : this.config.default_model);

    // Convert messages for vision if needed
    const processedMessages = hasImages ? this.convertMessagesForVision(messages) : messages;

    // Estimate tokens for rate limiting (add extra for images)
    const messagesText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const estimatedTokens = this.countTokens(messagesText) + (hasImages ? 1000 : 0);

    // Check rate limit
    const rateLimitCheck = this.checkRateLimit(estimatedTokens);
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
    }

    // Build request
    const requestData = {
      model,
      messages: processedMessages,
      temperature: options.temperature || (hasImages ? 0.3 : 0.7), // Lower temp for vision
      max_tokens: options.max_tokens || (hasImages ? 4000 : 2000), // More tokens for menu extraction
      top_p: options.top_p || 1,
      stream: false
    };

    // Add tools if provided (DeepSeek supports OpenAI function calling format)
    // DeepSeek only accepts [a-zA-Z0-9_-] in tool names, so transform dots to underscores
    if (options.tools && options.tools.length > 0) {
      requestData.tools = this.translateToolNames(options.tools);
      requestData.tool_choice = options.tool_choice || 'auto';
    }

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };

    // Make request with retry
    const response = await this.withRetry(
      () => this.makeRequest('POST', '/chat/completions', requestData, headers),
      options.retryConfig || {}
    );

    // Extract response
    const message = response.choices[0]?.message || {};
    const content = message.content || '';
    const toolCalls = message.tool_calls || null;  // Extract tool_calls if present
    const inputTokens = response.usage?.prompt_tokens || estimatedTokens;
    const outputTokens = response.usage?.completion_tokens || this.countTokens(content);
    const totalTokens = inputTokens + outputTokens;

    // Record usage
    this.recordUsage(totalTokens);

    // Calculate cost
    const cost = this.calculateCost(inputTokens, outputTokens);

    const result = {
      provider: this.name,
      model,
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens
      },
      cost,
      finish_reason: response.choices[0]?.finish_reason || 'stop'
    };

    // Include tool_calls if present (transform names back: underscore → dot)
    if (toolCalls && toolCalls.length > 0) {
      result.tool_calls = this.restoreToolNames(toolCalls);
    }

    return result;
  }

  /**
   * Transform tool names for DeepSeek API (dot → underscore)
   * DeepSeek only accepts pattern: ^[a-zA-Z0-9_-]+$
   */
  translateToolNames(tools) {
    return tools.map(tool => {
      if (tool.type === 'function' && tool.function?.name) {
        return {
          ...tool,
          function: {
            ...tool.function,
            name: tool.function.name.replace(/\./g, '_')
          }
        };
      }
      return tool;
    });
  }

  /**
   * Restore tool names from DeepSeek response (underscore → dot)
   */
  restoreToolNames(toolCalls) {
    return toolCalls.map(tc => ({
      ...tc,
      function: {
        ...tc.function,
        name: tc.function?.name?.replace(/_/g, '.') || tc.function?.name
      }
    }));
  }

  /**
   * Chat completion (streaming)
   */
  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('DeepSeek provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;

    // Estimate tokens for rate limiting
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
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
      top_p: options.top_p || 1,
      stream: true
    };

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };

    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';

      this.makeStreamRequest(
        'POST',
        '/chat/completions',
        requestData,
        headers,
        (chunk) => {
          buffer += chunk.toString();

          // Process SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();

              if (data === '[DONE]') {
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices[0]?.delta?.content || '';

                if (delta) {
                  fullContent += delta;

                  // Call onChunk callback if provided
                  if (options.onChunk) {
                    options.onChunk(delta);
                  }
                }
              } catch (error) {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
        },
        () => {
          // Stream ended
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

module.exports = DeepSeekProvider;
