'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const REGISTRO_DEFAULT = './data/telegram-bridge/registro.json';

/**
 * TelegramBridge — PUENTE Telegram ⇄ chat por proyecto.
 *
 * ENTRANTE  : telegram.text.received / telegram.command.received → si el
 *             botName está vinculado a un proyecto → mqttRequest
 *             ('conversation', 'send', {...}) — la vía canónica del loader
 *             (context.mqttRequest → uiHandler.handle → chat-io.handleSend).
 *             El chatId RESUELVE su conversación: lista las del proyecto
 *             (conversation/list — el MISMO evento que la web) y usa la
 *             ÚLTIMA ACTIVA (el backend ordena por updated_at DESC); si no
 *             hay ninguna, crea una (conversation/create). El id resuelto
 *             se recuerda en el registro → hilo unificado con la web.
 * FOTO      : telegram.photo.received → la foto se materializa en
 *             data/bots/<bot>/received/ (telegram.get_file, download:true) y
 *             el chat recibe UNA línea con el PIE DE FOTO y la ruta local.
 *             Sin esto, la foto entraba al disco y el chat no se enteraba:
 *             el pie («esta foto es la Carbonara») se perdía en silencio.
 *             NO se cuelga de bot.file.stored: ese evento no se emite en
 *             producción (bot-manager exige `result.success` y la respuesta
 *             de telegram-service trae `status`/`data`), así que depender de
 *             él sería colgarse de un evento muerto.
 * SALIENTE  : ai.chat.response / ai.chat.failed con channel='telegram' →
 *             telegram.send_message.request { botName, chatId, text } con el
 *             hilo del mensaje original (channel_context propagado por el
 *             relay: botName + chatId).
 * REGISTRO  : GLOBAL (botName → project_id + conversaciones por chatId),
 *             fichero JSON con escritura tempfile+rename (patrón scheduler).
 * FORMA     : puente — traduce Telegram ⇄ bus, no toca el core. Reflejo puro
 *             determinista (sin blueprint: cero fuzzy).
 */
class TelegramBridgeModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'telegram-bridge';
    this.version = '1.0.3';

    this.registro = { _updated_at: null, vinculos: {} };
    this.registroPath = REGISTRO_DEFAULT;
    // Almacén de ficheros de los bots (bot-manager usa el mismo): destino de la
    // foto que el puente materializa para poder citarla en el chat.
    this.botsPath = './data/bots';
    this.mqttRequest = null;
    // Confirmaciones pendientes (paso 3 Telegram): ui_token → datos de la petición
    // para resolver el callback Sí/No y reenviar portal.call con confirmado:true.
    this._pendingConfirms = new Map();
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.mqttRequest = context?.mqttRequest || null;
    const cfg = context?.moduleConfig || {};
    if (cfg.registro_path) this.registroPath = cfg.registro_path;
    if (cfg.bots_path) this.botsPath = cfg.bots_path;
    this._cargarRegistro();
    this.logger?.info('telegram-bridge.loaded', {
      module: this.name, version: this.version,
      registro: this.registroPath,
      vinculos: Object.keys(this.registro.vinculos || {}).length,
      mqttRequest: !!this.mqttRequest
    });
  }

  // =============================================================
  // Persistencia del registro (GLOBAL, tempfile+rename)
  // =============================================================

  _cargarRegistro() {
    try {
      const raw = fs.readFileSync(this.registroPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.vinculos === 'object') {
        this.registro = { ...parsed, vinculos: parsed.vinculos };
      }
    } catch (_) {
      this.registro = { _updated_at: null, vinculos: {} };
    }
  }

  _guardarRegistro() {
    this.registro._updated_at = new Date().toISOString();
    const dir = path.dirname(this.registroPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.registroPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.registro, null, 2));
    fs.renameSync(tmp, this.registroPath);
  }

  // =============================================================
  // RPCs del registro — telegram.bridge.vincular / listar
  // =============================================================

  onVincularRequest(e) {
    return this._atender(e, 'vincular', 'telegram.bridge.vincular.response', d => this._vincular(d));
  }

  onListarRequest(e) {
    return this._atender(e, 'listar', 'telegram.bridge.listar.response', d => this._listar(d));
  }

  _vincular(input) {
    const { botName, project_id } = input || {};
    if (!botName || typeof botName !== 'string') return this._invalid('botName');
    if (!project_id || typeof project_id !== 'string') return this._invalid('project_id');

    const ya = this.registro.vinculos[botName];
    if (ya && ya.project_id !== project_id) {
      return {
        status: 409,
        error: {
          code: 'CONFLICT',
          message: `botName '${botName}' ya está vinculado a otro proyecto`,
          details: { botName, project_id, vinculado_a: ya.project_id }
        }
      };
    }

    if (!ya) {
      this.registro.vinculos[botName] = { project_id, conversaciones: {} };
      this._guardarRegistro();
      this.eventBus.publish('telegram.bridge.vinculado', {
        botName, project_id, timestamp: new Date().toISOString()
      });
      this.metrics?.increment('telegram-bridge.vinculado');
      return { status: 201, data: { botName, project_id, vinculado: true } };
    }

    return { status: 200, data: { botName, project_id, vinculado: true, ya_existia: true } };
  }

  _listar(input) {
    const { project_id } = input || {};
    const vinculos = Object.entries(this.registro.vinculos || {})
      .filter(([, v]) => !project_id || v.project_id === project_id)
      .map(([botName, v]) => ({
        botName,
        project_id: v.project_id,
        chats: Object.keys(v.conversaciones || {}).length
      }));
    return { status: 200, data: { vinculos, total: vinculos.length } };
  }

  // =============================================================
  // ENTRANTE — Telegram → chat del proyecto
  // =============================================================

  async onTelegramTextReceived(event) {
    const d = (event && event.data) || event || {};
    if (!d.text) return;
    await this._reenviarAlChat(d, d.text);
  }

  async onTelegramCommandReceived(event) {
    const d = (event && event.data) || event || {};
    if (!d.command) return;
    const texto = `/${d.command}${(d.args || []).length ? ' ' + d.args.join(' ') : ''}`;
    await this._reenviarAlChat(d, texto);
  }

  /**
   * ENTRANTE — FOTO de Telegram → el chat, con su PIE DE FOTO y su ruta.
   *
   * Antes de esto la foto entraba en `data/bots/<botName>/received/` y el chat
   * NO se enteraba: el PIE DE FOTO («esta foto es la Carbonara») se perdía en
   * silencio y había que emparejar a mano por fecha de fichero.
   *
   * Ahora el chat recibe UNA sola línea con el pie y la ruta local del archivo:
   *
   *   [foto] esta foto es la Carbonara
   *   archivo: ./data/bots/<bot>/received/foto_20261027T134814_10889465.jpg
   *
   * Se descarga AQUÍ (telegram.get_file con download:true y destPath propio) y
   * no se espera a `bot.file.stored` porque ese evento NO se emite en producción
   * (0 ocurrencias en 8 días de logs, con fotos entrando a diario): bot-manager
   * lo publica solo si `result.success`, y la respuesta de telegram-service
   * trae `status`/`data`, no `success` → se sale antes de publicar. Colgarse de
   * un evento muerto sería un arreglo que no arregla nada. La foto que trae el
   * fileId es la MISMA que guarda bot-manager: se paga una descarga doble
   * (~100 KB) a cambio de no depender de otro módulo.
   */
  async onTelegramPhotoReceived(event) {
    const d = (event && event.data) || event || {};
    const { botName, chatId, caption } = d;
    if (!botName || chatId === undefined || chatId === null) return;

    // Bot sin vincular: se ignora igual que un texto (no se descarga nada).
    if (!this.registro.vinculos?.[botName]) {
      this.logger?.info('telegram-bridge.bot_no_vinculado', { botName, chatId, motivo: 'foto' });
      return;
    }

    // El fileId NO siempre viaja como `fileId`: si el evento viene de una capa
    // que reenvía el update CRUDO de Telegram, el id vive en `photo[].file_id`
    // o `sizes[].file_id`. Buscarlo en todas sus formas antes de rendirse.
    const fileId = this._extraerFileId(d);
    const pie = typeof caption === 'string' && caption.trim() ? caption.trim() : null;
    const ruta = await this._descargarFoto(botName, fileId);

    const cabeza = pie ? `[foto] ${pie}` : '[foto recibida sin pie de foto]';
    const texto = ruta
      ? `${cabeza}\narchivo: ${ruta}`
      : `${cabeza}\n(no se pudo descargar la foto · ${this._motivoSinFoto(d, fileId)})`;

    await this._reenviarAlChat({ botName, chatId, from: d.from }, texto);
    this.metrics?.increment('telegram-bridge.entrante.foto_reenviada');
  }

  /**
   * El id del fichero en Telegram, mire donde mire. Contempla el payload
   * normalizado (`fileId`) y el update CRUDO (`photo[]` / `sizes[]` con
   * `file_id`), porque el mismo evento llega por dos caminos distintos.
   */
  _extraerFileId(d) {
    if (!d) return null;
    const directo = d.fileId || d.file_id;
    if (directo) return directo;
    const ultimoDe = (lista) => {
      if (!Array.isArray(lista) || lista.length === 0) return null;
      const ultimo = lista[lista.length - 1];
      return (ultimo && (ultimo.fileId || ultimo.file_id)) || null;
    };
    const doc = d.document || null;
    return ultimoDe(d.sizes)
        || ultimoDe(d.photo)
        || (doc && (doc.fileId || doc.file_id))
        || null;
  }

  /**
   * Por qué no hay foto, dicho con el dato en la mano: el id que se buscó o,
   * si no había ninguno, las claves que SÍ traía el evento (para no volver a
   * diagnosticar a ciegas).
   */
  _motivoSinFoto(d, fileId) {
    if (fileId) return `fileId ${fileId}`;
    const claves = Object.keys(d || {}).join(', ');
    return `sin fileId (claves del evento: ${claves || 'ninguna'})`;
  }

  /**
   * Materializa la foto en el almacén del bot y devuelve la ruta local.
   * La descarga la hace telegram-service (telegram.get_file, download:true);
   * el puente solo elige el destino. Devuelve null si falla (el chat se entera
   * igual, con el aviso: mejor una foto sin ruta que un silencio).
   */
  async _descargarFoto(botName, fileId) {
    if (!fileId) return null;
    // Nombre propio y fechado: el chat puede citar la ruta tal cual.
    const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, ''); // 20261027T134814
    const cola = String(fileId).replace(/[^\w-]/g, '').slice(-8);
    const destPath = path.join(this.botsPath, botName, 'received', `foto_${sello}_${cola}.jpg`);

    const res = await this._rpc(
      'telegram.get_file.request',
      { botName, fileId, download: true, destPath },
      { timeout_ms: 30000 }
    );
    if (!res || res.status !== 200) {
      this.logger?.error('telegram-bridge.foto.descarga_fallo', {
        botName, fileId, error: res && (res.error?.message || res.error)
      });
      return null;
    }
    return (res.data && res.data.localPath) || null;
  }

  async onTelegramCallbackReceived(event) {
    const d = (event && event.data) || event || {};
    const { botName, chatId, callbackId, data } = d;

    // Callback de CONFIRMACIÓN por UI (paso 3): data viene como "confirm:<token>"
    // o "reject:<token>". Resuelve la petición pendiente y actúa.
    if (typeof data === 'string' && (data.startsWith('confirm:') || data.startsWith('reject:'))) {
      const [accion, token] = data.split(':');
      const pend = this._pendingConfirms.get(token);
      if (!pend) {
        // Token desconocido o ya respondido: responder el callback y salir.
        await this._answerCallback(botName, callbackId, 'Petición ya resuelta o expirada');
        return;
      }
      this._pendingConfirms.delete(token);

      if (accion === 'confirm') {
        // Reenviar al portal con confirmado:true → ejecuta la tool.
        // Vía canónica del loader: mqttRequest('portal','call') → uiHandler →
        // portal.handleCall (el mismo camino que el MCP usa).
        if (this.mqttRequest) {
          try {
            await this.mqttRequest('portal', 'call', {
              tool: pend.tool, args: pend.args,
              project_id: pend.project_id || null,
              confirmado: true
            });
          } catch (err) {
            this.logger?.error('telegram-bridge.confirm.ejecutar_fallo', { error: err.message });
          }
        }
        await this._answerCallback(botName, callbackId, '✅ Confirmado');
        await this._enviarTelegram(botName, chatId, `✅ Ejecutando \`${pend.tool}\`…`);
      } else {
        await this._answerCallback(botName, callbackId, 'Descartado');
        await this._enviarTelegram(botName, chatId, `⛔ Descartado \`${pend.tool}\``);
      }
      return;
    }

    this.logger?.info('telegram-bridge.callback.ignored', {
      botName: d.botName, callbackId: d.callbackId, reason: 'callback no es de confirmación ni mensaje conversacional'
    });
  }

  // ── Confirmación por UI (paso 3): portal.confirmation.pendiente → botones Sí/No ──
  async onPortalConfirmationPendiente(event) {
    const d = (event && event.data) || event || {};
    const { tool, project_id, description, args } = d;
    if (!tool) return;

    // Buscar el bot vinculado a ESE proyecto. Si el proyecto no tiene bot
    // Telegram vinculado, no hay superficie donde mostrar (el portal ya respondió 409).
    let target = null;
    for (const [botName, vinculo] of Object.entries(this.registro.vinculos || {})) {
      if (vinculo.project_id === project_id && Object.keys(vinculo.conversaciones || {}).length > 0) {
        target = { botName, vinculo };
        break;
      }
    }
    if (!target) return;

    const botName = target.botName;
    const chatId = Object.keys(target.vinculo.conversaciones)[0]; // primer chat activo
    const token = `${tool}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    this._pendingConfirms.set(token, { tool, args: args || {}, project_id: project_id || null });

    const replyMarkup = {
      inline_keyboard: [[
        { text: '✅ Sí', callback_data: `confirm:${token}` },
        { text: '⛔ No', callback_data: `reject:${token}` }
      ]]
    };

    await this._enviarTelegram(botName, chatId,
      `⚠️ *Confirmación requerida*\n${description || tool}`,
      { replyMarkup });
    this.metrics?.increment('telegram-bridge.confirmation.enviada');
  }

  async _answerCallback(botName, callbackId, text) {
    try {
      await this._rpc('telegram.answer_callback.request', { botName, callbackId, text });
    } catch (_) { /* no debe romper el flujo */ }
  }

  async _enviarTelegram(botName, chatId, text, extra = {}) {
    try {
      await this._rpc('telegram.send_message.request', { botName, chatId, text, ...extra }, { timeout_ms: 30000 });
    } catch (_) { /* best-effort */ }
  }

  /**
   * Normaliza el emisor a un identificador ESTABLE de texto.
   * telegram-client.extractFrom() entrega un OBJETO {id, username, firstName, lastName};
   * interpolarlo producía el literal "telegram:[object Object]" — así quedaron escritas
   * 220 filas de la memoria RAG del proyecto the-pirate. Acepta también string/number
   * (otros publicadores del evento) y cae al chatId cuando no hay emisor.
   */
  _etiquetaFrom(from, chatId) {
    if (from === undefined || from === null || from === '') return String(chatId);
    if (typeof from === 'object') {
      const id = from.id ?? from.username ?? from.firstName ?? null;
      return id === null ? String(chatId) : String(id);
    }
    return String(from);
  }

  async _reenviarAlChat(d, texto) {
    const { botName, chatId, correlation_id } = d;
    const from = this._etiquetaFrom(d.from, chatId);
    const vinculo = this.registro.vinculos?.[botName];
    if (!vinculo) {
      this.logger?.info('telegram-bridge.bot_no_vinculado', { botName, chatId });
      return; // bots no vinculados se ignoran
    }
    const project_id = vinculo.project_id;
    const key = String(chatId);

    // 1) Conversación por chatId — se RESUELVE (última activa del proyecto
    //    o creación si no hay ninguna), se recuerda para futuros mensajes
    let conversation_id = vinculo.conversaciones?.[key];
    if (!conversation_id) {
      conversation_id = await this._resolverConversacion(project_id, chatId, from);
      if (!conversation_id) {
        this._emitirFallo(botName, chatId, 'conversation_resolve', 'no se pudo resolver/crear la conversación', correlation_id);
        return;
      }
      vinculo.conversaciones = vinculo.conversaciones || {};
      vinculo.conversaciones[key] = conversation_id;
      this._guardarRegistro();
    }

    // 2) Inyectar al chat — vía canónica del loader (uiHandler.handle)
    const res = await this._sendAlChat(project_id, conversation_id, {
      message: texto,
      user_id: from ? `telegram:${from}` : `telegram:${chatId}`,
      channel: 'telegram',
      channel_context: { botName, chatId },
      correlation_id
    });
    if (!res || res.status !== 200) {
      const msg = (res && (res.error?.message || res.error)) || 'sin respuesta de conversation/send';
      this._emitirFallo(botName, chatId, 'chat_send', msg, correlation_id);
      return;
    }
    this.metrics?.increment('telegram-bridge.entrante.reenviado');
  }

  /**
   * RESUELVE la conversación para un chatId (decisión del dueño: opción B —
   * 'conversación lista y eliges'):
   *   1) conversation.list { project_id } — el MISMO evento que la web usa.
   *      Contrato real (chat-io v2, handleList): response.data.conversations,
   *      cada una { id, title, updated_at (ISO), message_count, ... }, ya
   *      ordenadas por updated_at DESC (el backend ordena) → la primera es la
   *      ÚLTIMA ACTIVA. El campo id es `id` (no `conversation_id`).
   *   2) Si hay alguna → devuelve su id (NO crea). Hilo unificado con la web.
   *   3) Si no hay ninguna (o list falla) → conversation.create como antes.
   */
  async _resolverConversacion(project_id, chatId, from) {
    if (!this.mqttRequest) return null;

    let res = null;
    try {
      res = await this.mqttRequest('conversation', 'list', { project_id });
    } catch (err) {
      this.logger?.error('telegram-bridge.conversation.list_error', { error: err.message });
    }

    const convs = res?.data?.conversations;
    if (Array.isArray(convs) && convs.length > 0) {
      const activa = convs[0];
      if (activa && activa.id) {
        this.metrics?.increment('telegram-bridge.conversacion.reutilizada');
        this.logger?.info('telegram-bridge.conversacion.reutilizada', {
          project_id, chatId, conversation_id: activa.id,
          titulo: activa.title, updated_at: activa.updated_at
        });
        return activa.id;
      }
    }

    const title = from ? `Telegram ${from}` : `Telegram chat ${chatId}`;
    const creada = await this.mqttRequest('conversation', 'create', { project_id, title });
    const conv = creada?.data;
    return (conv && (conv.conversation_id || conv.conversation?.id)) || null;
  }

  async _sendAlChat(project_id, conversation_id, extra) {
    if (!this.mqttRequest) return null;
    try {
      return await this.mqttRequest('conversation', 'send', {
        project_id,
        conversation_id,
        ...extra
      });
    } catch (err) {
      this.logger?.error('telegram-bridge.chat.send_error', { error: err.message });
      return null;
    }
  }

  // =============================================================
  // SALIENTE — respuesta del chat → Telegram
  // =============================================================

  async onAiChatResponse(event) {
    const d = (event && event.data) || event || {};
    if (d.channel !== 'telegram') return; // solo hilos telegram
    const cc = d.channel_context || {};
    if (!cc.botName || cc.chatId === undefined || cc.chatId === null) return;
    if (!this.registro.vinculos?.[cc.botName]) return; // bot desvinculado: no responder

    const texto = d.assistant_message || '';
    const chunks = this._trocearTexto(texto, 4000); // Telegram limita a 4096 chars

    // Envío SECUENCIAL: un telegram.send_message.request por chunk, esperando
    // el ack de cada uno antes del siguiente. Si un chunk falla, emite
    // telegram.bridge.envio_fallido con ese chunk y sigue con el resto
    // (best-effort: el mensaje completo se intenta entregar igualmente).
    for (const chunk of chunks) {
      const res = await this._rpc('telegram.send_message.request', {
        botName: cc.botName,
        chatId: cc.chatId,
        text: chunk
      }, { timeout_ms: 30000 });

      if (!res || res.status !== 200) {
        const msg = (res && (res.error?.message || res.error)) || 'sin respuesta de telegram.send_message';
        this._emitirFallo(cc.botName, cc.chatId, 'telegram_send', msg, d.correlation_id, chunk);
        this.metrics?.increment('telegram-bridge.saliente.chunk_fallido');
        continue;
      }
      this.metrics?.increment('telegram-bridge.saliente.enviado');
    }
  }

  async onAiChatFailed(event) {
    const d = (event && event.data) || event || {};
    if (d.channel !== 'telegram') return;
    const cc = d.channel_context || {};
    if (!cc.botName || cc.chatId === undefined || cc.chatId === null) return;

    const texto = `⚠️ El chat no pudo responder: ${d.error?.message || 'error desconocido'}`;
    const res = await this._rpc('telegram.send_message.request', {
      botName: cc.botName,
      chatId: cc.chatId,
      text: texto
    }, { timeout_ms: 30000 });

    if (!res || res.status !== 200) {
      this._emitirFallo(cc.botName, cc.chatId, 'telegram_send_failed_notify', 'no se pudo notificar el fallo', d.correlation_id);
    }
  }

  // =============================================================
  // Utilidades
  // =============================================================

  _trocearTexto(texto, maxLen = 4000) {
    if (typeof texto !== 'string' || texto.length === 0) return [texto || ''];
    if (texto.length <= maxLen) return [texto];
    const chunks = [];
    let rest = texto;
    while (rest.length > maxLen) {
      const ventana = rest.slice(0, maxLen);
      let corte = ventana.lastIndexOf('\n');            // 1) salto de línea (preferido)
      if (corte <= 0) corte = ventana.lastIndexOf(' '); // 2) espacio
      if (corte <= 0) corte = maxLen;                   // 3) corte duro
      const pedazo = ventana.slice(0, corte).trimEnd();
      if (pedazo.length > 0) chunks.push(pedazo);
      rest = rest.slice(corte).trimStart();
    }
    if (rest.length > 0) chunks.push(rest);
    return chunks;
  }

  _emitirFallo(botName, chatId, etapa, detalle, correlation_id, chunk) {
    const payload = {
      botName, chatId, etapa, detalle,
      correlation_id,
      timestamp: new Date().toISOString()
    };
    if (chunk !== undefined) payload.chunk = chunk; // el trozo que falló
    this.logger?.error('telegram-bridge.fallo', { botName, chatId, etapa, detalle, chunk: chunk && chunk.slice(0, 500) });
    this.eventBus.publish('telegram.bridge.envio_fallido', payload);
  }
}

module.exports = TelegramBridgeModule;
