/**
 * pizzepos/carta-impresion v3.0.0 — Generador de cartas impresas (POC2 rewrite).
 *
 * Genera versiones imprimibles de cartas en HTML print-ready. El razonamiento creativo
 * lo hacen 2 agentes:
 *   - `impresion-architect` analiza la carta y decide layout (caras, columnas, formato).
 *   - `impresion-builder`   genera el HTML+CSS segun el guion del architect.
 *
 * Flujo: carta.actualizada → debounce 5s → dispatch architect → architect decide layout
 *        → builder genera HTML → builder llama tool `impresion.save_html`
 *        → modulo guarda en disco y emite `carta.impresion.lista`.
 *
 * Eventos del bus:
 *   subscribes (3): project.activated, project.deactivated, carta.actualizada.
 *   publishes  (2): agent.execute.request (impresion-architect), carta.impresion.lista.
 *
 * 3 tools (impresion.{get, generar, save_html}) + 3 ui_handlers (delegacion).
 */

'use strict';

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const DEFAULT_PROJECT_ID = 'default';
const ARCHITECT_AGENT    = 'impresion-architect';
const DEBOUNCE_MS        = 5000;

class CartaImpresionModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'carta-impresion';
    this.version = '3.0.0';
    this.projectPaths   = new Map();
    this.htmlCache      = new Map();
    this.debounceTimers = new Map();
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
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.projectPaths.clear();
    this.htmlCache.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus handlers
  // ==========================================

  async onProjectActivated(event) {
    const data = this._unwrap(event);
    const { project_id, base_path, metadata } = data || {};
    if (!project_id) {
      this._logError('carta-impresion.project.activated.invalid', { missing: 'project_id' }, 'project_activated', 'INVALID_INPUT');
      return;
    }

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, path.join(resolvedBase, 'storage', 'pizzepos'));
    }
    this.logger.info('carta-impresion.project.activated', { project_id, has_base: !!resolvedBase });
  }

  async onProjectDeactivated(event) {
    const data = this._unwrap(event);
    const { project_id } = data || {};
    if (project_id) this.logger.info('carta-impresion.project.deactivated', { project_id });
    // Multi-tenant: NO limpiar state — el modulo puede reactivar el proyecto sin perder cache.
  }

  async onCartaActualizada(event) {
    const data        = this._unwrap(event);
    const projectId   = data?.project_id;
    const cartaId     = data?.meta?.id;
    if (!projectId || !cartaId) return;

    const key                 = `${projectId}:${cartaId}`;
    const sourceCorrelationId = data?.correlation_id || null;

    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this._dispatchGeneracion(projectId, cartaId, sourceCorrelationId);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);
    this.logger.debug('carta-impresion.regenerate.scheduled', {
      project_id: projectId, carta_id: cartaId, debounce_ms: DEBOUNCE_MS
    });
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolGet(args) {
    try {
      const { project_id, carta_id } = args || {};
      if (!project_id || !carta_id) {
        const missing = !project_id ? 'project_id' : 'carta_id';
        this._logError('carta-impresion.get.validation_failed', { missing }, 'tool_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', `${missing} es requerido`, { field: missing });
      }

      const result = await this._loadHtml(project_id, carta_id);
      if (!result) {
        this._logError('carta-impresion.get.not_found', { project_id, carta_id }, 'tool_get', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          'No hay version imprimible todavia. Usa impresion.generar para crearla.',
          { entity_type: 'carta_impresion', entity_id: carta_id });
      }
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('carta-impresion.get.failed', err, 'tool_get');
    }
  }

  async toolGenerar(args) {
    try {
      const { project_id, carta_id, correlation_id } = args || {};
      if (!project_id || !carta_id) {
        const missing = !project_id ? 'project_id' : 'carta_id';
        this._logError('carta-impresion.generar.validation_failed', { missing }, 'tool_generar', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', `${missing} es requerido`, { field: missing });
      }

      await this._dispatchGeneracion(project_id, carta_id, correlation_id || null);
      return {
        status: 202,
        data: {
          carta_id, project_id,
          user_hint: `Generacion iniciada para carta "${carta_id}". Los agentes estan trabajando.`
        }
      };
    } catch (err) {
      return this._handleHandlerError('carta-impresion.generar.failed', err, 'tool_generar');
    }
  }

  async toolSaveHtml(args) {
    try {
      const { project_id, carta_id, html, layout, brand_applied } = args || {};
      if (!project_id || !carta_id || !html) {
        const missing = !project_id ? 'project_id' : !carta_id ? 'carta_id' : 'html';
        this._logError('carta-impresion.save_html.validation_failed', { missing }, 'tool_save_html', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', `${missing} es requerido`, { field: missing });
      }

      const filePath = await this._saveHtml(project_id, carta_id, html, { layout, brand_applied }, args);
      return {
        status: 200,
        data: {
          path:      filePath,
          carta_id,
          project_id,
          user_hint: `Carta imprimible guardada en ${filePath}`
        }
      };
    } catch (err) {
      return this._handleHandlerError('carta-impresion.save_html.failed', err, 'tool_save_html');
    }
  }

  // ==========================================
  // UI Handlers — delegacion
  // ==========================================

  async handleGet(data)     { return this.toolGet(data); }
  async handleGenerar(data) { return this.toolGenerar(data); }

  async handleHealth() {
    try {
      return {
        status: 200,
        data: {
          status:           'healthy',
          module:           this.name,
          version:          this.version,
          cartas_en_cache:  this.htmlCache.size,
          proyectos:        this.projectPaths.size,
          debounce_pending: this.debounceTimers.size
        }
      };
    } catch (err) {
      return this._handleHandlerError('carta-impresion.health.failed', err, 'ui_health');
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
                   code === 'UPSTREAM_UNREACHABLE'  ? 503 :
                   code === 'UPSTREAM_INVALID_RESPONSE'     ? 502 :
                   code === 'UPSTREAM_TIMEOUT'                 ? 504 :
                   code === 'UNKNOWN_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('carta-impresion.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (ecod === 'EACCES' || msg.includes('permission'))                                 return 'PERMISSION_DENIED';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('no path for project'))                                              return 'UPSTREAM_UNREACHABLE';
    if (ecod && ecod.startsWith('E'))                                                    return 'UNKNOWN_ERROR';
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
      this.logger.error('carta-impresion.publish_error', { event: name, error: err.message });
      this.metrics?.increment('carta-impresion.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
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
        this.logger.warn('carta-impresion.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment('carta-impresion.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('carta-impresion.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  // ==========================================
  // Internals — agent dispatch + persistencia HTML
  // ==========================================

  async _dispatchGeneracion(projectId, cartaId, sourceCorrelationId = null) {
    this.logger.info('carta-impresion.generacion.iniciada', {
      project_id: projectId, carta_id: cartaId
    });

    await this._publicarEvento('agent.execute.request', {
      request_id:  crypto.randomUUID(),
      user_id:     'system',
      agent_name:  ARCHITECT_AGENT,
      project_id:  projectId,
      context:     { carta_id: cartaId },
      task: `Analiza la carta "${cartaId}" del proyecto "${projectId}" y decide el layout optimo para impresion. Luego dispara al builder pasandole tu guion.`
    }, sourceCorrelationId ? { correlation_id: sourceCorrelationId } : null);

    this.metrics?.increment('carta-impresion.generacion.requested', { project_id: projectId });
  }

  _cartasImpresionDirFor(projectId) {
    const basePath = this.projectPaths.get(projectId);
    if (!basePath) return null;
    return path.join(basePath, 'cartas-impresion');
  }

  async _saveHtml(projectId, cartaId, html, metadata = {}, sourcePayload = null) {
    const dir = this._cartasImpresionDirFor(projectId);
    if (!dir) {
      const err = new Error('No path for project');
      err._code = 'UPSTREAM_UNREACHABLE';
      throw err;
    }

    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${cartaId}.html`);
    await this._atomicWriteFile(filePath, html);

    const metaPath = path.join(dir, `${cartaId}.meta.json`);
    const metaData = {
      carta_id:    cartaId,
      project_id:  projectId,
      generado_at: new Date().toISOString(),
      ...metadata
    };
    await this._atomicWriteFile(metaPath, JSON.stringify(metaData, null, 2));

    const key = `${projectId}:${cartaId}`;
    this.htmlCache.set(key, { filePath, metadata: metaData });

    await this._publicarEvento('carta.impresion.lista', {
      project_id: projectId,
      carta_id:   cartaId,
      path:       filePath,
      metadata:   metaData
    }, sourcePayload);

    this.metrics?.increment('carta-impresion.generacion.completada', { project_id: projectId });
    this.logger.info('carta-impresion.html.saved', {
      project_id: projectId, carta_id: cartaId, path: filePath
    });
    return filePath;
  }

  async _loadHtml(projectId, cartaId) {
    const dir = this._cartasImpresionDirFor(projectId);
    if (!dir) return null;

    const filePath = path.join(dir, `${cartaId}.html`);
    const metaPath = path.join(dir, `${cartaId}.meta.json`);

    let html;
    try {
      html = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-impresion.html.read_error', { file: filePath, error: err.message });
        this.metrics?.increment('carta-impresion.errors', { kind: 'html_read', code: this._classifyHandlerError(err) });
      }
      return null;
    }

    const metadata = await this._readJsonSafe(metaPath, 'meta');
    return { html, filePath, metadata };
  }
}

module.exports = CartaImpresionModule;
