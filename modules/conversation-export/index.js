/**
 * Conversation Export v1.0.0
 *
 * Expone endpoints HTTP públicos que permiten a un agente externo (ej: Claude)
 * acceder al detalle completo de una conversación: mensajes, tool calls,
 * eventos de agentes, errores.
 *
 * Autenticación: token en query param (?token=X). El token se configura en
 * module.json o se inyecta via config.
 *
 * Fuentes de datos:
 *   - chat-session (SQLite por proyecto): mensajes user/assistant
 *   - log-manager (./data/logs/): eventos del sistema, activity logs
 *   - ActivityLogger en memoria (si disponible): últimos eventos
 *
 * Endpoints:
 *   GET /modules/conversation-export/sessions/:project_id?token=X
 *   GET /modules/conversation-export/session/:session_id?token=X
 *   GET /modules/conversation-export/latest/:project_id?token=X
 */

const path = require('path');
const fs = require('fs').promises;

class ConversationExportModule {
  constructor() {
    this.name = 'conversation-export';
    this.version = '1.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.moduleLoader = null;
    this.config = null;
    this.token = null;

    // Buffer de actividad en memoria (últimos 1000 eventos)
    this.activityBuffer = [];
    this.MAX_BUFFER = 1000;
    this.activityUnsub = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.moduleLoader = context.moduleLoader;
    this.config = context.moduleConfig || {};

    // Token — obligatorio
    this.token = this.config.token || process.env.CONVERSATION_EXPORT_TOKEN || null;
    if (!this.token) {
      this.logger.warn('conversation-export.no_token', {
        message: 'No hay token configurado. El endpoint NO responderá hasta que haya uno. Configura en module.json.config.token o ENV CONVERSATION_EXPORT_TOKEN'
      });
    }

    // Suscribirse a activity.logged para capturar eventos en tiempo real
    this.activityUnsub = await this.eventBus.subscribe('activity.logged', (event) => {
      const entry = event?.data || event?.payload || event;
      this.activityBuffer.push(entry);
      if (this.activityBuffer.length > this.MAX_BUFFER) {
        this.activityBuffer.shift();
      }
    });

    // Suscribirse a eventos críticos con payload completo (errores, failures)
    this.agentFailedUnsub = await this.eventBus.subscribe('agent.*.failed', (event) => {
      const data = event?.data || event?.payload || event;
      this.activityBuffer.push({
        timestamp: new Date().toISOString(),
        type: 'AGENT_FAILURE',
        module: 'ai-agent-framework',
        action: `agent.${data.agent_name || 'unknown'}.failed`,
        outcome: 'failure',
        ctx: {
          agent_name: data.agent_name,
          error: data.error,
          pipelineId: data.pipelineId,
          timestamp: data.timestamp
        }
      });
      if (this.activityBuffer.length > this.MAX_BUFFER) {
        this.activityBuffer.shift();
      }
    });

    this.agentCompletedUnsub = await this.eventBus.subscribe('agent.*.completed', (event) => {
      const data = event?.data || event?.payload || event;
      this.activityBuffer.push({
        timestamp: new Date().toISOString(),
        type: 'AGENT_COMPLETED',
        module: 'ai-agent-framework',
        action: `agent.${data.agent_name || 'unknown'}.completed`,
        outcome: 'success',
        ctx: {
          agent_name: data.agent_name,
          result_summary: typeof data.result === 'string' ? data.result.slice(0, 500) : JSON.stringify(data.result).slice(0, 500),
          pipelineId: data.pipelineId
        }
      });
      if (this.activityBuffer.length > this.MAX_BUFFER) {
        this.activityBuffer.shift();
      }
    });

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      token_configured: !!this.token
    });
  }

  async onUnload() {
    if (this.activityUnsub) await this.activityUnsub();
    if (this.agentFailedUnsub) await this.agentFailedUnsub();
    if (this.agentCompletedUnsub) await this.agentCompletedUnsub();
    this.activityBuffer = [];
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Auth
  // ==========================================

  checkToken(req) {
    if (!this.token) {
      return { ok: false, err: { status: 503, message: 'Token no configurado en el servidor' } };
    }
    const provided = req.query?.token || req.headers?.['x-token'] || req.headers?.['authorization']?.replace(/^Bearer\s+/, '');
    if (!provided) {
      return { ok: false, err: { status: 401, message: 'Falta token. Usar ?token=... o header X-Token' } };
    }
    if (provided !== this.token) {
      return { ok: false, err: { status: 403, message: 'Token inválido' } };
    }
    return { ok: true };
  }

  throwHttp(err) {
    const e = new Error(err.message);
    e.statusCode = err.status;
    throw e;
  }

  // ==========================================
  // HTTP Handlers
  // ==========================================

  /**
   * GET /modules/conversation-export/sessions/:project_id?token=X&limit=20
   */
  async handleListSessions(req, res) {
    const auth = this.checkToken(req);
    if (!auth.ok) this.throwHttp(auth.err);

    const projectId = req.params?.project_id;
    if (!projectId) this.throwHttp({ status: 400, message: 'project_id requerido' });

    const limit = parseInt(req.query?.limit) || 20;

    const sessions = await this.loadSessionsFromChatSession(projectId, limit);
    return {
      project_id: projectId,
      count: sessions.length,
      sessions
    };
  }

  /**
   * GET /modules/conversation-export/session/:session_id?token=X&project_id=Y&verbose=true
   */
  async handleGetSession(req, res) {
    const auth = this.checkToken(req);
    if (!auth.ok) this.throwHttp(auth.err);

    const sessionId = req.params?.session_id;
    const projectId = req.query?.project_id;
    const verbose = req.query?.verbose === 'true';

    if (!sessionId) this.throwHttp({ status: 400, message: 'session_id requerido' });
    if (!projectId) this.throwHttp({ status: 400, message: 'project_id requerido (query param)' });

    return await this.buildSessionExport(projectId, sessionId, verbose);
  }

  /**
   * GET /modules/conversation-export/latest/:project_id?token=X&verbose=true
   */
  async handleGetLatest(req, res) {
    const auth = this.checkToken(req);
    if (!auth.ok) this.throwHttp(auth.err);

    const projectId = req.params?.project_id;
    const verbose = req.query?.verbose === 'true';
    if (!projectId) this.throwHttp({ status: 400, message: 'project_id requerido' });

    const sessions = await this.loadSessionsFromChatSession(projectId, 1);
    if (sessions.length === 0) {
      this.throwHttp({ status: 404, message: `Sin sesiones en proyecto "${projectId}"` });
    }
    return await this.buildSessionExport(projectId, sessions[0].id, verbose);
  }

  /**
   * GET /modules/conversation-export/health
   */
  async handleHealth(req, res) {
    return {
      module: this.name,
      version: this.version,
      token_configured: !!this.token,
      activity_buffer: this.activityBuffer.length
    };
  }

  // ==========================================
  // Data sources
  // ==========================================

  /**
   * Usa chat-session via moduleLoader para listar sesiones.
   * chat-session tiene un método listConversations(project_id, limit).
   */
  async loadSessionsFromChatSession(projectId, limit = 20) {
    const chatSession = this.moduleLoader?.getModule?.('chat-session');
    if (!chatSession?.instance) {
      throw new Error('chat-session module no disponible');
    }

    // Intentar varios métodos posibles
    const instance = chatSession.instance;
    if (typeof instance.listConversations === 'function') {
      const res = await instance.listConversations(projectId, limit);
      return Array.isArray(res) ? res : (res?.data || res?.conversations || []);
    }
    if (typeof instance.toolListar === 'function') {
      const res = await instance.toolListar({ project_id: projectId, limit });
      return res?.data?.conversations || res?.conversations || [];
    }
    if (typeof instance.toolList === 'function') {
      const res = await instance.toolList({ project_id: projectId, limit });
      return res?.data?.conversations || res?.conversations || [];
    }

    // Fallback: leer directo via database-manager
    return await this.loadSessionsFromDB(projectId, limit);
  }

  async loadSessionsFromDB(projectId, limit = 20) {
    const dbManager = this.moduleLoader?.getModule?.('database-manager');
    if (!dbManager?.instance) throw new Error('database-manager no disponible');

    const instance = dbManager.instance;
    if (typeof instance.query !== 'function' && typeof instance.toolQuery !== 'function') {
      throw new Error('database-manager sin método query');
    }

    const queryFn = instance.query || ((args) => instance.toolQuery(args));
    const result = await queryFn.call(instance, {
      project_id: projectId,
      db: 'chat',
      sql: `SELECT id, project_id, title, created_at, updated_at, message_count
            FROM conversations
            ORDER BY updated_at DESC
            LIMIT ?`,
      params: [limit]
    });

    return result?.data?.rows || result?.rows || [];
  }

  async loadMessagesFromChatSession(projectId, sessionId) {
    const chatSession = this.moduleLoader?.getModule?.('chat-session');
    if (!chatSession?.instance) throw new Error('chat-session no disponible');

    const instance = chatSession.instance;
    // chat-session.getMessages(conversationId, inContextOnly=false, correlationId)
    // NOTA: el primer arg es conversationId (session_id), NO project_id
    if (typeof instance.getMessages === 'function') {
      const messages = await instance.getMessages(sessionId, false);
      return Array.isArray(messages) ? messages : (messages?.messages || []);
    }

    // Fallback a DB
    const dbManager = this.moduleLoader?.getModule?.('database-manager');
    if (!dbManager?.instance) return [];

    const queryFn = dbManager.instance.query || ((args) => dbManager.instance.toolQuery(args));
    const result = await queryFn.call(dbManager.instance, {
      project_id: projectId,
      db: 'chat',
      sql: `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      params: [sessionId]
    });
    return result?.data?.rows || result?.rows || [];
  }

  /**
   * Busca en ./data/logs/sessions/ el log de una sesión específica.
   */
  async loadLogsForSession(sessionId, timeWindow) {
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
          // JSONL format
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              // Filtrar por timeWindow si hay
              if (timeWindow && entry.timestamp) {
                const ts = new Date(entry.timestamp).getTime();
                if (ts < timeWindow.start || ts > timeWindow.end) continue;
              }
              logs.push(entry);
            } catch (_) {}
          }
        } catch (_) {}
      }

      return logs;
    } catch (err) {
      this.logger.debug('conversation-export.logs.not_available', { error: err.message });
      return [];
    }
  }

  /**
   * Filtra el buffer de activity en memoria por ventana temporal.
   */
  filterActivityBuffer(timeWindow) {
    if (!timeWindow) return [...this.activityBuffer];
    return this.activityBuffer.filter(entry => {
      if (!entry.timestamp) return true;
      const ts = new Date(entry.timestamp).getTime();
      return ts >= timeWindow.start && ts <= timeWindow.end;
    });
  }

  // ==========================================
  // Build export JSON
  // ==========================================

  async buildSessionExport(projectId, sessionId, verbose = false) {
    // 1. Mensajes
    const messages = await this.loadMessagesFromChatSession(projectId, sessionId);

    // 2. Ventana temporal para buscar eventos relacionados
    let timeWindow = null;
    if (messages.length > 0) {
      const first = messages[0].created_at || messages[0].timestamp;
      const last = messages[messages.length - 1].created_at || messages[messages.length - 1].timestamp;
      if (first && last) {
        timeWindow = {
          start: new Date(first).getTime() - 60000,  // 1min antes
          end: new Date(last).getTime() + 300000     // 5min después
        };
      }
    }

    // 3. Logs del sistema en esa ventana
    const systemLogs = await this.loadLogsForSession(sessionId, timeWindow);

    // 4. Activity buffer en memoria
    const activity = this.filterActivityBuffer(timeWindow);

    // 5. Normalizar y mezclar cronológicamente
    const timeline = this.buildTimeline(messages, systemLogs, activity, verbose);

    // 6. Summary
    const summary = this.buildSummary(messages, timeline);

    return {
      _format: 'conversation-export-v1',
      _generated_at: new Date().toISOString(),
      _hint_llm: 'Este JSON es la transcripción cronológica completa de una conversación. Timeline contiene mensajes + tool calls + eventos agent + errores en orden temporal.',
      project_id: projectId,
      session_id: sessionId,
      summary,
      timeline,
      messages_raw: verbose ? messages : undefined
    };
  }

  buildTimeline(messages, systemLogs, activity, verbose) {
    const items = [];

    // Mensajes
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

    // Activity (tool calls, agent events, errores)
    for (const a of activity) {
      const type = this.classifyActivity(a);
      if (!verbose && type === 'internal_log') continue;  // filtrar ruido si no es verbose
      items.push({
        _type: type,
        ts: a.timestamp,
        module: a.module,
        action: a.action,
        outcome: a.outcome,
        ...(a.ctx && { ctx: a.ctx })
      });
    }

    // System logs
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

    // Orden cronológico
    items.sort((a, b) => {
      const ta = new Date(a.ts || 0).getTime();
      const tb = new Date(b.ts || 0).getTime();
      return ta - tb;
    });

    return items;
  }

  classifyActivity(entry) {
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

  buildSummary(messages, timeline) {
    const counts = {
      messages: messages.length,
      user_messages: messages.filter(m => m.role === 'user').length,
      assistant_messages: messages.filter(m => m.role === 'assistant').length,
      tool_calls: timeline.filter(i => i._type === 'tool_call').length,
      agent_events: timeline.filter(i => i._type === 'agent_event').length,
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
