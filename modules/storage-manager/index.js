const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');

/**
 * Storage Manager Module
 *
 * Event-driven file storage management with project isolation.
 * - Auto-creates storage structure when project.created
 * - Auto-deletes storage when project.deleted
 * - Upload/download/delete files
 * - Category-based organization (uploads, exports, temp, files)
 * - Storage usage tracking
 * - Temp file cleanup
 */
class StorageManagerModule {
  constructor() {
    this.name = 'storage-manager';
    this.version = '1.0.0';

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;

    // State
    this.files = new Map(); // File registry: fileId -> file metadata
    this.unsubscribes = []; // Unsubscribe functions
    this.basePath = null;
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    this.logger.info('storage-manager.loading', { module: this.name });

    // Ensure base storage directory exists
    this.basePath = path.resolve(this.config.basePath || 'data/storage');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }

    // Subscribe to project lifecycle events
    const unsubCreated = await this.eventBus.subscribe(EVENTS.PROJECT.CREATED,
      this.onProjectCreated.bind(this));
    this.unsubscribes.push(unsubCreated);

    const unsubDeleted = await this.eventBus.subscribe(EVENTS.PROJECT.DELETED,
      this.onProjectDeleted.bind(this));
    this.unsubscribes.push(unsubDeleted);

    // Subscribe to query events
    const unsubFileList = await this.eventBus.subscribe(EVENTS.FILE.LIST_REQUEST,
      this.onFileListRequest.bind(this));
    this.unsubscribes.push(unsubFileList);

    const unsubFileGet = await this.eventBus.subscribe('file.get.request',
      this.onFileGetRequest.bind(this));
    this.unsubscribes.push(unsubFileGet);

    const unsubStorageInfo = await this.eventBus.subscribe(EVENTS.STORAGE.INFO_REQUEST,
      this.onStorageInfoRequest.bind(this));
    this.unsubscribes.push(unsubStorageInfo);

    // Load existing file metadata
    await this.loadExistingFiles();

