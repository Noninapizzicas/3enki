'use strict';

const crypto = require('crypto');

/**
 * BaseModule — clase base para módulos POC2.
 *
 * Encapsula los 4 helpers canónicos que cada módulo migrado a POC2 ha
 * estado replicando por copy-paste:
 *   - _errorResponse
 *   - _classifyHandlerError
 *   - _handleHandlerError
 *   - _publicarEvento
 *
 * Cualquier módulo que herede de BaseModule obtiene los helpers sin
 * tener que copiarlos. Bugs corregidos en estos helpers se reflejan
 * automáticamente en todos los módulos.
 *
 * Convenciones del subclase:
 *   - constructor: setear this.name (string) y this.version (semver).
 *     BaseModule usa this.name como prefijo del namespace de métricas
 *     en _handleHandlerError (`${this.name}.errors`).
 *   - onLoad(context): asignar this.logger, this.metrics, this.eventBus
 *     desde el context inyectado por el loader.
 *   - Los helpers asumen que esos campos están disponibles. Si el
 *     módulo no tiene logger/metrics, los métodos degradan (no throw).
 *
 * NO incluye en este BaseModule:
 *   - _classifyExecutionError — específico de módulos que llaman upstream HTTP.
 *     Cada módulo que lo necesite lo define propio.
 *   - _db, _ensureSchema — específicos de módulos que persisten en SQLite.
 *   - _fetchWithTimeout — específico de módulos con I/O HTTP.
 *   - Lifecycle (onLoad/onUnload) — cada módulo tiene su propia secuencia.
 *
 * Estos extras se pueden añadir como mixins futuros si el dolor justifica
 * la abstracción.
 *
 * Origen: principio dolor-guía-diseño documentado en
 * arquitectura/decisiones/propuestas/principio-dolor-guia-diseno.md.
 * Dolor observado: 50+ módulos POC2 con copia idéntica de los 4 helpers.
 */
class BaseModule {
  constructor() {
    this.name = 'base';      // subclase debe sobreescribir
    this.version = '0.0.0';  // subclase debe sobreescribir
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
  }

  /**
   * Shape canónico de respuesta de handler. Sin side effects, pura.
   *
   * @param {number} status - HTTP status (200, 400, 404, etc)
   * @param {string} code - error code del catálogo errors.contract (canónico)
   * @param {string} message - mensaje legible
   * @param {object} [details] - estructura opcional con info adicional
   * @returns {{ status: number, error: { code, message, details? } }}
   */
  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  /**
   * Heurística para mapear err.message a código canónico de errors.contract.
   * Patrón POC2: catch genérico → _classifyHandlerError → código + status.
   *
   * Retorna 'INTERNAL_ERROR' como fallback por compatibilidad con módulos
   * existentes. El canónico correcto es 'UNKNOWN_ERROR' (per errors.contract);
   * la migración a canónico se hará por módulo cuando sus tests se actualicen.
   */
  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'VALIDATION_FAILED';
    if (msg.includes('unauthorized') || msg.includes('forbidden')) return 'AUTHORIZATION_REQUIRED';
    if (msg.includes('conflict') || msg.includes('already')) return 'CONFLICT';
    return 'INTERNAL_ERROR';
  }

  /**
   * Wrapper canónico del catch de un handler:
   *   1. clasifica el error a código canónico
   *   2. mapea código a status HTTP
   *   3. emite logger.error con código
   *   4. emite metrics.increment del namespace del módulo
   *   5. retorna shape canónico { status, error }
   */
  _handleHandlerError(logEvent, err, kind) {
    const code = this._classifyHandlerError(err);
    const status = code === 'VALIDATION_FAILED' ? 400 :
                   code === 'RESOURCE_NOT_FOUND' ? 404 :
                   code === 'AUTHORIZATION_REQUIRED' ? 403 :
                   code === 'CONFLICT' ? 409 : 500;
    this.logger?.error(logEvent, { error: err.message, code });
    this.metrics?.increment(`${this.name}.errors`, { kind, code });
    return this._errorResponse(status, code, err.message);
  }

  /**
   * Publica evento al bus enriqueciendo con correlation_id (propagado del
   * sourcePayload si existe, generado nuevo si no) y timestamp ISO.
   *
   * sourcePayload típicamente es el `data` del evento entrante que
   * disparó el handler — permite trazar causalidad cross-event con un
   * correlation_id estable.
   */
  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }
}

module.exports = BaseModule;
