'use strict';

const crypto = require('crypto');
const DeepSeekClient = require('./deepseek-client');

/**
 * ai-gateway POC v2.0.0 — deepseek-only.
 *
 * Aplica los 8 contratos arquitectonicos:
 *  - events:        publishes/subscribes declarados, _publicarEvento propaga correlation_id
 *  - lifecycle:     onLoad inicializa, onUnload limpia timeouts y caches (no leak)
 *  - observability: log + metric en cada operacion via _emitMetric
 *  - errors:        _buildErrorResponse / _buildSuccessResponse (shape canonico)
 *  - persistence:   in-memory con eviction TTL+LRU (declarado en module.json)
 *  - http:          DeepSeekClient con timeout obligatorio, mapeo upstream→UPSTREAM_*
 *  - naming:        language=en, verbos canonicos
 *  - glossary:      terminos cross-modulo (provider, model, tokens, cost)
 *
 * Esta parcela (3/6) trae lifecycle + helpers. Los handlers reales vienen
 * en la parcela 4/6.
 */
class AiGateway {
  constructor() {
    this.name = 'ai-gateway';

    // Inyectados en onLoad
    this.logger   = null;
    this.eventBus = null;
    this.metrics  = null;
    this.config   = null;

    // Estado in-memory (declarado en module.json.config.persistence)
    this.providers          = new Map(); // name → DeepSeekClient
    this.credentialCache    = new Map(); // 'provider:projectId' → { apiKey, expiresAt }
    this.pendingCredentials = new Map(); // request_id → { resolve, reject, timeout, cacheKey }
  }

  // ----------------------------------------------------------------- lifecycle

  async onLoad(context) {
    this.logger   = context.logger;
    this.eventBus = context.eventBus;
    this.metrics  = context.metrics || null;
    this.config   = context.moduleConfig || context.config || {};

    const clients = Array.isArray(this.config.http_clients) ? this.config.http_clients : [];
    const deepseekCfg = clients.find(c => c.name === 'deepseek');
    if (!deepseekCfg) {
      const msg = 'ai-gateway-poc: config.http_clients[deepseek] not declared in module.json';
      this.logger.error(`${this.name}.load.failed`, { reason: 'missing_http_client_deepseek' });
      throw new Error(msg);
    }

    this.providers.set('deepseek', new DeepSeekClient({
      config:            deepseekCfg,
      logger:            this.logger,
      metrics:           this.metrics,
      resolveCredential: (ref, projectId) => this._resolveCredential(ref, projectId),
      moduleName:        this.name,
      fetch:             context.fetch  // F7: opcional, undefined → DeepSeekClient usa global.fetch
    }));

    this.logger.info(`${this.name}.loaded`, {
      providers:  Array.from(this.providers.keys()),
      cache_ttl:  this.config.persistence?.eviction_strategy?.ttl_ms,
      cache_max:  this.config.persistence?.eviction_strategy?.max_entries
    });
    this._emitMetric(`${this.name}.lifecycle.loaded`, 1, {});
  }

  async onUnload() {
    let cleared = 0;
    for (const [requestId, pending] of this.pendingCredentials) {
      if (pending.timeout) { clearTimeout(pending.timeout); cleared++; }
      try { pending.reject?.(new Error('ai-gateway: module unloading')); } catch (_) {}
    }
    this.pendingCredentials.clear();
    this.credentialCache.clear();
    this.providers.clear();

    if (this.logger) {
      this.logger.info(`${this.name}.unloaded`, { cleared_timeouts: cleared });
    }
    this._emitMetric(`${this.name}.lifecycle.unloaded`, 1, { cleared_timeouts: cleared });
  }

  // ----------------------------------------------------------------- handlers

