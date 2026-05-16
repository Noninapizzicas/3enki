'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
class ConversationExportModule extends BaseModule {
  constructor() {
    super();
    this.name = 'conversation-export';
    this.version = '2.0.0';
    this.config = null;
    this.token = null;

    this.activityBuffer = [];
    this.MAX_BUFFER = 1000;

    this.pendingDbRequests = new Map();
    // request_id → { agent_name, task, conversation_id, project_id, user_id,
    //                correlation_id, started_at }
    // Buffer in-memory de agent.execute.request para correlacionar con
    // response/failed posterior y persistir fila completa en agent_executions.
    this.pendingAgentRequests = new Map();
    // Set de project_ids donde ya creamos la tabla agent_executions on-demand.
    this._agentExecTableEnsured = new Set();

    this._activityUnsub = null;
    this._agentFailedUnsub = null;
    this._agentCompletedUnsub = null;
    this._dbResponseUnsub = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};

    this.token = this.config.token || process.env.CONVERSATION_EXPORT_TOKEN || null;
    if (!this.token) {
      this.logger.warn('conversation-export.no_token', {
        module: this.name,
        message: 'No auth token configured. All endpoints will reject requests.'
      });
    }

    this._activityUnsub = await this.eventBus.subscribe('activity.logged', (event) => {
      this._bufferActivity(event?.data || event?.payload || event);
    });

    this._agentFailedUnsub = await this.eventBus.subscribe('agent.failed', (event) => {
      const data = event?.data || event?.payload || event;
      this._bufferActivity({
        timestamp: new Date().toISOString(),
        type: 'AGENT_FAILURE',
        module: 'agent-bridge',
        action: `agent.${data.agent_name || 'unknown'}.failed`,
        outcome: 'failure',
        conversation_id: data.conversation_id || null,
        ctx: {
          agent_name: data.agent_name,
          error: data.error,
          pipelineId: data.pipelineId
        }
      });
    });

    this._agentCompletedUnsub = await this.eventBus.subscribe('agent.completed', (event) => {
      const data = event?.data || event?.payload || event;
      this._bufferActivity({
        timestamp: new Date().toISOString(),
        type: 'AGENT_COMPLETED',
        module: 'agent-bridge',
        action: `agent.${data.agent_name || 'unknown'}.completed`,
        outcome: 'success',
        conversation_id: data.conversation_id || null,
        ctx: {
          agent_name: data.agent_name,
          result_summary: typeof data.result === 'string'
            ? data.result.slice(0, 500)
            : JSON.stringify(data.result || '').slice(0, 500),
          pipelineId: data.pipelineId
        }
      });
    });

    this._dbResponseUnsub = await this.eventBus.subscribe('db.query.response', (event) => {
      this._onDbQueryResponse(event);
    });

    // agent-flow.contract: persistir agent_executions (cierra writer
    // huérfano que el endpoint de export ya consultaba).
    this._agentReqUnsub = await this.eventBus.subscribe('agent.execute.request', (event) => {
      this.onAgentExecuteRequest(event);
    });
    this._agentResUnsub = await this.eventBus.subscribe('agent.execute.response', (event) => {
      this.onAgentExecuteResponse(event);
    });
    this._agentFailUnsub = await this.eventBus.subscribe('agent.execute.failed', (event) => {
      this.onAgentExecuteFailed(event);
    });

