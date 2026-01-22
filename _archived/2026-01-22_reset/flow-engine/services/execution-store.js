/**
 * Execution Store
 *
 * Persiste el historial de ejecuciones de flujos para auditoría y debugging.
 * Usa JSON files con rotación automática.
 *
 * Estructura:
 * - data/flow-engine/executions/current.json - Ejecuciones recientes
 * - data/flow-engine/executions/YYYY-MM-DD.json - Archivos diarios (rotados)
 *
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');

class ExecutionStore {
  constructor(config = {}) {
    this.basePath = config.basePath || './data/flow-engine/executions';
    this.maxExecutions = config.maxExecutions || 1000; // Máximo en memoria
    this.maxFileSize = config.maxFileSize || 5 * 1024 * 1024; // 5MB antes de rotar
    this.retentionDays = config.retentionDays || 30; // Días de historial
    this.autoSaveInterval = config.autoSaveInterval || 30000; // 30 segundos

    this.executions = []; // En memoria
    this.dirty = false; // Cambios pendientes de guardar
    this.saveTimer = null;
    this.logger = null;
    this.initialized = false;
  }

  /**
   * Configura el logger
   */
  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * Inicializa el store
   */
  async initialize() {
    try {
      // Crear directorio si no existe
      await fs.mkdir(this.basePath, { recursive: true });

      // Cargar ejecuciones existentes
      await this.load();

      // Iniciar auto-save
      this.startAutoSave();

      this.initialized = true;
      this.log('info', `ExecutionStore initialized with ${this.executions.length} executions`);

    } catch (error) {
      this.log('error', `Failed to initialize: ${error.message}`);
      throw error;
    }
  }

  /**
   * Carga ejecuciones desde archivo
   */
  async load() {
    const currentFile = path.join(this.basePath, 'current.json');

    try {
      const content = await fs.readFile(currentFile, 'utf8');
      const data = JSON.parse(content);

      this.executions = data.executions || [];
      this.log('debug', `Loaded ${this.executions.length} executions from current.json`);

    } catch (error) {
      if (error.code === 'ENOENT') {
        // Archivo no existe, empezar vacío
        this.executions = [];
        this.log('debug', 'No current.json found, starting fresh');
      } else {
        this.log('error', `Error loading executions: ${error.message}`);
        this.executions = [];
      }
    }
  }

  /**
   * Guarda ejecuciones a archivo
   */
  async save() {
    if (!this.dirty) return;

    const currentFile = path.join(this.basePath, 'current.json');

    try {
      // Verificar si necesitamos rotar
      await this.checkRotation();

      const data = {
        version: '1.0.0',
        savedAt: new Date().toISOString(),
        count: this.executions.length,
        executions: this.executions
      };

      await fs.writeFile(currentFile, JSON.stringify(data, null, 2));
      this.dirty = false;
      this.log('debug', `Saved ${this.executions.length} executions`);

    } catch (error) {
      this.log('error', `Error saving executions: ${error.message}`);
    }
  }

  /**
   * Verifica si necesita rotar el archivo
   */
  async checkRotation() {
    const currentFile = path.join(this.basePath, 'current.json');

    try {
      const stats = await fs.stat(currentFile);

      if (stats.size >= this.maxFileSize) {
        await this.rotate();
      }
    } catch (error) {
      // Archivo no existe, no necesita rotación
    }
  }

  /**
   * Rota el archivo actual a uno con fecha
   */
  async rotate() {
    const currentFile = path.join(this.basePath, 'current.json');
    const today = new Date().toISOString().split('T')[0];
    const archiveFile = path.join(this.basePath, `${today}.json`);

    try {
      // Mover archivo actual a archivo con fecha
      await fs.rename(currentFile, archiveFile);
      this.log('info', `Rotated executions to ${today}.json`);

      // Limpiar ejecuciones antiguas en memoria
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // Últimas 24 horas
      this.executions = this.executions.filter(e =>
        new Date(e.startedAt).getTime() > cutoff
      );

      // Limpiar archivos antiguos
      await this.cleanupOldFiles();

    } catch (error) {
      this.log('error', `Error rotating: ${error.message}`);
    }
  }

  /**
   * Limpia archivos más antiguos que retentionDays
   */
  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.basePath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      for (const file of files) {
        if (file === 'current.json') continue;

        // Extraer fecha del nombre (YYYY-MM-DD.json)
        const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
        if (!match) continue;

        const fileDate = new Date(match[1]);
        if (fileDate < cutoffDate) {
          await fs.unlink(path.join(this.basePath, file));
          this.log('info', `Deleted old execution file: ${file}`);
        }
      }
    } catch (error) {
      this.log('error', `Error cleaning old files: ${error.message}`);
    }
  }

  /**
   * Inicia auto-save periódico
   */
  startAutoSave() {
    this.saveTimer = setInterval(() => {
      this.save().catch(e => this.log('error', `Auto-save error: ${e.message}`));
    }, this.autoSaveInterval);
  }

  /**
   * Detiene auto-save
   */
  stopAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Guarda una ejecución
   */
  async add(execution) {
    // Crear registro de ejecución compacto
    const record = {
      id: execution.id,
      flowId: execution.flowId,
      flowName: execution.flowName,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      duration: execution.completedAt
        ? new Date(execution.completedAt) - new Date(execution.startedAt)
        : null,
      stepsExecuted: execution.history?.length || 0,
      error: execution.error || null,
      trigger: this.summarizeTrigger(execution.context?.trigger),
      history: execution.history || []
    };

    this.executions.unshift(record); // Agregar al inicio (más reciente primero)

    // Limitar tamaño en memoria
    if (this.executions.length > this.maxExecutions) {
      this.executions = this.executions.slice(0, this.maxExecutions);
    }

    this.dirty = true;

    this.log('debug', `Added execution ${record.id} (${record.status})`);

    return record;
  }

  /**
   * Resume el trigger para guardar (sin datos sensibles)
   */
  summarizeTrigger(trigger) {
    if (!trigger) return null;

    return {
      event: trigger._event || 'unknown',
      botName: trigger.botName,
      chatId: trigger.chatId,
      file: trigger.file ? {
        name: trigger.file.originalName || trigger.file.name,
        mimeType: trigger.file.mimeType,
        size: trigger.file.size
      } : null
    };
  }

  /**
   * Actualiza una ejecución existente
   */
  async update(executionId, updates) {
    const index = this.executions.findIndex(e => e.id === executionId);
    if (index === -1) return null;

    Object.assign(this.executions[index], updates);

    // Recalcular duración si se completó
    if (updates.completedAt) {
      const exec = this.executions[index];
      exec.duration = new Date(exec.completedAt) - new Date(exec.startedAt);
    }

    this.dirty = true;
    return this.executions[index];
  }

  /**
   * Obtiene una ejecución por ID
   */
  get(executionId) {
    return this.executions.find(e => e.id === executionId);
  }

  /**
   * Lista ejecuciones con filtros
   */
  list(options = {}) {
    let results = [...this.executions];

    // Filtrar por flowId
    if (options.flowId) {
      results = results.filter(e => e.flowId === options.flowId);
    }

    // Filtrar por status
    if (options.status) {
      results = results.filter(e => e.status === options.status);
    }

    // Filtrar por rango de fechas
    if (options.from) {
      const fromDate = new Date(options.from);
      results = results.filter(e => new Date(e.startedAt) >= fromDate);
    }
    if (options.to) {
      const toDate = new Date(options.to);
      results = results.filter(e => new Date(e.startedAt) <= toDate);
    }

    // Ordenar
    const sortField = options.sortBy || 'startedAt';
    const sortOrder = options.sortOrder || 'desc';
    results.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (sortOrder === 'desc') {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    });

    // Paginación
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const total = results.length;

    results = results.slice(offset, offset + limit);

    return {
      executions: results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total
    };
  }

  /**
   * Obtiene estadísticas
   */
  getStats(options = {}) {
    let executions = this.executions;

    // Filtrar por rango de fechas si se especifica
    if (options.from) {
      const fromDate = new Date(options.from);
      executions = executions.filter(e => new Date(e.startedAt) >= fromDate);
    }

    const completed = executions.filter(e => e.status === 'completed');
    const failed = executions.filter(e => e.status === 'failed');

    // Calcular duración promedio
    const durations = completed.filter(e => e.duration).map(e => e.duration);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // Agrupar por flujo
    const byFlow = {};
    for (const exec of executions) {
      if (!byFlow[exec.flowId]) {
        byFlow[exec.flowId] = { total: 0, completed: 0, failed: 0 };
      }
      byFlow[exec.flowId].total++;
      if (exec.status === 'completed') byFlow[exec.flowId].completed++;
      if (exec.status === 'failed') byFlow[exec.flowId].failed++;
    }

    // Agrupar por día (últimos 7 días)
    const byDay = {};
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const exec of executions) {
      const execDate = new Date(exec.startedAt);
      if (execDate >= sevenDaysAgo) {
        const day = execDate.toISOString().split('T')[0];
        if (!byDay[day]) {
          byDay[day] = { total: 0, completed: 0, failed: 0 };
        }
        byDay[day].total++;
        if (exec.status === 'completed') byDay[day].completed++;
        if (exec.status === 'failed') byDay[day].failed++;
      }
    }

    return {
      total: executions.length,
      completed: completed.length,
      failed: failed.length,
      successRate: executions.length > 0
        ? Math.round((completed.length / executions.length) * 100)
        : 0,
      avgDuration,
      byFlow,
      byDay
    };
  }

  /**
   * Busca en el historial de ejecuciones
   */
  async search(query) {
    const results = this.executions.filter(exec => {
      // Buscar en flowId, flowName, error
      const searchIn = [
        exec.flowId,
        exec.flowName,
        exec.error,
        exec.id
      ].filter(Boolean).join(' ').toLowerCase();

      return searchIn.includes(query.toLowerCase());
    });

    return results.slice(0, 100); // Limitar resultados
  }

  /**
   * Limpia ejecuciones antiguas
   */
  async cleanup(olderThanDays = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const before = this.executions.length;
    this.executions = this.executions.filter(e =>
      new Date(e.startedAt) > cutoff
    );

    const deleted = before - this.executions.length;
    if (deleted > 0) {
      this.dirty = true;
      this.log('info', `Cleaned up ${deleted} old executions`);
    }

    return deleted;
  }

  /**
   * Cierra el store (guarda pendientes)
   */
  async close() {
    this.stopAutoSave();
    await this.save();
    this.log('info', 'ExecutionStore closed');
  }

  /**
   * Helper para logging
   */
  log(level, message) {
    if (this.logger) {
      this.logger[level]?.(`execution-store.${level}`, { message });
    }
  }
}

module.exports = ExecutionStore;
