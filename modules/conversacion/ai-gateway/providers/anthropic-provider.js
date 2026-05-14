const BaseProvider = require('./base-provider');

/**
 * Anthropic Claude Provider
 *
 * Endpoint: POST https://api.anthropic.com/v1/messages
 *
 * Modelos soportados (Jan 2026):
 *   - claude-opus-4-7        (1M ctx, $5/$25, no extended thinking, sí adaptive)
 *   - claude-sonnet-4-6      (1M ctx, $3/$15, ext thinking + adaptive)
 *   - claude-haiku-4-5       (200K ctx, $1/$5, ext thinking)
 *   - claude-3-5-haiku-20241022 (legacy, $0.80/$4, sin thinking)
 *
 * Reglas universales del API (verificadas en docs.claude.com 2026-05-14):
 *   - x-api-key + anthropic-version: 2023-06-01 obligatorios
 *   - model, max_tokens, messages obligatorios
 *   - system va TOP-LEVEL, no como role:'system' en messages
 *   - temperature y top_p son MUTUALMENTE EXCLUYENTES (HTTP 400 si se mandan ambos)
 *   - tools usan input_schema (no parameters como OpenAI)
 *   - tool_choice: { type: 'auto'|'any'|'tool'|'none', name?, disable_parallel_tool_use? }
 *   - response.content es array de bloques: text | tool_use | thinking
 *   - en multi-turno con thinking enabled, los bloques thinking del assistant
 *     anterior DEBEN preservarse intactos (signature)
 *
 * No usamos extended thinking por defecto — el caller puede activarlo via
 * options.thinking = { type: 'enabled', budget_tokens: int }.
 */
class AnthropicProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'anthropic';
    this.apiVersion = '2023-06-01';
  }

  async configure() {
    await this.refreshApiKey();
    if (!this.apiKey) {
      this.logger.warn('anthropic.no-api-key', {
        message: 'No Anthropic API key found (checked credential-manager and environment)'
      });
    }
    this.logger.info('anthropic.initialized', {
      available: await this.isAvailable(),
      models: this.config.models
    });
  }

  refreshApiKeyFromEnv() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_GLOBAL || null;
  }

  /**
   * Traduce el catalogo de tools del repo (formato OpenAI/flat) al shape
   * canonico de Anthropic. ai-gateway invoca este metodo automaticamente
   * antes de pasar tools al provider.
   *
   * Acepta 3 shapes de entrada:
   *   a) { type: 'function', function: { name, description, parameters } }  (OpenAI)
   *   b) { function: { name, description, parameters } }                    (parcial)
   *   c) { name, description, parameters }                                  (flat del registry)
   *
   * Produce shape Anthropic: { name, description, input_schema }
   *
   * Anthropic acepta dots, dashes y underscores en name — no requiere
   * sanitizacion (a diferencia de DeepSeek/Kimi/OpenAI).
   */
  translateTools(tools) {
    if (!Array.isArray(tools)) return tools;
    return tools
      .map(t => {
        let name, description, parameters;
        if (t.type === 'function' && t.function?.name) {
          name = t.function.name;
          description = t.function.description || '';
          parameters = t.function.parameters;
        } else if (t.function?.name) {
          name = t.function.name;
          description = t.function.description || '';
          parameters = t.function.parameters;
        } else if (t.name) {
          name = t.name;
          description = t.description || '';
          parameters = t.parameters || t.input_schema;
        } else {
          if (this.logger) {
            this.logger.warn('anthropic.tools.skipped_no_name', { tool: JSON.stringify(t).slice(0, 200) });
          }
          return null;
        }
        return {
          name,
          description,
          input_schema: parameters || { type: 'object', properties: {}, required: [] }
        };
      })
      .filter(Boolean);
  }

  /**
   * Convierte mensajes OpenAI-style → Anthropic-style.
   * Extrae system fuera del array (Anthropic lo quiere top-level).
   * Mapea role:'tool' → user con content:[{type:'tool_result', ...}].
   * Conserva assistant.tool_calls como content:[{type:'tool_use', ...}].
   * Conserva content arrays existentes (tool_result, image, text, thinking).
   */
  convertMessages(messages) {
    const sysContents = [];
    const chat = [];

    for (const m of messages) {
      if (m.role === 'system') {
        if (Array.isArray(m.content)) {
          for (const c of m.content) {
            if (c.type === 'text' && c.text) sysContents.push(c.text);
          }
        } else if (typeof m.content === 'string' && m.content) {
          sysContents.push(m.content);
        }
        continue;
      }
      chat.push(m);
    }

    const system = sysContents.join('\n');

    const anthropicMessages = chat.map(m => {
      // role:'tool' con tool_call_id (OpenAI shape) → user con tool_result block
      if (m.role === 'tool' && m.tool_call_id) {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          }]
        };
      }

      // user con content array que ya trae tool_result blocks (Anthropic shape): passthrough
      if (m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result')) {
        return { role: 'user', content: m.content };
      }

      const role = m.role === 'assistant' ? 'assistant' : 'user';

      // assistant con tool_calls (OpenAI shape) → content:[text?, tool_use blocks]
      // Si el assistant trae thinking_content (compat kimi/deepseek-reasoner),
      // lo descartamos: solo Anthropic tiene firma valida para sus thinking blocks.
      if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls)) {
        const parts = [];
        if (m.content && typeof m.content === 'string') {
          parts.push({ type: 'text', text: m.content });
        }
        for (const tc of m.tool_calls) {
          let input = {};
          if (tc.function?.arguments) {
            try {
              input = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments;
            } catch { input = {}; }
          }
          parts.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function?.name || tc.name,
            input: tc.input || input
          });
        }
        return { role: 'assistant', content: parts };
      }

      // assistant con content array nativo Anthropic (text/tool_use/thinking): passthrough
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        return { role: 'assistant', content: m.content };
      }

      // Vision: image_base64 (formato interno) o content array con image blocks
      if (m.image_base64 || (Array.isArray(m.content) && m.content.some(c => c.type === 'image'))) {
        const parts = [];
        if (m.image_base64) {
          parts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: m.image_type || 'image/jpeg',
              data: m.image_base64
            }
          });
        }
        if (Array.isArray(m.content)) {
          for (const c of m.content) {
            if (c.type === 'image' && c.source) parts.push(c);
            else if (c.type === 'text') parts.push({ type: 'text', text: c.text });
          }
        } else if (typeof m.content === 'string' && m.content) {
          parts.push({ type: 'text', text: m.content });
        }
        return { role, content: parts };
      }

      // Texto plano
      return { role, content: m.content || '' };
    });

    return { system, messages: anthropicMessages };
  }

  /**
   * Construye el cuerpo del request respetando todas las restricciones API:
   * - temperature y top_p mutuamente excluyentes (preferimos temperature)
   * - thinking opcional con budget_tokens < max_tokens
   * - tool_choice debe ser 'auto' o 'none' cuando thinking esta enabled
   */
  _buildRequestBody(model, anthropicMessages, system, options) {
    const body = {
      model,
      messages: anthropicMessages,
      max_tokens: options.max_tokens || 2000
    };

    if (system) body.system = system;

    if (options.top_p !== undefined && options.temperature === undefined) {
      body.top_p = options.top_p;
    } else {
      body.temperature = options.temperature ?? 0.7;
    }

    if (options.stop_sequences && Array.isArray(options.stop_sequences)) {
      body.stop_sequences = options.stop_sequences;
    }

    if (options.thinking && options.thinking.type === 'enabled') {
      const budget = Math.min(
        options.thinking.budget_tokens || 4096,
        Math.max(body.max_tokens - 1, 1024)
      );
      body.thinking = { type: 'enabled', budget_tokens: budget };
      if (options.thinking.display) body.thinking.display = options.thinking.display;
    } else if (options.thinking && options.thinking.type === 'adaptive') {
      body.thinking = { type: 'adaptive' };
    }

    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      body.tools = options.tools;
      const userChoice = options.tool_choice;
      if (body.thinking) {
        body.tool_choice = userChoice && (userChoice.type === 'auto' || userChoice.type === 'none')
          ? userChoice
          : { type: 'auto' };
      } else {
        body.tool_choice = userChoice || { type: 'auto' };
      }
    }

    return body;
  }

  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Anthropic provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    const messagesText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    const requestData = this._buildRequestBody(model, anthropicMessages, system, options);
    requestData.stream = false;

    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion
    };

    this.logger.info('anthropic.chat.request', {
      model,
      messageCount: anthropicMessages.length,
      hasTools: !!requestData.tools,
      hasThinking: !!requestData.thinking,
      max_tokens: requestData.max_tokens,
      estimatedTokens
    });

    const response = await this.withRetry(
      () => this.makeRequest('POST', '/v1/messages', requestData, headers),
      options.retryConfig || {}
    );

    // Response.content es array de bloques: text | tool_use | thinking
    let content = '';
    let toolCalls = null;
    let thinkingBlocks = null;

    if (Array.isArray(response.content)) {
      const textBlocks = [];
      const toolUseBlocks = [];
      const thinks = [];
      for (const b of response.content) {
        if (b.type === 'text') textBlocks.push(b.text);
        else if (b.type === 'tool_use') toolUseBlocks.push(b);
        else if (b.type === 'thinking') thinks.push(b);
      }
      content = textBlocks.join('');
      if (toolUseBlocks.length > 0) {
        toolCalls = toolUseBlocks.map(b => ({
          id: b.id,
          type: 'function',
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input || {})
          }
        }));
      }
      if (thinks.length > 0) thinkingBlocks = thinks;
    }

    const inputTokens = response.usage?.input_tokens || estimatedTokens;
    const outputTokens = response.usage?.output_tokens || this.countTokens(content);

    const result = {
      provider: this.name,
      model,
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      },
      cost: 0,
      finish_reason: response.stop_reason || 'stop'
    };

    if (toolCalls && toolCalls.length > 0) {
      result.tool_calls = toolCalls;
      // Para preservar thinking blocks en el siguiente turno multi-turno con
      // tools (requisito de extended thinking), exponemos los bloques nativos
      // a traves de _raw_assistant_content. El agentic loop del gateway puede
      // anteponerlos al construir el siguiente assistant message si decide
      // soportar thinking explicito.
      if (thinkingBlocks) result._anthropic_thinking_blocks = thinkingBlocks;
    }

    return result;
  }

  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Anthropic provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    const messagesText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    const requestData = this._buildRequestBody(model, anthropicMessages, system, options);
    requestData.stream = true;

    const headers = {
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion
    };

    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';

      this.makeStreamRequest(
        'POST',
        '/v1/messages',
        requestData,
        headers,
        (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta?.text || '';
                if (delta) {
                  fullContent += delta;
                  if (options.onChunk) options.onChunk(delta);
                }
              }
            } catch (_) { /* ignore */ }
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

module.exports = AnthropicProvider;
