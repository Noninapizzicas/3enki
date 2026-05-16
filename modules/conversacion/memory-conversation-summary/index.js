/**
 * memory-conversation-summary v2.0.0 — POC2 canonico.
 *
 * Memoria narrativa: cuenta mensajes por conversation_id; al pasar threshold
 * pide al LLM un resumen via llm.complete.request, lo persiste en SQLite via
 * db.query.request, y publica chat.context.enriched (priority 200) para que
 * prompt-builder lo agregue al system prompt cuando FIFO recorte el historial.
 */

'use strict';

const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
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

const DEFAULT_DB_TIMEOUT_MS = 10000;
const DEFAULT_LLM_TIMEOUT_MS = 60000;
const DEFAULT_PRIORITY = 200;
const DEFAULT_THRESHOLD = 20;
const DEFAULT_SUMMARY_MAX_CHARS = 800;

class MemoryConversationSummaryModule extends BaseModule {
  constructor() {
    super();
    this.name = 'memory-conversation-summary';
    this.version = '2.0.0';
    this.config = null;
    this.pendingDb = new Map();
    this.pendingLlm = new Map();
    this.schemaReady = new Set();
    this.messageCounters = new Map();
    this.summaryInFlight = new Set();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics || null;
    this.config = context.moduleConfig || context.config || {};
    this.logger.info('memory-conversation-summary.loaded', {
      enabled: this.config.enabled !== false,
      priority: this.config.priority_in_prompt || DEFAULT_PRIORITY,
      threshold: this.config.summarize_after_messages || DEFAULT_THRESHOLD
    });
  }

  async onUnload() {
    for (const { timeout, reject } of this.pendingDb.values()) {
      clearTimeout(timeout);
      reject(new Error('module unloaded'));
    }
    this.pendingDb.clear();
    for (const { timeout, reject } of this.pendingLlm.values()) {
      clearTimeout(timeout);
      reject(new Error('module unloaded'));
    }
    this.pendingLlm.clear();
    this.schemaReady.clear();
    this.messageCounters.clear();
    this.summaryInFlight.clear();
    this.logger?.info?.('memory-conversation-summary.unloaded', {});
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
    if (/timeout/i.test(msg)) return { status: 504, code: 'UPSTREAM_TIMEOUT' };
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
    this.metrics?.increment?.('memory-conversation-summary.errors', { code, kind });
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

      await this._ensureSchema(project_id);

      const counter = (this.messageCounters.get(conversation_id) || 0) + 1;
      this.messageCounters.set(conversation_id, counter);

      const existing = await this._loadSummary(project_id, conversation_id);
      const threshold = this.config.summarize_after_messages || DEFAULT_THRESHOLD;

      if (existing) {
        await this._publishContextEnriched({
          project_id, correlation_id, conversation_id, message_id, summary: existing.summary
        });
      }

      const messagesSinceSummary = existing
        ? counter - (existing.message_count_at_summary || 0)
        : counter;

      if (messagesSinceSummary >= threshold && !this.summaryInFlight.has(conversation_id)) {
        this.summaryInFlight.add(conversation_id);
        this._scheduleSummarize({
          project_id, user_id, conversation_id, message_id, correlation_id, message_count: counter
        }).catch(err => {
          this.logger.error('memory-conversation-summary.summarize.scheduling_failed', {
            error_message: err.message, conversation_id
          });
          this.metrics?.increment?.('memory-conversation-summary.errors', { code: 'SCHEDULING_FAILED', kind: 'summarize' });
          this.summaryInFlight.delete(conversation_id);
        });
      }
    } catch (err) {
      this._handleHandlerError('memory-conversation-summary.message_saved.error', err);
    }
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

  onLlmResponse(event) {
    const payload = event?.data || event;
    const request_id = payload?.request_id;
    const pending = this.pendingLlm.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingLlm.delete(request_id);
    pending.resolve(payload);
  }

  onLlmFailed(event) {
    const payload = event?.data || event;
    const request_id = payload?.request_id;
    const pending = this.pendingLlm.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingLlm.delete(request_id);
    pending.reject(new Error(payload.error?.message || 'llm.complete.failed'));
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
      const maxChars = this.config.summary_max_chars || DEFAULT_SUMMARY_MAX_CHARS;

      const summaryText = await this._requestLlmSummary(transcript, maxChars, correlation_id);

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

      this.metrics?.increment?.('memory-conversation-summary.summary.generated');
      this.logger.info('memory-conversation-summary.summarize.completed', {
        conversation_id, summary_length: summaryText.length, message_count
      });

      await this._publishContextEnriched({
        project_id, correlation_id, conversation_id, message_id, summary: summaryText
      });
    } finally {
      this.summaryInFlight.delete(conversation_id);
    }
  }

  async _requestLlmSummary(transcript, maxChars, correlation_id) {
    const request_id = crypto.randomUUID();
    const timeoutMs = this.config.llm_timeout_ms || DEFAULT_LLM_TIMEOUT_MS;
    const systemPrompt = `Eres un asistente que resume conversaciones. Devuelve un resumen narrativo en espanol de la conversacion (no listado, no titulos), conservando los hechos importantes que el usuario menciono y las decisiones tomadas. Maximo ${maxChars} caracteres. NO incluyas saludos, NO incluyas meta-comentarios sobre el resumen, NO uses formato markdown. Solo el resumen, en prosa fluida.`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingLlm.delete(request_id);
        reject(new Error('llm summary timeout'));
      }, timeoutMs);
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
        correlation_id: correlation_id || crypto.randomUUID(),
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

  async _publishContextEnriched({ project_id, correlation_id, conversation_id, message_id, summary }) {
    if (!summary) return;
    await this._publicarEvento('chat.context.enriched', {
      conversation_id,
      message_id,
      source: 'memory-conversation-summary',
      context_addition: `Resumen de la conversacion hasta ahora:\n${summary}`,
      priority: this.config.priority_in_prompt || DEFAULT_PRIORITY,
      metadata: { summary_length: summary.length }
    }, { correlation_id, project_id });
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

module.exports = MemoryConversationSummaryModule;
