/**
 * nichos/puerto-canal — PUENTE JS (bloque G del vertical NICHOS, G1).
 *
 * Fachada de canales de comunicación (Telegram, WhatsApp, email) que desacopla
 * al vertical del proveedor concreto. Tres operaciones:
 *
 *   1. ENVIAR  — resuelve canal por propósito/destino, publica al bridge y confirma.
 *   2. REGISTRAR — da de alta canal↔proyecto↔propósito.
 *   3. RECIBIR — escucha mensajes del bridge (telegram.text.received) y los
 *                republica como nichos.canal.mensaje.recibido.
 *
 * Store opcional en memoria: mapa de atajos canal↔propósito↔proyecto.
 * No persiste a disco (los registros viven en channel-manager vía bus).
 *
 * Patrón: ModuloHibridoReflejo (mitad REFLEJO, JS determinista).
 * No hace HTTP directo: toda comunicación se delega al bus.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

const CANALES_CONOCIDOS = ['telegram', 'whatsapp', 'email'];

class PuertoCanal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-canal';
    this.version = '0.1.0';
    // Registro en memoria: { 'canal:external_id' → { project_id, purpose } }
    this.registros = new Map();
  }

  // ── RPC HANDLERS ──
  onEnviarRequest(e) {
    return this._atender(e, 'enviar', 'nichos.canal.enviar.response', d => this._enviar(d));
  }

  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'nichos.canal.registrar.response', d => this._registrar(d));
  }

  // ── LISTENER (fire-and-forget entrante) ──
  onTelegramText(e) {
    const d = (e && (e.data || e)) || {};
    this.eventBus?.publish('nichos.canal.mensaje.recibido', {
      canal: 'telegram',
      autor: d.from || d.chat_id || 'desconocido',
      cuerpo: d.text || '',
      meta: {
        chat_id: d.chat_id,
        date: d.date,
        message_id: d.message_id
      },
      timestamp: nowISO()
    });
  }

  // =============================================================
  // PROYECCIONES — lógica de dominio pura
  // =============================================================

  /**
   * _enviar — envía un mensaje por el canal resuelto por propósito/destino.
   *
   * @param {Object} input
   * @param {string} [input.canal]      - canal explícito ('telegram', 'whatsapp', 'email')
   * @param {string} input.destino      - destinatario (chat_id, email, phone)
   * @param {Object} input.mensaje      - { cuerpo, asunto?, escalon? }
   * @param {string} [input.correlation_id]
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  async _enviar(input) {
    if (!input.destino) return this._invalid('destino');
    if (!input.mensaje || typeof input.mensaje !== 'object') return this._invalid('mensaje');

    const canal = input.canal || this._resolverCanal(input.destino);
    if (!canal) {
      return this._errorResponse(
        400,
        'CANAL_NO_RESUELTO',
        'no se pudo resolver el canal para el destino indicado',
        { destino: input.destino }
      );
    }

    if (!CANALES_CONOCIDOS.includes(canal)) {
      return this._errorResponse(
        400,
        'CANAL_DESCONOCIDO',
        `canal '${canal}' fuera del catálogo conocido`,
        { canal, canales_validos: CANALES_CONOCIDOS }
      );
    }

    // Delegar al bridge via bus
    const topicBridge = `${canal}.send.request`;
    const payloadBridge = {
      destino: input.destino,
      cuerpo: input.mensaje.cuerpo || '',
      asunto: input.mensaje.asunto,
      correlation_id: input.correlation_id
    };

    const confirmacion_ref = `${canal}:${input.destino}:${Date.now()}`;

    await this._publishAlBus(topicBridge, payloadBridge);

    // PULSO
    this.eventBus?.publish('nichos.canal.mensaje.enviado', {
      canal,
      destino: input.destino,
      escalon: input.mensaje.escalon || null,
      confirmacion_ref,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { confirmacion: { ref: confirmacion_ref, canal, destino: input.destino } }
    };
  }

  /**
   * _registrar — da de alta canal↔proyecto↔propósito.
   *
   * @param {Object} input
   * @param {string} input.canal       - 'telegram', 'whatsapp', 'email'
   * @param {string} input.external_id - id externo del canal (chat_id, phone, email)
   * @param {string} input.project_id
   * @param {string} input.purpose     - propósito ('soporte', 'ventas', 'notificacion')
   * @returns {{ status:number, data?:Object, error?:Object }}
   */
  _registrar(input) {
    if (!input.canal) return this._invalid('canal');
    if (!input.external_id) return this._invalid('external_id');
    if (!input.project_id) return this._invalid('project_id');
    if (!input.purpose) return this._invalid('purpose');

    if (!CANALES_CONOCIDOS.includes(input.canal)) {
      return this._errorResponse(
        400,
        'CANAL_DESCONOCIDO',
        `canal '${input.canal}' fuera del catálogo conocido`,
        { canal: input.canal, canales_validos: CANALES_CONOCIDOS }
      );
    }

    const key = `${input.canal}:${input.external_id}`;
    this.registros.set(key, {
      project_id: input.project_id,
      purpose: input.purpose,
      at: nowISO()
    });

    this.eventBus?.publish('nichos.canal.registrado', {
      canal: input.canal,
      external_id: input.external_id,
      project_id: input.project_id,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        registrado: {
          canal: input.canal,
          external_id: input.external_id,
          project_id: input.project_id,
          purpose: input.purpose
        }
      }
    };
  }

  // =============================================================
  // Utilidades
  // =============================================================

  /**
   * Resuelve el canal a partir del destino (heurística simple).
   * Si el destino tiene '@' → email; si empieza con '+' → whatsapp; resto → telegram.
   */
  _resolverCanal(destino) {
    if (!destino) return null;
    if (typeof destino === 'string') {
      if (destino.includes('@')) return 'email';
      if (destino.startsWith('+')) return 'whatsapp';
    }
    return 'telegram';
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

module.exports = PuertoCanal;
