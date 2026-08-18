const BaseProvider = require('./base-provider');

/**
 * Ollama Provider
 *
 * Implementación del proveedor Ollama (local) (http://localhost:11434)
 * Priority: 4
 * Cost: $0 (local)
 */
class OllamaProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'ollama';
  }

  /**
   * Initialize.
   * Resuelve la API key (cloud) con el circuito estándar: credentialResolver
   * (eventos → credential-manager) → env OLLAMA_API_KEY → fallback 'local'
   * (Ollama local no necesita key). Verifica disponibilidad contra el base
   * con la auth correspondiente (GET /api/tags — mismo endpoint en local y cloud).
   */
  async configure() {
    // 1. Resolver key cloud (si hay): resolver → env. Sin key → 'local'.
    try {
      await this.refreshApiKey();
    } catch (error) {
      this.logger.warn('ollama.credential.resolve.failed', { error: error.message });
    }
    if (!this.apiKey) this.apiKey = 'local';

    // 2. Verificar disponibilidad (local o cloud, mismo path nativo /api/tags)
    try {
      const headers = this._authHeaders();
      await this.makeRequest('GET', '/api/tags', null, headers);
      this.logger.info('ollama.initialized', {
        available: true,
        mode: this.apiKey === 'local' ? 'local' : 'cloud',
        models: this.config.models
      });
    } catch (error) {
      this.logger.warn('ollama.not-running', {
        message: 'Ollama not available',
        error: error.message
      });
      this.apiKey = null;
    }
  }

  /**
   * Fallback de key desde entorno (legacy / sin resolver).
   * Termina en _API_KEY → persiste en el store del credential-manager.
   */
  refreshApiKeyFromEnv() {
    this.apiKey = process.env.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY_GLOBAL || null;
  }

  /**
   * Header de auth: Bearer con la key cloud. Sin key (local) → sin header
   * (el endpoint local ignora la auth; ollama lo documenta como "required but ignored").
   */
  _authHeaders() {
    if (this.apiKey && this.apiKey !== 'local') {
      return { 'Authorization': `Bearer ${this.apiKey}` };
    }
    return {};
  }

  /**
   * Coerce de modelo: una conversación GUARDADA con un nombre que el catálogo
   * cloud NO acepta (modelos locales viejos, default erróneo) cae al
   * default_model en vez de fallar con 404.
   */
  _coerceModel(options = {}) {
    const m = options.model;
    if (m && !this.config.models.includes(m)) {
      return { ...options, model: this.config.default_model };
    }
    return options;
  }

  /**
   * Chat completion
   */
  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Ollama provider not available (is Ollama running / key válida?)');
    }

    options = this._coerceModel(options);
    const model = options.model || this.config.default_model;

    // Estimate tokens
    const messagesText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    // Build Ollama-specific request
    const requestData = {
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 1,
        num_predict: options.max_tokens || 2000
      }
    };

    // Make request with retry
    const response = await this.withRetry(
      () => this.makeRequest('POST', '/api/chat', requestData, this._authHeaders()),
      options.retryConfig || {}
    );

    // Extract response
    const content = response.message?.content || '';
    const outputTokens = this.countTokens(content);
    const totalTokens = estimatedTokens + outputTokens;

    // Ollama has no cost (local)
    const cost = 0;

    return {
      provider: this.name,
      model,
      content,
      usage: {
        input_tokens: estimatedTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens
      },
      cost,
      finish_reason: response.done ? 'stop' : 'length'
    };
  }

  /**
   * Chat completion (streaming)
   */
  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Ollama provider not available (is Ollama running / key válida?)');
    }

    options = this._coerceModel(options);
    const model = options.model || this.config.default_model;

    // Estimate tokens
    const messagesText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    // Build Ollama-specific request
    const requestData = {
      model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 1,
        num_predict: options.max_tokens || 2000
      }
    };

    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';

      this.makeStreamRequest(
        'POST',
        '/api/chat',
        requestData,
        this._authHeaders(),
        (chunk) => {
          buffer += chunk.toString();

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                const delta = parsed.message?.content || '';

                if (delta) {
                  fullContent += delta;

                  if (options.onChunk) {
                    options.onChunk(delta);
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
}

module.exports = OllamaProvider;
