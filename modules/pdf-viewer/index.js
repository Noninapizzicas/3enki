'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const { EVENTS } = require('../../core/constants');

const CODE_TO_STATUS = {
  MISSING_FIELD: 400, INVALID_INPUT: 400, QUOTA_EXCEEDED: 413,
  PERMISSION_DENIED: 403, RESOURCE_NOT_FOUND: 404,
  TIMEOUT: 504, DEPENDENCY_UNAVAILABLE: 503,
  FILESYSTEM_ERROR: 500, UNKNOWN_ERROR: 500,
};

class PdfViewerModule {
  constructor() {
    this.name = 'pdf-viewer';
    this.version = '2.0.0';
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
    this.cache = new Map();
    this.projectPaths = new Map();
    this.cacheCleanupInterval = null;
    this.systemProjects = new Set(['system', '_prompts']);
  }

  // === POC2 Helpers ===

  _errorResponse(status, code, message, details) {
    const err = { code, message };
    if (details !== undefined) err.details = details;
    return { status, error: err };
  }

  _classifyHandlerError(err) {
    if (err._code) return err._code;
    const msg = (err.message || '').toLowerCase();
    const nodeCode = err.code;
    if (nodeCode === 'ENOENT' || msg.includes('not found') || msg.includes('no such file')) return 'RESOURCE_NOT_FOUND';
    if (nodeCode === 'EACCES' || msg.includes('access denied') || msg.includes('outside') || msg.includes('permission')) return 'PERMISSION_DENIED';
    if (msg.includes('required') || msg.includes('missing')) return 'MISSING_FIELD';
    if (msg.includes('must be a pdf') || msg.includes('not a pdf')) return 'INVALID_INPUT';
    if (msg.includes('too large') || msg.includes('quota')) return 'QUOTA_EXCEEDED';
    if (msg.includes('timeout')) return 'TIMEOUT';
    if (nodeCode === 'EIO' || nodeCode === 'EBUSY') return 'FILESYSTEM_ERROR';
    return 'UNKNOWN_ERROR';
  }

  _handleHandlerError(prefix, err, kind) {
    const code = this._classifyHandlerError(err);
    const status = CODE_TO_STATUS[code] || 500;
    this.logger.error(`${prefix}.failed`, { error: err.message, code, kind });
    this.metrics?.increment(`pdf-viewer.${kind || 'error'}.failed`, { code });
    return this._errorResponse(status, code, err.message, err._details);
  }

  async _publicarEvento(event, payload, ctx) {
    const correlation_id = ctx?.correlation_id || crypto.randomUUID();
    await this.eventBus.publish(event, {
      ...payload,
      correlation_id,
      timestamp: new Date().toISOString()
    });
  }

  _validatePathSafe(projectPath, relativePath) {
    const normalizedBase = path.resolve(projectPath);
    const safePath = (relativePath || '').replace(/^\/+/, '');
    const fullPath = path.resolve(projectPath, safePath);
    if (!fullPath.startsWith(normalizedBase + path.sep) && fullPath !== normalizedBase) {
      const err = new Error('Access denied: path outside project directory');
      err._code = 'PERMISSION_DENIED';
      throw err;
    }
    return fullPath;
  }