  /**
   * Handler de `llm.complete.request`. Entry point del POC.
   *
   * Payload esperado: { request_id, messages, model?, project_id?, max_tokens?,
   * temperature?, correlation_id? }.
   *
   * Publica `llm.complete.response` con el mismo request_id, en shape canonico
   * { request_id, status, data | error } (mutuamente excluyentes).
   */
  async onLlmCompleteRequest(payload) {
    const t0 = Date.now();
    const requestId = payload?.request_id;

    // Validacion estructural — sin request_id no hay manera de correlacionar
    const validation = this._validateRequest(payload);
    if (!validation.ok) {
      const errResp = this._buildErrorResponse({
        status: 400, code: 'VALIDATION_FAILED',
        message: validation.message,
        details: { kind: 'domain', retryable: false, field: validation.field }
      });
      this.logger.warn(`${this.name}.llm.request.invalid`, {
        request_id: requestId || null, code: 'VALIDATION_FAILED', field: validation.field
      });
      this._emitMetric(`${this.name}.llm.errors`, 1, {
        code: 'VALIDATION_FAILED', kind: 'domain'
      });
      await this._publicarEvento('llm.complete.response',
        { request_id: requestId || null, ...errResp },
        payload
      );
      return;
    }

    const { messages, model, project_id, max_tokens, temperature } = payload;
    const provider = this.providers.get('deepseek');

    let result;
    try {
      result = await provider.chatCompletion({
        messages,
        model,
        projectId:   project_id || null,
        maxTokens:   max_tokens,
        temperature,
        requestId
      });
    } catch (err) {
      // Excepcion inesperada del cliente — no deberia ocurrir, pero blindamos.
      this.logger.error(`${this.name}.llm.unexpected_error`, {
        request_id: requestId, error: err.message, stack: err.stack
      });
      this._emitMetric(`${this.name}.llm.errors`, 1, {
        code: 'INTERNAL_ERROR', kind: 'domain'
      });
      const errResp = this._buildErrorResponse({
        status: 500, code: 'INTERNAL_ERROR',
        message: 'Unexpected error during chat completion',
        details: { kind: 'domain', retryable: false }
      });
      await this._publicarEvento('llm.complete.response',
        { request_id: requestId, ...errResp },
        payload
      );
      return;
    }

    const dur = Date.now() - t0;
    this._emitMetric(`${this.name}.llm.duration`, dur, {
      provider: 'deepseek', status: result.ok ? 'ok' : 'error'
    });

    if (result.ok) {
      this.logger.info(`${this.name}.llm.completed`, {
        request_id: requestId, dur_ms: dur,
        provider: 'deepseek', model: result.data.model,
        tokens: result.data.usage?.total_tokens
      });
      const okResp = this._buildSuccessResponse({ status: 200, data: result.data });
      await this._publicarEvento('llm.complete.response',
        { request_id: requestId, ...okResp },
        payload
      );
      return;
    }

    // result.ok === false: el cliente ya emitio metric/log de la causa upstream.
    // Aqui solo trasladamos el shape interno al canonico.
    this._emitMetric(`${this.name}.llm.errors`, 1, {
      code: result.error.code, kind: result.error.details?.kind || 'infrastructure'
    });
    const errResp = this._buildErrorResponse({
      status:  result.error.status,
      code:    result.error.code,
      message: result.error.message,
      details: result.error.details
    });
    await this._publicarEvento('llm.complete.response',
      { request_id: requestId, ...errResp },
      payload
    );
  }

  /**
   * Handler de `credential.resolve.response`. Resuelve la promise pendiente
   * que disparo `_resolveCredential`. Payload: { request_id, api_key?, error? }.
   */
  async onCredentialResponse(payload) {
    const requestId = payload?.request_id;
    if (!requestId) return; // ignore — no correlation possible

    const pending = this.pendingCredentials.get(requestId);
    if (!pending) return;  // timeout ya disparo o response duplicada — drop silencioso

    this.pendingCredentials.delete(requestId);
    if (pending.timeout) clearTimeout(pending.timeout);

    if (payload.api_key) {
      pending.resolve(payload.api_key);
    } else {
      const reason = payload.error || 'credential not provided';
      this.logger.warn(`${this.name}.credential.resolve.failed`, {
        request_id: requestId, reason
      });
      this._emitMetric(`${this.name}.credential.errors`, 1, {
        code: 'CREDENTIAL_NOT_FOUND', kind: 'rejected'
      });
      pending.reject(new Error(reason));
    }
  }

