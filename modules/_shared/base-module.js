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
   * Heurística para mapear err.message a código canónico de errors.contract.
   * Patrón POC2: catch genérico → _classifyHandlerError → código + status.
   *
   * Códigos devueltos son SIEMPRE canónicos del catalogo errors.contract.
   * Si el módulo necesita un código específico (e.g. RATE_LIMITED, UPSTREAM_UNREACHABLE,
   * RESOURCE_NOT_FOUND), debe asignarlo a `err._code` antes del throw — _handleHandlerError
   * lo respeta como precedencia sobre la heurística.
   */
  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('not configured')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation') || msg.includes('not supported') || msg.includes('missing')) return 'INVALID_INPUT';
    if (msg.includes('authentication') || msg.includes('credential') || msg.includes('login')) return 'AUTHENTICATION_REQUIRED';
    if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('permission') || msg.includes('access denied')) return 'PERMISSION_DENIED';
    if (msg.includes('already')) return 'ALREADY_EXISTS';
    if (msg.includes('conflict')) return 'CONFLICT_STATE';
    if (msg.includes('timeout')) return 'UPSTREAM_TIMEOUT';
    if (msg.includes('unavailable') || msg.includes('not available') || msg.includes('disconnected') || msg.includes('unreachable')) return 'UPSTREAM_UNREACHABLE';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Mapeo canonico de codigo → HTTP status. Aislado para que subclases con
   * codigos custom puedan extender el mapeo sin reescribir _handleHandlerError.
   */
  _statusFromCode(code) {
    switch (code) {
      case 'INVALID_INPUT':              return 400;
      case 'AUTHENTICATION_REQUIRED':    return 401;
      case 'PERMISSION_DENIED':          return 403;
      case 'RESOURCE_NOT_FOUND':         return 404;
      case 'CONFLICT_STATE':
      case 'ALREADY_EXISTS':             return 409;
      case 'PRECONDITION_FAILED':        return 422;
      case 'RATE_LIMITED':               return 429;
      case 'UPSTREAM_INVALID_RESPONSE':  return 502;
      case 'UPSTREAM_UNREACHABLE':
      case 'SYSTEM_RESOURCE_EXHAUSTED':  return 503;
      case 'UPSTREAM_TIMEOUT':           return 504;
      case 'UNKNOWN_ERROR':
      default:                           return 500;
    }
  }

  /**
   * Enriquece un error con contexto del modulo SIN sobreescribir lo que ya
   * tuviera. El payload de enrichment se acumula en err._enrichment y
   * _handleHandlerError lo propaga a `details` de la respuesta canonica.
   *
   * Patron: "el modulo habla sobre si mismo". BaseModule manda en la forma
   * (status, code, message). El modulo aporta contexto del dominio:
   * entity_type, entity_id, operation, cualquier dato que ayude a entender
   * que estaba intentando hacer.
   *
   * Si el error pasa por varios modulos, cada uno enriquece sin perder lo
   * anterior — el payload final lleva la cadena causal completa.
   *
   * @example
   *   throw this._enrich(new Error('Credencial no encontrada'), {
   *     entity_type: 'credential',
   *     entity_id: credentialId,
   *     operation: 'lookup'
   *   });
   */
  _enrich(err, data) {
    err._enrichment = { ...(err._enrichment || {}), ...data };
    return err;
  }

  /**
   * Wrapper canónico del catch de un handler:
   *   1. respeta err._code si la subclase lo asigno antes de throw
   *   2. si no, clasifica el error con _classifyHandlerError
   *   3. mapea código a status HTTP (via _statusFromCode)
   *   4. emite logger.error con código + contexto enriquecido
   *   5. emite metrics.increment del namespace del módulo
   *   6. retorna shape canónico { status, error: { code, message, details? } }
   *      donde details acumula err._enrichment (lo que el modulo añadió) +
   *      lo que el handler reporta en su llamada (kind, module).
   */
  _handleHandlerError(logEvent, err, kind) {
    const code = err?._code || this._classifyHandlerError(err);
    const status = this._statusFromCode(code);
    const message = err?.message || String(err);
    const enrichment = err?._enrichment || {};
    const details = Object.keys(enrichment).length > 0
      ? { ...enrichment, module: this.name, kind }
      : (err?._details || undefined);
    this.logger?.error(logEvent, { error: message, code, ...enrichment, kind });
    this.metrics?.increment(`${this.name}.errors`, { kind, code });
    return this._errorResponse(status, code, message, details);
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
