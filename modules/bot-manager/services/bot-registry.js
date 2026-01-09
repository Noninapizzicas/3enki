/**
 * Bot Registry
 * Gestiona la configuración de bots registrados
 */

const fs = require('fs').promises;
const path = require('path');

class BotRegistry {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.bots = new Map(); // botName -> botConfig
    this.storagePath = config.storagePath || './data/bots';
    this.configPath = path.join(this.storagePath, '_config');
  }

  async initialize() {
    // Crear directorio de config si no existe
    await fs.mkdir(this.configPath, { recursive: true });

    // Cargar bots existentes
    await this.loadBots();

    this.logger.info('bot-registry.initialized', {
      bots_count: this.bots.size
    });
  }

  async loadBots() {
    try {
      const files = await fs.readdir(this.configPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.configPath, file);
          const content = await fs.readFile(filePath, 'utf8');
          const botConfig = JSON.parse(content);
          this.bots.set(botConfig.botName, botConfig);
        } catch (error) {
          this.logger.error('bot-registry.load-bot.failed', {
            file,
            error: error.message
          });
        }
      }
    } catch (error) {
      // Directorio no existe o está vacío
      this.logger.debug('bot-registry.no-existing-bots');
    }
  }

  async saveBot(botConfig) {
    const filePath = path.join(this.configPath, `${botConfig.botName}.json`);
    await fs.writeFile(filePath, JSON.stringify(botConfig, null, 2), 'utf8');
  }

  async register(botName, config = {}) {
    const botConfig = {
      botName,
      platform: config.platform || 'telegram',
      enabled: config.enabled !== false,
      storage: {
        basePath: path.join(this.storagePath, botName),
        received: config.receivedPath || 'received/{date}'
      },
      autoResponses: config.autoResponses || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Crear directorio de storage del bot
    await fs.mkdir(botConfig.storage.basePath, { recursive: true });

    this.bots.set(botName, botConfig);
    await this.saveBot(botConfig);

    this.logger.info('bot-registry.registered', { botName });

    return botConfig;
  }

  async unregister(botName) {
    if (!this.bots.has(botName)) {
      return false;
    }

    this.bots.delete(botName);

    // Eliminar archivo de config
    const filePath = path.join(this.configPath, `${botName}.json`);
    try {
      await fs.unlink(filePath);
    } catch {}

    this.logger.info('bot-registry.unregistered', { botName });

    return true;
  }

  async update(botName, updates) {
    const botConfig = this.bots.get(botName);
    if (!botConfig) {
      return null;
    }

    // Aplicar updates
    if (updates.enabled !== undefined) botConfig.enabled = updates.enabled;
    if (updates.autoResponses) botConfig.autoResponses = { ...botConfig.autoResponses, ...updates.autoResponses };
    if (updates.storage) botConfig.storage = { ...botConfig.storage, ...updates.storage };

    botConfig.updatedAt = new Date().toISOString();

    await this.saveBot(botConfig);

    this.logger.info('bot-registry.updated', { botName });

    return botConfig;
  }

  get(botName) {
    return this.bots.get(botName);
  }

  getAll() {
    return Array.from(this.bots.values());
  }

  has(botName) {
    return this.bots.has(botName);
  }

  isEnabled(botName) {
    const bot = this.bots.get(botName);
    return bot ? bot.enabled : false;
  }

  getStoragePath(botName, type = 'received') {
    const bot = this.bots.get(botName);
    if (!bot) return null;

    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const template = bot.storage[type] || bot.storage.received;
    const relativePath = template.replace('{date}', date);

    return path.join(bot.storage.basePath, relativePath);
  }

  getAutoResponse(botName, command) {
    const bot = this.bots.get(botName);
    if (!bot || !bot.autoResponses) return null;
    return bot.autoResponses[command] || null;
  }
}

module.exports = BotRegistry;
