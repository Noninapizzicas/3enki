const crypto = require('crypto');
const ExecutionStore = require('./core/execution-store');

/**
 * AgentBridge — capa de traducción entre conversation-routing y ai-agent-framework.
 *
 * Problema que resuelve:
 *   - ai-agent-framework usa agent.execute.request + camelCase payload
 *   - Nuestra arquitectura usa agent.execute + snake_case + conversation_id
 *   - El framework no incluye conversation_id en agent.{name}.completed
 *
 * Solución:
 *   1. Recibe agent.execute con conversation_id
 *   2. Genera pipelineId, guarda correlación en inFlight Map
 *   3. Persiste ejecución en SQLite (observabilidad)
 *   4. Reenvía a agent.execute.request (formato framework)
 *   5. Suscribe a agent.{name}.completed con filtro por pipelineId
 *   6. Re-emite agent.completed con conversation_id añadido
 */
class AgentBridgeModule {
  constructor() {
    this.name = 'agent-bridge';
    this.version = '1.0.0';

    this.logger = null;
    this.eventBus = null;
    this.config = null;
    this.activeProjectId = null;

    // pipelineId → { conversation_id, agent_name, unsubCompleted, unsubFailed, timer, projectId }
    this.inFlight = new Map();

    this.store = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    this.store = new ExecutionStore({
      eventBus: this.eventBus,
      logger: this.logger,
      dbTimeout: this.config.db_timeout_ms || 10000
    });

    this.logger.info('agent-bridge.loaded', { module: this.name });
  }

  async onUnload() {
    // Cancelar todas las ejecuciones en vuelo
    for (const [pipelineId, entry] of this.inFlight.entries()) {
      clearTimeout(entry.timer);
      try { entry.unsubCompleted?.(); } catch (_) {}
      try { entry.unsubFailed?.(); } catch (_) {}
      try { entry.unsubProgress?.(); } catch (_) {}
    }
    this.inFlight.clear();
    this.logger.info('agent-bridge.unloaded', { module: this.name });
  }

  // ==========================================
  // Handlers de eventos de conversación
  // ==========================================

  /**
   * Recibe agent.execute y lo reenvía al framework con correlación.
   * Payload esperado: { conversation_id, agent_name, task, project_id?, params? }
   */
  async onAgentExecute(event) {
    const data = event.data || event;
    const { conversation_id, agent_name, task, project_id, params } = data;

    if (!conversation_id || !agent_name) {
      this.logger.warn('agent-bridge.execute.invalid', {
        reason: 'missing conversation_id or agent_name', data
      });
      return;
    }

    const pipelineId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const projectId = project_id || this.activeProjectId;
    const timeoutMs = this.config.execution_timeout_ms || 0; // 0 = sin límite

    // Persistir inicio de ejecución (no bloquea el dispatch)
    if (projectId) {
      this.store.insertExecution(projectId, {
        id: pipelineId, conversation_id, agent_name, task, started_at: startedAt
      });
    }

    // Suscripción dinámica al agente específico, filtrada por pipelineId
    const unsubCompleted = await this.eventBus.subscribe(`agent.${agent_name}.completed`, async (e) => {
      const d = e.data || e;
      if (d.pipelineId !== pipelineId) return;
      await this._onComplete(pipelineId, d.result, projectId);
    });

    const unsubFailed = await this.eventBus.subscribe(`agent.${agent_name}.failed`, async (e) => {
      const d = e.data || e;
      if (d.pipelineId !== pipelineId) return;
      await this._onFail(pipelineId, d.error || 'agent failed', projectId);
    });

    const unsubProgress = await this.eventBus.subscribe(`agent.${agent_name}.progress`, (e) => {
      const d = e.data || e;
      if (d.pipelineId !== pipelineId) return;
      const entry = this.inFlight.get(pipelineId);
      if (!entry) return;
      this.eventBus.publish('agent.progress', {
        conversation_id: entry.conversation_id,
        agent_name: d.agent_name,
        step: d.step,
        message: d.message,
        pipelineId,
        timestamp: d.timestamp
      });
    });

    const timer = timeoutMs > 0
      ? setTimeout(() => this._onTimeout(pipelineId, agent_name, projectId), timeoutMs)
      : null;

    this.inFlight.set(pipelineId, {
      conversation_id, agent_name, unsubCompleted, unsubFailed, unsubProgress, timer, projectId
    });

    // Reenviar al framework con el payload correcto
    await this.eventBus.publish('agent.execute.request', {
      agentName: agent_name,
      context: {
        conversation_id,
        project_id: projectId,
        ...(params || {})
      },
      task,
      pipelineId
    });

    this.logger.info('agent-bridge.dispatched', {
      pipelineId, conversation_id, agent_name,
      task: task?.slice(0, 80)
    });
  }

  // ==========================================
  // Lifecycle del agente
  // ==========================================

  async _onComplete(pipelineId, result, projectId) {
    const entry = this.inFlight.get(pipelineId);
    if (!entry) return;

    clearTimeout(entry.timer);
    entry.unsubCompleted?.();
    entry.unsubFailed?.();
    entry.unsubProgress?.();
    this.inFlight.delete(pipelineId);

    if (projectId) {
      this.store.updateExecution(projectId, pipelineId, 'completed', { result });
    }

    await this.eventBus.publish('agent.completed', {
      conversation_id: entry.conversation_id,
      result,
      domain: entry.agent_name,
      agent_name: entry.agent_name,
      pipelineId
    });

    this.logger.info('agent-bridge.completed', {
      pipelineId,
      conversation_id: entry.conversation_id,
      agent_name: entry.agent_name
    });
  }

  async _onFail(pipelineId, error, projectId) {
    const entry = this.inFlight.get(pipelineId);
    if (!entry) return;

    clearTimeout(entry.timer);
    entry.unsubCompleted?.();
    entry.unsubFailed?.();
    entry.unsubProgress?.();
    this.inFlight.delete(pipelineId);

    if (projectId) {
      this.store.updateExecution(projectId, pipelineId, 'failed', { error });
    }

    await this.eventBus.publish('agent.failed', {
      conversation_id: entry.conversation_id,
      error,
      agent_name: entry.agent_name,
      pipelineId
    });

    this.logger.warn('agent-bridge.failed', {
      pipelineId,
      conversation_id: entry.conversation_id,
      agent_name: entry.agent_name,
      error
    });
  }

  _onTimeout(pipelineId, agent_name, projectId) {
    this.logger.error('agent-bridge.timeout', { pipelineId, agent_name });
    this._onFail(pipelineId, `Agent "${agent_name}" timeout`, projectId);
  }

  // ==========================================
  // Project lifecycle
  // ==========================================

  onDbQueryResponse(event) {
    return this.store.onDbQueryResponse(event);
  }

  async onProjectActivated(event) {
    const data = event.data || event;
    if (data.project_id) this.activeProjectId = data.project_id;
  }

  async onProjectDeactivated(event) {
    const data = event.data || event;
    if (this.activeProjectId === data.project_id) this.activeProjectId = null;
  }

  // ==========================================
  // Observabilidad
  // ==========================================

  getStats() {
    return {
      in_flight: this.inFlight.size,
      executions: Array.from(this.inFlight.values()).map(e => ({
        agent: e.agent_name,
        conversation_id: e.conversation_id
      }))
    };
  }
}

module.exports = AgentBridgeModule;
