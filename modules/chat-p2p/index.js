'use strict';

const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const REGISTRO_DEFAULT = './data/chat-p2p/registro.json';

/**
 * ChatP2P — canal AGENTES→AGENTES (puente chat ⇄ chat por proyecto).
 *
 * ENTRANTE  : chat.p2p.enviar.request { botName:'chat-p2p', from_project_id,
 *              to_project_id, message, correlation_id } — el emisor es OTRO
 *              chat de proyecto que ya tiene su propio project_id.
 * SALIENTE  : mqttRequest('conversation','send', {...}) — el MISMO circuito
 *              canónico que la web y telegram-bridge. La conversación destino
 *              se RESUELVE (conversation/list → última activa por updated_at
 *              DESC, verificado en chat-io handleList; si no hay ninguna,
 *              conversation/create 'P2P <from>'). Contrato REAL de send
 *              (chat-io handleSend): conversation_id UUID OBLIGATORIO.
 * PERMISOS  : allowlist en el registro — solo los pares (from→to) que el
 *              dueño autoriza (default vacío = nadie). El dueño edita el
 *              fichero a mano (como telegram-bridge); el módulo SOLO lo lee.
 * ANTI-LOOP : si el mensaje entrante ya viaja con channel='p2p' o
 *              channel_context.from_project_id (viene de otro chat p2p), NO
 *              se reenvía — sería un eco infinito entre chats.
 * REGISTRO  : GLOBAL, solo lectura para el módulo (allowlist del dueño).
 * FORMA     : puente — traduce chat⇄chat sobre el bus, no toca el core.
 *              Reflejo puro determinista (sin blueprint: cero fuzzy).
 */
