'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const TelegramClient = require('./services/telegram-client');

const BaseModule = require('../_shared/base-module');
const EVENTS = {
  TEXT_RECEIVED:     'telegram.text.received',
  PHOTO_RECEIVED:    'telegram.photo.received',
  DOCUMENT_RECEIVED: 'telegram.document.received',
  VIDEO_RECEIVED:    'telegram.video.received',
  AUDIO_RECEIVED:    'telegram.audio.received',
  VOICE_RECEIVED:    'telegram.voice.received',
  LOCATION_RECEIVED: 'telegram.location.received',
  CONTACT_RECEIVED:  'telegram.contact.received',
  COMMAND_RECEIVED:  'telegram.command.received',
  CALLBACK_RECEIVED: 'telegram.callback.received',
  MESSAGE_SENT:      'telegram.message.sent',
  SEND_FAILED:       'telegram.send.failed',
  BOT_STARTED:       'telegram.bot.started',
  BOT_STOPPED:       'telegram.bot.stopped',
  BOT_ERROR:         'telegram.bot.error',
  QUEUE_OVERFLOW:    'telegram.queue.overflow'
};

// Credential pattern: TELEGRAM_API_KEY_{BOT|CUSTOM}_{botName}
const CREDENTIAL_PATTERN = /^TELEGRAM_API_KEY_(?:BOT|CUSTOM)_(.+)$/;

class TelegramServiceModule extends BaseModule {
  constructor() {
    super();
    this.name = 'telegram-service';
    this.version = '3.1.0';
    this.config = null;

    this.bots = new Map();
    this.unsubscribes = [];
  }

  // ==========================================
  // POC2 Helpers
  // ==========================================

  _errorResponse(status, code, message, details) {
    const err = { code, message };
    if (details !== undefined) err.details = details;
    return { status, error: err };
  }

  _classifyHandlerError(error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrado')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('requerido') || msg.includes('validation')) return 'INVALID_INPUT';
    return 'EXTERNAL_API_FAILED';
  }

  _handleHandlerError(metricName, error, kind) {
    const code = error._code || this._classifyHandlerError(error);
    const statusMap = { RESOURCE_NOT_FOUND: 404, INVALID_INPUT: 400, AUTHENTICATION_REQUIRED: 401, PERMISSION_DENIED: 403 };
    const status = statusMap[code] || 500;
    this.metrics?.increment(metricName);
    return this._errorResponse(status, code, error.message, error._details);
  }

  _maskApiKey(token) {
    if (!token || token.length < 8) return '***';
    return token.slice(0, 4) + '***' + token.slice(-4);
  }

  async _publicarEvento(eventName, payload, ctx = {}) {
    const correlation_id = ctx.correlation_id || crypto.randomUUID();
    await this.eventBus.publish(eventName, {
      ...payload,
      correlation_id,
      timestamp: new Date().toISOString()
    });
  }

