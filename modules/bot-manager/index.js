/**
 * Bot Manager Module v2.0.0 — POC2 canonico.
 *
 * Gestiona bots y almacenamiento. NO sabe de agentes.
 * Escucha telegram.* (archivos, mensajes, comandos), credential.saved.
 * Publica bot.{file.stored,message.received,command.received,registered,
 * unregistered,enabled,disabled} con correlation_id + project_id + timestamp
 * via _publicarEvento.
 */

'use strict';

const BotRegistry = require('./services/bot-registry');
const DownloadManager = require('./services/download-manager');
const AutoResponder = require('./services/auto-responder');

class BotManagerModule {
  constructor() {
    this.name = 'bot-manager';
    this.version = '2.0.0';

    this.logger = null;
    this.eventBus = null;
    this.metrics = null;
    this.config = null;

    this.registry = null;
    this.downloadManager = null;
    this.autoResponder = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics || null;
    this.config = context.moduleConfig || context.config || {};

    this.logger.info('bot-manager.loading', { version: this.version });

    this.registry = new BotRegistry(this.config, this.logger);
    await this.registry.initialize();

    this.downloadManager = new DownloadManager(this.config, this.logger, this.eventBus);
    this.autoResponder = new AutoResponder(this.config, this.logger, this.eventBus);

    this.logger.info('bot-manager.loaded', {
      version: this.version,
      bots_count: this.registry.getAll().length
    });
  }

