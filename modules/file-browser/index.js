const fs = require('fs').promises;
const path = require('path');

const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');

class FileBrowserModule {
  constructor() {
    this.name = 'file-browser';
    this.version = '1.0.0';

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
    this.uiHandler = null;

    // State
    this.unsubscribes = [];

    // Limits
    this.maxFileSize = 50 * 1024 * 1024; // 50MB max file size for reading
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};  // Config viene del manifest
    this.uiHandler = core.uiHandler;

    this.logger.info('file-browser.loading', { module: this.name });

    // Register UI handlers
    this.registerUIHandlers();

    // Subscribe to events
    const unsubList = await this.eventBus.subscribe(EVENTS.FILE.LIST_REQUEST, this.handleListRequest.bind(this));
    this.unsubscribes.push(unsubList);

    const unsubContent = await this.eventBus.subscribe(EVENTS.FILE.CONTENT_REQUEST, this.handleContentRequest.bind(this));
    this.unsubscribes.push(unsubContent);

    const unsubCreate = await this.eventBus.subscribe(EVENTS.FILE.CREATE_REQUEST, this.handleCreateRequest.bind(this));
    this.unsubscribes.push(unsubCreate);

    const unsubDelete = await this.eventBus.subscribe(EVENTS.FILE.DELETE_REQUEST, this.handleDeleteRequest.bind(this));
    this.unsubscribes.push(unsubDelete);

    const unsubSearch = await this.eventBus.subscribe(EVENTS.FILE.SEARCH_REQUEST, this.handleSearchRequest.bind(this));
    this.unsubscribes.push(unsubSearch);

