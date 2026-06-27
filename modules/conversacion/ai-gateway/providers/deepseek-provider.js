const BaseProvider = require('./base-provider');

/**
 * DeepSeek Provider
 *
 * Implementación del proveedor DeepSeek (https://api.deepseek.com)
 * Priority: configurada en module.json (hoy 8). El tool-use es completo y correcto
 *   (correlaciona por tool_call_id, formato OpenAI) — la promoción es decisión de operación.
 *
 * Modelos vivos:
 * - deepseek-v4-flash: modelo estándar (no-thinking). default_model.
 * - deepseek-v4-pro:   más capaz.
 * - deepseek-reasoner: modo razonamiento (chain-of-thought visible).
 *   Activar con options.reasoning = true o model = 'deepseek-reasoner'.
 *
 * MIGRACIÓN (DeepSeek discontinúa los nombres legacy el 2026-07-24 15:59 UTC):
 *   deepseek-chat  = v4-flash modo NO-thinking  -> se normaliza a default_model (resolveModel).
 *   deepseek-coder = retirado                    -> se normaliza a default_model.
 *   deepseek-reasoner sigue siendo el único camino thinking documentado hoy; se conserva
 *   hasta que la doc del v4-flash exponga el parámetro de thinking en el body.
 */
class DeepSeekProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'deepseek';
  }

  /**
   * Initialize
   */
  async configure() {
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

        // DeepSeek V3: texto PRIMERO, imagen DESPUÉS
        const content = [];

        if (m.content && typeof m.content === 'string') {
          content.push({ type: 'text', text: m.content });
        }

        content.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });

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
   * Resuelve el nombre de modelo a enviar a la API, normalizando los nombres legacy.
   *
   * DeepSeek discontinúa `deepseek-chat` y `deepseek-coder` el 2026-07-24. Una conversación
   * con uno de esos nombres GUARDADO no debe caerse: lo mapeamos al modelo vivo (default_model,
   * = v4-flash modo no-thinking, que es lo que `deepseek-chat` era). El razonamiento sigue por
   * `deepseek-reasoner` mientras viva (único camino thinking documentado hoy).
   *
   * @param {{model?: string, reasoning?: boolean}} options
   * @returns {string} nombre de modelo vivo
   */
  resolveModel(options = {}) {
    let requested = options.model;
    // Legacy -> vivo (no-thinking). Cae a default_model.
    if (requested === 'deepseek-chat' || requested === 'deepseek-coder') {
      requested = null;
    }
    // Razonamiento explícito sin modelo concreto.
    if (!requested && options.reasoning === true) {
      return 'deepseek-reasoner';
    }
    return requested || this.config.default_model;
  }

  /**
   * Chat completion
   */
  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('DeepSeek provider not available (check API key)');
    }

    // Check for vision content (afecta max_tokens/temperature, no la selección de modelo:
    // v4-flash unifica texto y visión, antes ambos caían a deepseek-chat)
    const hasImages = this.hasVisionContent(messages);
    // Resuelve el modelo normalizando nombres legacy (deepseek-chat/coder -> v4-flash)
    const model = this.resolveModel(options);
    const useReasoning = model === 'deepseek-reasoner';

    // Convert messages for vision if needed
    const processedMessages = hasImages ? this.convertMessagesForVision(messages) : messages;

    // Estimate input tokens for logging/cost
    const messagesText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const estimatedTokens = this.countTokens(messagesText) + (hasImages ? 1000 : 0);

    // Build request — deepseek-reasoner does not support temperature/top_p
    const requestData = {
      model,
      messages: processedMessages,
      max_tokens: options.max_tokens || (hasImages ? 4000 : 2000),
      stream: false
    };

    if (!useReasoning) {
      requestData.temperature = options.temperature || (hasImages ? 0.3 : 0.7);
      requestData.top_p = options.top_p || 1;
    }

    // Add tools if provided (DeepSeek supports OpenAI function calling format)
    // DeepSeek only accepts [a-zA-Z0-9_-] in tool names, so transform dots to underscores
    // Note: deepseek-reasoner V3.2+ supports tools in reasoning mode
    if (options.tools && options.tools.length > 0) {
      requestData.tools = this.translateToolNames(options.tools);
      requestData.tool_choice = options.tool_choice || 'auto';
    }

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };

    // Sin retry para visión (imágenes base64 son pesadas, reintentar no ayuda)
    const retryConfig = hasImages
      ? { max_attempts: 1 }
      : (options.retryConfig || {});

    this.logger.info('deepseek.chat.request', {
      model,
      hasImages,
      messageCount: processedMessages.length,
      estimatedTokens,
      max_tokens: requestData.max_tokens
    });

    // Make request
    const response = await this.withRetry(
      () => this.makeRequest('POST', '/chat/completions', requestData, headers),
      retryConfig
    );

    // Extract response
    const message = response.choices[0]?.message || {};
    const content = message.content || '';
    const reasoningContent = message.reasoning_content || null; // Chain-of-thought (reasoner only)
    const toolCalls = message.tool_calls || null;  // Extract tool_calls if present
    const inputTokens = response.usage?.prompt_tokens || estimatedTokens;
    const outputTokens = response.usage?.completion_tokens || this.countTokens(content);
    const reasoningTokens = response.usage?.completion_tokens_details?.reasoning_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    const result = {
      provider: this.name,
      model,
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        reasoning_tokens: reasoningTokens || undefined
      },
      cost: 0,
      finish_reason: response.choices[0]?.finish_reason || 'stop'
    };

    // Include reasoning chain-of-thought if present
    if (reasoningContent) {
      result.reasoning_content = reasoningContent;
    }

    // Include tool_calls if present (transform names back: underscore → dot)
    if (toolCalls && toolCalls.length > 0) {
      result.tool_calls = this.restoreToolNames(toolCalls);
      result._raw_tool_calls = toolCalls; // preserve API-format names for conversation history
    }

    return result;
  }

  /**
   * Transform tool names for DeepSeek API (dot → underscore)
   * DeepSeek only accepts pattern: ^[a-zA-Z0-9_-]+$
   *
   * Stores a reverse map so restoreToolNames can restore ONLY the names
   * that were actually translated (avoids corrupting names with underscores).
   *
   * Deduplicates after sanitization: if a module tool (e.g. "pdf.create")
   * collides with a provider tool (e.g. "pdf_create") after dot→underscore,
   * the translated (dotted) version is kept and the original underscore
   * duplicate is dropped, since restoreToolNames can map it back correctly.
   */
  translateToolNames(tools) {
    // Reset reverse map for this request
    this._toolNameMap = new Map();

    const seen = new Set();
    const result = [];

    for (const tool of tools) {
      // Normalize to OpenAI-style { type: 'function', function: { name, description, parameters } }
      // Supports 3 incoming shapes:
      //  a) { type: 'function', function: { name, ... } }  ← ya formateado
      //  b) { name, description, parameters, ... }          ← flat (como vienen del toolsRegistry)
      //  c) { function: { name, ... } } sin type           ← parcial
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
        // Tool sin nombre — skip (evita 400 de DeepSeek)
        if (this.logger) {
          this.logger.warn('deepseek.tools.skipped_no_name', { tool: JSON.stringify(tool).slice(0, 200) });
        }
        continue;
      }

      const original = normalized.function.name;
      const sanitized = original.replace(/\./g, '_');

      if (seen.has(sanitized)) {
        // Duplicate after sanitization — skip this tool
        if (this.logger) {
          this.logger.warn('deepseek.tools.duplicate_after_sanitize', {
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

  /**
   * Restore tool names from DeepSeek response using the reverse map.
   * Only restores names that were actually translated (dot→underscore).
   * Names that originally had underscores (gmail_send, http_request) stay unchanged.
   */
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

  /**
   * Chat completion (streaming)
   */
  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('DeepSeek provider not available (check API key)');
    }

    const model = this.resolveModel(options); // normaliza legacy (deepseek-chat/coder -> vivo)

    // Estimate input tokens for cost calc
    const messagesText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.countTokens(messagesText);

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

          resolve({
            provider: this.name,
            model,
            content: fullContent,
            usage: {
              input_tokens: estimatedTokens,
              output_tokens: outputTokens,
              total_tokens: totalTokens
            },
            cost: 0,
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
