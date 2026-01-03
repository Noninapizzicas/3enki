/**
 * Telegram Service Module v2.0
 * Generic Telegram Bot service for any project
 *
 * Events (received):
 * - telegram.message.received: Text message
 * - telegram.photo.received: Photo
 * - telegram.document.received: Document/file
 * - telegram.audio.received: Audio
 * - telegram.video.received: Video
 * - telegram.voice.received: Voice message
 * - telegram.location.received: Location
 * - telegram.contact.received: Contact
 * - telegram.command.received: Bot command (/start, /help)
 * - telegram.callback.received: Inline button callback
 *
 * Events (sent):
 * - telegram.message.sent: Message sent
 * - telegram.error: Error
 */

const fs = require('fs');
const path = require('path');
const TelegramClient = require('./services/telegram-client');

// Event constants
const EVENTS = {
  // Received
  MESSAGE_RECEIVED: 'telegram.message.received',
  PHOTO_RECEIVED: 'telegram.photo.received',
  DOCUMENT_RECEIVED: 'telegram.document.received',
  AUDIO_RECEIVED: 'telegram.audio.received',
  VIDEO_RECEIVED: 'telegram.video.received',
  VOICE_RECEIVED: 'telegram.voice.received',
  LOCATION_RECEIVED: 'telegram.location.received',
  CONTACT_RECEIVED: 'telegram.contact.received',
  COMMAND_RECEIVED: 'telegram.command.received',
  CALLBACK_RECEIVED: 'telegram.callback.received',
  // Sent
  MESSAGE_SENT: 'telegram.message.sent',
  ERROR: 'telegram.error',
  // Requests
  SEND_REQUEST: 'telegram.send.request',
  PHOTO_SEND_REQUEST: 'telegram.photo.send.request',
  DOCUMENT_SEND_REQUEST: 'telegram.document.send.request',
  KEYBOARD_SEND_REQUEST: 'telegram.keyboard.send.request'
};

class TelegramServiceModule {
  constructor() {
    this.name = 'telegram-service';
    this.version = '2.0.0';

    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
    this.activity = null;

    this.client = null;
    this.botInfo = null;
    this.unsubscribes = [];
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};
    this.activity = core.activity?.forModule(this.name);

    this.activity?.action('module.loading', { version: this.version });

