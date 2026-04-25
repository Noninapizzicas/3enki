/**
 * prompt-builder
 *
 * Al arrancar:
 *   - escanea modules/ y carga base.prompt.json + prompt.json + context.json de cada módulo
 *   - pide a prompt-manager la librería de prompts del usuario y la guarda en cache
 *   - escucha prompt.created/updated/deleted para mantener la cache fresca
 *
 * En cada chat.message.saved:
 *   - resuelve el prompt: si payload.prompt es UUID → cache de usuario; si null → prompt.json del módulo
 *   - construye el system prompt: base + context.json + prompt + CONTEXTO ACTIVO
 *   - carga historial de la DB (los messages activos in_context=1, ordenados, hasta context_window)
 *   - publica chat.prompt.ready con los 9 campos (prompt = string final concatenado, + messages)
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

    this._modulesDir = null;
    this._base = null;                  // base.prompt.json
    this._modulePrompts = new Map();    // moduleName → prompt.json
    this._moduleContexts = new Map();   // moduleName → context.json
    this._userPrompts = new Map();      // prompt_id → { id, name, content, ... }

    this.pendingDb = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this._modulesDir = context.moduleConfig?.modulesDir || path.join(__dirname, '../..');

    this._loadBase();
    this._scanModules(this._modulesDir, '');
    this._requestUserPrompts();

    this.logger.info('prompt-builder.loaded', {
      base: !!this._base,
      module_prompts: this._modulePrompts.size,
      module_contexts: this._moduleContexts.size
    });
  }

  async onUnload() {
    for (const { timeout } of this.pendingDb.values()) clearTimeout(timeout);
    this.pendingDb.clear();
  }

  // ============================================================
  // Carga inicial: base + módulos del FS
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

      let hasLocal = false;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(fullPath, 'prompt.json'), 'utf8'));
        data._module = moduleName;
        this._modulePrompts.set(moduleName, data);
        hasLocal = true;
      } catch { /* no prompt.json */ }
      try {
        const data = JSON.parse(fs.readFileSync(path.join(fullPath, 'context.json'), 'utf8'));
        data._module = moduleName;
        this._moduleContexts.set(moduleName, data);
        hasLocal = true;
      } catch { /* no context.json */ }

      // Recursión solo si no había FS aquí (módulos anidados como pizzepos/menu-generator)
      if (!hasLocal) this._scanModules(fullPath, moduleName);
    }
  }

  _resolveModule(page_id) {
    if (!page_id) return null;
    const slug = String(page_id).replace(/^\/+/, '');
    if (!slug) return null;
    if (this._modulePrompts.has(slug) || this._moduleContexts.has(slug)) return slug;
    for (const k of this._modulePrompts.keys()) if (k.endsWith('/' + slug)) return k;
    for (const k of this._moduleContexts.keys()) if (k.endsWith('/' + slug)) return k;
    return null;
  }

  // ============================================================
  // Cache de prompts del usuario (vía prompt-manager)
  // ============================================================

  _requestUserPrompts() {
    const request_id = crypto.randomUUID();
    this._listRequestId = request_id;
    this.eventBus.publish('prompt.list.request', { request_id }).catch(err =>
      this.logger.warn('prompt-builder.list.failed', { error: err.message })
    );
  }

  onPromptListResponse(event) {
    const { request_id, success, data } = event.data || event;
    if (request_id !== this._listRequestId) return;
    this._listRequestId = null;
    if (!success || !data?.prompts) return;
    for (const p of data.prompts) {
      if (p.id) this._userPrompts.set(p.id, p);
    }
    this.logger.info('prompt-builder.user_prompts.loaded', { count: this._userPrompts.size });
  }

  onPromptUpserted(event) {
    const { id, name, content, slot_type, tags, title, description } = event.data || event;
    if (!id) return;
    this._userPrompts.set(id, { id, name, content, slot_type, tags, title, description });
  }

  onPromptDeleted(event) {
    const { id } = event.data || event;
    if (id) this._userPrompts.delete(id);
  }

  // ============================================================
  // DB helper (event-driven) — para cargar historial
  // ============================================================

  async _db(project_id, query, params = []) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDb.delete(request_id);
        reject(new Error('db timeout'));
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
  // Construcción del system prompt
  // ============================================================

  _resolvePromptContent(payloadPromptId, moduleName) {
    if (payloadPromptId && this._userPrompts.has(payloadPromptId)) {
      return this._userPrompts.get(payloadPromptId);
    }
    if (moduleName && this._modulePrompts.has(moduleName)) {
      return this._modulePrompts.get(moduleName);
    }
    return null;
  }

  _buildSystemPrompt({ moduleName, promptObj, context, project_id, conversation_id, page_id }) {
    const sections = [];

    if (this._base) sections.push(JSON.stringify(this._base, null, 2));

    if (moduleName) {
      const ctx = this._moduleContexts.get(moduleName);
      if (ctx) sections.push(JSON.stringify(ctx, null, 2));
    }

    if (promptObj) {
      // Si es un prompt del usuario tiene .content; si es del FS es un objeto JSON
      const promptText = typeof promptObj.content === 'string'
        ? promptObj.content
        : JSON.stringify(promptObj, null, 2);
      sections.push(promptText);
    }

    const runtime = {
      project_id,
      conversation_id,
      page_id,
      ...(context && Object.keys(context).length > 0 ? context : {})
    };
    sections.push('CONTEXTO ACTIVO:\n' + JSON.stringify(runtime, null, 2));

    return sections.join('\n\n---\n\n');
  }

  // ============================================================
  // Pipeline: chat.message.saved → chat.prompt.ready
  // ============================================================

  async onMessageSaved(event) {
    const data = event.data || event;
    const {
      project_id, page_id, conversation_id,
      context, settings, prompt: promptId,
      attachments, intencion, message, message_id
    } = data;

    if (!project_id || !conversation_id || !message) return;

    const moduleName = this._resolveModule(page_id);
    const promptObj = this._resolvePromptContent(promptId, moduleName);
    const systemPrompt = this._buildSystemPrompt({
      moduleName, promptObj, context: context || {},
      project_id, conversation_id, page_id
    });

    // Historial: últimos N mensajes activos (excluyendo el que acabamos de guardar)
    const limit = settings?.context_window || 20;
    let history = [];
    try {
      const rows = await this._db(project_id,
        `SELECT role, content FROM messages
         WHERE conversation_id = ? AND in_context = 1 AND id != ?
         ORDER BY created_at DESC LIMIT ?`,
        [conversation_id, message_id || '', limit]
      );
      history = rows.reverse().map(r => ({ role: r.role, content: r.content }));
    } catch (err) {
      this.logger.warn('prompt-builder.history.failed', { error: err.message });
    }

    const messages = [...history, { role: 'user', content: message }];

    // Propagamos los 9 campos. prompt pasa de id → string final.
    await this.eventBus.publish('chat.prompt.ready', {
      project_id,
      page_id,
      conversation_id,
      context: context || {},
      settings,
      prompt: systemPrompt,
      attachments: attachments || [],
      intencion: intencion ?? null,
      message,
      messages,
      message_id
    });
  }
}

module.exports = PromptBuilderModule;
