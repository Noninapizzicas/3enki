const fs = require('fs').promises;
const path = require('path');

const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');

class PdfViewerModule {
  constructor() {
    this.name = 'pdf-viewer';
    this.version = '1.0.0';

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
    this.uiHandler = null;

    // State
    this.cache = new Map();
    this.unsubscribes = [];
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};
    this.uiHandler = core.uiHandler;

    this.logger.info('pdf-viewer.loading', { module: this.name });

    // Register UI handlers
    this.registerUIHandlers();

    // Subscribe to events
    const unsubView = await this.eventBus.subscribe(EVENTS.PDF.VIEW_REQUEST, this.handleViewRequest.bind(this));
    this.unsubscribes.push(unsubView);

    const unsubExtract = await this.eventBus.subscribe(EVENTS.PDF.EXTRACT_REQUEST, this.handleExtractRequest.bind(this));
    this.unsubscribes.push(unsubExtract);

    const unsubMetadata = await this.eventBus.subscribe(EVENTS.PDF.METADATA_REQUEST, this.handleMetadataRequest.bind(this));
    this.unsubscribes.push(unsubMetadata);

    const unsubList = await this.eventBus.subscribe(EVENTS.PDF.LIST_REQUEST, this.handleListRequest.bind(this));
    this.unsubscribes.push(unsubList);

    // Setup cache cleanup
    if (this.config.cache_enabled) {
      this.setupCacheCleanup();
    }

