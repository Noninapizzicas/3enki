/**
 * memory-user-profile — Memoria modular del compañero.
 *
 * Escucha cada chat.message.saved, extrae hechos sobre el usuario del
 * user_message (heuristicas regex en español), los persiste deduplicados
 * en SQLite por (project_id, user_id) y emite chat.context.enriched con
 * el perfil acumulado para que prompt-builder lo agregue al system prompt.
 *
 * Sin esto, el "compañero" no recuerda NADA sobre el humano de un mensaje
 * al siguiente. Con esto, el viaje sostiene memoria de identidad.
 *
 * Diseño event-driven puro:
 *   - No instancia DB propio (usa db.query.request a database-manager).
 *   - No conoce a prompt-builder (publica chat.context.enriched canonico).
 *   - Heuristicas hoy = regex; mañana se sustituye por llamada a LLM via
 *     llm.complete.request sin cambiar el contrato externo.
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

// Heuristicas en español. Cada patron captura un grupo (lo que va detras
// del marcador) y produce una "fact" formateada legible para el LLM.
// El orden importa solo si el mismo texto matchea varios patrones — el
// primero gana (deduplicado posterior por UNIQUE en DB).
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

class MemoryUserProfileModule {
  constructor() {
    this.name     = 'memory-user-profile';
    this.version  = '1.0.0';
    this.logger   = null;
    this.eventBus = null;
    this.config   = null;
    this.pendingDb    = new Map();
    this.schemaReady  = new Set();
  }

  async onLoad(context) {
    this.logger   = context.logger;
    this.eventBus = context.eventBus;
    this.config   = context.moduleConfig || {};
    this.logger.info('memory-user-profile.loaded', { priority: this.config.priority_in_prompt || 100 });
  }

  async onUnload() {
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
    this.schemaReady.clear();
  }

  // ============================================================
  // Handlers
  // ============================================================

  async onMessageSaved(event) {
    if (this.config.enabled === false) return;
    const data = event.data || event;
    const {
      project_id, user_id, conversation_id, message_id, user_message,
      correlation_id
    } = data;

    if (!project_id || !user_id || !conversation_id || !message_id || !user_message) return;

    try {
      await this._ensureSchema(project_id);

      const newFacts = this._extractFacts(user_message);
      const minLen = this.config.min_fact_length || 4;
      const filtered = newFacts.filter(f => f.length >= minLen);

      const now = Date.now();
      for (const fact of filtered) {
        try {
          await this._db(project_id,
            `INSERT OR IGNORE INTO user_profile_facts
             (id, user_id, fact, source_message_id, conversation_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), user_id, fact, message_id, conversation_id, now]);
        } catch (err) {
          this.logger.warn('memory-user-profile.insert.failed', { error: err.message, fact: fact.slice(0, 40) });
        }
      }

      const limit = this.config.max_facts_per_user || 200;
      const rows = await this._db(project_id,
        `SELECT fact FROM user_profile_facts WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
        [user_id, limit], true);

      if (!rows || rows.length === 0) return;

      const profileText = rows.map(r => `- ${r.fact}`).join('\n');
      const context_addition = `Lo que sabemos del usuario (memoria acumulada):\n${profileText}`;

      await this.eventBus.publish('chat.context.enriched', {
        correlation_id: correlation_id || crypto.randomUUID(),
        conversation_id,
        message_id,
        source: 'memory-user-profile',
        context_addition,
        priority: this.config.priority_in_prompt || 100,
        timestamp: new Date().toISOString(),
        metadata: { fact_count: rows.length, new_facts_added: filtered.length }
      });
    } catch (err) {
      this.logger.error('memory-user-profile.onMessageSaved.failed', {
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

  // ============================================================
  // Internals
  // ============================================================

  _extractFacts(text) {
    const found = [];
    const seen = new Set();
    for (const { rx, fmt } of PATTERNS) {
      const m = text.match(rx);
      if (m) {
        const fact = fmt(m).replace(/\s+/g, ' ').trim();
        if (fact && !seen.has(fact)) { seen.add(fact); found.push(fact); }
      }
    }
    return found;
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

module.exports = MemoryUserProfileModule;