class ChatP2PModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'chat-p2p';
    this.version = '1.0.0';

    this.registro = { _updated_at: null, pares: [] };
    this.registroPath = REGISTRO_DEFAULT;
    this.mqttRequest = null;
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.mqttRequest = context?.mqttRequest || null;
    const cfg = context?.moduleConfig || {};
    if (cfg.registro_path) this.registroPath = cfg.registro_path;
    this._cargarRegistro();
    this.logger?.info('chat-p2p.loaded', {
      module: this.name, version: this.version,
      registro: this.registroPath,
      pares_autorizados: (this.registro.pares || []).length,
      mqttRequest: !!this.mqttRequest
    });
  }

  // =============================================================
  // Registro (GLOBAL, solo lectura — el dueño autoriza los pares
  // editando el fichero a mano, patrón telegram-bridge)
  // =============================================================

  _cargarRegistro() {
    try {
      const raw = fs.readFileSync(this.registroPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.pares)) {
        this.registro = { ...parsed, pares: parsed.pares };
      }
    } catch (_) {
      this.registro = { _updated_at: null, pares: [] };
    }
  }

  _autorizado(from, to) {
    return (this.registro.pares || []).some(p => p.from === from && p.to === to);
  }

  // =============================================================
  // ENTRANTE — chat.p2p.enviar.request (RPC request/response)
  // =============================================================

  onEnviarRequest(e) {
    return this._atender(e, 'enviar', 'chat.p2p.enviar.response', d => this._enviar(d));
  }

  async _enviar(input) {
    const { from_project_id: from, to_project_id: to, message, correlation_id } = input || {};

    if (!from || typeof from !== 'string') return this._invalid('from_project_id');
    if (!to || typeof to !== 'string') return this._invalid('to_project_id');
    if (!message || typeof message !== 'string') return this._invalid('message');

    // Anti-loop: un mensaje que ya viaja por el canal p2p (viene de otro
    // chat) NO se reenvía — sería un eco infinito entre chats.
    if (input.channel === 'p2p' || input.channel_context?.from_project_id) {
      this.metrics?.increment('chat-p2p.bucle.bloqueado');
      this.logger?.info('chat-p2p.bucle.bloqueado', { from, to, motivo: 'channel_context p2p' });
      return { status: 200, data: { entregado: false, motivo: 'bucle' } };
    }

    // Allowlist: solo los pares (from→to) que el dueño autorizó.
    if (!this._autorizado(from, to)) {
      this.metrics?.increment('chat-p2p.denegado');
      this.logger?.warn('chat-p2p.denegado', { from, to });
      return {
        status: 403,
        error: {
          code: 'FORBIDDEN',
          message: `par ${from}→${to} no autorizado en chat-p2p (allowlist del dueño)`,
          details: { from, to }
        }
      };
    }

    // Un proyecto no se habla a sí mismo (bucle por construcción).
    if (from === to) {
      return {
        status: 400,
        error: {
          code: 'SELF_SEND',
          message: 'un proyecto no puede enviarse mensajes a sí mismo',
          details: { project_id: from }
        }
      };
    }

    // Resolver la conversación DESTINO (mismo criterio que la web y
    // telegram-bridge: última activa del proyecto; si no hay, crea una).
    const conversation_id = await this._resolverConversacion(to, from);
    if (!conversation_id) {
      return this._fallo(from, to, 'conversation_resolve', 'no se pudo resolver/crear la conversación destino', correlation_id);
    }

    // Inyectar al chat destino — circuito canónico (el MISMO que la web).
    const res = await this._sendAlChat(to, conversation_id, {
      message,
      user_id: `p2p:${from}`,
      channel: 'p2p',
      channel_context: { from_project_id: from },
      correlation_id
    });

    if (!res || res.status !== 200) {
      const msg = (res && (res.error?.message || res.error)) || 'sin respuesta de conversation/send';
      this._fallo(from, to, 'chat_send', msg, correlation_id);
      return {
        status: 502,
        error: { code: 'CHAT_SEND_FAILED', message: msg, details: { from, to } }
      };
    }

    this.metrics?.increment('chat-p2p.enviado');
    this.eventBus.publish('chat.p2p.enviado', {
      from_project_id: from,
      to_project_id: to,
      conversation_id,
      correlation_id,
      timestamp: new Date().toISOString()
    });
    return {
      status: 200,
      data: {
        entregado: true,
        project_id: to,
        conversation_id: res.data?.conversation_id || conversation_id,
        message_id: res.data?.message_id || null
      }
    };
  }

  /**
   * RESUELVE la conversación destino del proyecto receptor (decisión del
   * dueño 'conversación lista y eliges', mismo criterio que telegram-bridge):
   *   1) conversation.list { project_id } → la primera es la ÚLTIMA ACTIVA
   *      (el backend ordena por updated_at DESC — chat-io handleList:
   *      ORDER BY c.updated_at DESC LIMIT ?). Su id es `id` (no
   *      conversation_id).
   *   2) Si hay alguna → su id (NO crea). Hilo unificado con la web.
   *   3) Si no hay ninguna (o list falla) → conversation.create
   *      { project_id, title: 'P2P <from>' }.
   */
  async _resolverConversacion(to, from) {
    if (!this.mqttRequest) return null;

    let res = null;
    try {
      res = await this.mqttRequest('conversation', 'list', { project_id: to });
    } catch (err) {
      this.logger?.error('chat-p2p.conversation.list_error', { project_id: to, error: err.message });
    }

    const convs = res?.data?.conversations;
    if (Array.isArray(convs) && convs.length > 0 && convs[0]?.id) {
      const activa = convs[0];
      this.metrics?.increment('chat-p2p.conversacion.reutilizada');
      this.logger?.info('chat-p2p.conversacion.reutilizada', {
        from, to, conversation_id: activa.id, titulo: activa.title, updated_at: activa.updated_at
      });
      return activa.id;
    }

    const creada = await this.mqttRequest('conversation', 'create', {
      project_id: to,
      title: `P2P ${from}`
    });
    const conv = creada?.data;
    const id = (conv && (conv.conversation_id || conv.conversation?.id)) || null;
    if (id) {
      this.metrics?.increment('chat-p2p.conversacion.creada');
      this.logger?.info('chat-p2p.conversacion.creada', { from, to, conversation_id: id });
    }
    return id;
  }

  async _sendAlChat(to, conversation_id, extra) {
    if (!this.mqttRequest) return null;
    try {
      return await this.mqttRequest('conversation', 'send', {
        project_id: to,
        conversation_id,
        ...extra
      });
    } catch (err) {
      this.logger?.error('chat-p2p.chat.send_error', { project_id: to, error: err.message });
      return null;
    }
  }

  // =============================================================
  // Utilidades
  // =============================================================

  _fallo(from, to, etapa, detalle, correlation_id) {
    const payload = {
      from_project_id: from, to_project_id: to, etapa, detalle,
      correlation_id,
      timestamp: new Date().toISOString()
    };
    this.logger?.error('chat-p2p.fallo', { from, to, etapa, detalle });
    this.eventBus.publish('chat.p2p.envio_fallido', payload);
    return {
      status: 502,
      error: { code: 'CHAT_P2P_FAILED', message: detalle, details: { etapa } }
    };
  }
}

module.exports = ChatP2PModule;
