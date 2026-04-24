/**
 * chat-io — Entrada y salida del chat (conversational I/O)
 *
 * IN  (frontend → backend)
 *   MQTT: ui/request/conversation/send  { project_id, conversation_id?, page, content }
 *     → crea conversación si falta
 *     → guarda mensaje user
 *     → publica chat.message.saved
 *
 * OUT (backend → frontend)
 *   Event: ai.chat.response             { conversation_id, content, ... }
 *     → guarda mensaje assistant
 *     → publica chat.assistant.saved
 *     → MQTT: conversation/{id}/message { role: 'assistant', content, ... }
 *
 * Persistencia: SQLite por proyecto (tabla conversations, messages).
 */

const crypto = require('crypto');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  tokens INTEGER,
  cost REAL,
  in_context INTEGER DEFAULT 1,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
`.trim();

class ChatIoModule {
  constructor() {
    this.name = 'chat-io';
    this.version = '1.0.0';
    this.logger = null;
    this.eventBus = null;
    this.mqtt = null;
    this.pendingDb = new Map(); // request_id → {resolve, reject, timeout}
    this.schemaReady = new Set();
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
  }

  // ============================================================
  // DB helper (event-driven request/response con database-manager)
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
    const { request_id, rows, error } = event.data || event;
    const pending = this.pendingDb.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDb.delete(request_id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(rows || []);
  }

  async _ensureSchema(project_id) {
    if (this.schemaReady.has(project_id)) return;
    for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
      await this._db(project_id, stmt, []);
    }
    this.schemaReady.add(project_id);
  }

  onProjectActivated(event) {
    const { project_id } = event.data || event;
    if (project_id) this._ensureSchema(project_id).catch(err =>
      this.logger.warn('chat-io.schema.failed', { project_id, error: err.message })
    );
  }

  // ============================================================
  // IN: handler MQTT ui/request/conversation/send
  // ============================================================

  async handleSend(data) {
    const { project_id, content, page } = data;
    let { conversation_id } = data;

    if (!project_id) throw { status: 400, message: 'project_id required' };
    if (!content) throw { status: 400, message: 'content required' };

    await this._ensureSchema(project_id);
    const now = Date.now();

    // Lazy create
    if (!conversation_id) {
      conversation_id = crypto.randomUUID();
      await this._db(project_id,
        `INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [conversation_id, project_id, content.slice(0, 60), now, now]
      );
    }

    const message_id = crypto.randomUUID();
    await this._db(project_id,
      `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
      [message_id, conversation_id, content, now]
    );
    await this._db(project_id,
      `UPDATE conversations SET updated_at = ? WHERE id = ?`,
      [now, conversation_id]
    );

    await this.eventBus.publish('chat.message.saved', {
      project_id, conversation_id, message_id, content, page: page || null
    });

    return { conversation_id, message_id };
  }

  // ============================================================
  // IN: handler MQTT ui/request/conversation/list
  // ============================================================

  async handleList(data) {
    const { project_id, limit } = data;
    if (!project_id) throw { status: 400, message: 'project_id required' };
    await this._ensureSchema(project_id);
    const rows = await this._db(project_id,
      `SELECT id, title, created_at, updated_at FROM conversations WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?`,
      [project_id, limit || 20], true
    );
    return { conversations: rows };
  }

  // ============================================================
  // IN: handler MQTT ui/request/conversation/load
  // ============================================================

  async handleLoad(data) {
    const { project_id, conversation_id } = data;
    if (!project_id || !conversation_id) throw { status: 400, message: 'project_id and conversation_id required' };
    await this._ensureSchema(project_id);
    const messages = await this._db(project_id,
      `SELECT id, role, content, in_context, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      [conversation_id], true
    );
    return { conversation_id, messages };
  }

  // ============================================================
  // OUT: escucha ai.chat.response → guarda assistant + MQTT push
  // ============================================================

  async onAiResponse(event) {
    const data = event.data || event;
    const { project_id, conversation_id, content, tokens, cost, tool_calls_executed } = data;
    if (!project_id || !conversation_id || !content) return;

    const message_id = crypto.randomUUID();
    const now = Date.now();
    const metadata = tool_calls_executed?.length
      ? JSON.stringify({ tool_calls: tool_calls_executed.map(t => ({ name: t.name, status: t.status })) })
      : null;

    try {
      await this._db(project_id,
        `INSERT INTO messages (id, conversation_id, role, content, tokens, cost, metadata, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`,
        [message_id, conversation_id, content, tokens || null, cost || null, metadata, now]
      );
      await this._db(project_id,
        `UPDATE conversations SET updated_at = ? WHERE id = ?`,
        [now, conversation_id]
      );
    } catch (err) {
      this.logger.error('chat-io.save_assistant.failed', { error: err.message });
    }

    await this.eventBus.publish('chat.assistant.saved', {
      project_id, conversation_id, message_id, content
    });

    // MQTT push al frontend
    if (this.mqtt) {
      this.mqtt.publish(
        `conversation/${conversation_id}/message`,
        JSON.stringify({
          id: message_id,
          role: 'assistant',
          content,
          timestamp: new Date(now).toISOString()
        }),
        { qos: 1 }
      );
    }
  }
}

module.exports = ChatIoModule;