  /**
   * Handler de `credential.saved` y `credential.updated`. Invalida la entrada
   * de cache del provider afectado (si project_id especificado, solo esa;
   * si no, todas las del provider).
   */
  async onCredentialSaved(payload) {
    const { provider, project_id } = payload || {};
    if (!provider) return;
    const removed = this._invalidateCacheForProvider(provider, project_id || null);
    if (removed > 0) {
      this.logger.info(`${this.name}.credential.cache.invalidated`, {
        provider, project_id: project_id || null, removed_entries: removed,
        reason: 'saved_or_updated'
      });
      this._emitMetric(`${this.name}.credential.cache.invalidations`, removed,
        { provider, reason: 'saved_or_updated' });
    }
  }

  /**
   * Handler de `credential.deleted`. Misma logica que saved/updated.
   */
  async onCredentialDeleted(payload) {
    const { provider, project_id } = payload || {};
    if (!provider) return;
    const removed = this._invalidateCacheForProvider(provider, project_id || null);
    if (removed > 0) {
      this.logger.info(`${this.name}.credential.cache.invalidated`, {
        provider, project_id: project_id || null, removed_entries: removed,
        reason: 'deleted'
      });
      this._emitMetric(`${this.name}.credential.cache.invalidations`, removed,
        { provider, reason: 'deleted' });
    }
  }

  // ----------------------------------------------------------------- helpers (canonicos)

  /**
   * Construye respuesta canonica de error segun errors.contract.
   * Shape: { status, error: { code, message, details } } — nunca incluye stack.
   */
  _buildErrorResponse({ status, code, message, details }) {
    return {
      status,
      error: {
        code,
        message,
        details: details || {}
      }
    };
  }

  /**
   * Construye respuesta canonica de exito. Mutuamente excluyente con error.
   * Shape: { status, data }.
   */
  _buildSuccessResponse({ status, data }) {
    return { status: status || 200, data };
  }

  /**
   * Helper canonico para publish. Propaga correlation_id desde el sourcePayload
   * si existe (events.contract: propagation in event chains).
   */
  async _publicarEvento(eventName, payload, sourcePayload = null) {
    const correlation_id = sourcePayload?.correlation_id || payload?.correlation_id || null;
    const outPayload = correlation_id
      ? { correlation_id, ...payload }
      : payload;
    await this.eventBus.publish(eventName, outPayload);
    this.logger.info(`${this.name}.event.published`, {
      event:          eventName,
      correlation_id: correlation_id
    });
  }

