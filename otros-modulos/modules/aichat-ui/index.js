/**
 * AiChat UI Module
 * Main UI interface for multi-project conversational AI
 */

class AiChatUI {
  constructor() {
    this.name = 'aichat-ui';
    this.version = '1.0.0';

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('aichat-ui.loading', { module: this.name });

    // Publicar evento de módulo listo
    await this.eventBus.publish('aichat.ui.ready', {
      module: this.name,
      version: this.version,
      timestamp: new Date().toISOString()
    });

    this.logger.info('aichat-ui.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('aichat-ui.unloaded', { module: this.name });
  }

  // Health check
  async handleHealthCheck(req, res) {
    return {
      status: 'healthy',
      module: this.name,
      version: this.version,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = AiChatUI;
