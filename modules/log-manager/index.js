/**
 * Log Manager Module
 *
 * Sistema centralizado de logs para Event Core.
 * Recolecta logs de todos los módulos (backend y frontend) y los almacena
 * en formato JSONL para fácil análisis por IA.
 *
 * Características:
 * - Almacenamiento en JSONL (JSON Lines) - un JSON por línea
 * - Rotación diaria automática
 * - Filtros por nivel, módulo, fecha, texto
 * - Estadísticas de logs
 * - Limpieza automática por retención
 *
 * Ubicación de logs:
 *   data/logs/
 *   ├── current.jsonl      # Logs del día actual
 *   ├── 2025-01-14.jsonl   # Histórico por día
 *   └── index.json         # Índice con metadata
 *
 * Para la IA:
 *   - Leer directo: cat data/logs/current.jsonl
 *   - Filtrar errores: grep '"level":"error"' data/logs/current.jsonl
 *   - Buscar módulo: grep '"module":"ai-gateway"' data/logs/current.jsonl
 *
 * @module log-manager
 * @version 1.0.0
 */

const path = require('path');
const LogStorage = require('./lib/storage');
const LogCollector = require('./lib/collector');

class LogManagerModule {
  constructor() {
    this.name = 'log-manager';
    this.storage = null;
    this.collector = null;
    this.logger = null;
    this.cleanupInterval = null;
  }

  /**
   * Inicializa el módulo
   * @param {Object} core - Contexto del core
   */
  async onLoad(core) {
    this.core = core;
    this.logger = core.logger?.child({ module: this.name });
    this.config = core.moduleConfig || {};

    // Resolver path de logs
    const logsPath = path.resolve(
      process.cwd(),
      this.config.logsPath || './data/logs'
    );

    // Inicializar storage
    this.storage = new LogStorage({
      logsPath,
      maxFileSize: this.config.maxFileSize || 10 * 1024 * 1024,
      retentionDays: this.config.retentionDays || 30,
      rotateDaily: this.config.rotateDaily !== false
    });

    // Inicializar collector
    this.collector = new LogCollector({
      storage: this.storage,
      eventBus: core.eventBus,
      logger: this.logger,
      coreId: core.config?.core?.id || 'unknown'
    });

    // Iniciar recolección
    this.collector.start();

    // Programar limpieza diaria
    this.cleanupInterval = setInterval(() => {
      this.storage.cleanup();
    }, 24 * 60 * 60 * 1000); // Cada 24 horas

    // Log inicial
    this.logger?.info('log-manager.loaded', {
      logsPath,
      retentionDays: this.config.retentionDays || 30
    });

    // Escribir un log de prueba para verificar que funciona
    this.storage.write({
      ts: new Date().toISOString(),
      level: 'info',
      source: 'backend',
      module: 'log-manager',
      msg: 'module.initialized',
      ctx: { logsPath, version: '1.0.0' }
    });
  }