    const botToken = this.config.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      this.logger.warn('telegram.no_token', {
        message: 'TELEGRAM_BOT_TOKEN not configured'
      });
      return;
    }

    this.client = new TelegramClient(botToken, this.logger);

    try {
      this.botInfo = await this.client.getMe();
      this.logger.info('telegram.connected', {
        username: this.botInfo.username,
        id: this.botInfo.id
      });
    } catch (error) {
      this.logger.error('telegram.connection_failed', { error: error.message });
    }

    // Ensure download directory
    const downloadPath = this.config.downloadPath || './data/telegram';
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    await this.subscribeToEvents();

    this.logger.info('telegram.loaded', {
      bot: this.botInfo?.username,
      version: this.version
    });
  }

  async onUnload() {
    this.activity?.action('module.unloading');

    for (const unsub of this.unsubscribes) {
      if (typeof unsub === 'function') await unsub();
    }
    this.unsubscribes = [];

    this.client = null;
    this.botInfo = null;
  }

  async subscribeToEvents() {
    const subs = [
      [EVENTS.SEND_REQUEST, this.onSendRequest.bind(this)],
      [EVENTS.PHOTO_SEND_REQUEST, this.onSendPhotoRequest.bind(this)],
      [EVENTS.DOCUMENT_SEND_REQUEST, this.onSendDocumentRequest.bind(this)],
      [EVENTS.KEYBOARD_SEND_REQUEST, this.onSendKeyboardRequest.bind(this)]
    ];

    for (const [event, handler] of subs) {
      const unsub = await this.eventBus.subscribe(event, handler);
      this.unsubscribes.push(unsub);
    }
  }

  // ==========================================
  // Event Handlers (from other modules)
  // ==========================================

  async onSendRequest(event) {
    const { chatId, text, parseMode, replyToMessageId, respondTo } = event;
    try {
      const result = await this.client.sendMessage(chatId, text, { parseMode, replyToMessageId });
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      await this.eventBus.publish(EVENTS.MESSAGE_SENT, { chatId, messageId: result.message_id, text });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('send', error, { chatId }, respondTo);
    }
  }

  async onSendPhotoRequest(event) {
    const { chatId, photo, caption, respondTo } = event;
    try {
      const result = await this.client.sendPhoto(chatId, photo, { caption });
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('sendPhoto', error, { chatId }, respondTo);
    }
  }

  async onSendDocumentRequest(event) {
    const { chatId, document, caption, respondTo } = event;
    try {
      const result = await this.client.sendDocument(chatId, document, { caption });
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('sendDocument', error, { chatId }, respondTo);
    }
  }

  async onSendKeyboardRequest(event) {
    const { chatId, text, buttons, respondTo } = event;
    try {
      const result = await this.client.sendKeyboard(chatId, text, buttons);
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('sendKeyboard', error, { chatId }, respondTo);
    }
  }

  handleError(action, error, context, respondTo) {
    this.logger.error(`telegram.${action}.error`, { error: error.message, ...context });
    this.activity?.error(action, error, context);
    if (respondTo) this.eventBus.publish(respondTo, { success: false, error: error.message });
    this.eventBus.publish(EVENTS.ERROR, { error: error.message, context: { action, ...context } });
    this.metrics?.increment('telegram.errors.total');
  }

  // ==========================================
  // Webhook Handler
  // ==========================================

  async handleWebhook(req, res) {
    try {
      const update = req.body;

      if (update.message) {
        await this.processMessage(update.message);
      } else if (update.callback_query) {
        await this.processCallback(update.callback_query);
      } else if (update.edited_message) {
        // Could handle edited messages
      }

      res.json({ ok: true });
    } catch (error) {
      this.logger.error('telegram.webhook.error', { error: error.message });
      res.status(500).json({ ok: false, error: error.message });
    }
  }

  // ==========================================
  // Message Processing
  // ==========================================

  async processMessage(message) {
    const { chat, from, message_id, date, text, photo, document, audio, video, voice, location, contact, caption } = message;

    const baseEvent = {
      chatId: chat.id,
      chatType: chat.type,
      chatTitle: chat.title,
      messageId: message_id,
      from: {
        id: from.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        isBot: from.is_bot
      },
      timestamp: new Date(date * 1000).toISOString()
    };

    // Check allowed chats
    if (this.config.allowedChatIds?.length > 0) {
      if (!this.config.allowedChatIds.includes(chat.id)) {
        this.logger.debug('telegram.unauthorized', { chatId: chat.id });
        return;
      }
    }

    // Command (starts with /)
    if (text && text.startsWith('/')) {
      const parts = text.split(' ');
      const commandFull = parts[0].substring(1); // Remove /
      const [command, botMention] = commandFull.split('@');
      const args = parts.slice(1);

      await this.eventBus.publish(EVENTS.COMMAND_RECEIVED, {
        ...baseEvent,
        command,
        args,
        rawText: text
      });
      this.metrics?.increment('telegram.commands.received.total');
      this.activity?.action('command.received', { chatId: chat.id, command });
      return;
    }

    // Photo
    if (photo && photo.length > 0) {
      const best = photo[photo.length - 1];
      await this.eventBus.publish(EVENTS.PHOTO_RECEIVED, {
        ...baseEvent,
        photo: { fileId: best.file_id, fileSize: best.file_size, width: best.width, height: best.height },
        caption
      });
      this.metrics?.increment('telegram.photos.received.total');
      this.activity?.action('photo.received', { chatId: chat.id });
      return;
    }

    // Document
    if (document) {
      await this.eventBus.publish(EVENTS.DOCUMENT_RECEIVED, {
        ...baseEvent,
        document: {
          fileId: document.file_id,
          fileName: document.file_name,
          mimeType: document.mime_type,
          fileSize: document.file_size
        },
        caption
      });
      this.metrics?.increment('telegram.documents.received.total');
      this.activity?.action('document.received', { chatId: chat.id, fileName: document.file_name });
      return;
    }

    // Audio
    if (audio) {
      await this.eventBus.publish(EVENTS.AUDIO_RECEIVED, {
        ...baseEvent,
        audio: {
          fileId: audio.file_id,
          duration: audio.duration,
          title: audio.title,
          performer: audio.performer,
          mimeType: audio.mime_type,
          fileSize: audio.file_size
        }
      });
      this.activity?.action('audio.received', { chatId: chat.id });
      return;
    }

    // Video
    if (video) {
      await this.eventBus.publish(EVENTS.VIDEO_RECEIVED, {
        ...baseEvent,
        video: {
          fileId: video.file_id,
          duration: video.duration,
          width: video.width,
          height: video.height,
          mimeType: video.mime_type,
          fileSize: video.file_size
        },
        caption
      });
      this.activity?.action('video.received', { chatId: chat.id });
      return;
    }

    // Voice
    if (voice) {
      await this.eventBus.publish(EVENTS.VOICE_RECEIVED, {
        ...baseEvent,
        voice: {
          fileId: voice.file_id,
          duration: voice.duration,
          mimeType: voice.mime_type,
          fileSize: voice.file_size
        }
      });
      this.activity?.action('voice.received', { chatId: chat.id });
      return;
    }

    // Location
    if (location) {
      await this.eventBus.publish(EVENTS.LOCATION_RECEIVED, {
        ...baseEvent,
        location: {
          latitude: location.latitude,
          longitude: location.longitude
        }
      });
      this.activity?.action('location.received', { chatId: chat.id });
      return;
    }

    // Contact
    if (contact) {
      await this.eventBus.publish(EVENTS.CONTACT_RECEIVED, {
        ...baseEvent,
        contact: {
          phoneNumber: contact.phone_number,
          firstName: contact.first_name,
          lastName: contact.last_name,
          userId: contact.user_id
        }
      });
      this.activity?.action('contact.received', { chatId: chat.id });
      return;
    }

    // Text message
    if (text) {
      await this.eventBus.publish(EVENTS.MESSAGE_RECEIVED, {
        ...baseEvent,
        text
      });
      this.metrics?.increment('telegram.messages.received.total');
      this.activity?.action('message.received', { chatId: chat.id, length: text.length });
      return;
    }
  }

  async processCallback(callback) {
    const { id, from, message, data } = callback;

    await this.eventBus.publish(EVENTS.CALLBACK_RECEIVED, {
      callbackId: id,
      from: {
        id: from.id,
        username: from.username,
        firstName: from.first_name
      },
      chatId: message?.chat?.id,
      messageId: message?.message_id,
      data
    });

    this.metrics?.increment('telegram.callbacks.received.total');
    this.activity?.action('callback.received', { data });

    // Auto-answer callback to remove loading state
    try {
      await this.client.answerCallbackQuery(id);
    } catch (e) {
      // Ignore answer errors
    }
  }

  // ==========================================
  // API Handlers
  // ==========================================

  async handleSendMessage(req, res) {
    const { chatId, text, parseMode, replyToMessageId } = req.body;
    if (!chatId || !text) return res.status(400).json({ error: 'chatId and text required' });

    try {
      const result = await this.client.sendMessage(chatId, text, { parseMode, replyToMessageId });
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSendPhoto(req, res) {
    const { chatId, photo, caption } = req.body;
    if (!chatId || !photo) return res.status(400).json({ error: 'chatId and photo required' });

    try {
      const result = await this.client.sendPhoto(chatId, photo, { caption });
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSendDocument(req, res) {
    const { chatId, document, caption } = req.body;
    if (!chatId || !document) return res.status(400).json({ error: 'chatId and document required' });

    try {
      const result = await this.client.sendDocument(chatId, document, { caption });
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSendKeyboard(req, res) {
    const { chatId, text, buttons } = req.body;
    if (!chatId || !text || !buttons) return res.status(400).json({ error: 'chatId, text and buttons required' });

    try {
      const result = await this.client.sendKeyboard(chatId, text, buttons);
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleEditMessage(req, res) {
    const { chatId, messageId, text, parseMode } = req.body;
    if (!chatId || !messageId || !text) return res.status(400).json({ error: 'chatId, messageId and text required' });

    try {
      const result = await this.client.editMessageText(chatId, messageId, text, { parseMode });
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleDeleteMessage(req, res) {
    const { chatId, messageId } = req.body;
    if (!chatId || !messageId) return res.status(400).json({ error: 'chatId and messageId required' });

    try {
      await this.client.deleteMessage(chatId, messageId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleAnswerCallback(req, res) {
    const { callbackId, text, showAlert } = req.body;
    if (!callbackId) return res.status(400).json({ error: 'callbackId required' });

    try {
      await this.client.answerCallbackQuery(callbackId, { text, showAlert });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSetCommands(req, res) {
    const { commands } = req.body;
    if (!commands) return res.status(400).json({ error: 'commands required' });

    try {
      await this.client.setMyCommands(commands);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetFile(req, res) {
    const { fileId } = req.params;
    if (!fileId) return res.status(400).json({ error: 'fileId required' });

    try {
      const file = await this.client.getFile(fileId);
      res.json({
        success: true,
        fileId: file.file_id,
        filePath: file.file_path,
        fileSize: file.file_size,
        downloadUrl: this.client.getFileUrl(file.file_path)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleStatus(req, res) {
    res.json({
      connected: !!this.botInfo,
      bot: this.botInfo ? {
        id: this.botInfo.id,
        username: this.botInfo.username,
        firstName: this.botInfo.first_name
      } : null,
      version: this.version
    });
  }

  // ==========================================
  // Tool Handlers (for AI)
  // ==========================================

  async handleToolSend(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const result = await this.client.sendMessage(args.chatId, args.text, {
        parseMode: args.parseMode,
        replyToMessageId: args.replyToMessageId
      });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSendPhoto(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const result = await this.client.sendPhoto(args.chatId, args.photo, { caption: args.caption });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSendDocument(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const result = await this.client.sendDocument(args.chatId, args.document, { caption: args.caption });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSendKeyboard(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const result = await this.client.sendKeyboard(args.chatId, args.text, args.buttons);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolEditMessage(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      await this.client.editMessageText(args.chatId, args.messageId, args.text);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolDeleteMessage(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      await this.client.deleteMessage(args.chatId, args.messageId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolReply(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const result = await this.client.sendMessage(args.chatId, args.text, {
        replyToMessageId: args.messageId
      });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolGetFile(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const file = await this.client.getFile(args.fileId);
      return {
        success: true,
        fileId: file.file_id,
        filePath: file.file_path,
        fileSize: file.file_size,
        downloadUrl: this.client.getFileUrl(file.file_path)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolDownloadFile(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const buffer = await this.client.downloadFileAsBuffer(args.fileId);

      // Determine save path
      const file = await this.client.getFile(args.fileId);
      const fileName = path.basename(file.file_path);
      const savePath = args.savePath || path.join(this.config.downloadPath || './data/telegram', fileName);

      // Ensure directory exists
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(savePath, buffer);

      return { success: true, path: savePath, size: buffer.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolGetChatInfo(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      const chat = await this.client.getChat(args.chatId);
      return { success: true, chat };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSetCommands(args) {
    if (!this.client) return { success: false, error: 'Telegram not configured' };
    try {
      await this.client.setMyCommands(args.commands);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // Public API (for other modules)
  // ==========================================

  async send(chatId, text, options = {}) {
    if (!this.client) throw new Error('Telegram not configured');
    return this.client.sendMessage(chatId, text, options);
  }

  async downloadFile(fileId) {
    if (!this.client) throw new Error('Telegram not configured');
    return this.client.downloadFileAsBuffer(fileId);
  }
}

module.exports = TelegramServiceModule;
