/**
 * Telegram Service Module
 * Servicio de Telegram para enviar/recibir mensajes y fotos
 *
 * Events publicados:
 * - telegram.message.received: Mensaje de texto recibido
 * - telegram.photo.received: Foto recibida
 * - telegram.message.sent: Mensaje enviado
 * - telegram.error: Error en operaciones
 *
 * Tools para AI:
 * - telegram.send: Enviar mensaje
 * - telegram.sendPhoto: Enviar foto
 * - telegram.reply: Responder mensaje
 * - telegram.getFile: Obtener archivo
 */

const TelegramClient = require('./services/telegram-client');

class TelegramServiceModule {
  constructor() {
    this.name = 'telegram-service';
    this.version = '1.0.0';

    // Dependencies
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;

    // Client
    this.client = null;
    this.botInfo = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Obtener token
    const botToken = this.config.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      this.logger.warn('telegram.no_token', {
        message: 'TELEGRAM_BOT_TOKEN not configured. Module will be inactive.'
      });
      return;
    }

    // Inicializar cliente
    this.client = new TelegramClient(botToken, this.logger);

    // Obtener info del bot
    try {
      this.botInfo = await this.client.getMe();
      this.logger.info('telegram.bot_connected', {
        username: this.botInfo.username,
        id: this.botInfo.id
      });
    } catch (error) {
      this.logger.error('telegram.connection_failed', { error: error.message });
    }

    // Suscribirse a eventos
    await this.subscribeToEvents();

