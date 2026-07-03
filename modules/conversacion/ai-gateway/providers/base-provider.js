const https = require('https');
const http = require('http');

/**
 * Base Provider Abstract Class
 *
 * Todos los proveedores LLM deben extender esta clase
 */
class BaseProvider {
  constructor(config, logger, credentialResolver = null) {
    this.config = config;
    this.logger = logger;
    this.name = 'base';

    // API key management
    this.apiKey = null;
    this.credentialResolver = credentialResolver; // Function to resolve credentials via events

    // Context for credential resolution (can be set per-request)
    this.currentProjectId = null;
    this.currentClientId = null;
  }

  /**
   * Initialize provider (load API keys, etc.)
   */
  async configure() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Check if provider is available
   * Resolves credentials via credential-manager if resolver is available
   */
  async isAvailable() {
    // Try to refresh API key if not set
    if (!this.apiKey) {
      await this.refreshApiKey();
    }
    return this.apiKey !== null && this.config.enabled;
  }

  /**
   * Refresh API key - uses credential resolver if available, falls back to env
   * Override in subclasses to specify the provider name for resolution
   */
  async refreshApiKey() {
    // If we have a credential resolver, use it (event-based resolution)
    if (this.credentialResolver) {
      try {
        this.apiKey = await this.credentialResolver(this.name, {
          projectId: this.currentProjectId,
          clientId: this.currentClientId
        });
        return;
      } catch (error) {
        this.logger.debug(`${this.name}.credential.resolver.failed`, {
          error: error.message,
          fallback: 'environment'
        });
        // Fall through to environment check
      }
    }

    // Fallback: check environment directly (legacy support)
    this.refreshApiKeyFromEnv();
  }

  /**
   * Refresh API key from environment variables
   * Override in subclasses to check specific env vars
   */
  refreshApiKeyFromEnv() {
    // Subclasses should implement this for fallback
  }

  /**
   * Set context for credential resolution (projectId, clientId for cascade)
   */
  setContext({ projectId, clientId } = {}) {
    this.currentProjectId = projectId;
    this.currentClientId = clientId;
  }

  /**
   * Chat completion (synchronous)
   */
  async chatCompletion(messages, options = {}) {
    throw new Error('chatCompletion() must be implemented by subclass');
  }

  /**
   * Chat completion (streaming)
   */
  async chatCompletionStream(messages, options = {}) {
    throw new Error('chatCompletionStream() must be implemented by subclass');
  }

  /**
   * Generate embedding for a text input.
   * Returns { vector: number[], model, dimensions, tokens?: { input } }.
   * Throws if the provider does not support embeddings (default behavior).
   * Subclasses that support embeddings (gemini, openai) override this.
   */
  async generateEmbedding(text, options = {}) {
    throw new Error(`${this.name} does not support embeddings`);
  }

  /**
   * Indicates whether the provider supports embeddings. Default false;
   * providers that override generateEmbedding override this to true.
   */
  supportsEmbeddings() {
    return false;
  }

  /**
   * Count tokens (approximate)
   */
  countTokens(text) {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Base URL EFECTIVO del proveedor. Un override por env gana a la config, para redirigir
   * el tráfico a un proxy (p.ej. Headroom, compresión de contexto) en DESPLIEGUE, sin editar
   * la config versionada ni el código. El proxy conserva el path (/v1/messages, /anthropic/...)
   * y solo cambia el host → reenvía al proveedor real comprimiendo por el camino.
   *   env: AIGATEWAY_API_BASE__<NOMBRE>  (guiones/no-alfa → '_', mayúsculas)
   *        p.ej. deepseek-anthropic → AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC=http://localhost:8787
   * Default: this.config.api_base. REVERSIBLE: quita la env → vuelve al proveedor directo.
   */
  _apiBase() {
    const key = 'AIGATEWAY_API_BASE__' + String(this.name || '').replace(/[^a-z0-9]+/gi, '_').toUpperCase();
    const override = process.env[key];
    return (override && override.trim()) || this.config.api_base;
  }

  /**
   * HTTP request helper
   */
  async makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this._apiBase());
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = httpModule.request(options, (res) => {
        // UTF-8 multibyte (emojis 🍖 de 4 bytes) puede caer partido entre dos
        // chunks de red; `body += chunkBuffer` decodifica cada mitad por
        // separado y produce `��`. setEncoding deja que el StringDecoder de Node
        // junte los bytes a través de la frontera del chunk antes de decodificar.
        res.setEncoding('utf8');
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed);
            } catch (error) {
              resolve(body);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      // Timeout para evitar que el request se cuelgue
      req.setTimeout(90000, () => {
        req.destroy();
        reject(new Error(`HTTP request timeout after 90s to ${url.hostname}${url.pathname}`));
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * HTTP streaming request helper
   */
  makeStreamRequest(method, path, data = null, headers = {}, onChunk, onEnd, onError) {
    const url = new URL(path, this._apiBase());
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...headers
      }
    };

    const req = httpModule.request(options, (res) => {
      // Reject non-2xx responses immediately instead of parsing as SSE
      if (res.statusCode >= 400) {
        res.setEncoding('utf8'); // mismo motivo: bytes multibyte intactos entre chunks
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          let message;
          try {
            const parsed = JSON.parse(body);
            message = parsed.error?.message || parsed.message || body;
          } catch (_) {
            message = body;
          }
          onError(new Error(`HTTP ${res.statusCode}: ${message}`));
        });
        return;
      }

      res.on('data', (chunk) => {
        onChunk(chunk);
      });

      res.on('end', () => {
        onEnd();
      });

      res.on('error', (error) => {
        onError(error);
      });
    });

    req.on('error', (error) => {
      onError(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  }

  /**
   * Retry with exponential backoff
   */
  async withRetry(fn, retryConfig) {
    const config = retryConfig || {};
    const maxAttempts = config.max_attempts || 1;
    const initialDelay = config.initial_delay_ms || 1000;
    const maxDelay = config.max_delay_ms || 10000;
    const multiplier = config.backoff_multiplier || 2;

    let attempt = 0;
    let delay = initialDelay;

    while (attempt < maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        attempt++;

        if (attempt >= maxAttempts) {
          throw error;
        }

        this.logger.warn(`${this.name}.retry`, {
          attempt,
          max_attempts: maxAttempts,
          delay,
          error: error.message
        });

        await this.sleep(delay);
        delay = Math.min(delay * multiplier, maxDelay);
      }
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BaseProvider;
