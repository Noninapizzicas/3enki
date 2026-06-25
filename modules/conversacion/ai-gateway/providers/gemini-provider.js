const BaseProvider = require('./base-provider');

/**
 * Gemini Provider
 *
 * Implementación del proveedor Google Gemini (https://generativelanguage.googleapis.com)
 *
 * Características:
 * - RAG gestionado (File Search) con storage gratuito
 * - Grounding con Google Search
 * - Code Execution server-side
 * - Ventana de contexto hasta 1M tokens
 *
 * Auth: API key como query param (?key=...) o header x-goog-api-key
 * Formato: diferente de OpenAI — usa contents[]/parts[] en vez de messages[]
 */
class GeminiProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'gemini';
  }

  /**
   * Initialize
   */
  async configure() {
    await this.refreshApiKey();

    if (!this.apiKey) {
      this.logger.warn('gemini.no-api-key', {
        message: 'No Gemini API key found (checked credential-manager and environment)'
      });
    }

    this.logger.info('gemini.initialized', {
      available: await this.isAvailable(),
      models: this.config.models
    });
  }

  /**
   * Refresh API key from environment
   */
  refreshApiKeyFromEnv() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY_GLOBAL || null;
  }

  /**
   * Convert OpenAI-style messages to Gemini contents format
   * OpenAI: [{ role: 'user'|'assistant'|'system', content: '...' }]
   * Gemini: { system_instruction, contents: [{ role: 'user'|'model', parts: [{ text }] }] }
   */
  convertMessages(messages) {
    let systemInstruction = null;
    const contents = [];

    for (const m of messages) {
      if (m.role === 'system') {
        // Gemini usa system_instruction separado
        systemInstruction = systemInstruction
          ? systemInstruction + '\n' + (typeof m.content === 'string' ? m.content : '')
          : (typeof m.content === 'string' ? m.content : '');
        continue;
      }

      const role = m.role === 'assistant' ? 'model' : 'user';
      const parts = [];

      // Assistant messages with tool_calls: convert to functionCall parts
      if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls)) {
        if (m.content) {
          parts.push({ text: m.content });
        }
        for (const tc of m.tool_calls) {
          let args = {};
          if (tc.function?.arguments) {
            try {
              args = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments;
            } catch { args = {}; }
          }
          parts.push({
            functionCall: {
              name: tc.function?.name || tc.name,
              args
            }
          });
        }
        contents.push({ role, parts });
        continue;
      }

      // Handle image content
      if (m.image_base64) {
        parts.push({
          inline_data: {
            mime_type: m.image_type || 'image/jpeg',
            data: m.image_base64
          }
        });
      }

      // Handle array content
      if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            // data:mime;base64,data format
            const match = part.image_url.url.match(/^data:(.+?);base64,(.+)$/);
            if (match) {
              parts.push({
                inline_data: {
                  mime_type: match[1],
                  data: match[2]
                }
              });
            }
          }
        }
      } else if (typeof m.content === 'string' && m.content) {
        parts.push({ text: m.content });
      }

      // Handle tool call results (role: 'tool' → functionResponse)
      if (m.role === 'tool' && m.tool_call_id) {
        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: m.name || m.tool_call_id,
              response: { result: m.content }
            }
          }]
        });
        continue;
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return { systemInstruction, contents };
  }

  /**
   * Convert tools to Gemini format
   * OpenAI: [{ type: 'function', function: { name, description, parameters } }]
   * Gemini: [{ functionDeclarations: [{ name, description, parameters }] }]
   */
  convertTools(tools) {
    if (!tools || tools.length === 0) return null;

    const functionDeclarations = tools.map(tool => {
      const fn = tool.function || tool;
      return {
        name: fn.name,
        description: fn.description || '',
        parameters: this._sanitizeSchema(fn.parameters || { type: 'object', properties: {} })
      };
    });

    return [{ functionDeclarations }];
  }

  /**
   * El esquema de function-calling de Gemini es un SUBCONJUNTO de OpenAPI: rechaza
   * campos válidos en JSON Schema (additionalProperties, $schema, $ref, definitions…)
   * con HTTP 400 INVALID_ARGUMENT. OpenAI/Anthropic/deepseek los aceptan; Gemini no.
   * Los limpiamos recursivamente (properties, items, anyOf/oneOf/allOf) antes de enviar.
   */
  _sanitizeSchema(node) {
    if (Array.isArray(node)) return node.map(n => this._sanitizeSchema(n));
    if (!node || typeof node !== 'object') return node;
    const DENY = new Set(['additionalProperties', '$schema', '$id', '$ref', 'definitions', 'patternProperties']);
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (DENY.has(k)) continue;
      out[k] = this._sanitizeSchema(v);
    }
    return out;
  }

  /**
   * Chat completion
   */
  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Gemini provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;

    // Convert messages to Gemini format
    const { systemInstruction, contents } = this.convertMessages(messages);

    // Estimate tokens
    const messagesText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    // Build request
    const requestData = {
      contents,
      generationConfig: {
        temperature: options.temperature || 0.7,
        topP: options.top_p || 1,
        maxOutputTokens: options.max_tokens || 2000
      }
    };

    if (systemInstruction) {
      requestData.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    // Add tools if provided
    const geminiTools = this.convertTools(options.tools);
    if (geminiTools) {
      requestData.tools = geminiTools;
    }

    // Gemini auth via header
    const headers = {
      'x-goog-api-key': this.apiKey
    };

    // Gemini endpoint RELATIVO (sin barra inicial): asi new URL(endpoint, api_base)
    // conserva el /v1beta del api_base. Con barra inicial lo borraba -> 404 en todo.
    const endpoint = `models/${model}:generateContent`;

    this.logger.info('gemini.chat.request', {
      model,
      messageCount: contents.length,
      estimatedTokens
    });

    // Make request
    const response = await this.withRetry(
      () => this.makeRequest('POST', endpoint, requestData, headers),
      options.retryConfig || {}
    );

    // Extract response
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let content = '';
    let toolCalls = null;

    for (const part of parts) {
      if (part.text) {
        content += part.text;
      }
      if (part.functionCall) {
        if (!toolCalls) toolCalls = [];
        toolCalls.push({
          id: `gemini-${Date.now()}-${toolCalls.length}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          }
        });
      }
    }

    const inputTokens = response.usageMetadata?.promptTokenCount || estimatedTokens;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || this.countTokens(content);
    const totalTokens = inputTokens + outputTokens;

    return {
      provider: this.name,
      model,
      content,
      tool_calls: toolCalls,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens
      },
      cost: 0,
      finish_reason: candidate?.finishReason === 'STOP' ? 'stop' : (candidate?.finishReason || 'stop')
    };
  }

  /**
   * Chat completion (streaming) — Gemini SSE format
   */
  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Gemini provider not available (check API key)');
    }

    const model = options.model || this.config.default_model;

    // Convert messages
    const { systemInstruction, contents } = this.convertMessages(messages);

    // Estimate tokens
    const messagesText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    // Build request
    const requestData = {
      contents,
      generationConfig: {
        temperature: options.temperature || 0.7,
        topP: options.top_p || 1,
        maxOutputTokens: options.max_tokens || 2000
      }
    };

    if (systemInstruction) {
      requestData.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const headers = {
      'x-goog-api-key': this.apiKey
    };

    // Streaming endpoint RELATIVO (sin barra inicial → conserva /v1beta del api_base)
    const endpoint = `models/${model}:streamGenerateContent?alt=sse`;

    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';

      this.makeStreamRequest(
        'POST',
        endpoint,
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
                const parts = parsed.candidates?.[0]?.content?.parts || [];

                for (const part of parts) {
                  if (part.text) {
                    fullContent += part.text;
                    if (options.onChunk) {
                      options.onChunk(part.text);
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

  /**
   * Generate embedding for a text input via Gemini embedContent API.
   * Endpoint: POST /models/{model}:embedContent
   * Body:    { model: "models/{model}", content: { parts: [{ text }] } }
   * Returns: { vector, model, dimensions, tokens: { input } }
   */
  async generateEmbedding(text, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Gemini provider not available (check API key)');
    }
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('generateEmbedding requires non-empty string');
    }

    const model = options.model || 'gemini-embedding-001';
    const endpoint = `models/${model}:embedContent`;
    const headers = { 'x-goog-api-key': this.apiKey };
    const body = {
      model: `models/${model}`,
      content: { parts: [{ text }] }
    };

    this.logger.info('gemini.embedding.request', {
      model, length: text.length
    });

    const response = await this.withRetry(
      () => this.makeRequest('POST', endpoint, body, headers),
      options.retryConfig || {}
    );

    const vector = response?.embedding?.values;
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('gemini embedding response missing values');
    }

    return {
      vector,
      model,
      dimensions: vector.length,
      tokens: { input: this.countTokens(text) }
    };
  }

  supportsEmbeddings() {
    return true;
  }
}

module.exports = GeminiProvider;
