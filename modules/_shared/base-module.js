'use strict';

const crypto = require('crypto');

/**
 * BaseModule — clase base para módulos POC2.
 *
 * Encapsula los helpers canónicos que cada módulo migrado a POC2 ha
 * estado replicando por copy-paste:
 *   - _errorResponse
 *   - _classifyHandlerError
 *   - _statusFromCode
 *   - _handleHandlerError       (respeta err._code y propaga err._details)
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
   * Heurística para mapear err.message a código de errors.contract.
   * Patrón POC2: catch genérico → _classifyHandlerError → código + status.
   *
   * NOTA SOBRE CODIGOS TRANSITORIOS — esta version usa codigos historicos
   * de los modulos POC2 (VALIDATION_FAILED, AUTHORIZATION_REQUIRED, CONFLICT,
   * UPSTREAM_UNAVAILABLE, INTERNAL_ERROR). Los canonicos de errors.contract
   * son respectivamente INVALID_INPUT, AUTHENTICATION_REQUIRED, CONFLICT_STATE,
   * UPSTREAM_UNREACHABLE, UNKNOWN_ERROR. La normalizacion a canonico se hara
   * en una pasada coordinada que actualice todos los tests a la vez (no se puede
   * cambiar BaseModule sin romper los ~50 modulos que esperan los codigos viejos).
   */
  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('not configured')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation') || msg.includes('not supported')) return 'VALIDATION_FAILED';
    if (msg.includes('unauthorized') || msg.includes('forbidden')) return 'AUTHORIZATION_REQUIRED';
    if (msg.includes('conflict') || msg.includes('already')) return 'CONFLICT';
    if (msg.includes('timeout') || msg.includes('unavailable') || msg.includes('not available') || msg.includes('disconnected')) return 'UPSTREAM_UNAVAILABLE';
    return 'INTERNAL_ERROR';
  }

  /**
   * Mapeo codigo → HTTP status. Aislado para que subclases con codigos
   * adicionales puedan extender el mapping sin reescribir _handleHandlerError.
   */
  _statusFromCode(code) {
    switch (code) {
      case 'VALIDATION_FAILED':      return 400;
      case 'AUTHORIZATION_REQUIRED': return 403;
      case 'RESOURCE_NOT_FOUND':     return 404;
      case 'CONFLICT':               return 409;
      case 'UPSTREAM_UNAVAILABLE':   return 503;
      default:                       return 500;
    }
  }

  /**
   * Wrapper canónico del catch de un handler:
   *   1. respeta err._code si la subclase lo asigno antes de throw
   *   2. si no, clasifica el error con _classifyHandlerError
   *   3. mapea código a status HTTP (via _statusFromCode)
   *   4. emite logger.error con código
   *   5. emite metrics.increment del namespace del módulo
   *   6. retorna shape canónico { status, error: { code, message, details? } }
   *      propagando err._details si existe
   */
  _handleHandlerError(logEvent, err, kind) {
    const code = err?._code || this._classifyHandlerError(err);
    const status = this._statusFromCode(code);
    const message = err?.message || String(err);
    this.logger?.error(logEvent, { error: message, code });
    this.metrics?.increment(`${this.name}.errors`, { kind, code });
    return this._errorResponse(status, code, message, err?._details);
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
