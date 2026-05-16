/**
 * pizzepos/carta-digital v3.0.0 — Backoffice de la carta publica (POC2 rewrite).
 *
 * Configura branding por proyecto, escucha cambios de carta y tarifas, dispara al agente
 * `cartadigital-composer` para recomponer la carta publica, sirve la carta compuesta cacheada.
 *
 * Eventos del bus:
 *   subscribes (4): project.activated, project.deactivated, carta.actualizada, tarifas.config.actualizada.
 *   publishes  (1): agent.execute.request (sub-contrato agent-flow — invoca cartadigital-composer).
 *
 * 4 tools (cartadigital.{get_config, update_config, get_carta_publica, set_carta_compuesta}) +
 * 4 ui_handlers (delegacion pura a tools).
 */

'use strict';

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const DEFAULT_PROJECT_ID = 'default';
const COMPOSER_AGENT     = 'cartadigital-composer';

class CartaDigitalModule {
  constructor() {
    this.name    = 'carta-digital';
    this.version = '3.0.0';

    this.eventBus = null;
    this.logger   = null;
    this.metrics  = null;

    this.configPerProject     = new Map();
    this.projectPaths         = new Map();
    this.cartaCompuestaCache  = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger   = context.logger;
    this.metrics  = context.metrics;
    this.logger.info('module.loading', { module: this.name, version: this.version });
    this.logger.info('module.loaded',  { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this.configPerProject.clear();
    this.projectPaths.clear();
    this.cartaCompuestaCache.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  defaultConfig() {
    return {
      whatsapp_telefono: '',
      nombre_negocio:    '',
      moneda:            '€',
      mensaje_header:    '¡Hola! Quiero pedir:',
      tema: {
        color_primario: '#f59e0b',
        color_fondo:    '#0a0a0a',
        color_texto:    '#e5e5e5',
        logo_emoji:     '🍕'
      },
      funcionalidades: {
        carrito:     true,
        whatsapp:    true,
        compartir:   true,
        variaciones: true
      },
      updated_at: null
    };
  }

  // ==========================================
  // Bus handlers
  // ==========================================

  async onProjectActivated(event) {
    const data = this._unwrap(event);
    const { project_id, base_path, metadata } = data || {};
    if (!project_id) {
      this._logError('carta-digital.project.activated.invalid', { missing: 'project_id' }, 'project_activated', 'INVALID_INPUT');
      return;
    }

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, path.join(resolvedBase, 'storage', 'pizzepos'));
    }

    await this._loadConfig(project_id);
    this.logger.info('carta-digital.project.activated', { project_id, has_base: !!resolvedBase });
  }

  async onProjectDeactivated(event) {
    const data = this._unwrap(event);
    const { project_id } = data || {};
    if (project_id) {
      this.logger.info('carta-digital.project.deactivated', { project_id });
    }
    // Multi-tenant: NO limpiar config/path/cache — el modulo puede reactivar el proyecto sin perder estado.
  }

  async onCartaActualizada(event) {
    const data      = this._unwrap(event);
    const projectId = data?.project_id;
    if (!projectId) return;

    this.cartaCompuestaCache.delete(projectId);
    this.logger.info('carta-digital.carta.invalidada', { project_id: projectId });

    await this._publicarAgentRequest({
      projectId,
      sourcePayload: data,
      context: { carta_id: data?.meta?.id },
      task: `Recomponer carta publica para proyecto "${projectId}". La carta base ha cambiado.`
    });

    this.metrics?.increment('carta-digital.recompose.triggered', { trigger: 'carta_actualizada' });
  }

  async onTarifasActualizada(event) {
    const data      = this._unwrap(event);
    const projectId = data?.project_id;
    if (!projectId) return;

    this.cartaCompuestaCache.delete(projectId);
    this.logger.info('carta-digital.tarifas_changed.invalidate', { project_id: projectId });

    await this._publicarAgentRequest({
      projectId,
      sourcePayload: data,
      context: {},
      task: `Recomponer carta publica para proyecto "${projectId}". La asignacion de cartas a canales ha cambiado.`
    });

    this.metrics?.increment('carta-digital.recompose.triggered', { trigger: 'tarifas_actualizada' });
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolGetConfig(args) {
    try {
      const { project_id } = args || {};
      if (!project_id) {
        this._logError('carta-digital.get_config.validation_failed', { missing: 'project_id' }, 'tool_get_config', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }
      return { status: 200, data: this._getConfig(project_id) };
    } catch (err) {
      return this._handleHandlerError('carta-digital.get_config.failed', err, 'tool_get_config');
    }
  }

  async toolUpdateConfig(args) {
    try {
      const a = args || {};
      const { project_id } = a;
      if (!project_id) {
        this._logError('carta-digital.update_config.validation_failed', { missing: 'project_id' }, 'tool_update_config', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }

      const config = this._getConfig(project_id);
      for (const [key, value] of Object.entries(a)) {
        if (key === 'project_id') continue;
        if (key === 'tema' && value && typeof value === 'object') {
          config.tema = { ...config.tema, ...value };
        } else if (key === 'funcionalidades' && value && typeof value === 'object') {
          config.funcionalidades = { ...config.funcionalidades, ...value };
        } else if (value !== undefined) {
          config[key] = value;
        }
      }

      this.configPerProject.set(project_id, config);
      await this._saveConfig(project_id);
      this.metrics?.increment('carta-digital.config.updated', { project_id });
      this.logger.info('carta-digital.config.actualizada', { project_id });

      return { status: 200, data: { config, user_hint: 'Configuracion actualizada.' } };
    } catch (err) {
      return this._handleHandlerError('carta-digital.update_config.failed', err, 'tool_update_config');
    }
  }

  async toolGetCartaPublica(args) {
    try {
      const { project_id } = args || {};
      if (!project_id) {
        this._logError('carta-digital.get_carta_publica.validation_failed', { missing: 'project_id' }, 'tool_get_carta_publica', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }

      const cached = this.cartaCompuestaCache.get(project_id);
      if (cached) return { status: 200, data: cached };

      return {
        status: 200,
        data: {
          config:    this._getConfig(project_id),
          carta:     null,
          user_hint: 'Carta no compuesta aun. El composer la generara cuando haya datos.'
        }
      };
    } catch (err) {
      return this._handleHandlerError('carta-digital.get_carta_publica.failed', err, 'tool_get_carta_publica');
    }
  }

  async toolSetCartaCompuesta(args) {
    try {
      const { project_id, carta_compuesta } = args || {};
      if (!project_id) {
        this._logError('carta-digital.set_carta_compuesta.validation_failed', { missing: 'project_id' }, 'tool_set_carta_compuesta', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id es requerido', { field: 'project_id' });
      }
      if (!carta_compuesta) {
        this._logError('carta-digital.set_carta_compuesta.validation_failed', { missing: 'carta_compuesta' }, 'tool_set_carta_compuesta', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'carta_compuesta es requerida', { field: 'carta_compuesta' });
      }

      this.cartaCompuestaCache.set(project_id, carta_compuesta);
      this.metrics?.increment('carta-digital.carta_compuesta.set', { project_id });
      this.logger.info('carta-digital.carta_compuesta.set', { project_id });
      return { status: 200, data: { user_hint: 'Carta compuesta actualizada en cache.' } };
    } catch (err) {
      return this._handleHandlerError('carta-digital.set_carta_compuesta.failed', err, 'tool_set_carta_compuesta');
    }
  }

  // ==========================================
  // UI Handlers — delegacion pura
  // ==========================================

  async handleGetConfig(data)         { return this.toolGetConfig({ project_id: data?.project_id }); }
  async handleUpdateConfig(data)      { return this.toolUpdateConfig(data); }
  async handleGetCartaPublica(data)   { return this.toolGetCartaPublica({ project_id: data?.project_id }); }

  async handleHealth() {
    try {
      return {
        status: 200,
        data: {
          status:             'healthy',
          module:             this.name,
          version:            this.version,
          proyectos:          this.configPerProject.size,
          cartas_compuestas:  this.cartaCompuestaCache.size
        }
      };
    } catch (err) {
      return this._handleHandlerError('carta-digital.health.failed', err, 'ui_health');
    }
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'TIMEOUT'                 ? 504 :
                   code === 'FILESYSTEM_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('carta-digital.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (ecod === 'EACCES' || msg.includes('permission'))                                 return 'PERMISSION_DENIED';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (ecod && ecod.startsWith('E'))                                                    return 'FILESYSTEM_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('carta-digital.publish_error', { event: name, error: err.message });
      this.metrics?.increment('carta-digital.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — escritura atomica
  async _atomicWriteFile(absPath, contents) {
    const tmpPath = absPath + '.tmp';
    await fs.writeFile(tmpPath, contents, 'utf-8');
    await fs.rename(tmpPath, absPath);
  }

  // 6o helper — lectura JSON con log+metric en error (no swallow)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-digital.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment('carta-digital.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('carta-digital.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  // ==========================================
  // Internals — agent dispatch + persistencia config
  // ==========================================

  async _publicarAgentRequest({ projectId, sourcePayload, context, task }) {
    await this._publicarEvento('agent.execute.request', {
      request_id:  crypto.randomUUID(),
      user_id:     'system',
      agent_name:  COMPOSER_AGENT,
      project_id:  projectId,
      context:     context || {},
      task
    }, sourcePayload);
  }

  _getConfig(projectId) {
    return this.configPerProject.get(projectId) || this.defaultConfig();
  }

  _configPathFor(projectId) {
    const storagePath = this.projectPaths.get(projectId);
    if (!storagePath) return null;
    return path.join(storagePath, 'carta-digital.json');
  }

  async _loadConfig(projectId) {
    const filePath = this._configPathFor(projectId);
    if (!filePath) {
      this.configPerProject.set(projectId, this.defaultConfig());
      return;
    }

    const loaded = await this._readJsonSafe(filePath, 'config_load');
    if (loaded) {
      this.configPerProject.set(projectId, { ...this.defaultConfig(), ...loaded });
    } else {
      this.configPerProject.set(projectId, this.defaultConfig());
    }
  }

  async _saveConfig(projectId) {
    const filePath = this._configPathFor(projectId);
    if (!filePath) return;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const config = this._getConfig(projectId);
      config.updated_at = new Date().toISOString();
      await this._atomicWriteFile(filePath, JSON.stringify(config, null, 2));
    } catch (err) {
      this.logger.error('carta-digital.config.save_error', { project_id: projectId, error: err.message });
      this.metrics?.increment('carta-digital.errors', { kind: 'config_save', code: this._classifyHandlerError(err) });
    }
  }
}

module.exports = CartaDigitalModule;
