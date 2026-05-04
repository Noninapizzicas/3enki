/**
 * memory-conversation-summary — Memoria narrativa del compañero.
 *
 * Escucha cada chat.message.saved y mantiene un contador de mensajes
 * por conversation_id. Cuando pasa el threshold (config.summarize_after_messages,
 * default 20), pide al LLM (via llm.complete.request a ai-gateway) que
 * genere un resumen de la conversacion y lo persiste en SQLite por
 * (project_id, conversation_id).
 *
 * En cada chat.message.saved subsiguiente, publica chat.context.enriched
 * con el resumen actual para que prompt-builder lo agregue al system
 * prompt. Asi, cuando el FIFO recorta el principio del historial,
 * la esencia narrativa del viaje queda preservada.
 *
 * Diseno event-driven puro:
 *   - No instancia DB propio (db.query.request a database-manager).
 *   - No llama directo al LLM (llm.complete.request a ai-gateway).
 *   - No conoce a prompt-builder (publica chat.context.enriched canonico).
 */

'use strict';

const crypto = require('crypto');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  last_message_id TEXT,
  message_count_at_summary INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user ON conversation_summaries(user_id);
`;

class MemoryConversationSummaryModule {
  constructor() {
    this.name     = 'memory-conversation-summary';
    this.version  = '1.0.0';
    this.logger   = null;
    this.eventBus = null;
    this.config   = null;
    this.pendingDb        = new Map();
    this.pendingLlm       = new Map();
    this.schemaReady      = new Set();
    this.messageCounters  = new Map();
    this.summaryInFlight  = new Set();
  }

  async onLoad(context) {
    this.logger   = context.logger;
    this.eventBus = context.eventBus;
    this.config   = context.moduleConfig || {};
    this.logger.info('memory-conversation-summary.loaded', {
      priority: this.config.priority_in_prompt || 200,
      threshold: this.config.summarize_after_messages || 20
    });
  }

  async onUnload() {
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
    for (const { timeout } of this.pendingLlm.values()) clearTimeout(timeout);
    this.pendingLlm.clear();
    this.schemaReady.clear();
    this.messageCounters.clear();
    this.summaryInFlight.clear();
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

    try {
      await this._ensureSchema(project_id);

      const counter = (this.messageCounters.get(conversation_id) || 0) + 1;
      this.messageCounters.set(conversation_id, counter);

      const existing = await this._loadSummary(project_id, conversation_id);
      const threshold = this.config.summarize_after_messages || 20;

      if (existing) {
        await this._publishContextEnriched({
          correlation_id, conversation_id, message_id,
          summary: existing.summary
        });
      }

      const messagesSinceSummary = existing
        ? counter - (existing.message_count_at_summary || 0)
        : counter;

      if (messagesSinceSummary >= threshold && !this.summaryInFlight.has(conversation_id)) {
        this.summaryInFlight.add(conversation_id);
        this._scheduleSummarize({
          project_id, user_id, conversation_id, message_id,
          correlation_id, message_count: counter
        }).catch(err => {
          this.logger.error('memory-conversation-summary.summarize.scheduling_failed', {
            error: err.message, conversation_id
          });
          this.summaryInFlight.delete(conversation_id);
        });
      }
    } catch (err) {
      this.logger.error('memory-conversation-summary.onMessageSaved.failed', {
        error: err.message, conversation_id, message_id
      });
    }
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

  onLlmResponse(event) {
    const payload = event.data || event;
    const { request_id } = payload;
    const pending = this.pendingLlm.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingLlm.delete(request_id);
    pending.resolve(payload);
  }

  onLlmFailed(event) {
    const payload = event.data || event;
    const { request_id, error } = payload;
    const pending = this.pendingLlm.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingLlm.delete(request_id);
    pending.reject(new Error(error?.message || 'llm.complete.failed'));
  }

  // ============================================================
  // Internals
  // ============================================================

  async _scheduleSummarize(ctx) {
    const { project_id, user_id, conversation_id, message_id, correlation_id, message_count } = ctx;
    try {
      const messages = await this._loadRecentMessages(project_id, conversation_id);
      if (!messages || messages.length === 0) {
        this.logger.warn('memory-conversation-summary.summarize.no_messages', { conversation_id });
        return;
      }

      const transcript = messages
        .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
        .join('\n');
      const maxChars = this.config.summary_max_chars || 800;

      const summaryText = await this._requestLlmSummary(transcript, maxChars);

      const now = Date.now();
      await this._db(project_id,
        `INSERT INTO conversation_summaries
         (conversation_id, user_id, summary, last_message_id, message_count_at_summary, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           summary = excluded.summary,
           last_message_id = excluded.last_message_id,
           message_count_at_summary = excluded.message_count_at_summary,
           updated_at = excluded.updated_at`,
        [conversation_id, user_id, summaryText, message_id, message_count, now]);

      this.logger.info('memory-conversation-summary.summarize.completed', {
        conversation_id, summary_length: summaryText.length, message_count
      });

      await this._publishContextEnriched({
        correlation_id, conversation_id, message_id, summary: summaryText
      });
    } finally {
      this.summaryInFlight.delete(conversation_id);
    }
  }

  async _requestLlmSummary(transcript, maxChars) {
    const request_id = crypto.randomUUID();
    const systemPrompt = `Eres un asistente que resume conversaciones. Devuelve un resumen narrativo en espanol de la conversacion (no listado, no titulos), conservando los hechos importantes que el usuario menciono y las decisiones tomadas. Maximo ${maxChars} caracteres. NO incluyas saludos, NO incluyas meta-comentarios sobre el resumen, NO uses formato markdown. Solo el resumen, en prosa fluida.`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingLlm.delete(request_id);
        reject(new Error('llm summary timeout'));
      }, 60000);
      this.pendingLlm.set(request_id, {
        resolve: (payload) => {
          const content = payload?.result?.content || payload?.content || '';
          if (!content) {
            reject(new Error('llm response sin content'));
            return;
          }
          resolve(content.slice(0, maxChars).trim());
        },
        reject,
        timeout
      });
      this.eventBus.publish('llm.complete.request', {
        request_id,
        system_prompt: systemPrompt,
        messages: [{ role: 'user', content: transcript }],
        settings: {
          model: this.config.llm_model || 'deepseek-chat',
          provider: this.config.llm_provider || 'deepseek',
          temperature: this.config.llm_temperature ?? 0.3,
          max_tokens: this.config.llm_max_tokens || 400
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  async _loadSummary(project_id, conversation_id) {
    const rows = await this._db(project_id,
      `SELECT summary, message_count_at_summary, last_message_id, updated_at
       FROM conversation_summaries WHERE conversation_id = ? LIMIT 1`,
      [conversation_id], true);
    return rows && rows[0] ? rows[0] : null;
  }

  async _loadRecentMessages(project_id, conversation_id) {
    const rows = await this._db(project_id,
      `SELECT role, content, created_at
       FROM messages WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [conversation_id], true);
    return rows || [];
  }

  async _publishContextEnriched({ correlation_id, conversation_id, message_id, summary }) {
    if (!summary) return;
    await this.eventBus.publish('chat.context.enriched', {
      correlation_id: correlation_id || crypto.randomUUID(),
      conversation_id,
      message_id,
      source: 'memory-conversation-summary',
      context_addition: `Resumen de la conversacion hasta ahora:\n${summary}`,
      priority: this.config.priority_in_prompt || 200,
      timestamp: new Date().toISOString(),
      metadata: { summary_length: summary.length }
    });
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

module.exports = MemoryConversationSummaryModule;
