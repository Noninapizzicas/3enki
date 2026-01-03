/**
 * Telegram Service Module v2.1
 * Multi-bot support - one bot per project
 * Tokens stored securely via credential-manager
 *
 * Architecture:
 * - Each project can have ONE bot
 * - Token stored in credential-manager as: telegram:bot:{projectId}
 * - Bot metadata stored in: telegram:meta:{projectId}
 * - Webhook URL: /modules/telegram-service/telegram/webhook/{botId}
 * - All events include projectId for routing
 */

const fs = require('fs');
const path = require('path');
const TelegramClient = require('./services/telegram-client');

// Event constants
const EVENTS = {
  // Bot lifecycle
  BOT_REGISTERED: 'telegram.bot.registered',
  BOT_REMOVED: 'telegram.bot.removed',
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
    this.version = '2.1.0';

    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
    this.activity = null;
    this.credentialManager = null;
    this.uiHandler = null;

    // Multi-bot storage: projectId -> { client, botInfo, botId }
    this.bots = new Map();
    // Reverse lookup: botId -> projectId
    this.botIdToProject = new Map();

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
    this.credentialManager = core.modules?.['credential-manager'];
    this.uiHandler = core.uiHandler;

    this.activity?.action('module.loading', { version: this.version });

    // Ensure download directory
    const downloadPath = this.config.downloadPath || './data/telegram';
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    // Load existing bots from credential-manager
    await this.loadRegisteredBots();

    await this.subscribeToEvents();

    // Register UI Request/Response handlers
    if (this.uiHandler) {
      this.uiHandler.register('telegram', 'listBots', this.handleUIListBots.bind(this));
      this.uiHandler.register('telegram', 'registerBot', this.handleUIRegisterBot.bind(this));
      this.uiHandler.register('telegram', 'removeBot', this.handleUIRemoveBot.bind(this));
      this.uiHandler.register('telegram', 'testToken', this.handleUITestToken.bind(this));
      this.uiHandler.register('telegram', 'setupWebhook', this.handleUISetupWebhook.bind(this));

      this.logger.info('telegram.ui_handlers.registered', {
        handlers: ['listBots', 'registerBot', 'removeBot', 'testToken', 'setupWebhook']
      });
    }

    this.logger.info('telegram.loaded', {
      version: this.version,
      botsLoaded: this.bots.size
    });
  }

  async onUnload() {
    this.activity?.action('module.unloading');

    // Unregister UI handlers
    if (this.uiHandler) {
      this.uiHandler.unregister('telegram', 'listBots');
      this.uiHandler.unregister('telegram', 'registerBot');
      this.uiHandler.unregister('telegram', 'removeBot');
      this.uiHandler.unregister('telegram', 'testToken');
      this.uiHandler.unregister('telegram', 'setupWebhook');
    }

    for (const unsub of this.unsubscribes) {
      if (typeof unsub === 'function') await unsub();
    }
    this.unsubscribes = [];

    this.bots.clear();
    this.botIdToProject.clear();
  }

  async loadRegisteredBots() {
    if (!this.credentialManager) {
      this.logger.warn('telegram.no_credential_manager');
      return;
    }

    try {
      // List all telegram credentials
      const credentials = await this.credentialManager.list('telegram:bot:');

      for (const cred of credentials) {
        const projectId = cred.key.replace('telegram:bot:', '');
        const token = await this.credentialManager.get(cred.key);

        if (token) {
          await this.initBot(projectId, token, false);
        }
      }
    } catch (error) {
      this.logger.error('telegram.load_bots_failed', { error: error.message });
    }
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
  // Bot Management
  // ==========================================

  async initBot(projectId, token, save = true) {
    try {
      const client = new TelegramClient(token, this.logger);
      const botInfo = await client.getMe();

      this.bots.set(projectId, {
        client,
        botInfo,
        botId: botInfo.id,
        token
      });

      this.botIdToProject.set(botInfo.id, projectId);

      if (save && this.credentialManager) {
        await this.credentialManager.save(`telegram:bot:${projectId}`, token);
        await this.credentialManager.save(`telegram:meta:${projectId}`, JSON.stringify({
          botId: botInfo.id,
          username: botInfo.username,
          firstName: botInfo.first_name,
          registeredAt: new Date().toISOString()
        }));
      }

      this.logger.info('telegram.bot.initialized', {
        projectId,
        botUsername: botInfo.username,
        botId: botInfo.id
      });

      return { success: true, bot: botInfo };
    } catch (error) {
      this.logger.error('telegram.bot.init_failed', {
        projectId,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  async removeBot(projectId) {
    const bot = this.bots.get(projectId);
    if (bot) {
      this.botIdToProject.delete(bot.botId);
      this.bots.delete(projectId);

      if (this.credentialManager) {
        await this.credentialManager.delete(`telegram:bot:${projectId}`);
        await this.credentialManager.delete(`telegram:meta:${projectId}`);
      }

      this.logger.info('telegram.bot.removed', { projectId });
      return true;
    }
    return false;
  }

  getBot(projectId) {
    return this.bots.get(projectId);
  }

  getBotByBotId(botId) {
    const projectId = this.botIdToProject.get(botId);
    return projectId ? { projectId, ...this.bots.get(projectId) } : null;
  }

  // ==========================================
  // Event Handlers (from other modules)
  // ==========================================

  async onSendRequest(event) {
    const { projectId, chatId, text, parseMode, replyToMessageId, respondTo } = event;
    const bot = this.getBot(projectId);

    if (!bot) {
      const error = `No bot registered for project ${projectId}`;
      if (respondTo) await this.eventBus.publish(respondTo, { success: false, error });
      return;
    }

    try {
      const result = await bot.client.sendMessage(chatId, text, { parseMode, replyToMessageId });
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      await this.eventBus.publish(EVENTS.MESSAGE_SENT, { projectId, chatId, messageId: result.message_id, text });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('send', error, { projectId, chatId }, respondTo);
    }
  }

  async onSendPhotoRequest(event) {
    const { projectId, chatId, photo, caption, respondTo } = event;
    const bot = this.getBot(projectId);

    if (!bot) return this.handleError('sendPhoto', new Error('No bot'), { projectId }, respondTo);

    try {
      const result = await bot.client.sendPhoto(chatId, photo, { caption });
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('sendPhoto', error, { projectId, chatId }, respondTo);
    }
  }

  async onSendDocumentRequest(event) {
    const { projectId, chatId, document, caption, respondTo } = event;
    const bot = this.getBot(projectId);

    if (!bot) return this.handleError('sendDocument', new Error('No bot'), { projectId }, respondTo);

    try {
      const result = await bot.client.sendDocument(chatId, document, { caption });
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('sendDocument', error, { projectId, chatId }, respondTo);
    }
  }

  async onSendKeyboardRequest(event) {
    const { projectId, chatId, text, buttons, respondTo } = event;
    const bot = this.getBot(projectId);

    if (!bot) return this.handleError('sendKeyboard', new Error('No bot'), { projectId }, respondTo);

    try {
      const result = await bot.client.sendKeyboard(chatId, text, buttons);
      if (respondTo) await this.eventBus.publish(respondTo, { success: true, result });
      this.metrics?.increment('telegram.messages.sent.total');
    } catch (error) {
      this.handleError('sendKeyboard', error, { projectId, chatId }, respondTo);
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
  // Bot Management API Handlers
  // ==========================================

  async handleRegisterBot(req, res) {
    const { projectId, token, name } = req.body;

    if (!projectId || !token) {
      return res.status(400).json({ error: 'projectId and token required' });
    }

    // Check if bot already exists for this project
    if (this.bots.has(projectId)) {
      return res.status(400).json({ error: 'Project already has a bot. Remove it first.' });
    }

    const result = await this.initBot(projectId, token, true);

    if (result.success) {
      await this.eventBus.publish(EVENTS.BOT_REGISTERED, {
        projectId,
        botId: result.bot.id,
        username: result.bot.username
      });

      res.json({
        success: true,
        bot: {
          id: result.bot.id,
          username: result.bot.username,
          firstName: result.bot.first_name
        },
        webhookUrl: this.getWebhookUrl(result.bot.id)
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  }

  async handleListBots(req, res) {
    const bots = [];

    for (const [projectId, bot] of this.bots) {
      bots.push({
        projectId,
        botId: bot.botId,
        username: bot.botInfo.username,
        firstName: bot.botInfo.first_name
      });
    }

    res.json({ bots });
  }

  async handleGetBot(req, res) {
    const { projectId } = req.params;
    const bot = this.getBot(projectId);

    if (!bot) {
      return res.status(404).json({ error: 'No bot registered for this project' });
    }

    res.json({
      projectId,
      botId: bot.botId,
      username: bot.botInfo.username,
      firstName: bot.botInfo.first_name,
      webhookUrl: this.getWebhookUrl(bot.botId)
    });
  }

  async handleRemoveBot(req, res) {
    const { projectId } = req.params;
    const bot = this.getBot(projectId);

    if (!bot) {
      return res.status(404).json({ error: 'No bot registered for this project' });
    }

    await this.removeBot(projectId);

    await this.eventBus.publish(EVENTS.BOT_REMOVED, { projectId });

    res.json({ success: true });
  }

  async handleSetupWebhook(req, res) {
    const { projectId } = req.params;
    const { webhookBaseUrl } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) {
      return res.status(404).json({ error: 'No bot registered for this project' });
    }

    try {
      const webhookUrl = `${webhookBaseUrl}/modules/telegram-service/telegram/webhook/${bot.botId}`;
      await bot.client.setWebhook(webhookUrl);
      res.json({ success: true, webhookUrl });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  getWebhookUrl(botId) {
    const baseUrl = this.config.webhookBaseUrl || process.env.WEBHOOK_BASE_URL || '';
    return `${baseUrl}/modules/telegram-service/telegram/webhook/${botId}`;
  }

  // ==========================================
  // Webhook Handlers
  // ==========================================

  async handleWebhook(req, res) {
    // Generic webhook - try to identify bot from update
    try {
      const update = req.body;
      const botId = this.extractBotIdFromUpdate(update);

      if (!botId) {
        return res.status(400).json({ error: 'Cannot identify bot' });
      }

      const botData = this.getBotByBotId(botId);
      if (!botData) {
        return res.status(404).json({ error: 'Bot not registered' });
      }

      await this.processUpdate(update, botData.projectId, botData);
      res.json({ ok: true });
    } catch (error) {
      this.logger.error('telegram.webhook.error', { error: error.message });
      res.status(500).json({ ok: false, error: error.message });
    }
  }

  async handleWebhookByBot(req, res) {
    const { botId } = req.params;

    try {
      const botData = this.getBotByBotId(parseInt(botId));
      if (!botData) {
        return res.status(404).json({ error: 'Bot not registered' });
      }

      const update = req.body;
      await this.processUpdate(update, botData.projectId, botData);
      res.json({ ok: true });
    } catch (error) {
      this.logger.error('telegram.webhook.error', { error: error.message, botId });
      res.status(500).json({ ok: false, error: error.message });
    }
  }

  extractBotIdFromUpdate(update) {
    // Try to extract bot ID from the update
    // This is tricky - normally you'd use the webhook URL to identify
    return null;
  }

  async processUpdate(update, projectId, botData) {
    if (update.message) {
      await this.processMessage(update.message, projectId, botData);
    } else if (update.callback_query) {
      await this.processCallback(update.callback_query, projectId, botData);
    }
  }

  // ==========================================
  // Message Processing
  // ==========================================

  async processMessage(message, projectId, botData) {
    const { chat, from, message_id, date, text, photo, document, audio, video, voice, location, contact, caption } = message;

    const baseEvent = {
      projectId,
      botId: botData.botId,
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

    // Command
    if (text && text.startsWith('/')) {
      const parts = text.split(' ');
      const commandFull = parts[0].substring(1);
      const [command] = commandFull.split('@');
      const args = parts.slice(1);

      await this.eventBus.publish(EVENTS.COMMAND_RECEIVED, {
        ...baseEvent,
        command,
        args,
        rawText: text
      });
      this.metrics?.increment('telegram.commands.received.total');
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
          performer: audio.performer
        }
      });
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
          height: video.height
        },
        caption
      });
      return;
    }

    // Voice
    if (voice) {
      await this.eventBus.publish(EVENTS.VOICE_RECEIVED, {
        ...baseEvent,
        voice: {
          fileId: voice.file_id,
          duration: voice.duration
        }
      });
      return;
    }

    // Location
    if (location) {
      await this.eventBus.publish(EVENTS.LOCATION_RECEIVED, {
        ...baseEvent,
        location: { latitude: location.latitude, longitude: location.longitude }
      });
      return;
    }

    // Contact
    if (contact) {
      await this.eventBus.publish(EVENTS.CONTACT_RECEIVED, {
        ...baseEvent,
        contact: {
          phoneNumber: contact.phone_number,
          firstName: contact.first_name,
          lastName: contact.last_name
        }
      });
      return;
    }

    // Text
    if (text) {
      await this.eventBus.publish(EVENTS.MESSAGE_RECEIVED, {
        ...baseEvent,
        text
      });
      this.metrics?.increment('telegram.messages.received.total');
    }
  }

  async processCallback(callback, projectId, botData) {
    const { id, from, message, data } = callback;

    await this.eventBus.publish(EVENTS.CALLBACK_RECEIVED, {
      projectId,
      botId: botData.botId,
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

    try {
      await botData.client.answerCallbackQuery(id);
    } catch (e) {}
  }

  // ==========================================
  // Message API Handlers (use projectId from body/context)
  // ==========================================

  async handleSendMessage(req, res) {
    const { projectId, chatId, text, parseMode, replyToMessageId } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });
    if (!chatId || !text) return res.status(400).json({ error: 'chatId and text required' });

    try {
      const result = await bot.client.sendMessage(chatId, text, { parseMode, replyToMessageId });
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSendPhoto(req, res) {
    const { projectId, chatId, photo, caption } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });
    if (!chatId || !photo) return res.status(400).json({ error: 'chatId and photo required' });

    try {
      const result = await bot.client.sendPhoto(chatId, photo, { caption });
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSendDocument(req, res) {
    const { projectId, chatId, document, caption } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });
    if (!chatId || !document) return res.status(400).json({ error: 'chatId and document required' });

    try {
      const result = await bot.client.sendDocument(chatId, document, { caption });
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSendKeyboard(req, res) {
    const { projectId, chatId, text, buttons } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });

    try {
      const result = await bot.client.sendKeyboard(chatId, text, buttons);
      res.json({ success: true, messageId: result.message_id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleEditMessage(req, res) {
    const { projectId, chatId, messageId, text, parseMode } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });

    try {
      await bot.client.editMessageText(chatId, messageId, text, { parseMode });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleDeleteMessage(req, res) {
    const { projectId, chatId, messageId } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });

    try {
      await bot.client.deleteMessage(chatId, messageId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleAnswerCallback(req, res) {
    const { projectId, callbackId, text, showAlert } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });

    try {
      await bot.client.answerCallbackQuery(callbackId, { text, showAlert });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSetCommands(req, res) {
    const { projectId, commands } = req.body;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });

    try {
      await bot.client.setMyCommands(commands);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetFile(req, res) {
    const { projectId } = req.query;
    const { fileId } = req.params;
    const bot = this.getBot(projectId);

    if (!bot) return res.status(404).json({ error: 'No bot for project' });

    try {
      const file = await bot.client.getFile(fileId);
      res.json({
        success: true,
        fileId: file.file_id,
        filePath: file.file_path,
        downloadUrl: bot.client.getFileUrl(file.file_path)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleStatus(req, res) {
    const bots = [];
    for (const [projectId, bot] of this.bots) {
      bots.push({
        projectId,
        botId: bot.botId,
        username: bot.botInfo.username
      });
    }

    res.json({
      version: this.version,
      botsCount: this.bots.size,
      bots
    });
  }

  // ==========================================
  // Tool Handlers (for AI) - use context.projectId
  // ==========================================

  async handleToolRegisterBot(args, context) {
    const projectId = context?.projectId;
    if (!projectId) return { success: false, error: 'No project context' };

    if (this.bots.has(projectId)) {
      return { success: false, error: 'Project already has a bot' };
    }

    const result = await this.initBot(projectId, args.token, true);

    if (result.success) {
      await this.eventBus.publish(EVENTS.BOT_REGISTERED, {
        projectId,
        botId: result.bot.id,
        username: result.bot.username
      });

      return {
        success: true,
        message: `Bot @${result.bot.username} registrado para el proyecto`,
        bot: {
          id: result.bot.id,
          username: result.bot.username
        }
      };
    }

    return { success: false, error: result.error };
  }

  async handleToolGetBotStatus(args, context) {
    const projectId = context?.projectId;
    if (!projectId) return { success: false, error: 'No project context' };

    const bot = this.getBot(projectId);
    if (!bot) {
      return {
        success: true,
        hasBot: false,
        message: 'No hay bot registrado para este proyecto. Usa telegram.registerBot con el token de @BotFather'
      };
    }

    return {
      success: true,
      hasBot: true,
      bot: {
        id: bot.botId,
        username: bot.botInfo.username,
        firstName: bot.botInfo.first_name
      }
    };
  }

  async handleToolSend(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered for this project' };

    try {
      const result = await bot.client.sendMessage(args.chatId, args.text, {
        parseMode: args.parseMode,
        replyToMessageId: args.replyToMessageId
      });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSendPhoto(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      const result = await bot.client.sendPhoto(args.chatId, args.photo, { caption: args.caption });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSendDocument(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      const result = await bot.client.sendDocument(args.chatId, args.document, { caption: args.caption });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSendKeyboard(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      const result = await bot.client.sendKeyboard(args.chatId, args.text, args.buttons);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolEditMessage(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      await bot.client.editMessageText(args.chatId, args.messageId, args.text);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolDeleteMessage(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      await bot.client.deleteMessage(args.chatId, args.messageId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolReply(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      const result = await bot.client.sendMessage(args.chatId, args.text, {
        replyToMessageId: args.messageId
      });
      return { success: true, messageId: result.message_id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolGetFile(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      const file = await bot.client.getFile(args.fileId);
      return {
        success: true,
        fileId: file.file_id,
        filePath: file.file_path,
        downloadUrl: bot.client.getFileUrl(file.file_path)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolDownloadFile(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      const buffer = await bot.client.downloadFileAsBuffer(args.fileId);
      const file = await bot.client.getFile(args.fileId);
      const fileName = path.basename(file.file_path);
      const savePath = args.savePath || path.join(this.config.downloadPath || './data/telegram', projectId, fileName);

      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(savePath, buffer.buffer);

      return { success: true, path: savePath, size: buffer.size };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolGetChatInfo(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      const chat = await bot.client.getChat(args.chatId);
      return { success: true, chat };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleToolSetCommands(args, context) {
    const projectId = context?.projectId;
    const bot = this.getBot(projectId);

    if (!bot) return { success: false, error: 'No bot registered' };

    try {
      await bot.client.setMyCommands(args.commands);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // UI Request/Response Handlers
  // ==========================================

  async handleUIListBots(data) {
    const bots = [];

    for (const [projectId, bot] of this.bots) {
      bots.push({
        projectId,
        botId: bot.botId,
        username: bot.botInfo.username,
        firstName: bot.botInfo.first_name,
        canJoinGroups: bot.botInfo.can_join_groups,
        canReadAllGroupMessages: bot.botInfo.can_read_all_group_messages,
        supportsInlineQueries: bot.botInfo.supports_inline_queries
      });
    }

    return { bots, count: bots.length };
  }

  async handleUIRegisterBot(data) {
    const { projectId, token, name } = data;

    if (!projectId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId is required' };
    }
    if (!token) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'token is required' };
    }

    // Check if bot already exists for this project
    if (this.bots.has(projectId)) {
      throw { status: 409, code: 'CONFLICT', message: 'Project already has a bot. Remove it first.' };
    }

    const result = await this.initBot(projectId, token, true);

    if (result.success) {
      await this.eventBus.publish(EVENTS.BOT_REGISTERED, {
        projectId,
        botId: result.bot.id,
        username: result.bot.username
      });

      return {
        success: true,
        projectId,
        botInfo: {
          id: result.bot.id,
          username: result.bot.username,
          first_name: result.bot.first_name,
          can_join_groups: result.bot.can_join_groups,
          can_read_all_group_messages: result.bot.can_read_all_group_messages,
          supports_inline_queries: result.bot.supports_inline_queries
        }
      };
    }

    throw { status: 400, code: 'INVALID_TOKEN', message: result.error };
  }

  async handleUIRemoveBot(data) {
    const { projectId } = data;

    if (!projectId) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId is required' };
    }

    const bot = this.getBot(projectId);
    if (!bot) {
      throw { status: 404, code: 'NOT_FOUND', message: 'No bot registered for this project' };
    }

    await this.removeBot(projectId);
    await this.eventBus.publish(EVENTS.BOT_REMOVED, { projectId });

    return { success: true, projectId };
  }

  async handleUITestToken(data) {
    const { token } = data;

    if (!token) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'token is required' };
    }

    try {
      const client = new TelegramClient(token, this.logger);
      const botInfo = await client.getMe();

      return {
        valid: true,
        message: 'Token válido',
        botInfo: {
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name
        }
      };
    } catch (error) {
      return {
        valid: false,
        message: error.message || 'Token inválido'
      };
    }
  }

  async handleUISetupWebhook(data) {
    const { projectId, webhookUrl } = data;

    if (!projectId || !webhookUrl) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'projectId and webhookUrl required' };
    }

    const bot = this.getBot(projectId);
    if (!bot) {
      throw { status: 404, code: 'NOT_FOUND', message: 'No bot registered for this project' };
    }

    try {
      const fullWebhookUrl = `${webhookUrl}/modules/telegram-service/telegram/webhook/${bot.botId}`;
      await bot.client.setWebhook(fullWebhookUrl);
      return { success: true, webhookUrl: fullWebhookUrl };
    } catch (error) {
      throw { status: 500, code: 'WEBHOOK_ERROR', message: error.message };
    }
  }

  // ==========================================
  // Public API (for other modules)
  // ==========================================

  async send(projectId, chatId, text, options = {}) {
    const bot = this.getBot(projectId);
    if (!bot) throw new Error('No bot registered for project');
    return bot.client.sendMessage(chatId, text, options);
  }

  async downloadFile(projectId, fileId) {
    const bot = this.getBot(projectId);
    if (!bot) throw new Error('No bot registered for project');
    return bot.client.downloadFileAsBuffer(fileId);
  }
}

module.exports = TelegramServiceModule;
