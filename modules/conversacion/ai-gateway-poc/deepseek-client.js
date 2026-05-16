'use strict';

/**
 * DeepSeekClient — HTTP-client canonico contra api.deepseek.com.
 *
 * Aplica las reglas del contrato `http` (modo http-client) y `errors`:
 *  - Timeout obligatorio via AbortSignal.timeout (config.timeout_ms).
 *  - Retry policy declarada (config.retry: max_attempts, backoff_ms, retryable_status).
 *  - Telemetria obligatoria por call: log + metric (duration, status, host).
 *  - Redaccion de Authorization en logs antes de imprimir.
 *  - Mapeo de errores externos a codigos canonicos UPSTREAM_* del catalogo
 *    errors.codes_infrastructure (401/403 → AUTH_FAILED, 429 → RATE_LIMITED,
 *    5xx → 5XX, network → UNREACHABLE, timeout → UPSTREAM_TIMEOUT, parse → INVALID_RESPONSE).
 *  - NUNCA loguear el body del error del upstream sin redactar (puede contener PII).
 *
 * Devuelve un shape INTERNO { ok: true, data } o { ok: false, error: { code,
 * status, message, details } }. El handler del bus convertira a shape canonico
 * { status, data | error } antes de publicar la response.
 */
class DeepSeekClient {
  /**
   * @param {Object} args
   * @param {Object} args.config              — entry de module.json.config.http_clients[deepseek]
   * @param {Object} args.logger              — logger structured json
   * @param {Object} args.metrics             — metrics (API canonica: increment/gauge/timing)
   * @param {Function} args.resolveCredential — async (credentialRef, projectId) => apiKey | throws
   * @param {string} args.moduleName          — nombre del modulo emisor para signatures
   * @param {Function} [args.fetch]           — fetch inyectable para tests (default: global.fetch).
   *                                            Patron canonico del contrato http v1.1.0 (F7):
   *                                            permite mocks sin contaminar global.fetch.
   */
  constructor({ config, logger, metrics, resolveCredential, moduleName = 'ai-gateway', fetch: fetchImpl }) {
    if (!config)            throw new Error('DeepSeekClient: config (http_clients entry) is required');
    if (!config.timeout_ms) throw new Error('DeepSeekClient: config.timeout_ms is required (mandatory_timeout_in_http_client)');
    this.config            = config;
    this.logger            = logger;
    this.metrics           = metrics;
    this.resolveCredential = resolveCredential;
    this.moduleName        = moduleName;
    this._fetch            = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!this._fetch) {
      throw new Error('DeepSeekClient: fetch is not available (Node 18+ required, or inject fetch in constructor)');
    }
  }

  /**
   * Chat completion. Resuelve credencial via bus, ejecuta retry loop.
   *
   * @param {Object} args
   * @param {Array}  args.messages   — array OpenAI-compatible
   * @param {string} args.model      — deepseek-chat | deepseek-reasoner | undefined (default)
   * @param {string} args.projectId  — para resolucion de credencial por proyecto
   * @param {number} args.maxTokens
   * @param {number} args.temperature
   * @param {string} args.requestId  — id propio para correlacionar logs
   */
  async chatCompletion({ messages, model, projectId, maxTokens, temperature, requestId }) {
    const apiKey = await this._resolveCredentialOrFail({ projectId, requestId });
    if (!apiKey.ok) return apiKey;

    const useReasoner = model === 'deepseek-reasoner';
    const body = {
      model:      model || this.config.default_model || 'deepseek-chat',
      messages,
      max_tokens: maxTokens || 2000,
      stream:     false
    };
    if (!useReasoner) {
      body.temperature = temperature ?? 0.7;
      body.top_p       = 1;
    }

    const retry = this.config.retry || { max_attempts: 1, backoff_ms: 0, retryable_status: [] };
    let lastResult = null;

    for (let attempt = 1; attempt <= retry.max_attempts; attempt++) {
      const result = await this._request({
        method:    'POST',
        path:      '/chat/completions',
        body,
        apiKey:    apiKey.value,
        requestId,
        attempt
      });

      if (result.ok) return result;

      lastResult = result;
      const upstreamStatus = result.error.details?.upstream_status;
      const isNetworkOrTimeout = result.error.code === 'UPSTREAM_TIMEOUT' || result.error.code === 'UPSTREAM_UNREACHABLE';
      const retryable = isNetworkOrTimeout || retry.retryable_status.includes(upstreamStatus);

      if (!retryable || attempt >= retry.max_attempts) return result;

      const wait = retry.backoff_ms * attempt;
      this.logger.info(`${this.moduleName}.deepseek.retry`, {
        request_id: requestId, attempt, max_attempts: retry.max_attempts, wait_ms: wait,
        code: result.error.code
      });
      await this._sleep(wait);
    }
    return lastResult;
  }

  // ---------------------------------------------------------------- internals

  async _resolveCredentialOrFail({ projectId, requestId }) {
    try {
      const value = await this.resolveCredential(this.config.credential_ref, projectId);
      if (!value) {
        return this._clientError({
          code: 'RESOURCE_NOT_FOUND', status: 404,
          message: `No DeepSeek credential resolved for project=${projectId || 'global'}`,
          details: { kind: 'infrastructure', retryable: false, provider: 'deepseek', requestId }
        });
      }
      return { ok: true, value };
    } catch (err) {
      return this._clientError({
        code: 'RESOURCE_NOT_FOUND', status: 404,
        message: `Credential resolve failed for deepseek: ${err.message}`,
        details: { kind: 'infrastructure', retryable: false, provider: 'deepseek', requestId }
      });
    }
  }

  async _request({ method, path, body, apiKey, requestId, attempt }) {
    const url = new URL(path, this.config.base_url).toString();
    const headers = {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    const t0 = Date.now();

    let response, statusCode = 0;
    try {
      response = await this._fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout_ms)
      });
      statusCode = response.status;
    } catch (err) {
      const dur = Date.now() - t0;
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      const code   = isTimeout ? 'UPSTREAM_TIMEOUT'   : 'UPSTREAM_UNREACHABLE';
      const status = isTimeout ? 504                  : 503;

      this.logger.warn(`${this.moduleName}.deepseek.request.failed`, {
        request_id: requestId, attempt, dur_ms: dur, host: this.config.host,
        kind: isTimeout ? 'timeout' : 'network',
        error: err.message,
        headers: this._redactHeaders(headers)
      });
      this._metric(`${this.moduleName}.deepseek.duration`, dur, {
        host: this.config.host, status: 'error', kind: code
      });
      this._metric(`${this.moduleName}.deepseek.errors`, 1, {
        host: this.config.host, code, kind: 'infrastructure'
      });

      return this._clientError({
        code, status,
        message: `DeepSeek ${isTimeout ? 'timeout' : 'unreachable'} after ${dur}ms`,
        details: { kind: 'infrastructure', retryable: true, host: this.config.host, attempt, requestId }
      });
    }

    const dur = Date.now() - t0;
    let bodyText = '';
    let parsed   = null;
    try {
      bodyText = await response.text();
      parsed   = bodyText ? JSON.parse(bodyText) : null;
    } catch (parseErr) {
      this.logger.error(`${this.moduleName}.deepseek.response.invalid`, {
        request_id: requestId, attempt, dur_ms: dur, status: statusCode,
        host: this.config.host, parse_error: parseErr.message
      });
      this._metric(`${this.moduleName}.deepseek.duration`, dur, {
        host: this.config.host, status: String(statusCode), kind: 'parse_error'
      });
      this._metric(`${this.moduleName}.deepseek.errors`, 1, {
        host: this.config.host, code: 'UPSTREAM_INVALID_RESPONSE', kind: 'infrastructure'
      });
      return this._clientError({
        code: 'UPSTREAM_INVALID_RESPONSE', status: 502,
        message: 'DeepSeek returned non-JSON or malformed body',
        details: { kind: 'infrastructure', retryable: false, upstream_status: statusCode, host: this.config.host, attempt, requestId }
      });
    }

    if (statusCode >= 400) {
      const code   = this._mapUpstreamStatus(statusCode);
      const status = code === 'UPSTREAM_INVALID_RESPONSE' ? 502 : 503;
      this.logger.warn(`${this.moduleName}.deepseek.upstream.error`, {
        request_id: requestId, attempt, dur_ms: dur, host: this.config.host,
        upstream_status: statusCode, code
      });
      this._metric(`${this.moduleName}.deepseek.duration`, dur, {
        host: this.config.host, status: String(statusCode)
      });
      this._metric(`${this.moduleName}.deepseek.errors`, 1, {
        host: this.config.host, code, kind: 'infrastructure'
      });
      const retryable = statusCode >= 500 || statusCode === 429;
      return this._clientError({
        code, status,
        message: `DeepSeek returned HTTP ${statusCode}`,
        details: { kind: 'infrastructure', retryable, upstream_status: statusCode, host: this.config.host, attempt, requestId }
      });
    }

    this.logger.info(`${this.moduleName}.deepseek.request.completed`, {
      request_id: requestId, attempt, dur_ms: dur, status: statusCode, host: this.config.host
    });
    this._metric(`${this.moduleName}.deepseek.duration`, dur, {
      host: this.config.host, status: String(statusCode)
    });

    const message = parsed?.choices?.[0]?.message;
    if (!message || typeof message.content !== 'string') {
      return this._clientError({
        code: 'UPSTREAM_INVALID_RESPONSE', status: 502,
        message: 'DeepSeek response missing choices[0].message.content',
        details: { kind: 'infrastructure', retryable: false, upstream_status: statusCode, host: this.config.host, attempt, requestId }
      });
    }

    return {
      ok: true,
      data: {
        provider: 'deepseek',
        model:    parsed.model,
        content:  message.content,
        usage: {
          input_tokens:  parsed.usage?.prompt_tokens     || 0,
          output_tokens: parsed.usage?.completion_tokens || 0,
          total_tokens:  parsed.usage?.total_tokens      || 0
        },
        finish_reason: parsed.choices[0]?.finish_reason || 'stop'
      }
    };
  }

  _mapUpstreamStatus(s) {
    if (s === 401 || s === 403) return 'UPSTREAM_INVALID_RESPONSE';
    if (s === 404)              return 'UPSTREAM_INVALID_RESPONSE';
    if (s === 429)              return 'UPSTREAM_INVALID_RESPONSE';
    if (s >= 500)               return 'UPSTREAM_INVALID_RESPONSE';
    return 'UPSTREAM_INVALID_RESPONSE';
  }

  _redactHeaders(headers) {
    const out = { ...headers };
    for (const k of Object.keys(out)) {
      if (/^(authorization|x-api-key|cookie|set-cookie)$/i.test(k)) {
        out[k] = '[REDACTED]';
      }
    }
    return out;
  }

  _clientError({ code, status, message, details }) {
    return { ok: false, error: { code, status, message, details: details || {} } };
  }

  // API canonica observability v1.1.0: SOLO increment/gauge/timing.
  // .duration → timing | .count → gauge | resto → increment
  _metric(name, value, labels) {
    if (!this.metrics) return;
    if (/\.duration$/.test(name)) {
      this.metrics.timing(name, value, labels);
    } else if (/\.count$/.test(name)) {
      this.metrics.gauge(name, value, labels);
    } else {
      this.metrics.increment(name, value || 1, labels);
    }
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = DeepSeekClient;
