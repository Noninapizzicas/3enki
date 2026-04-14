/**
 * Tarifas v2.0.0 — Asignación carta+canal + reglas de variantes
 *
 * Responsabilidades:
 *   1. Config general: qué carta es la default
 *   2. Asignación: qué carta usa cada canal
 *   3. Reglas de variante: describe cómo se creó cada variante (para tarifas-sync)
 *
 * NO calcula precios en runtime (los precios están escritos en cada carta).
 * NO duplica ni modifica cartas (eso lo hacen los agentes tarifas-creator y tarifas-sync).
 *
 * Comandero llama resolverCarta(canal) → obtiene carta_id → carga esa carta.
 *
 * Config: data/projects/{id}/storage/config/tarifas.json
 */

const fs = require('fs').promises;
const path = require('path');

const CANALES_VALIDOS = ['mesa', 'llevar', 'telefono', 'whatsapp', 'glovo', 'llevadoo'];

class TarifasModule {
  constructor() {
    this.name = 'tarifas';
    this.version = '2.0.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Multi-tenant: project_id → config
    this.configPerProject = new Map();
    // project_id → base path
    this.projectPaths = new Map();
    this._lastActiveProjectId = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.configPerProject.clear();
    this.projectPaths.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, resolvedBase);
    }
    this._lastActiveProjectId = project_id;

    await this.loadConfig(project_id);
    this.logger.info('tarifas.project.activated', { project_id });
  }

  async onProjectDeactivated(event) {
    // Keep config — multi-tenant
  }

  // ==========================================
  // Persistence
  // ==========================================

  configPathFor(projectId) {
    const basePath = this.projectPaths.get(projectId);
    if (!basePath) return null;
    return path.join(basePath, 'storage', 'config', 'tarifas.json');
  }

  defaultConfig() {
    return {
      general: null,  // carta_id de la carta general (null = no asignada)
      canales: {},     // { canal: carta_id | null }  — null = usa general
      variantes: []    // [{ carta_id, base_carta_id, nombre, canales[], reglas }]
    };
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
      // Merge con defaults para garantizar estructura
      const config = { ...this.defaultConfig(), ...loaded };
      this.configPerProject.set(projectId, config);
      this.logger.info('tarifas.config.loaded', { project_id: projectId });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('tarifas.config.load_error', { project_id: projectId, error: err.message });
      }
      this.configPerProject.set(projectId, this.defaultConfig());
    }
  }

  async saveConfig(projectId) {
    const filePath = this.configPathFor(projectId);
    if (!filePath) return;

    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      const config = this.getConfig(projectId);
      await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
      this.logger.info('tarifas.config.saved', { project_id: projectId });
    } catch (err) {
      this.logger.error('tarifas.config.save_error', { project_id: projectId, error: err.message });
    }
  }

  getConfig(projectId) {
    const pid = projectId || this._lastActiveProjectId;
    return this.configPerProject.get(pid) || this.defaultConfig();
  }

  // ==========================================
  // Core: resolverCarta
  // ==========================================

  /**
   * Devuelve el carta_id que un canal debe usar.
   * Si el canal tiene carta asignada → esa. Si no → la general.
   */
  resolverCarta(canal, projectId) {
    const config = this.getConfig(projectId);
    const cartaCanal = config.canales[canal];

    // Canal tiene carta específica
    if (cartaCanal) return cartaCanal;

    // Usar carta general
    return config.general || null;
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolSetGeneral({ carta_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    const pid = project_id || this._lastActiveProjectId;
    if (!pid) return { status: 400, error: 'Se requiere project_id' };

    const config = this.getConfig(pid);
    config.general = carta_id;
    this.configPerProject.set(pid, config);
    await this.saveConfig(pid);

    await this.eventBus.publish('tarifas.config.actualizada', {
      project_id: pid, tipo: 'general', carta_id
    });

    return {
      status: 200,
      data: { general: carta_id, message: `Carta general establecida: ${carta_id}` }
    };
  }

  async toolAssign({ canal, carta_id, project_id }) {
    if (!canal) return { status: 400, error: 'Se requiere canal' };
    if (!CANALES_VALIDOS.includes(canal)) {
      return { status: 400, error: `Canal inválido. Válidos: ${CANALES_VALIDOS.join(', ')}` };
    }
    const pid = project_id || this._lastActiveProjectId;
    if (!pid) return { status: 400, error: 'Se requiere project_id' };

    const config = this.getConfig(pid);
    if (carta_id) {
      config.canales[canal] = carta_id;
    } else {
      delete config.canales[canal];  // Vuelve a usar general
    }
    this.configPerProject.set(pid, config);
    await this.saveConfig(pid);

    await this.eventBus.publish('tarifas.config.actualizada', {
      project_id: pid, tipo: 'assign', canal, carta_id: carta_id || config.general
    });

    return {
      status: 200,
      data: {
        canal,
        carta_id: carta_id || null,
        efectiva: carta_id || config.general,
        message: carta_id
          ? `Canal "${canal}" usa carta "${carta_id}"`
          : `Canal "${canal}" vuelve a usar la carta general`
      }
    };
  }

  async toolGet({ project_id }) {
    const pid = project_id || this._lastActiveProjectId;
    const config = this.getConfig(pid);

    // Resumen legible
    const resumen = {};
    for (const canal of CANALES_VALIDOS) {
      const cartaId = config.canales[canal] || null;
      resumen[canal] = {
        carta_id: cartaId || config.general || '(sin asignar)',
        es_override: !!cartaId,
        usa_general: !cartaId
      };
    }

    return {
      status: 200,
      data: {
        general: config.general,
        canales: resumen,
        variantes: config.variantes || [],
        total_variantes: (config.variantes || []).length
      }
    };
  }

  async toolRegisterVariant({ carta_id, base_carta_id, nombre, canales, reglas, project_id }) {
    if (!carta_id || !base_carta_id) {
      return { status: 400, error: 'Se requiere carta_id y base_carta_id' };
    }
    const pid = project_id || this._lastActiveProjectId;
    if (!pid) return { status: 400, error: 'Se requiere project_id' };

    const config = this.getConfig(pid);
    if (!config.variantes) config.variantes = [];

    // Eliminar variante anterior si existe
    config.variantes = config.variantes.filter(v => v.carta_id !== carta_id);

    config.variantes.push({
      carta_id,
      base_carta_id,
      nombre: nombre || carta_id,
      canales: canales || [],
      reglas: reglas || {},
      created_at: new Date().toISOString()
    });

    // Auto-asignar canales
    if (canales && canales.length > 0) {
      for (const canal of canales) {
        if (CANALES_VALIDOS.includes(canal)) {
          config.canales[canal] = carta_id;
        }
      }
    }

    this.configPerProject.set(pid, config);
    await this.saveConfig(pid);

    await this.eventBus.publish('tarifas.config.actualizada', {
      project_id: pid, tipo: 'variant_registered', carta_id, canales
    });

    return {
      status: 200,
      data: {
        carta_id, base_carta_id, nombre, canales,
        message: `Variante "${nombre}" registrada` + (canales?.length ? ` y asignada a: ${canales.join(', ')}` : '')
      }
    };
  }

  async toolGetVariants({ project_id }) {
    const pid = project_id || this._lastActiveProjectId;
    const config = this.getConfig(pid);
    return {
      status: 200,
      data: { variantes: config.variantes || [], total: (config.variantes || []).length }
    };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGet(data) {
    return (await this.toolGet({ project_id: data?.project_id })).data;
  }

  async handleHealth() {
    return {
      status: 'healthy', module: this.name, version: this.version,
      proyectos: this.configPerProject.size
    };
  }
}

module.exports = TarifasModule;