    this.logger.info('storage-manager.loaded', { module: this.name });
  }

  async onUnload() {
    this.logger.info('storage-manager.unloading', { module: this.name });

    // Unsubscribe all
    for (const unsub of this.unsubscribes) {
      await unsub();
    }
    this.unsubscribes = [];

    this.logger.info({ correlationId: 'system' }, 'Storage Manager module unloaded');
  }

  // ==================== INITIALIZATION ====================

  /**
   * Load existing files metadata into memory
   */
  async loadExistingFiles() {
    const correlationId = crypto.randomUUID();
    this.logger.debug({ correlationId }, 'Loading existing files metadata');

    try {
      if (!fs.existsSync(this.basePath)) {
        return;
      }

      const projectDirs = fs.readdirSync(this.basePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      let totalFiles = 0;
      let totalSize = 0;

      for (const projectId of projectDirs) {
        const projectPath = path.join(this.basePath, projectId);
        const categories = Object.values(this.config.directories);

        for (const category of categories) {
          const categoryPath = path.join(projectPath, category);
          if (fs.existsSync(categoryPath)) {
            const files = fs.readdirSync(categoryPath, { withFileTypes: true })
              .filter(dirent => dirent.isFile());

            for (const file of files) {
              const filePath = path.join(categoryPath, file.name);
              const stats = fs.statSync(filePath);

              const fileId = this.extractFileIdFromName(file.name) || crypto.randomUUID();
              const fileMetadata = {
                id: fileId,
                project_id: projectId,
                filename: file.name,
                original_filename: file.name,
                path: filePath,
                relative_path: path.join(projectId, category, file.name),
                size: stats.size,
                mime_type: this.getMimeType(file.name),
                category,
                created_at: stats.birthtime.toISOString(),
                metadata: {}
              };

              this.files.set(fileId, fileMetadata);
              totalFiles++;
              totalSize += stats.size;
            }
          }
        }
      }

      this.logger.info({ correlationId, totalFiles, totalSize }, 'Loaded existing files');
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.files.count', totalFiles);
    // → Emit storage.stats event with all metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.total.bytes', totalSize);
    // → Emit storage.stats event with all metrics
    } catch (error) {
      this.logger.error({ correlationId, error: error.message }, 'Failed to load files');
    }
  }

  // ==================== STORAGE STRUCTURE ====================

  /**
   * Create storage structure for a project
   */
  createProjectStorage(projectId, correlationId) {
    this.logger.info({ correlationId, projectId }, 'Creating project storage structure');

    const projectPath = path.join(this.basePath, projectId);
    const directories = [];

    try {
      // Create main project directory
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }

      // Create category subdirectories
      for (const [category, dirname] of Object.entries(this.config.directories)) {
        const dirPath = path.join(projectPath, dirname);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          directories.push(dirname);
        }
      }

      this.logger.info({ correlationId, projectId, directories }, 'Project storage created');
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.created.total');
    // → Counter extracted from events
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.projects.count', this.countProjectStorages()
    // → Emit storage.stats event with all metrics);

      return { success: true, directories };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.error.total', 1, { operation: 'create' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, error: error.message },
        'Failed to create project storage');
      throw error;
    }
  }

  /**
   * Delete storage structure for a project
   */
  deleteProjectStorage(projectId, correlationId) {
    this.logger.info({ correlationId, projectId }, 'Deleting project storage');

    const projectPath = path.join(this.basePath, projectId);

    try {
      if (!fs.existsSync(projectPath)) {
        this.logger.warn({ correlationId, projectId }, 'Project storage does not exist');
        return { success: true, files_deleted: 0, bytes_freed: 0 };
      }

      // Calculate stats before deletion
      const stats = this.calculateDirectoryStats(projectPath);

      // Delete all files from registry
      const filesToDelete = Array.from(this.files.values())
        .filter(f => f.project_id === projectId);

      for (const file of filesToDelete) {
        this.files.delete(file.id);
      }

      // Delete directory
      fs.rmSync(projectPath, { recursive: true, force: true });

      this.logger.info({ correlationId, projectId, ...stats }, 'Project storage deleted');
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.deleted.total');
    // → Counter extracted from events
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.projects.count', this.countProjectStorages()
    // → Emit storage.stats event with all metrics);
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.files.count', this.files.size);
    // → Emit storage.stats event with all metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.total.bytes', this.calculateTotalSize()
    // → Emit storage.stats event with all metrics);

      return { success: true, files_deleted: stats.fileCount, bytes_freed: stats.totalSize };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.error.total', 1, { operation: 'delete' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, error: error.message },
        'Failed to delete project storage');
      throw error;
    }
  }

  // ==================== FILE OPERATIONS ====================

  /**
   * Upload file to project storage
   */
  uploadFile(projectId, file, category = 'uploads', metadata = {}, correlationId) {
    const startTime = Date.now();
    const fileId = crypto.randomUUID();
    const originalFilename = file.originalname || file.name || 'unnamed';
    const filename = `${fileId}_${originalFilename}`;

    this.logger.info({ correlationId, projectId, fileId, originalFilename, category },
      'Uploading file');

    try {
      // Validate category
      if (!Object.keys(this.config.directories).includes(category)) {
        throw new Error(`Invalid category: ${category}`);
      }

      // Validate file size
      if (file.size > this.config.maxFileSize) {
        throw new Error(`File too large: ${file.size} bytes (max: ${this.config.maxFileSize})`);
      }

      // Ensure project storage exists
      const projectPath = path.join(this.basePath, projectId);
      if (!fs.existsSync(projectPath)) {
        this.createProjectStorage(projectId, correlationId);
      }

      // Destination path
      const categoryDir = this.config.directories[category];
      const destPath = path.join(projectPath, categoryDir, filename);

      // Copy/move file
      if (file.path) {
        // Multer file with temp path
        fs.renameSync(file.path, destPath);
      } else if (file.buffer) {
        // Buffer
        fs.writeFileSync(destPath, file.buffer);
      } else {
        throw new Error('Invalid file object: no path or buffer');
      }

      // Create metadata
      const fileMetadata = {
        id: fileId,
        project_id: projectId,
        filename,
        original_filename: originalFilename,
        path: destPath,
        relative_path: path.join(projectId, categoryDir, filename),
        size: file.size,
        mime_type: file.mimetype || this.getMimeType(originalFilename),
        category,
        created_at: new Date().toISOString(),
        metadata
      };

      // Store in registry
      this.files.set(fileId, fileMetadata);

      // Update metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('file.uploaded.total');
    // → Counter extracted from events
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.files.count', this.files.size);
    // → Emit storage.stats event with all metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.total.bytes', this.calculateTotalSize()
    // → Emit storage.stats event with all metrics);
      // REMOVED: this.metrics.timing('file.upload.duration', Date.now() - startTime);

      this.logger.info({ correlationId, projectId, fileId, size: file.size },
        'File uploaded successfully');

      return fileMetadata;
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.error.total', 1, { operation: 'upload' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, fileId, error: error.message },
        'Failed to upload file');
      throw error;
    }
  }

  /**
   * Delete file from storage
   */
  deleteFile(fileId, correlationId) {
    this.logger.info({ correlationId, fileId }, 'Deleting file');

    const file = this.files.get(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    try {
      // Delete physical file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      // Remove from registry
      this.files.delete(fileId);

      // Update metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('file.deleted.total');
    // → Counter extracted from events
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.files.count', this.files.size);
    // → Emit storage.stats event with all metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.total.bytes', this.calculateTotalSize()
    // → Emit storage.stats event with all metrics);

      this.logger.info({ correlationId, fileId, projectId: file.project_id },
        'File deleted successfully');

      return { success: true, file_id: fileId, size: file.size };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.error.total', 1, { operation: 'delete_file' });
    // → Counter extracted from events
      this.logger.error({ correlationId, fileId, error: error.message },
        'Failed to delete file');
      throw error;
    }
  }

  /**
   * List files in project storage
   */
  listFiles(projectId, category = null) {
    let files = Array.from(this.files.values())
      .filter(f => f.project_id === projectId);

    if (category) {
      files = files.filter(f => f.category === category);
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    return { files, count: files.length, total_size: totalSize };
  }

  /**
   * Get file metadata
   */
  getFile(fileId) {
    return this.files.get(fileId);
  }

  /**
   * Cleanup temporary files older than X hours
   */
  cleanupTempFiles(projectId, correlationId) {
    const startTime = Date.now();
    this.logger.info({ correlationId, projectId }, 'Cleaning up temporary files');

    try {
      const cutoffTime = Date.now() - (this.config.tempCleanupAfterHours * 60 * 60 * 1000);
      const tempFiles = Array.from(this.files.values())
        .filter(f => f.project_id === projectId && f.category === 'temp');

      let filesDeleted = 0;
      let bytesFreed = 0;

      for (const file of tempFiles) {
        const createdTime = new Date(file.created_at).getTime();
        if (createdTime < cutoffTime) {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
            this.files.delete(file.id);
            filesDeleted++;
            bytesFreed += file.size;
          } catch (error) {
            this.logger.warn({ correlationId, fileId: file.id, error: error.message },
              'Failed to delete temp file');
          }
        }
      }

      // Update metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.cleanup.total');
    // → Counter extracted from events
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.files.count', this.files.size);
    // → Emit storage.stats event with all metrics
      // REMOVED (migrate-to-event-metrics): this.metrics.gauge('storage.total.bytes', this.calculateTotalSize()
    // → Emit storage.stats event with all metrics);
      // REMOVED: this.metrics.timing('storage.cleanup.duration', Date.now() - startTime);

      this.logger.info({ correlationId, projectId, filesDeleted, bytesFreed },
        'Temporary files cleaned');

      return { success: true, files_deleted: filesDeleted, bytes_freed: bytesFreed };
    } catch (error) {
      // REMOVED (migrate-to-event-metrics): this.metrics.increment('storage.error.total', 1, { operation: 'cleanup' });
    // → Counter extracted from events
      this.logger.error({ correlationId, projectId, error: error.message },
        'Failed to cleanup temp files');
      throw error;
    }
  }

  /**
   * Get storage usage information
   */
  getStorageInfo(projectId) {
    const files = Array.from(this.files.values())
      .filter(f => f.project_id === projectId);

    const byCategory = {};
    let totalSize = 0;

    for (const category of Object.keys(this.config.directories)) {
      const categoryFiles = files.filter(f => f.category === category);
      const categorySize = categoryFiles.reduce((sum, f) => sum + f.size, 0);

      byCategory[category] = {
        size: categorySize,
        count: categoryFiles.length
      };

      totalSize += categorySize;
    }

    return {
      project_id: projectId,
      total_size: totalSize,
      file_count: files.length,
      by_category: byCategory
    };
  }

  // ==================== EVENT HANDLERS ====================

  /**
   * Handle project.created - auto-create storage structure
   */
  async onProjectCreated(event) {
    const { project_id } = event.payload || event;
    const correlationId = event.correlation_id || crypto.randomUUID();

    this.logger.info({ correlationId, projectId: project_id },
      'Received project.created, creating storage');

    try {
      const result = this.createProjectStorage(project_id, correlationId);

      await this.eventBus.publish('storage.created', {
        project_id,
        directories: result.directories,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error({ correlationId, projectId: project_id, error: error.message },
        'Failed to create storage on project.created');
    }
  }

  /**
   * Handle project.deleted - auto-delete storage
   */
  async onProjectDeleted(event) {
    const { project_id } = event.payload || event;
    const correlationId = event.correlation_id || crypto.randomUUID();

    this.logger.info({ correlationId, projectId: project_id },
      'Received project.deleted, deleting storage');

    try {
      const result = this.deleteProjectStorage(project_id, correlationId);

      await this.eventBus.publish('storage.deleted', {
        project_id,
        files_deleted: result.files_deleted,
        bytes_freed: result.bytes_freed,
        deleted_at: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error({ correlationId, projectId: project_id, error: error.message },
        'Failed to delete storage on project.deleted');
    }
  }

  /**
   * Handle file.list.request
   */
  async onFileListRequest(event) {
    const { request_id, project_id, category, correlation_id } = event;
    this.logger.debug({ correlationId: correlation_id, requestId: request_id, projectId: project_id },
      'Received file.list.request');

    try {
      const result = this.listFiles(project_id, category);

      await this.eventBus.publish(EVENTS.FILE.LIST_RESPONSE, {
        request_id,
        success: true,
        project_id,
        files: result.files,
        count: result.count,
        total_size: result.total_size
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.FILE.LIST_RESPONSE, {
        request_id,
        success: false,
        project_id,
        files: [],
        count: 0,
        error: error.message
      });
    }
  }

  /**
   * Handle file.get.request
   */
  async onFileGetRequest(event) {
    const { request_id, file_id, correlation_id } = event;
    this.logger.debug({ correlationId: correlation_id, requestId: request_id, fileId: file_id },
      'Received file.get.request');

    try {
      const file = this.getFile(file_id);

      await this.eventBus.publish('file.get.response', {
        request_id,
        success: !!file,
        file: file || null,
        error: file ? null : 'File not found'
      });
    } catch (error) {
      await this.eventBus.publish('file.get.response', {
        request_id,
        success: false,
        file: null,
        error: error.message
      });
    }
  }

  /**
   * Handle storage.info.request
   */
  async onStorageInfoRequest(event) {
    const { request_id, project_id, correlation_id } = event;
    this.logger.debug({ correlationId: correlation_id, requestId: request_id, projectId: project_id },
      'Received storage.info.request');

    try {
      const storage = this.getStorageInfo(project_id);

      await this.eventBus.publish(EVENTS.STORAGE.INFO_RESPONSE, {
        request_id,
        success: true,
        storage
      });
    } catch (error) {
      await this.eventBus.publish(EVENTS.STORAGE.INFO_RESPONSE, {
        request_id,
        success: false,
        storage: null,
        error: error.message
      });
    }
  }

  // ==================== HTTP API HANDLERS ====================

  async handleUploadFile(req, res) {
    const correlationId = crypto.randomUUID();
    const { projectId } = req.params;
    const category = req.body.category || 'uploads';
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    const file = req.file;

    this.logger.info({ correlationId, projectId, category }, 'HTTP: Upload file');

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    try {
      const fileMetadata = this.uploadFile(projectId, file, category, metadata, correlationId);

      await this.eventBus.publish('file.uploaded', {
        file_id: fileMetadata.id,
        project_id: projectId,
        filename: fileMetadata.filename,
        size: fileMetadata.size,
        category: fileMetadata.category,
        mime_type: fileMetadata.mime_type,
        uploaded_at: fileMetadata.created_at
      });

      res.status(201).json({ success: true, file: fileMetadata });
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message },
        'HTTP: Failed to upload file');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleListFiles(req, res) {
    const correlationId = crypto.randomUUID();
    const { projectId } = req.params;
    const { category } = req.query;

    this.logger.debug({ correlationId, projectId, category }, 'HTTP: List files');

    try {
      const result = this.listFiles(projectId, category);
      res.json({ success: true, ...result });
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message },
        'HTTP: Failed to list files');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetFile(req, res) {
    const correlationId = crypto.randomUUID();
    const { fileId } = req.params;

    this.logger.debug({ correlationId, fileId }, 'HTTP: Get file metadata');

    try {
      const file = this.getFile(fileId);
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      res.json({ success: true, file });
    } catch (error) {
      this.logger.error({ correlationId, fileId, error: error.message },
        'HTTP: Failed to get file');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleDownloadFile(req, res) {
    const correlationId = crypto.randomUUID();
    const { fileId } = req.params;

    this.logger.info({ correlationId, fileId }, 'HTTP: Download file');

    try {
      const file = this.getFile(fileId);
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      if (!fs.existsSync(file.path)) {
        return res.status(404).json({ success: false, error: 'Physical file not found' });
      }

      // REMOVED (migrate-to-event-metrics): this.metrics.increment('file.downloaded.total');
    // → Counter extracted from events

      res.download(file.path, file.original_filename);
    } catch (error) {
      this.logger.error({ correlationId, fileId, error: error.message },
        'HTTP: Failed to download file');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleDeleteFile(req, res) {
    const correlationId = crypto.randomUUID();
    const { fileId } = req.params;

    this.logger.info({ correlationId, fileId }, 'HTTP: Delete file');

    try {
      const file = this.getFile(fileId);
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const result = this.deleteFile(fileId, correlationId);

      await this.eventBus.publish(EVENTS.FILE.DELETED, {
        file_id: fileId,
        project_id: file.project_id,
        filename: file.filename,
        size: file.size,
        deleted_at: new Date().toISOString()
      });

      res.json({ success: true, file_id: fileId, message: 'File deleted successfully' });
    } catch (error) {
      this.logger.error({ correlationId, fileId, error: error.message },
        'HTTP: Failed to delete file');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleCleanupTemp(req, res) {
    const correlationId = crypto.randomUUID();
    const { projectId } = req.params;

    this.logger.info({ correlationId, projectId }, 'HTTP: Cleanup temp files');

    try {
      const result = this.cleanupTempFiles(projectId, correlationId);

      await this.eventBus.publish('storage.cleaned', {
        project_id: projectId,
        files_deleted: result.files_deleted,
        bytes_freed: result.bytes_freed,
        cleaned_at: new Date().toISOString()
      });

      res.json({ success: true, ...result });
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message },
        'HTTP: Failed to cleanup temp files');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleGetStorageInfo(req, res) {
    const correlationId = crypto.randomUUID();
    const { projectId } = req.params;

    this.logger.debug({ correlationId, projectId }, 'HTTP: Get storage info');

    try {
      const storage = this.getStorageInfo(projectId);
      res.json({ success: true, storage });
    } catch (error) {
      this.logger.error({ correlationId, projectId, error: error.message },
        'HTTP: Failed to get storage info');
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async handleHealthCheck(req, res) {
    res.json({
      status: 'healthy',
      module: 'storage-manager',
      total_files: this.files.size,
      total_size: this.calculateTotalSize(),
      projects_count: this.countProjectStorages(),
      uptime: process.uptime()
    });
  }

  async handleGetMetrics(req, res) {
    res.json({
      module: 'storage-manager',
      metrics: {
        total_files: this.files.size,
        total_size: this.calculateTotalSize(),
        projects_count: this.countProjectStorages()
      }
    });
  }

  // ==================== HELPERS ====================

  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.xml': 'application/xml',
      '.html': 'text/html'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  extractFileIdFromName(filename) {
    const match = filename.match(/^([a-f0-9-]{36})_/);
    return match ? match[1] : null;
  }

  calculateTotalSize() {
    return Array.from(this.files.values()).reduce((sum, f) => sum + f.size, 0);
  }

  countProjectStorages() {
    if (!fs.existsSync(this.basePath)) {
      return 0;
    }
    return fs.readdirSync(this.basePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .length;
  }

  calculateDirectoryStats(dirPath) {
    let fileCount = 0;
    let totalSize = 0;

    const processDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          processDir(fullPath);
        } else {
          fileCount++;
          totalSize += fs.statSync(fullPath).size;
        }
      }
    };

    if (fs.existsSync(dirPath)) {
      processDir(dirPath);
    }

    return { fileCount, totalSize };
  }
}

module.exports = StorageManagerModule;
