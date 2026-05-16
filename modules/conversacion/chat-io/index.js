/**
 * chat-io v2.0.0 — Reescrito al canon (POC2 #10 del horizontal).
 *
 * Entrada/salida del chat + persistencia.
 *
 * IN  (frontend → backend, vía ui_handlers MQTT ui/request/conversation/*)
 *   send / create / list / load / delete / update_settings /
 *   toggle_context / context_stats
 *
 * OUT (backend → frontend / canal)
 *   ai.chat.response (consumido) → guarda mensaje assistant, publica
 *                                  chat.assistant.saved, MQTT push al canal.
 *   ai.chat.failed   (consumido) → traduce error_code a mensaje user-facing,
 *                                  persiste como mensaje 'system'.
 *
 * Persistencia: SQLite por proyecto via database-manager. Tablas
 * conversations + messages.
 *
 * FIFO: cada mensaje activa _applyContextFIFO segun
 * settings.context_window de la conversacion.
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers UI devuelven { status, data | error: { code, message,
 *    details? } }. Codes canonicos (INVALID_INPUT, RESOURCE_NOT_FOUND).
 *    Los codes legacy (PROJECT_REQUIRED, CONVERSATION_REQUIRED,
 *    MESSAGE_ID_REQUIRED) van a error.details.kind para disambiguacion UI.
 *  - observability: log + metric en cada error path. Prefix chat-io.*.
 *    correlation_id propagado en TODOS los publishes.
 *  - events: 2 publishes (chat.message.saved + chat.assistant.saved) con
 *    schema chat-flow.contract v1.0.0.
 *  - lifecycle: onLoad inicializa state; onUnload limpia pendingDb +
 *    knownConversations + schemaReady sin leak.
 *  - persistence: SQLite per-project via database-manager (proyecto del
 *    propio user, no 'system').
 *
 * 5 helpers POC2 transferibles:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar _userMessageForErrorCode (mapeo error -> UX).
 *
 * Monolito (653 LOC) preservado en
 * arquitectura/migracion/_legacy/conversacion__chat-io-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/conversacion__chat-io-mapa.md
 */

'use strict';

const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  context_window INTEGER NOT NULL DEFAULT 20,
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 2000,
  prompt_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  in_context INTEGER NOT NULL DEFAULT 1,
  manually_toggled INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER,
  cost REAL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_context ON messages(conversation_id, in_context);