  /**
   * Descarga el módulo
   */
  async onUnload() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.collector) {
      this.collector.stop();
    }

    if (this.storage) {
      this.storage.close();
    }

    this.logger?.info('log-manager.unloaded');
  }

  // ===========================================================================
  // API HANDLERS
  // ===========================================================================

  /**
   * GET /logs - Obtener logs con filtros
   *
   * Query params:
   *   - level: Filtrar por nivel (comma-separated: error,warn)
   *   - module: Filtrar por módulo (comma-separated: ai-gateway,database)
   *   - source: Filtrar por fuente (backend/frontend)
   *   - search: Búsqueda en mensaje y contexto
   *   - from: Fecha desde (YYYY-MM-DD)
   *   - to: Fecha hasta (YYYY-MM-DD)
   *   - limit: Límite de resultados (default: 100)
   *   - offset: Offset para paginación (default: 0)
   *
   * @example
   * GET /modules/log-manager/api/logs?level=error&module=ai-gateway&limit=50
   */
  async getLogs(req) {
    const filters = {
      level: req.query?.level,
      module: req.query?.module,
      source: req.query?.source,
      search: req.query?.search,
      from: req.query?.from,
      to: req.query?.to,
      limit: parseInt(req.query?.limit) || 100,
      offset: parseInt(req.query?.offset) || 0
    };

    const logs = this.storage.read(filters);

    return {
      success: true,
      count: logs.length,
      filters,
      logs
    };
  }

  /**
   * POST /logs - Agregar un log (desde frontend u otros sistemas)
   *
   * Body:
   *   - level: Nivel del log (debug/info/warn/error)
   *   - module: Nombre del módulo
   *   - msg: Mensaje del evento
   *   - ctx: Contexto adicional (opcional)
   *   - source: Fuente (default: frontend)
   *
   * @example
   * POST /modules/log-manager/api/logs
   * { "level": "error", "module": "chat", "msg": "send.failed", "ctx": { "error": "timeout" } }
   */
  async addLog(req) {
    const body = req.body || {};

    if (!body.level || !body.module || !body.msg) {
      return {
        success: false,
        error: 'Missing required fields: level, module, msg'
      };
    }

    const result = this.collector.addFromHttp(body);
    return result;
  }

  /**
   * GET /stats - Estadísticas de logs
   *
   * Retorna:
   *   - total: Total de logs
   *   - byLevel: Conteo por nivel
   *   - byModule: Conteo por módulo
   *   - currentFile: Info del archivo actual
   *   - archivedFiles: Cantidad de archivos históricos
   *   - collector: Stats del collector
   */
  async getStats(req) {
    const storageStats = this.storage.getStats();
    const collectorStats = this.collector.getStats();

    return {
      success: true,
      stats: {
        ...storageStats,
        collector: collectorStats
      }
    };
  }

  /**
   * GET /files - Listar archivos de logs
   *
   * Retorna lista de archivos JSONL disponibles con su metadata.
   * Útil para la IA para saber qué archivos puede leer.
   */
  async getFiles(req) {
    const files = this.storage.listFiles();

    return {
      success: true,
      count: files.length,
      files,
      tip: 'Para leer un archivo: cat <path> o grep "pattern" <path>'
    };
  }

  /**
   * DELETE /logs - Limpiar logs antiguos
   *
   * Query params:
   *   - olderThan: Días de antigüedad (default: usa retentionDays del config)
   *
   * @example
   * DELETE /modules/log-manager/api/logs?olderThan=7
   */
  async clearLogs(req) {
    const olderThan = parseInt(req.query?.olderThan);

    if (olderThan) {
      // Temporalmente cambiar retención
      const originalRetention = this.storage.retentionDays;
      this.storage.retentionDays = olderThan;
      const deleted = this.storage.cleanup();
      this.storage.retentionDays = originalRetention;

      return {
        success: true,
        deleted,
        message: `Deleted ${deleted} files older than ${olderThan} days`
      };
    }

    const deleted = this.storage.cleanup();

    return {
      success: true,
      deleted,
      message: `Deleted ${deleted} files older than ${this.storage.retentionDays} days`
    };
  }

  // ===========================================================================
  // UTILIDADES PARA LA IA
  // ===========================================================================

  /**
   * Método helper para que la IA pueda obtener logs fácilmente
   * @param {Object} filters - Filtros
   * @returns {Array} Logs
   */
  query(filters = {}) {
    return this.storage.read(filters);
  }

  /**
   * Método helper para obtener la ruta del archivo actual
   * @returns {string} Path al archivo current.jsonl
   */
  getCurrentLogPath() {
    return path.resolve(process.cwd(), this.config.logsPath || './data/logs', 'current.jsonl');
  }

  /**
   * Método helper para obtener el directorio de logs
   * @returns {string} Path al directorio de logs
   */
  getLogsDirectory() {
    return path.resolve(process.cwd(), this.config.logsPath || './data/logs');
  }
}

module.exports = LogManagerModule;
