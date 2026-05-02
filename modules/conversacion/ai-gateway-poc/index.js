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
      moduleName:        this.name
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

  // Implementacion real en parcela 4. Aqui solo stubs para que el modulo cargue.

  async onLlmCompleteRequest(payload) {
    throw new Error('onLlmCompleteRequest: not implemented (parcela 4)');
  }

  async onCredentialResponse(payload) {
    // Stub minimo: el flujo real (resolver pending + cachear) viene en parcela 4.
    // Lo dejo no-op para que credential-manager pueda emitir sin romper tests.
  }

  async onCredentialSaved(payload) {
    // Stub: invalidacion de cache viene en parcela 4.
  }

  async onCredentialDeleted(payload) {
    // Stub: invalidacion de cache viene en parcela 4.
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
   * Emite metrica de forma defensiva (compatibilidad histogram/increment/observe).
   * Centraliza para que el resto del codigo no chequee this.metrics constantemente.
   */
  _emitMetric(name, value, labels) {
    if (!this.metrics) return;
    if (/duration$/.test(name) && typeof this.metrics.histogram === 'function') {
      this.metrics.histogram(name, value, labels);
    } else if (typeof this.metrics.increment === 'function') {
      this.metrics.increment(name, value || 1, labels);
    } else if (typeof this.metrics.observe === 'function') {
      this.metrics.observe(name, value, labels);
    }
  }
}

module.exports = AiGateway;