  _getBotOrThrow(botName) {
    const client = this.bots.get(botName);
    if (!client) {
      const err = new Error(`Bot not found: ${botName}`);
      err._code = 'RESOURCE_NOT_FOUND';
      throw err;
    }
    return client;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    const moduleJsonPath = path.join(__dirname, 'module.json');
    const moduleJson = JSON.parse(await fs.readFile(moduleJsonPath, 'utf-8'));
    this.config = moduleJson.config || {};

    this.logger.info('module.loading', { module: this.name, version: this.version });

    await this.loadExistingBots();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      activeBots: this.bots.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    for (const [, client] of this.bots) {
      client.stopPolling();
    }
    this.logger.info('telegram.bots.stopped', { count: this.bots.size });
    this.bots.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Request Event Handlers
  // ==========================================

  async onSendMessageRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, text, parseMode, replyMarkup, correlation_id } = data;
    this.logger.info('telegram.send_message.request', { botName, chatId, request_id });
    const result = await this.handleToolSendMessage({ botName, chatId, text, parseMode, replyMarkup });
    await this._publicarEvento('telegram.send_message.response', { request_id, ...result }, { correlation_id });
  }

  async onGetFileRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, fileId, download, destPath, _meta, correlation_id } = data;
    this.logger.info('telegram.get_file.request', { botName, fileId, request_id, destPath });
    const result = await this.handleToolGetFile({ botName, fileId, download, destPath });
    await this._publicarEvento('telegram.get_file.response', { request_id, botName, _meta, ...result }, { correlation_id });
  }

  async onSendPhotoRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, photo, caption, correlation_id } = data;
    this.logger.info('telegram.send_photo.request', { botName, chatId, request_id });
    const result = await this.handleToolSendPhoto({ botName, chatId, photo, caption });
    await this._publicarEvento('telegram.send_photo.response', { request_id, ...result }, { correlation_id });
  }

  async onSendDocumentRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, document, caption, correlation_id } = data;
    this.logger.info('telegram.send_document.request', { botName, chatId, request_id });
    const result = await this.handleToolSendDocument({ botName, chatId, document, caption });
    await this._publicarEvento('telegram.send_document.response', { request_id, ...result }, { correlation_id });
  }

  async onSendVideoRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, video, caption, correlation_id } = data;
    this.logger.info('telegram.send_video.request', { botName, chatId, request_id });
    const result = await this.handleToolSendVideo({ botName, chatId, video, caption });
    await this._publicarEvento('telegram.send_video.response', { request_id, ...result }, { correlation_id });
  }

  async onSendLocationRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, latitude, longitude, correlation_id } = data;
    this.logger.info('telegram.send_location.request', { botName, chatId, request_id });
    const result = await this.handleToolSendLocation({ botName, chatId, latitude, longitude });
    await this._publicarEvento('telegram.send_location.response', { request_id, ...result }, { correlation_id });
  }

  async onEditMessageRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, messageId, text, correlation_id } = data;
    this.logger.info('telegram.edit_message.request', { botName, chatId, messageId, request_id });
    const result = await this.handleToolEditMessage({ botName, chatId, messageId, text });
    await this._publicarEvento('telegram.edit_message.response', { request_id, ...result }, { correlation_id });
  }

  async onDeleteMessageRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, messageId, correlation_id } = data;
    this.logger.info('telegram.delete_message.request', { botName, chatId, messageId, request_id });
    const result = await this.handleToolDeleteMessage({ botName, chatId, messageId });
    await this._publicarEvento('telegram.delete_message.response', { request_id, ...result }, { correlation_id });
  }

  async onAnswerCallbackRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, callbackId, text, showAlert, correlation_id } = data;
    this.logger.info('telegram.answer_callback.request', { botName, callbackId, request_id });
    const result = await this.handleToolAnswerCallback({ botName, callbackId, text, showAlert });
    await this._publicarEvento('telegram.answer_callback.response', { request_id, ...result }, { correlation_id });
  }

  async onGetChatRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, chatId, correlation_id } = data;
    this.logger.info('telegram.get_chat.request', { botName, chatId, request_id });
    const result = await this.handleToolGetChat({ botName, chatId });
    await this._publicarEvento('telegram.get_chat.response', { request_id, ...result }, { correlation_id });
  }

  async onSetCommandsRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, botName, commands, correlation_id } = data;
    this.logger.info('telegram.set_commands.request', { botName, request_id });
    const result = await this.handleToolSetCommands({ botName, commands });
    await this._publicarEvento('telegram.set_commands.response', { request_id, ...result }, { correlation_id });
  }

  async onListBotsRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, correlation_id } = data;
    this.logger.info('telegram.list_bots.request', { request_id });
    const result = await this.handleToolListBots({});
    await this._publicarEvento('telegram.list_bots.response', { request_id, ...result }, { correlation_id });
  }

  // ==========================================
  // Credential Event Handlers
  // ==========================================

  async loadExistingBots() {
    for (const [key, value] of Object.entries(process.env)) {
      const match = key.match(CREDENTIAL_PATTERN);
      if (match && value) {
        await this.startBot(match[1], value);
      }
    }
  }

  async onCredentialSaved(event) {
    const data = event?.data || event?.payload || event;
    const { key, provider, level } = data;

    if (provider !== 'TELEGRAM' || (level !== 'BOT' && level !== 'CUSTOM')) return;

    const match = key?.match(CREDENTIAL_PATTERN);
    if (!match) return;

    const botName = match[1];
    const token = process.env[key];

    if (!token) {
      this.logger.warn('telegram.credential.no_token', { key, botName });
      return;
    }

    this.logger.info('telegram.credential.saved', { botName });

    if (this.bots.has(botName)) {
      await this.stopBot(botName);
    }

    await this.startBot(botName, token);
  }

  async onCredentialDeleted(event) {
    const data = event?.data || event?.payload || event;
    const { key } = data;

    const match = key?.match(CREDENTIAL_PATTERN);
    if (!match) return;

    const botName = match[1];
    this.logger.info('telegram.credential.deleted', { botName });

    await this.stopBot(botName);
  }

  // ==========================================
  // Bot Management
  // ==========================================

  async startBot(botName, token) {
    if (this.bots.has(botName)) {
      this.logger.warn('telegram.bot.already_running', { botName });
      return;
    }

    try {
      const client = new TelegramClient(token, botName, {
        pollingInterval:    this.config.pollingInterval    || 1000,
        rateLimitPerSecond: this.config.rateLimitPerSecond || 25,
        maxQueueSize:       this.config.maxQueueSize       || 100
      });

      this.wireClientEvents(client, botName);
      await client.startPolling();

      this.bots.set(botName, client);
      this.metrics?.gauge('telegram.bots.active', this.bots.size);

      this.logger.info('telegram.bot.started', { botName, username: client.botInfo?.username });

      await this._publicarEvento(EVENTS.BOT_STARTED, { botName, username: client.botInfo?.username });
      this.metrics?.increment('telegram.bots.started.total');

    } catch (error) {
      this.logger.error('telegram.bot.start_failed', { botName, error: error.message });

      await this._publicarEvento(EVENTS.BOT_ERROR, { botName, reason: 'start_failed', error: error.message });
      this.metrics?.increment('telegram.errors.total');
    }
  }

  async stopBot(botName) {
    const client = this.bots.get(botName);
    if (!client) return;

    client.stopPolling();
    this.bots.delete(botName);
    this.metrics?.gauge('telegram.bots.active', this.bots.size);

    this.logger.info('telegram.bot.stopped', { botName });

    await this._publicarEvento(EVENTS.BOT_STOPPED, { botName });
    this.metrics?.increment('telegram.bots.stopped.total');
  }

  wireClientEvents(client, botName) {
    const eventMap = {
      'text':     EVENTS.TEXT_RECEIVED,
      'photo':    EVENTS.PHOTO_RECEIVED,
      'document': EVENTS.DOCUMENT_RECEIVED,
      'video':    EVENTS.VIDEO_RECEIVED,
      'audio':    EVENTS.AUDIO_RECEIVED,
      'voice':    EVENTS.VOICE_RECEIVED,
      'location': EVENTS.LOCATION_RECEIVED,
      'contact':  EVENTS.CONTACT_RECEIVED,
      'command':  EVENTS.COMMAND_RECEIVED,
      'callback': EVENTS.CALLBACK_RECEIVED
    };

    for (const [clientEvent, busEvent] of Object.entries(eventMap)) {
      client.on(clientEvent, async (data) => {
        await this._publicarEvento(busEvent, data);
        this.metrics?.increment('telegram.messages.received.total');
      });
    }

    client.on('error', async (data) => {
      await this._publicarEvento(EVENTS.BOT_ERROR, data);
      this.metrics?.increment('telegram.errors.total');
    });

    client.on('queue_overflow', async (data) => {
      await this._publicarEvento(EVENTS.QUEUE_OVERFLOW, data);
    });
  }

  // ==========================================
  // Tool Handlers
  // ==========================================

  async handleToolSendMessage(args) {
    const { botName, chatId, text, parseMode, replyMarkup } = args;

    try {
      const client = this._getBotOrThrow(botName);
      const result = await client.sendMessage(chatId, text, { parseMode, replyMarkup });

      await this._publicarEvento(EVENTS.MESSAGE_SENT, { botName, chatId, messageId: result.message_id, type: 'text' });
      this.metrics?.increment('telegram.messages.sent.total');

      return { status: 200, data: { messageId: result.message_id } };
    } catch (error) {
      await this._publicarEvento(EVENTS.SEND_FAILED, { botName, chatId, reason: error.message });
      return { ...this._handleHandlerError('telegram.errors.total', error, 'send_message') };
    }
  }

  async handleToolSendPhoto(args) {
    const { botName, chatId, photo, caption } = args;

    try {
      const client = this._getBotOrThrow(botName);
      const result = await client.sendPhoto(chatId, photo, { caption });

      await this._publicarEvento(EVENTS.MESSAGE_SENT, { botName, chatId, messageId: result.message_id, type: 'photo' });
      this.metrics?.increment('telegram.messages.sent.total');

      return { status: 200, data: { messageId: result.message_id } };
    } catch (error) {
      await this._publicarEvento(EVENTS.SEND_FAILED, { botName, chatId, reason: error.message });
      return { ...this._handleHandlerError('telegram.errors.total', error, 'send_photo') };
    }
  }

  async handleToolSendDocument(args) {
    const { botName, chatId, document, caption } = args;

    try {
      const client = this._getBotOrThrow(botName);
      const result = await client.sendDocument(chatId, document, { caption });

      await this._publicarEvento(EVENTS.MESSAGE_SENT, { botName, chatId, messageId: result.message_id, type: 'document' });
      this.metrics?.increment('telegram.messages.sent.total');

      return { status: 200, data: { messageId: result.message_id } };
    } catch (error) {
      await this._publicarEvento(EVENTS.SEND_FAILED, { botName, chatId, reason: error.message });
      return { ...this._handleHandlerError('telegram.errors.total', error, 'send_document') };
    }
  }

  async handleToolSendVideo(args) {
    const { botName, chatId, video, caption } = args;

    try {
      const client = this._getBotOrThrow(botName);
      const result = await client.sendVideo(chatId, video, { caption });

      await this._publicarEvento(EVENTS.MESSAGE_SENT, { botName, chatId, messageId: result.message_id, type: 'video' });
      this.metrics?.increment('telegram.messages.sent.total');

      return { status: 200, data: { messageId: result.message_id } };
    } catch (error) {
      await this._publicarEvento(EVENTS.SEND_FAILED, { botName, chatId, reason: error.message });
      return { ...this._handleHandlerError('telegram.errors.total', error, 'send_video') };
    }
  }

  async handleToolSendLocation(args) {
    const { botName, chatId, latitude, longitude } = args;

    try {
      const client = this._getBotOrThrow(botName);
      const result = await client.sendLocation(chatId, latitude, longitude);

      await this._publicarEvento(EVENTS.MESSAGE_SENT, { botName, chatId, messageId: result.message_id, type: 'location' });
      this.metrics?.increment('telegram.messages.sent.total');

      return { status: 200, data: { messageId: result.message_id } };
    } catch (error) {
      await this._publicarEvento(EVENTS.SEND_FAILED, { botName, chatId, reason: error.message });
      return { ...this._handleHandlerError('telegram.errors.total', error, 'send_location') };
    }
  }

  async handleToolEditMessage(args) {
    const { botName, chatId, messageId, text } = args;

    try {
      const client = this._getBotOrThrow(botName);
      await client.editMessageText(chatId, messageId, text);
      return { status: 200, data: { messageId } };
    } catch (error) {
      return { ...this._handleHandlerError('telegram.errors.total', error, 'edit_message') };
    }
  }

  async handleToolDeleteMessage(args) {
    const { botName, chatId, messageId } = args;

    try {
      const client = this._getBotOrThrow(botName);
      await client.deleteMessage(chatId, messageId);
      return { status: 200, data: { messageId } };
    } catch (error) {
      return { ...this._handleHandlerError('telegram.errors.total', error, 'delete_message') };
    }
  }

  async handleToolAnswerCallback(args) {
    const { botName, callbackId, text, showAlert } = args;

    try {
      const client = this._getBotOrThrow(botName);
      await client.answerCallbackQuery(callbackId, { text, showAlert });
      return { status: 200, data: { callbackId } };
    } catch (error) {
      return { ...this._handleHandlerError('telegram.errors.total', error, 'answer_callback') };
    }
  }

  async handleToolGetFile(args) {
    const { botName, fileId, download, destPath: requestedPath } = args;

    try {
      const client = this._getBotOrThrow(botName);
      const file = await client.getFile(fileId);

      const data = {
        fileId: file.file_id,
        filePath: file.file_path,
        fileSize: file.file_size,
        downloadUrl: client.getFileUrl(file.file_path)
      };

      if (download) {
        const destPath = requestedPath || path.join(
          this.config.storagePath || './data/bots',
          botName,
          'received',
          path.basename(file.file_path)
        );
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await client.downloadFile(fileId, destPath);
        data.localPath = destPath;
      }

      return { status: 200, data };
    } catch (error) {
      return { ...this._handleHandlerError('telegram.errors.total', error, 'get_file') };
    }
  }

  async handleToolGetChat(args) {
    const { botName, chatId } = args;

    try {
      const client = this._getBotOrThrow(botName);
      const chat = await client.getChat(chatId);

      return {
        status: 200,
        data: {
          chat: {
            id: chat.id,
            type: chat.type,
            title: chat.title,
            username: chat.username,
            firstName: chat.first_name,
            lastName: chat.last_name
          }
        }
      };
    } catch (error) {
      return { ...this._handleHandlerError('telegram.errors.total', error, 'get_chat') };
    }
  }

  async handleToolSetCommands(args) {
    const { botName, commands } = args;

    try {
      const client = this._getBotOrThrow(botName);
      await client.setMyCommands(commands);
      return { status: 200, data: { count: commands.length } };
    } catch (error) {
      return { ...this._handleHandlerError('telegram.errors.total', error, 'set_commands') };
    }
  }

  async handleToolListBots() {
    const bots = [];

    for (const [botName, client] of this.bots) {
      bots.push({
        botName,
        username: client.botInfo?.username,
        polling: client.isPolling(),
        queueSize: client.getQueueSize()
      });
    }

    return { status: 200, data: { bots, total: bots.length } };
  }
}

module.exports = TelegramServiceModule;
