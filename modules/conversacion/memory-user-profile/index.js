/**
 * memory-user-profile v2.0.0 — POC2 canonico.
 *
 * Memoria modular del compañero: por cada `chat.message.saved` extrae hechos
 * sobre el usuario via heuristicas regex (es), los persiste deduplicados en
 * SQLite via `db.query.request`, y emite `chat.context.enriched` con el perfil
 * acumulado para que prompt-builder lo agregue al system prompt.
 *
 * Diseño event-driven puro: no instancia DB propio, no conoce a prompt-builder.
 */

'use strict';

const crypto = require('crypto');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_profile_facts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  source_message_id TEXT,
  conversation_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, fact)
);
CREATE INDEX IF NOT EXISTS idx_user_profile_facts_user ON user_profile_facts(user_id);
`;

const PATTERNS = [
  { rx: /\bme llamo\s+([^.,;!?\n]{2,60})/i,                     fmt: m => `el usuario se llama ${m[1].trim()}` },
  { rx: /\bmi nombre es\s+([^.,;!?\n]{2,60})/i,                 fmt: m => `el usuario se llama ${m[1].trim()}` },
  { rx: /\bvivo en\s+([^.,;!?\n]{2,60})/i,                      fmt: m => `el usuario vive en ${m[1].trim()}` },
  { rx: /\bsoy de\s+([^.,;!?\n]{2,60})/i,                       fmt: m => `el usuario es de ${m[1].trim()}` },
  { rx: /\btrabajo (?:de|como)\s+([^.,;!?\n]{2,60})/i,          fmt: m => `el usuario trabaja de ${m[1].trim()}` },
  { rx: /\btrabajo en\s+([^.,;!?\n]{2,60})/i,                   fmt: m => `el usuario trabaja en ${m[1].trim()}` },
  { rx: /\bme dedico a\s+([^.,;!?\n]{2,60})/i,                  fmt: m => `el usuario se dedica a ${m[1].trim()}` },
  { rx: /\bno me gusta\s+([^.,;!?\n]{2,60})/i,                  fmt: m => `al usuario no le gusta ${m[1].trim()}` },
  { rx: /\bme encanta\s+([^.,;!?\n]{2,60})/i,                   fmt: m => `al usuario le encanta ${m[1].trim()}` },
  { rx: /\bme gusta\s+([^.,;!?\n]{2,60})/i,                     fmt: m => `al usuario le gusta ${m[1].trim()}` },
  { rx: /\bprefiero\s+([^.,;!?\n]{2,60})/i,                     fmt: m => `el usuario prefiere ${m[1].trim()}` },
  { rx: /\bodio\s+([^.,;!?\n]{2,60})/i,                         fmt: m => `el usuario odia ${m[1].trim()}` },
  { rx: /\btengo\s+(\d{1,3})\s+años\b/i,                        fmt: m => `el usuario tiene ${m[1]} años` },
  { rx: /\bsoy\s+(vegano|vegetariano|alergic[oa] a [^.,;!?\n]{2,60})/i, fmt: m => `el usuario es ${m[1].trim()}` }
];

const DEFAULT_DB_TIMEOUT_MS = 10000;
const DEFAULT_PRIORITY = 100;
const DEFAULT_MAX_FACTS = 200;
const DEFAULT_MIN_FACT_LENGTH = 4;

class MemoryUserProfileModule {
  constructor() {
    this.name = 'memory-user-profile';
    this.version = '2.0.0';
    this.logger = null;
    this.eventBus = null;
    this.metrics = null;
    this.config = null;
    this.pendingDb = new Map();
    this.schemaReady = new Set();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics || null;
    this.config = context.moduleConfig || context.config || {};
    this.logger.info('memory-user-profile.loaded', {
      enabled: this.config.enabled !== false,
      priority: this.config.priority_in_prompt || DEFAULT_PRIORITY
    });
  }

  async onUnload() {
    for (const { timeout, reject } of this.pendingDb.values()) {
      clearTimeout(timeout);
      reject(new Error('module unloaded'));
    }
    this.pendingDb.clear();
    this.schemaReady.clear();
    this.logger?.info?.('memory-user-profile.unloaded', {});
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
    return { status: 500, code: 'INTERNAL_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'subscribe') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('memory-user-profile.errors', { code, kind });
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

      const newFacts = this._extractFacts(user_message);
      const minLen = this.config.min_fact_length || DEFAULT_MIN_FACT_LENGTH;
      const filtered = newFacts.filter(f => f.length >= minLen);

      const now = Date.now();
      let inserted = 0;
      for (const fact of filtered) {
        try {
          await this._db(project_id,
            `INSERT OR IGNORE INTO user_profile_facts
             (id, user_id, fact, source_message_id, conversation_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), user_id, fact, message_id, conversation_id, now]);
          inserted++;
        } catch (err) {
          this.logger.warn('memory-user-profile.insert.failed', {
            error_message: err.message,
            fact: fact.slice(0, 40)
          });
          this.metrics?.increment?.('memory-user-profile.errors', { code: 'INSERT_FAILED', kind: 'db' });
        }
      }

      const limit = this.config.max_facts_per_user || DEFAULT_MAX_FACTS;
      const rows = await this._db(project_id,
        `SELECT fact FROM user_profile_facts WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
        [user_id, limit], true);

      if (!rows || rows.length === 0) return;

      const profileText = rows.map(r => `- ${r.fact}`).join('\n');
      const context_addition = `Lo que sabemos del usuario (memoria acumulada):\n${profileText}`;

      this.metrics?.increment?.('memory-user-profile.context.enriched');
      this.metrics?.gauge?.('memory-user-profile.facts.count', rows.length, { user_id });

      await this._publicarEvento('chat.context.enriched', {
        conversation_id,
        message_id,
        source: 'memory-user-profile',
        context_addition,
        priority: this.config.priority_in_prompt || DEFAULT_PRIORITY,
        metadata: { fact_count: rows.length, new_facts_added: inserted }
      }, { correlation_id, project_id });
    } catch (err) {
      this._handleHandlerError('memory-user-profile.message_saved.error', err);
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

  // ============================================================
  // Internals
  // ============================================================

  _extractFacts(text) {
    if (typeof text !== 'string') return [];
    const found = [];
    const seen = new Set();
    for (const { rx, fmt } of PATTERNS) {
      const m = text.match(rx);
      if (m) {
        const fact = fmt(m).replace(/\s+/g, ' ').trim();
        if (fact && !seen.has(fact)) {
          seen.add(fact);
          found.push(fact);
        }
      }
    }
    return found;
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

module.exports = MemoryUserProfileModule;
