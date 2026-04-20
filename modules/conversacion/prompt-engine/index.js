const fs = require('fs');
const path = require('path');

/**
 * PromptEngine — Hybrid prompt system for LLM-native modules
 *
 * Each module has a prompt.json that IS the prompt. No templates, no variables,
 * no composition pipeline. The engine reads it, merges with base, sends to LLM.
 *
 * Replaces: prompt-composer (450 lines) + prompt-manager (1700 lines) +
 *           buildAIMessages complexity in chat-ai-bridge (~200 lines)
 *
 * @module prompt-engine
 * @version 1.0.0
 */
class PromptEngine {
  constructor() {
    this.name = 'prompt-engine';
    this.version = '1.0.0';

    this.logger = null;
    this.eventBus = null;
    this.config = null;

    // Cache: moduleName → parsed prompt.json
    this._prompts = new Map();
    this._basePrompt = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    this._modulesDir = this.config.modulesDir || path.join(__dirname, '..');
    this._listRequestId = null;

    this._loadBasePrompt();
    this._scanModulePrompts();

    // Request DB prompts from prompt-manager — they override filesystem on name match
    this._requestDbPrompts();

    this.logger.info('prompt-engine.loaded', {
      modules: this._prompts.size,
      hasBase: !!this._basePrompt
    });
  }

  _requestDbPrompts() {
    const { randomUUID } = require('crypto');
    this._listRequestId = randomUUID();
    this.eventBus.publish('prompt.list.request', { request_id: this._listRequestId }).catch(() => {});
  }

  async onUnload() {
    this._prompts.clear();
    this._basePrompt = null;
  }

  // ==========================================
  // Core: Load prompts from filesystem
  // ==========================================

  _loadBasePrompt() {
    const basePath = path.join(this._modulesDir, '_shared', 'base.prompt.json');
    try {
      this._basePrompt = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    } catch {
      this._basePrompt = null;
      this.logger.warn('prompt-engine.no_base_prompt', { path: basePath });
    }
  }

  _scanModulePrompts() {
    this._scanDir(this._modulesDir, '');
  }

