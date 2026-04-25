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

    // Cache: moduleName → parsed prompt.json (persona: role, intent)
    this._prompts = new Map();
    // Cache: moduleName → parsed context.json (domain: capabilities, knowledge, workflow)
    this._contexts = new Map();
    this._basePrompt = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.config = context.moduleConfig || {};

    this._modulesDir = this.config.modulesDir || path.join(__dirname, '../..');
    this._loadBasePrompt();
    this._scanModulePrompts();

    this.logger.info('prompt-engine.loaded', {
      modules: this._prompts.size,
      hasBase: !!this._basePrompt
    });
  }

  async onUnload() {
    this._prompts.clear();
    this._contexts.clear();
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
      const contextPath = path.join(fullPath, 'context.json');
      const moduleJsonPath = path.join(fullPath, 'module.json');

      // Load context.json (domain knowledge — always injected, never replaced by custom prompt)
      try {
        const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
        context._module = moduleName;
        this._contexts.set(moduleName, context);
      } catch { /* no context.json = ok, module uses prompt.json only */ }

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
    const modulePrompt = moduleName ? this._prompts.get(moduleName) : null;
    const moduleContext = moduleName ? this._contexts.get(moduleName) : null;

    if (!modulePrompt && !moduleContext) return this._formatBase(runtimeContext);

    const sections = [];

    // 1. Base prompt (global rules, tone, identity)
    if (this._basePrompt) {
      sections.push(JSON.stringify(this._basePrompt, null, 2));
    }

    // 2. Module context (capabilities, domain knowledge, workflow — always present)
    if (moduleContext) {
      sections.push(JSON.stringify(moduleContext, null, 2));
    }

    // 3. Module prompt (role, intent — replaceable by custom prompt)
    if (modulePrompt) {
      sections.push(JSON.stringify(modulePrompt, null, 2));
    }

    // 4. Active context as plain text — LLM must use these IDs in tool calls
    const contextText = this._buildContextText(runtimeContext);
    if (contextText) sections.push(contextText);

    // 5. Runtime context JSON (full structured data)
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      sections.push(JSON.stringify({ _runtime: runtimeContext }, null, 2));
    }

    return sections.join('\n\n---\n\n');
  }

  _buildContextText(runtimeContext) {
    if (!runtimeContext.project_id) return null;
    const lines = [
      'CONTEXTO ACTIVO — usa estos valores directamente en las tools. No los pidas al usuario.',
    ];
    const name = runtimeContext.project?.name;
    if (name) lines.push(`Proyecto: ${name}`);
    lines.push(`project_id: ${runtimeContext.project_id}`);
    if (runtimeContext.conversation_id) {
      lines.push(`conversation_id: ${runtimeContext.conversation_id}`);
    }
    if (runtimeContext.dependencies?.length) {
      lines.push(`Dependencias: ${runtimeContext.dependencies.map(d => d.name || d.id).join(', ')}`);
    }
    return lines.join('\n');
  }


  _formatBase(runtimeContext) {
    if (!this._basePrompt) return '';
    const sections = [JSON.stringify(this._basePrompt, null, 2)];
    const contextText = this._buildContextText(runtimeContext);
    if (contextText) sections.push(contextText);
    if (runtimeContext && Object.keys(runtimeContext).length > 0) {
      sections.push(JSON.stringify({ _runtime: runtimeContext }, null, 2));
    }
    return sections.join('\n\n---\n\n');
  }


  // ==========================================
  // Pipeline: chat.message.enriched → chat.prompt.ready
  // ==========================================

  async onChatMessageEnriched(event) {
    const data = event.data || event;
    const {
      path, conversation_id, content, project_id, message_id, messages,
      decision, context, page
    } = data;

    if (path !== 'llm') return;

    const runtimeContext = {};
    if (project_id) runtimeContext.project_id = project_id;
    if (conversation_id) runtimeContext.conversation_id = conversation_id;

    if (context) {
      if (context.project) runtimeContext.project = context.project;
      if (context.parentChain?.length) runtimeContext.parent_projects = context.parentChain;
      if (context.dependencies?.length) runtimeContext.dependencies = context.dependencies;
      if (context.system) runtimeContext.system = context.system;
    }

    const moduleName = (page ? this.resolveRouteToModule(page) : null) || decision?.module || null;

    const systemPrompt = this.buildSystemPrompt(moduleName, runtimeContext);
    const history = Array.isArray(messages) ? messages : [];

    await this.eventBus.publish('chat.prompt.ready', {
      conversation_id,
      project_id,
      message_id,
      content,
      prompt: systemPrompt,
      messages: history,
      decision: { ...decision, module: moduleName || decision?.module || null }
    });

    this.logger.debug('prompt-engine.ready', { conversation_id, page, module: moduleName });
  }
}

module.exports = PromptEngine;
