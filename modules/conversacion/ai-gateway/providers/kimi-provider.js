const BaseProvider = require('./base-provider');

/**
 * Kimi (Moonshot) Provider
 *
 * https://platform.kimi.ai — API OpenAI-compatible servida desde
 * https://api.moonshot.ai/v1. Modelo flagship: kimi-k2.6 (256K context).
 *
 * Soporta tool calling estilo OpenAI. Los nombres de funcion deben matchear
 * `^[a-zA-Z0-9_-]+$`, por lo que los `tool.name` con puntos del catalogo
 * (`recetas.listar`) se traducen a underscore antes de enviar y se restauran
 * en la respuesta.
 *
 * Multimodal: kimi-k2.6 acepta content arrays con `image_url` y `video_url`
 * en el mismo shape que OpenAI, por lo que los mensajes en formato
 * multimodal pasan tal cual sin conversion del provider.
 */
class KimiProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'kimi';
  }

  async configure() {
    await this.refreshApiKey();

    if (!this.apiKey) {
      this.logger.warn('kimi.no-api-key', {
        message: 'No Kimi API key found (checked credential-manager and environment)'
      });
    }

    this.logger.info('kimi.initialized', {
      available: await this.isAvailable(),
      models: this.config.models
    });
  }

  refreshApiKeyFromEnv() {
    this.apiKey = process.env.KIMI_API_KEY
      || process.env.KIMI_API_KEY_GLOBAL
      || process.env.MOONSHOT_API_KEY
      || null;
  }

  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Kimi provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;

    const messagesText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    // Moonshot enforce: la familia kimi-k2.* (k2.6, k2.5, k2-thinking) solo
    // acepta temperature=1 y top_p=0.95. Los modelos legacy moonshot-v1-*
    // aceptan el rango 0-1 en ambos.
    const isK2Family = /^kimi-k2/i.test(model);
    const temperature = isK2Family ? 1 : (options.temperature ?? 0.7);
    const top_p = isK2Family ? 0.95 : (options.top_p ?? 1);

    const requestData = {
      model,
      messages,
      max_tokens: options.max_tokens || 2000,
      temperature,
      top_p,
      stream: false
    };

    if (options.tools && options.tools.length > 0) {
      requestData.tools = this.translateToolNames(options.tools);
      requestData.tool_choice = options.tool_choice || 'auto';
    }

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };

    this.logger.info('kimi.chat.request', {
      model,
      messageCount: messages.length,
      estimatedTokens,
      max_tokens: requestData.max_tokens
    });

    const response = await this.withRetry(
      () => this.makeRequest('POST', '/v1/chat/completions', requestData, headers),
      options.retryConfig || {}
    );

    const message = response.choices[0]?.message || {};
    const content = message.content || '';
    const toolCalls = message.tool_calls || null;
    const inputTokens = response.usage?.prompt_tokens || estimatedTokens;
    const outputTokens = response.usage?.completion_tokens || this.countTokens(content);
    const totalTokens = inputTokens + outputTokens;

    const result = {
      provider: this.name,
      model,
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens
      },
      cost: 0,
      finish_reason: response.choices[0]?.finish_reason || 'stop'
    };

    if (toolCalls && toolCalls.length > 0) {
      result.tool_calls = this.restoreToolNames(toolCalls);
      result._raw_tool_calls = toolCalls;
    }

    return result;
  }

  /**
   * Tool name translation: Moonshot/Kimi siguen el contrato OpenAI
   * `^[a-zA-Z0-9_-]+$`. Los `tool.name` del repo con puntos
   * (`recetas.listar`) no pasarian validacion. Se traducen a underscore
   * antes de enviar y se mantiene un mapa inverso para restaurarlos en
   * la respuesta. Identico al patron de deepseek-provider.
   */
  translateToolNames(tools) {
    this._toolNameMap = new Map();

    const seen = new Set();
    const result = [];

    for (const tool of tools) {
      let normalized;
      if (tool.type === 'function' && tool.function?.name) {
        normalized = tool;
      } else if (tool.function?.name) {
        normalized = { type: 'function', function: tool.function };
      } else if (tool.name) {
        normalized = {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || { type: 'object', properties: {}, required: [] }
          }
        };
      } else {
        if (this.logger) {
          this.logger.warn('kimi.tools.skipped_no_name', { tool: JSON.stringify(tool).slice(0, 200) });
        }
        continue;
      }

      const original = normalized.function.name;
      const sanitized = original.replace(/\./g, '_');

      if (seen.has(sanitized)) {
        if (this.logger) {
          this.logger.warn('kimi.tools.duplicate_after_sanitize', {
            original,
            sanitized,
            kept: this._toolNameMap.get(sanitized) || sanitized
          });
        }
        continue;
      }

      seen.add(sanitized);
      if (sanitized !== original) {
        this._toolNameMap.set(sanitized, original);
      }

      result.push({
        ...normalized,
        function: {
          ...normalized.function,
          name: sanitized
        }
      });
    }

    return result;
  }

  restoreToolNames(toolCalls) {
    const map = this._toolNameMap || new Map();
    return toolCalls.map(tc => ({
      ...tc,
      function: {
        ...tc.function,
        name: map.get(tc.function?.name) || tc.function?.name
      }
    }));
  }

  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Kimi provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;
    const messagesText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    const isK2Family = /^kimi-k2/i.test(model);
    const temperature = isK2Family ? 1 : (options.temperature ?? 0.7);
    const top_p = isK2Family ? 0.95 : (options.top_p ?? 1);

    const requestData = {
      model,
      messages,
      temperature,
      max_tokens: options.max_tokens || 2000,
      top_p,
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
        '/v1/chat/completions',
        requestData,
        headers,
        (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices[0]?.delta?.content || '';
                if (delta) {
                  fullContent += delta;
                  if (options.onChunk) options.onChunk(delta);
                }
              } catch (_) {
                // ignore parse errors for incomplete JSON
              }
            }
          }
        },
        () => {
          const outputTokens = this.countTokens(fullContent);
          resolve({
            provider: this.name,
            model,
            content: fullContent,
            usage: {
              input_tokens: estimatedTokens,
              output_tokens: outputTokens,
              total_tokens: estimatedTokens + outputTokens
            },
            cost: 0,
            finish_reason: 'stop'
          });
        },
        (error) => reject(error)
      );
    });
  }
}

module.exports = KimiProvider;
