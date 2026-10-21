/**
 * nichos/escalones-mensaje — REFLEJO JS (bloque G del vertical NICHOS, G2).
 *
 * Clasifica cada evento de dominio en uno de cuatro escalones de notificación:
 *   PULSO    — informativo de fondo.
 *   ALERTA   — requiere atención pronto.
 *   DECISION — requiere respuesta del dueño.
 *   SILENCIO — el perfil pide no notificar este tipo.
 *
 * La clasificación combina:
 *   1. Tipo de evento → escalón por defecto (tabla canónica).
 *   2. Perfil de supervisión del dueño (H2) → override si el dueño ajustó.
 *
 * Sin estado propio — REFLEJO puro, determinista. La tabla canónica mapea
 * familias de eventos a escalones por defecto; el perfil del dueño puede
 * subir o bajar el escalón.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

/**
 * Escalones válidos, de menor a mayor urgencia.
 */
const ESCALONES = ['SILENCIO', 'PULSO', 'ALERTA', 'DECISION'];

/**
 * Tabla canónica: familia de evento → escalón por defecto.
 * El tipo del evento se normaliza tomando los dos primeros segmentos tras 'nichos.'
 * (p.ej. 'nichos.sangria.alerta.emitida' → 'sangria.alerta').
 */
const TABLA_DEFECTO = {
  // -- DECISION (requiere respuesta del dueño)
  'decision.solicitud':     'DECISION',
  'gate.operar':            'DECISION',
  'puente.humano':          'DECISION',

  // -- ALERTA (atención pronta)
  'sangria.alerta':         'ALERTA',
  'cobro.failed':           'ALERTA',
  'distribucion.failed':    'ALERTA',
  'construccion.failed':    'ALERTA',
  'sondeo.failed':          'ALERTA',
  'fallo.reintentado':      'ALERTA',

  // -- PULSO (informativo de fondo)
  'semilla.capturada':      'PULSO',
  'semilla.normalizada':    'PULSO',
  'candidato.detectado':    'PULSO',
  'sondeo.completado':      'PULSO',
  'veredicto.emitido':      'PULSO',
  'construccion.completada':'PULSO',
  'cobro.registrado':       'PULSO',
  'distribucion.realizada': 'PULSO',
  'salud.recalculada':      'PULSO',
  'pulso.avance':           'PULSO',
  'pipeline.transicion':    'PULSO',
  'portafolio.recalculado': 'PULSO',
  'umbral.ajustado':        'PULSO',
  'fuente.consumida':       'PULSO',
  'canal.registrado':       'PULSO'
};

class EscalonesMensaje extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escalones-mensaje';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'nichos.escalon.clasificar.response', d => this._clasificar(d));
  }

  // =============================================================
  // PROYECCIÓN — clasificación determinista
  // =============================================================

  /**
   * _clasificar — clasifica un evento de dominio en PULSO|ALERTA|DECISION|SILENCIO.
   *
   * @param {Object} input
   * @param {Object} input.evento_dominio - { tipo, fuente?, payload? }
   * @param {string} [input.project_id]
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _clasificar(input) {
    if (!input.evento_dominio || typeof input.evento_dominio !== 'object') {
      return this._invalid('evento_dominio');
    }

    const evento = input.evento_dominio;
    if (!evento.tipo) return this._invalid('evento_dominio.tipo');

    // 1. Escalón por defecto (tabla canónica)
    const clave = this._claveEvento(evento.tipo);
    let escalon = TABLA_DEFECTO[clave] || 'PULSO';

    // 2. Override por perfil de supervisión (H2)
    const perfil = await this._leerPerfilSupervision(input.project_id, input.correlation_id);
    if (perfil && perfil.escalones && perfil.escalones[clave]) {
      const override = perfil.escalones[clave];
      if (ESCALONES.includes(override)) {
        escalon = override;
      }
    }

    // Si el perfil está en modo silencioso, todo baja a SILENCIO excepto DECISION
    if (perfil && perfil.modo === 'silencioso' && escalon !== 'DECISION') {
      escalon = 'SILENCIO';
    }

    const evento_ref = evento.tipo;

    // PULSO
    this.eventBus?.publish('nichos.escalon.clasificado', {
      evento_ref,
      escalon,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { escalon, evento_ref }
    };
  }

  // =============================================================
  // Utilidades
  // =============================================================

  /**
   * Extrae la clave de familia del evento para buscar en la tabla canónica.
   * 'nichos.sangria.alerta.emitida' → 'sangria.alerta'
   * 'nichos.cobro.registrado' → 'cobro.registrado'
   */
  _claveEvento(tipo) {
    if (!tipo || typeof tipo !== 'string') return '';
    const partes = tipo.replace(/^nichos\./, '').split('.');
    // Tomar los dos primeros segmentos (familia + subfamilia)
    return partes.slice(0, 2).join('.');
  }

  /**
   * Lee el perfil de supervisión del dueño via RPC a H2.
   */
  async _leerPerfilSupervision(project_id, correlation_id) {
    if (!this.eventBus?.publishAndWait) return null;
    try {
      const resp = await this.eventBus.publishAndWait(
        'nichos.perfil.supervision.leer.request',
        { project_id, correlation_id }
      );
      return (resp && resp.data && resp.data.perfil_supervision) || null;
    } catch (_) {
      // Degradación honesta: sin perfil, se usa la tabla por defecto
      return null;
    }
  }
}

module.exports = EscalonesMensaje;