  /**
   * Recursively scan directories for prompt.json files.
   * Handles nested modules (e.g., pizzepos/menu-generator, facturacion/asesoria).
   * If a module has module.json but no prompt.json, auto-generates a minimal prompt.
   */
  _scanDir(dir, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const moduleName = prefix ? `${prefix}/${entry.name}` : entry.name;
      const promptPath = path.join(fullPath, 'prompt.json');
      const moduleJsonPath = path.join(fullPath, 'module.json');

      try {
        // Try prompt.json first (explicit, hand-crafted)
        const prompt = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
        prompt._module = moduleName;
        this._prompts.set(moduleName, prompt);
      } catch {
        // No prompt.json — try auto-generating from module.json
        try {
          const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));
          const autoPrompt = this._generateFromModuleJson(moduleName, moduleJson);
          if (autoPrompt) {
            this._prompts.set(moduleName, autoPrompt);
          }
        } catch {
          // No module.json either — check for subdirectories (e.g., pizzepos/)
        }
      }

      // Recurse into subdirectories for nested modules
      this._scanDir(fullPath, moduleName);
    }
  }

  /**
   * Auto-generate a minimal prompt.json from a module's module.json.
   * This ensures new modules get a prompt automatically without manual work.
   * The generated prompt is intentionally minimal — developers should create
   * a proper prompt.json for modules that interact with the AI.
   */
  _generateFromModuleJson(moduleName, moduleJson) {
    if (!moduleJson.description) return null;

    const prompt = {
      _type: 'module_prompt',
      _module: moduleName,
      _auto_generated: true,
      role: moduleJson.name || moduleName,
      intent: moduleJson.description
    };

    // Extract tool names if present
    if (moduleJson.tools && moduleJson.tools.length > 0) {
      prompt.capabilities = moduleJson.tools.map(t =>
        typeof t === 'string' ? t : (t.description || t.name)
      );
    }

    // Extract events
    const events = moduleJson.events || {};
    const subscribes = events.subscribes || moduleJson.subscribes || [];
    const publishes = events.publishes || moduleJson.publishes || [];

    if (subscribes.length > 0 || publishes.length > 0) {
      prompt.integrations = {};
      if (subscribes.length > 0) {
        prompt.integrations.listens_to = subscribes.map(s =>
          typeof s === 'string' ? s : (s.event || s)
        );
      }
      if (publishes.length > 0) {
        prompt.integrations.emits = publishes.map(p =>
          typeof p === 'string' ? p : (p.event || p)
        );
      }
    }

    return prompt;
  }

  // ==========================================
  // Route → Module resolution
  // ==========================================

  /**
   * Resolve a frontend route to a module name.
   * Routes like '/menu-generator' map to 'pizzepos/menu-generator'.
   * Tries exact match first, then suffix match against loaded modules.
   *
   * @param {string} route - Frontend route (e.g., '/menu-generator')
   * @returns {string|null} Module name or null if not found
   */
  resolveRouteToModule(route) {
    if (!route) return null;

    // Strip leading slash: '/menu-generator' → 'menu-generator'
    const slug = route.replace(/^\/+/, '');
    if (!slug) return null;

    // 1. Exact match (e.g., 'escandallo' → 'escandallo')
    if (this._prompts.has(slug)) return slug;

    // 2. Suffix match (e.g., 'menu-generator' → 'pizzepos/menu-generator')
    for (const moduleName of this._prompts.keys()) {
      if (moduleName.endsWith('/' + slug)) return moduleName;
    }

    return null;
  }

  // ==========================================
  // Core: Build system prompt for a module
  // ==========================================

  /**
   * Build the complete system prompt for a module.
   * Returns a single string optimized for LLM consumption.
   *
   * Strategy: JSON sections concatenated. The LLM reads structured data
   * more efficiently than free-form markdown with headers.
   *
   * @param {string} moduleName - The module to build prompt for
   * @param {object} [runtimeContext] - Optional runtime data (user, project, page)
   * @returns {string} Complete system prompt ready for the LLM
   */
  buildSystemPrompt(moduleName, runtimeContext = {}) {
    const modulePrompt = this._prompts.get(moduleName);
    if (!modulePrompt) return this._formatBase(runtimeContext);

    const sections = [];

    // 1. Base prompt (global rules, tone, identity)
    if (this._basePrompt) {
      sections.push(JSON.stringify(this._basePrompt, null, 2));
    }

    // 2. Module prompt (the specific role)
    sections.push(JSON.stringify(modulePrompt, null, 2));

    // 3. Runtime context (injected live data, if any)
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      sections.push(JSON.stringify({ _runtime: runtimeContext }, null, 2));
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Build the complete messages array ready for an LLM API call.
   * This is the ONE method that replaces buildAIMessages + FIFO + trimming.
   *
   * @param {string} moduleName - Module context
   * @param {string} userMessage - Current user message
   * @param {Array} history - Previous messages [{role, content}]
   * @param {object} [runtimeContext] - Optional runtime data
   * @returns {Array} Messages array [{role, content}]
   */
  buildMessages(moduleName, userMessage, history = [], runtimeContext = {}) {
    const system = this.buildSystemPrompt(moduleName, runtimeContext);

    const messages = [{ role: 'system', content: system }];

    // History: just take the last N. No token counting.
    // Modern LLMs have 128k+ context. If the provider rejects, caller retries with less.
    const maxHistory = this.config.maxHistory || 40;
    const trimmedHistory = history.length > maxHistory
      ? history.slice(-maxHistory)
      : history;

    for (const msg of trimmedHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Current user message (avoid duplicating if already last in history)
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || last.content !== userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }

    return messages;
  }

  /**
   * Build system prompt combining multiple modules.
   * Useful for pages that span several modules (e.g., a POS page needs
   * comandero + productos + cobros context simultaneously).
   *
   * @param {string[]} moduleNames - Modules to combine
   * @param {object} [runtimeContext] - Optional runtime data
   * @returns {string} Combined system prompt
   */
  buildMultiModulePrompt(moduleNames, runtimeContext = {}) {
    const sections = [];

    if (this._basePrompt) {
      sections.push(JSON.stringify(this._basePrompt, null, 2));
    }

    for (const name of moduleNames) {
      const prompt = this._prompts.get(name);
      if (prompt) {
        sections.push(JSON.stringify(prompt, null, 2));
      }
    }

    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      sections.push(JSON.stringify({ _runtime: runtimeContext }, null, 2));
    }

    return sections.join('\n\n---\n\n');
  }

  _formatBase(runtimeContext) {
    if (!this._basePrompt) return '';
    const sections = [JSON.stringify(this._basePrompt, null, 2)];
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      sections.push(JSON.stringify({ _runtime: runtimeContext }, null, 2));
    }
    return sections.join('\n\n---\n\n');
  }

  // ==========================================
  // Hot reload: watch for prompt.json changes
  // ==========================================

  reloadModule(moduleName) {
    // Supports nested modules: 'pizzepos/menu-generator' → modules/pizzepos/menu-generator/prompt.json
    const modulePath = path.join(this._modulesDir, ...moduleName.split('/'));
    const promptPath = path.join(modulePath, 'prompt.json');
    const moduleJsonPath = path.join(modulePath, 'module.json');

    try {
      const prompt = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
      prompt._module = moduleName;
      this._prompts.set(moduleName, prompt);
      this.logger.info('prompt-engine.reloaded', { module: moduleName });
      return true;
    } catch {
      // No prompt.json — try auto-generating from module.json
      try {
        const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf8'));
        const autoPrompt = this._generateFromModuleJson(moduleName, moduleJson);
        if (autoPrompt) {
          this._prompts.set(moduleName, autoPrompt);
          this.logger.info('prompt-engine.auto_generated', { module: moduleName });
          return true;
        }
      } catch { /* noop */ }

      this.logger.warn('prompt-engine.reload_failed', { module: moduleName });
      return false;
    }
  }

  reloadAll() {
    this._prompts.clear();
    this._loadBasePrompt();
    this._scanModulePrompts();
    return this._prompts.size;
  }

  // ==========================================
  // Introspection (for debugging / admin UI)
  // ==========================================

  getLoadedModules() {
    return Array.from(this._prompts.keys());
  }

  getPrompt(moduleName) {
    return this._prompts.get(moduleName) || null;
  }

  getStats() {
    return {
      modulesWithPrompts: this._prompts.size,
      hasBasePrompt: !!this._basePrompt,
      modules: this.getLoadedModules()
    };
  }

  // ==========================================
  // Sync from prompt-manager (DB overrides filesystem)
  // ==========================================

  onPromptListResponse(event) {
    const data = event.data || event;
    if (data.request_id !== this._listRequestId) return;
    this._listRequestId = null;

    const prompts = data.data?.prompts || data.prompts || [];
    let merged = 0;
    for (const p of prompts) {
      if (!p.name || !p.content) continue;
      let parsed;
      try { parsed = JSON.parse(p.content); } catch { continue; }
      parsed._module = p.name;
      parsed._source = 'db';
      parsed._id = p.id;
      this._prompts.set(p.name, parsed);
      merged++;
    }
    if (merged > 0) {
      this.logger.info('prompt-engine.db_merged', { count: merged });
    }
  }

  onPromptCreated(event) { this._requestDbPrompts(); }
  onPromptUpdated(event) { this._requestDbPrompts(); }

  onPromptDeleted(event) {
    const data = event.data || event;
    // Remove DB override for this ID — reload filesystem fallback by name
    for (const [name, p] of this._prompts.entries()) {
      if (p._source === 'db' && (p._id === data.id || p.id === data.id)) {
        this._prompts.delete(name);
        this.reloadModule(name);
        break;
      }
    }
  }

  // ==========================================
  // Pipeline: chat.message.routed → chat.prompt.ready
  // ==========================================

  async onChatMessageRouted(event) {
    const data = event.data || event;
    const { path, conversation_id, content, project_id, message_id, messages, decision } = data;

    if (path !== 'llm') return;

    const moduleName = decision?.module || null;
    const systemPrompt = this.buildSystemPrompt(moduleName);
    const history = Array.isArray(messages) ? messages : [];

    await this.eventBus.publish('chat.prompt.ready', {
      conversation_id,
      project_id,
      message_id,
      content,
      prompt: systemPrompt,
      messages: history,
      decision
    });

    this.logger.debug('prompt-engine.ready', { conversation_id, module: moduleName });
  }
}

module.exports = PromptEngine;
