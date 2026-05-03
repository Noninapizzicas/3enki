/**
 * chat-io — Entrada/salida del chat + persistencia
 *
 * IN  (frontend → backend, vía MQTT ui/request/conversation/*)
 *   send          → guarda mensaje user, publica chat.message.saved
 *   create        → crea conversation con settings (context_window/temperature/max_tokens)
 *   list / load   → consultas
 *   delete / update_settings / toggle_context / context_stats
 *
 * OUT (backend → frontend)
 *   ai.chat.response (consumido) → guarda mensaje assistant, publica chat.assistant.saved,
 *                                  empuja MQTT conversation/{id}/message
 *
 * Persistencia: SQLite por proyecto. Tablas conversations y messages.
 * FIFO: cada mensaje activa applyContextFIFO según settings.context_window de la conversación.
 */

const crypto = require('crypto');

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

class ChatIoModule {
  constructor() {
    this.name = 'chat-io';
    this.version = '1.0.0';
    this.logger = null;
    this.eventBus = null;
    this.mqtt = null;
    this.pendingDb = new Map();      // request_id → {resolve, reject, timeout}
    this.schemaReady = new Set();    // project_id que ya tienen schema
    this.knownConversations = new Map(); // conversation_id → project_id (cache)
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.mqtt = context.uiHandler?.mqtt || null;
    this.logger.info('chat-io.loaded');
  }

  async onUnload() {
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
    this.knownConversations.clear();
  }

  // ============================================================
  // DB helper (event-driven request/response)
  // ============================================================