`.trim();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s) => typeof s === 'string' && UUID_REGEX.test(s);
const defaultSettings = () => ({ context_window: 20, temperature: 0.7, max_tokens: 2000 });
const DB_TIMEOUT_MS = 10000;

class ChatIoModule extends BaseModule {
  constructor() {
    super();
    this.name = 'chat-io';
    this.version = '2.0.0';
    this.mqtt      = null;

    this.pendingDb           = new Map();
    this.schemaReady         = new Set();
    this.knownConversations  = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger    = context.logger;
    this.metrics   = context.metrics;
    this.eventBus  = context.eventBus;
    this.mqtt      = context.uiHandler?.mqtt || context.mqtt || null;

    this.logger.info('chat-io.loading', {
      module: this.name, version: this.version
    });

    this.logger.info('chat-io.loaded');
  }

  async onUnload() {
    this.logger.info('chat-io.unloading', {
      pending_db: this.pendingDb.size,
      cached_conversations: this.knownConversations.size,
      schema_ready_projects: this.schemaReady.size
    });

    const pending = Array.from(this.pendingDb.values());
    this.pendingDb.clear();
    for (const { timeout, reject } of pending) {
      clearTimeout(timeout);
      try { reject(new Error('Module unloading')); }
      catch (_) { this.metrics?.increment('chat-io.errors', { kind: 'unload_reject' }); }
    }
    this.knownConversations.clear();
    this.schemaReady.clear();
  }

  // ==========================================
  // DB helper (event-driven request/response)
  // ==========================================

  async _db(project_id, query, params = [], read_only = false) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        this.metrics?.increment('chat-io.errors', { kind: 'db_timeout' });
        reject(new Error(`db timeout: ${query.slice(0, 40)}`));
      }, DB_TIMEOUT_MS);
      this.pendingDb.set(request_id, { resolve, reject, timeout });
      Promise.resolve(this.eventBus.publish('db.query.request', {
        project_id, query, params, read_only, request_id
      })).catch(err => {
        clearTimeout(timeout);
        this.pendingDb.delete(request_id);
        this.metrics?.increment('chat-io.errors', { kind: 'db_publish' });
        reject(err);
      });
    });
  }

  onDbQueryResponse(event) {
    const payload = event.data || event;
    const { request_id, error } = payload;
    const pending = this.pendingDb.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDb.delete(request_id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(payload.data ?? payload.rows ?? []);
  }

  async _ensureSchema(project_id) {
    if (this.schemaReady.has(project_id)) return;
    for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
      await this._db(project_id, stmt, []);
    }
    await this._migrateSchema(project_id);
    this.schemaReady.add(project_id);
  }

  async _migrateSchema(project_id) {
    const migrations = [
      { table: 'conversations', column: 'prompt_id',        def: 'TEXT' },
      { table: 'conversations', column: 'context_window',   def: 'INTEGER DEFAULT 20' },
      { table: 'conversations', column: 'temperature',      def: 'REAL DEFAULT 0.7' },
      { table: 'conversations', column: 'max_tokens',       def: 'INTEGER DEFAULT 2000' },
      { table: 'messages',      column: 'in_context',       def: 'INTEGER DEFAULT 1' },
      { table: 'messages',      column: 'manually_toggled', def: 'INTEGER DEFAULT 0' },
      { table: 'messages',      column: 'tokens',           def: 'INTEGER' },
      { table: 'messages',      column: 'cost',             def: 'REAL' },
      { table: 'messages',      column: 'metadata',         def: 'TEXT' }
    ];
    for (const m of migrations) {
      try {
        const cols = await this._db(project_id, `PRAGMA table_info(${m.table})`, [], true);
        const exists = cols.some(c => c.name === m.column);
        if (!exists) {
          await this._db(project_id, `ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.def}`, []);
          this.logger.info('chat-io.schema.migrated', { project_id, table: m.table, column: m.column });
        }
      } catch (err) {
        this.logger.debug('chat-io.schema.migrate.skip', { project_id, table: m.table, column: m.column, error: err.message });
      }
    }
  }

  onProjectActivated(event) {
    const { project_id } = event.data || event;
    if (!project_id) return;
    this._ensureSchema(project_id).catch(err => {
      this.logger.warn('chat-io.schema.failed', { project_id, error: err.message });
      this.metrics?.increment('chat-io.errors', { kind: 'schema_init' });
    });
  }

  // ==========================================
  // Internals: validation + serialization + FIFO
  // ==========================================

  async _validateConversation(project_id, conversation_id) {
    if (this.knownConversations.get(conversation_id) === project_id) return true;
    const rows = await this._db(project_id,
      'SELECT id FROM conversations WHERE id = ? AND project_id = ? LIMIT 1',
      [conversation_id, project_id], true
    );
    if (rows.length === 0) return false;
    this.knownConversations.set(conversation_id, project_id);
    return true;
  }

  _toIso(v) {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? new Date(n).toISOString() : null;
  }

  _serializeConversation(row) {
    if (!row) return null;
    return {
      ...row,
      created_at: this._toIso(row.created_at),
      updated_at: this._toIso(row.updated_at),
      message_count: row.message_count ?? 0
    };
  }

  async _applyContextFIFO(project_id, conversation_id, context_window) {
    const countRows = await this._db(project_id,
      'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND in_context = 1',
      [conversation_id], true
    );
    const active = countRows[0]?.n || 0;
    if (active < context_window) return;

    const oldest = await this._db(project_id,
      `SELECT id FROM messages
       WHERE conversation_id = ? AND in_context = 1 AND manually_toggled = 0
       ORDER BY created_at ASC LIMIT ?`,
      [conversation_id, active - context_window + 1], true
    );

    for (const { id } of oldest) {
      await this._db(project_id, 'UPDATE messages SET in_context = 0 WHERE id = ?', [id]);
    }
  }

  // ==========================================
  // Validators internos (lanzan con _code canonico)
  // ==========================================

  _requireProject(project_id) {
    if (!project_id || !isUUID(project_id)) {
      throw Object.assign(new Error('project_id is required and must be a UUID'),
        { _code: 'INVALID_INPUT',
          _details: { kind: 'PROJECT_REQUIRED', field: 'project_id', user_message: 'Selecciona un proyecto para chatear' } });
    }
  }

  _requireConversation(conversation_id) {
    if (!conversation_id || !isUUID(conversation_id)) {
      throw Object.assign(new Error('conversation_id is required and must be a UUID'),
        { _code: 'INVALID_INPUT',
          _details: { kind: 'CONVERSATION_REQUIRED', field: 'conversation_id', user_message: 'Selecciona o crea una conversacion' } });
    }
  }

  async _requireExistingConversation(project_id, conversation_id) {
    if (!(await this._validateConversation(project_id, conversation_id))) {
      throw Object.assign(new Error('Conversation not found in project'),
        { _code: 'RESOURCE_NOT_FOUND',
          _details: { kind: 'CONVERSATION_REQUIRED', entity_type: 'conversation', entity_id: conversation_id,
                      user_message: 'Conversacion no existe o no pertenece al proyecto' } });
    }
  }

  // ==========================================
  // UI handlers
  // ==========================================

  async handleSend(data) {
    try {
      const project_id      = data?.project_id;
      const conversation_id = data?.conversation_id;
      const page_id         = data?.page_id || 'chat';
      const ctx             = data?.context || {};
      const prompt_id       = data?.prompt ?? data?.prompt_id ?? null;
      const attachments     = Array.isArray(data?.attachments) ? data.attachments : [];
      const intencion       = data?.intencion ?? null;
      const user_message    = data?.message ?? data?.user_message;
      const user_id         = data?.user_id || 'default';
      const correlation_id  = data?.correlation_id || crypto.randomUUID();
      const channel         = data?.channel || 'web';
      const channel_context = data?.channel_context || {};

      this._requireProject(project_id);
      this._requireConversation(conversation_id);

      await this._ensureSchema(project_id);
      await this._requireExistingConversation(project_id, conversation_id);

      const convRows = await this._db(project_id,
        'SELECT context_window, temperature, max_tokens FROM conversations WHERE id = ?',
        [conversation_id], true
      );
      const dbSettings = convRows[0] || defaultSettings();
      // Override per-mensaje: el caller (UI / helper de audit) puede pasar
      // provider/model/temperature/etc en data.settings y gana sobre los
      // valores almacenados en la conversacion.
      const settings = { ...dbSettings, ...(data?.settings || {}) };

      const message_id = crypto.randomUUID();
      const now = Date.now();
      await this._db(project_id,
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, 'user', ?, ?)`,
        [message_id, conversation_id, user_message, now]
      );
      await this._db(project_id,
        'UPDATE conversations SET updated_at = ? WHERE id = ?',
        [now, conversation_id]
      );

      await this._applyContextFIFO(project_id, conversation_id, settings.context_window);

      await this._publicarEvento('chat.message.saved', {
        correlation_id,
        conversation_id,
        project_id,
        user_id,
        channel,
        channel_context,
        message_id,
        user_message,
        attachments,
        intencion,
        settings,
        page_id,
        prompt_id,
        page_context: ctx && Object.keys(ctx).length > 0 ? ctx : undefined
      });
      this.metrics?.increment('chat-io.message.sent');

      return { status: 200, data: { conversation_id, message_id, correlation_id } };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.send.failed', err, 'ui_send');
    }
  }

  async handleCreate(data) {
    try {
      const { project_id, title, context_window, temperature, max_tokens, prompt_id } = data || {};
      this._requireProject(project_id);
      await this._ensureSchema(project_id);

      const id = crypto.randomUUID();
      const now = Date.now();
      const s = defaultSettings();
      const finalTitle = title || 'Nueva conversacion';
      const finalCw = context_window || s.context_window;
      const finalT = temperature ?? s.temperature;
      const finalMt = max_tokens || s.max_tokens;

      await this._db(project_id,
        `INSERT INTO conversations
          (id, project_id, title, context_window, temperature, max_tokens, prompt_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, project_id, finalTitle, finalCw, finalT, finalMt, prompt_id || null, now, now]
      );

      this.knownConversations.set(id, project_id);
      this.metrics?.increment('chat-io.conversation.created');

      const conversation = this._serializeConversation({
        id, project_id, title: finalTitle,
        context_window: finalCw, temperature: finalT, max_tokens: finalMt,
        prompt_id: prompt_id || null,
        created_at: now, updated_at: now,
        message_count: 0
      });

      return { status: 201, data: { conversation, conversation_id: id } };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.create.failed', err, 'ui_create');
    }
  }

  async handleList(data) {
    try {
      const { project_id, limit } = data || {};
      this._requireProject(project_id);
      await this._ensureSchema(project_id);

      const rows = await this._db(project_id,
        `SELECT c.id, c.title, c.context_window, c.temperature, c.max_tokens, c.prompt_id,
                c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c
         WHERE c.project_id = ?
         ORDER BY c.updated_at DESC LIMIT ?`,
        [project_id, limit || 50], true
      );
      return {
        status: 200,
        data: { conversations: rows.map(r => this._serializeConversation(r)), count: rows.length }
      };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.list.failed', err, 'ui_list');
    }
  }

  async handleLoad(data) {
    try {
      const { project_id, conversation_id } = data || {};
      this._requireProject(project_id);
      this._requireConversation(conversation_id);
      await this._ensureSchema(project_id);
      await this._requireExistingConversation(project_id, conversation_id);

      const convRows = await this._db(project_id,
        `SELECT c.id, c.project_id, c.title, c.context_window, c.temperature, c.max_tokens, c.prompt_id,
                c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c WHERE c.id = ?`,
        [conversation_id], true
      );
      const rawMessages = await this._db(project_id,
        `SELECT id, role, content, in_context, manually_toggled, tokens, cost, metadata, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
        [conversation_id], true
      );
      const messages = rawMessages.map(m => ({ ...m, created_at: this._toIso(m.created_at) }));
      return {
        status: 200,
        data: { conversation: this._serializeConversation(convRows[0]), messages }
      };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.load.failed', err, 'ui_load');
    }
  }

  async handleDelete(data) {
    try {
      const { project_id, conversation_id } = data || {};
      this._requireProject(project_id);
      this._requireConversation(conversation_id);
      await this._ensureSchema(project_id);

      await this._db(project_id, 'DELETE FROM messages WHERE conversation_id = ?', [conversation_id]);
      await this._db(project_id, 'DELETE FROM conversations WHERE id = ?', [conversation_id]);
      this.knownConversations.delete(conversation_id);
      this.metrics?.increment('chat-io.conversation.deleted');

      return { status: 200, data: { deleted: true, conversation_id } };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.delete.failed', err, 'ui_delete');
    }
  }

  async handleUpdateSettings(data) {
    try {
      const { project_id, conversation_id, context_window, temperature, max_tokens, prompt_id, title } = data || {};
      this._requireProject(project_id);
      this._requireConversation(conversation_id);
      await this._ensureSchema(project_id);
      await this._requireExistingConversation(project_id, conversation_id);

      const sets = [];
      const params = [];
      if (context_window !== undefined) { sets.push('context_window = ?'); params.push(context_window); }
      if (temperature !== undefined)    { sets.push('temperature = ?');    params.push(temperature); }
      if (max_tokens !== undefined)     { sets.push('max_tokens = ?');     params.push(max_tokens); }
      if (prompt_id !== undefined)      { sets.push('prompt_id = ?');      params.push(prompt_id); }
      if (title !== undefined)          { sets.push('title = ?');          params.push(title); }
      if (sets.length === 0) {
        return { status: 200, data: { updated: false, changed: 0 } };
      }
      sets.push('updated_at = ?');
      params.push(Date.now(), conversation_id);
      await this._db(project_id,
        `UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
      this.metrics?.increment('chat-io.conversation.updated');
      return { status: 200, data: { updated: true, changed: sets.length - 1, conversation_id } };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.update_settings.failed', err, 'ui_update_settings');
    }
  }

  async handleToggleContext(data) {
    try {
      const { project_id, message_id, in_context } = data || {};
      this._requireProject(project_id);
      if (!message_id) {
        throw Object.assign(new Error('message_id is required'),
          { _code: 'INVALID_INPUT',
            _details: { kind: 'MESSAGE_ID_REQUIRED', field: 'message_id' } });
      }
      await this._db(project_id,
        'UPDATE messages SET in_context = ?, manually_toggled = 1 WHERE id = ?',
        [in_context ? 1 : 0, message_id]
      );
      return {
        status: 200,
        data: { message_id, in_context: !!in_context, manually_toggled: true }
      };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.toggle_context.failed', err, 'ui_toggle_context');
    }
  }

  async handleContextStats(data) {
    try {
      const { project_id, conversation_id } = data || {};
      this._requireProject(project_id);
      this._requireConversation(conversation_id);

      const stats = await this._db(project_id,
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN in_context = 1 THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN manually_toggled = 1 THEN 1 ELSE 0 END) AS manually_toggled
         FROM messages WHERE conversation_id = ?`,
        [conversation_id], true
      );
      const conv = await this._db(project_id,
        'SELECT context_window FROM conversations WHERE id = ?',
        [conversation_id], true
      );
      const max = conv[0]?.context_window || 20;
      const active = stats[0]?.active || 0;
      return {
        status: 200,
        data: {
          total: stats[0]?.total || 0,
          active,
          manually_toggled: stats[0]?.manually_toggled || 0,
          max_context: max,
          remaining: Math.max(0, max - active)
        }
      };
    } catch (err) {
      return this._handleHandlerError('chat-io.ui.context_stats.failed', err, 'ui_context_stats');
    }
  }

  // ==========================================
  // OUT: ai.chat.response → assistant + MQTT push
  // ==========================================

  async onAiResponse(event) {
    const data = event.data || event;
    const {
      project_id, conversation_id,
      assistant_message,
      message_id_assistant,
      provider, model,
      tokens, cost, duration_ms, finish_reason, iterations,
      tool_calls_executed,
      settings,
      channel, channel_context, correlation_id
    } = data;

    if (!project_id || !conversation_id || !assistant_message) {
      this.logger.warn('chat-io.ai_response.invalid_payload', {
        has_project: !!project_id, has_conv: !!conversation_id, has_message: !!assistant_message,
        correlation_id
      });
      this.metrics?.increment('chat-io.errors', { kind: 'invalid_payload', source: 'ai_response' });
      return;
    }

    const message_id = message_id_assistant || crypto.randomUUID();
    const now = Date.now();
    const tokens_total = tokens?.total ?? null;
    // Persistencia COMPLETA del payload canonico chat-flow.contract v1.1.0:
    //   ai.chat.response.{provider, model, tokens, duration_ms, finish_reason,
    //   iterations, cost, tool_calls_executed}
    // Hasta ahora chat-io descartaba todo excepto tokens.total + nombres de
    // tools — drift con el contrato. Sin esta info los audits y debugging
    // post-hoc trabajan a ciegas (no se sabe que provider/model respondio,
    // ni cuanto costo, ni que args paso al tool).
    const metadataObj = {};
    if (provider) metadataObj.provider = provider;
    if (model) metadataObj.model = model;
    if (tokens && typeof tokens === 'object') metadataObj.tokens = tokens;
    if (typeof duration_ms === 'number') metadataObj.duration_ms = duration_ms;
    if (finish_reason) metadataObj.finish_reason = finish_reason;
    if (typeof iterations === 'number') metadataObj.iterations = iterations;
    if (cost && typeof cost === 'object') metadataObj.cost = cost;
    if (Array.isArray(tool_calls_executed) && tool_calls_executed.length > 0) {
      metadataObj.tool_calls = tool_calls_executed;
    }
    const metadata = Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null;

    try {
      await this._db(project_id,
        `INSERT INTO messages (id, conversation_id, role, content, tokens, cost, metadata, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`,
        [message_id, conversation_id, assistant_message, tokens_total, cost?.amount ?? null, metadata, now]
      );
      await this._db(project_id,
        'UPDATE conversations SET updated_at = ? WHERE id = ?',
        [now, conversation_id]
      );

      const cw = settings?.context_window || 20;
      await this._applyContextFIFO(project_id, conversation_id, cw);
    } catch (err) {
      this.logger.error('chat-io.save_assistant.failed', {
        error: err.message, correlation_id, conversation_id
      });
      this.metrics?.increment('chat-io.errors', { kind: 'save_assistant' });
      return;
    }

    await this._publicarEvento('chat.assistant.saved', {
      project_id, conversation_id, message_id,
      assistant_message, metadata
    }, { correlation_id });
    this.metrics?.increment('chat-io.message.assistant_saved');

    if (channel === 'web' || !channel) {
      this._publishMqtt(conversation_id, {
        id: message_id,
        role: 'assistant',
        content: assistant_message,
        metadata,
        timestamp: new Date(now).toISOString()
      });
    }
  }

  // Persistencia de chat.assistant.saved cuando el emisor es OTRO modulo
  // (agent-observer, ai-agent-framework). Cierra el bug arquitectonico de
  // tarjetas de agente que se publicaban al bus sin que nadie las persistiera.
  // Self-echo (chat-io publica este evento tras persistir desde ai.chat.response)
  // se ignora via source.module_id.
  async onChatAssistantSavedFromAgent(event) {
    if (event?.source?.module_id === 'chat-io') return;
    const data = event?.data || event;
    const { project_id, conversation_id, assistant_message, correlation_id, metadata } = data;
    if (!project_id || !conversation_id || !assistant_message) {
      this.logger.warn('chat-io.agent_assistant_saved.invalid_payload', {
        has_project: !!project_id, has_conv: !!conversation_id, has_message: !!assistant_message,
        source_module: event?.source?.module_id, correlation_id
      });
      this.metrics?.increment('chat-io.errors', { kind: 'invalid_payload', source: 'agent_assistant_saved' });
      return;
    }
    await this._ensureSchema(project_id);
    if (!(await this._validateConversation(project_id, conversation_id))) {
      this.logger.warn('chat-io.agent_assistant_saved.conv_unknown', {
        conversation_id, source_module: event?.source?.module_id, correlation_id
      });
      this.metrics?.increment('chat-io.errors', { kind: 'unknown_conv', source: 'agent_assistant_saved' });
      return;
    }
    const message_id = data.message_id || crypto.randomUUID();
    const now = Date.now();
    const metadataStr = metadata
      ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata))
      : null;
    try {
      await this._db(project_id,
        `INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?)`,
        [message_id, conversation_id, assistant_message, metadataStr, now]
      );
      await this._db(project_id,
        'UPDATE conversations SET updated_at = ? WHERE id = ?',
        [now, conversation_id]
      );
      this.metrics?.increment('chat-io.message.agent_assistant_saved');
    } catch (err) {
      this.logger.error('chat-io.agent_assistant_saved.failed', {
        error: err.message, correlation_id, conversation_id,
        source_module: event?.source?.module_id
      });
      this.metrics?.increment('chat-io.errors', { kind: 'save_agent_assistant' });
    }
  }

  async onAiFailed(event) {
    const data = event.data || event;
    const {
      project_id, conversation_id, message_id,
      error, channel, correlation_id
    } = data;

    if (!conversation_id || !error) {
      this.logger.warn('chat-io.ai_failed.invalid_payload', {
        has_conv: !!conversation_id, has_error: !!error, correlation_id
      });
      this.metrics?.increment('chat-io.errors', { kind: 'invalid_payload', source: 'ai_failed' });
      return;
    }

    const userMessage = this._userMessageForErrorCode(error.code, error.message);

    this.logger.warn('chat-io.ai_failed', {
      conversation_id, correlation_id, error_code: error.code,
      provider_attempted: data.provider_attempted, duration_ms: data.duration_ms
    });
    this.metrics?.increment('chat-io.ai_failed', { code: error.code });

    if (project_id) {
      try {
        const fail_id = crypto.randomUUID();
        const now = Date.now();
        await this._db(project_id,
          `INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
           VALUES (?, ?, 'system', ?, ?, ?)`,
          [fail_id, conversation_id, userMessage,
            JSON.stringify({ error_code: error.code, system: 'ai-failed' }), now]
        );
      } catch (err) {
        this.logger.warn('chat-io.persist_failed_message.skipped', {
          error: err.message, correlation_id
        });
        this.metrics?.increment('chat-io.errors', { kind: 'persist_failed_message' });
      }
    }

    if (channel === 'web' || !channel) {
      this._publishMqtt(conversation_id, {
        id: crypto.randomUUID(),
        role: 'system',
        content: userMessage,
        metadata: { error_code: error.code, system: 'ai-failed' },
        timestamp: new Date().toISOString()
      });
    }
  }

  // ==========================================
  // Helpers POC2 (transferibles) + auxiliares
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code    = err._code || this._classifyHandlerError(err);
    const status  = code === 'INVALID_INPUT'      ? 400 :
                    code === 'RESOURCE_NOT_FOUND'     ? 404 :
                    code === 'PERMISSION_DENIED' ? 403 :
                    code === 'CONFLICT_STATE'               ? 409 :
                    code === 'UPSTREAM_UNREACHABLE'   ? 503 :
                                                        500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('chat-io.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('does not exist')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('uuid')) return 'INVALID_INPUT';
    if (msg.includes('already') || msg.includes('conflict')) return 'CONFLICT_STATE';
    if (msg.includes('unauthorized') || msg.includes('forbidden')) return 'PERMISSION_DENIED';
    if (msg.includes('timeout') || msg.includes('unavailable')) return 'UPSTREAM_UNREACHABLE';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = { timestamp: new Date().toISOString(), ...payload };
    if (sourcePayload?.correlation_id) enriched.correlation_id = sourcePayload.correlation_id;
    else if (!enriched.correlation_id)  enriched.correlation_id = crypto.randomUUID();
    await this.eventBus.publish(name, enriched);
  }

  // Auxiliar: traduce error.code canonico a mensaje legible al usuario
  // (en su idioma, sin tecnicismos). NO expone detalles internos del sistema.
  _userMessageForErrorCode(code, raw_message) {
    const M = {
      'UPSTREAM_TIMEOUT':         'Tardé más de la cuenta en responder. Inténtalo de nuevo en un momento.',
      'UPSTREAM_INVALID_RESPONSE':    'Estoy recibiendo muchas peticiones. Inténtalo en unos minutos.',
      'UPSTREAM_INVALID_RESPONSE':     'Hay un problema con mis credenciales para el motor del lenguaje. Avisa al administrador.',
      'UPSTREAM_5XX':             'El motor del lenguaje tiene un fallo temporal. Inténtalo en un momento.',
      'UPSTREAM_UNREACHABLE':     'No puedo conectar con el motor del lenguaje ahora mismo. Inténtalo más tarde.',
      'UPSTREAM_INVALID_RESPONSE':'El motor del lenguaje devolvió algo que no entiendo. Inténtalo de nuevo.',
      'UPSTREAM_INVALID_RESPONSE':'La conversación se ha hecho demasiado larga para procesarla. Empieza una nueva y te ayudo igual.',
      'RESOURCE_NOT_FOUND':     'No tengo credenciales configuradas para responder. Avisa al administrador.',
      'UNKNOWN_ERROR':           'Algo se rompió por mi parte. Inténtalo de nuevo o avisa si persiste.'
    };
    return M[code] || `No pude completar la respuesta (${code || 'error desconocido'}). Inténtalo de nuevo.`;
  }

  _publishMqtt(conversation_id, payload) {
    if (!this.mqtt) return;
    try {
      this.mqtt.publish(
        `conversation/${conversation_id}/message`,
        JSON.stringify(payload),
        { qos: 1 }
      );
    } catch (err) {
      this.logger.warn('chat-io.mqtt.publish.failed', { error: err.message, conversation_id });
      this.metrics?.increment('chat-io.errors', { kind: 'mqtt_publish' });
    }
  }
}

module.exports = ChatIoModule;