  // === Lifecycle ===

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.moduleConfig || {};
    this.logger.info('pdf-viewer.loading', { module: this.name });
    if (this.config.cache_enabled) this.setupCacheCleanup();
    this.logger.info('pdf-viewer.loaded', { module: this.name });
  }

  async onUnload() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.cache.clear();
    this.projectPaths.clear();
    this.logger.info('pdf-viewer.unloaded', { module: this.name });
  }

  // === Event Handlers ===

  async handleViewRequest(event) {
    const { request_id, project_id, file_path, correlation_id } = event.data;
    const ctx = { correlation_id };
    try {
      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this._validatePathSafe(projectPath, file_path);
      const [buffer, stats] = await Promise.all([fs.readFile(fullPath), fs.stat(fullPath)]);
      this.metrics?.increment('pdf-viewer.view.success');
      await this._publicarEvento(EVENTS.PDF.VIEW_RESPONSE, {
        request_id, project_id, success: true,
        data: { file_path, content: buffer.toString('base64'), size: stats.size }
      }, ctx);
    } catch (error) {
      const code = this._classifyHandlerError(error);
      this.logger.error('pdf-viewer.view.failed', { request_id, project_id, error: error.message, code });
      this.metrics?.increment('pdf-viewer.view.failed', { code });
      await this._publicarEvento(EVENTS.PDF.VIEW_RESPONSE, {
        request_id, project_id, success: false,
        error: { code, message: error.message }
      }, ctx);
    }
  }

  async handleExtractRequest(event) {
    const { request_id, project_id, correlation_id } = event.data;
    const ctx = { correlation_id };
    try {
      this.metrics?.increment('pdf-viewer.extract.success');
      await this._publicarEvento(EVENTS.PDF.EXTRACT_RESPONSE, {
        request_id, project_id, success: true,
        data: { text: 'Text extraction requires pdf-parse library', note: 'Install pdf-parse for full functionality' }
      }, ctx);
    } catch (error) {
      const code = this._classifyHandlerError(error);
      this.logger.error('pdf-viewer.extract.failed', { request_id, project_id, error: error.message, code });
      this.metrics?.increment('pdf-viewer.extract.failed', { code });
      await this._publicarEvento(EVENTS.PDF.EXTRACT_RESPONSE, {
        request_id, project_id, success: false,
        error: { code, message: error.message }
      }, ctx);
    }
  }

  async handleMetadataRequest(event) {
    const { request_id, project_id, file_path, correlation_id } = event.data;
    const ctx = { correlation_id };
    try {
      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this._validatePathSafe(projectPath, file_path);
      const stats = await fs.stat(fullPath);
      this.metrics?.increment('pdf-viewer.metadata.success');
      await this._publicarEvento(EVENTS.PDF.METADATA_RESPONSE, {
        request_id, project_id, success: true,
        data: { file_path, filename: path.basename(file_path), size: stats.size, modified: stats.mtime }
      }, ctx);
    } catch (error) {
      const code = this._classifyHandlerError(error);
      this.logger.error('pdf-viewer.metadata.failed', { request_id, project_id, error: error.message, code });
      this.metrics?.increment('pdf-viewer.metadata.failed', { code });
      await this._publicarEvento(EVENTS.PDF.METADATA_RESPONSE, {
        request_id, project_id, success: false,
        error: { code, message: error.message }
      }, ctx);
    }
  }

  async handleListRequest(event) {
    const { request_id, project_id, correlation_id } = event.data;
    const ctx = { correlation_id };
    try {
      const projectPath = await this.getProjectPath(project_id);
      const pdfs = await this.findPdfsRecursive(projectPath);
      this.metrics?.increment('pdf-viewer.list.success');
      await this._publicarEvento(EVENTS.PDF.LIST_RESPONSE, {
        request_id, project_id, success: true, data: { pdfs }
      }, ctx);
    } catch (error) {
      const code = this._classifyHandlerError(error);
      this.logger.error('pdf-viewer.list.failed', { request_id, project_id, error: error.message, code });
      this.metrics?.increment('pdf-viewer.list.failed', { code });
      await this._publicarEvento(EVENTS.PDF.LIST_RESPONSE, {
        request_id, project_id, success: false,
        error: { code, message: error.message }
      }, ctx);
    }
  }

  // === HTTP Handlers ===

  async viewPdf(req, res) {
    const { project_id, file_path } = req.query;
    if (!project_id || !file_path) {
      return res.status(400).json({ status: 400, error: { code: 'MISSING_FIELD', message: 'project_id and file_path are required' } });
    }
    try {
      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this._validatePathSafe(projectPath, file_path);
      if (!fullPath.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ status: 400, error: { code: 'INVALID_INPUT', message: 'File must be a PDF' } });
      }
      const stats = await fs.stat(fullPath);
      if (this.config.max_pdf_size && stats.size > this.config.max_pdf_size) {
        return res.status(413).json({ status: 413, error: { code: 'QUOTA_EXCEEDED', message: `PDF too large. Maximum: ${this.config.max_pdf_size} bytes` } });
      }
      const buffer = await fs.readFile(fullPath);
      this.metrics?.increment('pdf-viewer.http.view.success');
      res.json({ status: 200, data: { file_path, size: stats.size, modified: stats.mtime, content: buffer.toString('base64'), content_type: 'application/pdf' } });
    } catch (error) {
      const code = this._classifyHandlerError(error);
      const status = CODE_TO_STATUS[code] || 500;
      this.logger.error('pdf-viewer.http.view.failed', { project_id, file_path, error: error.message, code });
      this.metrics?.increment('pdf-viewer.http.view.failed', { code });
      res.status(status).json({ status, error: { code, message: error.message } });
    }
  }

  async extractText(req, res) {
    const { project_id, file_path } = req.query;
    if (!project_id || !file_path) {
      return res.status(400).json({ status: 400, error: { code: 'MISSING_FIELD', message: 'project_id and file_path are required' } });
    }
    try {
      const projectPath = await this.getProjectPath(project_id);
      this._validatePathSafe(projectPath, file_path);
      this.metrics?.increment('pdf-viewer.http.extract.success');
      res.json({ status: 200, data: { file_path, text: 'Text extraction requires pdf-parse library. Install with: npm install pdf-parse', pages: null } });
    } catch (error) {
      const code = this._classifyHandlerError(error);
      const status = CODE_TO_STATUS[code] || 500;
      this.logger.error('pdf-viewer.http.extract.failed', { project_id, file_path, error: error.message, code });
      this.metrics?.increment('pdf-viewer.http.extract.failed', { code });
      res.status(status).json({ status, error: { code, message: error.message } });
    }
  }

  async getMetadata(req, res) {
    const { project_id, file_path } = req.query;
    if (!project_id || !file_path) {
      return res.status(400).json({ status: 400, error: { code: 'MISSING_FIELD', message: 'project_id and file_path are required' } });
    }
    try {
      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this._validatePathSafe(projectPath, file_path);
      const stats = await fs.stat(fullPath);
      this.metrics?.increment('pdf-viewer.http.metadata.success');
      res.json({ status: 200, data: {
        file_path, filename: path.basename(file_path),
        size: stats.size, size_formatted: this.formatBytes(stats.size),
        created: stats.birthtime, modified: stats.mtime, accessed: stats.atime
      }});
    } catch (error) {
      const code = this._classifyHandlerError(error);
      const status = CODE_TO_STATUS[code] || 500;
      this.logger.error('pdf-viewer.http.metadata.failed', { project_id, file_path, error: error.message, code });
      this.metrics?.increment('pdf-viewer.http.metadata.failed', { code });
      res.status(status).json({ status, error: { code, message: error.message } });
    }
  }

  async listPdfs(req, res) {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ status: 400, error: { code: 'MISSING_FIELD', message: 'project_id is required' } });
    }
    try {
      const projectPath = await this.getProjectPath(project_id);
      const pdfs = await this.findPdfsRecursive(projectPath);
      this.metrics?.increment('pdf-viewer.http.list.success');
      res.json({ status: 200, data: { project_id, pdfs, count: pdfs.length } });
    } catch (error) {
      const code = this._classifyHandlerError(error);
      const status = CODE_TO_STATUS[code] || 500;
      this.logger.error('pdf-viewer.http.list.failed', { project_id, error: error.message, code });
      this.metrics?.increment('pdf-viewer.http.list.failed', { code });
      res.status(status).json({ status, error: { code, message: error.message } });
    }
  }

  // === UI Handlers ===

  async handleUIView(data) {
    const { project_id, file_path } = data || {};
    if (!file_path) return this._errorResponse(400, 'MISSING_FIELD', 'file_path is required');
    try {
      const basePath = await this.getBasePath(project_id);
      const fullPath = this._validatePathSafe(basePath, file_path);
      if (!fullPath.toLowerCase().endsWith('.pdf')) {
        return this._errorResponse(400, 'INVALID_INPUT', 'File must be a PDF');
      }
      const stats = await fs.stat(fullPath);
      if (this.config.max_pdf_size && stats.size > this.config.max_pdf_size) {
        return this._errorResponse(413, 'QUOTA_EXCEEDED', `PDF too large. Maximum: ${this.config.max_pdf_size} bytes`);
      }
      const buffer = await fs.readFile(fullPath);
      this.metrics?.increment('pdf-viewer.ui.view.success');
      return { status: 200, data: {
        file_path, size: stats.size,
        size_formatted: this.formatBytes(stats.size),
        modified: stats.mtime, content: buffer.toString('base64'),
        content_type: 'application/pdf'
      }};
    } catch (error) {
      return this._handleHandlerError('pdf-viewer.ui.view', error, 'ui.view');
    }
  }

  async handleUIMetadata(data) {
    const { project_id, file_path } = data || {};
    if (!file_path) return this._errorResponse(400, 'MISSING_FIELD', 'file_path is required');
    try {
      const basePath = await this.getBasePath(project_id);
      const fullPath = this._validatePathSafe(basePath, file_path);
      const stats = await fs.stat(fullPath);
      this.metrics?.increment('pdf-viewer.ui.metadata.success');
      return { status: 200, data: {
        file_path, filename: path.basename(file_path),
        size: stats.size, size_formatted: this.formatBytes(stats.size),
        created: stats.birthtime, modified: stats.mtime, accessed: stats.atime
      }};
    } catch (error) {
      return this._handleHandlerError('pdf-viewer.ui.metadata', error, 'ui.metadata');
    }
  }

  async handleUIListPdfs(data) {
    const { project_id } = data || {};
    try {
      const basePath = await this.getBasePath(project_id);
      const pdfs = await this.findPdfsRecursive(basePath);
      this.metrics?.increment('pdf-viewer.ui.list.success');
      return { status: 200, data: { project_id, pdfs, count: pdfs.length } };
    } catch (error) {
      return this._handleHandlerError('pdf-viewer.ui.list', error, 'ui.list');
    }
  }

  // === Tool Handlers ===

  async handleToolCreate(args) {
    const {
      project_id, filename, title, content,
      type = 'from_text', orientation = 'portrait', format = 'A4', margin = 50
    } = args || {};
    if (!filename) return this._errorResponse(400, 'MISSING_FIELD', 'filename is required');
    if (!content) return this._errorResponse(400, 'MISSING_FIELD', 'content is required');
    const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    this.logger.info('pdf-viewer.tool.create.start', {
      project_id, filename: safeName, type,
      content_length: typeof content === 'string' ? content.length : JSON.stringify(content).length
    });
    try {
      const result = await this.createViaProvider({
        type, content: title ? { title, body: content } : content,
        filename: safeName, options: { orientation, format, margin }
      });
      if (result) {
        this.logger.info('pdf-viewer.tool.create.success', { filename: safeName, path: result.path, size: result.size, method: 'provider' });
        this.metrics?.increment('pdf-viewer.tool.create.success', { method: 'provider' });
        return { status: 200, data: { filename: safeName, path: result.path, size: result.size, method: 'provider' } };
      }
      return await this.createDirectPdf({ type, content, title, filename: safeName, orientation, format, margin, project_id });
    } catch (error) {
      return this._handleHandlerError('pdf-viewer.tool.create', error, 'tool.create');
    }
  }

  async handleToolList(args) {
    const { projectId } = args || {};
    if (!projectId) return this._errorResponse(400, 'MISSING_FIELD', 'projectId is required');
    this.logger.info('pdf-viewer.tool.list.start', { project_id: projectId });
    try {
      const basePath = await this.getBasePath(projectId);
      const pdfs = await this.findPdfsRecursive(basePath);
      this.logger.info('pdf-viewer.tool.list.success', { project_id: projectId, count: pdfs.length });
      this.metrics?.increment('pdf-viewer.tool.list.success');
      return { status: 200, data: { projectId, pdfs, count: pdfs.length } };
    } catch (error) {
      return this._handleHandlerError('pdf-viewer.tool.list', error, 'tool.list');
    }
  }

  async handleToolMetadata(args) {
    const { projectId, filePath } = args || {};
    if (!projectId) return this._errorResponse(400, 'MISSING_FIELD', 'projectId is required');
    if (!filePath) return this._errorResponse(400, 'MISSING_FIELD', 'filePath is required');
    this.logger.info('pdf-viewer.tool.metadata.start', { project_id: projectId, file_path: filePath });
    try {
      const basePath = await this.getBasePath(projectId);
      const fullPath = this._validatePathSafe(basePath, filePath);
      if (!fullPath.toLowerCase().endsWith('.pdf')) {
        return this._errorResponse(400, 'INVALID_INPUT', 'File must be a PDF');
      }
      const stats = await fs.stat(fullPath);
      this.logger.info('pdf-viewer.tool.metadata.success', { project_id: projectId, file_path: filePath });
      this.metrics?.increment('pdf-viewer.tool.metadata.success');
      return { status: 200, data: {
        projectId, filePath, filename: path.basename(filePath),
        size: stats.size, sizeFormatted: this.formatBytes(stats.size),
        created: stats.birthtime, modified: stats.mtime, accessed: stats.atime
      }};
    } catch (error) {
      return this._handleHandlerError('pdf-viewer.tool.metadata', error, 'tool.metadata');
    }
  }

  async handleToolExtract(args) {
    const { projectId, filePath, page } = args || {};
    if (!projectId) return this._errorResponse(400, 'MISSING_FIELD', 'projectId is required');
    if (!filePath) return this._errorResponse(400, 'MISSING_FIELD', 'filePath is required');
    this.logger.info('pdf-viewer.tool.extract.start', { project_id: projectId, file_path: filePath, page: page || 'all' });
    try {
      const basePath = await this.getBasePath(projectId);
      const fullPath = this._validatePathSafe(basePath, filePath);
      if (!fullPath.toLowerCase().endsWith('.pdf')) {
        return this._errorResponse(400, 'INVALID_INPUT', 'File must be a PDF');
      }
      await fs.stat(fullPath);
      let text = null, pages = null, method = null;
      try {
        const pageArgs = page ? `-f ${page} -l ${page}` : '';
        text = execSync(`pdftotext ${pageArgs} "${fullPath}" -`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        try {
          const info = execSync(`pdfinfo "${fullPath}"`, { encoding: 'utf-8' });
          const m = info.match(/Pages:\s+(\d+)/);
          pages = m ? parseInt(m[1], 10) : null;
        } catch { /* pdfinfo unavailable */ }
        method = 'pdftotext';
        this.logger.info('pdf-viewer.tool.extract.pdftotext.success', { project_id: projectId, file_path: filePath, pages, text_length: text?.length || 0 });
      } catch (pdftotextError) {
        this.logger.debug('pdf-viewer.tool.extract.pdftotext.unavailable', { error: pdftotextError.message });
        try {
          const pdfParse = require('pdf-parse');
          const buffer = await fs.readFile(fullPath);
          const parsed = await pdfParse(buffer);
          text = parsed.text; pages = parsed.numpages; method = 'pdf-parse';
          this.logger.info('pdf-viewer.tool.extract.pdfparse.success', { project_id: projectId, file_path: filePath, pages, text_length: text?.length || 0 });
        } catch (parseError) {
          this.logger.warn('pdf-viewer.tool.extract.no_parser', { pdftotext_error: pdftotextError.message, pdfparse_error: parseError.message });
          this.metrics?.increment('pdf-viewer.tool.extract.no_parser');
          return { status: 200, data: { projectId, filePath, text: null, pages: null, note: 'No PDF parser available. Install poppler-utils or pdf-parse.', requestedPage: page || null } };
        }
      }
      this.metrics?.increment('pdf-viewer.tool.extract.success', { method });
      return { status: 200, data: { projectId, filePath, text, pages, method, requestedPage: page || null } };
    } catch (error) {
      return this._handleHandlerError('pdf-viewer.tool.extract', error, 'tool.extract');
    }
  }

  // === Domain Helpers ===

  async getBasePath(project_id) {
    const projectsRoot = path.join(process.cwd(), 'data', 'projects');
    await fs.mkdir(projectsRoot, { recursive: true });
    if (!project_id) return projectsRoot;
    const projectDir = path.join(projectsRoot, project_id);
    await fs.mkdir(projectDir, { recursive: true });
    return projectDir;
  }

  async getProjectPath(project_id) {
    if (this.projectPaths.has(project_id)) {
      const cachedPath = this.projectPaths.get(project_id);
      await fs.mkdir(cachedPath, { recursive: true });
      return cachedPath;
    }
    if (this.systemProjects.has(project_id)) {
      const legacyPath = path.join(process.cwd(), 'data', 'projects', project_id);
      await fs.mkdir(legacyPath, { recursive: true });
      return legacyPath;
    }
    try {
      const result = await this.queryProjectBasePath(project_id);
      if (result) {
        const storagePath = path.join(result, 'storage');
        this.projectPaths.set(project_id, storagePath);
        await fs.mkdir(storagePath, { recursive: true });
        return storagePath;
      }
    } catch (err) {
      this.logger.debug('pdf-viewer.project.path.fallback', { project_id, error: err.message });
    }
    const fallbackPath = path.join(process.cwd(), 'data', 'projects', project_id);
    await fs.mkdir(fallbackPath, { recursive: true });
    return fallbackPath;
  }

  async queryProjectBasePath(project_id) {
    return new Promise((resolve, reject) => {
      const requestId = `pdf_path_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const timeout = setTimeout(() => {
        const err = new Error('Timeout querying project path');
        err._code = 'TIMEOUT';
        reject(err);
      }, 5000);
      this.eventBus.subscribe('db.query.response', (event) => {
        const data = event.data || event;
        if (data.request_id !== requestId) return;
        clearTimeout(timeout);
        if (data.success && data.data?.length > 0) resolve(data.data[0].base_path);
        else resolve(null);
      }).then(unsub => {
        this.eventBus.publish('db.query.request', {
          project_id: 'system',
          query: 'SELECT base_path FROM projects WHERE id = ?',
          params: [project_id],
          read_only: true,
          request_id: requestId
        }).catch(err => { clearTimeout(timeout); unsub(); reject(err); });
        setTimeout(() => unsub(), 6000);
      });
    });
  }

  validatePath(projectPath, relativePath) {
    return this._validatePathSafe(projectPath, relativePath);
  }

  async findPdfsRecursive(dirPath) {
    const pdfs = [];
    const self = this;
    async function search(currentPath) {
      let entries;
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (error) {
        self.logger.debug('pdf-viewer.find.dir.skipped', { path: currentPath, error: error.message });
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
          try {
            const stats = await fs.stat(fullPath);
            pdfs.push({
              name: entry.name,
              path: fullPath.replace(dirPath, '').replace(/\\/g, '/'),
              size: stats.size,
              size_formatted: self.formatBytes(stats.size),
              modified: stats.mtime
            });
          } catch (statErr) {
            self.logger.debug('pdf-viewer.find.stat.skipped', { path: fullPath, error: statErr.message });
          }
        } else if (entry.isDirectory()) {
          await search(fullPath);
        }
      }
    }
    await search(dirPath);
    return pdfs;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  setupCacheCleanup() {
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.config.cache_ttl) this.cache.delete(key);
      }
    }, this.config.cache_ttl);
  }

  async createViaProvider(payload) {
    if (!this.eventBus) return null;
    return new Promise((resolve) => {
      const requestId = `pdf_create_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const timeout = setTimeout(() => resolve(null), 8000);
      this.eventBus.subscribe('local.pdf.create.response', (event) => {
        const data = event.data || event;
        if (data.request_id !== requestId) return;
        clearTimeout(timeout);
        resolve(data.success && data.data ? data.data : null);
      }).then(unsub => {
        this.eventBus.publish('local.pdf.create.request', { request_id: requestId, ...payload })
          .catch(() => { clearTimeout(timeout); unsub(); resolve(null); });
        setTimeout(() => unsub(), 9000);
      }).catch(() => resolve(null));
    });
  }

  async createDirectPdf({ type, content, title, filename, orientation, format, margin }) {
    let PDFDocument;
    try { PDFDocument = require('pdfkit'); } catch {
      return this._errorResponse(500, 'DEPENDENCY_UNAVAILABLE', 'pdfkit not installed. Run: npm install pdfkit');
    }
    const outputDir = path.join(process.cwd(), 'data', 'generated', 'pdf');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, filename);
    const doc = new PDFDocument({ size: format, layout: orientation, margin });
    const fsSync = require('fs');
    const writeStream = fsSync.createWriteStream(outputPath);
    doc.pipe(writeStream);
    if (type === 'from_text') {
      if (title) {
        doc.fontSize(18).text(title, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      } else if (typeof content === 'string') {
        doc.fontSize(12).text(content);
      } else if (content && typeof content === 'object') {
        if (content.title) { doc.fontSize(18).text(content.title, { align: 'center' }); doc.moveDown(); }
        doc.fontSize(12).text(content.body || JSON.stringify(content, null, 2));
      }
    } else if (type === 'from_html') {
      const plainText = (typeof content === 'string' ? content : '').replace(/<[^>]*>/g, '');
      if (title) { doc.fontSize(18).text(title, { align: 'center' }); doc.moveDown(); }
      doc.fontSize(12).text(plainText);
    } else {
      doc.fontSize(12).text(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
    doc.end();
    await new Promise((resolve, reject) => { writeStream.on('finish', resolve); writeStream.on('error', reject); });
    const stats = await fs.stat(outputPath);
    this.logger.info('pdf-viewer.tool.create.success', { filename, path: outputPath, size: stats.size, method: 'direct' });
    this.metrics?.increment('pdf-viewer.tool.create.success', { method: 'direct' });
    return { status: 200, data: { filename, path: outputPath, size: stats.size, sizeFormatted: this.formatBytes(stats.size), method: 'direct' } };
  }
}

module.exports = PdfViewerModule;