    this.logger.info('pdf-viewer.loaded', { module: this.name });
  }

  async onUnload() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.logger.info('pdf-viewer.unloaded', { module: this.name });
  }

  // API Handlers

  async viewPdf(req, res) {
    try {
      const { project_id, file_path } = req.query;

      if (!project_id || !file_path) {
        return res.status(400).json({
          success: false,
          error: 'project_id and file_path are required'
        });
      }

      const projectPath = await this.getProjectPath(project_id);

      // Security: Validate path is within project directory
      let fullPath;
      try {
        fullPath = this.validatePath(projectPath, file_path);
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }

      if (!fullPath.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({
          success: false,
          error: 'File must be a PDF'
        });
      }

      const stats = await fs.stat(fullPath);
      if (stats.size > this.config.max_pdf_size) {
        return res.status(400).json({
          success: false,
          error: `PDF too large. Maximum size: ${this.config.max_pdf_size} bytes`
        });
      }

      const buffer = await fs.readFile(fullPath);
      const base64 = buffer.toString('base64');

      // REMOVED: this.metrics.counter('pdfs_viewed_total').inc();

      res.json({
        success: true,
        data: {
          file_path,
          size: stats.size,
          modified: stats.mtime,
          content: base64,
          content_type: 'application/pdf'
        }
      });
    } catch (error) {
      this.logger.error('pdf-viewer.view-error', { error: error.message });
      // REMOVED: this.metrics.counter('pdf_errors_total').inc();
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async extractText(req, res) {
    try {
      const { project_id, file_path, page } = req.query;

      if (!project_id || !file_path) {
        return res.status(400).json({
          success: false,
          error: 'project_id and file_path are required'
        });
      }

      const projectPath = await this.getProjectPath(project_id);

      // Security: Validate path is within project directory
      let fullPath;
      try {
        fullPath = this.validatePath(projectPath, file_path);
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }

      // REMOVED: this.metrics.counter('text_extractions_total').inc();

      res.json({
        success: true,
        data: {
          file_path,
          text: 'Text extraction requires pdf-parse library. Install with: npm install pdf-parse',
          pages: null,
          note: 'This is a placeholder response. Implement pdf-parse for full functionality.'
        }
      });
    } catch (error) {
      this.logger.error('pdf-viewer.extract-error', { error: error.message });
      // REMOVED: this.metrics.counter('pdf_errors_total').inc();
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getMetadata(req, res) {
    try {
      const { project_id, file_path } = req.query;

      if (!project_id || !file_path) {
        return res.status(400).json({
          success: false,
          error: 'project_id and file_path are required'
        });
      }

      const projectPath = await this.getProjectPath(project_id);

      // Security: Validate path is within project directory
      let fullPath;
      try {
        fullPath = this.validatePath(projectPath, file_path);
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }

      const stats = await fs.stat(fullPath);

      const metadata = {
        file_path,
        filename: path.basename(file_path),
        size: stats.size,
        size_formatted: this.formatBytes(stats.size),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      };

      res.json(HELPERS.buildResponse(true, metadata
      ));
    } catch (error) {
      this.logger.error('pdf-viewer.metadata-error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async listPdfs(req, res) {
    try {
      const { project_id } = req.query;

      if (!project_id) {
        return res.status(400).json({
          success: false,
          error: 'project_id is required'
        });
      }

      const projectPath = await this.getProjectPath(project_id);
      const pdfs = await this.findPdfsRecursive(projectPath);

      res.json({
        success: true,
        data: {
          project_id,
          pdfs,
          count: pdfs.length
        }
      });
    } catch (error) {
      this.logger.error('pdf-viewer.list-error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Event Handlers

  async handleViewRequest(event) {
    try {
      const { request_id, project_id, file_path } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this.validatePath(projectPath, file_path);

      const buffer = await fs.readFile(fullPath);
      const stats = await fs.stat(fullPath);
      const base64 = buffer.toString('base64');

      await this.eventBus.publish(EVENTS.PDF.VIEW_RESPONSE, {
        request_id,
        success: true,
        data: {
          file_path,
          content: base64,
          size: stats.size
        }
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.PDF.VIEW_RESPONSE, {
        request_id: event.data.request_id,
        success: false,
        error: error.message
      });
    }
  }

  async handleExtractRequest(event) {
    try {
      const { request_id, project_id, file_path, page } = event.data;

      await this.eventBus.publish(EVENTS.PDF.EXTRACT_RESPONSE, {
        request_id,
        success: true,
        data: {
          text: 'Text extraction requires pdf-parse library',
          note: 'Install pdf-parse for full functionality'
        }
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.PDF.EXTRACT_RESPONSE, {
        request_id: event.data.request_id,
        success: false,
        error: error.message
      });
    }
  }

  async handleMetadataRequest(event) {
    try {
      const { request_id, project_id, file_path } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this.validatePath(projectPath, file_path);

      const stats = await fs.stat(fullPath);

      const metadata = {
        file_path,
        filename: path.basename(file_path),
        size: stats.size,
        modified: stats.mtime
      };

      await this.eventBus.publish(EVENTS.PDF.METADATA_RESPONSE, {
        request_id,
        success: true,
        data: metadata
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.PDF.METADATA_RESPONSE, {
        request_id: event.data.request_id,
        success: false,
        error: error.message
      });
    }
  }

  async handleListRequest(event) {
    try {
      const { request_id, project_id } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const pdfs = await this.findPdfsRecursive(projectPath);

      await this.eventBus.publish(EVENTS.PDF.LIST_RESPONSE, {
        request_id,
        success: true,
        data: { pdfs }
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.PDF.LIST_RESPONSE, {
        request_id: event.data.request_id,
        success: false,
        error: error.message
      });
    }
  }

  // Helper Methods

  /**
   * Gets the base path for file operations
   * @param {string|null} project_id - Project ID or null for root mode
   * @returns {string} Base path for file operations
   */
  async getBasePath(project_id) {
    const projectsRoot = path.join(process.cwd(), 'data', 'projects');

    // Ensure projects root exists
    await fs.mkdir(projectsRoot, { recursive: true });

    if (!project_id) {
      // Root mode: return projects root directory
      return projectsRoot;
    }

    // Project mode: return specific project directory
    const projectDir = path.join(projectsRoot, project_id);
    await fs.mkdir(projectDir, { recursive: true });

    return projectDir;
  }

  async getProjectPath(project_id) {
    const dataDir = path.join(process.cwd(), 'data', 'projects', project_id);

    // Ensure directory exists
    await fs.mkdir(dataDir, { recursive: true });

    return dataDir;
  }

  /**
   * Validates that a path is within the allowed project directory
   * @param {string} projectPath - Base project directory
   * @param {string} relativePath - User-provided relative path
   * @returns {string} Validated full path
   * @throws {Error} If path is outside project directory
   */
  validatePath(projectPath, relativePath) {
    const normalizedProjectPath = path.resolve(projectPath);

    // Strip leading slashes to prevent path.resolve from treating it as absolute
    let safePath = (relativePath || '').replace(/^\/+/, '');

    const fullPath = path.resolve(projectPath, safePath);

    if (!fullPath.startsWith(normalizedProjectPath + path.sep) && fullPath !== normalizedProjectPath) {
      throw new Error('Access denied: Path outside project directory');
    }

    return fullPath;
  }

  async findPdfsRecursive(dirPath) {
    const pdfs = [];
    const self = this;

    async function search(currentPath) {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
            const stats = await fs.stat(fullPath);
            pdfs.push({
              name: entry.name,
              path: fullPath.replace(dirPath, '').replace(/\\/g, '/'),
              size: stats.size,
              size_formatted: self.formatBytes(stats.size),
              modified: stats.mtime
            });
          } else if (entry.isDirectory()) {
            await search(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't access
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
        if (now - value.timestamp > this.config.cache_ttl) {
          this.cache.delete(key);
        }
      }
    }, this.config.cache_ttl);
  }

  // ==========================================
  // UI Request/Response Handlers (MQTT)
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('pdf-viewer.ui_handlers.no_handler');
      return;
    }

    this.uiHandler.register('pdf', 'view', this.handleUIView.bind(this));
    this.uiHandler.register('pdf', 'metadata', this.handleUIMetadata.bind(this));
    this.uiHandler.register('pdf', 'list', this.handleUIListPdfs.bind(this));

    this.logger.info('pdf-viewer.ui_handlers.registered', {
      handlers: ['pdf/view', 'pdf/metadata', 'pdf/list']
    });
  }

  async handleUIView(data) {
    const { project_id, file_path } = data || {};

    if (!file_path) {
      throw { status: 400, code: 'MISSING_PARAMS', message: 'file_path is required' };
    }

    const basePath = await this.getBasePath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(basePath, file_path);
    } catch (error) {
      throw { status: 403, code: 'ACCESS_DENIED', message: error.message };
    }

    if (!fullPath.toLowerCase().endsWith('.pdf')) {
      throw { status: 400, code: 'NOT_PDF', message: 'File must be a PDF' };
    }

    const stats = await fs.stat(fullPath);
    if (this.config.max_pdf_size && stats.size > this.config.max_pdf_size) {
      throw { status: 413, code: 'FILE_TOO_LARGE', message: `PDF too large. Maximum size: ${this.config.max_pdf_size} bytes` };
    }

    const buffer = await fs.readFile(fullPath);
    const base64 = buffer.toString('base64');

    return {
      file_path,
      size: stats.size,
      size_formatted: this.formatBytes(stats.size),
      modified: stats.mtime,
      content: base64,
      content_type: 'application/pdf'
    };
  }

  async handleUIMetadata(data) {
    const { project_id, file_path } = data || {};

    if (!file_path) {
      throw { status: 400, code: 'MISSING_PARAMS', message: 'file_path is required' };
    }

    const basePath = await this.getBasePath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(basePath, file_path);
    } catch (error) {
      throw { status: 403, code: 'ACCESS_DENIED', message: error.message };
    }

    const stats = await fs.stat(fullPath);

    return {
      file_path,
      filename: path.basename(file_path),
      size: stats.size,
      size_formatted: this.formatBytes(stats.size),
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime
    };
  }

  async handleUIListPdfs(data) {
    const { project_id } = data || {};

    const basePath = await this.getBasePath(project_id);
    const pdfs = await this.findPdfsRecursive(basePath);

    return {
      project_id,
      pdfs,
      count: pdfs.length
    };
  }
}

module.exports = PdfViewerModule;