    this.logger.info('file-browser.loaded', { module: this.name });
  }

  async onUnload() {
    // Unsubscribe from all events
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.logger.info('file-browser.unloaded', { module: this.name });
  }

  // API Handlers

  async listFiles(req, res) {
    try {
      const { project_id, path: relativePath = '/', filter } = req.query;

      if (!project_id) {
        return res.status(400).json({
          success: false,
          error: 'project_id is required'
        });
      }

      const projectPath = await this.getProjectPath(project_id);

      // Security: Validate path is within project directory
      let fullPath;
      try {
        fullPath = this.validatePath(projectPath, relativePath);
      } catch (error) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }

      const files = await this.scanDirectory(fullPath, filter);

      // REMOVED: this.metrics.counter('files_listed_total').inc();

      res.json({
        success: true,
        data: {
          project_id,
          path: relativePath,
          files
        }
      });
    } catch (error) {
      this.logger.error('file-browser.list-files.error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getFileContent(req, res) {
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

      // Check file size before reading
      const stats = await fs.stat(fullPath);
      if (stats.size > this.maxFileSize) {
        return res.status(413).json({
          success: false,
          error: `File too large. Max size: ${this.maxFileSize / (1024 * 1024)}MB`
        });
      }

      const content = await fs.readFile(fullPath, 'utf-8');

      res.json({
        success: true,
        data: {
          file_path,
          content,
          size: stats.size,
          modified: stats.mtime,
          extension: path.extname(file_path)
        }
      });
    } catch (error) {
      this.logger.error('file-browser.read-file.error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async createFile(req, res) {
    try {
      const { project_id, file_path, content = '', type = 'file' } = req.body;

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

      // Create directory if needed
      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });

      if (type === 'directory') {
        await fs.mkdir(fullPath, { recursive: true });
      } else {
        await fs.writeFile(fullPath, content, 'utf-8');
      }

      // REMOVED: this.metrics.counter('files_created_total').inc();

      // Publish event
      await this.eventBus.publish(EVENTS.FILE.CREATED, {
        project_id,
        file_path,
        type,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        data: {
          file_path,
          type,
          created: true
        }
      });
    } catch (error) {
      this.logger.error('file-browser.create-file.error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deleteFile(req, res) {
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

      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }

      // Publish event
      await this.eventBus.publish(EVENTS.FILE.DELETED, {
        project_id,
        file_path,
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        data: {
          file_path,
          deleted: true
        }
      });
    } catch (error) {
      this.logger.error('file-browser.delete-file.error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async searchFiles(req, res) {
    try {
      const { project_id, query, search_content = false } = req.query;

      if (!project_id || !query) {
        return res.status(400).json({
          success: false,
          error: 'project_id and query are required'
        });
      }

      const projectPath = await this.getProjectPath(project_id);
      const results = await this.searchInDirectory(projectPath, query, search_content);

      // REMOVED: this.metrics.counter('search_queries_total').inc();

      res.json({
        success: true,
        data: {
          query,
          results,
          count: results.length
        }
      });
    } catch (error) {
      this.logger.error('file-browser.search-files.error', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Event Handlers

  async handleListRequest(event) {
    try {
      const { request_id, project_id, path: relativePath, filter } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this.validatePath(projectPath, relativePath || '/');
      const files = await this.scanDirectory(fullPath, filter);

      await this.eventBus.publish(EVENTS.FILE.LIST_RESPONSE, {
        request_id,
        success: true,
        data: { files }
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.FILE.LIST_RESPONSE, {
        request_id: event.data.request_id,
        success: false,
        error: error.message
      });
    }
  }

  async handleContentRequest(event) {
    try {
      const { request_id, project_id, file_path } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this.validatePath(projectPath, file_path);

      // Check file size before reading
      const stats = await fs.stat(fullPath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large. Max size: ${this.maxFileSize / (1024 * 1024)}MB`);
      }

      const content = await fs.readFile(fullPath, 'utf-8');

      await this.eventBus.publish(EVENTS.FILE.CONTENT_RESPONSE, {
        request_id,
        success: true,
        data: { content, file_path }
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.FILE.CONTENT_RESPONSE, {
        request_id: event.data.request_id,
        success: false,
        error: error.message
      });
    }
  }

  async handleCreateRequest(event) {
    try {
      const { request_id, project_id, file_path, content, type } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this.validatePath(projectPath, file_path);

      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });

      if (type === 'directory') {
        await fs.mkdir(fullPath, { recursive: true });
      } else {
        await fs.writeFile(fullPath, content || '', 'utf-8');
      }

      await this.eventBus.publish(EVENTS.FILE.CREATED, {
        request_id,
        project_id,
        file_path,
        type
      });
    } catch (error) {
      this.logger.error('file-browser.handle-create.error', { error: error.message });
    }
  }

  async handleDeleteRequest(event) {
    try {
      const { request_id, project_id, file_path } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const fullPath = this.validatePath(projectPath, file_path);

      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }

      await this.eventBus.publish(EVENTS.FILE.DELETED, {
        request_id,
        project_id,
        file_path
      });
    } catch (error) {
      this.logger.error('file-browser.handle-delete.error', { error: error.message });
    }
  }

  async handleSearchRequest(event) {
    try {
      const { request_id, project_id, query, search_content } = event.data;

      const projectPath = await this.getProjectPath(project_id);
      const results = await this.searchInDirectory(projectPath, query, search_content);

      await this.eventBus.publish(EVENTS.FILE.SEARCH_RESPONSE, {
        request_id,
        success: true,
        data: { results }
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.FILE.SEARCH_RESPONSE, {
        request_id: event.data.request_id,
        success: false,
        error: error.message
      });
    }
  }

  // Helper Methods

  async getProjectPath(project_id) {
    // Get project path from project-manager
    const dataDir = path.join(process.cwd(), 'data', 'projects', project_id);
    return dataDir;
  }

  /**
   * Validates that a path is within the allowed project directory
   * Prevents path traversal attacks
   * @param {string} projectPath - Base project directory
   * @param {string} relativePath - User-provided relative path
   * @returns {string} Validated full path
   * @throws {Error} If path is outside project directory
   */
  validatePath(projectPath, relativePath) {
    const normalizedProjectPath = path.resolve(projectPath);
    const fullPath = path.resolve(projectPath, relativePath || '');

    // Ensure the resolved path is within the project directory
    if (!fullPath.startsWith(normalizedProjectPath + path.sep) && fullPath !== normalizedProjectPath) {
      throw new Error('Access denied: Path outside project directory');
    }

    return fullPath;
  }

  async scanDirectory(dirPath, filter) {
    const files = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);

        // Apply filter
        if (filter && !entry.isDirectory()) {
          const extensions = filter.split(',').map(ext => ext.trim());
          const fileExt = path.extname(entry.name).slice(1);
          if (!extensions.includes(fileExt)) {
            continue;
          }
        }

        files.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          extension: entry.isDirectory() ? null : path.extname(entry.name),
          size: stats.size,
          modified: stats.mtime,
          path: fullPath.replace(dirPath, '').replace(/\\/g, '/')
        });
      }

      // Sort: directories first, then files alphabetically
      files.sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

      return files;
    } catch (error) {
      this.logger.error('file-browser.scan-directory.error', { error: error.message, dirPath });
      return [];
    }
  }

  async searchInDirectory(dirPath, query, searchContent = false) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    async function search(currentPath) {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          // Search by filename
          if (entry.name.toLowerCase().includes(lowerQuery)) {
            const stats = await fs.stat(fullPath);
            results.push({
              name: entry.name,
              path: fullPath.replace(dirPath, '').replace(/\\/g, '/'),
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime,
              match_type: 'filename'
            });
          }

          // Search in content for text files
          if (searchContent && entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const textExts = ['.md', '.txt', '.json', '.js', '.html', '.css', '.xml', '.yaml', '.yml'];
            const maxSearchFileSize = 5 * 1024 * 1024; // 5MB limit for content search

            if (textExts.includes(ext)) {
              try {
                const stats = await fs.stat(fullPath);
                // Skip files too large for content search
                if (stats.size > maxSearchFileSize) {
                  continue;
                }
                const content = await fs.readFile(fullPath, 'utf-8');
                if (content.toLowerCase().includes(lowerQuery)) {
                  results.push({
                    name: entry.name,
                    path: fullPath.replace(dirPath, '').replace(/\\/g, '/'),
                    type: 'file',
                    size: stats.size,
                    modified: stats.mtime,
                    match_type: 'content'
                  });
                }
              } catch (err) {
                // Skip files that can't be read as text
              }
            }
          }

          // Recurse into directories
          if (entry.isDirectory()) {
            await search(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't access
      }
    }

    await search(dirPath);
    return results;
  }

  // ==========================================
  // UI Request/Response Handlers (MQTT)
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('file-browser.ui_handlers.no_handler');
      return;
    }

    this.uiHandler.register('files', 'list', this.handleUIList.bind(this));
    this.uiHandler.register('files', 'read', this.handleUIRead.bind(this));
    this.uiHandler.register('files', 'create', this.handleUICreate.bind(this));
    this.uiHandler.register('files', 'delete', this.handleUIDelete.bind(this));
    this.uiHandler.register('files', 'search', this.handleUISearch.bind(this));

    this.logger.info('file-browser.ui_handlers.registered', {
      handlers: ['files/list', 'files/read', 'files/create', 'files/delete', 'files/search']
    });
  }

  async handleUIList(data) {
    const { project_id, path: relativePath = '/', filter } = data || {};

    if (!project_id) {
      throw { status: 400, code: 'MISSING_PROJECT_ID', message: 'project_id is required' };
    }

    const projectPath = await this.getProjectPath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(projectPath, relativePath);
    } catch (error) {
      throw { status: 403, code: 'ACCESS_DENIED', message: error.message };
    }

    const files = await this.scanDirectory(fullPath, filter);

    return {
      project_id,
      path: relativePath,
      files
    };
  }

  async handleUIRead(data) {
    const { project_id, file_path } = data || {};

    if (!project_id || !file_path) {
      throw { status: 400, code: 'MISSING_PARAMS', message: 'project_id and file_path are required' };
    }

    const projectPath = await this.getProjectPath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(projectPath, file_path);
    } catch (error) {
      throw { status: 403, code: 'ACCESS_DENIED', message: error.message };
    }

    const stats = await fs.stat(fullPath);

    // Check if it's an image
    const ext = path.extname(file_path).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'];

    if (imageExts.includes(ext)) {
      // Return image as base64
      if (stats.size > 10 * 1024 * 1024) { // 10MB limit for images
        throw { status: 413, code: 'FILE_TOO_LARGE', message: 'Image too large. Max size: 10MB' };
      }
      const buffer = await fs.readFile(fullPath);
      const base64 = buffer.toString('base64');
      const mimeType = this.getMimeType(ext);

      return {
        file_path,
        type: 'image',
        content: base64,
        content_type: mimeType,
        size: stats.size,
        modified: stats.mtime
      };
    }

    // Text file
    if (stats.size > this.maxFileSize) {
      throw { status: 413, code: 'FILE_TOO_LARGE', message: `File too large. Max size: ${this.maxFileSize / (1024 * 1024)}MB` };
    }

    const content = await fs.readFile(fullPath, 'utf-8');

    return {
      file_path,
      type: 'text',
      content,
      extension: ext,
      size: stats.size,
      modified: stats.mtime
    };
  }

  async handleUICreate(data) {
    const { project_id, file_path, content = '', type = 'file' } = data || {};

    if (!project_id || !file_path) {
      throw { status: 400, code: 'MISSING_PARAMS', message: 'project_id and file_path are required' };
    }

    const projectPath = await this.getProjectPath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(projectPath, file_path);
    } catch (error) {
      throw { status: 403, code: 'ACCESS_DENIED', message: error.message };
    }

    const dirPath = path.dirname(fullPath);
    await fs.mkdir(dirPath, { recursive: true });

    if (type === 'directory') {
      await fs.mkdir(fullPath, { recursive: true });
    } else {
      await fs.writeFile(fullPath, content, 'utf-8');
    }

    await this.eventBus.publish(EVENTS.FILE.CREATED, {
      project_id,
      file_path,
      type,
      timestamp: new Date().toISOString()
    });

    return {
      file_path,
      type,
      created: true
    };
  }

  async handleUIDelete(data) {
    const { project_id, file_path } = data || {};

    if (!project_id || !file_path) {
      throw { status: 400, code: 'MISSING_PARAMS', message: 'project_id and file_path are required' };
    }

    const projectPath = await this.getProjectPath(project_id);

    let fullPath;
    try {
      fullPath = this.validatePath(projectPath, file_path);
    } catch (error) {
      throw { status: 403, code: 'ACCESS_DENIED', message: error.message };
    }

    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }

    await this.eventBus.publish(EVENTS.FILE.DELETED, {
      project_id,
      file_path,
      timestamp: new Date().toISOString()
    });

    return {
      file_path,
      deleted: true
    };
  }

  async handleUISearch(data) {
    const { project_id, query, search_content = false } = data || {};

    if (!project_id || !query) {
      throw { status: 400, code: 'MISSING_PARAMS', message: 'project_id and query are required' };
    }

    const projectPath = await this.getProjectPath(project_id);
    const results = await this.searchInDirectory(projectPath, query, search_content);

    return {
      query,
      results,
      count: results.length
    };
  }

  getMimeType(ext) {
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = FileBrowserModule;
