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

  /**
   * GET /activities - Obtener actividades con filtros
   *
   * Query params:
   *   - type: Tipo de actividad (module_action, event_flow, api_operation, etc.)
   *   - module: Filtrar por módulo
   *   - action: Filtrar por acción (puede ser parcial)
   *   - outcome: Filtrar por resultado (success, failure, pending, timeout)
   *   - limit: Límite de resultados (default: 100)
   *   - offset: Offset para paginación (default: 0)
   *
   * @example
   * GET /modules/log-manager/api/activities?type=api_operation&module=file-browser&limit=50
   */
  async getActivities(req) {
    const filters = {
      source: 'activity',  // Only activity logs
      module: req.query?.module,
      search: req.query?.action,
      limit: parseInt(req.query?.limit) || 100,
      offset: parseInt(req.query?.offset) || 0
    };

    let logs = this.storage.read(filters);

    // Additional filtering by activity type and outcome
    const activityType = req.query?.type;
    const outcome = req.query?.outcome;

    if (activityType || outcome) {
      logs = logs.filter(log => {
        if (activityType && log.ctx?.type !== activityType) return false;
        if (outcome && log.ctx?.outcome !== outcome) return false;
        return true;
      });
    }

    // Transform to cleaner activity format
    const activities = logs.map(log => ({
      id: log.ctx?.activityId,
      ts: log.ts,
      type: log.ctx?.type,
      module: log.module,
      action: log.ctx?.action,
      outcome: log.ctx?.outcome,
      duration_ms: log.ctx?.duration_ms,
      context: log.ctx,
      error: log.error
    }));

    return {
      success: true,
      count: activities.length,
      filters: {
        type: activityType,
        module: req.query?.module,
        action: req.query?.action,
        outcome: outcome
      },
      activities
    };
  }

  /**
   * GET /activities/stats - Estadísticas de actividades
   *
   * Retorna:
   *   - total: Total de actividades
   *   - byType: Conteo por tipo de actividad
   *   - byModule: Conteo por módulo
   *   - byOutcome: Conteo por resultado
   */
  async getActivityStats(req) {
    const logs = this.storage.read({ source: 'activity', limit: 10000 });

    const stats = {
      total: logs.length,
      byType: {},
      byModule: {},
      byOutcome: {}
    };

    for (const log of logs) {
      const type = log.ctx?.type || 'unknown';
      const module = log.module || 'unknown';
      const outcome = log.ctx?.outcome || 'unknown';

      stats.byType[type] = (stats.byType[type] || 0) + 1;
      stats.byModule[module] = (stats.byModule[module] || 0) + 1;
      stats.byOutcome[outcome] = (stats.byOutcome[outcome] || 0) + 1;
    }

    return {
      success: true,
      stats
    };
  }

  // ===========================================================================
  // LOGS POR MÓDULO
  // ===========================================================================

  /**
   * GET /modules - Listar todos los módulos con logs
   *
   * Retorna lista de módulos que tienen archivos de log,
   * con estadísticas de cada uno.
   *
   * @example
   * GET /modules/log-manager/api/modules
   */
  async getModules(req) {
    const modules = this.storage.listModules();

    return {
      success: true,
      count: modules.length,
      modules,
      tip: 'Usa GET /modules/log-manager/api/modules/{nombre}/logs para ver logs de un módulo'
    };
  }

  /**
   * GET /modules/:module/logs - Obtener logs de un módulo específico
   *
   * Query params:
   *   - level: Filtrar por nivel (comma-separated: error,warn)
   *   - source: Filtrar por fuente (backend/frontend/activity)
   *   - search: Búsqueda en mensaje y contexto
   *   - limit: Límite de resultados (default: 100)
   *   - offset: Offset para paginación (default: 0)
   *
   * @example
   * GET /modules/log-manager/api/modules/file-browser/logs?level=error&limit=50
   */
  async getModuleLogs(req) {
    // Extraer nombre del módulo de la URL
    // La URL será como: /modules/log-manager/api/modules/file-browser/logs
    const pathParts = req.path.split('/');
    const modulesIndex = pathParts.indexOf('modules');

    // El nombre del módulo está después de 'modules' en la API path
    // /api/modules/{moduleName}/logs
    let moduleName = null;
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i] === 'modules' && pathParts[i + 2] === 'logs') {
        moduleName = pathParts[i + 1];
        break;
      }
    }

    if (!moduleName) {
      return {
        success: false,
        error: 'Module name not specified'
      };
    }

    const filters = {
      level: req.query?.level,
      source: req.query?.source,
      search: req.query?.search,
      limit: parseInt(req.query?.limit) || 100,
      offset: parseInt(req.query?.offset) || 0
    };

    const logs = this.storage.readByModule(moduleName, filters);

    return {
      success: true,
      module: moduleName,
      count: logs.length,
      filters,
      logs
    };
  }

  /**
   * GET /modules/:module/stats - Estadísticas de un módulo específico
   *
   * @example
   * GET /modules/log-manager/api/modules/file-browser/stats
   */
  async getModuleStats(req) {
    // Extraer nombre del módulo de la URL
    const pathParts = req.path.split('/');
    let moduleName = null;
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i] === 'modules' && pathParts[i + 2] === 'stats') {
        moduleName = pathParts[i + 1];
        break;
      }
    }

    if (!moduleName) {
      return {
        success: false,
        error: 'Module name not specified'
      };
    }

    const logs = this.storage.readByModule(moduleName, { limit: 10000 });

    const stats = {
      module: moduleName,
      total: logs.length,
      byLevel: {},
      bySource: {},
      byType: {},
      firstLog: logs.length > 0 ? logs[logs.length - 1].ts : null,
      lastLog: logs.length > 0 ? logs[0].ts : null
    };

    for (const log of logs) {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      stats.bySource[log.source] = (stats.bySource[log.source] || 0) + 1;
      if (log.ctx?.type) {
        stats.byType[log.ctx.type] = (stats.byType[log.ctx.type] || 0) + 1;
      }
    }

    return {
      success: true,
      stats
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
   * Método helper para obtener logs de un módulo
   * @param {string} moduleName - Nombre del módulo
   * @param {Object} filters - Filtros
   * @returns {Array} Logs
   */
  queryModule(moduleName, filters = {}) {
    return this.storage.readByModule(moduleName, filters);
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
