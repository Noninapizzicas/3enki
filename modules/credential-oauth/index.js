'use strict';
/**
 * credential-oauth — Sesión 3 de la descomposición de credential-manager.
 *
 * PUENTE OAuth2 (Google/Gmail): traduce el exterior OAuth (URL de autorización,
 * callback HTTP, intercambio de code) a eventos internos del bus. Reflejo puro
 * (todo determinista: generar URL, validar, CRUD, resolver — sin cajón LLM).
 *
 * Traducción fiel del monolito (arquitectura/migracion/_legacy/...bak):
 *   onOAuthResolveRequest (~593)     → _resolve (sirve a provider-loader local.gmail)
 *   handleUIOAuthStart (~1541)       → _start
 *   handleUIOAuthStatus (~1683)      → _status
 *   handleUIOAuthConfigList/Save/Delete (~1722-1812) → _configList/_configCreate/_configDelete
 *   handleOAuthCallback (~2142)      → handleOAuthCallback (HTTP)
 *   renderOAuthResultPage (~2279)    → _renderOAuthResultPage
 *   cleanupPendingOAuth (~2353)      → _cleanupPendingOAuth
 *
 * Contrato (spec sesión 3):
 *   credential.oauth.start.request  { request_id, provider, project_id, level?, identifier?, scopes? }
 *     → credential.oauth.start.response { request_id, status, data: { auth_url, state_id, ... } }
 *   credential.oauth.status.request { request_id, state_id }
 *     → credential.oauth.status.response { request_id, status, data: { state_id, status, ... } }
 *   credential.oauth.resolve.request { request_id, provider, account? }   ← provider-loader (local.gmail)
 *     → credential.oauth.resolve.response { request_id, success, provider, account, credentials: { clientId, clientSecret, refreshToken }, resolved_from }
 *   credential.oauth_config.{create,list,delete}.request → .response
 *   HTTP GET /modules/credential-oauth/oauth/callback (única excepción HTTP del diseño)
 *
 * Dependencia canónica: el refresh_token se guarda DELEGANDO en credential-manager
 * (credential.create.request → publica credential.saved). credential-oauth NO
 * guarda credenciales: guarda solo las CONFIGS OAuth (client_id/secret) en
 * oauth-configs.json por proyecto (spec), con la estructura del Map del monolito.
 *
 * Nota de adaptación multi-tenant: las configs OAuth de Google son del SISTEMA
 * (una app OAuth), no del tenant — se persisten por proyecto (spec) pero la
 * búsqueda (start/resolve) hace cascada por accountId sin importar el proyecto.
 * El pending (estado transitorio del flow) vive SOLO en memoria, expira en 10
 * minutos (como el monolito); lost_on_restart.
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');
const googleOAuth = require('./oauth/google');

const VALID_LEVELS = ['GLOBAL', 'PROJECT', 'CLIENT', 'CUSTOM', 'BOT'];
const SUPPORTED_PROVIDERS = ['GMAIL', 'GOOGLE'];
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutos

class CredentialOAuthModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'credential-oauth';
    this.version = 'reflejo-0.1.0';

    // accountId -> { accountId, accountName, clientId, clientSecret, configured, project_id }
    this.oauthConfigs = new Map();
    // stateId -> { provider, level, identifier, scopes, clientId, clientSecret, redirectUri, createdAt }
    this.oauthPending = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'oauth-configs.json',
      dir: '/credential-oauth',
      snapshot: (pid) => ({
        configs: [...this.oauthConfigs.values()]
          .filter((c) => c.project_id === pid)
          .map((c) => ({
            accountId: c.accountId,
            accountName: c.accountName,
            clientId: c.clientId,
            clientSecret: c.clientSecret,
            configured: true
          }))
      }),
      hidratar: (pid, data) => {
        for (const c of (data.configs || [])) {
          this.oauthConfigs.set(c.accountId, { ...c, project_id: pid });
        }
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ─────────────────────────────────────────────
  // RPC handlers — una línea cada uno (patrón _atender)
  // ─────────────────────────────────────────────

  onOAuthStartRequest(e) {
    return this._atender(e, 'oauth.start', 'credential.oauth.start.response', (d) => this._start(d));
  }

  onOAuthStatusRequest(e) {
    return this._atender(e, 'oauth.status', 'credential.oauth.status.response', (d) => this._status(d));
  }

  onOAuthConfigCreateRequest(e) {
    return this._atender(e, 'oauth_config.create', 'credential.oauth_config.create.response', (d) => this._configCreate(d));
  }

  onOAuthConfigListRequest(e) {
    return this._atender(e, 'oauth_config.list', 'credential.oauth_config.list.response', (d) => this._configList(d));
  }

  onOAuthConfigDeleteRequest(e) {
    return this._atender(e, 'oauth_config.delete', 'credential.oauth_config.delete.response', (d) => this._configDelete(d));
  }

  /**
   * Resolver OAuth — NO usa _atender: provider-loader (core/providers/loader.js)
   * espera el shape { request_id, success, credentials } en TOP-LEVEL de la response.
   * Este es el handler que reactiva local.gmail (el cartero del radar lo dispara).
   */
  async onOAuthResolveRequest(event) {
    const d = (event && event.data) || event || {};
    const { request_id, provider, account } = d;
    const responseEvent = 'credential.oauth.resolve.response';

    try {
      const result = await this._resolve({ provider, account });
      if (result.success) {
        this.eventBus.publish(responseEvent, {
          request_id,
          success: true,
          provider,
          account: result.account,
          credentials: result.credentials,
          resolved_from: result.resolved_from
        });
      } else {
        this.eventBus.publish(responseEvent, {
          request_id,
          success: false,
          provider,
          account: account || null,
          error: result.error
        });
      }
    } catch (err) {
      this.logger?.error('credential-oauth.resolve.failed', { provider, error: err.message });
      this.eventBus.publish(responseEvent, {
        request_id,
        success: false,
        provider,
        account: account || null,
        error: err.message
      });
    }
  }

  // ─────────────────────────────────────────────
  // Proyecciones — traducción fiel del monolito
  // ─────────────────────────────────────────────

  /** handleUIOAuthStart (~1541) — inicia el flujo: URL + state único */
  _start(input) {
    const { provider, level, identifier, scopes = ['gmail'], project_id } = input;

    if (!provider) return this._invalid('provider');
    if (!level) return this._invalid('level');

    const validation = this._validateLevel(level, identifier);
    if (!validation.valid) return this._errorResponse(400, 'INVALID_INPUT', validation.message, validation.details);

    const providerUpper = String(provider).toUpperCase();
    if (!SUPPORTED_PROVIDERS.includes(providerUpper)) {
      return this._errorResponse(400, 'UNSUPPORTED_PROVIDER',
        `OAuth not supported for provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }

    // Cascada de client_id/secret: config del store (accountId) → env (legacy)
    const accountIdsToTry = [];
    if (identifier) accountIdsToTry.push(identifier);
    accountIdsToTry.push('default');

    let clientId = null;
    let clientSecret = null;
    let usedAccountId = null;

    for (const accId of accountIdsToTry) {
      const config = this._findConfig(accId, project_id);
      if (config && config.clientId && config.clientSecret) {
        clientId = config.clientId;
        clientSecret = config.clientSecret;
        usedAccountId = accId;
        break;
      }
    }
    if (!clientId || !clientSecret) {
      for (const accId of accountIdsToTry) {
        const env = this._envConfig(accId);
        if (env.clientId && env.clientSecret) {
          clientId = env.clientId;
          clientSecret = env.clientSecret;
          usedAccountId = accId;
          break;
        }
      }
    }
    if (!clientId || !clientSecret) {
      return this._errorResponse(400, 'MISSING_OAUTH_CREDENTIALS',
        'No OAuth config found. Configure client_id/client_secret first (credential.oauth_config.create.request).');
    }

    // State único para validar el callback
    const stateId = crypto.randomBytes(16).toString('hex');
    const baseUrl = process.env.BASE_URL || process.env.API_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/modules/credential-oauth/oauth/callback`;
    const state = { id: stateId, provider: providerUpper, level, identifier: identifier || null };

    this.oauthPending.set(stateId, {
      provider: providerUpper,
      level,
      identifier: identifier || null,
      scopes,
      clientId,
      clientSecret,
      redirectUri,
      createdAt: Date.now()
    });

    this._cleanupPendingOAuth();

    const authUrl = googleOAuth.getAuthUrl({ clientId, redirectUri, state, scopes });

    this.logger?.info('credential-oauth.start.initiated', {
      provider: providerUpper, level, identifier, stateId, scopes, usedAccountId
    });

    return {
      status: 200,
      data: {
        auth_url: authUrl,
        state_id: stateId,
        expires_in: Math.floor(PENDING_TTL_MS / 1000), // 600
        instructions: 'Open auth_url in browser. After authorization, credential will be saved automatically.'
      }
    };
  }

  /** handleUIOAuthStatus (~1683) — polling del flow pendiente */
  _status(input) {
    const { state_id } = input;

    if (!state_id) return this._invalid('state_id');

    const pending = this.oauthPending.get(state_id);
    if (!pending) {
      // Ya no está pendiente: o se completó o expiró
      return {
        status: 200,
        data: { state_id, status: 'completed_or_expired', message: 'OAuth flow completed or expired' }
      };
    }

    const elapsed = Date.now() - pending.createdAt;
    const remainingMs = Math.max(0, PENDING_TTL_MS - elapsed);

    return {
      status: 200,
      data: {
        state_id,
        status: 'pending',
        provider: pending.provider,
        level: pending.level,
        identifier: pending.identifier,
        remaining_seconds: Math.floor(remainingMs / 1000)
      }
    };
  }

  /**
   * onOAuthResolveRequest (~593) — resuelve { clientId, clientSecret, refreshToken }.
   * Config: store del módulo (cascada account → default) con fallback env.
   * Refresh token: DELEGA en credential-manager (credential.resolve.request, cascada
   * CUSTOM(account) → ... → GLOBAL), con fallback env GMAIL_REFRESH_TOKEN.
   */
  async _resolve({ provider, account }) {
    const accountsToTry = account ? [account, 'default'] : ['default'];
    let oauthConfig = null;
    let usedAccount = null;

    for (const acc of accountsToTry) {
      const config = this._findConfig(acc, null); // configs OAuth = del sistema (sin filtro tenant)
      if (config && config.clientId && config.clientSecret) {
        oauthConfig = config;
        usedAccount = acc;
        break;
      }
      const env = this._envConfig(acc);
      if (env.clientId && env.clientSecret) {
        oauthConfig = env;
        usedAccount = acc;
        break;
      }
    }

    if (!oauthConfig) {
      return { success: false, error: `No OAuth config found for account: ${account || 'default'}` };
    }

    // Refresh token via credential-manager (cascada canónica)
    let refreshToken = null;
    for (const acc of accountsToTry) {
      const resp = await this._rpc('credential.resolve.request', { provider, customId: acc });
      if (resp && resp.success && resp.api_key) {
        refreshToken = resp.api_key;
        break;
      }
    }
    if (!refreshToken) {
      const resp = await this._rpc('credential.resolve.request', { provider });
      if (resp && resp.success && resp.api_key) refreshToken = resp.api_key;
    }
    // Fallback env (legacy)
    if (!refreshToken) {
      const envRt = account
        ? (process.env[`GMAIL_REFRESH_TOKEN_${account}`] || process.env.GMAIL_REFRESH_TOKEN)
        : process.env.GMAIL_REFRESH_TOKEN;
      if (envRt) refreshToken = envRt;
    }

    if (!refreshToken) {
      return { success: false, error: `No refresh token found for account: ${account || 'default'}` };
    }

    return {
      success: true,
      account: usedAccount,
      resolved_from: usedAccount === 'default' ? 'GLOBAL' : 'CUSTOM',
      credentials: {
        clientId: oauthConfig.clientId,
        clientSecret: oauthConfig.clientSecret,
        refreshToken
      }
    };
  }

  /** handleUIOAuthConfigSave (~1750) — guarda/actualiza una config OAuth */
  _configCreate(input) {
    const { project_id, accountId, accountName, clientId, clientSecret } = input;

    if (!project_id) return this._invalid('project_id');
    if (!accountId) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'accountId is required (e.g., "default", "empresa", "personal")', { field: 'accountId' });
    }
    if (!clientId) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'clientId is required (from Google Cloud Console)', { field: 'clientId' });
    }
    if (!clientSecret) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'clientSecret is required (from Google Cloud Console)', { field: 'clientSecret' });
    }
    if (!clientId.includes('.apps.googleusercontent.com')) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'clientId format invalid. Should end with .apps.googleusercontent.com', { field: 'clientId' });
    }

    const isNew = !this.oauthConfigs.has(accountId);

    this.oauthConfigs.set(accountId, {
      accountId,
      accountName: accountName || accountId,
      clientId,
      clientSecret,
      configured: true,
      project_id
    });
    this._persist.marcarDirty(project_id);

    this.logger?.info('credential-oauth.config.saved', { accountId, isNew, project_id });

    return {
      status: 200,
      data: {
        accountId,
        accountName: accountName || accountId,
        created: isNew,
        updated: !isNew,
        message: `OAuth configuration ${isNew ? 'created' : 'updated'} for account: ${accountId}`
      }
    };
  }

  /** handleUIOAuthConfigList (~1722) — lista configs (clientId enmascarado, sin secret) */
  _configList(input) {
    const { project_id } = input || {};
    const configs = [];

    for (const [accountId, config] of this.oauthConfigs.entries()) {
      if (project_id && config.project_id && config.project_id !== project_id) continue;
      configs.push({
        accountId,
        accountName: config.accountName || accountId,
        clientId: config.clientId,
        clientIdPreview: this._maskApiKey(config.clientId),
        hasSecret: !!config.clientSecret,
        configured: true
      });
    }

    return { status: 200, data: { configs, total: configs.length } };
  }

  /** handleUIOAuthConfigDelete (~1812) — elimina una config OAuth */
  _configDelete(input) {
    const { project_id, accountId } = input;

    if (!accountId) return this._invalid('accountId');

    const config = this.oauthConfigs.get(accountId);
    if (!config) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `OAuth config not found: ${accountId}`, { entity_type: 'oauth_config', entity_id: accountId });
    }

    this.oauthConfigs.delete(accountId);
    if (project_id) this._persist.marcarDirty(project_id);

    this.logger?.info('credential-oauth.config.deleted', { accountId });

    return {
      status: 200,
      data: { accountId, deleted: true, message: `OAuth configuration deleted for account: ${accountId}` }
    };
  }

  // ─────────────────────────────────────────────
  // HTTP — handleOAuthCallback (~2142), la única excepción HTTP del diseño
  // ─────────────────────────────────────────────

  async handleOAuthCallback(req, context) {
    const { code, state: stateParam, error } = req.query || {};
    const correlationId = context?.correlationId;

    this.logger?.info('credential-oauth.callback.received', {
      hasCode: !!code,
      hasState: !!stateParam,
      hasError: !!error,
      correlation_id: correlationId
    });

    if (error) {
      return this._httpResult(false, `Error de autorización: ${error}`);
    }

    if (!code || !stateParam) {
      return this._httpResult(false, 'Parámetros incompletos: code y state requeridos', 400);
    }

    let state;
    try {
      state = googleOAuth.parseState(stateParam);
    } catch {
      return this._httpResult(false, 'State inválido', 400);
    }

    const pending = this.oauthPending.get(state.id);
    if (!pending) {
      return this._httpResult(false, 'Sesión OAuth expirada o inválida. Por favor, inicia el proceso nuevamente.', 400);
    }

    try {
      const tokens = await googleOAuth.exchangeCode({
        code,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        redirectUri: pending.redirectUri
      });

      if (!tokens.refresh_token) {
        throw new Error('No se recibió refresh_token. El usuario puede necesitar revocar acceso y reautorizar.');
      }

      // DEPENDENCIA canónica: la credencial la guarda credential-manager
      // (credential.create.request → publica credential.saved tras éxito).
      const existed = await this._credentialExists(pending.provider, pending.identifier);
      this.eventBus.publish('credential.create.request', {
        provider: pending.provider,
        level: pending.level,
        identifier: pending.identifier || null,
        api_key: tokens.refresh_token
      });

      // Limpiar pending
      this.oauthPending.delete(state.id);

      this.metrics?.increment('credential-oauth.callback.ok', { provider: pending.provider });
      this.logger?.info('credential-oauth.callback.success', {
        key: this._buildKey(pending.provider, pending.level, pending.identifier),
        provider: pending.provider,
        level: pending.level,
        created: !existed,
        correlation_id: correlationId
      });

      return this._httpResult(true, `Credencial ${existed ? 'actualizada' : 'creada'} correctamente`, 200, {
        provider: pending.provider,
        level: pending.level,
        identifier: pending.identifier
      });
    } catch (err) {
      this.logger?.error('credential-oauth.callback.error', { error: err.message, correlation_id: correlationId });
      this.metrics?.increment('credential-oauth.callback.errors');
      return this._httpResult(false, `Error al procesar autorización: ${err.message}`, 200);
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        pending_oauth: this.oauthPending.size,
        configs: this.oauthConfigs.size
      }
    };
  }

  // ─────────────────────────────────────────────
  // Helpers privados
  // ─────────────────────────────────────────────

  _httpResult(success, message, status = 200, details = null) {
    return {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      data: this._renderOAuthResultPage(success, message, details)
    };
  }

  /** renderOAuthResultPage (~2279) — página HTML de éxito/error con postMessage al opener */
  _renderOAuthResultPage(success, message, details = null) {
    const color = success ? '#16a34a' : '#dc2626';
    const icon = success ? '✓' : '✗';
    const title = success ? 'Autorización Exitosa' : 'Error de Autorización';

    let detailsHtml = '';
    if (details) {
      detailsHtml = `
        <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: left;">
          <p><strong>Provider:</strong> ${details.provider}</p>
          <p><strong>Nivel:</strong> ${details.level}</p>
          ${details.identifier ? `<p><strong>Identificador:</strong> ${details.identifier}</p>` : ''}
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title} - Event-Core</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              padding: 40px;
              text-align: center;
              background: #f9fafb;
              margin: 0;
            }
            .container {
              max-width: 500px;
              margin: 0 auto;
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            h1 { color: ${color}; margin-bottom: 10px; }
            .icon { font-size: 64px; margin-bottom: 20px; }
            p { color: #374151; line-height: 1.6; }
            .close-hint {
              margin-top: 30px;
              color: #6b7280;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">${icon}</div>
            <h1>${title}</h1>
            <p>${message}</p>
            ${detailsHtml}
            <p class="close-hint">Puedes cerrar esta ventana y volver a la aplicación.</p>
          </div>
          <script>
            // Notificar a la ventana padre si existe
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-callback',
                success: ${success},
                message: '${message.replace(/'/g, "\\'")}'
              }, '*');
            }
          </script>
        </body>
      </html>
    `;
  }

  /** cleanupPendingOAuth (~2353) — housekeeping de pendings expirados */
  _cleanupPendingOAuth() {
    const now = Date.now();
    let cleaned = 0;

    for (const [stateId, pending] of this.oauthPending.entries()) {
      if (now - pending.createdAt > PENDING_TTL_MS) {
        this.oauthPending.delete(stateId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger?.info('credential-oauth.pending.cleanup', { cleaned });
    }
  }

  _findConfig(accountId, project_id) {
    const config = this.oauthConfigs.get(accountId);
    if (!config) return null;
    if (project_id && config.project_id && config.project_id !== project_id) return null;
    return config;
  }

  _envConfig(accountId) {
    if (accountId === 'default') {
      return { clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET };
    }
    return {
      clientId: process.env[`GMAIL_CLIENT_ID_${accountId}`],
      clientSecret: process.env[`GMAIL_CLIENT_SECRET_${accountId}`]
    };
  }

  async _credentialExists(provider, identifier) {
    const resp = await this._rpc('credential.resolve.request',
      identifier ? { provider, customId: identifier } : { provider });
    return !!(resp && resp.success && resp.api_key);
  }

  _buildKey(provider, level, identifier = null) {
    const providerUpper = provider.toUpperCase();
    if (level === 'GLOBAL') return `${providerUpper}_API_KEY_GLOBAL`;
    return `${providerUpper}_API_KEY_${level}_${identifier}`;
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

  _maskApiKey(apiKey) {
    const maskLength = 4;
    if (!apiKey || apiKey.length <= maskLength) {
      return '*'.repeat(apiKey ? apiKey.length : 0);
    }
    const visible = apiKey.slice(-maskLength);
    const masked = '*'.repeat(apiKey.length - maskLength);
    return masked + visible;
  }
}

module.exports = CredentialOAuthModule;
