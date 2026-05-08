/**
 * memory-rag — Memoria semantica modular del compañero.
 *
 * Cada chat.message.saved (user) y cada ai.chat.response (assistant) se
 * INDEXA: el modulo publica embedding.generate.request (consumido por
 * ai-gateway), recibe el vector, lo persiste en SQLite por proyecto en
 * tabla rag_messages como BLOB binario.
 *
 * En cada chat.message.saved (user), tambien se CONSULTA: con el mismo
 * vector recien obtenido, se calcula cosine similarity en memoria contra
 * todos los vectores del proyecto+usuario, y se publica chat.context.enriched
 * con los snippets top-K mas similares (filtrados por similaridad minima).
 *
 * Diseno event-driven puro:
 *   - No instancia DB propia (db.query.request a database-manager).
 *   - No llama directo a APIs LLM/embedding (embedding.generate.request a ai-gateway).
 *   - No conoce a prompt-builder (publica chat.context.enriched canonico).
 *
 * Cuando el FIFO recorta el principio del historial, esos mensajes siguen
 * estando disponibles para retrieval semantico — el viaje preserva
 * memoria contextual del pasado mas alla de la ventana FIFO.
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

class MemoryRagModule {
  constructor() {
    this.name = 'memory-rag';
    this.version = '1.0.0';
    this.logger = null;
    this.eventBus = null;
    this.config = null;
    this.pendingDb = new Map();
    this.pendingEmbeddings = new Map();
    this.schemaReady = new Set();
    this.vectorCache = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};
    this.logger.info('memory-rag.loaded', {
      priority: this.config.priority_in_prompt || 500,
      top_k: this.config.top_k || 5,
      min_similarity: this.config.min_similarity || 0.6,
      provider: this.config.embedding_provider || 'gemini'
    });
  }

  async onUnload() {
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
    for (const { timeout } of this.pendingEmbeddings.values()) clearTimeout(timeout);
    this.pendingEmbeddings.clear();
    this.schemaReady.clear();
    this.vectorCache.clear();
  }

  // ============================================================
  // Handlers
  // ============================================================

  async onMessageSaved(event) {
    if (this.config.enabled === false) return;
    const data = event.data || event;
    const {
      project_id, user_id, conversation_id, message_id,
      user_message, correlation_id
    } = data;
    if (!project_id || !user_id || !conversation_id || !message_id || !user_message) return;

    const minLen = this.config.skip_messages_shorter_than || 8;
    if (user_message.trim().length < minLen) return;

    try {
      await this._ensureSchema(project_id);
      await this._ensureCacheLoaded(project_id);

      const embedding = await this._requestEmbedding({
        correlation_id, project_id, user_id, content: user_message, source: 'memory-rag.query'
      });
      if (!embedding) return;

      // Search ANTES de persistir el mensaje del turno actual — asi el
      // propio mensaje no se devuelve a si mismo como match (similarity=1.0).
      const candidates = this._getCacheBucket(project_id, user_id);
      const topK = this._search(embedding.vector, candidates,
        this.config.top_k || 5, this.config.min_similarity || 0.6);

      // Persistir DESPUES del search.
      await this._persistMessage(project_id, {
        id: crypto.randomUUID(),
        conversation_id, user_id, role: 'user',
        content: user_message, vector: embedding.vector,
        dimensions: embedding.dimensions, model: embedding.model,
        provider: embedding.provider, created_at: Date.now()
      });

      if (topK.length === 0) {
        this.logger.debug('memory-rag.search.no_match', {
          conversation_id, candidates: candidates.length
        });
        return;
      }

      const snippet = this._formatSnippets(topK, this.config.snippet_max_chars || 400);
      await this.eventBus.publish('chat.context.enriched', {
        correlation_id: correlation_id || crypto.randomUUID(),
        conversation_id,
        message_id,
        source: 'memory-rag',
        context_addition: `Mensajes previos relevantes (memoria semantica):\n${snippet}`,
        priority: this.config.priority_in_prompt || 500,
        timestamp: new Date().toISOString(),
        metadata: { matches: topK.length, max_similarity: topK[0].similarity }
      });
    } catch (err) {
      this.logger.error('memory-rag.onMessageSaved.failed', {
        error: err.message, conversation_id, message_id
      });
    }
  }

  async onAiChatResponse(event) {
    if (this.config.enabled === false) return;
    const data = event.data || event;
    const {
      project_id, user_id, conversation_id, message_id_assistant,
      assistant_message, correlation_id
    } = data;
    if (!project_id || !user_id || !conversation_id || !message_id_assistant || !assistant_message) return;

    const minLen = this.config.skip_messages_shorter_than || 8;
    if (assistant_message.trim().length < minLen) return;

    try {
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
    } catch (err) {
      this.logger.error('memory-rag.onAiChatResponse.failed', {
        error: err.message, conversation_id, message_id_assistant
      });
    }
  }

  onEmbeddingResponse(event) {
    const payload = event.data || event;
    const { request_id } = payload;
    const pending = this.pendingEmbeddings.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingEmbeddings.delete(request_id);
    pending.resolve(payload);
  }

  onEmbeddingFailed(event) {
    const payload = event.data || event;
    const { request_id, error } = payload;
    const pending = this.pendingEmbeddings.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingEmbeddings.delete(request_id);
    pending.reject(new Error(error?.message || 'embedding.generate.failed'));
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

  // ============================================================
  // Internals
  // ============================================================

  async _requestEmbedding({ correlation_id, project_id, user_id, content, source }) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingEmbeddings.delete(request_id);
        reject(new Error('embedding request timeout'));
      }, 30000);
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
        error: err.message, source
      });
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
    const max = this.config.max_index_size_per_project || 10000;
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
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        reject(new Error(`db timeout: ${query.slice(0, 40)}`));
      }, 10000);
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
