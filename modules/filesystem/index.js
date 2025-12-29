/**
 * Filesystem Module
 * Core filesystem operations for the entire system
 *
 * Provides unified access for:
 * - UI (via mqttRequest)
 * - AI (via tools/function calling)
 * - Other modules (via eventBus)
 */

const fs = require('fs').promises;
const path = require('path');

class FilesystemModule {
  constructor() {
    this.name = 'filesystem';
    this.version = '1.0.0';
    this.basePath = path.join(process.cwd(), 'data');

    // Dependencies (injected)
    this.logger = null;
    this.eventBus = null;
    this.uiHandler = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;

    // Ensure base data directory exists
    await this.ensureDataDirectory();

    // Register UI handlers
    if (this.uiHandler) {
      this.uiHandler.register('fs', 'list', this.handleList.bind(this));
      this.uiHandler.register('fs', 'read', this.handleRead.bind(this));
      this.uiHandler.register('fs', 'write', this.handleWrite.bind(this));
      this.uiHandler.register('fs', 'delete', this.handleDelete.bind(this));
      this.uiHandler.register('fs', 'mkdir', this.handleMkdir.bind(this));
      this.uiHandler.register('fs', 'move', this.handleMove.bind(this));
      this.uiHandler.register('fs', 'copy', this.handleCopy.bind(this));
      this.uiHandler.register('fs', 'search', this.handleSearch.bind(this));
      this.uiHandler.register('fs', 'info', this.handleInfo.bind(this));

      this.logger.info('filesystem.handlers.registered', {
        handlers: ['list', 'read', 'write', 'delete', 'mkdir', 'move', 'copy', 'search', 'info']
      });
    }

    this.logger.info('filesystem.loaded', {
      basePath: this.basePath
    });
  }