    // Observabilidad del flow LEGACY invoke_agent (tool del LLM en
    // ai-gateway agentic loop). Por decision documentada en
    // ai-agent-framework/module.json, ese flow NO emite eventos
    // agent.execute.* canonicos — mantiene su propio shape. Aqui lo
    // capturamos y normalizamos al mismo shape para persistir en la
    // tabla agent_executions, asi observabilidad uniforme con
    // independencia del entry point.
    this._invokeAgentUnsub = await this.eventBus.subscribe('invoke_agent', (event) => {
      this.onInvokeAgentRequest(event);
    });
    this._invokeAgentResUnsub = await this.eventBus.subscribe('invoke_agent.response', (event) => {
      this.onInvokeAgentResponse(event);
    });

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      token_configured: !!this.token
    });
  }

  async onUnload() {
    if (this._activityUnsub) { await this._activityUnsub(); this._activityUnsub = null; }
    if (this._agentFailedUnsub) { await this._agentFailedUnsub(); this._agentFailedUnsub = null; }
    if (this._agentCompletedUnsub) { await this._agentCompletedUnsub(); this._agentCompletedUnsub = null; }
    if (this._dbResponseUnsub) { await this._dbResponseUnsub(); this._dbResponseUnsub = null; }
    if (this._agentReqUnsub) { await this._agentReqUnsub(); this._agentReqUnsub = null; }
    if (this._agentResUnsub) { await this._agentResUnsub(); this._agentResUnsub = null; }
    if (this._agentFailUnsub) { await this._agentFailUnsub(); this._agentFailUnsub = null; }
    if (this._invokeAgentUnsub) { await this._invokeAgentUnsub(); this._invokeAgentUnsub = null; }
    if (this._invokeAgentResUnsub) { await this._invokeAgentResUnsub(); this._invokeAgentResUnsub = null; }

    for (const [, req] of this.pendingDbRequests.entries()) {
      clearTimeout(req.timeout);
      req.reject(new Error('Module unloaded'));
    }
    this.pendingDbRequests.clear();
    this.pendingAgentRequests.clear();
    this._agentExecTableEnsured.clear();
    this.activityBuffer = [];

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // POC2 Helpers
  // ==========================================

  _errorResponse(status, code, message, details) {
    const r = { status, error: { code, message } };
    if (details !== undefined) r.error.details = details;
    return r;
  }

  _classifyHandlerError(error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('sin sesiones')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('requerido') || msg.includes('missing field')) return 'MISSING_FIELD';
    if (msg.includes('invalid') || msg.includes('invalido')) return 'INVALID_INPUT';
    if (msg.includes('timeout')) return 'TIMEOUT';
    return 'UNKNOWN_ERROR';
  }

  _handleHandlerError(eventName, error, kind) {
    const code = error._code || this._classifyHandlerError(error);
    const details = error._details;
    const statusMap = {
      RESOURCE_NOT_FOUND: 404,
      MISSING_FIELD: 400,
      INVALID_INPUT: 400,
      AUTHENTICATION_REQUIRED: 401,
      PERMISSION_DENIED: 403,
      DEPENDENCY_UNAVAILABLE: 503,
      TIMEOUT: 504,
      UNKNOWN_ERROR: 500
    };
    const status = statusMap[code] || 500;
    const level = status < 500 ? 'warn' : 'error';
    this.logger[level](eventName, { module: this.name, code, kind, error: error.message });
    this.metrics?.increment(`${this.name}.handler_error`, { code, kind });
    return this._errorResponse(status, code, error.message, details);
  }

  async _publicarEvento(event, payload, opts = {}) {
    const correlationId = opts.correlation_id || crypto.randomUUID();
    return this.eventBus.publish(event, {
      ...payload,
      correlation_id: correlationId,
      timestamp: new Date().toISOString()
    });
  }

  _buildCorrelationId() {
    return crypto.randomUUID();
  }

  // ==========================================
  // Auth (internal — returns Error or null)
  // ==========================================

  _checkAuth(req) {
    if (!this.token) {
      return Object.assign(new Error('Auth token not configured on server'), {
        _code: 'DEPENDENCY_UNAVAILABLE'
      });
    }
    const provided = req.query?.token
      || req.headers?.['x-token']
      || req.headers?.['authorization']?.replace(/^Bearer\s+/, '');
    if (!provided) {
      return Object.assign(new Error('Missing token. Use ?token=... or X-Token header'), {
        _code: 'AUTHENTICATION_REQUIRED'
      });
    }
    if (provided !== this.token) {
      return Object.assign(new Error('Invalid token'), {
        _code: 'PERMISSION_DENIED'
      });
    }
    return null;
  }

  // ==========================================
  // HTTP Handlers
  // ==========================================

  async handleListSessions(req, res) {
    const correlationId = this._buildCorrelationId();
    try {
      const authErr = this._checkAuth(req);
      if (authErr) return this._handleHandlerError('conversation-export.list_sessions.auth', authErr, 'auth');

      const projectId = req.params?.project_id;
      if (!projectId) {
        return this._handleHandlerError(
          'conversation-export.list_sessions.validation',
          Object.assign(new Error('project_id required'), { _code: 'MISSING_FIELD' }),
          'validation'
        );
      }

      const limit = parseInt(req.query?.limit) || 20;
      const sessions = await this._loadSessionsFromDB(projectId, limit, correlationId);
      return { status: 200, data: { project_id: projectId, count: sessions.length, sessions } };
    } catch (error) {
      return this._handleHandlerError('conversation-export.list_sessions.failed', error, 'internal');
    }
  }

  async handleGetSession(req, res) {
    const correlationId = this._buildCorrelationId();
    try {
      const authErr = this._checkAuth(req);
      if (authErr) return this._handleHandlerError('conversation-export.get_session.auth', authErr, 'auth');

      const sessionId = req.params?.session_id;
      const projectId = req.query?.project_id;
      const verbose = req.query?.verbose === 'true';

      if (!sessionId) {
        return this._handleHandlerError(
          'conversation-export.get_session.validation',
          Object.assign(new Error('session_id required'), { _code: 'MISSING_FIELD' }),
          'validation'
        );
      }
      if (!projectId) {
        return this._handleHandlerError(
          'conversation-export.get_session.validation',
          Object.assign(new Error('project_id required (query param)'), { _code: 'MISSING_FIELD' }),
          'validation'
        );
      }

      const data = await this._buildSessionExport(projectId, sessionId, verbose, correlationId);
      return { status: 200, data };
    } catch (error) {
      return this._handleHandlerError('conversation-export.get_session.failed', error, 'internal');
    }
  }

  async handleGetLatest(req, res) {
    const correlationId = this._buildCorrelationId();
    try {
      const authErr = this._checkAuth(req);
      if (authErr) return this._handleHandlerError('conversation-export.get_latest.auth', authErr, 'auth');

      const projectId = req.params?.project_id;
      const verbose = req.query?.verbose === 'true';

      if (!projectId) {
        return this._handleHandlerError(
          'conversation-export.get_latest.validation',
          Object.assign(new Error('project_id required'), { _code: 'MISSING_FIELD' }),
          'validation'
        );
      }

      const sessions = await this._loadSessionsFromDB(projectId, 1, correlationId);
      if (sessions.length === 0) {
        return this._handleHandlerError(
          'conversation-export.get_latest.not_found',
          Object.assign(new Error(`No sessions in project "${projectId}"`), {
            _code: 'RESOURCE_NOT_FOUND',
            _details: { entity_type: 'session', project_id: projectId }
          }),
          'domain'
        );
      }

      const data = await this._buildSessionExport(projectId, sessions[0].id, verbose, correlationId);
      return { status: 200, data };
    } catch (error) {
      return this._handleHandlerError('conversation-export.get_latest.failed', error, 'internal');
    }
  }

  async handleHealth(req, res) {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        token_configured: !!this.token,
        activity_buffer: this.activityBuffer.length
      }
    };
  }

  // ==========================================
  // Activity buffer
  // ==========================================

  _bufferActivity(entry) {
    this.activityBuffer.push(entry);
    if (this.activityBuffer.length > this.MAX_BUFFER) {
      this.activityBuffer.shift();
    }
  }

  _filterActivityBuffer(timeWindow) {
    if (!timeWindow) return [...this.activityBuffer];
    return this.activityBuffer.filter(entry => {
      if (!entry.timestamp) return true;
      const ts = new Date(entry.timestamp).getTime();
      return ts >= timeWindow.start && ts <= timeWindow.end;
    });
  }

  // ==========================================
  // DB via events (RPC-over-pubsub — required by db.query.* architecture)
  // ==========================================

  _onDbQueryResponse(event) {
    const data = event?.data || event;
    const { request_id, success, data: rows, error } = data;
    const pending = this.pendingDbRequests.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDbRequests.delete(request_id);
    if (success) pending.resolve(rows || []);
    else pending.reject(new Error(error || 'DB query failed'));
  }

  async _queryDB(projectId, query, params = [], correlationId) {
    const requestId = crypto.randomUUID();
    const timeout = this.config.db_timeout_ms || 8000;

    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingDbRequests.delete(requestId);
        this.logger.error('conversation-export.db_query.timeout', {
          module: this.name, requestId, projectId
        });
        this.metrics?.increment(`${this.name}.db_query_timeout`);
        reject(Object.assign(new Error('DB query timeout'), { _code: 'TIMEOUT' }));
      }, timeout);
      this.pendingDbRequests.set(requestId, { resolve, reject, timeout: timeoutId });
    });

    await this.eventBus.publish('db.query.request', {
      project_id: projectId,
      query,
      params,
      read_only: true,
      request_id: requestId,
      correlation_id: correlationId || this._buildCorrelationId()
    });

    return promise;
  }

  /**
   * Variante write: usa db.query.request con read_only:false. database-manager
   * persiste el cambio (autoSave) tras ejecutar.
   */
  async _writeDB(projectId, query, params = [], correlationId) {
    const requestId = crypto.randomUUID();
    const timeout = this.config.db_timeout_ms || 8000;

    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingDbRequests.delete(requestId);
        reject(Object.assign(new Error('DB write timeout'), { _code: 'TIMEOUT' }));
      }, timeout);
      this.pendingDbRequests.set(requestId, { resolve, reject, timeout: timeoutId });
    });

    await this.eventBus.publish('db.query.request', {
      project_id: projectId,
      query,
      params,
      read_only: false,
      request_id: requestId,
      correlation_id: correlationId || this._buildCorrelationId()
    });

    return promise;
  }

  // ==========================================
  // Agent executions persistence (agent-flow.contract)
  // ==========================================

  /**
   * Crea la tabla agent_executions on-demand para un proyecto. Idempotente
   * via _agentExecTableEnsured set. Schema cubre los campos canonicos del
   * agent.execute.{request,response,failed} sin truncar nada.
   */
  async _ensureAgentExecutionsTable(projectId, correlationId) {
    if (this._agentExecTableEnsured.has(projectId)) return;
    try {
      await this._writeDB(projectId, `
        CREATE TABLE IF NOT EXISTS agent_executions (
          id TEXT PRIMARY KEY,
          request_id TEXT,
          correlation_id TEXT,
          conversation_id TEXT,
          project_id TEXT,
          user_id TEXT,
          agent_name TEXT NOT NULL,
          task TEXT,
          status TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          tokens TEXT,
          cost TEXT,
          duration_ms INTEGER,
          iterations INTEGER,
          finish_reason TEXT,
          result TEXT,
          error TEXT,
          started_at INTEGER NOT NULL,
          completed_at INTEGER
        )
      `, [], correlationId);
      // Índices útiles para el SELECT por conversation_id ASC started_at
      await this._writeDB(projectId,
        `CREATE INDEX IF NOT EXISTS idx_agent_exec_conv ON agent_executions(conversation_id, started_at)`,
        [], correlationId);
      this._agentExecTableEnsured.add(projectId);
    } catch (err) {
      this.logger.warn('conversation-export.agent_executions.table_create.failed', {
        project_id: projectId, error: err.message
      });
    }
  }

  /**
   * agent.execute.request → buffer in-memory para correlacionar con la
   * response/failed posterior. No escribe a DB todavía: la fila completa
   * se persiste cuando el ciclo se cierra.
   */
  async onAgentExecuteRequest(event) {
    try {
      const data = event?.data || event;
      if (!data?.request_id || !data?.agent_name) return;
      this.pendingAgentRequests.set(data.request_id, {
        agent_name: data.agent_name,
        task: typeof data.task === 'string' ? data.task : JSON.stringify(data.task ?? null),
        conversation_id: data.conversation_id || null,
        project_id: data.project_id || null,
        user_id: data.user_id || 'default',
        correlation_id: data.correlation_id || null,
        started_at: Date.now()
      });
    } catch (err) {
      this.logger.warn('conversation-export.agent_request.error', { error: err.message });
    }
  }

  async onAgentExecuteResponse(event) {
    try {
      const data = event?.data || event;
      if (!data?.request_id) return;
      const projectId = data.project_id || this.pendingAgentRequests.get(data.request_id)?.project_id;
      if (!projectId) return;
      await this._ensureAgentExecutionsTable(projectId, data.correlation_id);

      const buffered = this.pendingAgentRequests.get(data.request_id) || {};
      this.pendingAgentRequests.delete(data.request_id);

      const completedAt = Date.now();
      const startedAt = buffered.started_at || (completedAt - (data.duration_ms || 0));

      const result = data.result;
      const resultStr = typeof result === 'string'
        ? result
        : (result == null ? null : JSON.stringify(result));

      await this._writeDB(projectId, `
        INSERT OR REPLACE INTO agent_executions (
          id, request_id, correlation_id, conversation_id, project_id, user_id,
          agent_name, task, status, provider, model, tokens, cost,
          duration_ms, iterations, finish_reason, result, error,
          started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        crypto.randomUUID(),
        data.request_id,
        data.correlation_id || buffered.correlation_id || null,
        data.conversation_id || buffered.conversation_id || null,
        projectId,
        data.user_id || buffered.user_id || 'default',
        data.agent_name || buffered.agent_name,
        buffered.task || null,
        'success',
        data.provider || null,
        data.model || null,
        data.tokens ? JSON.stringify(data.tokens) : null,
        data.cost ? JSON.stringify(data.cost) : null,
        typeof data.duration_ms === 'number' ? data.duration_ms : null,
        typeof data.iterations === 'number' ? data.iterations : null,
        data.finish_reason || null,
        resultStr,
        null,
        startedAt,
        completedAt
      ], data.correlation_id);
      this.metrics?.increment('conversation-export.agent_executions.persisted', { status: 'success' });
    } catch (err) {
      this.logger.warn('conversation-export.agent_response.persist.failed', {
        request_id: event?.data?.request_id, error: err.message
      });
      this.metrics?.increment('conversation-export.agent_executions.persist_failed');
    }
  }

  /**
   * LEGACY invoke_agent flow: ai-gateway emite el evento `invoke_agent`
   * (tool del LLM) con data: { request_id, agent_name, task, ... }.
   * Bufferamos igual que agent.execute.request — la response llegara como
   * `invoke_agent.response` con shape distinto.
   */
  async onInvokeAgentRequest(event) {
    try {
      const data = event?.data || event;
      if (!data?.request_id || !data?.agent_name) return;
      // No duplicar si ya hay una entry canonica
      if (this.pendingAgentRequests.has(data.request_id)) return;
      this.pendingAgentRequests.set(data.request_id, {
        agent_name: data.agent_name,
        task: typeof data.task === 'string' ? data.task : JSON.stringify(data.task ?? null),
        conversation_id: data.conversation_id || null,
        project_id: data.project_id || data.context?.project_id || null,
        user_id: data.user_id || 'default',
        correlation_id: data.correlation_id || null,
        started_at: Date.now(),
        shape: 'legacy'
      });
    } catch (err) {
      this.logger.warn('conversation-export.invoke_agent_request.error', { error: err.message });
    }
  }

  /**
   * LEGACY invoke_agent.response shape:
   *   { request_id, session_id, result: { agent, content, tool_calls_executed } }
   *   o { request_id, session_id, error: { code, message } } cuando falla.
   * Lo normalizamos al row de agent_executions con los datos disponibles
   * (el flow legacy no lleva provider/model/tokens — quedan nulos).
   */
  async onInvokeAgentResponse(event) {
    try {
      const data = event?.data || event;
      if (!data?.request_id) return;
      const buffered = this.pendingAgentRequests.get(data.request_id);
      if (!buffered) return;
      const projectId = buffered.project_id;
      if (!projectId) return;
      this.pendingAgentRequests.delete(data.request_id);
      await this._ensureAgentExecutionsTable(projectId, buffered.correlation_id);

      const completedAt = Date.now();
      const startedAt = buffered.started_at || completedAt;
      const hasError = !!data.error;
      const content = data.result?.content;
      const toolCalls = data.result?.tool_calls_executed || [];

      const resultStr = hasError ? null : (
        content == null ? null
          : (typeof content === 'string' ? content : JSON.stringify(content))
      );

      // Si vienen tool_calls los serializamos junto al result para no perder
      // el rastro de orquestacion interna del agente.
      const resultPayload = hasError ? null : JSON.stringify({
        content: content ?? null,
        tool_calls_executed: toolCalls
      });

      await this._writeDB(projectId, `
        INSERT OR REPLACE INTO agent_executions (
          id, request_id, correlation_id, conversation_id, project_id, user_id,
          agent_name, task, status, provider, model, tokens, cost,
          duration_ms, iterations, finish_reason, result, error,
          started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        crypto.randomUUID(),
        data.request_id,
        buffered.correlation_id || null,
        buffered.conversation_id || null,
        projectId,
        buffered.user_id || 'default',
        buffered.agent_name,
        buffered.task || null,
        hasError ? 'failed' : 'success',
        null, null, null, null,
        completedAt - startedAt,
        null, null,
        resultPayload || resultStr,
        hasError ? JSON.stringify(data.error) : null,
        startedAt,
        completedAt
      ], buffered.correlation_id);
      this.metrics?.increment('conversation-export.agent_executions.persisted', {
        status: hasError ? 'failed' : 'success', shape: 'legacy'
      });
    } catch (err) {
      this.logger.warn('conversation-export.invoke_agent_response.persist.failed', {
        request_id: event?.data?.request_id, error: err.message
      });
      this.metrics?.increment('conversation-export.agent_executions.persist_failed');
    }
  }

  async onAgentExecuteFailed(event) {
    try {
      const data = event?.data || event;
      if (!data?.request_id) return;
      const projectId = data.project_id || this.pendingAgentRequests.get(data.request_id)?.project_id;
      if (!projectId) return;
      await this._ensureAgentExecutionsTable(projectId, data.correlation_id);

      const buffered = this.pendingAgentRequests.get(data.request_id) || {};
      this.pendingAgentRequests.delete(data.request_id);

      const completedAt = Date.now();
      const startedAt = buffered.started_at || (completedAt - (data.duration_ms || 0));

      await this._writeDB(projectId, `
        INSERT OR REPLACE INTO agent_executions (
          id, request_id, correlation_id, conversation_id, project_id, user_id,
          agent_name, task, status, provider, model, tokens, cost,
          duration_ms, iterations, finish_reason, result, error,
          started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        crypto.randomUUID(),
        data.request_id,
        data.correlation_id || buffered.correlation_id || null,
        data.conversation_id || buffered.conversation_id || null,
        projectId,
        data.user_id || buffered.user_id || 'default',
        data.agent_name || buffered.agent_name,
        buffered.task || null,
        'failed',
        data.provider_attempted || null,
        null,
        null,
        null,
        typeof data.duration_ms === 'number' ? data.duration_ms : null,
        typeof data.iterations_completed === 'number' ? data.iterations_completed : null,
        null,
        null,
        data.error ? JSON.stringify(data.error) : null,
        startedAt,
        completedAt
      ], data.correlation_id);
      this.metrics?.increment('conversation-export.agent_executions.persisted', { status: 'failed' });
    } catch (err) {
      this.logger.warn('conversation-export.agent_failed.persist.failed', {
        request_id: event?.data?.request_id, error: err.message
      });
      this.metrics?.increment('conversation-export.agent_executions.persist_failed');
    }
  }

  // ==========================================
  // Data loaders
  // ==========================================

  async _loadSessionsFromDB(projectId, limit = 20, correlationId) {
    const rows = await this._queryDB(
      projectId,
      `SELECT id, project_id, title, created_at, updated_at, message_count
       FROM conversations
       ORDER BY updated_at DESC
       LIMIT ?`,
      [limit],
      correlationId
    );
    return rows || [];
  }

  async _loadMessagesFromDB(projectId, sessionId, correlationId) {
    const rows = await this._queryDB(
      projectId,
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      [sessionId],
      correlationId
    );
    return rows || [];
  }

  async _loadLogsForSession(sessionId, timeWindow) {
    const logsPath = path.resolve(process.cwd(), './data/logs/sessions');
    try {
      const files = await fs.readdir(logsPath);
      const matchingFiles = files.filter(f =>
        f.includes(sessionId) || f.endsWith('.jsonl') || f.endsWith('.log')
      );
      const logs = [];
      for (const file of matchingFiles.slice(0, 5)) {
        try {
          const content = await fs.readFile(path.join(logsPath, file), 'utf-8');
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              if (timeWindow && entry.timestamp) {
                const ts = new Date(entry.timestamp).getTime();
                if (ts < timeWindow.start || ts > timeWindow.end) continue;
              }
              logs.push(entry);
            } catch (_) {}
          }
        } catch (err) {
          this.logger.debug('conversation-export.log_file.read_failed', {
            module: this.name, file, error: err.message
          });
          this.metrics?.increment(`${this.name}.log_file_read_failed`);
        }
      }
      return logs;
    } catch (err) {
      this.logger.debug('conversation-export.logs.not_available', {
        module: this.name, error: err.message
      });
      return [];
    }
  }

  async _loadAgentExecutions(projectId, sessionId, correlationId) {
    try {
      const rows = await this._queryDB(
        projectId,
        `SELECT id, request_id, correlation_id, agent_name, task, status,
                provider, model, tokens, cost, duration_ms, iterations,
                finish_reason, result, error, started_at, completed_at
         FROM agent_executions
         WHERE conversation_id = ?
         ORDER BY started_at ASC`,
        [sessionId],
        correlationId
      );
      const parseJson = v => {
        if (v == null || v === '') return null;
        try { return JSON.parse(v); } catch { return v; }
      };
      return (rows || []).map(row => ({
        ...row,
        result: parseJson(row.result),
        tokens: parseJson(row.tokens),
        cost: parseJson(row.cost),
        error: parseJson(row.error)
      }));
    } catch (err) {
      this.logger.debug('conversation-export.agent_executions.not_available', {
        module: this.name, sessionId, error: err.message
      });
      this.metrics?.increment(`${this.name}.agent_executions_load_failed`);
      return [];
    }
  }

  async _loadConversationMetadata(projectId, sessionId, correlationId) {
    try {
      const rows = await this._queryDB(
        projectId,
        `SELECT metadata FROM conversations WHERE id = ? LIMIT 1`,
        [sessionId],
        correlationId
      );
      if (!rows || rows.length === 0) return null;
      const raw = rows[0]?.metadata;
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      this.logger.debug('conversation-export.conversation_metadata.not_available', {
        module: this.name, sessionId, error: err.message
      });
      this.metrics?.increment(`${this.name}.metadata_load_failed`);
      return null;
    }
  }

  // ==========================================
  // Export assembly
  // ==========================================

  async _buildSessionExport(projectId, sessionId, verbose = false, correlationId) {
    const [messages, agentExecutions, conversationMeta] = await Promise.all([
      this._loadMessagesFromDB(projectId, sessionId, correlationId),
      this._loadAgentExecutions(projectId, sessionId, correlationId),
      this._loadConversationMetadata(projectId, sessionId, correlationId)
    ]);

    let timeWindow = null;
    if (messages.length > 0) {
      const first = messages[0].created_at || messages[0].timestamp;
      const last = messages[messages.length - 1].created_at || messages[messages.length - 1].timestamp;
      if (first && last) {
        timeWindow = {
          start: new Date(first).getTime() - 60000,
          end: new Date(last).getTime() + 300000
        };
      }
    }

    const systemLogs = await this._loadLogsForSession(sessionId, timeWindow);
    const activity = this._filterActivityBuffer(timeWindow);
    const timeline = this._buildTimeline(messages, systemLogs, activity, agentExecutions, verbose);
    const summary = this._buildSummary(messages, timeline, agentExecutions, conversationMeta);

    return {
      _format: 'conversation-export-v2',
      _generated_at: new Date().toISOString(),
      _hint_llm: 'Transcripcion cronologica completa. timeline = mensajes + tool calls + ejecuciones de agentes + errores. agent_executions = historial SQLite de cada agente.',
      project_id: projectId,
      session_id: sessionId,
      conversation_state: conversationMeta?.state || 'unknown',
      summary,
      timeline,
      agent_executions: agentExecutions.length > 0 ? agentExecutions : undefined,
      messages_raw: verbose ? messages : undefined
    };
  }

  _buildTimeline(messages, systemLogs, activity, agentExecutions = [], verbose) {
    const items = [];

    for (const m of messages) {
      items.push({
        _type: 'message',
        ts: m.created_at || m.timestamp,
        role: m.role,
        content: m.content,
        tokens: m.tokens,
        cost: m.cost,
        ...(m.attachments && { attachments: m.attachments }),
        ...(m.metadata && { metadata: m.metadata })
      });
    }

    for (const a of activity) {
      const type = this._classifyActivity(a);
      if (!verbose && type === 'internal_log') continue;
      items.push({
        _type: type,
        ts: a.timestamp,
        module: a.module,
        action: a.action,
        outcome: a.outcome,
        ...(a.ctx && { ctx: a.ctx })
      });
    }

    for (const exec of agentExecutions) {
      items.push({
        _type: 'agent_execution',
        ts: exec.started_at,
        agent_name: exec.agent_name,
        task: exec.task,
        status: exec.status,
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        duration_ms: exec.started_at && exec.completed_at
          ? new Date(exec.completed_at).getTime() - new Date(exec.started_at).getTime()
          : null,
        result_summary: exec.result
          ? (typeof exec.result === 'string' ? exec.result.slice(0, 300) : JSON.stringify(exec.result).slice(0, 300))
          : null,
        error: exec.error || null
      });
    }

    for (const log of systemLogs) {
      if (!verbose && log.level !== 'error' && log.level !== 'warn') continue;
      items.push({
        _type: 'system_log',
        ts: log.timestamp,
        level: log.level,
        module: log.module,
        event: log.event || log.message,
        ...(log.data && { data: log.data })
      });
    }

    items.sort((a, b) => {
      const ta = new Date(a.ts || 0).getTime();
      const tb = new Date(b.ts || 0).getTime();
      return ta - tb;
    });

    return items;
  }

  _classifyActivity(entry) {
    const action = entry.action || '';
    const type = entry.type || '';
    if (action.includes('agent.execute') || action.includes('agent.completed') || action.includes('agent.failed')) {
      return 'agent_event';
    }
    if (type === 'EVENT_FLOW' && action.includes('.request')) return 'tool_call';
    if (type === 'EVENT_FLOW' && action.includes('.response')) return 'tool_response';
    if (entry.outcome === 'failure' || action.includes('error')) return 'error';
    if (type === 'MODULE_ACTION') return 'module_action';
    return 'internal_log';
  }

  _buildSummary(messages, timeline, agentExecutions = [], conversationMeta = null) {
    const counts = {
      messages: messages.length,
      user_messages: messages.filter(m => m.role === 'user').length,
      assistant_messages: messages.filter(m => m.role === 'assistant').length,
      tool_calls: timeline.filter(i => i._type === 'tool_call').length,
      agent_executions: agentExecutions.length,
      agent_completed: agentExecutions.filter(e => e.status === 'completed').length,
      agent_failed: agentExecutions.filter(e => e.status === 'failed').length,
      errors: timeline.filter(i => i._type === 'error').length
    };

    const tokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
    const cost = messages.reduce((sum, m) => sum + (m.cost || 0), 0);
    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];

    return {
      counts,
      tokens,
      cost,
      conversation_state: conversationMeta?.state || 'unknown',
      active_agent: conversationMeta?.active_agent || null,
      started_at: firstMsg?.created_at || firstMsg?.timestamp,
      ended_at: lastMsg?.created_at || lastMsg?.timestamp,
      duration_ms: firstMsg && lastMsg
        ? new Date(lastMsg.created_at || lastMsg.timestamp).getTime() -
          new Date(firstMsg.created_at || firstMsg.timestamp).getTime()
        : null
    };
  }
}

module.exports = ConversationExportModule;