  /**
   * Resuelve una credencial via credential-manager event-driven.
   * Usa cache TTL+LRU (declarada en module.json.config.persistence.eviction_strategy).
   *
   * Devuelve la api key como string. Throws si timeout / credential-manager
   * rechaza / desconectado (manejado por el caller — DeepSeekClient lo traduce
   * a CREDENTIAL_NOT_FOUND).
   */
  _resolveCredential(credentialRef, projectId) {
    return new Promise((resolve, reject) => {
      const cacheKey = `${credentialRef}:${projectId || 'global'}`;
      const cached = this.credentialCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return resolve(cached.apiKey);
      }
      // Cache miss / expirado: pedir al bus
      const requestId = crypto.randomUUID();
      const timeoutMs = this.config.credential_resolve_timeout_ms || 5000;

      const timeout = setTimeout(() => {
        this.pendingCredentials.delete(requestId);
        this.logger.warn(`${this.name}.credential.resolve.timeout`, {
          request_id: requestId, provider: credentialRef, project_id: projectId, timeout_ms: timeoutMs
        });
        this._emitMetric(`${this.name}.credential.errors`, 1, {
          provider: credentialRef, code: 'CREDENTIAL_NOT_FOUND', kind: 'timeout'
        });
        reject(new Error(`credential resolve timeout (${timeoutMs}ms) for ${credentialRef}`));
      }, timeoutMs);

      this.pendingCredentials.set(requestId, {
        resolve: (apiKey) => {
          const ttlMs = this.config.persistence?.eviction_strategy?.ttl_ms || 300000;
          this.credentialCache.set(cacheKey, {
            apiKey,
            expiresAt: Date.now() + ttlMs
          });
          this._evictIfOverCapacity();
          resolve(apiKey);
        },
        reject,
        timeout,
        cacheKey
      });

      this.eventBus.publish('credential.resolve.request', {
        request_id: requestId,
        provider:   credentialRef,
        project_id: projectId || null
      });
    });
  }

  /**
   * Valida el payload de `llm.complete.request`. Retorna { ok: true } o
   * { ok: false, message, field }.
   */
  _validateRequest(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, message: 'payload missing or invalid', field: 'payload' };
    }
    if (!payload.request_id || typeof payload.request_id !== 'string') {
      return { ok: false, message: 'request_id is required (string)', field: 'request_id' };
    }
    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return { ok: false, message: 'messages must be a non-empty array', field: 'messages' };
    }
    const maxMsgs = this.config.max_messages_per_request || 100;
    if (payload.messages.length > maxMsgs) {
      return { ok: false, message: `messages exceeds limit (${maxMsgs})`, field: 'messages' };
    }
    const maxLen = this.config.max_message_length || 100000;
    for (let i = 0; i < payload.messages.length; i++) {
      const m = payload.messages[i];
      if (!m || typeof m !== 'object') {
        return { ok: false, message: `messages[${i}] must be an object`, field: `messages[${i}]` };
      }
      if (typeof m.content === 'string' && m.content.length > maxLen) {
        return { ok: false, message: `messages[${i}].content exceeds limit (${maxLen})`, field: `messages[${i}].content` };
      }
    }
    return { ok: true };
  }

  /**
   * Invalida entradas de credentialCache para un provider. Si projectId se
   * especifica, solo borra esa entrada; si no, borra todas las del provider.
   * Retorna el numero de entradas eliminadas.
   */
  _invalidateCacheForProvider(provider, projectId) {
    let removed = 0;
    const exactKey = projectId ? `${provider}:${projectId}` : null;
    for (const key of Array.from(this.credentialCache.keys())) {
      const matches = exactKey
        ? key === exactKey
        : key.startsWith(`${provider}:`);
      if (matches) {
        this.credentialCache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Eviction simple por expiresAt (proxy LRU): elimina entrada con menor
   * expiresAt cuando se supera max_entries.
   */
  _evictIfOverCapacity() {
    const max = this.config.persistence?.eviction_strategy?.max_entries || 100;
    while (this.credentialCache.size > max) {
      let oldestKey = null;
      let oldestExp = Infinity;
      for (const [k, v] of this.credentialCache) {
        if (v.expiresAt < oldestExp) { oldestExp = v.expiresAt; oldestKey = k; }
      }
      if (!oldestKey) break;
      this.credentialCache.delete(oldestKey);
    }
  }

  /**
   * Emite metrica usando SOLO la API canonica del contrato observability v1.1.0
   * (allowed: increment | gauge | timing). Sin helpers defensivos.
   *
   * Convencion por sufijo:
   *   .duration → timing(name, ms, labels)
   *   .count    → gauge(name, value, labels)
   *   resto     → increment(name, delta, labels)   (.total, .errors, .bytes, etc.)
   *
   * El core garantiza que this.metrics expone los 3 metodos. Si no estan,
   * el modulo falla en onLoad — fail fast en vez de silencio.
   */
  _emitMetric(name, value, labels) {
    if (!this.metrics) return;
    if (/\.duration$/.test(name)) {
      this.metrics.timing(name, value, labels);
    } else if (/\.count$/.test(name)) {
      this.metrics.gauge(name, value, labels);
    } else {
      this.metrics.increment(name, value || 1, labels);
    }
  }
}

module.exports = AiGateway;
