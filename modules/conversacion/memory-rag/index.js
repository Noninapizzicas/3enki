/**
 * memory-rag v2.0.0 — POC2 canonico.
 *
 * Memoria semantica modular: indexa cada chat.message.saved (user) y cada
 * ai.chat.response (assistant) — solicita embedding via embedding.generate.request,
 * persiste vector como BLOB en SQLite via db.query.request.
 *
 * En cada chat.message.saved (user): genera embedding del mensaje, hace
 * busqueda cosine similarity en cache in-memory contra los vectores del
 * (project_id, user_id), y publica chat.context.enriched (priority 500) con
 * los top-K snippets para que prompt-builder los inyecte al system prompt.
 *
 * Aislamiento estricto por (project_id, user_id).
 */

'use strict';

const crypto = require('crypto');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS rag_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  vector BLOB NOT NULL,
  dimensions INTEGER NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rag_messages_user ON rag_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_messages_conv ON rag_messages(conversation_id);
`;

const DEFAULT_DB_TIMEOUT_MS = 10000;
const DEFAULT_EMBEDDING_TIMEOUT_MS = 30000;
const DEFAULT_PRIORITY = 500;
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.6;
const DEFAULT_SNIPPET_MAX_CHARS = 400;
const DEFAULT_MIN_MSG_LEN = 8;
const DEFAULT_MAX_INDEX_SIZE = 10000;

class MemoryRagModule {
  constructor() {
    this.name = 'memory-rag';
    this.version = '2.0.0';
    this.logger = null;
    this.eventBus = null;
    this.metrics = null;
    this.config = null;
    this.pendingDb = new Map();
    this.pendingEmbeddings = new Map();
    this.schemaReady = new Set();
    this.vectorCache = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics || null;
    this.config = context.moduleConfig || context.config || {};
    this.logger.info('memory-rag.loaded', {
      enabled: this.config.enabled !== false,
      priority: this.config.priority_in_prompt || DEFAULT_PRIORITY,
      top_k: this.config.top_k || DEFAULT_TOP_K,
      min_similarity: this.config.min_similarity || DEFAULT_MIN_SIMILARITY,
      provider: this.config.embedding_provider || 'gemini'
    });
  }

  async onUnload() {
    for (const { timeout, reject } of this.pendingDb.values()) {
      clearTimeout(timeout);
      reject(new Error('module unloaded'));
    }
    this.pendingDb.clear();
    for (const { timeout, reject } of this.pendingEmbeddings.values()) {
      clearTimeout(timeout);
      reject(new Error('module unloaded'));
    }
    this.pendingEmbeddings.clear();
    this.schemaReady.clear();
    this.vectorCache.clear();
    this.logger?.info?.('memory-rag.unloaded', {});
  }

  // ============================================================
  // Helpers POC2
  // ============================================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'TIMEOUT' };
    if (/required|invalid|missing/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'subscribe') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('memory-rag.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      crypto.randomUUID();
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  // ============================================================
  // Bus subscribers
  // ============================================================

  async onMessageSaved(event) {
    try {
      if (this.config.enabled === false) return;
      const data = event?.data || event;
      const { project_id, user_id, conversation_id, message_id, user_message, correlation_id } = data || {};
      if (!project_id || !user_id || !conversation_id || !message_id || !user_message) return;

      const minLen = this.config.skip_messages_shorter_than || DEFAULT_MIN_MSG_LEN;
      if (user_message.trim().length < minLen) return;

      await this._ensureSchema(project_id);
      await this._ensureCacheLoaded(project_id);

      const embedding = await this._requestEmbedding({
        correlation_id, project_id, user_id, content: user_message, source: 'memory-rag.query'
      });
      if (!embedding) return;

      const candidates = this._getCacheBucket(project_id, user_id);
      const topK = this._search(
        embedding.vector,
        candidates,
        this.config.top_k || DEFAULT_TOP_K,
        this.config.min_similarity || DEFAULT_MIN_SIMILARITY
      );

      await this._persistMessage(project_id, {
        id: crypto.randomUUID(),
        conversation_id, user_id, role: 'user',
        content: user_message, vector: embedding.vector,
        dimensions: embedding.dimensions, model: embedding.model,
        provider: embedding.provider, created_at: Date.now()
      });

      this.metrics?.increment?.('memory-rag.indexed', { role: 'user' });

      if (topK.length === 0) {
        this.logger.debug('memory-rag.search.no_match', {
          conversation_id, candidates: candidates.length
        });
        return;
      }

      this.metrics?.increment?.('memory-rag.context.enriched');
      const snippet = this._formatSnippets(topK, this.config.snippet_max_chars || DEFAULT_SNIPPET_MAX_CHARS);
      await this._publicarEvento('chat.context.enriched', {
        conversation_id,
        message_id,
        source: 'memory-rag',
        context_addition: `Mensajes previos relevantes (memoria semantica):\n${snippet}`,
        priority: this.config.priority_in_prompt || DEFAULT_PRIORITY,
        metadata: { matches: topK.length, max_similarity: topK[0].similarity }
      }, { correlation_id, project_id });
    } catch (err) {
      this._handleHandlerError('memory-rag.message_saved.error', err);
    }
  }

  async onAiChatResponse(event) {
    try {
      if (this.config.enabled === false) return;
      const data = event?.data || event;
      const { project_id, user_id, conversation_id, message_id_assistant, assistant_message, correlation_id } = data || {};
      if (!project_id || !user_id || !conversation_id || !message_id_assistant || !assistant_message) return;

      const minLen = this.config.skip_messages_shorter_than || DEFAULT_MIN_MSG_LEN;
      if (assistant_message.trim().length < minLen) return;

      await this._ensureSchema(project_id);
      await this._ensureCacheLoaded(project_id);

      const embedding = await this._requestEmbedding({
        correlation_id, project_id, user_id, content: assistant_message,
        source: 'memory-rag.index_assistant'
      });
      if (!embedding) return;

      await this._persistMessage(project_id, {
        id: crypto.randomUUID(),
        conversation_id, user_id, role: 'assistant',
        content: assistant_message, vector: embedding.vector,
        dimensions: embedding.dimensions, model: embedding.model,
        provider: embedding.provider, created_at: Date.now()
      });
      this.metrics?.increment?.('memory-rag.indexed', { role: 'assistant' });
    } catch (err) {
      this._handleHandlerError('memory-rag.ai_chat_response.error', err);
    }
  }

  onEmbeddingResponse(event) {
    const payload = event?.data || event;
    const request_id = payload?.request_id;
    const pending = this.pendingEmbeddings.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingEmbeddings.delete(request_id);
    pending.resolve(payload);
  }

  onEmbeddingFailed(event) {
    const payload = event?.data || event;
    const request_id = payload?.request_id;
    const pending = this.pendingEmbeddings.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingEmbeddings.delete(request_id);
    pending.reject(new Error(payload.error?.message || 'embedding.generate.failed'));
  }

  onDbQueryResponse(event) {
    const payload = event?.data || event;
    const request_id = payload?.request_id;
    const pending = this.pendingDb.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDb.delete(request_id);
    if (payload.error) pending.reject(new Error(payload.error));
    else pending.resolve(payload.data ?? payload.rows ?? []);
  }

  // ============================================================
  // Internals
  // ============================================================

  async _requestEmbedding({ correlation_id, project_id, user_id, content, source }) {
    const request_id = crypto.randomUUID();
    const timeoutMs = this.config.embedding_timeout_ms || DEFAULT_EMBEDDING_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingEmbeddings.delete(request_id);
        reject(new Error('embedding request timeout'));
      }, timeoutMs);
      this.pendingEmbeddings.set(request_id, {
        resolve: (payload) => {
          if (!payload?.vector) {
            reject(new Error('embedding response missing vector'));
            return;
          }
          resolve({
            vector: payload.vector,
            dimensions: payload.dimensions || payload.vector.length,
            model: payload.model || 'unknown',
            provider: payload.provider || 'unknown'
          });
        },
        reject,
        timeout
      });
      this.eventBus.publish('embedding.generate.request', {
        correlation_id: correlation_id || crypto.randomUUID(),
        request_id,
        project_id,
        user_id: user_id || 'system',
        content,
        settings: {
          provider: this.config.embedding_provider || 'gemini',
          model: this.config.embedding_model || 'embedding-001'
        },
        source: source || 'memory-rag',
        timestamp: new Date().toISOString()
      });
    }).catch(err => {
      this.logger.warn('memory-rag.embedding.skipped', {
        error_message: err.message, source
      });
      this.metrics?.increment?.('memory-rag.errors', { code: 'EMBEDDING_FAILED', kind: 'embedding' });
      return null;
    });
  }

  async _persistMessage(project_id, row) {
    const blob = this._vectorToBlob(row.vector);
    await this._db(project_id,
      `INSERT INTO rag_messages (id, conversation_id, user_id, role, content, vector, dimensions, model, provider, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.conversation_id, row.user_id, row.role, row.content,
       blob, row.dimensions, row.model, row.provider, row.created_at]);

    const bucket = this._getCacheBucket(project_id, row.user_id);
    bucket.push({
      message_id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      vector: row.vector,
      created_at: row.created_at
    });
    const max = this.config.max_index_size_per_project || DEFAULT_MAX_INDEX_SIZE;
    if (bucket.length > max) bucket.splice(0, bucket.length - max);
  }

  _getCacheBucket(project_id, user_id) {
    const key = `${project_id}:${user_id}`;
    if (!this.vectorCache.has(key)) this.vectorCache.set(key, []);
    return this.vectorCache.get(key);
  }

  async _ensureCacheLoaded(project_id) {
    const flagKey = `loaded:${project_id}`;
    if (this.schemaReady.has(flagKey)) return;
    const rows = await this._db(project_id,
      `SELECT id, conversation_id, user_id, role, content, vector, dimensions, created_at
       FROM rag_messages ORDER BY created_at ASC`,
      [], true);
    for (const r of rows || []) {
      const bucket = this._getCacheBucket(project_id, r.user_id);
      bucket.push({
        message_id: r.id,
        conversation_id: r.conversation_id,
        role: r.role,
        content: r.content,
        vector: this._blobToVector(r.vector, r.dimensions),
        created_at: r.created_at
      });
    }
    this.schemaReady.add(flagKey);
    this.logger.info('memory-rag.cache.loaded', {
      project_id, count: (rows || []).length
    });
  }

  _search(queryVector, candidates, k, minSim) {
    const scored = [];
    for (const c of candidates) {
      const sim = this._cosineSimilarity(queryVector, c.vector);
      if (sim >= minSim) scored.push({ ...c, similarity: sim });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, k);
  }

  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  _formatSnippets(matches, maxChars) {
    return matches.map(m => {
      const speaker = m.role === 'user' ? 'Usuario' : 'Compañero';
      const snippet = m.content.length > maxChars
        ? m.content.slice(0, maxChars) + '...'
        : m.content;
      return `- [${speaker}, sim=${m.similarity.toFixed(2)}]: ${snippet}`;
    }).join('\n');
  }

  _vectorToBlob(vector) {
    const buf = Buffer.alloc(vector.length * 4);
    for (let i = 0; i < vector.length; i++) {
      buf.writeFloatLE(vector[i], i * 4);
    }
    return buf;
  }

  _blobToVector(blob, dimensions) {
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    const vector = new Array(dimensions);
    for (let i = 0; i < dimensions; i++) {
      vector[i] = buf.readFloatLE(i * 4);
    }
    return vector;
  }

  async _db(project_id, query, params = [], read_only = false) {
    const request_id = crypto.randomUUID();
    const timeoutMs = this.config.db_timeout_ms || DEFAULT_DB_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        reject(new Error(`db timeout: ${query.slice(0, 40)}`));
      }, timeoutMs);
      this.pendingDb.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.query.request', { project_id, query, params, read_only, request_id });
    });
  }

  async _ensureSchema(project_id) {
    if (this.schemaReady.has(project_id)) return;
    for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
      await this._db(project_id, stmt, []);
    }
    this.schemaReady.add(project_id);
  }
}

module.exports = MemoryRagModule;
