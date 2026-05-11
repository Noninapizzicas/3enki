/**
 * Tarifas v3.0.0 — POC2 canonico.
 *
 * Asignacion carta+canal + registro de variantes. Cada canal tiene su carta
 * con precios finales escritos. Sin calculos en runtime, sin duplicacion de
 * cartas (eso lo hacen agentes tarifas-creator y tarifas-sync).
 *
 * Comandero llama resolverCarta(canal) → obtiene carta_id → carga esa carta.
 * Config: {project.base_path}/storage/config/tarifas.json (write atomico).
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

const CANALES_VALIDOS = ['mesa', 'llevar', 'telefono', 'whatsapp', 'glovo', 'llevadoo'];

class TarifasModule {
  constructor() {
    this.name = 'tarifas';
    this.version = '3.1.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    this.configPerProject = new Map();
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
    this._lastActiveProjectId = null;
    this.logger?.info?.('module.unloaded', { module: this.name });
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
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'INTERNAL_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('tarifas.errors', { code, kind });
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
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  async _atomicWriteFile(targetPath, data) {
    const tmp = `${targetPath}.tmp`;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tmp, data);
    try {
      await fs.rename(tmp, targetPath);
    } catch (err) {
      try { await fs.unlink(tmp); } catch (_) { /* ignore */ }
      throw err;
    }
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event?.data || event;
    const { project_id, base_path, metadata } = data || {};

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, resolvedBase);
    }
    this._lastActiveProjectId = project_id;

    await this.loadConfig(project_id);
    this.logger.info('tarifas.project.activated', { project_id });
  }

  async onProjectDeactivated() {
    // Multi-tenant: keep config en memoria
  }

  /**
   * Otro modulo (ej. comandero) pide snapshot del estado actual para hidratar
   * su cache local. Re-publicamos tarifas.config.actualizada con tipo=snapshot
   * para cada proyecto conocido. Si event.project_id viene seteado, solo ese.
   */
  async onConfigSolicitada(event) {
    const source = this._unwrap(event);
    const requestedProjectId = source?.project_id || null;
    const projectIds = requestedProjectId
      ? [requestedProjectId]
      : Array.from(this.configPerProject.keys());

    for (const pid of projectIds) {
      await this._publicarSnapshot(pid, source);
    }
  }

  _unwrap(event) {
    return event?.data || event?.payload || event || {};
  }

  _snapshotConfig(projectId) {
    const c = this.getConfig(projectId);
    return {
      general:   c.general ?? null,
      canales:   { ...(c.canales || {}) },
      variantes: Array.isArray(c.variantes) ? c.variantes.slice() : []
    };
  }

  async _publicarSnapshot(projectId, sourcePayload) {
    return this._publicarEvento('tarifas.config.actualizada', {
      project_id: projectId,
      tipo:       'snapshot',
      config:     this._snapshotConfig(projectId)
    }, sourcePayload);
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
      general: null,
      canales: {},
      variantes: []
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
      const config = { ...this.defaultConfig(), ...loaded };
      this.configPerProject.set(projectId, config);
      this.logger.info('tarifas.config.loaded', { project_id: projectId });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('tarifas.config.load_error', {
          project_id: projectId,
          error_code: err.code || 'PARSE_ERROR',
          error_message: err.message
        });
      }
      this.configPerProject.set(projectId, this.defaultConfig());
    }
  }

  async saveConfig(projectId) {
    const filePath = this.configPathFor(projectId);
    if (!filePath) return;
    try {
      const config = this.getConfig(projectId);
      await this._atomicWriteFile(filePath, JSON.stringify(config, null, 2));
      this.logger.info('tarifas.config.saved', { project_id: projectId });
    } catch (err) {
      this.logger.error('tarifas.config.save_error', {
        project_id: projectId,
        error_code: err.code || 'IO_ERROR',
        error_message: err.message
      });
      this.metrics?.increment?.('tarifas.errors', { code: 'FILESYSTEM_ERROR', kind: 'save' });
    }
  }

  getConfig(projectId) {
    const pid = projectId || this._lastActiveProjectId;
    return this.configPerProject.get(pid) || this.defaultConfig();
  }

  resolverCarta(canal, projectId) {
    const config = this.getConfig(projectId);
    const cartaCanal = config.canales[canal];
    if (cartaCanal) return cartaCanal;
    return config.general || null;
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolSetGeneral({ carta_id, project_id }) {
    try {
      if (!carta_id) {
        this.metrics?.increment?.('tarifas.errors', { code: 'INVALID_INPUT', kind: 'set_general' });
        this.logger.warn('tarifas.set_general.missing', { field: 'carta_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere carta_id', { field: 'carta_id' });
      }
      const pid = project_id || this._lastActiveProjectId;
      if (!pid) {
        this.metrics?.increment?.('tarifas.errors', { code: 'INVALID_INPUT', kind: 'set_general' });
        this.logger.warn('tarifas.set_general.missing', { field: 'project_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const config = this.getConfig(pid);
      config.general = carta_id;
      this.configPerProject.set(pid, config);
      await this.saveConfig(pid);

      await this._publicarEvento('tarifas.config.actualizada', {
        project_id: pid, tipo: 'general', carta_id,
        config: this._snapshotConfig(pid)
      });

      return { status: 200, data: { general: carta_id, message: `Carta general establecida: ${carta_id}` } };
    } catch (err) {
      return this._handleHandlerError('tarifas.set_general.error', err);
    }
  }

  async toolAssign({ canal, carta_id, project_id }) {
    try {
      if (!canal) {
        this.metrics?.increment?.('tarifas.errors', { code: 'INVALID_INPUT', kind: 'assign' });
        this.logger.warn('tarifas.assign.missing', { field: 'canal' });
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere canal', { field: 'canal' });
      }
      if (!CANALES_VALIDOS.includes(canal)) {
        this.metrics?.increment?.('tarifas.errors', { code: 'INVALID_INPUT', kind: 'assign' });
        this.logger.warn('tarifas.assign.invalid_canal', { canal });
        return this._errorResponse(400, 'INVALID_INPUT',
          `Canal invalido. Validos: ${CANALES_VALIDOS.join(', ')}`,
          { canal, valid_values: CANALES_VALIDOS });
      }
      const pid = project_id || this._lastActiveProjectId;
      if (!pid) {
        this.metrics?.increment?.('tarifas.errors', { code: 'INVALID_INPUT', kind: 'assign' });
        this.logger.warn('tarifas.assign.missing', { field: 'project_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const config = this.getConfig(pid);
      if (carta_id) {
        config.canales[canal] = carta_id;
      } else {
        delete config.canales[canal];
      }
      this.configPerProject.set(pid, config);
      await this.saveConfig(pid);

      await this._publicarEvento('tarifas.config.actualizada', {
        project_id: pid, tipo: 'assign', canal, carta_id: carta_id || config.general,
        config: this._snapshotConfig(pid)
      });

      this.metrics?.increment?.('tarifas.assign.updated');
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
    } catch (err) {
      return this._handleHandlerError('tarifas.assign.error', err);
    }
  }

  async toolGet({ project_id }) {
    try {
      const pid = project_id || this._lastActiveProjectId;
      const config = this.getConfig(pid);

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
    } catch (err) {
      return this._handleHandlerError('tarifas.get.error', err);
    }
  }

  async toolRegisterVariant({ carta_id, base_carta_id, nombre, canales, reglas, project_id }) {
    try {
      if (!carta_id || !base_carta_id) {
        this.metrics?.increment?.('tarifas.errors', { code: 'INVALID_INPUT', kind: 'register_variant' });
        this.logger.warn('tarifas.register_variant.missing', { fields: ['carta_id', 'base_carta_id'] });
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se requiere carta_id y base_carta_id',
          { fields: ['carta_id', 'base_carta_id'] });
      }
      const pid = project_id || this._lastActiveProjectId;
      if (!pid) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const config = this.getConfig(pid);
      if (!config.variantes) config.variantes = [];

      config.variantes = config.variantes.filter(v => v.carta_id !== carta_id);
      config.variantes.push({
        carta_id, base_carta_id,
        nombre: nombre || carta_id,
        canales: canales || [],
        reglas: reglas || {},
        created_at: new Date().toISOString()
      });

      if (canales && canales.length > 0) {
        for (const canal of canales) {
          if (CANALES_VALIDOS.includes(canal)) {
            config.canales[canal] = carta_id;
          }
        }
      }

      this.configPerProject.set(pid, config);
      await this.saveConfig(pid);

      await this._publicarEvento('tarifas.config.actualizada', {
        project_id: pid, tipo: 'variant_registered', carta_id, canales,
        config: this._snapshotConfig(pid)
      });

      this.metrics?.increment?.('tarifas.variant.registered');
      return {
        status: 200,
        data: {
          carta_id, base_carta_id, nombre, canales,
          message: `Variante "${nombre}" registrada` + (canales?.length ? ` y asignada a: ${canales.join(', ')}` : '')
        }
      };
    } catch (err) {
      return this._handleHandlerError('tarifas.register_variant.error', err);
    }
  }

  async toolGetVariants({ project_id }) {
    try {
      const pid = project_id || this._lastActiveProjectId;
      const config = this.getConfig(pid);
      return {
        status: 200,
        data: { variantes: config.variantes || [], total: (config.variantes || []).length }
      };
    } catch (err) {
      return this._handleHandlerError('tarifas.get_variants.error', err);
    }
  }

  // ==========================================
  // UI Handlers (canonical shape)
  // ==========================================

  async handleGet(data) {
    try {
      return await this.toolGet({ project_id: data?.project_id });
    } catch (err) {
      return this._handleHandlerError('tarifas.ui.get.error', err);
    }
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        proyectos: this.configPerProject.size
      }
    };
  }
}

module.exports = TarifasModule;
