/**
 * Carta Digital v2.0.0 — Backoffice de la carta pública
 *
 * Espacio donde se configura, compone y genera la carta pública (PWA).
 * Une datos de carta-manager + marketing + ofertas + branding.
 *
 * Responsabilidades:
 *   1. Config de branding por proyecto (colores, WhatsApp, features)
 *   2. Escuchar carta.actualizada para saber cuándo recomponer
 *   3. Despachar agentes para componer, revisar y generar PWA
 *   4. Servir la carta compuesta (resolverCartaPublica)
 *
 * NO gestiona: analytics (futuro módulo), reseñas (futuro módulo),
 * media serving (servicio compartido), deploy CF workers (agente).
 *
 * Agentes:
 *   - cartadigital-composer: compone carta final (datos + marketing + ofertas + config)
 *   - cartadigital-pwa-builder: genera export PWA
 *   - cartadigital-ofertas: gestión de ofertas y combos
 *   - cartadigital-reviewer: revisa completitud (imágenes, descripciones, alérgenos)
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CartaDigitalModule {
  constructor() {
    this.name = 'carta-digital';
    this.version = '2.0.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Multi-tenant
    this.configPerProject = new Map();
    this.projectPaths = new Map();

    // Carta compuesta en caché por proyecto (resultado del composer)
    this.cartaCompuestaCache = new Map();
  }

  defaultConfig() {
    return {
      whatsapp_telefono: '',
      nombre_negocio: '',
      moneda: '€',
      mensaje_header: '¡Hola! Quiero pedir:',
      tema: {
        color_primario: '#f59e0b',
        color_fondo: '#0a0a0a',
        color_texto: '#e5e5e5',
        logo_emoji: '🍕'
      },
      funcionalidades: {
        carrito: true,
        whatsapp: true,
        compartir: true,
        variaciones: true
      },
      updated_at: null
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.configPerProject.clear();
    this.projectPaths.clear();
    this.cartaCompuestaCache.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;
    if (!project_id) return;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, path.join(resolvedBase, 'storage', 'pizzepos'));
    }

    await this.loadConfig(project_id);
    this.logger.info('carta-digital.project.activated', { project_id });
  }

  async onProjectDeactivated(event) {
    // Keep data — multi-tenant
  }

  // ==========================================
  // Listener: carta.actualizada → invalidar cache + dispatch composer
  // ==========================================

  async onCartaActualizada(event) {
    const data = event?.data || event?.payload || event;
    const projectId = data?.project_id;
    if (!projectId) return;

    // Invalidar carta compuesta en caché
    this.cartaCompuestaCache.delete(projectId);

    this.logger.info('carta-digital.carta.invalidada', { project_id: projectId });

    // Dispatch composer para recomponer
    await this.eventBus.publish('agent.execute.request', {
      correlation_id: data?.correlation_id || crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      user_id: 'system',
      agent_name: 'cartadigital-composer',
      project_id: projectId,
      timestamp: new Date().toISOString(),
      context: {
        carta_id: data?.meta?.id
      },
      task: `Recomponer carta pública para proyecto "${projectId}". La carta base ha cambiado.`
    });

    this.metrics?.increment('carta-digital.recompose.triggered');
  }

  // ==========================================
  // Listener: tarifas cambian → recomponer (qué carta usa cada canal cambió)
  // ==========================================

  async onTarifasActualizada(event) {
    const data = event?.data || event?.payload || event;
    const projectId = data?.project_id;
    if (!projectId) return;

    // Invalidar caché
    this.cartaCompuestaCache.delete(projectId);

    this.logger.info('carta-digital.tarifas_changed.invalidate', { project_id: projectId });

    // Recomponer
    await this.eventBus.publish('agent.execute.request', {
      correlation_id: data?.correlation_id || crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      user_id: 'system',
      agent_name: 'cartadigital-composer',
      project_id: projectId,
      timestamp: new Date().toISOString(),
      context: {},
      task: `Recomponer carta pública para proyecto "${projectId}". La asignación de cartas a canales ha cambiado.`
    });

    this.metrics?.increment('carta-digital.recompose.triggered');
  }

  // ==========================================
  // Config Persistence
  // ==========================================

  configPathFor(projectId) {
    const storagePath = this.projectPaths.get(projectId);
    if (!storagePath) return null;
    return path.join(storagePath, 'carta-digital.json');
  }

  async loadConfig(projectId) {
    const filePath = this.configPathFor(projectId);
    if (!filePath) {
      this.configPerProject.set(projectId, this.defaultConfig());
      return;
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const loaded = JSON.parse(content);
      this.configPerProject.set(projectId, { ...this.defaultConfig(), ...loaded });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-digital.config.load_error', { project_id: projectId, error: err.message });
      }
      this.configPerProject.set(projectId, this.defaultConfig());
    }
  }

  async saveConfig(projectId) {
    const filePath = this.configPathFor(projectId);
    if (!filePath) return;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const config = this.getConfig(projectId);
      config.updated_at = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error('carta-digital.config.save_error', { project_id: projectId, error: err.message });
    }
  }

  getConfig(projectId) {
    return this.configPerProject.get(projectId) || this.defaultConfig();
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolGetConfig({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    return { status: 200, data: this.getConfig(project_id) };
  }

  async toolUpdateConfig({ project_id, ...campos }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };
    const config = this.getConfig(project_id);

    for (const [key, value] of Object.entries(campos)) {
      if (key === 'project_id') continue;
      if (key === 'tema' && typeof value === 'object') {
        config.tema = { ...config.tema, ...value };
      } else if (key === 'funcionalidades' && typeof value === 'object') {
        config.funcionalidades = { ...config.funcionalidades, ...value };
      } else if (value !== undefined) {
        config[key] = value;
      }
    }

    this.configPerProject.set(project_id, config);
    await this.saveConfig(project_id);

    return {
      status: 200,
      data: { config, message: 'Configuración actualizada.' }
    };
  }

  async toolGetCartaPublica({ project_id }) {
    if (!project_id) return { status: 400, error: 'Se requiere project_id' };

    // Devolver carta compuesta si está en caché
    const cached = this.cartaCompuestaCache.get(project_id);
    if (cached) {
      return { status: 200, data: cached };
    }

    // Si no hay caché, devolver config sola (el composer la completará)
    return {
      status: 200,
      data: {
        config: this.getConfig(project_id),
        carta: null,
        message: 'Carta no compuesta aún. El composer la generará cuando haya datos.'
      }
    };
  }

  async toolSetCartaCompuesta({ project_id, carta_compuesta }) {
    if (!project_id || !carta_compuesta) return { status: 400, error: 'Se requiere project_id y carta_compuesta' };
    this.cartaCompuestaCache.set(project_id, carta_compuesta);
    this.logger.info('carta-digital.carta_compuesta.set', { project_id });
    return { status: 200, data: { message: 'Carta compuesta actualizada en caché.' } };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGetConfig(data) {
    return (await this.toolGetConfig({ project_id: data?.project_id })).data;
  }

  async handleUpdateConfig(data) {
    const result = await this.toolUpdateConfig(data);
    if (result.error) throw { status: result.status, code: 'CONFIG_ERROR', message: result.error };
    return result.data;
  }

  async handleGetCartaPublica(data) {
    return (await this.toolGetCartaPublica({ project_id: data?.project_id })).data;
  }

  async handleHealth() {
    return {
      status: 'healthy', module: this.name, version: this.version,
      proyectos: this.configPerProject.size,
      cartas_compuestas: this.cartaCompuestaCache.size
    };
  }
}

module.exports = CartaDigitalModule;
