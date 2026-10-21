'use strict';

/**
 * nichos/manejo-fallo — REFLEJO JS (bloque K del vertical NICHOS, #51).
 *
 * Clasifica fallos y decide la acción de recuperación:
 *   REINTENTAR — fallo transitorio (timeout, red, rate-limit).
 *   ESCALAR    — fallo grave (credenciales, permisos, datos corruptos).
 *   CORTAR     — fallo fatal (recurso eliminado, constraint violado).
 *
 * Registra en historial y escala via puente humano si procede.
 *
 * Sin estado. REFLEJO puro, determinista.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

/**
 * Clasificación de fallos: patrones en el código/mensaje → categoría.
 */
const PATRONES_TRANSITORIO = [
  'timeout', 'econnreset', 'econnrefused', 'enotfound',
  'rate_limit', 'rate_limited', 'too_many_requests',
  'service_unavailable', 'temporarily_unavailable',
  'network', 'socket', 'etimedout'
];

const PATRONES_FATAL = [
  'not_found', 'resource_deleted', 'constraint_violated',
  'schema_mismatch', 'irrecoverable', 'fatal'
];

class ManejoFallo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'manejo-fallo';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onGestionarRequest(e) {
    return this._atender(e, 'gestionar', 'nichos.fallo.gestionar.response', d => this._gestionar(d));
  }

  // =============================================================
  // PROYECCIONES — clasifica y decide
  // =============================================================

  /**
   * _gestionar — clasifica el fallo y decide la acción de recuperación.
   *
   * @param {Object} input
   * @param {string} input.id_nicho   - identificador del nicho afectado
   * @param {string} input.origen     - módulo/operación que falló
   * @param {Object|string} input.error - error original { code?, message? } o string
   * @param {Object} [input.contexto] - contexto adicional del fallo
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _gestionar(input) {
    if (!input.id_nicho) return this._invalid('id_nicho');
    if (!input.origen) return this._invalid('origen');
    if (!input.error) return this._invalid('error');

    const clasificacion = this._clasificarFallo(input.error);
    let accion_tomada;

    switch (clasificacion) {
      case 'transitorio':
        accion_tomada = 'REINTENTAR';
        // Solicitar reintento del pipeline
        await this._publishAlBus('nichos.pipeline.transitar.request', {
          id_nicho: input.id_nicho,
          accion: 'reintentar',
          origen: input.origen
        });
        break;

      case 'grave':
        accion_tomada = 'ESCALAR';
        // Alzar puente humano para decisión del dueño
        await this._publishAlBus('nichos.puente.humano.alzar.request', {
          tipo: 'fallo_grave',
          prioridad: 'alta',
          detalle: {
            id_nicho: input.id_nicho,
            origen: input.origen,
            error: this._extraerMensajeError(input.error),
            contexto: input.contexto || null
          }
        });
        break;

      case 'fatal':
        accion_tomada = 'CORTAR';
        // Cortar el pipeline
        await this._publishAlBus('nichos.pipeline.transitar.request', {
          id_nicho: input.id_nicho,
          accion: 'cortar',
          origen: input.origen,
          razon: this._extraerMensajeError(input.error)
        });
        break;
    }

    // Registrar en historial
    await this._publishAlBus('nichos.historial.registrar.request', {
      id_nicho: input.id_nicho,
      tipo: 'fallo',
      detalle: {
        origen: input.origen,
        clasificacion,
        accion_tomada,
        error: this._extraerMensajeError(input.error),
        contexto: input.contexto || null,
        timestamp: nowISO()
      }
    });

    // PULSO
    this.eventBus?.publish('nichos.fallo.gestionado', {
      id_nicho: input.id_nicho,
      origen: input.origen,
      accion_tomada,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { accion_tomada }
    };
  }

  /**
   * _clasificarFallo — clasifica un error en transitorio, grave o fatal.
   *
   * @param {Object|string} error - { code?, message? } o string
   * @returns {'transitorio'|'grave'|'fatal'}
   */
  _clasificarFallo(error) {
    const texto = this._extraerMensajeError(error).toLowerCase();
    const codigo = (typeof error === 'object' && error.code || '').toLowerCase();
    const combinado = `${codigo} ${texto}`;

    if (PATRONES_FATAL.some(p => combinado.includes(p))) return 'fatal';
    if (PATRONES_TRANSITORIO.some(p => combinado.includes(p))) return 'transitorio';
    // Por defecto: grave (requiere intervención humana)
    return 'grave';
  }

  // =============================================================
  // Utilidades
  // =============================================================

  _extraerMensajeError(error) {
    if (typeof error === 'string') return error;
    if (typeof error === 'object') return error.message || error.code || JSON.stringify(error);
    return String(error);
  }

  async _publishAlBus(topic, payload) {
    if (this.eventBus?.publishAndWait) {
      try {
        return await this.eventBus.publishAndWait(topic, payload);
      } catch (_) { /* degradación: fire-and-forget */ }
    }
    this.eventBus?.publish(topic, payload);
  }
}

module.exports = ManejoFallo;
