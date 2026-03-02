/**
 * Módulo Carta Digital v1.0
 * Carta del cliente — configuración, sesiones y pedidos
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 * Multi-tenant: cada proyecto tiene su propia config
 *
 * Emite: carta-digital.sesion_creada, carta-digital.pedido_recibido
 * Consume: project.activated
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CartaDigitalModule {
  constructor() {
    this.name = 'carta-digital';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Estado en memoria — por proyecto
    this.configPerProject = new Map();    // project_id -> CartaConfig
    this.sesionesActivas = new Map();     // session_id -> SessionData
    this.pedidosRegistrados = new Map();  // pedido_id -> PedidoData

    // Storage
    this.storageSection = 'pizzepos';
    this.projectPaths = new Map();
  }

  // ==========================================
  // Default config
  // ==========================================

  defaultConfig() {
    return {
      whatsapp_telefono: '',
      nombre_negocio: 'Pizzicas',
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

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    this.registerUIHandlers();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      const actions = ['config', 'update-config', 'create-session', 'register-pedido', 'stats', 'health'];
      for (const action of actions) {
        this.uiHandler.unregister('carta-digital', action);
      }
    }

    this.configPerProject.clear();
    this.sesionesActivas.clear();
    this.pedidosRegistrados.clear();
    this.projectPaths.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('carta-digital.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('carta-digital', 'config', this.handleGetConfig.bind(this));
    this.uiHandler.register('carta-digital', 'update-config', this.handleUpdateConfig.bind(this));
    this.uiHandler.register('carta-digital', 'create-session', this.handleCreateSession.bind(this));
    this.uiHandler.register('carta-digital', 'register-pedido', this.handleRegisterPedido.bind(this));
    this.uiHandler.register('carta-digital', 'stats', this.handleGetStats.bind(this));
    this.uiHandler.register('carta-digital', 'health', this.handleHealthCheck.bind(this));

    this.logger.info('carta-digital.ui_handlers.registered', {
      handlers: ['config', 'update-config', 'create-session', 'register-pedido', 'stats', 'health']
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path } = data;
    if (!project_id || !base_path) return;

    this.projectPaths.set(project_id, path.join(base_path, 'storage', this.storageSection));

    // Cargar config de disco
    try {
      await this.loadConfig(project_id);
      this.logger.info('carta-digital.config.loaded', { project_id });
    } catch (err) {
      // Primera vez — crear config default
      this.configPerProject.set(project_id, this.defaultConfig());
      this.logger.info('carta-digital.config.default_created', { project_id });
    }
  }

  // ==========================================
  // Config persistence
  // ==========================================

  async loadConfig(project_id) {
    const storagePath = this.projectPaths.get(project_id);
    if (!storagePath) throw new Error('No storage path for project');

    const configPath = path.join(storagePath, 'carta-digital.json');
    const raw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(raw);

    this.configPerProject.set(project_id, { ...this.defaultConfig(), ...config });
  }

  async saveConfig(project_id) {
    const storagePath = this.projectPaths.get(project_id);
    if (!storagePath) return;

    const configPath = path.join(storagePath, 'carta-digital.json');
    const config = this.configPerProject.get(project_id);
    if (!config) return;

    try {
      await fs.mkdir(storagePath, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.logger.info('carta-digital.config.saved', { project_id });
    } catch (err) {
      this.logger.error('carta-digital.config.save_failed', { project_id, error: err.message });
    }
  }

  // ==========================================
  // Resolve project (fallback al primero con config)
  // ==========================================

  resolveProject(projectId) {
    if (this.configPerProject.has(projectId)) return projectId;
    for (const [pid] of this.configPerProject) {
      return pid;
    }
    return projectId;
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGetConfig(data) {
    const projectId = this.resolveProject(data?.project_id);
    const config = this.configPerProject.get(projectId) || this.defaultConfig();

    return {
      status: 200,
      data: {
        project_id: projectId,
        ...config
      }
    };
  }

  async handleUpdateConfig(data) {
    const { project_id, ...updates } = data || {};
    const projectId = this.resolveProject(project_id);

    let config = this.configPerProject.get(projectId);
    if (!config) {
      config = this.defaultConfig();
    }

    // Merge updates (shallow para campos directos, deep para tema/funcionalidades)
    if (updates.whatsapp_telefono !== undefined) config.whatsapp_telefono = updates.whatsapp_telefono;
    if (updates.nombre_negocio !== undefined) config.nombre_negocio = updates.nombre_negocio;
    if (updates.moneda !== undefined) config.moneda = updates.moneda;
    if (updates.mensaje_header !== undefined) config.mensaje_header = updates.mensaje_header;

    if (updates.tema && typeof updates.tema === 'object') {
      config.tema = { ...config.tema, ...updates.tema };
    }
    if (updates.funcionalidades && typeof updates.funcionalidades === 'object') {
      config.funcionalidades = { ...config.funcionalidades, ...updates.funcionalidades };
    }

    config.updated_at = new Date().toISOString();
    this.configPerProject.set(projectId, config);

    await this.saveConfig(projectId);

    this.logger.info('carta-digital.config.updated', {
      project_id: projectId,
      campos: Object.keys(updates)
    });

    return {
      status: 200,
      data: { project_id: projectId, ...config }
    };
  }

  async handleCreateSession(data) {
    const { project_id, user_agent, referrer } = data || {};
    const projectId = this.resolveProject(project_id);

    const session_id = `ses_${crypto.randomBytes(8).toString('hex')}`;
    const session = {
      session_id,
      project_id: projectId,
      started_at: new Date().toISOString(),
      user_agent: user_agent || null,
      referrer: referrer || null,
      productos_vistos: [],
      last_activity: new Date().toISOString()
    };

    this.sesionesActivas.set(session_id, session);
    this.metrics?.increment?.('carta-digital.sesion.total');
    this.metrics?.gauge?.('carta-digital.sesiones_activas.count', this.sesionesActivas.size);

    await this.eventBus.publish('carta-digital.sesion_creada', {
      project_id: projectId,
      session_id,
      started_at: session.started_at
    });

    this.logger.info('carta-digital.sesion.created', {
      project_id: projectId,
      session_id
    });

    return {
      status: 201,
      data: { session_id, project_id: projectId }
    };
  }

  async handleRegisterPedido(data) {
    const { project_id, session_id, items, total, notas } = data || {};
    const projectId = this.resolveProject(project_id);

    if (!items || items.length === 0) {
      return { status: 400, error: 'El pedido debe tener al menos un item' };
    }

    const pedido_id = `ped_cd_${crypto.randomBytes(6).toString('hex')}`;
    const pedido = {
      pedido_id,
      project_id: projectId,
      session_id: session_id || null,
      items,
      total: total || 0,
      notas: notas || '',
      estado: 'recibido',
      canal: 'carta-digital',
      created_at: new Date().toISOString()
    };

    this.pedidosRegistrados.set(pedido_id, pedido);
    this.metrics?.increment?.('carta-digital.pedido.total');

    await this.eventBus.publish('carta-digital.pedido_recibido', {
      project_id: projectId,
      pedido_id,
      items_count: items.length,
      total,
      canal: 'carta-digital',
      created_at: pedido.created_at
    });

    this.logger.info('carta-digital.pedido.registered', {
      project_id: projectId,
      pedido_id,
      items_count: items.length,
      total
    });

    return {
      status: 201,
      data: { pedido_id, estado: 'recibido' }
    };
  }

  async handleGetStats(data) {
    const projectId = this.resolveProject(data?.project_id);

    // Limpiar sesiones inactivas (más de 30 min)
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, session] of this.sesionesActivas) {
      if (new Date(session.last_activity).getTime() < cutoff) {
        this.sesionesActivas.delete(id);
      }
    }

    const sesionesProject = Array.from(this.sesionesActivas.values())
      .filter(s => s.project_id === projectId);

    const pedidosProject = Array.from(this.pedidosRegistrados.values())
      .filter(p => p.project_id === projectId);

    return {
      status: 200,
      data: {
        project_id: projectId,
        sesiones_activas: sesionesProject.length,
        total_sesiones: this.metrics?.getCounter?.('carta-digital.sesion.total') || 0,
        pedidos_hoy: pedidosProject.filter(p => {
          const hoy = new Date().toISOString().slice(0, 10);
          return p.created_at.startsWith(hoy);
        }).length,
        total_pedidos: pedidosProject.length
      }
    };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        status: 'healthy',
        proyectos_configurados: this.configPerProject.size,
        sesiones_activas: this.sesionesActivas.size
      }
    };
  }
}

module.exports = CartaDigitalModule;
