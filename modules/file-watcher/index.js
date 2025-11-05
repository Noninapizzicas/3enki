/**
 * File Watcher Module
 *
 * Módulo que observa cambios en el sistema de archivos y publica eventos.
 *
 * Características:
 * - Watch/unwatch paths via API
 * - Publica eventos file.created, file.modified, file.deleted
 * - Debouncing para evitar spam
 * - Límite de watchers simultáneos
 *
 * @example
 * POST /modules/file-watcher/watch
 * { "path": "/tmp/test", "recursive": true }
 *
 * Emite evento:
 * {
 *   event_type: 'file.modified',
 *   data: { path: '/tmp/test/file.txt', event: 'change' }
 * }
 */

const fs = require('fs');
const path = require('path');

class FileWatcherModule {
  constructor() {
    this.core = null;
    this.watchers = new Map(); // path -> { watcher, config }
    this.debounceTimers = new Map(); // path -> timeout
    this.maxWatchers = 10;
    this.debounceMs = 500;

    this.stats = {
      watched_paths: 0,
      events_published: 0,
      total_changes: 0
    };
  }

  /**
   * Lifecycle: onLoad
   *
   * @param {Object} core - Core instance
   */
  async onLoad(core) {
    this.core = core;

    const logger = core.logger;
    if (logger) {
      logger.info('file-watcher.module.loading', {
        module: 'file-watcher',
        version: '1.0.0'
      });
    }

    if (core.metrics) {
      core.metrics.increment('file-watcher.module.loaded');
    }

    if (logger) {
      logger.info('file-watcher.module.loaded', {
        max_watchers: this.maxWatchers,
        debounce_ms: this.debounceMs
      });
    }
  }

  /**
   * Lifecycle: onUnload
   */
  async onUnload() {
    if (this.core && this.core.logger) {
      this.core.logger.info('file-watcher.module.unloading', {
        watched_paths: this.watchers.size,
        stats: this.stats
      });
    }

    // Detener todos los watchers
    for (const [watchPath, data] of this.watchers.entries()) {
      try {
        data.watcher.close();
      } catch (error) {
        // Ignorar errores al cerrar
      }
    }

    this.watchers.clear();

    // Limpiar timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * API: POST /watch
   * Inicia observación de un path
   *
   * Body: { path: string, recursive?: boolean }
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handleWatch(req) {
    const { path: watchPath, recursive = false } = req.body || {};

    if (!watchPath) {
      throw new Error('path is required');
    }

    // Verificar que existe
    if (!fs.existsSync(watchPath)) {
      throw new Error(`Path does not exist: ${watchPath}`);
    }

    // Verificar límite
    if (this.watchers.size >= this.maxWatchers) {
      throw new Error(`Maximum watchers reached: ${this.maxWatchers}`);
    }

    // Verificar si ya está siendo observado
    if (this.watchers.has(watchPath)) {
      throw new Error(`Path already being watched: ${watchPath}`);
    }

    // Crear watcher
    try {
      const watcher = fs.watch(watchPath, { recursive }, (eventType, filename) => {
        this.handleFileChange(watchPath, eventType, filename);
      });

      this.watchers.set(watchPath, {
        watcher,
        config: { path: watchPath, recursive, started_at: Date.now() }
      });

      this.stats.watched_paths++;

      if (this.core && this.core.logger) {
        this.core.logger.info('file-watcher.watch.started', {
          path: watchPath,
          recursive,
          total_watchers: this.watchers.size
        });
      }

      if (this.core && this.core.metrics) {
        this.core.metrics.increment('file-watcher.watch.started');
      }

      return {
        success: true,
        path: watchPath,
        recursive,
        total_watchers: this.watchers.size
      };

    } catch (error) {
      if (this.core && this.core.logger) {
        this.core.logger.error('file-watcher.watch.failed', {
          path: watchPath,
          error: error.message
        }, error);
      }

      throw error;
    }
  }

  /**
   * API: POST /unwatch
   * Detiene observación de un path
   *
   * Body: { path: string }
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handleUnwatch(req) {
    const { path: watchPath } = req.body || {};

    if (!watchPath) {
      throw new Error('path is required');
    }

    const watcherData = this.watchers.get(watchPath);
    if (!watcherData) {
      throw new Error(`Path not being watched: ${watchPath}`);
    }

    try {
      watcherData.watcher.close();
      this.watchers.delete(watchPath);

      // Limpiar debounce timer si existe
      const timer = this.debounceTimers.get(watchPath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(watchPath);
      }

      if (this.core && this.core.logger) {
        this.core.logger.info('file-watcher.watch.stopped', {
          path: watchPath,
          total_watchers: this.watchers.size
        });
      }

      if (this.core && this.core.metrics) {
        this.core.metrics.increment('file-watcher.watch.stopped');
      }

      return {
        success: true,
        path: watchPath,
        total_watchers: this.watchers.size
      };

    } catch (error) {
      if (this.core && this.core.logger) {
        this.core.logger.error('file-watcher.unwatch.failed', {
          path: watchPath,
          error: error.message
        }, error);
      }

      throw error;
    }
  }

  /**
   * API: GET /list
   * Lista todos los paths siendo observados
   *
   * @param {Object} req - Request
   * @returns {Promise<Object>} Response
   */
  async handleList(req) {
    const watched = [];

    for (const [watchPath, data] of this.watchers.entries()) {
      watched.push({
        path: watchPath,
        recursive: data.config.recursive,
        started_at: data.config.started_at,
        uptime: Date.now() - data.config.started_at
      });
    }

    return {
      total: watched.length,
      max_watchers: this.maxWatchers,
      watched,
      stats: this.stats
    };
  }

  /**
   * Maneja cambios en archivos
   *
   * @param {string} watchPath - Path being watched
   * @param {string} eventType - 'change' or 'rename'
   * @param {string} filename - Filename that changed
   */
  handleFileChange(watchPath, eventType, filename) {
    this.stats.total_changes++;

    const fullPath = filename ? path.join(watchPath, filename) : watchPath;

    // Debouncing: evitar múltiples eventos del mismo archivo
    const debounceKey = `${fullPath}:${eventType}`;
    const existingTimer = this.debounceTimers.get(debounceKey);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(debounceKey);

      // Determinar tipo de evento
      let eventName = 'file.changed';
      let exists = false;

      try {
        exists = fs.existsSync(fullPath);
      } catch (error) {
        // Ignorar errores de acceso
      }

      if (eventType === 'rename') {
        eventName = exists ? 'file.created' : 'file.deleted';
      } else if (eventType === 'change') {
        eventName = 'file.modified';
      }

      // Publicar evento
      if (this.core && this.core.events) {
        await this.core.events.emit(eventName, {
          path: fullPath,
          watch_path: watchPath,
          filename,
          event_type: eventType,
          exists,
          timestamp: Date.now()
        });

        this.stats.events_published++;
      }

      if (this.core && this.core.logger) {
        this.core.logger.debug('file-watcher.change', {
          event_name: eventName,
          path: fullPath,
          event_type: eventType
        });
      }

      if (this.core && this.core.metrics) {
        this.core.metrics.increment(`file-watcher.${eventName}`);
      }

    }, this.debounceMs);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * Obtiene estadísticas
   *
   * @returns {Object} Stats
   */
  getStats() {
    return {
      ...this.stats,
      active_watchers: this.watchers.size
    };
  }
}

module.exports = FileWatcherModule;
