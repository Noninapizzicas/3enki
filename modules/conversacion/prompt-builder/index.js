/**
 * prompt-builder — Construye el system prompt del chat
 *
 * Al arrancar: escanea modules/ y carga en memoria:
 *   - base.prompt.json              (persona global del asistente)
 *   - <módulo>/prompt.json          (rol operativo del módulo)
 *   - <módulo>/context.json         (dominio del módulo: tools, rules, schemas)
 *
 * Al recibir chat.message.saved:
 *   1. Resuelve page → moduleName (exact o suffix match)
 *   2. Construye system prompt: base + context + prompt + runtime
 *   3. Carga los últimos N mensajes de la DB (historial)
 *   4. Publica chat.prompt.ready
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PromptBuilderModule {
  constructor() {
    this.name = 'prompt-builder';
    this.version = '1.0.0';
    this.logger = null;
    this.eventBus = null;
    this.config = null;

    this._base = null;                  // base prompt JSON
    this._prompts = new Map();          // moduleName → prompt.json
    this._contexts = new Map();         // moduleName → context.json
    this._modulesDir = null;

    this.pendingDb = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};
    this._modulesDir = this.config.modulesDir || path.join(__dirname, '../..');

    this._loadBase();
    this._scanModules(this._modulesDir, '');

    this.logger.info('prompt-builder.loaded', {
      base: !!this._base,
      prompts: this._prompts.size,
      contexts: this._contexts.size
    });
  }

  async onUnload() {
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
  }

  // ============================================================
  // Carga inicial
  // ============================================================

  _loadBase() {
    try {
      const p = path.join(this._modulesDir, '_shared', 'base.prompt.json');
      this._base = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (err) {
      this.logger.warn('prompt-builder.base.missing', { error: err.message });
    }
  }

  _scanModules(dir, prefix) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const moduleName = prefix ? `${prefix}/${entry.name}` : entry.name;

      const promptPath = path.join(fullPath, 'prompt.json');
      const contextPath = path.join(fullPath, 'context.json');
      let hasLocal = false;

      try {
        const prompt = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
        prompt._module = moduleName;
        this._prompts.set(moduleName, prompt);
        hasLocal = true;
      } catch { /* no prompt.json */ }

      try {
        const ctx = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
        ctx._module = moduleName;
        this._contexts.set(moduleName, ctx);
        hasLocal = true;
      } catch { /* no context.json */ }

      // Recurse for nested modules (e.g. pizzepos/menu-generator)
      if (!hasLocal) this._scanModules(fullPath, moduleName);
    }
  }

  _resolveModule(page) {
    if (!page) return null;
    const slug = String(page).replace(/^\/+/, '');
    if (!slug) return null;
    if (this._prompts.has(slug) || this._contexts.has(slug)) return slug;
    for (const key of this._prompts.keys()) if (key.endsWith('/' + slug)) return key;
    for (const key of this._contexts.keys()) if (key.endsWith('/' + slug)) return key;
    return null;
  }

  // ============================================================
  // System prompt builder
  // ============================================================

  _buildSystemPrompt(moduleName, runtime) {
    const sections = [];

    if (this._base) sections.push(JSON.stringify(this._base, null, 2));

    if (moduleName) {
      const ctx = this._contexts.get(moduleName);
      const prm = this._prompts.get(moduleName);
      if (ctx) sections.push(JSON.stringify(ctx, null, 2));
      if (prm) sections.push(JSON.stringify(prm, null, 2));
    }

    if (runtime && Object.keys(runtime).length > 0) {
      sections.push('CONTEXTO ACTIVO:\n' + JSON.stringify(runtime, null, 2));
    }

    return sections.join('\n\n---\n\n');
  }

  // ============================================================
  // DB helper (event-driven)
  // ============================================================

  async _db(project_id, query, params = []) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        reject(new Error(`db timeout: ${query.slice(0, 40)}`));
      }, 8000);
      this.pendingDb.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.query.request', { project_id, query, params, read_only: true, request_id });
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

  // ============================================================
  // Pipeline: chat.message.saved → chat.prompt.ready
  // ============================================================

  async onMessageSaved(event) {
    const data = event.data || event;
    const { project_id, conversation_id, message_id, content, page } = data;
    if (!project_id || !conversation_id || !content) return;

    const moduleName = this._resolveModule(page);
    const runtime = { project_id, conversation_id };
    const systemPrompt = this._buildSystemPrompt(moduleName, runtime);

    // Historial: últimos N mensajes (excluye el que acabamos de insertar)
    const maxHistory = this.config.maxHistoryMessages || 20;
    let history = [];
    try {
      const rows = await this._db(project_id,
        `SELECT role, content FROM messages
         WHERE conversation_id = ? AND id != ? AND in_context = 1
         ORDER BY created_at DESC LIMIT ?`,
        [conversation_id, message_id, maxHistory]
      );
      history = rows.reverse().map(r => ({ role: r.role, content: r.content }));
    } catch (err) {
      this.logger.warn('prompt-builder.history.failed', { error: err.message });
    }

    const messages = [...history, { role: 'user', content }];

    await this.eventBus.publish('chat.prompt.ready', {
      project_id,
      conversation_id,
      message_id,
      page: page || null,
      module: moduleName,
      system: systemPrompt,
      messages
    });
  }
}

module.exports = PromptBuilderModule;