  async _db(project_id, query, params = [], read_only = false) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        reject(new Error(`db timeout: ${query.slice(0, 40)}`));
      }, 10000);
      this.pendingDb.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.query.request', { project_id, query, params, read_only, request_id });
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
    // database-manager publica las filas en `data`; aceptamos `rows` por compatibilidad
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

  // Migración suave: para tablas que ya existían en versiones anteriores,
  // añade las columnas que faltan (CREATE TABLE IF NOT EXISTS no las añade).
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
        // ignorar — race condition o columna creada por otro path
        this.logger.debug('chat-io.schema.migrate.skip', { project_id, table: m.table, column: m.column, error: err.message });
      }
    }
  }

  onProjectActivated(event) {
    const { project_id } = event.data || event;
    if (!project_id) return;
    this._ensureSchema(project_id).catch(err =>
      this.logger.warn('chat-io.schema.failed', { project_id, error: err.message })
    );
  }

  // ============================================================
  // Validación / cache de conversaciones
  // ============================================================

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

  // Convierte epoch ms (almacenado en DB) a ISO string para el frontend.
  // El frontend usa `new Date(string)` y eso falla con números almacenados como string.
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

  // ============================================================
  // FIFO de contexto
  // ============================================================

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

  // ============================================================
  // IN: ui/request/conversation/send
  // ============================================================

  async handleSend(data) {
    const project_id = data.project_id;
    const conversation_id = data.conversation_id;
    const page_id = data.page_id || 'chat';
    const context = data.context || {};
    // 'prompt' del input UI = id de plantilla (chat-flow lo renombra a prompt_id para
    // resolver la polisemia con system_prompt construido en chat.prompt.ready).
    const prompt_id = data.prompt ?? data.prompt_id ?? null;
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    const intencion = data.intencion ?? null;
    // 'message' del input UI = texto del usuario (chat-flow lo renombra a user_message
    // para resolver la polisemia con assistant_message del LLM).
    const user_message = data.message ?? data.user_message;
    // Identidad y trazabilidad canonicas (chat-flow).
    // user_id: hoy single-user → 'default' si no viene. Cuando llegue multi-user
    // vendra de la sesion / token / canal.
    const user_id = data.user_id || 'default';
    // correlation_id: si el caller lo trae (canal externo lo genero), se preserva.
    // Si no, chat-io es el originador y lo genera.
    const correlation_id = data.correlation_id || crypto.randomUUID();
    // channel + channel_context: para que la respuesta pueda volver al canal correcto.
    // Default 'web' (UI nativa). Si data trae channel/channel_context (otro canal
    // como telegram-service llamando a handleSend), se preservan.
    const channel = data.channel || 'web';
    const channel_context = data.channel_context || {};

    if (!project_id || !isUUID(project_id)) {
      throw { status: 400, code: 'PROJECT_REQUIRED', message: 'Selecciona un proyecto para chatear' };
    }
    if (!conversation_id || !isUUID(conversation_id)) {
      throw { status: 400, code: 'CONVERSATION_REQUIRED', message: 'Selecciona o crea una conversación' };
    }

    await this._ensureSchema(project_id);

    if (!(await this._validateConversation(project_id, conversation_id))) {
      throw { status: 400, code: 'CONVERSATION_REQUIRED', message: 'Conversación no existe o no pertenece al proyecto' };
    }

    // Settings de la conversación
    const convRows = await this._db(project_id,
      'SELECT context_window, temperature, max_tokens FROM conversations WHERE id = ?',
      [conversation_id], true
    );
    const settings = convRows[0] || defaultSettings();

    // INSERT mensaje user
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

    // FIFO
    await this._applyContextFIFO(project_id, conversation_id, settings.context_window);

    // chat.message.saved — shape canonico chat-flow v1.0.0
    // Schema: arquitectura/decisiones/_schemas/chat-flow/chat.message.saved.schema.json
    await this.eventBus.publish('chat.message.saved', {
      correlation_id,
      conversation_id,
      project_id,
      user_id,
      channel,
      channel_context,
      message_id,
      user_message,
      timestamp: new Date().toISOString(),
      // opcionales canonicos
      attachments,
      intencion,
      settings,
      page_id,
      prompt_id,
      // contexto de pagina opaco — la UI lo manda y el compañero lo usa para enriquecer prompt.
      // Se preserva en context_addition virtual del prompt-builder.
      page_context: context && Object.keys(context).length > 0 ? context : undefined
    });

    return { conversation_id, message_id };
  }

  // ============================================================
  // IN: ui/request/conversation/create
  // ============================================================

  async handleCreate(data) {
    const { project_id, title, context_window, temperature, max_tokens, prompt_id } = data;
    if (!project_id || !isUUID(project_id)) {
      throw { status: 400, code: 'PROJECT_REQUIRED', message: 'Selecciona un proyecto' };
    }
    await this._ensureSchema(project_id);

    const id = crypto.randomUUID();
    const now = Date.now();
    const s = defaultSettings();
    const finalTitle = title || 'Nueva conversación';
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
    return {
      conversation: this._serializeConversation({
        id, project_id, title: finalTitle,
        context_window: finalCw, temperature: finalT, max_tokens: finalMt,
        prompt_id: prompt_id || null,
        created_at: now, updated_at: now,
        message_count: 0
      }),
      conversation_id: id  // alias por retrocompatibilidad
    };
  }

  // ============================================================
  // IN: ui/request/conversation/list
  // ============================================================

  async handleList(data) {
    const { project_id, limit } = data;
    if (!project_id || !isUUID(project_id)) {
      throw { status: 400, code: 'PROJECT_REQUIRED' };
    }
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
    return { conversations: rows.map(r => this._serializeConversation(r)) };
  }

  // ============================================================
  // IN: ui/request/conversation/load
  // ============================================================

  async handleLoad(data) {
    const { project_id, conversation_id } = data;
    if (!project_id || !isUUID(project_id)) throw { status: 400, code: 'PROJECT_REQUIRED' };
    if (!conversation_id || !isUUID(conversation_id)) throw { status: 400, code: 'CONVERSATION_REQUIRED' };
    await this._ensureSchema(project_id);
    if (!(await this._validateConversation(project_id, conversation_id))) {
      throw { status: 400, code: 'CONVERSATION_REQUIRED' };
    }
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
    return { conversation: this._serializeConversation(convRows[0]), messages };
  }

  // ============================================================
  // IN: ui/request/conversation/delete
  // ============================================================

  async handleDelete(data) {
    const { project_id, conversation_id } = data;
    if (!project_id || !isUUID(project_id)) throw { status: 400, code: 'PROJECT_REQUIRED' };
    if (!conversation_id || !isUUID(conversation_id)) throw { status: 400, code: 'CONVERSATION_REQUIRED' };
    await this._ensureSchema(project_id);

    await this._db(project_id, 'DELETE FROM messages WHERE conversation_id = ?', [conversation_id]);
    await this._db(project_id, 'DELETE FROM conversations WHERE id = ?', [conversation_id]);
    this.knownConversations.delete(conversation_id);
    return { ok: true };
  }

  // ============================================================
  // IN: ui/request/conversation/update_settings
  // ============================================================

  async handleUpdateSettings(data) {
    const { project_id, conversation_id, context_window, temperature, max_tokens, prompt_id, title } = data;
    if (!project_id || !isUUID(project_id)) throw { status: 400, code: 'PROJECT_REQUIRED' };
    if (!conversation_id || !isUUID(conversation_id)) throw { status: 400, code: 'CONVERSATION_REQUIRED' };
    await this._ensureSchema(project_id);
    if (!(await this._validateConversation(project_id, conversation_id))) {
      throw { status: 400, code: 'CONVERSATION_REQUIRED' };
    }

    const sets = [];
    const params = [];
    if (context_window !== undefined) { sets.push('context_window = ?'); params.push(context_window); }
    if (temperature !== undefined)    { sets.push('temperature = ?');    params.push(temperature); }
    if (max_tokens !== undefined)     { sets.push('max_tokens = ?');     params.push(max_tokens); }
    if (prompt_id !== undefined)      { sets.push('prompt_id = ?');      params.push(prompt_id); }
    if (title !== undefined)          { sets.push('title = ?');          params.push(title); }
    if (sets.length === 0) return { ok: true, changed: 0 };
    sets.push('updated_at = ?'); params.push(Date.now(), conversation_id);

    await this._db(project_id,
      `UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`,
      params
    );
    return { ok: true };
  }

  // ============================================================
  // IN: ui/request/conversation/toggle_context
  // ============================================================

  async handleToggleContext(data) {
    const { project_id, message_id, in_context } = data;
    if (!project_id || !isUUID(project_id)) throw { status: 400, code: 'PROJECT_REQUIRED' };
    if (!message_id) throw { status: 400, code: 'MESSAGE_ID_REQUIRED' };

    await this._db(project_id,
      'UPDATE messages SET in_context = ?, manually_toggled = 1 WHERE id = ?',
      [in_context ? 1 : 0, message_id]
    );
    return { ok: true, message_id, in_context: !!in_context, manually_toggled: true };
  }

  // ============================================================
  // IN: ui/request/conversation/context_stats
  // ============================================================

  async handleContextStats(data) {
    const { project_id, conversation_id } = data;
    if (!project_id || !isUUID(project_id)) throw { status: 400, code: 'PROJECT_REQUIRED' };
    if (!conversation_id || !isUUID(conversation_id)) throw { status: 400, code: 'CONVERSATION_REQUIRED' };

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
      total: stats[0]?.total || 0,
      active,
      manually_toggled: stats[0]?.manually_toggled || 0,
      max_context: max,
      remaining: Math.max(0, max - active)
    };
  }

  // ============================================================
  // OUT: escucha ai.chat.response → guarda assistant + MQTT push
  // ============================================================

  /**
   * onAiResponse — handler de ai.chat.response (shape canonico chat-flow v1.0.0).
   *
   * Espera shape: { correlation_id, conversation_id, project_id, user_id,
   *   channel, channel_context, message_id, message_id_assistant,
   *   assistant_message, model, provider, tokens: { input, output, total },
   *   { correlation_id, conversation_id, project_id, user_id, channel,
   *     channel_context, message_id, message_id_assistant, assistant_message,
   *     model, provider, tokens:{input,output,total}, duration_ms, timestamp,
   *     [tool_calls_executed], [iterations], [cost], [finish_reason] }
   */
  async onAiResponse(event) {
    const data = event.data || event;
    const {
      project_id, conversation_id,
      assistant_message,
      message_id_assistant,
      tokens, cost, tool_calls_executed,
      settings,
      channel, channel_context, correlation_id
    } = data;

    if (!project_id || !conversation_id || !assistant_message) return;

    const message_id = message_id_assistant || crypto.randomUUID();
    const now = Date.now();
    const tokens_total = tokens?.total ?? null;
    const metadata = tool_calls_executed?.length
      ? JSON.stringify({ tool_calls: tool_calls_executed.map(t => ({ name: t.name, status: t.result_status || t.status })) })
      : null;

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
      this.logger.error('chat-io.save_assistant.failed', { error: err.message, correlation_id });
      return;
    }

    await this.eventBus.publish('chat.assistant.saved', {
      project_id, conversation_id, message_id,
      assistant_message,
      metadata,
      correlation_id
    });

    // Reenvio al canal segun channel_context (agnosticismo de canal)
    if (channel === 'web' || !channel) {
      // Default web: MQTT push al frontend (shape historico que la UI consume)
      if (this.mqtt) {
        this.mqtt.publish(
          `conversation/${conversation_id}/message`,
          JSON.stringify({
            id: message_id,
            role: 'assistant',
            content: assistant_message,
            metadata,
            timestamp: new Date(now).toISOString()
          }),
          { qos: 1 }
        );
      }
    }
    // Otros canales (telegram, voice, etc.) los maneja su propio modulo de canal,
    // que escucha ai.chat.response y devuelve via su API. chat-io NO conoce
    // esos canales — agnosticismo respetado.
  }

  /**
   * onAiFailed — handler de ai.chat.failed (chat-flow v1.0.0).
   *
   * Se ejecuta cuando ai-gateway publica un fallo del flujo (timeout LLM,
   * credencial, todos los providers caidos, etc.). chat-io traduce el error
   * canonico a un mensaje legible al usuario por su canal — cierra el ciclo
   * iniciado en chat.message.saved (garantia no_silent_failures).
   *
   * Espera shape: { correlation_id, conversation_id, user_id, channel,
   *   channel_context, message_id, error: { code, message, details }, timestamp,
   *   [project_id], [duration_ms], [provider_attempted] }
   */
  async onAiFailed(event) {
    const data = event.data || event;
    const {
      project_id, conversation_id, message_id,
      error, channel, channel_context, correlation_id
    } = data;

    if (!conversation_id || !error) return;

    // Mapeo error code → mensaje legible al usuario.
    // Sin exponer detalles internos (stack, paths, secrets) — solo lo que
    // el usuario necesita saber para entender que paso y que hacer.
    const userMessage = this._userMessageForErrorCode(error.code, error.message);

    this.logger.warn('chat-io.ai_failed', {
      conversation_id, correlation_id, error_code: error.code,
      provider_attempted: data.provider_attempted, duration_ms: data.duration_ms
    });

    // Persistir como mensaje 'system' para que la conversacion preserve el rastro
    if (project_id) {
      try {
        const fail_id = crypto.randomUUID();
        const now = Date.now();
        await this._db(project_id,
          `INSERT INTO messages (id, conversation_id, role, content, metadata, created_at)
           VALUES (?, ?, 'system', ?, ?, ?)`,
          [fail_id, conversation_id, userMessage, JSON.stringify({ error_code: error.code, system: 'ai-failed' }), now]
        );
      } catch (_) { /* best-effort */ }
    }

    // Reenviar al canal de origen (agnosticismo)
    if (channel === 'web' || !channel) {
      if (this.mqtt) {
        this.mqtt.publish(
          `conversation/${conversation_id}/message`,
          JSON.stringify({
            id: crypto.randomUUID(),
            role: 'system',
            content: userMessage,
            metadata: { error_code: error.code, system: 'ai-failed' },
            timestamp: new Date().toISOString()
          }),
          { qos: 1 }
        );
      }
    }
  }

  /**
   * Traduce un error.code canonico a mensaje legible al usuario.
   * Sin tecnicismos. Sin exponer detalles del sistema.
   */
  _userMessageForErrorCode(code, raw_message) {
    const M = {
      'UPSTREAM_TIMEOUT':         'Tardé más de la cuenta en responder. Inténtalo de nuevo en un momento.',
      'UPSTREAM_RATE_LIMITED':    'Estoy recibiendo muchas peticiones. Inténtalo en unos minutos.',
      'UPSTREAM_AUTH_FAILED':     'Hay un problema con mis credenciales para el motor del lenguaje. Avisa al administrador.',
      'UPSTREAM_5XX':             'El motor del lenguaje tiene un fallo temporal. Inténtalo en un momento.',
      'UPSTREAM_UNREACHABLE':     'No puedo conectar con el motor del lenguaje ahora mismo. Inténtalo más tarde.',
      'UPSTREAM_INVALID_RESPONSE':'El motor del lenguaje devolvió algo que no entiendo. Inténtalo de nuevo.',
      'CREDENTIAL_NOT_FOUND':     'No tengo credenciales configuradas para responder. Avisa al administrador.',
      'INTERNAL_ERROR':           'Algo se rompió por mi parte. Inténtalo de nuevo o avisa si persiste.'
    };
    return M[code] || `No pude completar la respuesta (${code || 'error desconocido'}). Inténtalo de nuevo.`;
  }
}

module.exports = ChatIoModule;
