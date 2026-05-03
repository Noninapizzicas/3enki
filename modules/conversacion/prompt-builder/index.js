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

  /**
   * onMessageSaved — handler de chat.message.saved (chat-flow v1.0.0).
   *
   * Espera shape canonico:
   *   { correlation_id, conversation_id, project_id, user_id, channel,
   *     channel_context, message_id, user_message, timestamp,
   *     attachments?, intencion?, settings?, page_id?, prompt_id?,
   *     page_context? }
   *
   * Construye el system prompt completo agregando:
   *   1. base.prompt.json + module prompt + user prompt (cache interna)
   *   2. context aportado por chat.context.enriched (memorias modulares)
   *   3. Publica chat.prompt.ready con shape canonico para ai-gateway.
   *
   * Compatibilidad transitoria: si llega del shape legacy ('message',
   * 'prompt' como id, 'context' como page_context), lo acepta pero
   * loguea warn.
   */
  async onMessageSaved(event) {
    const data = event.data || event;
    const {
      // shape canonico
      user_message, prompt_id, page_context, user_id, channel, channel_context, correlation_id,
      // comunes
      project_id, page_id, conversation_id, message_id, attachments, intencion, settings,
      // compatibilidad transitoria
      message: legacy_message, prompt: legacy_prompt, context: legacy_context
    } = data;

    // Normalizacion de shape (compat transitoria)
    const userMessageNorm = user_message ?? legacy_message;
    const promptIdNorm = prompt_id ?? legacy_prompt ?? null;
    const pageContextNorm = page_context ?? legacy_context ?? {};
    if (!user_message && legacy_message) {
      this.logger.warn('prompt-builder.onMessageSaved.shape_legacy', {
        reason: 'caller publica con campo legacy "message" en vez de "user_message" — drift chat-flow',
        conversation_id, correlation_id
      });
    }

    if (!project_id || !conversation_id || !userMessageNorm) return;

    const moduleName = this._resolveModule(page_id);
    const promptObj = this._resolvePromptContent(promptIdNorm, moduleName);
    let systemPrompt = this._buildSystemPrompt({
      moduleName, promptObj, context: pageContextNorm,
      project_id, conversation_id, page_id
    });

    // Agregar contexto aportado por memorias modulares (chat.context.enriched).
    // Las enriquecidas se acumulan en _pendingEnrichments por message_id desde
    // onContextEnriched. Aqui las recogemos y agregamos al system prompt por priority.
    if (this._pendingEnrichments && message_id) {
      const list = this._pendingEnrichments.get(message_id) || [];
      const now = Date.now();
      const valid = list
        .filter(e => !e.expires_at || new Date(e.expires_at).getTime() > now)
        .sort((a, b) => a.priority - b.priority);
      if (valid.length > 0) {
        const additions = valid.map(e => `[${e.source}]\n${e.context_addition}`).join('\n\n');
        systemPrompt = `${systemPrompt}\n\n--- contexto adicional aportado por memorias ---\n${additions}`;
        this._pendingEnrichments.delete(message_id);
      }
    }

    // Historial: ultimos N mensajes activos (excluyendo el que acabamos de guardar)
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
      this.logger.warn('prompt-builder.history.failed', { error: err.message, correlation_id });
    }

    const messages = [...history, { role: 'user', content: userMessageNorm }];

    // chat.prompt.ready — shape canonico chat-flow v1.0.0
    await this.eventBus.publish('chat.prompt.ready', {
      correlation_id,
      conversation_id,
      project_id,
      user_id: user_id || 'default',
      channel: channel || 'web',
      channel_context: channel_context || {},
      message_id,
      system_prompt: systemPrompt,
      messages,
      timestamp: new Date().toISOString(),
      // opcionales canonicos
      settings,
      intencion: intencion ?? undefined,
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    });
  }

  /**
   * onContextEnriched — handler de chat.context.enriched (chat-flow v1.0.0, NUEVO).
   *
   * Una memoria modular (memory-rag, memory-user-profile, memory-long-term, etc.)
   * publica este evento aportando contexto adicional para una conversation_id +
   * message_id concreta. prompt-builder agrega multiples enriquecimientos por
   * priority cuando construye el system prompt en onMessageSaved.
   *
   * Race condition: la memoria puede publicar chat.context.enriched ANTES o
   * DESPUES de que llegue chat.message.saved. Se acumulan en _pendingEnrichments
   * por message_id; cuando onMessageSaved se ejecuta para ese message_id, lee
   * los acumulados y los limpia.
   *
   * Politica simple: se acepta enrichment hasta 30s tras message_id; pasado
   * ese tiempo, se descarta (la respuesta ya fue construida o nunca llego).
   */
  async onContextEnriched(event) {
    const data = event.data || event;
    const { conversation_id, message_id, source, context_addition, priority } = data;
    if (!message_id || !source || !context_addition) return;

    if (!this._pendingEnrichments) this._pendingEnrichments = new Map();
    const list = this._pendingEnrichments.get(message_id) || [];
    list.push({
      source,
      context_addition,
      priority: typeof priority === 'number' ? priority : 1000,
      expires_at: data.expires_at,
      received_at: Date.now()
    });
    this._pendingEnrichments.set(message_id, list);

    this.logger.debug('prompt-builder.context.enriched', {
      conversation_id, message_id, source, priority
    });

    // GC: limpia entradas viejas (>5 min) — proteccion contra leak
    if (this._pendingEnrichments.size > 1000) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [k, v] of this._pendingEnrichments) {
        if (v.length === 0 || v[0].received_at < cutoff) this._pendingEnrichments.delete(k);
      }
    }
  }
}

module.exports = PromptBuilderModule;
