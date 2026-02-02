const https = require('https');
const http = require('http');

/**
 * Base Provider Abstract Class
 *
 * Todos los proveedores LLM deben extender esta clase
 */
class BaseProvider {
  constructor(config, logger, eventBus = null) {
    this.config = config;
    this.logger = logger;
    this.eventBus = eventBus;
    this.name = 'base';

    // Rate limiting state
    this.requestCount = 0;
    this.tokenCount = 0;
    this.lastResetTime = Date.now();

    // API key from credential-manager or environment fallback
    this.apiKey = null;
    this.credentialKey = null; // Store the key name for refresh
  }

  /**
   * Initialize provider (load API keys, etc.)
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Check if provider is available
   */
  async isAvailable() {
    return this.apiKey !== null && this.config.enabled;
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
   * Count tokens (approximate)
   */
  countTokens(text) {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost
   */
  calculateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000) * (this.config.cost_per_1k_tokens.input || 0);
    const outputCost = (outputTokens / 1000) * (this.config.cost_per_1k_tokens.output || 0);
    return inputCost + outputCost;
  }

  /**
   * Check rate limit
   */
  checkRateLimit(estimatedTokens) {
    const now = Date.now();
    const elapsedMinutes = (now - this.lastResetTime) / 60000;

    // Reset counters if a minute has passed
    if (elapsedMinutes >= 1) {
      this.requestCount = 0;
      this.tokenCount = 0;
      this.lastResetTime = now;
    }

    // Check limits
    const { requests_per_minute, tokens_per_minute } = this.config.rate_limit;

    if (this.requestCount >= requests_per_minute) {
      return {
        allowed: false,
        reason: 'REQUEST_RATE_LIMIT_EXCEEDED',
        retry_after_ms: (1 - elapsedMinutes) * 60000
      };
    }

    if (this.tokenCount + estimatedTokens > tokens_per_minute) {
      return {
        allowed: false,
        reason: 'TOKEN_RATE_LIMIT_EXCEEDED',
        retry_after_ms: (1 - elapsedMinutes) * 60000
      };
    }

    return { allowed: true };
  }

  /**
   * Record usage
   */
  recordUsage(tokens) {
    this.requestCount++;
    this.tokenCount += tokens;
  }

  /**
   * HTTP request helper
   */
  async makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.api_base);
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
    const url = new URL(path, this.config.api_base);
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
    const { max_attempts, initial_delay_ms, max_delay_ms, backoff_multiplier } = retryConfig;
    let attempt = 0;
    let delay = initial_delay_ms;

    while (attempt < max_attempts) {
      try {
        return await fn();
      } catch (error) {
        attempt++;

        if (attempt >= max_attempts) {
          throw error;
        }

        this.logger.warn(`${this.name}.retry`, {
          attempt,
          max_attempts,
          delay,
          error: error.message
        });

        await this.sleep(delay);
        delay = Math.min(delay * backoff_multiplier, max_delay_ms);
      }
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Resolve credential from credential-manager via MQTT
   * Falls back to process.env if credential-manager is not available
   */
  async resolveCredential(keyName, context = {}) {
    this.credentialKey = keyName;

    // Fallback to environment variable if no eventBus
    if (!this.eventBus) {
      this.logger.warn(`${this.name}.credential.fallback`, {
        key: keyName,
        reason: 'no eventBus - using process.env'
      });
      return process.env[keyName] || null;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Timeout fallback to environment
        this.logger.warn(`${this.name}.credential.timeout`, {
          key: keyName,
          reason: 'credential-manager timeout - using process.env'
        });
        resolve(process.env[keyName] || null);
      }, 5000);

      // Subscribe to response
      const responseHandler = (event) => {
        if (event.payload.request_key === keyName) {
          clearTimeout(timeout);

          if (event.payload.success) {
            this.logger.info(`${this.name}.credential.resolved`, {
              key: keyName,
              level: event.payload.level,
              source: 'credential-manager'
            });
            resolve(event.payload.value);
          } else {
            this.logger.warn(`${this.name}.credential.not_found`, {
              key: keyName,
              reason: 'using process.env fallback'
            });
            resolve(process.env[keyName] || null);
          }

          // Unsubscribe after receiving response
          this.eventBus.unsubscribe('credential.resolve.response', responseHandler);
        }
      };

      // Subscribe to response event
      this.eventBus.subscribe('credential.resolve.response', responseHandler);

      // Publish resolve request
      this.eventBus.publish('credential.resolve.request', {
        key: keyName,
        context: {
          module: 'ai-gateway',
          provider: this.name,
          ...context
        }
      });
    });
  }

  /**
   * Refresh credential (for hot-reload when credentials change)
   */
  async refreshCredential() {
    if (!this.credentialKey) {
      this.logger.debug(`${this.name}.credential.refresh.skip`, {
        reason: 'no credentialKey stored'
      });
      return;
    }

    this.logger.info(`${this.name}.credential.refreshing`, {
      key: this.credentialKey
    });

    const newApiKey = await this.resolveCredential(this.credentialKey);

    if (newApiKey !== this.apiKey) {
      const hadKey = this.apiKey !== null;
      this.apiKey = newApiKey;

      this.logger.info(`${this.name}.credential.updated`, {
        key: this.credentialKey,
        changed: true,
        available: await this.isAvailable(),
        transition: hadKey ? (newApiKey ? 'updated' : 'removed') : (newApiKey ? 'added' : 'still_missing')
      });
    } else {
      this.logger.debug(`${this.name}.credential.unchanged`, {
        key: this.credentialKey
      });
    }
  }
}

module.exports = BaseProvider;
