'use strict';

/**
 * nichos/canal-distribucion — PUENTE JS (bloque K del vertical NICHOS, #49).
 *
 * Bridge hacia canales externos (telegram, whatsapp, email) vía bus del core.
 * Recibe un mensaje con destinatario, canal_tipo y contenido, formatea el
 * contenido según el canal y publica al bridge correspondiente.
 *
 * Sin estado. Bridge puro: transforma y reenvía.
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 * No hace HTTP directo: toda comunicación se delega al bus.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const CANALES_SOPORTADOS = ['telegram', 'whatsapp', 'email'];

class CanalDistribucion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'canal-distribucion';
    this.version = '0.1.0';
  }

  // ── RPC HANDLER ──
  onEnviarRequest(e) {
    return this._atender(e, 'enviar', 'nichos.canal.mensaje.enviar.response', d => this._enviar(d));
  }

  // =============================================================
  // PROYECCIÓN — formatea contenido por canal_tipo y publica
  // =============================================================

  /**
   * _enviar — formatea contenido por canal_tipo y publica al canal correspondiente.
   *
   * @param {Object} input
   * @param {string} input.destinatario  - destinatario (chat_id, email, phone)
   * @param {string} input.canal_tipo    - 'telegram', 'whatsapp', 'email'
   * @param {Object|string} input.contenido - contenido del mensaje
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _enviar(input) {
    if (!input.destinatario) return this._invalid('destinatario');
    if (!input.canal_tipo) return this._invalid('canal_tipo');
    if (!input.contenido) return this._invalid('contenido');

    if (!CANALES_SOPORTADOS.includes(input.canal_tipo)) {
      return this._errorResponse(
        400,
        'CANAL_NO_SOPORTADO',
        `canal_tipo '${input.canal_tipo}' fuera del catálogo soportado`,
        { canal_tipo: input.canal_tipo, canales_validos: CANALES_SOPORTADOS }
      );
    }

    const mensaje_id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const contenidoFormateado = this._formatearContenido(input.canal_tipo, input.contenido);

    // Delegar al bridge via bus
    const topicBridge = `${input.canal_tipo}.send.request`;
    const payloadBridge = {
      destino: input.destinatario,
      cuerpo: contenidoFormateado,
      correlation_id: input.correlation_id
    };

    try {
      await this._publishAlBus(topicBridge, payloadBridge);
    } catch (err) {
      // PULSO de fallo
      this.eventBus?.publish('nichos.canal.mensaje.enviar.failed', {
        mensaje_id,
        razon_codigo: 'ENVIO_FALLIDO',
        detalle: err.message || 'error al publicar al bridge',
        timestamp: nowISO()
      });

      return this._errorResponse(
        502,
        'ENVIO_FALLIDO',
        'error al publicar al bridge del canal',
        { canal_tipo: input.canal_tipo, destinatario: input.destinatario }
      );
    }

    // PULSO de éxito
    this.eventBus?.publish('nichos.canal.mensaje.enviado', {
      mensaje_id,
      canal_tipo: input.canal_tipo,
      destinatario: input.destinatario,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { mensaje_id, estado: 'enviado' }
    };
  }

  // =============================================================
  // Utilidades
  // =============================================================

  /**
   * Formatea el contenido según el canal_tipo.
   * Telegram: texto plano. WhatsApp: texto plano. Email: objeto con asunto+cuerpo.
   */
  _formatearContenido(canal_tipo, contenido) {
    if (typeof contenido === 'string') return contenido;

    switch (canal_tipo) {
      case 'telegram':
      case 'whatsapp':
        return contenido.cuerpo || contenido.texto || String(contenido);
      case 'email':
        return JSON.stringify({
          asunto: contenido.asunto || 'Notificación',
          cuerpo: contenido.cuerpo || contenido.texto || ''
        });
      default:
        return String(contenido);
    }
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

module.exports = CanalDistribucion;
