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
    this._loadBasePrompt();
    this._scanModulePrompts();

    // Subscribe to chat requests
    if (this.eventBus) {
      this.eventBus.on('prompt.compose.request', (e) => this.onComposeRequest(e));
      this.eventBus.on('prompt.module.request', (e) => this.onModulePromptRequest(e));
      this.eventBus.on('prompt.list.request', (e) => this.onListRequest(e));
    }

    this.logger.info('prompt-engine.loaded', {
      modules: this._prompts.size,
      hasBase: !!this._basePrompt
    });
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
    let entries;
    try {
      entries = fs.readdirSync(this._modulesDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

      const promptPath = path.join(this._modulesDir, entry.name, 'prompt.json');
      try {
        const prompt = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
        prompt._module = entry.name;
        this._prompts.set(entry.name, prompt);
      } catch {
        // Module has no prompt.json — that's fine, not all modules need AI
      }
    }
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

  _formatBase(runtimeContext) {
    if (!this._basePrompt) return '';
    const sections = [JSON.stringify(this._basePrompt, null, 2)];
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      sections.push(JSON.stringify({ _runtime: runtimeContext }, null, 2));
    }
    return sections.join('\n\n---\n\n');
  }

  // ==========================================
  // Event handlers (integrate with event-core)
  // ==========================================

  onComposeRequest(event) {
    const data = event.data || event;
    const { moduleName, userMessage, history, runtimeContext, correlationId } = data;

    const messages = this.buildMessages(moduleName, userMessage, history || [], runtimeContext);

    this.eventBus.emit('prompt.compose.response', {
      correlationId,
      messages,
      moduleName,
      historyCount: (history || []).length
    });
  }

  onModulePromptRequest(event) {
    const data = event.data || event;
    const { moduleName, correlationId } = data;

    const prompt = this._prompts.get(moduleName);
    this.eventBus.emit('prompt.module.response', {
      correlationId,
      moduleName,
      prompt: prompt || null,
      found: !!prompt
    });
  }

  onListRequest(event) {
    const data = event.data || event;
    const { correlationId } = data;

    const modules = [];
    for (const [name, prompt] of this._prompts) {
      modules.push({
        module: name,
        role: prompt.role,
        intent: prompt.intent,
        capabilities: prompt.capabilities || []
      });
    }

    this.eventBus.emit('prompt.list.response', {
      correlationId,
      modules,
      count: modules.length
    });
  }

  // ==========================================
  // Hot reload: watch for prompt.json changes
  // ==========================================

  reloadModule(moduleName) {
    const promptPath = path.join(this._modulesDir, moduleName, 'prompt.json');
    try {
      const prompt = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
      prompt._module = moduleName;
      this._prompts.set(moduleName, prompt);
      this.logger.info('prompt-engine.reloaded', { module: moduleName });
      return true;
    } catch (err) {
      this.logger.warn('prompt-engine.reload_failed', { module: moduleName, error: err.message });
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
}

module.exports = PromptEngine;