  async onUnload() {
    this.logger.info('filesystem.unloaded');
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      this.logger.error('filesystem.ensureDataDirectory.error', { error: error.message });
    }
  }

  // ==========================================
  // Security
  // ==========================================

  /**
   * Validates that a path is within the allowed data directory
   * Prevents path traversal attacks
   */
  validatePath(userPath) {
    // Normalize and remove leading slashes
    const normalized = path.normalize(userPath || '/').replace(/^\/+/, '');
    const resolved = path.resolve(this.basePath, normalized);

    // Security check: must be within basePath
    if (!resolved.startsWith(this.basePath)) {
      const error = new Error('Access denied: path outside data directory');
      error.status = 403;
      error.code = 'PATH_TRAVERSAL';
      throw error;
    }

    return resolved;
  }

  /**
   * Converts absolute path back to relative path for responses
   */
  toRelativePath(absolutePath) {
    return '/' + path.relative(this.basePath, absolutePath).replace(/\\/g, '/');
  }

  // ==========================================
  // Handlers
  // ==========================================

  /**
   * List files and directories
   */
  async handleList(data) {
    try {
      const dirPath = data?.path || '/';
      const safePath = this.validatePath(dirPath);

      // Check if directory exists
      try {
        const stats = await fs.stat(safePath);
        if (!stats.isDirectory()) {
          return { status: 400, error: 'Path is not a directory' };
        }
      } catch (e) {
        if (e.code === 'ENOENT') {
          return { status: 404, error: 'Directory not found' };
        }
        throw e;
      }

      const entries = await fs.readdir(safePath, { withFileTypes: true });
      const items = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(safePath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime,
            path: path.join(dirPath, entry.name).replace(/\\/g, '/')
          };
        } catch (e) {
          // Skip files we can't stat
          return null;
        }
      }));

      // Filter nulls and sort: directories first, then alphabetical
      const validItems = items.filter(item => item !== null);
      validItems.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return {
        status: 200,
        data: {
          path: dirPath,
          items: validItems,
          count: validItems.length
        }
      };

    } catch (error) {
      this.logger.error('filesystem.list.error', { error: error.message, path: data?.path });
      return { status: error.status || 500, error: error.message };
    }
  }

  /**
   * Read file content
   */
  async handleRead(data) {
    try {
      if (!data?.path) {
        return { status: 400, error: 'path is required' };
      }

      const safePath = this.validatePath(data.path);

      // Check if file exists and is not a directory
      const stats = await fs.stat(safePath);
      if (stats.isDirectory()) {
        return { status: 400, error: 'Cannot read directory as file' };
      }

      // Check file size (limit to 10MB for text reading)
      const maxSize = 10 * 1024 * 1024;
      if (stats.size > maxSize) {
        return { status: 413, error: `File too large. Max size: ${maxSize / (1024 * 1024)}MB` };
      }

      // Detect if binary or text
      const ext = path.extname(data.path).toLowerCase();
      const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz'];

      if (binaryExts.includes(ext)) {
        // Return base64 for binary files
        const buffer = await fs.readFile(safePath);
        return {
          status: 200,
          data: {
            path: data.path,
            content: buffer.toString('base64'),
            encoding: 'base64',
            size: stats.size,
            modified: stats.mtime,
            type: 'binary'
          }
        };
      }

      // Text file
      const content = await fs.readFile(safePath, 'utf-8');

      return {
        status: 200,
        data: {
          path: data.path,
          content,
          encoding: 'utf-8',
          size: stats.size,
          modified: stats.mtime,
          type: 'text'
        }
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 404, error: 'File not found' };
      }
      this.logger.error('filesystem.read.error', { error: error.message, path: data?.path });
      return { status: error.status || 500, error: error.message };
    }
  }

  /**
   * Write content to file (creates if not exists)
   */
  async handleWrite(data) {
    try {
      if (!data?.path) {
        return { status: 400, error: 'path is required' };
      }
      if (data.content === undefined) {
        return { status: 400, error: 'content is required' };
      }

      const safePath = this.validatePath(data.path);

      // Create parent directory if needed
      await fs.mkdir(path.dirname(safePath), { recursive: true });

      // Check if file exists (for event type)
      let isNew = false;
      try {
        await fs.stat(safePath);
      } catch (e) {
        if (e.code === 'ENOENT') isNew = true;
      }

      // Write file
      await fs.writeFile(safePath, data.content, 'utf-8');

      // Publish event
      const eventType = isNew ? 'fs.file.created' : 'fs.file.updated';
      await this.eventBus.publish(eventType, {
        path: data.path,
        size: data.content.length,
        timestamp: new Date().toISOString()
      });

      this.logger.info('filesystem.write.success', { path: data.path, isNew });

      return {
        status: isNew ? 201 : 200,
        data: {
          path: data.path,
          created: isNew,
          size: data.content.length
        }
      };

    } catch (error) {
      this.logger.error('filesystem.write.error', { error: error.message, path: data?.path });
      return { status: error.status || 500, error: error.message };
    }
  }

  /**
   * Delete file or directory
   */
  async handleDelete(data) {
    try {
      if (!data?.path) {
        return { status: 400, error: 'path is required' };
      }

      // Prevent deleting root
      if (data.path === '/' || data.path === '') {
        return { status: 403, error: 'Cannot delete root directory' };
      }

      const safePath = this.validatePath(data.path);

      const stats = await fs.stat(safePath);
      const isDirectory = stats.isDirectory();

      if (isDirectory) {
        await fs.rm(safePath, { recursive: true });
      } else {
        await fs.unlink(safePath);
      }

      // Publish event
      await this.eventBus.publish('fs.file.deleted', {
        path: data.path,
        type: isDirectory ? 'directory' : 'file',
        timestamp: new Date().toISOString()
      });

      this.logger.info('filesystem.delete.success', { path: data.path, type: isDirectory ? 'directory' : 'file' });

      return {
        status: 200,
        data: {
          path: data.path,
          deleted: true,
          type: isDirectory ? 'directory' : 'file'
        }
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 404, error: 'Path not found' };
      }
      this.logger.error('filesystem.delete.error', { error: error.message, path: data?.path });
      return { status: error.status || 500, error: error.message };
    }
  }

  /**
   * Create directory
   */
  async handleMkdir(data) {
    try {
      if (!data?.path) {
        return { status: 400, error: 'path is required' };
      }

      const safePath = this.validatePath(data.path);

      await fs.mkdir(safePath, { recursive: true });

      // Publish event
      await this.eventBus.publish('fs.directory.created', {
        path: data.path,
        timestamp: new Date().toISOString()
      });

      this.logger.info('filesystem.mkdir.success', { path: data.path });

      return {
        status: 201,
        data: {
          path: data.path,
          created: true
        }
      };

    } catch (error) {
      this.logger.error('filesystem.mkdir.error', { error: error.message, path: data?.path });
      return { status: error.status || 500, error: error.message };
    }
  }

  /**
   * Move file or directory
   */
  async handleMove(data) {
    try {
      if (!data?.from || !data?.to) {
        return { status: 400, error: 'from and to are required' };
      }

      const safeFrom = this.validatePath(data.from);
      const safeTo = this.validatePath(data.to);

      // Check source exists
      await fs.stat(safeFrom);

      // Create target directory if needed
      await fs.mkdir(path.dirname(safeTo), { recursive: true });

      // Move
      await fs.rename(safeFrom, safeTo);

      this.logger.info('filesystem.move.success', { from: data.from, to: data.to });

      return {
        status: 200,
        data: {
          from: data.from,
          to: data.to,
          moved: true
        }
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 404, error: 'Source path not found' };
      }
      this.logger.error('filesystem.move.error', { error: error.message, from: data?.from, to: data?.to });
      return { status: error.status || 500, error: error.message };
    }
  }

  /**
   * Copy file
   */
  async handleCopy(data) {
    try {
      if (!data?.from || !data?.to) {
        return { status: 400, error: 'from and to are required' };
      }

      const safeFrom = this.validatePath(data.from);
      const safeTo = this.validatePath(data.to);

      // Check source exists and is a file
      const stats = await fs.stat(safeFrom);
      if (stats.isDirectory()) {
        return { status: 400, error: 'Cannot copy directories (use recursive copy)' };
      }

      // Create target directory if needed
      await fs.mkdir(path.dirname(safeTo), { recursive: true });

      // Copy
      await fs.copyFile(safeFrom, safeTo);

      this.logger.info('filesystem.copy.success', { from: data.from, to: data.to });

      return {
        status: 200,
        data: {
          from: data.from,
          to: data.to,
          copied: true
        }
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 404, error: 'Source file not found' };
      }
      this.logger.error('filesystem.copy.error', { error: error.message, from: data?.from, to: data?.to });
      return { status: error.status || 500, error: error.message };
    }
  }

  /**
   * Search files by name or content
   */
  async handleSearch(data) {
    try {
      if (!data?.query) {
        return { status: 400, error: 'query is required' };
      }

      const basePath = this.validatePath(data.path || '/');
      const searchContent = data.content === true;
      const query = data.query.toLowerCase();
      const results = [];
      const maxResults = 100;

      await this.searchRecursive(basePath, query, searchContent, results, data.path || '/', maxResults);

      return {
        status: 200,
        data: {
          query: data.query,
          path: data.path || '/',
          searchContent,
          results,
          count: results.length,
          truncated: results.length >= maxResults
        }
      };

    } catch (error) {
      this.logger.error('filesystem.search.error', { error: error.message, query: data?.query });
      return { status: error.status || 500, error: error.message };
    }
  }

  async searchRecursive(dirPath, query, searchContent, results, relativePath, maxResults) {
    if (results.length >= maxResults) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dirPath, entry.name);
        const entryRelative = path.join(relativePath, entry.name).replace(/\\/g, '/');

        // Search in filename
        if (entry.name.toLowerCase().includes(query)) {
          try {
            const stats = await fs.stat(fullPath);
            results.push({
              name: entry.name,
              path: entryRelative,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime,
              match: 'filename'
            });
          } catch (e) {
            // Skip
          }
        }

        // Search in content (only text files)
        if (searchContent && entry.isFile() && results.length < maxResults) {
          const ext = path.extname(entry.name).toLowerCase();
          const textExts = ['.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.yaml', '.yml', '.xml', '.csv', '.log'];

          if (textExts.includes(ext)) {
            try {
              const stats = await fs.stat(fullPath);
              // Skip large files
              if (stats.size < 1024 * 1024) {
                const content = await fs.readFile(fullPath, 'utf-8');
                if (content.toLowerCase().includes(query)) {
                  // Avoid duplicates
                  if (!results.some(r => r.path === entryRelative)) {
                    results.push({
                      name: entry.name,
                      path: entryRelative,
                      type: 'file',
                      size: stats.size,
                      modified: stats.mtime,
                      match: 'content'
                    });
                  }
                }
              }
            } catch (e) {
              // Skip files that can't be read
            }
          }
        }

        // Recurse into directories
        if (entry.isDirectory() && results.length < maxResults) {
          await this.searchRecursive(fullPath, query, searchContent, results, entryRelative, maxResults);
        }
      }
    } catch (e) {
      // Skip directories we can't access
    }
  }

  /**
   * Get file/directory info
   */
  async handleInfo(data) {
    try {
      if (!data?.path) {
        return { status: 400, error: 'path is required' };
      }

      const safePath = this.validatePath(data.path);
      const stats = await fs.stat(safePath);

      return {
        status: 200,
        data: {
          path: data.path,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime
        }
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 404, error: 'Path not found' };
      }
      this.logger.error('filesystem.info.error', { error: error.message, path: data?.path });
      return { status: error.status || 500, error: error.message };
    }
  }
}

module.exports = FilesystemModule;
