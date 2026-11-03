'use strict';

/**
 * aviso-sala · PUENTE · PLAZA — I07 (AvisoSala).
 *
 * AVISA A UNA PERSONA DE LA SALA CON EL CASO Y SU TRAZA. Y si no hay nadie, el caso NO se pierde:
 * queda vivo y visible en la cola.
 *
 *   1. CON LA TRAZA. Qué se intentó, con qué números y por qué no pasó. Sin traza la sala sólo
 *      puede improvisar, y una improvisación sobre dinero es peor que un caso sin atender.
 *   2. EL AVISO NO CIERRA EL CASO. Que el mensaje salga no es que alguien lo haya mirado: el caso
 *      sale de la cola con un hecho que lo cierra (dictamen, cargo, alta completada).
 *   3. SI EL PLAZO VENCE, SUBE DE PRIORIDAD Y SIGUE VIVO. No se cierra solo ni «se resuelve» por
 *      defecto (Q40 [ABIERTO]: a las 23:40 de un sábado puede no haber nadie).
 *
 * Sin store: no escribe nada. El caso es de `cola-sala`; el transporte se INYECTA (en producción
 * `telegram.send_message.request`, en tests uno de mentira). Si el transporte falla, el hecho ya
 * está escrito y el caso ya está en la cola.
 *
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const TIMEOUT_ENVIO_MS = 5000;
const MAX_AVISOS = 500;

class AvisoSala extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'aviso-sala';
    this.version = 'puente-0.1.0';
    this._path = null;                     // sin estado: el caso y la cola tienen dueño

    this.bot = 'bocaos';
    this.sala_chat_id = null;             // destinatario declarado del despliegue (Q40)
    this.transporte = null;               // inyectable: { enviar(msg) → {ok, mensaje_id}|false }
    this._avisados = new Map();           // caso_id → { enviado_en, mensaje_id, vencido }
  }

  // ================= RPC del bus (una línea por op) =================
  onCasoRequest(e) { return this.servir(e, 'caso', 'aviso-sala.caso', (d) => this._caso(d)); }

  // ================= I07 · avisar =================
  async _caso(d) {
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    if (!plaza_id) return this._invalid('project_id');
    const caso = d.caso && typeof d.caso === 'object' ? d.caso : null;
    if (!caso && !d.caso_id) return this._invalid('caso');
    const caso_id = caso ? (caso.caso_id || caso.id) : d.caso_id;
    if (!caso_id) return this._invalid('caso.caso_id');

    const tipo = d.tipo || (caso && caso.tipo) || 'otro';
    const traza = d.traza && typeof d.traza === 'object' ? d.traza : null;
    if (!traza) {
      // I07 · sin traza, la sala sólo puede improvisar. Se dice, no se manda un aviso vacío.
      return this._errorResponse(409, 'SIN_TRAZA',
        'un aviso sin traza no es un aviso: la sala no puede mirar qué se intentó (I07)',
        { field: 'traza' });
    }

    const plazo = this._iso(d.plazo) || null;
    const ahora = this.ahora();
    const vencido = !!(plazo && Date.parse(plazo) < Date.parse(ahora));
    const destinatario = this._destinatario(d);

    // I07 · el caso entra en la cola SIEMPRE, haya aviso o no. Es la única forma de que no se
    // pierda cuando no hay nadie (Q40).
    this.eventBus.publish('cola-sala.encolar.request', {
      request_id: crypto.randomUUID(),
      project_id: plaza_id,
      plaza_id,
      caso: { ...caso, caso_id, tipo },
      caso_id,
      tipo,
      traza,
      plazo,
      vencido,
      prioridad_extra: vencido ? 1 : 0,
      pedidos_afectados: Number.isInteger(d.pedidos_afectados) ? d.pedidos_afectados : (d.pedido_id ? 1 : 0),
      origen: d.origen || this.name
    });

    if (!destinatario) {
      // Sin destinatario el aviso no sale — y el caso sigue en la cola, que es lo que importa.
      this.hecho('aviso-sala.fallido', {
        caso_id, plaza_id, tipo, plazo, vencido,
        motivo: 'no hay destinatario de sala declarado (Q40 [ABIERTO]): el caso queda vivo y visible en la cola',
        hueco: 'sin destinatario'
      });
      return {
        status: 202,
        data: {
          caso_id, avisado: false, en_cola: true, vencido,
          motivo: 'sin destinatario: el caso queda en la cola (I07)'
        }
      };
    }

    const texto = this._texto({ caso, caso_id, tipo, traza, plazo, vencido, plaza_id });
    const envio = await this._enviar({ chatId: destinatario, texto, caso_id });

    if (!envio || envio.ok !== true) {
      // El transporte falló. El hecho se dice igual: el caso ya está en la cola.
      this.hecho('aviso-sala.fallido', {
        caso_id, plaza_id, tipo, plazo, vencido, destinatario,
        motivo: (envio && envio.motivo) || 'el transporte no confirmó el envío',
        hueco: 'transporte',
        en_cola: true
      });
      return {
        status: 502,
        data: { caso_id, avisado: false, en_cola: true, vencido, motivo: 'el transporte no confirmó el envío' }
      };
    }

    this._avisados.set(caso_id, { enviado_en: ahora, mensaje_id: envio.mensaje_id || null, vencido });
    if (this._avisados.size > MAX_AVISOS) this._avisados.delete(this._avisados.keys().next().value);

    this.hecho('aviso-sala.enviado', {
      caso_id, plaza_id, tipo, plazo, vencido, destinatario,
      mensaje_id: envio.mensaje_id || null,
      // I07 · el aviso NO cierra el caso: el hecho lo dice para que nadie lo confunda.
      cierra_caso: false,
      motivo_vencido: vencido ? 'el plazo ya venció: el caso sube de prioridad y sigue vivo (P01)' : null
    });
    return {
      status: 201,
      data: {
        caso_id, avisado: true, en_cola: true, vencido,
        mensaje_id: envio.mensaje_id || null,
        cierra_caso: false
      }
    };
  }

  // El texto: caso + traza + plazo. La traza va ENTERA y con nombres de campo, no resumida a mano.
  _texto({ caso, caso_id, tipo, traza, plazo, vencido, plaza_id }) {
    const titulo = (caso && (caso.titulo || caso.asunto)) || `${tipo} ${caso_id}`;
    const lineas = [
      `[sala] ${titulo}`,
      `plaza: ${plaza_id} · caso: ${caso_id} · tipo: ${tipo}`,
      plazo ? `plazo: ${plazo}${vencido ? ' (VENCIDO: sigue vivo, sube de prioridad)' : ''}` : 'plazo: no consta (Q40)'
    ];
    const partes = caso && Array.isArray(caso.partes) ? caso.partes.join(' · ') : null;
    if (partes) lineas.push(`partes: ${partes}`);
    lineas.push('traza:');
    for (const [k, v] of Object.entries(traza)) {
      if (v === null || v === undefined) continue;
      lineas.push(`  · ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
    return lineas.join('\n');
  }

  // El transporte. Inyectable (tests / otro canal); por defecto, el servicio de Telegram.
  async _enviar({ chatId, texto }) {
    if (this.transporte && typeof this.transporte.enviar === 'function') {
      try {
        const r = await this.transporte.enviar({ chat: chatId, texto });
        if (!r) return { ok: false, motivo: 'el transporte devolvió vacío' };
        return r === true ? { ok: true, mensaje_id: null } : r;
      } catch (err) {
        return { ok: false, motivo: err.message };
      }
    }
    return this._enviarPorTelegram({ chatId, texto });
  }

  // Publica el request del servicio de Telegram y espera SU respuesta (mismo mecanismo que `_rpc`,
  // que también se suscribe a la respuesta sin declararla: es el par del transporte, no un hecho).
  _enviarPorTelegram({ chatId, texto }) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return { ok: false, motivo: 'sin bus' };
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => {
        if (unsub) unsub();
        // Sin respuesta no se afirma que se entregó: se dice que no se sabe.
        resolve({ ok: false, motivo: 'telegram-service no confirmó el envío' });
      }, TIMEOUT_ENVIO_MS);
      try {
        unsub = this.eventBus.subscribe('telegram.send_message.response', (event) => {
          const r = (event && event.data) || event || {};
          if (r.request_id !== request_id) return;
          clearTimeout(timeout);
          if (unsub) unsub();
          const ok = r.ok === true || r.success === true || r.status === 'ok';
          resolve(ok ? { ok: true, mensaje_id: r.mensaje_id || r.message_id || null }
            : { ok: false, motivo: r.error?.message || r.error || 'telegram rechazó el mensaje' });
        });
        this.eventBus.publish('telegram.send_message.request', {
          request_id, botName: this.bot, chatId, text: texto, parseMode: null
        });
      } catch (err) {
        clearTimeout(timeout);
        if (unsub) unsubscribeSafe(unsub);
        resolve({ ok: false, motivo: err.message });
      }
    });
  }

  _destinatario(d) {
    if (typeof d.destinatario === 'string' && d.destinatario.trim()) return d.destinatario.trim();
    if (typeof d.chat_id === 'string' && d.chat_id.trim()) return d.chat_id.trim();
    if (typeof d.chatId === 'string' && d.chatId.trim()) return d.chatId.trim();
    if (typeof this.sala_chat_id === 'string' && this.sala_chat_id.trim()) return this.sala_chat_id.trim();
    return null;
  }
}

function unsubscribeSafe(u) { try { u(); } catch (_) { /* nada */ } }

module.exports = AvisoSala;
