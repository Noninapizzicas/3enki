/**
 * credential-manager v2.0.0 — Core canonico (post-descomposicion).
 *
 * Modulo del core: SOLO CRUD + resolucion cascada + cache .env.
 *
 * Responsabilidades RETIRADAS (ver _legacy/monolito-pre-descomposicion.js.bak +
 * arquitectura/migracion/notas/credential-manager-descomposicion.md):
 *  - Test de credenciales (7 testProvider methods) → modulo `credential-tester`
 *    (sesion 2 pendiente).
 *  - OAuth flow (start/callback/status/configs) → modulo `credential-oauth`
 *    (sesion 3 pendiente).
 *  - Glovo + Telegram notifs configs → modulos `credential-vendor-glovo` y
 *    `credential-vendor-telegram` (sesion 4 pendiente).
 *
 * Lo que el core ofrece y NO cambia:
 *  - Eventos canonicos del bus: credential.{create,update,delete,resolve}.request
 *    + credential.{saved,deleted,updated} + credential.resolve.response.
 *  - Resolucion cascada CUSTOM → CLIENT → PROJECT → GLOBAL.
 *  - Persistencia .env atomica (tempfile + rename).
 *  - Tool del LLM: credential.list (no expone keys, solo metadata + preview).
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers devuelven { status, data | error: { code, message } }.
 *  - observability: log + metric en cada error path.
 *  - events: publishes con correlation_id propagado.
 *  - persistence: atomic write (tempfile + rename).
 *  - resilience: _fetchWithTimeout helper preparado (usado por credential-tester
 *    cuando se descomponga).
 *  - security: API keys NUNCA en logs (siempre maskApiKey).
 */

'use strict';

const fs       = require('fs').promises;
const fsSync   = require('fs');
const path     = require('path');
const crypto   = require('crypto');

const BaseModule = require('../_shared/base-module');
const PROVIDER_ICONS = {
  OPENAI: '🤖',
  DEEPSEEK: '🔮',
  ANTHROPIC: '🧠',
  OLLAMA: '🦙',
  GOOGLE: '☁️',
  GEMINI: '☁️',
  GROQ: '⚡',
  KIMI: '🌙',
  GMAIL: '📧',
  GLOVO: '🛵',
  CLOUDFLARE: '🟧',
  TELEGRAM: '✈️'
};

const VALID_LEVELS = ['GLOBAL', 'PROJECT', 'CLIENT', 'CUSTOM', 'BOT'];

// Providers cuyo secreto es POR PROYECTO (multi-tenant): cada tienda tiene su propio número/token
// y su propio webhook → NUNCA pueden ser globales (un token global mezclaría negocios). Se exige
// nivel PROJECT al guardar y la resolución NO cae a GLOBAL/legacy para ellos (aislamiento real).
const PROJECT_ONLY_PROVIDERS = new Set(['META_WHATSAPP', 'META_WHATSAPP_VERIFY_TOKEN']);

class CredentialManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'credential-manager';
    this.version = '2.1.0';
    this.uiHandler = null;
    this.config    = null;

    this.envFilePath = null;
    this.credentials = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger    = core.logger;
    this.metrics   = core.metrics;
    this.eventBus  = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config    = core.moduleConfig || {};

    this.logger.info('credential-manager.loading', { module: this.name, version: this.version });

    const projectRoot = path.resolve(__dirname, '..', '..');
    if (this.config.envFile) {
      this.envFilePath = path.resolve(projectRoot, this.config.envFile);
    } else {
      const dataDir = path.join(projectRoot, 'data');
      if (!fsSync.existsSync(dataDir)) fsSync.mkdirSync(dataDir, { recursive: true });
      this.envFilePath = path.join(dataDir, '.env');
    }

    await this._loadEnvFile();
    this._updateCredentialMetrics();

    this.logger.info('credential-manager.loaded', {
      env_file: this.envFilePath,
      credentials_count: this.credentials.size
    });

    await this._publishState();
  }

  async onUnload() {
    this.logger.info('credential-manager.unloading');
    this.credentials.clear();
    this.logger.info('credential-manager.unloaded');
  }

  // ==========================================
  // Persistencia .env (atomica)
  // ==========================================

  async _loadEnvFile() {
    try {
      if (!fsSync.existsSync(this.envFilePath)) {
        await fs.writeFile(this.envFilePath, '# Credentials\n');
        this.logger.info('credential-manager.env.created', { path: this.envFilePath });
        return;
      }
      const content = await fs.readFile(this.envFilePath, 'utf-8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const idx = line.indexOf('=');
        const key = line.slice(0, idx);
        const value = line.slice(idx + 1);
        if (key.includes('_API_KEY_') || key.endsWith('_API_KEY')) {
          this.credentials.set(key, value);
          process.env[key] = value;
        } else {
          // Variables no gestionadas por el core: respetar process.env pero
          // NO cargarlas en this.credentials. Su persistencia (refresh tokens,
          // OAuth client_id, vendor configs) es responsabilidad de los modulos
          // descompuestos pendientes (credential-oauth, credential-vendor-*).
          process.env[key] = value;
        }
      }
      this.logger.info('credential-manager.env.loaded', {
        path: this.envFilePath,
        credentials_count: this.credentials.size
      });
    } catch (err) {
      this.logger.error('credential-manager.env.load.failed', {
        path: this.envFilePath, error: err.message
      });
      this.metrics?.increment('credential-manager.errors', { kind: 'env_load' });
    }
  }

  async _saveEnvFile() {
    const startTime = Date.now();
    try {
      let content = '# Credentials managed by credential-manager core\n';
      content += `# Last updated: ${new Date().toISOString()}\n\n`;

      const grouped = { GLOBAL: [], PROJECT: [], CLIENT: [], CUSTOM: [], BOT: [] };
      for (const [key, value] of this.credentials.entries()) {
        const level = this._extractLevel(key);
        if (grouped[level]) grouped[level].push({ key, value });
      }

      for (const level of ['GLOBAL', 'PROJECT', 'CLIENT', 'CUSTOM', 'BOT']) {
        if (grouped[level].length === 0) continue;
        content += `# ${level} credentials\n`;
        for (const { key, value } of grouped[level]) content += `${key}=${value}\n`;
        content += '\n';
      }

      // Atomic write: tempfile + rename
      const tmpPath = `${this.envFilePath}.tmp.${process.pid}.${Date.now()}`;
      await fs.writeFile(tmpPath, content);
      await fs.rename(tmpPath, this.envFilePath);

      const duration = Date.now() - startTime;
      this.logger.info('credential-manager.env.saved', {
        path: this.envFilePath,
        credentials_count: this.credentials.size,
        duration
      });
      if (typeof this.metrics?.timing === 'function') {
        this.metrics.timing('credential-manager.save.duration', duration);
      }
    } catch (err) {
      this.logger.error('credential-manager.env.save.failed', {
        path: this.envFilePath, error: err.message
      });
      this.metrics?.increment('credential-manager.errors', { kind: 'env_save' });
      throw err;
    }
  }

  _updateCredentialMetrics() {
    if (typeof this.metrics?.gauge !== 'function') return;
    this.metrics.gauge('credential-manager.count.total', this.credentials.size);
    const byLevel = { GLOBAL: 0, PROJECT: 0, CLIENT: 0, CUSTOM: 0, BOT: 0 };
    for (const key of this.credentials.keys()) {
      const level = this._extractLevel(key);
      if (byLevel[level] !== undefined) byLevel[level]++;
    }
    for (const [level, count] of Object.entries(byLevel)) {
      this.metrics.gauge(`credential-manager.count.${level.toLowerCase()}`, count);
    }
  }

  // ==========================================
  // Event handlers (canonicos del bus)
  // ==========================================

  async onStateRequest(event) {
    const correlation_id = event?.correlation_id || event?.correlationId;
    this.logger.info('credential-manager.state.request.received', { correlation_id });
    await this._publishState(correlation_id);
  }

  async onCreateCredential(event) {
    const payload = event?.data || event?.payload || event;
    const { provider, level, identifier, api_key } = payload;
    const correlation_id = event?.correlation_id || event?.correlationId;

    try {
      this._validateProviderLevelKey(provider, level, api_key);
      const validated = this._validateLevel(level, identifier);
      if (!validated.valid) {
        throw Object.assign(new Error(validated.message), { _code: 'INVALID_INPUT', _details: validated.details });
      }

      const key = this._buildKey(provider, level, identifier);
      const existed = this.credentials.has(key);
      this.credentials.set(key, api_key);
      process.env[key] = api_key;
      await this._saveEnvFile();
      this._updateCredentialMetrics();

      const eventName = existed ? 'credential.updated' : 'credential.saved';
      await this._publicarEvento(eventName, {
        provider,
        level,
        identifier: identifier || null,
        key
      }, { correlation_id });

      this.metrics?.increment('credential-manager.created', { provider, level });
      this.logger.info('credential-manager.created', {
        provider, level, identifier: identifier || null, correlation_id
      });

      await this._publishState(correlation_id);
    } catch (err) {
      this.logger.error('credential-manager.create.failed', {
        provider, level, error: err.message, correlation_id
      });
      this.metrics?.increment('credential-manager.errors', { kind: 'create' });
    }
  }

  async onUpdateCredential(event) {
    const payload = event?.data || event?.payload || event;
    const { key, api_key } = payload;
    const correlation_id = event?.correlation_id || event?.correlationId;

    try {
      if (!key || !api_key) {
        this.logger.warn('credential-manager.update.invalid_payload', { has_key: !!key, has_api_key: !!api_key });
        return;
      }
      if (!this.credentials.has(key)) {
        this.logger.warn('credential-manager.update.not_found', { key, correlation_id });
        return;
      }
      this.credentials.set(key, api_key);
      process.env[key] = api_key;
      await this._saveEnvFile();
      this._updateCredentialMetrics();

      await this._publicarEvento('credential.updated', { key }, { correlation_id });
      this.metrics?.increment('credential-manager.updated');
      await this._publishState(correlation_id);
    } catch (err) {
      this.logger.error('credential-manager.update.failed', { key, error: err.message, correlation_id });
      this.metrics?.increment('credential-manager.errors', { kind: 'update' });
    }
  }

  async onDeleteCredential(event) {
    const payload = event?.data || event?.payload || event;
    const { key } = payload;
    const correlation_id = event?.correlation_id || event?.correlationId;

    try {
      if (!key) {
        this.logger.warn('credential-manager.delete.invalid_payload');
        return;
      }
      if (!this.credentials.has(key)) {
        this.logger.warn('credential-manager.delete.not_found', { key, correlation_id });
        return;
      }
      this.credentials.delete(key);
      delete process.env[key];
      await this._saveEnvFile();
      this._updateCredentialMetrics();

      await this._publicarEvento('credential.deleted', { key }, { correlation_id });
      this.metrics?.increment('credential-manager.deleted');
      await this._publishState(correlation_id);
    } catch (err) {
      this.logger.error('credential-manager.delete.failed', { key, error: err.message, correlation_id });
      this.metrics?.increment('credential-manager.errors', { kind: 'delete' });
    }
  }

  /**
   * Resolucion cascada de credencial. Es la pieza critica que ai-gateway
   * invoca constantemente para resolver la API key del provider correcto
   * por proyecto/cliente/usuario.
   *
   * Cascada: CUSTOM → CLIENT → PROJECT → GLOBAL.
   */
  async onResolveRequest(event) {
    const payload = event?.data || event?.payload || event;
    const { request_id, provider, project_id, client_id, customId } = payload;
    const correlation_id = event?.correlation_id || event?.correlationId;

    try {
      if (!request_id || !provider) {
        this.logger.warn('credential-manager.resolve.invalid_payload', {
          has_request: !!request_id, has_provider: !!provider, correlation_id
        });
        await this._publishResolveResponse(request_id || crypto.randomUUID(), {
          success: false,
          provider,
          error: 'request_id y provider son obligatorios'
        }, correlation_id);
        this.metrics?.increment('credential-manager.errors', { kind: 'resolve_invalid' });
        return;
      }

      const result = this._resolveCredential(provider, { customId, clientId: client_id, projectId: project_id });
      if (result.found) {
        await this._publishResolveResponse(request_id, {
          success: true,
          provider,
          api_key: result.apiKey,
          resolved_from: result.resolvedFrom
        }, correlation_id);
        this.metrics?.increment('credential-manager.resolved', { provider, level: result.resolvedFrom });
        this.logger.info('credential-manager.resolved', {
          provider, resolvedFrom: result.resolvedFrom, request_id, correlation_id
        });
      } else {
        await this._publishResolveResponse(request_id, {
          success: false,
          provider,
          error: 'No credentials found for provider'
        }, correlation_id);
        this.metrics?.increment('credential-manager.not_found', { provider });
        this.logger.info('credential-manager.resolve.not_found', {
          provider, attempts: result.attempts, request_id, correlation_id
        });
      }
    } catch (err) {
      this.logger.error('credential-manager.resolve.failed', {
        provider, error: err.message, request_id, correlation_id
      });
      this.metrics?.increment('credential-manager.errors', { kind: 'resolve' });
      await this._publishResolveResponse(request_id, {
        success: false,
        provider,
        error: err.message
      }, correlation_id);
    }
  }

  // ==========================================
  // HTTP API handlers
  // ==========================================

  async handleSaveCredential(req) {
    try {
      const { provider, level, identifier, api_key } = req.body || {};
      this._validateProviderLevelKey(provider, level, api_key);
      const validated = this._validateLevel(level, identifier);
      if (!validated.valid) return this._errorResponse(400, 'INVALID_INPUT', validated.message, validated.details);

      const key = this._buildKey(provider, level, identifier);
      const existed = this.credentials.has(key);
      this.credentials.set(key, api_key);
      process.env[key] = api_key;
      await this._saveEnvFile();
      this._updateCredentialMetrics();

      await this._publicarEvento(existed ? 'credential.updated' : 'credential.saved', {
        provider, level, identifier: identifier || null, key
      });
      this.metrics?.increment('credential-manager.created', { provider, level });

      return { status: existed ? 200 : 201, data: { key, created: !existed, updated: existed } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.http.save.failed', err, 'http_save');
    }
  }

  async handleResolveCredential(req) {
    try {
      const { provider, project_id, client_id, customId } = req.body || {};
      if (!provider) return this._errorResponse(400, 'INVALID_INPUT', 'provider is required', { kind: 'domain', field: 'provider' });

      const result = this._resolveCredential(provider, { customId, clientId: client_id, projectId: project_id });
      if (!result.found) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `No credentials found for provider "${provider}"`, { provider, attempts: result.attempts });
      }
      return { status: 200, data: { provider, api_key: result.apiKey, resolved_from: result.resolvedFrom } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.http.resolve.failed', err, 'http_resolve');
    }
  }

  async handleListCredentials() {
    try {
      return { status: 200, data: { credentials: this._getUIState().credentials } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.http.list.failed', err, 'http_list');
    }
  }

  async handleUpdateCredential(req) {
    try {
      const { key } = req.params || {};
      const { api_key } = req.body || {};
      if (!key) return this._errorResponse(400, 'INVALID_INPUT', 'key is required', { kind: 'domain', field: 'key' });
      if (!api_key) return this._errorResponse(400, 'INVALID_INPUT', 'api_key is required', { kind: 'domain', field: 'api_key' });
      if (!this.credentials.has(key)) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Credential not found', { entity_type: 'credential', entity_id: key });

      this.credentials.set(key, api_key);
      process.env[key] = api_key;
      await this._saveEnvFile();
      this._updateCredentialMetrics();
      await this._publicarEvento('credential.updated', { key });
      this.metrics?.increment('credential-manager.updated');

      return { status: 200, data: { key, updated: true } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.http.update.failed', err, 'http_update');
    }
  }

  async handleDeleteCredential(req) {
    try {
      const { key } = req.params || {};
      if (!key) return this._errorResponse(400, 'INVALID_INPUT', 'key is required', { kind: 'domain', field: 'key' });
      if (!this.credentials.has(key)) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Credential not found', { entity_type: 'credential', entity_id: key });

      this.credentials.delete(key);
      delete process.env[key];
      await this._saveEnvFile();
      this._updateCredentialMetrics();
      await this._publicarEvento('credential.deleted', { key });
      this.metrics?.increment('credential-manager.deleted');

      return { status: 200, data: { key, deleted: true } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.http.delete.failed', err, 'http_delete');
    }
  }

  async handleHealthCheck() {
    return {
      status: 'ok', module: this.name, version: this.version,
      credentials_count: this.credentials.size,
      env_file: this.envFilePath
    };
  }

  async handleGetMetrics() {
    const byLevel = { GLOBAL: 0, PROJECT: 0, CLIENT: 0, CUSTOM: 0, BOT: 0 };
    for (const key of this.credentials.keys()) {
      const level = this._extractLevel(key);
      if (byLevel[level] !== undefined) byLevel[level]++;
    }
    return {
      status: 200,
      data: {
        total: this.credentials.size,
        by_level: byLevel
      }
    };
  }

  async handleGetLevels() {
    return {
      status: 200,
      data: {
        levels: VALID_LEVELS.map(level => ({
          name: level,
          requires_identifier: level !== 'GLOBAL'
        }))
      }
    };
  }

  // ==========================================
  // UI Handlers (mqttRequest cross-modulo)
  // ==========================================

  async handleUIList() {
    try {
      return { status: 200, data: this._getUIState() };
    } catch (err) {
      return this._handleHandlerError('credential-manager.ui.list.failed', err, 'ui_list');
    }
  }

  async handleUIGet(data) {
    try {
      const { key } = data || {};
      if (!key) return this._errorResponse(400, 'INVALID_INPUT', 'Credential key is required', { kind: 'domain', field: 'key' });

      const value = this.credentials.get(key);
      if (!value) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Credential not found', { entity_type: 'credential', entity_id: key });

      const parsed = this._parseKey(key);
      const provider = parsed?.provider || 'UNKNOWN';
      return {
        status: 200,
        data: {
          credential: {
            key,
            provider,
            providerName: provider,
            providerIcon: PROVIDER_ICONS[provider] || '🔑',
            level: parsed?.level || 'UNKNOWN',
            identifier: parsed?.identifier || null,
            preview: this._maskApiKey(value)
          }
        }
      };
    } catch (err) {
      return this._handleHandlerError('credential-manager.ui.get.failed', err, 'ui_get');
    }
  }

  async handleUICreate(data) {
    try {
      const { provider, level, identifier, api_key } = data || {};
      this._validateProviderLevelKey(provider, level, api_key);
      const validated = this._validateLevel(level, identifier);
      if (!validated.valid) return this._errorResponse(400, 'INVALID_INPUT', validated.message, validated.details);

      const key = this._buildKey(provider, level, identifier);
      const existed = this.credentials.has(key);
      this.credentials.set(key, api_key);
      process.env[key] = api_key;
      await this._saveEnvFile();
      this._updateCredentialMetrics();

      await this._publicarEvento(existed ? 'credential.updated' : 'credential.saved', {
        provider, level, identifier: identifier || null, key
      });
      this.metrics?.increment('credential-manager.created', { provider, level });

      return { status: existed ? 200 : 201, data: { key, created: !existed, updated: existed } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.ui.create.failed', err, 'ui_create');
    }
  }

  async handleUIUpdate(data) {
    try {
      const { key, api_key } = data || {};
      if (!key) return this._errorResponse(400, 'INVALID_INPUT', 'Credential key is required', { kind: 'domain', field: 'key' });
      if (!api_key) return this._errorResponse(400, 'INVALID_INPUT', 'API key is required', { kind: 'domain', field: 'api_key' });
      if (!this.credentials.has(key)) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Credential not found', { entity_type: 'credential', entity_id: key });

      this.credentials.set(key, api_key);
      process.env[key] = api_key;
      await this._saveEnvFile();
      this._updateCredentialMetrics();
      await this._publicarEvento('credential.updated', { key });
      this.metrics?.increment('credential-manager.updated');

      return { status: 200, data: { key, updated: true } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.ui.update.failed', err, 'ui_update');
    }
  }

  async handleUIDelete(data) {
    try {
      const { key } = data || {};
      if (!key) return this._errorResponse(400, 'INVALID_INPUT', 'Credential key is required', { kind: 'domain', field: 'key' });
      if (!this.credentials.has(key)) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Credential not found', { entity_type: 'credential', entity_id: key });

      this.credentials.delete(key);
      delete process.env[key];
      await this._saveEnvFile();
      this._updateCredentialMetrics();
      await this._publicarEvento('credential.deleted', { key });
      this.metrics?.increment('credential-manager.deleted');

      return { status: 200, data: { key, deleted: true } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.ui.delete.failed', err, 'ui_delete');
    }
  }

  // ==========================================
  // AI Tools
  // ==========================================

  async handleToolCredentialList() {
    try {
      const state = this._getUIState();
      return {
        status: 200,
        data: {
          total: state.credentials.length,
          credentials: state.credentials.map(c => ({
            key: c.key,
            provider: c.provider,
            level: c.level,
            identifier: c.identifier,
            preview: c.preview
          }))
        }
      };
    } catch (err) {
      return this._handleHandlerError('credential-manager.tool.list.failed', err, 'tool_list');
    }
  }

  // ==========================================
  // Internals — UI state + resolve
  // ==========================================

  _getUIState() {
    const credentials = [];
    for (const [key, value] of this.credentials.entries()) {
      const parsed = this._parseKey(key);
      const provider = parsed?.provider || 'UNKNOWN';
      credentials.push({
        key,
        provider,
        providerName: provider,
        providerIcon: PROVIDER_ICONS[provider] || '🔑',
        level: parsed?.level || 'UNKNOWN',
        identifier: parsed?.identifier || null,
        preview: this._maskApiKey(value)
      });
    }
    return {
      credentials,
      total: credentials.length,
      env_file: this.envFilePath
    };
  }

  async _publishState(correlation_id = null) {
    if (!this.eventBus) return;
    const payload = {
      ...this._getUIState(),
      timestamp: new Date().toISOString()
    };
    if (correlation_id) payload.correlation_id = correlation_id;
    await this.eventBus.publish('credential.state', payload);
  }

  _resolveCredential(provider, { customId, clientId, projectId } = {}) {
    const attempts = [];
    // Provider por-proyecto: SOLO resuelve a nivel PROJECT. No baja a CUSTOM/CLIENT/GLOBAL/legacy,
    // aunque alguien hubiera colado una clave global a mano en el .env → no se puede usar cross-tenant.
    const projectOnly = PROJECT_ONLY_PROVIDERS.has(String(provider).toUpperCase());

    if (!projectOnly && customId) {
      const k = this._buildKey(provider, 'CUSTOM', customId);
      attempts.push(k);
      if (this.credentials.has(k)) {
        return { found: true, apiKey: this.credentials.get(k), key: k, resolvedFrom: 'CUSTOM', identifier: customId, attempts };
      }
    }
    if (!projectOnly && clientId) {
      const k = this._buildKey(provider, 'CLIENT', clientId);
      attempts.push(k);
      if (this.credentials.has(k)) {
        return { found: true, apiKey: this.credentials.get(k), key: k, resolvedFrom: 'CLIENT', identifier: clientId, attempts };
      }
    }
    if (projectId) {
      const k = this._buildKey(provider, 'PROJECT', projectId);
      attempts.push(k);
      if (this.credentials.has(k)) {
        return { found: true, apiKey: this.credentials.get(k), key: k, resolvedFrom: 'PROJECT', identifier: projectId, attempts };
      }
    }
    if (projectOnly) {
      return { found: false, attempts };   // sin caída a global: el aislamiento es el invariante
    }
    const globalK = this._buildKey(provider, 'GLOBAL');
    attempts.push(globalK);
    if (this.credentials.has(globalK)) {
      return { found: true, apiKey: this.credentials.get(globalK), key: globalK, resolvedFrom: 'GLOBAL', identifier: null, attempts };
    }
    // Legacy fallback: PROVIDER_API_KEY (sin nivel)
    const legacyK = `${provider.toUpperCase()}_API_KEY`;
    attempts.push(legacyK);
    if (this.credentials.has(legacyK)) {
      return { found: true, apiKey: this.credentials.get(legacyK), key: legacyK, resolvedFrom: 'GLOBAL', identifier: null, attempts };
    }
    return { found: false, attempts };
  }

  async _publishResolveResponse(request_id, payload, correlation_id) {
    const enriched = {
      request_id,
      ...payload,
      timestamp: new Date().toISOString()
    };
    if (correlation_id) enriched.correlation_id = correlation_id;
    await this.eventBus.publish('credential.resolve.response', enriched);
  }

  // ==========================================
  // Internals — key parsing
  // ==========================================

  _buildKey(provider, level, identifier = null) {
    const providerUpper = provider.toUpperCase();
    if (level === 'GLOBAL') return `${providerUpper}_API_KEY_GLOBAL`;
    return `${providerUpper}_API_KEY_${level}_${identifier}`;
  }

  _parseKey(key) {
    const match = key.match(/^([A-Z_]+)_API_KEY_(GLOBAL|PROJECT|CLIENT|CUSTOM|BOT)(?:_(.+))?$/);
    if (match) return { provider: match[1], level: match[2], identifier: match[3] || null };
    const legacy = key.match(/^([A-Z_]+)_API_KEY$/);
    if (legacy) return { provider: legacy[1], level: 'GLOBAL', identifier: null };
    return null;
  }

  _extractLevel(key) {
    const parsed = this._parseKey(key);
    return parsed ? parsed.level : 'UNKNOWN';
  }

  _validateLevel(level, identifier) {
    if (!VALID_LEVELS.includes(level)) {
      return { valid: false, message: `Unknown level: ${level}`, details: { kind: 'domain', field: 'level' } };
    }
    if (level !== 'GLOBAL' && !identifier) {
      return { valid: false, message: `Level ${level} requires an identifier`, details: { kind: 'domain', field: 'identifier' } };
    }
    if (level === 'GLOBAL' && identifier) {
      return { valid: false, message: `Level GLOBAL does not accept an identifier`, details: { kind: 'domain', field: 'identifier' } };
    }
    return { valid: true };
  }

  _validateProviderLevelKey(provider, level, api_key) {
    if (!provider) {
      throw Object.assign(new Error('Provider is required'), { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'provider' } });
    }
    if (!level) {
      throw Object.assign(new Error('Level is required'), { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'level' } });
    }
    if (!api_key) {
      throw Object.assign(new Error('API key is required'), { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'api_key' } });
    }
    // Invariante por-proyecto: estos providers SOLO se guardan a nivel PROJECT (con identifier=slug).
    // Bloquea GLOBAL/CLIENT/CUSTOM/BOT → imposible un token de WhatsApp compartido entre tiendas.
    if (PROJECT_ONLY_PROVIDERS.has(String(provider).toUpperCase()) && level !== 'PROJECT') {
      throw Object.assign(
        new Error(`Provider ${provider} es por-proyecto: solo se permite nivel PROJECT (recibido: ${level})`),
        { _code: 'INVALID_INPUT', _details: { kind: 'domain', field: 'level', provider, allowed_level: 'PROJECT' } }
      );
    }
  }

  _maskApiKey(apiKey) {
    const maskLength = this.config?.maskLength || 4;
    if (!apiKey || apiKey.length <= maskLength) return '*'.repeat(apiKey?.length || 0);
    return '*'.repeat(apiKey.length - maskLength) + apiKey.slice(-maskLength);
  }

  // ==========================================
  // Helpers canonicos POC2 (5 transferibles)
  // ==========================================

  /**
   * Helper canonico para fetch con timeout + telemetria. Preparado para uso
   * en credential-tester (sesion 2 pendiente). NO se usa en el core actual
   * porque el core no hace fetch a APIs externas — solo lee/escribe .env y
   * resuelve cache in-memory.
   */
  async _fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      if (typeof this.metrics?.timing === 'function') {
        this.metrics.timing('credential-manager.fetch.duration', duration);
      }
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      this.metrics?.increment('credential-manager.fetch.errors');
      if (err.name === 'AbortError') {
        const e = new Error(`fetch timeout after ${timeoutMs}ms`);
        e._timeout = true;
        throw e;
      }
      throw err;
    }
  }
}

module.exports = CredentialManagerModule;
