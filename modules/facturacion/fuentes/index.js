/**
 * Módulo Fuentes
 *
 * Adaptadores de entrada para facturas — patrón Strategy.
 * Cada fuente (telegram, gmail, ...) es una strategy que traduce
 * eventos externos en `factura.entrada` para que el módulo facturas procese.
 *
 * El módulo facturas NO sabe de Telegram ni Gmail.
 * Este módulo es el adaptador.
 *
 * Añadir nueva fuente = crear strategies/nueva.js + registrar en constructor.
 *
 * @version 1.0.0
 */

const ServiceExecutor = require('../../../core/service-executor');
const TelegramStrategy = require('./strategies/telegram');
const GmailStrategy = require('./strategies/gmail');

class FuentesModule {
  constructor() {
    this.name = 'fuentes';
    this.version = '1.0.0';

    this.logger = null;
    this.eventBus = null;
    this.services = null;

    // Project configs: projectId → { fuentes: { telegram: {...}, gmail: {...} } }
    this.projectConfigs = new Map();
    this.activeProjectId = null;

    // Strategy registry
    this.strategies = {};
    this.registerStrategy(new TelegramStrategy());
    this.registerStrategy(new GmailStrategy());
  }

  registerStrategy(strategy) {
    this.strategies[strategy.tipo] = strategy;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;
    this.services = new ServiceExecutor(this.eventBus, this.logger);

    // Initialize strategies with reference to this module
    for (const strategy of Object.values(this.strategies)) {
      strategy.init(this);
    }

    this.logger.info('fuentes.loaded', {
      strategies: Object.keys(this.strategies)
    });
  }

  async onUnload() {
    for (const strategy of Object.values(this.strategies)) {
      if (strategy.cleanup) strategy.cleanup();
    }
    this.logger.info('fuentes.unloaded');
  }

  // ==========================================
  // Event handlers — dispatched to strategies
  // ==========================================

  onProjectActivated(event) {
    const data = event.data || event;
    this.activeProjectId = data.project_id;
  }

  /**
   * telegram.photo.received → TelegramStrategy
   */
  async onTelegramPhoto(event) {
    const strategy = this.strategies.telegram;
    if (strategy) await strategy.onPhotoReceived(event);
  }

  /**
   * telegram.document.received → TelegramStrategy
   */
  async onTelegramDocument(event) {
    const strategy = this.strategies.telegram;
    if (strategy) await strategy.onDocumentReceived(event);
  }

  // ==========================================
  // Core: Emitir factura.entrada
  // ==========================================

  /**
   * Punto central — todas las strategies llaman aquí
   * para emitir el evento que el módulo facturas escucha.
   */
  emitFacturaEntrada({ projectId, filePath, source, origen }) {
    this.logger.info('fuentes.emitiendo-entrada', { projectId, filePath, source });

    this.eventBus.publish('factura.entrada', {
      projectId,
      filePath,
      source,
      origen
    });
  }

  // ==========================================
  // Project config resolution
  // ==========================================

  /**
   * Busca qué proyecto tiene configurado un botName específico.
   * Busca en todos los projectConfigs cargados.
   */
  findProjectByBotName(botName) {
    for (const [projectId, config] of this.projectConfigs) {
      if (config.fuentes?.telegram?.botName === botName) {
        return projectId;
      }
    }
    return null;
  }

  /**
   * Busca qué proyecto tiene configurada una cuenta Gmail.
   */
  findProjectByGmailAccount(account) {
    for (const [projectId, config] of this.projectConfigs) {
      if (config.fuentes?.gmail?.account === account) {
        return projectId;
      }
    }
    return null;
  }

  /**
   * Obtiene la config de fuentes de un proyecto.
   * Si no está cacheada, intenta cargarla del project config.
   */
  async getProjectFuentesConfig(projectId) {
    if (this.projectConfigs.has(projectId)) {
      return this.projectConfigs.get(projectId);
    }

    // Intentar cargar config del proyecto
    try {
      const result = await this.services.call('local.project-config', 'get', {
        project_id: projectId
      }, { timeout: 5000 });

      const config = result.data || result;
      if (config) {
        this.projectConfigs.set(projectId, config);
        return config;
      }
    } catch (e) {
      this.logger.debug('fuentes.config.no-disponible', { projectId });
    }

    return null;
  }

  /**
   * Registra la config de fuentes de un proyecto manualmente.
   * Útil para cuando el proyecto se activa y pasa su config.
   */
  setProjectConfig(projectId, config) {
    this.projectConfigs.set(projectId, config);
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  /**
   * Estado de todas las fuentes
   * UI: mqttRequest('fuentes', 'status', { proyecto? })
   */
  async handleStatus(data) {
    const status = {};
    for (const [tipo, strategy] of Object.entries(this.strategies)) {
      status[tipo] = {
        tipo,
        version: strategy.version || '1.0.0',
        health: strategy.getHealth ? strategy.getHealth() : 'unknown'
      };
    }

    return {
      status: 200,
      data: {
        strategies: status,
        projectConfigs: this.projectConfigs.size
      }
    };
  }

  /**
   * Forzar check de Gmail para un proyecto
   * UI: mqttRequest('fuentes', 'check-gmail', { proyecto })
   */
  async handleCheckGmail(data) {
    const { proyecto } = data;
    if (!proyecto) {
      return { status: 400, error: 'proyecto es requerido' };
    }

    const strategy = this.strategies.gmail;
    if (!strategy) {
      return { status: 404, error: 'Gmail strategy no disponible' };
    }

    try {
      const result = await strategy.checkAndProcess(proyecto);
      return { status: 200, data: result };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }
}

module.exports = FuentesModule;
