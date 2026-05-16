/**
 * prompt-manager — Reescritura canonica POC2.
 *
 * Cumple los 24 contratos transversales:
 *   - errors.contract: handlers devuelven { status, data | error: { code, message, details? } }
 *     con codigos canonicos (RESOURCE_NOT_FOUND + entity_type, INVALID_INPUT, ALREADY_EXISTS,
 *     UNKNOWN_ERROR). Helper _errorResponse + _classifyHandlerError + _handleHandlerError.
 *   - events.contract: publish/subscribe via this.eventBus. _publicarEvento propaga correlation_id.
 *   - lifecycle.contract: onLoad recibe context, onUnload clearTimeout pendings + clear Maps.
 *   - observability.contract: logger estructurado + metrics.increment/timing en cada handler.
 *   - persistence.contract: SQLite via database-manager, schema en disco, project_id `_prompts` global.
 *   - tools.contract: cada tool retorna { status, data | error } canonico, errores_conocidos del catalogo.
 *
 * Migracion del monolito 2.0.0 (1702 LOC) — ver arquitectura/migracion/notas/prompt-manager-mapa.md.
 */

'use strict';

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const SLOT_TYPES  = ['system', 'context', 'prefix', 'suffix', 'format'];
const SLOT_ICONS  = { system: 'system', context: 'context', prefix: 'prefix', suffix: 'suffix', format: 'format' };
const GLOBAL_PROJECT_ID = '_prompts';
const DB_TIMEOUT_MS     = 10000;
const SCHEMA_TIMEOUT_MS = 5000;

class PromptManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'prompt-manager';
    this.version = '3.0.0';
    this.config    = null;
    this.uiHandler = null;

    this.prompts = new Map();
    this.presets = new Map();

    this.pendingDb     = new Map();
    this.pendingSchema = new Map();
    this.schemaReady   = false;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger    = context.logger;
    this.eventBus  = context.eventBus;
    this.metrics   = context.metrics || null;
    this.config    = context.moduleConfig || {};
    this.uiHandler = context.uiHandler || null;

    this.logger.info('prompt-manager.module.loading', { module: this.name, version: this.version });

    try {
      await this._initializeSchema();
    } catch (err) {
      this.logger.warn('prompt-manager.schema.init.failed', { error: err.message });
    }

    try {
      await this._loadFromDatabase();
    } catch (err) {
      this.logger.warn('prompt-manager.cache.load.failed', { error: err.message });
    }

    this.logger.info('prompt-manager.module.loaded', {
      prompts_count: this.prompts.size,
      presets_count: this.presets.size,
      schema_ready: this.schemaReady
    });
  }

  async onUnload() {
    this.logger?.info('prompt-manager.module.unloading', { module: this.name });

    for (const { timeout, reject } of this.pendingDb.values()) {
      clearTimeout(timeout);
      reject(new Error('module unloading'));
    }
    this.pendingDb.clear();

    for (const { timeout, reject } of this.pendingSchema.values()) {
      clearTimeout(timeout);
      reject(new Error('module unloading'));
    }
    this.pendingSchema.clear();

    this.prompts.clear();
    this.presets.clear();
    this.schemaReady = false;

    this.logger?.info('prompt-manager.module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus subscribers (database-manager IPC)
  // ==========================================

  onDbQueryResponse(event) {
    const payload = event?.data || event || {};
    const { request_id, success, data, error } = payload;
    const pending = this.pendingDb.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingDb.delete(request_id);

    const ok = success === true || (success === undefined && !error);
    if (ok) pending.resolve(data ?? payload.rows ?? []);
    else pending.reject(new Error(error || 'db query failed'));
  }

  onDbSchemaInitResponse(event) {
    const payload = event?.data || event || {};
    const { request_id, success, error } = payload;
    const pending = this.pendingSchema.get(request_id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingSchema.delete(request_id);

    if (success === true || (success === undefined && !error)) {
      this.schemaReady = true;
      pending.resolve(true);
    } else {
      pending.reject(new Error(error || 'schema init failed'));
    }
  }

  // ==========================================
  // Bus subscribers (RPC cross-modulo)
  // ==========================================

  async onPromptGetRequest(event) {
    const payload = event?.data || event || {};
    const { request_id, name, id } = payload;
    const startTime = Date.now();

    try {
      const prompt = this._findPrompt({ id, name });

      if (!prompt) {
        await this._publicarEvento('prompt.get.response', {
          request_id,
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: `Prompt not found: ${id || name}`, details: { entity_type: 'prompt', entity_id: id || name } }
        }, payload);
        this.metrics?.increment('prompt-manager.get.errors', { code: 'RESOURCE_NOT_FOUND' });
        return;
      }

      await this._publicarEvento('prompt.get.response', {
        request_id,
        success: true,
        prompt: this._toPublicPrompt(prompt)
      }, payload);

      this.metrics?.increment('prompt-manager.get.success');
      this.metrics?.timing('prompt-manager.get.duration_ms', Date.now() - startTime);
    } catch (err) {
      this.logger.error('prompt-manager.get.request.failed', { error: err.message });
      this.metrics?.increment('prompt-manager.get.errors', { code: 'UNKNOWN_ERROR' });
      await this._publicarEvento('prompt.get.response', {
        request_id,
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, payload);
    }
  }

  async onPromptListRequest(event) {
    const payload = event?.data || event || {};
    const { request_id } = payload;

    try {
      const prompts = Array.from(this.prompts.values()).map(p => this._toPublicPrompt(p));
      await this._publicarEvento('prompt.list.response', {
        request_id,
        success: true,
        prompts
      }, payload);
      this.metrics?.increment('prompt-manager.list.success');
    } catch (err) {
      this.logger.error('prompt-manager.list.request.failed', { error: err.message });
      this.metrics?.increment('prompt-manager.list.errors', { code: 'UNKNOWN_ERROR' });
      await this._publicarEvento('prompt.list.response', {
        request_id,
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, payload);
    }
  }

  async onAICompletionCompleted(event) {
    const payload = event?.data || event || {};
    const { prompt_id, version } = payload;
    if (!prompt_id) return;
    try {
      await this._recordUsage(prompt_id, version || null);
    } catch (err) {
      this.logger.warn('prompt-manager.analytics.record.failed', { prompt_id, error: err.message });
    }
  }

  async onAIRequestStarted(event) {
    const payload = event?.data || event || {};
    const { prompt_id } = payload;
    if (!prompt_id) return;
    this.metrics?.increment('prompt-manager.usage.started', { prompt_id });
  }

  // ==========================================
  // Tools (LLM)
  // ==========================================

  async handleToolPromptList(args, sourcePayload = null) {
    const startTime = Date.now();
    try {
      const filters = (args && typeof args === 'object') ? args : {};
      const { slot_type, tag, search } = filters;

      let results = Array.from(this.prompts.values());
      if (slot_type && SLOT_TYPES.includes(slot_type)) {
        results = results.filter(p => p.slot_type === slot_type);
      }
      if (tag) results = results.filter(p => Array.isArray(p.tags) && p.tags.includes(tag));
      if (search) {
        const s = String(search).toLowerCase();
        results = results.filter(p =>
          (p.name || '').toLowerCase().includes(s) ||
          (p.title || '').toLowerCase().includes(s) ||
          (p.description || '').toLowerCase().includes(s)
        );
      }

      this.metrics?.increment('prompt-manager.tool.list.success');
      this.metrics?.timing('prompt-manager.tool.list.duration_ms', Date.now() - startTime);

      return {
        status: 200,
        data: {
          prompts: results.map(p => this._toPublicPrompt(p, { include_content: false })),
          total: results.length,
          filters: { slot_type, tag, search }
        }
      };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.tool.list.failed', err);
    }
  }

  async handleToolPromptGet(args, sourcePayload = null) {
    const startTime = Date.now();
    try {
      const { id, name } = (args && typeof args === 'object') ? args : {};
      if (!id && !name) {
        this.metrics?.increment('prompt-manager.tool.get.errors', { code: 'INVALID_INPUT' });
        return this._errorResponse(400, 'INVALID_INPUT', 'Either id or name is required', { kind: 'shape' });
      }

      const prompt = this._findPrompt({ id, name });
      if (!prompt) {
        this.metrics?.increment('prompt-manager.tool.get.errors', { code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id || name}`, { entity_type: 'prompt', entity_id: id || name });
      }

      try { await this._recordUsage(prompt.id, prompt.current_version); } catch (_) { /* analytics non-fatal */ }

      this.metrics?.increment('prompt-manager.tool.get.success');
      this.metrics?.timing('prompt-manager.tool.get.duration_ms', Date.now() - startTime);

      return { status: 200, data: { prompt: this._toPublicPrompt(prompt) } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.tool.get.failed', err);
    }
  }

  async handleToolPromptRender(args, sourcePayload = null) {
    const startTime = Date.now();
    try {
      const { id, name, variables } = (args && typeof args === 'object') ? args : {};
      if (!id && !name) {
        this.metrics?.increment('prompt-manager.tool.render.errors', { code: 'INVALID_INPUT' });
        return this._errorResponse(400, 'INVALID_INPUT', 'Either id or name is required', { kind: 'shape' });
      }

      const prompt = this._findPrompt({ id, name });
      if (!prompt) {
        this.metrics?.increment('prompt-manager.tool.render.errors', { code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id || name}`, { entity_type: 'prompt', entity_id: id || name });
      }

      const rendered = this._renderTemplateString(prompt.content, variables || {});
      const missing = this._missingVariables(prompt.variables, variables);

      try { await this._recordUsage(prompt.id, prompt.current_version); } catch (_) { /* non-fatal */ }

      this.metrics?.increment('prompt-manager.tool.render.success');
      this.metrics?.timing('prompt-manager.tool.render.duration_ms', Date.now() - startTime);

      return {
        status: 200,
        data: {
          prompt_id: prompt.id,
          prompt_name: prompt.name,
          rendered,
          variables_used: variables || {},
          missing_variables: missing.length > 0 ? missing : undefined
        }
      };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.tool.render.failed', err);
    }
  }

  // ==========================================
  // HTTP API handlers (canonicos)
  // ==========================================

  async handleCreatePrompt(req, context) {
    try {
      return await this._createPromptInternal(req?.body || {}, req?.body || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.create.failed', err);
    }
  }

  async handleListPrompts(req, context) {
    try {
      const filters = req?.query || {};
      const prompts = this._filterPrompts(filters);
      return {
        status: 200,
        data: {
          prompts: prompts.map(p => this._toPublicPrompt(p, { include_content: false })),
          total: prompts.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.list.failed', err);
    }
  }

  async handleGetPrompt(req, context) {
    try {
      const id = (req?.params || context?.params || {}).id;
      const prompt = this._findPrompt({ id });
      if (!prompt) {
        this.metrics?.increment('prompt-manager.get.errors', { code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id}`, { entity_type: 'prompt', entity_id: id });
      }
      return { status: 200, data: { prompt: this._toPublicPrompt(prompt) } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.get.failed', err);
    }
  }

  async handleUpdatePrompt(req, context) {
    try {
      const id = (req?.params || context?.params || {}).id;
      const updates = req?.body || {};
      return await this._updatePromptInternal(id, updates, updates);
    } catch (err) {
      return this._handleHandlerError('prompt-manager.update.failed', err);
    }
  }

  async handleDeletePrompt(req, context) {
    try {
      const id = (req?.params || context?.params || {}).id;
      return await this._deletePromptInternal(id, req?.body || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.delete.failed', err);
    }
  }

  async handleListVersions(req, context) {
    try {
      const id = (req?.params || context?.params || {}).id;
      const prompt = this._findPrompt({ id });
      if (!prompt) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id}`, { entity_type: 'prompt', entity_id: id });
      }
      const projectId = prompt.project_id || GLOBAL_PROJECT_ID;
      const versions = await this._db(projectId,
        'SELECT version, content, variables, created_at, created_by FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC',
        [id]);
      return { status: 200, data: { prompt_id: id, current_version: prompt.current_version, versions } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.versions.failed', err);
    }
  }

  async handleRenderTemplate(req, context) {
    try {
      const id = (req?.params || context?.params || {}).id;
      const { variables, version } = req?.body || {};
      const prompt = this._findPrompt({ id });
      if (!prompt) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id}`, { entity_type: 'prompt', entity_id: id });
      }

      let content = prompt.content;
      if (version && version !== prompt.current_version) {
        const projectId = prompt.project_id || GLOBAL_PROJECT_ID;
        const rows = await this._db(projectId,
          'SELECT content FROM prompt_versions WHERE prompt_id = ? AND version = ?',
          [id, version]);
        if (Array.isArray(rows) && rows.length > 0) content = rows[0].content;
        else return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Version not found: ${version}`, { entity_type: 'prompt_version', entity_id: version });
      }

      const rendered = this._renderTemplateString(content, variables || {});
      try { await this._recordUsage(id, version || prompt.current_version); } catch (_) { /* non-fatal */ }

      return {
        status: 200,
        data: {
          prompt_id: id,
          version: version || prompt.current_version,
          rendered,
          variables_used: variables || {}
        }
      };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.render.failed', err);
    }
  }

  async handleCreatePreset(req, context) {
    try {
      return await this._createPresetInternal(req?.body || {}, req?.body || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.preset.create.failed', err);
    }
  }

  async handleListPresets(req, context) {
    try {
      const presets = Array.from(this.presets.values());
      return { status: 200, data: { presets, total: presets.length } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.preset.list.failed', err);
    }
  }

  async handleGetPreset(req, context) {
    try {
      const id = (req?.params || context?.params || {}).id;
      const preset = this.presets.get(id);
      if (!preset) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Preset not found: ${id}`, { entity_type: 'preset', entity_id: id });
      }
      const slots = await this._loadPresetSlots(id);
      return { status: 200, data: { preset: { ...preset, slots } } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.preset.get.failed', err);
    }
  }

  async handleDeletePreset(req, context) {
    try {
      const id = (req?.params || context?.params || {}).id;
      return await this._deletePresetInternal(id, req?.body || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.preset.delete.failed', err);
    }
  }

  async handleGetAnalytics(req, context) {
    try {
      const { prompt_id } = req?.query || {};
      const rows = await this._db(GLOBAL_PROJECT_ID,
        'SELECT * FROM prompt_analytics' + (prompt_id ? ' WHERE prompt_id = ?' : ''),
        prompt_id ? [prompt_id] : []);
      return { status: 200, data: { analytics: rows || [], total: (rows || []).length } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.analytics.failed', err);
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: 'prompt-manager',
        prompts_count: this.prompts.size,
        presets_count: this.presets.size,
        schema_ready: this.schemaReady
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: { prompts: this.prompts.size, presets: this.presets.size },
        by_slot_type: Object.fromEntries(
          SLOT_TYPES.map(type => [type, Array.from(this.prompts.values()).filter(p => p.slot_type === type).length])
        )
      }
    };
  }

  async handleGetUIState(req, context) {
    try {
      const promptsBySlot = {};
      for (const t of SLOT_TYPES) promptsBySlot[t] = [];
      for (const prompt of this.prompts.values()) {
        const slot = SLOT_TYPES.includes(prompt.slot_type) ? prompt.slot_type : 'system';
        promptsBySlot[slot].push({
          id: prompt.id, name: prompt.name, title: prompt.title,
          description: prompt.description, tags: prompt.tags || [],
          level: prompt.level || 'GLOBAL'
        });
      }
      const slotTypes = SLOT_TYPES.map(type => ({
        id: type, name: type.charAt(0).toUpperCase() + type.slice(1),
        icon: SLOT_ICONS[type], count: promptsBySlot[type].length
      }));
      const presets = Array.from(this.presets.values()).map(p => ({ id: p.id, name: p.name, description: p.description }));
      const stats = {
        total_prompts: this.prompts.size,
        total_presets: this.presets.size,
        by_slot: Object.fromEntries(SLOT_TYPES.map(t => [t, promptsBySlot[t].length]))
      };
      return { status: 200, data: { slotTypes, promptsBySlot, presets, stats } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.state.failed', err);
    }
  }

  // ==========================================
  // UI handlers (mqttRequest cross-modulo)
  // ==========================================

  async handleUIList(data) {
    try {
      const prompts = this._filterPrompts(data || {});
      const promptsBySlot = {};
      for (const t of SLOT_TYPES) promptsBySlot[t] = [];
      const promptsList = prompts.map(p => this._toPublicPrompt(p));
      for (const p of promptsList) if (promptsBySlot[p.slot_type]) promptsBySlot[p.slot_type].push(p);
      const slotTypes = SLOT_TYPES.map(type => ({
        id: type, name: type.charAt(0).toUpperCase() + type.slice(1),
        icon: SLOT_ICONS[type], count: promptsBySlot[type].length
      }));
      const stats = {
        total: prompts.length,
        by_slot: Object.fromEntries(SLOT_TYPES.map(t => [t, promptsBySlot[t].length]))
      };
      return { status: 200, data: { prompts: promptsList, promptsBySlot, slotTypes, stats } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.list.failed', err);
    }
  }

  async handleUIGet(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
      const prompt = this._findPrompt({ id });
      if (!prompt) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id}`, { entity_type: 'prompt', entity_id: id });
      return { status: 200, data: { prompt: this._toPublicPrompt(prompt) } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.get.failed', err);
    }
  }

  async handleUICreate(data) {
    try {
      return await this._createPromptInternal(data || {}, data || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.create.failed', err);
    }
  }

  async handleUIUpdate(data) {
    try {
      const { id, ...updates } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
      return await this._updatePromptInternal(id, updates, data || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.update.failed', err);
    }
  }

  async handleUIDelete(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
      return await this._deletePromptInternal(id, data || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.delete.failed', err);
    }
  }

  async handleUIVersions(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
      const prompt = this._findPrompt({ id });
      if (!prompt) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id}`, { entity_type: 'prompt', entity_id: id });
      const projectId = prompt.project_id || GLOBAL_PROJECT_ID;
      const versions = await this._db(projectId,
        'SELECT version, content, variables, created_at, created_by FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC',
        [id]);
      return { status: 200, data: { prompt_id: id, current_version: prompt.current_version, versions } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.versions.failed', err);
    }
  }

  async handleUIPresetList(data) {
    try {
      const presets = Array.from(this.presets.values()).map(p => ({
        id: p.id, name: p.name, description: p.description,
        created_at: p.created_at, updated_at: p.updated_at
      }));
      return { status: 200, data: { presets, total: presets.length } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.preset.list.failed', err);
    }
  }

  async handleUIPresetGet(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
      const preset = this.presets.get(id);
      if (!preset) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Preset not found: ${id}`, { entity_type: 'preset', entity_id: id });
      const slots = await this._loadPresetSlots(id);
      return { status: 200, data: { preset: { ...preset, slots } } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.preset.get.failed', err);
    }
  }

  async handleUIPresetCreate(data) {
    try {
      return await this._createPresetInternal(data || {}, data || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.preset.create.failed', err);
    }
  }

  async handleUIPresetDelete(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
      return await this._deletePresetInternal(id, data || {});
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.preset.delete.failed', err);
    }
  }

  async handleUIPresetApply(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
      const preset = this.presets.get(id);
      if (!preset) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Preset not found: ${id}`, { entity_type: 'preset', entity_id: id });

      const slots = await this._loadPresetSlots(id);
      const composerState = {};
      for (const t of SLOT_TYPES) composerState[t] = [];
      for (const slotType of Object.keys(slots)) {
        for (const promptId of slots[slotType] || []) {
          const prompt = this.prompts.get(promptId);
          if (prompt && composerState[slotType]) {
            composerState[slotType].push({
              id: prompt.id, name: prompt.name, title: prompt.title,
              content: prompt.content, variables: prompt.variables
            });
          }
        }
      }
      return { status: 200, data: { preset: { id, name: preset.name }, composerState } };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.preset.apply.failed', err);
    }
  }

  async handleUIComposerRender(data) {
    try {
      const { slots, variables } = data || {};
      if (!slots) return this._errorResponse(400, 'INVALID_INPUT', 'slots is required', { kind: 'shape', field: 'slots' });

      const parts = [];
      const totalVariables = new Set();
      for (const slotType of SLOT_TYPES) {
        const slotPromptIds = slots[slotType] || [];
        for (const promptId of slotPromptIds) {
          const prompt = this.prompts.get(promptId);
          if (!prompt) continue;
          if (Array.isArray(prompt.variables)) {
            prompt.variables.forEach(v => totalVariables.add(v.name || v));
          }
          let content = prompt.content;
          if (variables) content = this._renderTemplateString(content, variables);
          parts.push({
            slot_type: slotType, slot_icon: SLOT_ICONS[slotType],
            prompt_id: prompt.id, prompt_name: prompt.name, content
          });
        }
      }
      const finalPrompt = parts.map(p => p.content).join('\n\n');
      const estimatedTokens = Math.ceil(finalPrompt.length / 4);
      return {
        status: 200,
        data: {
          parts, finalPrompt, estimatedTokens,
          variables: Array.from(totalVariables),
          variablesProvided: variables || {}
        }
      };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.composer.render.failed', err);
    }
  }

  async handleUIAnalytics(data) {
    try {
      const { prompt_id } = data || {};
      const rows = await this._db(GLOBAL_PROJECT_ID,
        'SELECT * FROM prompt_analytics' + (prompt_id ? ' WHERE prompt_id = ?' : ''),
        prompt_id ? [prompt_id] : []);
      const analytics = rows || [];
      const topPrompts = [...analytics]
        .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
        .slice(0, 10)
        .map(a => {
          const p = this.prompts.get(a.prompt_id);
          return {
            prompt_id: a.prompt_id,
            prompt_name: p?.name || 'Unknown',
            slot_type: p?.slot_type || 'system',
            slot_icon: SLOT_ICONS[p?.slot_type] || 'system',
            usage_count: a.usage_count || 0,
            last_used: a.last_used
          };
        });
      const bySlot = {};
      for (const slotType of SLOT_TYPES) {
        const slotPromptIds = Array.from(this.prompts.values()).filter(p => p.slot_type === slotType).map(p => p.id);
        const slotAnalytics = analytics.filter(a => slotPromptIds.includes(a.prompt_id));
        bySlot[slotType] = {
          count: slotPromptIds.length,
          total_usage: slotAnalytics.reduce((sum, a) => sum + (a.usage_count || 0), 0)
        };
      }
      return {
        status: 200,
        data: {
          total_prompts: this.prompts.size,
          total_presets: this.presets.size,
          topPrompts, bySlot, analytics
        }
      };
    } catch (err) {
      return this._handleHandlerError('prompt-manager.ui.analytics.failed', err);
    }
  }

  // ==========================================
  // Internals: domain operations (deduplicated)
  // ==========================================

  async _createPromptInternal(input, sourcePayload) {
    const { name, title, description, content, slot_type, variables, tags, metadata, project_id } = input || {};

    if (!name || typeof name !== 'string') {
      this.metrics?.increment('prompt-manager.create.errors', { code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'name is required (string)', { kind: 'shape', field: 'name' });
    }
    if (!content || typeof content !== 'string') {
      this.metrics?.increment('prompt-manager.create.errors', { code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'content is required (string)', { kind: 'shape', field: 'content' });
    }

    const validSlotType = SLOT_TYPES.includes(slot_type) ? slot_type : 'system';
    const id = this._generateId();
    const now = new Date().toISOString();
    const targetProject = project_id || GLOBAL_PROJECT_ID;

    const promptVariables = Array.isArray(variables) ? variables : [];
    const promptTags      = Array.isArray(tags)      ? tags      : [];
    const promptMetadata  = (metadata && typeof metadata === 'object') ? metadata : {};

    try {
      await this._db(targetProject,
        `INSERT INTO prompts (id, name, title, description, slot_type, content, variables, tags, metadata, current_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, title || name, description || '', validSlotType, content,
         JSON.stringify(promptVariables), JSON.stringify(promptTags), JSON.stringify(promptMetadata),
         '1.0.0', now, now]);

      await this._db(targetProject,
        `INSERT INTO prompt_versions (prompt_id, version, content, variables, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, '1.0.0', content, JSON.stringify(promptVariables), now, 'system']);
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) {
        this.metrics?.increment('prompt-manager.create.errors', { code: 'ALREADY_EXISTS' });
        return this._errorResponse(409, 'ALREADY_EXISTS', `Prompt name already exists: ${name}`, { entity_type: 'prompt', field: 'name' });
      }
      throw err;
    }

    const cachePrompt = {
      id, name, title: title || name, description: description || '',
      slot_type: validSlotType, content,
      variables: promptVariables, tags: promptTags, metadata: promptMetadata,
      current_version: '1.0.0',
      level: targetProject === GLOBAL_PROJECT_ID ? 'GLOBAL' : 'PROJECT',
      project_id: targetProject,
      created_at: now, updated_at: now
    };
    this.prompts.set(id, cachePrompt);

    await this._publicarEvento('prompt.created', {
      project_id: targetProject,
      id, name, slot_type: validSlotType
    }, sourcePayload);

    this.metrics?.increment('prompt-manager.prompt.created');
    this.logger.info('prompt-manager.prompt.created', { id, name, slot_type: validSlotType, project_id: targetProject });

    return { status: 201, data: { prompt: cachePrompt } };
  }

  async _updatePromptInternal(id, updates, sourcePayload) {
    if (!id) {
      this.metrics?.increment('prompt-manager.update.errors', { code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
    }
    const prompt = this.prompts.get(id);
    if (!prompt) {
      this.metrics?.increment('prompt-manager.update.errors', { code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id}`, { entity_type: 'prompt', entity_id: id });
    }

    const now = new Date().toISOString();
    const projectId = prompt.project_id || GLOBAL_PROJECT_ID;

    if (updates.content && updates.content !== prompt.content) {
      const newVersion = this._bumpVersion(prompt.current_version);
      const newVars = Array.isArray(updates.variables) ? updates.variables : prompt.variables;
      await this._db(projectId,
        `INSERT INTO prompt_versions (prompt_id, version, content, variables, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, newVersion, updates.content, JSON.stringify(newVars), now, 'system']);
      prompt.current_version = newVersion;
      prompt.content = updates.content;
    }

    if (updates.title !== undefined)       prompt.title = updates.title;
    if (updates.description !== undefined) prompt.description = updates.description;
    if (updates.slot_type && SLOT_TYPES.includes(updates.slot_type)) prompt.slot_type = updates.slot_type;
    if (Array.isArray(updates.variables))  prompt.variables = updates.variables;
    if (Array.isArray(updates.tags))       prompt.tags = updates.tags;
    if (updates.metadata && typeof updates.metadata === 'object') {
      prompt.metadata = { ...prompt.metadata, ...updates.metadata };
    }
    prompt.updated_at = now;

    await this._db(projectId,
      `UPDATE prompts SET title=?, description=?, slot_type=?, content=?, variables=?, tags=?, metadata=?, current_version=?, updated_at=?
       WHERE id=?`,
      [prompt.title, prompt.description, prompt.slot_type, prompt.content,
       JSON.stringify(prompt.variables), JSON.stringify(prompt.tags), JSON.stringify(prompt.metadata),
       prompt.current_version, prompt.updated_at, id]);

    await this._publicarEvento('prompt.updated', {
      project_id: projectId,
      id, name: prompt.name, version: prompt.current_version
    }, sourcePayload);

    this.metrics?.increment('prompt-manager.prompt.updated');
    this.logger.info('prompt-manager.prompt.updated', { id, version: prompt.current_version, project_id: projectId });

    return { status: 200, data: { prompt } };
  }

  async _deletePromptInternal(id, sourcePayload) {
    if (!id) {
      this.metrics?.increment('prompt-manager.delete.errors', { code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
    }
    const prompt = this.prompts.get(id);
    if (!prompt) {
      this.metrics?.increment('prompt-manager.delete.errors', { code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Prompt not found: ${id}`, { entity_type: 'prompt', entity_id: id });
    }
    const projectId = prompt.project_id || GLOBAL_PROJECT_ID;

    await this._db(projectId, 'DELETE FROM prompts WHERE id = ?', [id]);
    this.prompts.delete(id);

    await this._publicarEvento('prompt.deleted', {
      project_id: projectId, id
    }, sourcePayload);

    this.metrics?.increment('prompt-manager.prompt.deleted');
    this.logger.info('prompt-manager.prompt.deleted', { id, project_id: projectId });

    return { status: 200, data: { deleted: true, id } };
  }

  async _createPresetInternal(input, sourcePayload) {
    const { name, description, slots, project_id } = input || {};
    if (!name || typeof name !== 'string') {
      this.metrics?.increment('prompt-manager.preset.create.errors', { code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'name is required (string)', { kind: 'shape', field: 'name' });
    }

    const id = this._generateId();
    const now = new Date().toISOString();
    const targetProject = project_id || GLOBAL_PROJECT_ID;

    try {
      await this._db(targetProject,
        `INSERT INTO slot_presets (id, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, name, description || '', now, now]);
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) {
        this.metrics?.increment('prompt-manager.preset.create.errors', { code: 'ALREADY_EXISTS' });
        return this._errorResponse(409, 'ALREADY_EXISTS', `Preset name already exists: ${name}`, { entity_type: 'preset', field: 'name' });
      }
      throw err;
    }

    if (slots && typeof slots === 'object') {
      for (const [slotType, promptIds] of Object.entries(slots)) {
        if (!SLOT_TYPES.includes(slotType)) continue;
        const ids = Array.isArray(promptIds) ? promptIds : [promptIds];
        for (let i = 0; i < ids.length; i++) {
          await this._db(targetProject,
            `INSERT INTO slot_preset_prompts (preset_id, slot_type, prompt_id, position, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [id, slotType, ids[i], i, now]);
        }
      }
    }

    const preset = { id, name, description: description || '', slots: slots || {}, created_at: now, updated_at: now };
    this.presets.set(id, preset);

    await this._publicarEvento('preset.created', {
      project_id: targetProject, id, name
    }, sourcePayload);

    this.metrics?.increment('prompt-manager.preset.created');
    this.logger.info('prompt-manager.preset.created', { id, name, project_id: targetProject });

    return { status: 201, data: { preset } };
  }

  async _deletePresetInternal(id, sourcePayload) {
    if (!id) {
      this.metrics?.increment('prompt-manager.preset.delete.errors', { code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'id is required', { kind: 'shape', field: 'id' });
    }
    if (!this.presets.has(id)) {
      this.metrics?.increment('prompt-manager.preset.delete.errors', { code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Preset not found: ${id}`, { entity_type: 'preset', entity_id: id });
    }

    await this._db(GLOBAL_PROJECT_ID, 'DELETE FROM slot_presets WHERE id = ?', [id]);
    this.presets.delete(id);

    await this._publicarEvento('preset.deleted', {
      project_id: GLOBAL_PROJECT_ID, id
    }, sourcePayload);

    this.metrics?.increment('prompt-manager.preset.deleted');
    this.logger.info('prompt-manager.preset.deleted', { id });

    return { status: 200, data: { deleted: true, id } };
  }

  // ==========================================
  // Internals: helpers
  // ==========================================

  _findPrompt({ id, name }) {
    if (id && this.prompts.has(id)) return this.prompts.get(id);
    if (name) {
      const nameLower = String(name).toLowerCase();
      for (const p of this.prompts.values()) {
        if ((p.name || '').toLowerCase() === nameLower) return p;
      }
    }
    return null;
  }

  _filterPrompts(filters) {
    let prompts = Array.from(this.prompts.values());
    const { slot_type, tag, search, project_id } = filters || {};
    if (slot_type && SLOT_TYPES.includes(slot_type)) {
      prompts = prompts.filter(p => p.slot_type === slot_type);
    }
    if (tag) prompts = prompts.filter(p => Array.isArray(p.tags) && p.tags.includes(tag));
    if (project_id) {
      prompts = prompts.filter(p => p.project_id === project_id || p.project_id === GLOBAL_PROJECT_ID);
    }
    if (search) {
      const s = String(search).toLowerCase();
      prompts = prompts.filter(p =>
        (p.name || '').toLowerCase().includes(s) ||
        (p.title || '').toLowerCase().includes(s) ||
        (p.description || '').toLowerCase().includes(s)
      );
    }
    return prompts;
  }

  _toPublicPrompt(prompt, opts = {}) {
    const { include_content = true } = opts;
    const out = {
      id: prompt.id,
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
      slot_type: prompt.slot_type,
      slot_icon: SLOT_ICONS[prompt.slot_type] || 'system',
      tags: prompt.tags || [],
      variables: prompt.variables || [],
      level: prompt.level || 'GLOBAL',
      current_version: prompt.current_version,
      created_at: prompt.created_at,
      updated_at: prompt.updated_at
    };
    if (include_content) out.content = prompt.content;
    return out;
  }

  _missingVariables(declared, provided) {
    const missing = [];
    if (!Array.isArray(declared)) return missing;
    for (const v of declared) {
      const varName = (v && typeof v === 'object') ? v.name : v;
      if (!varName) continue;
      if (!provided || provided[varName] === undefined) missing.push(varName);
    }
    return missing;
  }

  async _loadPresetSlots(presetId) {
    const rows = await this._db(GLOBAL_PROJECT_ID,
      `SELECT slot_type, prompt_id, position FROM slot_preset_prompts
       WHERE preset_id = ? ORDER BY slot_type, position`,
      [presetId]);
    const slots = {};
    for (const rel of (rows || [])) {
      if (!slots[rel.slot_type]) slots[rel.slot_type] = [];
      slots[rel.slot_type].push(rel.prompt_id);
    }
    return slots;
  }

  async _recordUsage(promptId, version) {
    if (!promptId) return;
    const now = new Date().toISOString();
    const existing = await this._db(GLOBAL_PROJECT_ID,
      'SELECT id, usage_count FROM prompt_analytics WHERE prompt_id = ? AND version = ?',
      [promptId, version || null]);
    if (Array.isArray(existing) && existing.length > 0) {
      await this._db(GLOBAL_PROJECT_ID,
        'UPDATE prompt_analytics SET usage_count = usage_count + 1, last_used = ? WHERE id = ?',
        [now, existing[0].id]);
    } else {
      await this._db(GLOBAL_PROJECT_ID,
        `INSERT INTO prompt_analytics (prompt_id, version, usage_count, first_used, last_used)
         VALUES (?, ?, 1, ?, ?)`,
        [promptId, version || null, now, now]);
    }
    this.metrics?.increment('prompt-manager.usage.recorded');
  }

  async _initializeSchema() {
    let schemaSql;
    try {
      schemaSql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    } catch (err) {
      this.logger.error('prompt-manager.schema.read.failed', { error: err.message });
      throw err;
    }

    const request_id = this._generateId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingSchema.has(request_id)) {
          this.pendingSchema.delete(request_id);
          this.logger.warn('prompt-manager.schema.init.timeout');
          resolve(false);
        }
      }, SCHEMA_TIMEOUT_MS);
      this.pendingSchema.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.schema.init.request', {
        project_id: GLOBAL_PROJECT_ID,
        schema: schemaSql,
        request_id
      });
    });
  }

  async _loadFromDatabase() {
    try {
      const prompts = await this._db(GLOBAL_PROJECT_ID, 'SELECT * FROM prompts ORDER BY name', []);
      for (const p of (prompts || [])) {
        this.prompts.set(p.id, {
          ...p,
          variables: this._safeJsonParse(p.variables, []),
          tags:      this._safeJsonParse(p.tags, []),
          metadata:  this._safeJsonParse(p.metadata, {}),
          level:     'GLOBAL',
          project_id: GLOBAL_PROJECT_ID
        });
      }

      const presets = await this._db(GLOBAL_PROJECT_ID, 'SELECT * FROM slot_presets ORDER BY name', []);
      for (const preset of (presets || [])) {
        this.presets.set(preset.id, preset);
      }

      this.logger.info('prompt-manager.cache.loaded', {
        prompts: this.prompts.size,
        presets: this.presets.size
      });
    } catch (err) {
      this.logger.warn('prompt-manager.cache.load.error', { error: err.message });
    }
  }

  _safeJsonParse(value, fallback) {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  _generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  _bumpVersion(version) {
    const parts = String(version || '1.0.0').split('.').map(n => parseInt(n, 10) || 0);
    const [major, minor, patch] = [parts[0] || 1, parts[1] || 0, parts[2] || 0];
    return `${major}.${minor}.${patch + 1}`;
  }

  _renderTemplateString(template, variables) {
    let rendered = String(template || '');
    if (!variables || typeof variables !== 'object') return rendered;
    for (const [key, value] of Object.entries(variables)) {
      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }
    return rendered;
  }

  // ==========================================
  // Helpers POC2 (canonicos)
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = (err && err.message ? err.message : String(err || '')).toLowerCase();
    if (err && err._code) return err._code;
    if (msg.includes('not found')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('must be')) return 'INVALID_INPUT';
    if (msg.includes('already exists') || msg.includes('unique')) return 'ALREADY_EXISTS';
    if (msg.includes('timeout')) return 'TIMEOUT';
    return 'UNKNOWN_ERROR';
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const code = this._classifyHandlerError(err);
    const status = ({
      RESOURCE_NOT_FOUND: 404,
      INVALID_INPUT:  400,
      ALREADY_EXISTS:     409,
      TIMEOUT:            504,
      UNKNOWN_ERROR:     500
    })[code] || 500;
    const message = err && err.message ? err.message : String(err || 'unknown error');
    const details = err && err._details ? err._details : undefined;

    this.logger?.error(logEvent, { error: message, code, kind });
    this.metrics?.increment(logEvent.replace(/\.failed$/, '.errors'), { code });

    return this._errorResponse(status, code, message, details);
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }

  async _db(project_id, query, params = []) {
    const request_id = this._generateId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingDb.has(request_id)) {
          this.pendingDb.delete(request_id);
          reject(new Error(`db timeout: ${String(query).slice(0, 60)}`));
        }
      }, DB_TIMEOUT_MS);
      this.pendingDb.set(request_id, { resolve, reject, timeout });
      this.eventBus.publish('db.query.request', { project_id, query, params, request_id });
    });
  }
}

module.exports = PromptManagerModule;
