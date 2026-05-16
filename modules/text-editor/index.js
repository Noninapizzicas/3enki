/**
 * Text Editor Module v2.0.0 — POC2 canonico.
 *
 * Backend de editor de archivos invocado desde el frontend Svelte
 * (frontend/src/lib/modules/files/index.ts) via topics MQTT canonicos:
 *   ui/request/editor/{open,save,validate,format}
 *
 * Edita .md y .json (configurable) dentro del directorio de cada proyecto
 * (data/projects/<project_id>/). Path traversal validado en validatePath().
 * Save atomico (.tmp + rename) para evitar corrupcion en mid-write.
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

const BaseModule = require('../_shared/base-module');
const DEFAULT_SUPPORTED_FORMATS = ['md', 'json', 'txt', 'html', 'css', 'js', 'yaml', 'yml', 'xml'];
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_TAB_SIZE = 2;

class TextEditorModule extends BaseModule {
  constructor() {
    super();
    this.name = 'text-editor';
    this.version = '2.0.0';
    this.config = null;
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics || null;
    this.eventBus = core.eventBus;
    this.config = {
      supported_formats: DEFAULT_SUPPORTED_FORMATS,
      max_file_size: DEFAULT_MAX_FILE_SIZE,
      tab_size: DEFAULT_TAB_SIZE,
      ...(core.moduleConfig || {})
    };

    this.logger.info('text-editor.loaded', {
      module: this.name, version: this.version,
      supported_formats: this.config.supported_formats,
      max_file_size: this.config.max_file_size
    });
  }

  async onUnload() {
    this.logger?.info?.('text-editor.unloaded', { module: this.name });
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
    if (/access denied|outside project/i.test(msg)) return { status: 403, code: 'PERMISSION_DENIED' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/too large/i.test(msg)) return { status: 413, code: 'INVALID_INPUT' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('text-editor.errors', { code, kind });
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
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('text-editor.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
  }

  async _atomicWriteFile(targetPath, data) {
    const tmp = `${targetPath}.tmp`;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tmp, data, 'utf-8');
    try {
      await fs.rename(tmp, targetPath);
    } catch (err) {
      try { await fs.unlink(tmp); } catch (_) { /* ignore */ }
      throw err;
    }
  }

  // ==========================================
  // Bus subscribers (auto-wired desde manifest)
  // ==========================================

  async onOpenRequest(event) {
    try {
      const data = event?.data || event?.payload || event;
      const result = await this._performOpen(data);
      const responsePayload = result.error
        ? { request_id: data?.request_id, success: false, error: result.error }
        : { request_id: data?.request_id, success: true, data: result.data };
      await this._publicarEvento('editor.open.response', responsePayload, data);
    } catch (err) {
      const data = event?.data || event;
      await this._publicarEvento('editor.open.response', {
        request_id: data?.request_id,
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, data);
      this._handleHandlerError('text-editor.open_request.error', err, 'subscribe');
    }
  }

  async onSaveRequest(event) {
    try {
      const data = event?.data || event?.payload || event;
      const result = await this._performSave(data);
      if (result.error) {
        await this._publicarEvento('editor.error', {
          request_id: data?.request_id,
          error: result.error
        }, data);
        return;
      }
      await this._publicarEvento('editor.saved', {
        request_id: data?.request_id,
        project_id: data?.project_id,
        file_path: data?.file_path,
        size: result.data.size
      }, data);
    } catch (err) {
      const data = event?.data || event;
      await this._publicarEvento('editor.error', {
        request_id: data?.request_id,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, data);
      this._handleHandlerError('text-editor.save_request.error', err, 'subscribe');
    }
  }

  async onValidateRequest(event) {
    try {
      const data = event?.data || event?.payload || event;
      const result = await this._performValidate(data);
      const responsePayload = result.error
        ? { request_id: data?.request_id, success: false, error: result.error }
        : { request_id: data?.request_id, success: true, data: result.data };
      await this._publicarEvento('editor.validate.response', responsePayload, data);
    } catch (err) {
      const data = event?.data || event;
      await this._publicarEvento('editor.validate.response', {
        request_id: data?.request_id,
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, data);
      this._handleHandlerError('text-editor.validate_request.error', err, 'subscribe');
    }
  }

  async onFormatRequest(event) {
    try {
      const data = event?.data || event?.payload || event;
      const result = await this._performFormat(data);
      const responsePayload = result.error
        ? { request_id: data?.request_id, success: false, error: result.error }
        : { request_id: data?.request_id, success: true, data: result.data };
      await this._publicarEvento('editor.format.response', responsePayload, data);
    } catch (err) {
      const data = event?.data || event;
      await this._publicarEvento('editor.format.response', {
        request_id: data?.request_id,
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, data);
      this._handleHandlerError('text-editor.format_request.error', err, 'subscribe');
    }
  }

  // ==========================================
  // UI Handlers (canonical { status, data | error } shape)
  // ==========================================

  async handleOpen(data) {
    try {
      const result = await this._performOpen(data || {});
      if (result.error) {
        return this._errorResponse(result.error.status || 400, result.error.code, result.error.message, result.error.details);
      }
      return { status: 200, data: result.data };
    } catch (err) {
      return this._handleHandlerError('text-editor.open.error', err);
    }
  }

  async handleSave(data) {
    try {
      const result = await this._performSave(data || {});
      if (result.error) {
        return this._errorResponse(result.error.status || 400, result.error.code, result.error.message, result.error.details);
      }
      // Emite editor.saved tambien desde el path UI
      await this._publicarEvento('editor.saved', {
        project_id: data?.project_id,
        file_path: data?.file_path,
        size: result.data.size
      }, data);
      return { status: 200, data: result.data };
    } catch (err) {
      return this._handleHandlerError('text-editor.save.error', err);
    }
  }

  async handleValidate(data) {
    try {
      const result = await this._performValidate(data || {});
      if (result.error) {
        return this._errorResponse(result.error.status || 400, result.error.code, result.error.message, result.error.details);
      }
      return { status: 200, data: result.data };
    } catch (err) {
      return this._handleHandlerError('text-editor.validate.error', err);
    }
  }

  async handleFormat(data) {
    try {
      const result = await this._performFormat(data || {});
      if (result.error) {
        return this._errorResponse(result.error.status || 400, result.error.code, result.error.message, result.error.details);
      }
      return { status: 200, data: result.data };
    } catch (err) {
      return this._handleHandlerError('text-editor.format.error', err);
    }
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        supported_formats: this.config.supported_formats,
        max_file_size: this.config.max_file_size
      }
    };
  }

  // ==========================================
  // Operaciones unificadas (compartidas por bus + UI handlers)
  // ==========================================

  async _performOpen(data) {
    const { project_id, file_path } = data || {};

    if (!file_path) {
      this.metrics?.increment?.('text-editor.errors', { code: 'INVALID_INPUT', kind: 'open' });
      this.logger?.warn?.('text-editor.open.missing', { field: 'file_path' });
      return { error: { status: 400, code: 'INVALID_INPUT', message: 'file_path is required', details: { field: 'file_path' } } };
    }

    const basePath = await this.getBasePath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(basePath, file_path);
    } catch (err) {
      this.metrics?.increment?.('text-editor.errors', { code: 'PERMISSION_DENIED', kind: 'open' });
      this.logger?.warn?.('text-editor.open.path_traversal', { project_id, file_path });
      return { error: { status: 403, code: 'PERMISSION_DENIED', message: err.message, details: { file_path } } };
    }

    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.metrics?.increment?.('text-editor.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'open' });
        this.logger?.warn?.('text-editor.open.not_found', { project_id, file_path });
        return { error: { status: 404, code: 'RESOURCE_NOT_FOUND', message: 'File not found', details: { file_path } } };
      }
      throw err;
    }

    if (stats.size > this.config.max_file_size) {
      this.metrics?.increment?.('text-editor.errors', { code: 'INVALID_INPUT', kind: 'open' });
      this.logger?.warn?.('text-editor.open.too_large', { project_id, file_path, size: stats.size });
      return {
        error: {
          status: 413, code: 'INVALID_INPUT',
          message: `File too large. Maximum size: ${this.config.max_file_size} bytes`,
          details: { file_path, size: stats.size, max: this.config.max_file_size }
        }
      };
    }

    const extension = path.extname(file_path).slice(1).toLowerCase();
    if (!this.config.supported_formats.includes(extension)) {
      this.metrics?.increment?.('text-editor.errors', { code: 'INVALID_INPUT', kind: 'open' });
      this.logger?.warn?.('text-editor.open.unsupported_format', { extension, file_path });
      return {
        error: {
          status: 400, code: 'INVALID_INPUT',
          message: `Unsupported format: ${extension}`,
          details: { extension, supported: this.config.supported_formats }
        }
      };
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    this.metrics?.increment?.('text-editor.files_opened');

    return {
      data: {
        file_path,
        content,
        extension,
        size: stats.size,
        modified: stats.mtime,
        readonly: false
      }
    };
  }

  async _performSave(data) {
    const { project_id, file_path, content } = data || {};

    if (!file_path || content === undefined) {
      this.metrics?.increment?.('text-editor.errors', { code: 'INVALID_INPUT', kind: 'save' });
      this.logger?.warn?.('text-editor.save.missing', {
        missing: ['file_path', 'content'].filter(f => !data?.[f] && data?.[f] !== '')
      });
      return {
        error: {
          status: 400, code: 'INVALID_INPUT',
          message: 'file_path and content are required',
          details: { fields: ['file_path', 'content'] }
        }
      };
    }

    const basePath = await this.getBasePath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(basePath, file_path);
    } catch (err) {
      this.metrics?.increment?.('text-editor.errors', { code: 'PERMISSION_DENIED', kind: 'save' });
      this.logger?.warn?.('text-editor.save.path_traversal', { project_id, file_path });
      return { error: { status: 403, code: 'PERMISSION_DENIED', message: err.message, details: { file_path } } };
    }

    const extension = path.extname(file_path).slice(1).toLowerCase();
    if (extension === 'json') {
      try {
        JSON.parse(content);
      } catch (err) {
        this.metrics?.increment?.('text-editor.errors', { code: 'INVALID_INPUT', kind: 'save' });
        this.logger?.warn?.('text-editor.save.invalid_json', { file_path, error_message: err.message });
        return {
          error: {
            status: 400, code: 'INVALID_INPUT',
            message: 'Invalid JSON: ' + err.message,
            details: { file_path }
          }
        };
      }
    }

    await this._atomicWriteFile(fullPath, content);
    const stats = await fs.stat(fullPath);

    this.metrics?.increment?.('text-editor.files_saved');
    this.logger.info('text-editor.file.saved', {
      project_id, file_path, size: stats.size
    });

    return {
      data: {
        file_path,
        saved: true,
        size: stats.size,
        modified: stats.mtime
      }
    };
  }

  async _performValidate(data) {
    const { content, format } = data || {};

    if (content === undefined || !format) {
      this.metrics?.increment?.('text-editor.errors', { code: 'INVALID_INPUT', kind: 'validate' });
      this.logger?.warn?.('text-editor.validate.missing', {
        missing: ['content', 'format'].filter(f => f === 'content' ? content === undefined : !data?.[f])
      });
      return {
        error: {
          status: 400, code: 'INVALID_INPUT',
          message: 'content and format are required',
          details: { fields: ['content', 'format'] }
        }
      };
    }

    const validation = this.validateByFormat(content, format);
    if (!validation.valid) {
      this.metrics?.increment?.('text-editor.validation_errors');
    }

    return { data: validation };
  }

  async _performFormat(data) {
    const { content, format } = data || {};

    if (content === undefined || !format) {
      this.metrics?.increment?.('text-editor.errors', { code: 'INVALID_INPUT', kind: 'format' });
      return {
        error: {
          status: 400, code: 'INVALID_INPUT',
          message: 'content and format are required',
          details: { fields: ['content', 'format'] }
        }
      };
    }

    const formatted = this.formatByFormat(content, format);
    return {
      data: {
        formatted: formatted.content,
        changed: formatted.changed
      }
    };
  }

  // ==========================================
  // Helpers internos
  // ==========================================

  /**
   * Devuelve el directorio base para operaciones.
   * Si project_id es null/undefined, devuelve el root data/projects/.
   */
  async getBasePath(project_id) {
    const projectsRoot = path.join(process.cwd(), 'data', 'projects');
    await fs.mkdir(projectsRoot, { recursive: true });

    if (!project_id) return projectsRoot;

    const projectDir = path.join(projectsRoot, project_id);
    await fs.mkdir(projectDir, { recursive: true });
    return projectDir;
  }

  /**
   * Valida que el path este dentro del directorio del proyecto (path traversal guard).
   * @throws Error si el path resuelto sale del directorio base.
   */
  validatePath(basePath, relativePath) {
    const normalizedBase = path.resolve(basePath);
    const safePath = (relativePath || '').replace(/^\/+/, '');
    const fullPath = path.resolve(basePath, safePath);

    if (!fullPath.startsWith(normalizedBase + path.sep) && fullPath !== normalizedBase) {
      throw new Error('Access denied: Path outside project directory');
    }
    return fullPath;
  }

  validateByFormat(content, format) {
    const validation = { valid: true, errors: [], warnings: [] };
    const fmt = format.toLowerCase();

    if (fmt === 'json') {
      try {
        JSON.parse(content);
      } catch (err) {
        validation.valid = false;
        validation.errors.push({
          line: null,
          message: err.message,
          type: 'syntax'
        });
      }
    } else if (fmt === 'md' || fmt === 'markdown') {
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('[') && line.includes('](') && !line.includes(')')) {
          validation.warnings.push({
            line: index + 1,
            message: 'Possibly broken markdown link',
            type: 'syntax'
          });
        }
      });
    }

    return validation;
  }

  formatByFormat(content, format) {
    let formatted = content;
    let changed = false;
    const fmt = format.toLowerCase();

    if (fmt === 'json') {
      try {
        const parsed = JSON.parse(content);
        const indented = JSON.stringify(parsed, null, this.config.tab_size);
        if (indented !== content) {
          formatted = indented;
          changed = true;
        }
      } catch (_) {
        // No se puede formatear JSON invalido — devolver el original sin cambios
      }
    } else if (fmt === 'md' || fmt === 'markdown') {
      const lines = content.split('\n');
      const trimmed = lines.map(line => line.trimEnd()).join('\n');
      if (trimmed !== content) {
        formatted = trimmed;
        changed = true;
      }
    }

    return { content: formatted, changed };
  }
}

module.exports = TextEditorModule;