    this.logger.info('module.loaded', {
      module: this.name,
      bot: this.botInfo?.username || 'not connected'
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this.client = null;
    this.botInfo = null;
  }

  async subscribeToEvents() {
    // Suscribirse a peticiones de envío
    this.eventBus.subscribe('telegram.send.request', this.onSendRequest.bind(this));
    this.eventBus.subscribe('telegram.photo.send.request', this.onSendPhotoRequest.bind(this));
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onSendRequest(event) {
    const { chatId, text, replyToMessageId, requestId, respondTo } = event;

    try {
      const result = await this.client.sendMessage(chatId, text, { replyToMessageId });

      if (respondTo) {
        await this.eventBus.publish(respondTo, { success: true, result });
      }

      await this.eventBus.publish('telegram.message.sent', {
        chatId,
        messageId: result.message_id,
        text
      });

      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.logger.error('telegram.send.error', { error: error.message, chatId });

      if (respondTo) {
        await this.eventBus.publish(respondTo, { success: false, error: error.message });
      }

      await this.eventBus.publish('telegram.error', {
        error: error.message,
        context: { action: 'send', chatId }
      });

      this.metrics?.increment('telegram.errors.total');
    }
  }

  async onSendPhotoRequest(event) {
    const { chatId, photo, caption, requestId, respondTo } = event;

    try {
      const result = await this.client.sendPhoto(chatId, photo, { caption });

      if (respondTo) {
        await this.eventBus.publish(respondTo, { success: true, result });
      }

      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.logger.error('telegram.sendPhoto.error', { error: error.message, chatId });

      if (respondTo) {
        await this.eventBus.publish(respondTo, { success: false, error: error.message });
      }

      this.metrics?.increment('telegram.errors.total');
    }
  }

  // ==========================================
  // API Handlers
  // ==========================================

  /**
   * Webhook de Telegram - recibe updates
   */
  async handleWebhook(req, res) {
    try {
      const update = req.body;

      this.logger.debug('telegram.webhook.received', { updateId: update.update_id });

      // Procesar mensaje
      if (update.message) {
        await this.processMessage(update.message);
      }

      res.json({ ok: true });
    } catch (error) {
      this.logger.error('telegram.webhook.error', { error: error.message });
      res.status(500).json({ ok: false, error: error.message });
    }
  }

  /**
   * Procesa un mensaje recibido
   */
  async processMessage(message) {
    const { chat, from, message_id, text, photo, caption, date } = message;

    const baseEvent = {
      chatId: chat.id,
      messageId: message_id,
      from: {
        id: from.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name
      },
      timestamp: new Date(date * 1000).toISOString()
    };

    // Verificar si el chat está permitido (si hay lista)
    if (this.config.allowedChatIds?.length > 0) {
      if (!this.config.allowedChatIds.includes(chat.id)) {
        this.logger.warn('telegram.unauthorized_chat', { chatId: chat.id });
        return;
      }
    }

    // Mensaje con foto
    if (photo && photo.length > 0) {
      // Obtener la foto de mayor resolución
      const bestPhoto = photo[photo.length - 1];

      await this.eventBus.publish('telegram.photo.received', {
        ...baseEvent,
        photo: {
          fileId: bestPhoto.file_id,
          fileSize: bestPhoto.file_size,
          width: bestPhoto.width,
          height: bestPhoto.height
        },
        caption: caption || null
      });

      this.metrics?.increment('telegram.photos.received.total');
      this.logger.info('telegram.photo.received', {
        chatId: chat.id,
        fileId: bestPhoto.file_id,
        size: bestPhoto.file_size
      });

      return;
    }

    // Mensaje de texto
    if (text) {
      await this.eventBus.publish('telegram.message.received', {
        ...baseEvent,
        text
      });

      this.metrics?.increment('telegram.messages.received.total');
      this.logger.info('telegram.message.received', {
        chatId: chat.id,
        textLength: text.length
      });

      return;
    }
  }

  /**
   * API: Enviar mensaje
   */
  async handleSendMessage(req, res) {
    const { chatId, text, replyToMessageId } = req.body;

    if (!chatId || !text) {
      return res.status(400).json({ error: 'chatId and text are required' });
    }

    try {
      const result = await this.client.sendMessage(chatId, text, { replyToMessageId });

      await this.eventBus.publish('telegram.message.sent', {
        chatId,
        messageId: result.message_id,
        text
      });

      this.metrics?.increment('telegram.messages.sent.total');

      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      this.logger.error('telegram.api.sendMessage.error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API: Enviar foto
   */
  async handleSendPhoto(req, res) {
    const { chatId, photo, caption } = req.body;

    if (!chatId || !photo) {
      return res.status(400).json({ error: 'chatId and photo are required' });
    }

    try {
      const result = await this.client.sendPhoto(chatId, photo, { caption });
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      this.logger.error('telegram.api.sendPhoto.error', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * API: Estado del bot
   */
  async handleStatus(req, res) {
    res.json({
      connected: !!this.botInfo,
      bot: this.botInfo ? {
        id: this.botInfo.id,
        username: this.botInfo.username,
        firstName: this.botInfo.first_name
      } : null
    });
  }

  // ==========================================
  // Tool Handlers (para AI)
  // ==========================================

  async handleToolSend(args) {
    const { chatId, text, replyToMessageId } = args;

    if (!this.client) {
      return { success: false, error: 'Telegram not configured' };
    }

    try {
      const result = await this.client.sendMessage(chatId, text, { replyToMessageId });
      return {
        success: true,
        messageId: result.message_id,
        message: `Mensaje enviado a chat ${chatId}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSendPhoto(args) {
    const { chatId, photo, caption } = args;

    if (!this.client) {
      return { success: false, error: 'Telegram not configured' };
    }

    try {
      const result = await this.client.sendPhoto(chatId, photo, { caption });
      return {
        success: true,
        messageId: result.message_id,
        message: `Foto enviada a chat ${chatId}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolReply(args) {
    const { chatId, messageId, text } = args;

    if (!this.client) {
      return { success: false, error: 'Telegram not configured' };
    }

    try {
      const result = await this.client.reply(chatId, messageId, text);
      return {
        success: true,
        messageId: result.message_id,
        message: `Respuesta enviada`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolGetFile(args) {
    const { fileId } = args;

    if (!this.client) {
      return { success: false, error: 'Telegram not configured' };
    }

    try {
      const file = await this.client.getFile(fileId);
      return {
        success: true,
        fileId: file.file_id,
        filePath: file.file_path,
        fileSize: file.file_size,
        downloadUrl: `https://api.telegram.org/file/bot${this.config.botToken}/${file.file_path}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // Public API (para otros módulos)
  // ==========================================

  /**
   * Descarga un archivo como buffer
   */
  async downloadFile(fileId) {
    if (!this.client) {
      throw new Error('Telegram not configured');
    }
    return this.client.downloadFileAsBuffer(fileId);
  }

  /**
   * Envía un mensaje (API directa para módulos)
   */
  async send(chatId, text, options = {}) {
    if (!this.client) {
      throw new Error('Telegram not configured');
    }
    return this.client.sendMessage(chatId, text, options);
  }

  /**
   * Responde a un mensaje (API directa para módulos)
   */
  async reply(chatId, messageId, text) {
    if (!this.client) {
      throw new Error('Telegram not configured');
    }
    return this.client.reply(chatId, messageId, text);
  }
}

module.exports = TelegramServiceModule;