  async onUnload() {
    this.logger?.info?.('bot-manager.unloading', {});
    this.registry = null;
    this.downloadManager = null;
    this.autoResponder = null;
    this.logger?.info?.('bot-manager.unloaded', {});
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'FILESYSTEM_ERROR' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'TIMEOUT' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'INTERNAL_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'subscribe') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('bot-manager.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      sourcePayload?.data?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('bot-manager.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
  }

  // ==========================================
  // Bus subscribers (auto-wired desde manifest)
  // ==========================================

  /**
   * Maneja archivos recibidos (document, photo, video, audio, voice).
   */
  async onFileReceived(event) {
    try {
      const data = event?.data || event?.payload || event;
      const { botName, chatId, fileId, fileName, mimeType, caption, project_id } = data || {};
      const from = data?.from || {};

      if (!this.registry.has(botName)) {
        await this.registry.register(botName);
        this.logger.info('bot-manager.auto-registered', { botName });
      }
      if (!this.registry.isEnabled(botName)) {
        this.logger.debug('bot-manager.bot-disabled', { botName });
        return;
      }

      const storagePath = this.registry.getStoragePath(botName);
      const result = await this.downloadManager.downloadAndStore(
        botName, fileId, fileName || `file_${Date.now()}`, mimeType, storagePath
      );

      if (!result.success) {
        this.logger.error('bot-manager.file-storage.failed', {
          botName, fileId, error_message: result.error
        });
        this.metrics?.increment?.('bot-manager.errors', { code: 'DOWNLOAD_FAILED', kind: 'file' });
        return;
      }

      this.metrics?.increment?.('bot-manager.file.stored');
      await this._publicarEvento('bot.file.stored', {
        botName, chatId, project_id: project_id || null,
        userId: from.id,
        userName: from.username || null,
        userFirstName: from.first_name || null,
        userLastName: from.last_name || null,
        file: {
          path: result.path,
          originalName: result.originalName,
          mimeType: result.mimeType || mimeType,
          size: result.size
        },
        caption
      }, data);

      this.logger.info('bot-manager.file.stored', {
        botName, path: result.path, mimeType: result.mimeType
      });

      const botConfig = this.registry.get(botName);
      await this.autoResponder.handleFileReceived(
        botName, chatId, result.originalName, botConfig?.autoResponses
      );
    } catch (err) {
      this._handleHandlerError('bot-manager.file_received.error', err);
    }
  }

  /**
   * Maneja mensajes de texto.
   */
  async onTextReceived(event) {
    try {
      const data = event?.data || event?.payload || event;
      const { botName, chatId, text, project_id } = data || {};
      const from = data?.from || {};

      if (!this.registry.has(botName)) {
        await this.registry.register(botName);
      }
      if (!this.registry.isEnabled(botName)) return;

      this.metrics?.increment?.('bot-manager.message.received');
      await this._publicarEvento('bot.message.received', {
        botName, chatId, project_id: project_id || null,
        userId: from.id, userName: from.username, text
      }, data);

      this.logger.info('bot-manager.message.received', {
        botName, chatId, textLength: text?.length
      });
    } catch (err) {
      this._handleHandlerError('bot-manager.text_received.error', err);
    }
  }

  /**
   * Maneja comandos (pueden tener respuestas automaticas).
   */
  async onCommandReceived(event) {
    try {
      const data = event?.data || event?.payload || event;
      const { botName, chatId, command, args, project_id } = data || {};
      const from = data?.from || {};

      if (!this.registry.has(botName)) {
        await this.registry.register(botName);
      }
      if (!this.registry.isEnabled(botName)) return;

      const botConfig = this.registry.get(botName);
      const handled = await this.autoResponder.handleCommand(
        botName, chatId, `/${command}`, botConfig.autoResponses
      );

      this.metrics?.increment?.('bot-manager.command.received');
      await this._publicarEvento('bot.command.received', {
        botName, chatId, project_id: project_id || null,
        userId: from.id, userName: from.username,
        command, args, autoResponded: handled
      }, data);

      this.logger.info('bot-manager.command.received', {
        botName, command, autoResponded: handled
      });
    } catch (err) {
      this._handleHandlerError('bot-manager.command_received.error', err);
    }
  }

  /**
   * Auto-registra bot cuando se guarda credencial de Telegram.
   */
  async onCredentialSaved(event) {
    try {
      const data = event?.data || event?.payload || event;
      const { key, provider, level, project_id } = data || {};

      if (provider !== 'TELEGRAM' || (level !== 'BOT' && level !== 'CUSTOM')) return;

      const match = key?.match(/^TELEGRAM_API_KEY_(?:BOT|CUSTOM)_(.+)$/);
      if (!match) return;

      const botName = match[1];

      if (!this.registry.has(botName)) {
        await this.registry.register(botName);

        await this._publicarEvento('bot.registered', {
          botName, platform: 'telegram',
          project_id: project_id || null
        }, data);

        this.logger.info('bot-manager.bot.auto-registered', { botName });
      }
    } catch (err) {
      this._handleHandlerError('bot-manager.credential_saved.error', err);
    }
  }

  // ==========================================
  // API Methods (uso programatico)
  // ==========================================

  async registerBot(botName, config = {}) {
    const botConfig = await this.registry.register(botName, config);

    await this._publicarEvento('bot.registered', {
      botName,
      platform: config.platform || 'telegram',
      project_id: config.project_id || null
    }, config);

    return botConfig;
  }

  async unregisterBot(botName, opts = {}) {
    const success = await this.registry.unregister(botName);

    if (success) {
      await this._publicarEvento('bot.unregistered', {
        botName, project_id: opts.project_id || null
      }, opts);
    }

    return success;
  }

  async setEnabled(botName, enabled, opts = {}) {
    const botConfig = await this.registry.update(botName, { enabled });

    if (botConfig) {
      await this._publicarEvento(enabled ? 'bot.enabled' : 'bot.disabled', {
        botName, project_id: opts.project_id || null
      }, opts);
    }

    return botConfig;
  }

  async setAutoResponses(botName, autoResponses) {
    return await this.registry.update(botName, { autoResponses });
  }

  getBot(botName) {
    return this.registry.get(botName);
  }

  listBots() {
    return this.registry.getAll();
  }

  // ==========================================
  // UI Handlers (canonical shape)
  // ==========================================

  async handleListBots() {
    try {
      return { status: 200, data: { bots: this.listBots() } };
    } catch (err) {
      return this._handleHandlerError('bot-manager.list.error', err);
    }
  }

  async handleGetBot(data) {
    try {
      const { botName } = data || {};
      if (!botName) {
        this.metrics?.increment?.('bot-manager.errors', { code: 'INVALID_INPUT', kind: 'get' });
        return this._errorResponse(400, 'INVALID_INPUT', 'botName required', { field: 'botName' });
      }
      const bot = this.getBot(botName);
      if (!bot) {
        this.metrics?.increment?.('bot-manager.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'get' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Bot '${botName}' not found`, { botName });
      }
      return { status: 200, data: bot };
    } catch (err) {
      return this._handleHandlerError('bot-manager.get.error', err);
    }
  }

  async handleSetEnabled(data) {
    try {
      const { botName, enabled, project_id, correlation_id } = data || {};
      if (!botName) {
        return this._errorResponse(400, 'INVALID_INPUT', 'botName required', { field: 'botName' });
      }
      if (typeof enabled !== 'boolean') {
        return this._errorResponse(400, 'INVALID_INPUT', 'enabled (boolean) required', { field: 'enabled' });
      }
      const result = await this.setEnabled(botName, enabled, { project_id, correlation_id });
      if (!result) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Bot '${botName}' not found`, { botName });
      }
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('bot-manager.set_enabled.error', err);
    }
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        bots_count: this.registry?.getAll().length ?? 0
      }
    };
  }
}

module.exports = BotManagerModule;
