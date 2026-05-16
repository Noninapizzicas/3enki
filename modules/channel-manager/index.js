/**
 * channel-manager v2.0.0 — Reescrito al canon (POC2 #9 del horizontal).
 *
 * Registry centralizado de canales externos. Mapea identificadores externos
 * (chat_id, email, telefono) a proyectos y propositos internos.
 *
 * Filosofia:
 *   Canal != Credencial.
 *   - credential-manager: "con que token me autentico" (API keys)
 *   - channel-manager: "a donde va este mensaje" (routing)
 *
 * Un channel binding es:
 *   { channel_type, external_id } -> { project_id, purpose, label, metadata }
 *
 * Ejemplos:
 *   { telegram, "mibot:12345" }     -> { noninapizza, facturas }
 *   { whatsapp, "+34600123456" }    -> { noninapizza, pedidos }
 *   { gmail, "facturas@empresa.com" } -> { noninapizza, facturas }
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers UI/tools devuelven { status, data | error: { code, message, details? } }.
 *    Metodos privados lanzan con _code canonico.
 *  - observability: log + metric en cada error path. Prefix channel-manager.*.
 *    correlation_id propagado en TODOS los publishes.
 *  - events: 5 eventos canonicos preservados invariantes (channel.registered/
 *    updated/removed/resolved + channel-manager.resolve.response).
 *  - lifecycle: onLoad inicializa schema + cache; onUnload limpia
 *    pendingDbRequests con clearTimeout sin leak.
 *  - persistence: tabla 'channels' en proyecto 'system' via database-manager.
 *
 * 5 helpers POC2 transferibles:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar _cacheKey (slug-like del binding).
 *
 * Monolito (493 LOC) preservado en
 * arquitectura/migracion/_legacy/channel-manager-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/channel-manager-mapa.md
 */

'use strict';

const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const VALID_CHANNEL_TYPES = ['telegram', 'gmail', 'whatsapp', 'glovo', 'web'];
const DEFAULT_DB_TIMEOUT_MS = 10000;

class ChannelManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'channel-manager';
    this.version = '2.0.0';
    this.config   = null;

    this.cache = new Map();
    this.dbReady = false;

    this.pendingDbRequests = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;
    this.config   = core.moduleConfig || {};

    const correlation_id = crypto.randomUUID();
    this.logger.info('channel-manager.loading', {
      module: this.name, version: this.version, correlation_id
    });

    // Subscribe to db responses (pendingDbRequests Map pattern)
    this.eventBus.subscribe?.('db.query.response',       this._onDbResponse.bind(this));
    this.eventBus.subscribe?.('db.schema.init.response', this._onDbResponse.bind(this));

    await this._initSchema(correlation_id);
    await this._loadCache(correlation_id);

    this.logger.info('channel-manager.loaded', {
      bindings: this.cache.size, correlation_id
    });
  }

  async onUnload() {
    const correlation_id = crypto.randomUUID();
    this.logger.info('channel-manager.unloading', {
      pending_db_requests: this.pendingDbRequests.size, correlation_id
    });

    const pending = Array.from(this.pendingDbRequests.values());
    this.pendingDbRequests.clear();
    for (const { timeout, reject } of pending) {
      clearTimeout(timeout);
      try { reject(new Error('Module unloading')); }
      catch (rejectErr) { this.metrics?.increment('channel-manager.errors', { kind: 'unload_reject' }); }
    }

    this.cache.clear();
    this.dbReady = false;
  }

  // ==========================================
  // DB access (via database-manager bus events)
  // ==========================================

  _onDbResponse(event) {
    const data = event?.data || event;
    if (!data?.correlation_id) return;
    const pending = this.pendingDbRequests.get(data.correlation_id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingDbRequests.delete(data.correlation_id);
    if (data.error) pending.reject(new Error(data.error));
    else pending.resolve(data.data || data.rows || data || []);
  }

  _publishDb(eventName, payload) {
    return new Promise((resolve, reject) => {
      const correlation_id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.pendingDbRequests.delete(correlation_id);
        this.metrics?.increment('channel-manager.errors', { kind: 'db_timeout' });
        reject(new Error(`DB timeout: ${eventName}`));
      }, this.config.dbTimeout || DEFAULT_DB_TIMEOUT_MS);
      this.pendingDbRequests.set(correlation_id, { resolve, reject, timeout });
      Promise.resolve(this.eventBus.publish(eventName, { ...payload, correlation_id }))
        .catch(err => {
          clearTimeout(timeout);
          this.pendingDbRequests.delete(correlation_id);
          this.metrics?.increment('channel-manager.errors', { kind: 'db_publish' });
          reject(err);
        });
    });
  }

  _dbQuery(sql, params = []) {
    return this._publishDb('db.query.request', {
      project_id: this.config.db_project_id,
      query: sql,
      params
    });
  }

  _dbSchemaInit(schema) {
    return this._publishDb('db.schema.init.request', {
      project_id: this.config.db_project_id,
      schema
    });
  }

  // ==========================================
  // Schema + cache (privados)
  // ==========================================

  async _initSchema(correlation_id) {
    const tableName = this.config.table_name;
    const sql = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_type TEXT NOT NULL,
        external_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'general',
        label TEXT,
        metadata TEXT DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(channel_type, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_channels_lookup
        ON ${tableName}(channel_type, external_id);
      CREATE INDEX IF NOT EXISTS idx_channels_project
        ON ${tableName}(project_id);
    `;
    try {
      await this._dbSchemaInit(sql);
      this.dbReady = true;
      this.logger.info('channel-manager.schema.ready', { correlation_id });
    } catch (err) {
      this.logger.error('channel-manager.schema.failed', {
        error: err.message, correlation_id
      });
      this.metrics?.increment('channel-manager.errors', { kind: 'schema_init' });
      throw Object.assign(err, { _code: 'UNKNOWN_ERROR', _details: { stage: 'schema_init' } });
    }
  }

  async _loadCache(correlation_id) {
    try {
      const rows = await this._dbQuery(
        `SELECT * FROM ${this.config.table_name} WHERE enabled = 1`
      );
      this.cache.clear();
      for (const row of rows) {
        row.metadata = this._parseJSON(row.metadata);
        this.cache.set(this._cacheKey(row.channel_type, row.external_id), row);
      }
      this.logger.info('channel-manager.cache.loaded', {
        bindings: this.cache.size, correlation_id
      });
    } catch (err) {
      this.logger.warn('channel-manager.cache.load.failed', {
        error: err.message, correlation_id
      });
      this.metrics?.increment('channel-manager.errors', { kind: 'cache_load' });
    }
  }

  // ==========================================
  // Core: resolve + CRUD (privados con _code canonico)
  // ==========================================

  resolve(channelType, externalId) {
    if (!channelType || !externalId) return null;
    const binding = this.cache.get(this._cacheKey(channelType, externalId));
    if (!binding) return null;
    return {
      project_id:   binding.project_id,
      purpose:      binding.purpose,
      label:        binding.label,
      metadata:     binding.metadata,
      channel_type: binding.channel_type,
      external_id:  binding.external_id
    };
  }

  async _register(input, correlation_id) {
    const { channel_type, external_id, project_id, purpose, label, metadata } = input || {};
    if (!channel_type || !external_id || !project_id) {
      throw Object.assign(new Error('channel_type, external_id and project_id are required'),
        { _code: 'INVALID_INPUT',
          _details: { kind: 'domain', missing: ['channel_type','external_id','project_id'].filter(k => !input?.[k]) } });
    }
    if (!VALID_CHANNEL_TYPES.includes(channel_type)) {
      throw Object.assign(new Error(`Invalid channel_type: ${channel_type}`),
        { _code: 'INVALID_INPUT',
          _details: { kind: 'domain', field: 'channel_type', allowed: VALID_CHANNEL_TYPES } });
    }

    const now = new Date().toISOString();
    const metadataStr = JSON.stringify(metadata || {});
    const finalPurpose = purpose || 'general';
    const finalLabel = label || null;

    await this._dbQuery(
      `INSERT INTO ${this.config.table_name}
        (channel_type, external_id, project_id, purpose, label, metadata, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(channel_type, external_id) DO UPDATE SET
        project_id = excluded.project_id,
        purpose    = excluded.purpose,
        label      = excluded.label,
        metadata   = excluded.metadata,
        enabled    = 1,
        updated_at = excluded.updated_at`,
      [channel_type, external_id, project_id, finalPurpose, finalLabel, metadataStr, now, now]
    );

    const binding = {
      channel_type, external_id, project_id,
      purpose: finalPurpose, label: finalLabel,
      metadata: metadata || {},
      enabled: 1, created_at: now, updated_at: now
    };
    this.cache.set(this._cacheKey(channel_type, external_id), binding);

    await this._publicarEvento('channel.registered', {
      channel_type, external_id, project_id,
      purpose: finalPurpose, label: finalLabel
    }, { correlation_id });
    this.metrics?.increment('channel-manager.registered');

    this.logger.info('channel-manager.registered', {
      channel_type, external_id, project_id, purpose: finalPurpose, correlation_id
    });

    return binding;
  }

  async _update(channelType, externalId, updates, correlation_id) {
    if (!channelType || !externalId) {
      throw Object.assign(new Error('channel_type and external_id are required'),
        { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'channel_type|external_id' } });
    }
    const key = this._cacheKey(channelType, externalId);
    const existing = this.cache.get(key);
    if (!existing) {
      throw Object.assign(new Error(`Channel not found: ${channelType}:${externalId}`),
        { _code: 'RESOURCE_NOT_FOUND',
          _details: { entity_type: 'channel', entity_id: `${channelType}:${externalId}` } });
    }

    const fields = [];
    const values = [];
    if (updates.project_id !== undefined) { fields.push('project_id = ?'); values.push(updates.project_id); }
    if (updates.purpose    !== undefined) { fields.push('purpose = ?');    values.push(updates.purpose); }
    if (updates.label      !== undefined) { fields.push('label = ?');      values.push(updates.label); }
    if (updates.metadata   !== undefined) { fields.push('metadata = ?');   values.push(JSON.stringify(updates.metadata)); }
    if (updates.enabled    !== undefined) { fields.push('enabled = ?');    values.push(updates.enabled ? 1 : 0); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(channelType, externalId);

    await this._dbQuery(
      `UPDATE ${this.config.table_name} SET ${fields.join(', ')}
       WHERE channel_type = ? AND external_id = ?`,
      values
    );

    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
    if (updates.metadata !== undefined) updated.metadata = updates.metadata;
    if (updated.enabled === false || updated.enabled === 0) this.cache.delete(key);
    else this.cache.set(key, updated);

    await this._publicarEvento('channel.updated', {
      channel_type: channelType, external_id: externalId, updates
    }, { correlation_id });
    this.metrics?.increment('channel-manager.updated');

    return updated;
  }

  async _remove(channelType, externalId, correlation_id) {
    if (!channelType || !externalId) {
      throw Object.assign(new Error('channel_type and external_id are required'),
        { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'channel_type|external_id' } });
    }
    const key = this._cacheKey(channelType, externalId);
    const existing = this.cache.get(key);
    if (!existing) {
      throw Object.assign(new Error(`Channel not found: ${channelType}:${externalId}`),
        { _code: 'RESOURCE_NOT_FOUND',
          _details: { entity_type: 'channel', entity_id: `${channelType}:${externalId}` } });
    }

    await this._dbQuery(
      `DELETE FROM ${this.config.table_name} WHERE channel_type = ? AND external_id = ?`,
      [channelType, externalId]
    );
    this.cache.delete(key);

    await this._publicarEvento('channel.removed', {
      channel_type: channelType, external_id: externalId,
      project_id: existing.project_id
    }, { correlation_id });
    this.metrics?.increment('channel-manager.removed');

    this.logger.info('channel-manager.removed', {
      channel_type: channelType, external_id: externalId, correlation_id
    });
    return { removed: true, channel_type: channelType, external_id: externalId };
  }

  async _list({ channel_type, project_id } = {}) {
    let sql = `SELECT * FROM ${this.config.table_name} WHERE 1=1`;
    const params = [];
    if (channel_type) { sql += ' AND channel_type = ?'; params.push(channel_type); }
    if (project_id)   { sql += ' AND project_id = ?';   params.push(project_id); }
    sql += ' ORDER BY channel_type, external_id';

    const rows = await this._dbQuery(sql, params);
    return rows.map(row => ({ ...row, metadata: this._parseJSON(row.metadata) }));
  }

  // ==========================================
  // Bus handler (channel-manager.resolve.request)
  // ==========================================

  async onResolveRequest(event) {
    const data = event?.data || event;
    const { channel_type, external_id, request_id, correlation_id } = data || {};

    if (!request_id) {
      this.logger.warn('channel-manager.resolve.invalid_payload', { has_request_id: false });
      this.metrics?.increment('channel-manager.errors', { kind: 'invalid_payload', source: 'resolve' });
      return;
    }

    const cid = correlation_id || crypto.randomUUID();
    const start = Date.now();
    const result = this.resolve(channel_type, external_id);
    const duration = Date.now() - start;

    if (result) {
      await this._publicarEvento('channel.resolved', {
        ...result, duration
      }, { correlation_id: cid });
      await this._publicarEvento('channel-manager.resolve.response', {
        request_id, success: true, found: true, ...result
      }, { correlation_id: cid });
      this.metrics?.increment('channel-manager.resolve.success');
    } else {
      await this._publicarEvento('channel-manager.resolve.response', {
        request_id, success: true, found: false, channel_type, external_id
      }, { correlation_id: cid });
      this.metrics?.increment('channel-manager.resolve.miss');
      this.logger.debug('channel-manager.resolve.miss', { channel_type, external_id, correlation_id: cid });
    }
  }

  // ==========================================
  // UI handlers (mqttRequest pattern)
  // ==========================================

  async handleRegister(data) {
    try {
      const binding = await this._register(data, crypto.randomUUID());
      return { status: 201, data: { registered: true, binding } };
    } catch (err) {
      return this._handleHandlerError('channel-manager.ui.register.failed', err, 'ui_register');
    }
  }

  async handleUpdate(data) {
    try {
      const { channel_type, external_id, ...updates } = data || {};
      const binding = await this._update(channel_type, external_id, updates, crypto.randomUUID());
      return { status: 200, data: { updated: true, binding } };
    } catch (err) {
      return this._handleHandlerError('channel-manager.ui.update.failed', err, 'ui_update');
    }
  }

  async handleRemove(data) {
    try {
      const result = await this._remove(data?.channel_type, data?.external_id, crypto.randomUUID());
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('channel-manager.ui.remove.failed', err, 'ui_remove');
    }
  }

  async handleResolve(data) {
    try {
      if (!data?.channel_type || !data?.external_id) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'channel_type and external_id are required',
          { kind: 'domain', field: 'channel_type|external_id' });
      }
      const result = this.resolve(data.channel_type, data.external_id);
      if (!result) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          'Channel not registered',
          { entity_type: 'channel', entity_id: `${data.channel_type}:${data.external_id}` });
      }
      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('channel-manager.ui.resolve.failed', err, 'ui_resolve');
    }
  }

  async handleList(data) {
    try {
      const channels = await this._list(data || {});
      return { status: 200, data: { channels, count: channels.length } };
    } catch (err) {
      return this._handleHandlerError('channel-manager.ui.list.failed', err, 'ui_list');
    }
  }

  async handleListByProject(data) {
    try {
      if (!data?.project_id) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'project_id is required',
          { kind: 'domain', field: 'project_id' });
      }
      const channels = await this._list({ project_id: data.project_id });
      return { status: 200, data: { channels, count: channels.length } };
    } catch (err) {
      return this._handleHandlerError('channel-manager.ui.list_by_project.failed', err, 'ui_list_by_project');
    }
  }

  // ==========================================
  // Tool handlers (LLM-invokable)
  // ==========================================

  async handleToolResolve(params) {
    try {
      const { channel_type, external_id } = params || {};
      if (!channel_type || !external_id) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'channel_type and external_id are required',
          { kind: 'domain', field: 'channel_type|external_id' });
      }
      const result = this.resolve(channel_type, external_id);
      if (result) {
        return { status: 200, data: { found: true, ...result } };
      }
      return {
        status: 200,
        data: {
          found: false,
          message: `No channel registered for ${channel_type}:${external_id}`
        }
      };
    } catch (err) {
      return this._handleHandlerError('channel-manager.tool.resolve.failed', err, 'tool_resolve');
    }
  }

  async handleToolList(params) {
    try {
      const channels = await this._list(params || {});
      return {
        status: 200,
        data: {
          count: channels.length,
          channels: channels.map(ch => ({
            channel_type: ch.channel_type,
            external_id:  ch.external_id,
            project_id:   ch.project_id,
            purpose:      ch.purpose,
            label:        ch.label,
            enabled:      ch.enabled
          }))
        }
      };
    } catch (err) {
      return this._handleHandlerError('channel-manager.tool.list.failed', err, 'tool_list');
    }
  }

  // ==========================================
  // Helpers POC2 (transferibles) + auxiliares
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code    = err._code || this._classifyHandlerError(err);
    const status  = code === 'INVALID_INPUT'      ? 400 :
                    code === 'RESOURCE_NOT_FOUND'     ? 404 :
                    code === 'PERMISSION_DENIED' ? 403 :
                    code === 'CONFLICT_STATE'               ? 409 :
                    code === 'UPSTREAM_UNREACHABLE'   ? 503 :
                                                        500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('channel-manager.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid')) return 'INVALID_INPUT';
    if (msg.includes('already') || msg.includes('conflict')) return 'CONFLICT_STATE';
    if (msg.includes('unauthorized') || msg.includes('forbidden')) return 'PERMISSION_DENIED';
    if (msg.includes('timeout') || msg.includes('unavailable')) return 'UPSTREAM_UNREACHABLE';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = { timestamp: new Date().toISOString(), ...payload };
    if (sourcePayload?.correlation_id) enriched.correlation_id = sourcePayload.correlation_id;
    else if (!enriched.correlation_id)  enriched.correlation_id = crypto.randomUUID();
    await this.eventBus.publish(name, enriched);
  }

  // Auxiliar: clave del cache derivada del tipo + identificador externo.
  _cacheKey(channelType, externalId) {
    return `${channelType}:${externalId}`;
  }

  _parseJSON(str) {
    if (!str) return {};
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return {}; }
  }
}

module.exports = ChannelManagerModule;
