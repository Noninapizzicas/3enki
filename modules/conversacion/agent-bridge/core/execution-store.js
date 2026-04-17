const crypto = require('crypto');

/**
 * ExecutionStore — persiste ejecuciones de agentes en SQLite del proyecto.
 *
 * Usa el patrón db.query.request/response del sistema.
 * No es path crítico: si falla, el routing sigue funcionando.
 */
class ExecutionStore {
  constructor({ eventBus, logger, dbTimeout = 10000 }) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.dbTimeout = dbTimeout;
    this.pendingRequests = new Map();
    this.initializedProjects = new Set();
  }

  // ==========================================
  // Respuesta de DB
  // ==========================================

  onDbQueryResponse(event) {
    const data = event.data || event;
    const { request_id, success, data: rows, error } = data;
    const pending = this.pendingRequests.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(request_id);
    if (success) pending.resolve(rows || []);
    else pending.reject(new Error(error || 'DB query failed'));
  }

  // ==========================================
  // Schema
  // ==========================================

  async ensureSchema(projectId) {
    if (this.initializedProjects.has(projectId)) return;

    try {
      await this._query(projectId, `
        CREATE TABLE IF NOT EXISTS agent_executions (
          id           TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          agent_name   TEXT NOT NULL,
          task         TEXT,
          project_id   TEXT,
          status       TEXT NOT NULL DEFAULT 'running',
          started_at   TEXT NOT NULL,
          completed_at TEXT,
          result       TEXT,
          error        TEXT
        )
      `, [], false);

      await this._query(projectId,
        'CREATE INDEX IF NOT EXISTS idx_ae_conversation ON agent_executions(conversation_id)',
        [], false
      );

      this.initializedProjects.add(projectId);
    } catch (err) {
      this.logger?.warn('agent-bridge.store.schema_failed', { projectId, error: err.message });
    }
  }

  // ==========================================
  // CRUD
  // ==========================================

  async insertExecution(projectId, { id, conversation_id, agent_name, task, started_at }) {
    await this.ensureSchema(projectId);
    await this._query(projectId,
      `INSERT INTO agent_executions (id, conversation_id, agent_name, task, project_id, status, started_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?)`,
      [id, conversation_id, agent_name, task || null, projectId, started_at],
      false
    ).catch(err => {
      this.logger?.warn('agent-bridge.store.insert_failed', { error: err.message });
    });
  }

  async updateExecution(projectId, id, status, { result, error } = {}) {
    const completedAt = new Date().toISOString();
    const resultStr = result !== undefined ? JSON.stringify(result) : null;
    await this._query(projectId,
      `UPDATE agent_executions SET status=?, completed_at=?, result=?, error=? WHERE id=?`,
      [status, completedAt, resultStr, error || null, id],
      false
    ).catch(err => {
      this.logger?.warn('agent-bridge.store.update_failed', { error: err.message });
    });
  }

  // ==========================================
  // Helpers
  // ==========================================

  async _query(projectId, query, params = [], readOnly = false) {
    const requestId = crypto.randomUUID();

    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('DB query timeout'));
      }, this.dbTimeout);
      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutId });
    });

    await this.eventBus.publish('db.query.request', {
      project_id: projectId,
      query,
      params,
      read_only: readOnly,
      request_id: requestId
    });

    return promise;
  }
}

module.exports = ExecutionStore;
