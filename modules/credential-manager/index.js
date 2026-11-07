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
  OLLAMA_CLOUD: '🦙',
  GOOGLE: '☁️',
  GEMINI: '☁️',
  GROQ: '⚡',
  KIMI: '🌙',
  GMAIL: '📧',
  GLOVO: '🛵',
  GLOVO_CLIENT_ID: '🛵',
  GLOVO_CLIENT_SECRET: '🛵',
  GLOVO_CHAIN_ID: '🛵',
  GLOVO_WEBHOOK_TOKEN: '🪝',
  CLOUDFLARE: '🟧',
  TELEGRAM: '✈️',
  META_WHATSAPP: '💬',
  META_WHATSAPP_VERIFY_TOKEN: '🪝'
};

const VALID_LEVELS = ['GLOBAL', 'PROJECT', 'CLIENT', 'CUSTOM', 'BOT'];

// Campos del vendor Glovo (multi-campo). Cada campo se persiste como su propio
// "provider" — igual que META_WHATSAPP + META_WHATSAPP_VERIFY_TOKEN — bajo la
// clave canonica <CAMPO>_API_KEY_PROJECT_<slug>. El consumidor (provider
// local.glovo + webhook de cuentas-canales) lee ese env directamente por
// proyecto (sincrono), sin bus. Ver handleGlovoSave / _getGlovoConfigs.
const GLOVO_FIELDS = ['GLOVO_CLIENT_ID', 'GLOVO_CLIENT_SECRET', 'GLOVO_CHAIN_ID', 'GLOVO_WEBHOOK_TOKEN'];

// Providers cuyo secreto es POR PROYECTO (multi-tenant): cada tienda tiene su propio número/token
// y su propio webhook → NUNCA pueden ser globales (un token global mezclaría negocios). Se exige
// nivel PROJECT al guardar y la resolución NO cae a GLOBAL/legacy para ellos (aislamiento real).
// Glovo entra aquí: varios proyectos, cada uno con sus credenciales de Glovo, aislados.
const PROJECT_ONLY_PROVIDERS = new Set(['META_WHATSAPP', 'META_WHATSAPP_VERIFY_TOKEN', ...GLOVO_FIELDS]);

// ── ROTACIÓN DE TOKEN (v2.3.0) ──────────────────────────────────────────────
// Hay credenciales que NO son una key estática: OAuth2 devuelve un access_token
// de corta vida + un refresh_token que ROTA en cada uso. Este módulo nunca fue
// diseñado para eso (su modelo es "una key por provider, inmutable"). En vez de
// reescribir el modelo — rompiendo las 50+ credenciales estáticas que ya viven
// en los .env — la rotación vive en una FILA aparte del .env, con metadatos
// versionados. Una credencial rotativa NO ocupa el hueco `*_API_KEY_*`:
//
//   credential.rotations.json   { "<provider>": { <levelKey>: {token, refresh_token,
//                                  expires_at, client_id, refreshed_at, generation} } }
//
// Por qué una fila aparte y no el .env:
//   1. _saveEnvFile() reescribe el .env entero desde this.credentials → un token
//      que rota cada hora reescribiría el fichero de credenciales estáticas
//      constantemente (y con ellas, la ventana de corrupción).
//   2. El .env lo lee/writes credential-manager; el ciclo OAuth lo manejan
//      credential-oauth y el refrescador. Una fila aparte con su lock evita que
//      dos escritores se pisen (que es exactamente lo que revoca la cadena).
//   3. El legacy (`_loadEnvFile`) no toca estas claves: siguen siendo de otros
//      módulos.
//
// INVARIANTES (probados en tests/unit/credential-manager__rotacion.test.js):
//   - Una rotación NUNCA escribe en this.credentials ni en el .env de credenciales.
//   - El access_token sirve solo si NO está vencido (expires_at en el futuro).
//   - Si está vencido: se intenta refrescar con el refresh_token. Si el refresh
//     falla (revocado/caducado), la credencial pasa a ESTADO REVOCADA y NO se
//     reintenta a ciegas — devuelve el error y espera re-login humano.
//   - La rotación del refresh_token se persiste ANTES de dar el nuevo access_token
//     por bueno: si el proceso muere entre medias, el siguiente refresh usa el
//     último refresh_token bueno, no uno quemado.
const ROTATION_FILE = 'credential.rotations.json';
const ROTATION_TTL_FALLBACK_MS = 55 * 60 * 1000; // 55 min si el emisor no da expires_in
const REVOKED_RETRY_MS = 10 * 60 * 1000;         // no reintentar una credencial revocada

class CredentialManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'credential-manager';
    this.version = '2.3.0';
    this.uiHandler = null;
    this.config    = null;

    this.envFilePath = null;
    this.credentials = new Map();
    // Fila de rotaciones: provider -> levelKey -> registro (ver ROTATION_FILE).
    this.rotations = new Map();
    this.rotationFilePath = null;
    this._rotationLock = false;
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

    // Fila de rotaciones: MISMO directorio que el .env, para que el reconciliador
    // y el backup los traten como una unidad.
    this.rotationFilePath = path.join(path.dirname(this.envFilePath), ROTATION_FILE);
    await this._loadRotations();
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
    this.rotations.clear();
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
  // ROTACIÓN DE TOKEN (v2.3.0) — credenciales OAuth que expiran y rotan
  // ==========================================
  // Una credencial rotativa es un registro con metadatos: access_token (vida
  // corta) + refresh_token (ROTORIO) + expires_at + client_id. Vive en
  // this.rotations, en su propia fila, y NUNCA toca this.credentials.
  //
  // Contrato de eventos:
  //   credential.rotate.start.request   { provider, level, identifier?, client_id?,
  //                                       access_token, refresh_token, expires_in?,
  //                                       token_type?, scope? }
  //     → credential.rotate.start.response { request_id, status, data }  (vía _atender)
  //   credential.rotate.resolve.request { provider, level?, identifier?, force? }
  //     → credential.rotate.resolve.response { request_id, status, data: { token, ...} }
  //   credential.rotate.revoke.request  { provider, level?, identifier? }
  //     → credential.rotate.revoke.response  { request_id, status, data }
  //
  // El refresh lo hace AQUÍ (no credential-oauth): es el único sitio que posee
  // el refresh_token y el cliente HTTP. credential-oauth solo entrega el primer
  // par (access+refresh) al terminar el consentimiento.

  // RPC request/response (mismo contrato que _atender de modulo-hibrido-reflejo,
  // pero aquí: credential-manager extiende BaseModule, que no lo tiene). Publica
  // { request_id, status, data } y devuelve el resultado al caller.
  _atender(event, op, responseEvent, proyeccion) {
    const d = (event && event.data) || event || {};
    const run = async () => {
      let result;
      try {
        result = await proyeccion(d);
        this.metrics?.increment(`${this.name}.reflejo.served`, { op });
      } catch (err) {
        this.logger?.error(`${this.name}.reflejo.failed`, { op, error: err.message });
        this.metrics?.increment(`${this.name}.reflejo.errors`, { op });
        result = this._errorResponse(500, 'UNKNOWN_ERROR', err.message);
      }
      this.eventBus.publish(responseEvent, { request_id: d.request_id, ...result });
      return result;
    };
    return run();
  }

  _rotationKey(provider, level, identifier) {
    const lvl = level || 'GLOBAL';
    return lvl === 'GLOBAL' ? 'GLOBAL' : `${lvl}:${identifier || ''}`;
  }

  _loadRotations() {
    if (!fsSync.existsSync(this.rotationFilePath)) return;
    try {
      const raw = fsSync.readFileSync(this.rotationFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const providers = parsed?.providers || parsed || {};
      for (const [provider, levels] of Object.entries(providers)) {
        if (!levels || typeof levels !== 'object') continue;
        const inner = new Map();
        for (const [k, v] of Object.entries(levels)) inner.set(k, v);
        this.rotations.set(String(provider).toUpperCase(), inner);
      }
      this.logger.info('credential-manager.rotations.loaded', {
        providers: this.rotations.size,
        records: [...this.rotations.values()].reduce((a, m) => a + m.size, 0)
      });
    } catch (err) {
      // Una fila corrupta NO tumba el módulo: se queda sin rotaciones y lo dice.
      this.logger.error('credential-manager.rotations.load.failed', {
        path: this.rotationFilePath, error: err.message
      });
      this.metrics?.increment('credential-manager.errors', { kind: 'rotations_load' });
    }
  }

  async _saveRotations() {
    if (this._rotationLock) {
      // Un refresco en vuelo: su propia escritura ya cubrirá este cambio. Sin await
      // cruzado: dos escritores peleando por el refresh_token es lo que revoca la cadena.
      this.logger.warn('credential-manager.rotations.write.deferred', { reason: 'lock' });
      return;
    }
    this._rotationLock = true;
    try {
      const out = { _schema: 1, updated_at: new Date().toISOString(), providers: {} };
      for (const [provider, levels] of this.rotations.entries()) {
        out.providers[provider] = Object.fromEntries(levels.entries());
      }
      const tmp = `${this.rotationFilePath}.tmp.${process.pid}.${Date.now()}`;
      await fs.writeFile(tmp, JSON.stringify(out, null, 2));
      await fs.rename(tmp, this.rotationFilePath);
    } finally {
      this._rotationLock = false;
    }
  }

  _getRotation(provider, level, identifier) {
    return this.rotations.get(String(provider).toUpperCase())?.get(this._rotationKey(provider, level, identifier)) || null;
  }

  _isExpired(reg) {
    if (!reg?.expires_at) return false;
    return Date.now() >= new Date(reg.expires_at).getTime();
  }

  /** Registro de UI (nunca expone el token ni el refresh). */
  _rotationState(provider, level, identifier) {
    const reg = this._getRotation(provider, level, identifier);
    if (!reg) return null;
    return {
      provider: String(provider).toUpperCase(),
      level: reg.level || 'GLOBAL',
      identifier: reg.identifier || null,
      status: reg.revoked_at ? 'REVOKED' : (this._isExpired(reg) ? 'EXPIRED' : 'ACTIVE'),
      expires_at: reg.expires_at || null,
      refreshed_at: reg.refreshed_at || null,
      generation: reg.generation || 1,
      token_preview: this._maskApiKey(reg.token || ''),
      client_id: reg.client_id || null
    };
  }

  async onRotationStartRequest(event) {
    const d = event?.data || event || {};
    const { request_id, provider, level, identifier, access_token, refresh_token, expires_in, client_id } = d;
    try {
      return this._atender(event, 'rotate.start', 'credential.rotate.start.response', async () => {
        if (!provider || !access_token) {
          return this._errorResponse(400, 'INVALID_INPUT', 'provider y access_token son requeridos', { kind: 'domain' });
        }
        const lvl = level || 'GLOBAL';
        const validated = this._validateLevel(lvl, identifier);
        if (!validated.valid) {
          return this._errorResponse(400, 'INVALID_INPUT', validated.message, validated.details);
        }
        const providerUpper = String(provider).toUpperCase();
        const key = this._rotationKey(providerUpper, lvl, identifier);

        const prev = this._getRotation(providerUpper, lvl, identifier);
        const reg = {
          provider: providerUpper,
          level: lvl,
          identifier: identifier || null,
          token: access_token,
          refresh_token: refresh_token || prev?.refresh_token || null,
          expires_at: this._computeExpiry(expires_in),
          client_id: client_id || prev?.client_id || null,
          token_type: d.token_type || 'Bearer',
          scope: d.scope || prev?.scope || null,
          created_at: prev?.created_at || new Date().toISOString(),
          refreshed_at: new Date().toISOString(),
          generation: (prev?.generation || 0) + 1,
          revoked_at: null
        };
        if (!this.rotations.has(providerUpper)) this.rotations.set(providerUpper, new Map());
        this.rotations.get(providerUpper).set(key, reg);
        await this._saveRotations();

        this.metrics?.increment('credential-manager.rotations.started', { provider: providerUpper });
        this.logger.info('credential-manager.rotations.started', {
          provider: providerUpper, level: lvl, generation: reg.generation
        });
        return { status: 200, data: this._rotationState(providerUpper, lvl, identifier) };
      });
    } catch (err) {
      return this._handleHandlerError('credential-manager.rotate.start.failed', err, 'rotate_start');
    }
  }

  _computeExpiry(expires_in) {
    const ms = Number(expires_in) > 0 ? Number(expires_in) * 1000 : ROTATION_TTL_FALLBACK_MS;
    return new Date(Date.now() + ms).toISOString();
  }

  /**
   * Resuelve el access_token vigente; si está vencido, lo refresca con el
   * refresh_token y persiste el nuevo par (incluido el refresh rotado).
   * Devuelve { token, expires_at, generation, refreshed } o un error canónico.
   */
  async onRotationResolveRequest(event) {
    const d = event?.data || event || {};
    const { provider, level, identifier, force } = d;
    return this._atender(event, 'rotate.resolve', 'credential.rotate.resolve.response', async () => {
      try {
        if (!provider) {
          return this._errorResponse(400, 'INVALID_INPUT', 'provider requerido', { kind: 'domain' });
        }
        const providerUpper = String(provider).toUpperCase();
        const reg = this._getRotation(providerUpper, level, identifier);
        if (!reg) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `No hay credencial rotativa para ${providerUpper}`,
            { entity_type: 'rotation', entity_id: providerUpper });
        }
        if (reg.revoked_at) {
          return this._errorResponse(409, 'CREDENTIAL_REVOKED',
            `La credencial rotativa de ${providerUpper} está revocada. Reautoriza (credential.rotate.start.request).`,
            { entity_type: 'rotation', entity_id: providerUpper });
        }

        if (!this._isExpired(reg) && !force) {
          return { status: 200, data: {
            token: reg.token, expires_at: reg.expires_at,
            generation: reg.generation, refreshed: false, status: 'ACTIVE'
          } };
        }

        if (!reg.refresh_token) {
          // Sin refresh: solo queda reautorizar. NO se reintenta a ciegas.
          return this._errorResponse(409, 'CREDENTIAL_EXPIRED',
            `El token de ${providerUpper} expiró y no hay refresh_token. Reautoriza.`,
            { entity_type: 'rotation', entity_id: providerUpper });
        }

        const tokenUrl = d.token_url || reg.token_url || process.env[`${providerUpper}_TOKEN_URL`] || null;
        if (!tokenUrl) {
          return this._errorResponse(400, 'MISSING_TOKEN_URL',
            `No hay endpoint de refresh para ${providerUpper} (token_url).`,
            { kind: 'config', field: 'token_url' });
        }

        const resp = await this._refreshTokens({
          token_url: tokenUrl,
          client_id: reg.client_id || undefined,
          refresh_token: reg.refresh_token,
          provider: providerUpper
        });
        if (!resp?.access_token) throw new Error('el endpoint de refresh no devolvió access_token');

        // Persistir el refresh ANTES de dar el access por bueno: si el proceso
        // muere aquí, el siguiente refresco usa el último refresh_token bueno.
        reg.refresh_token = resp.refresh_token || reg.refresh_token;
        reg.token = resp.access_token;
        reg.expires_at = this._computeExpiry(resp.expires_in);
        reg.refreshed_at = new Date().toISOString();
        reg.generation = (reg.generation || 1) + 1;
        await this._saveRotations();

        this.metrics?.increment('credential-manager.rotations.refreshed', { provider: providerUpper });
        this.logger.info('credential-manager.rotations.refreshed', {
          provider: providerUpper, generation: reg.generation
        });
        return { status: 200, data: {
          token: reg.token, expires_at: reg.expires_at,
          generation: reg.generation, refreshed: true, status: 'ACTIVE'
        } };
      } catch (err) {
        const revocado = /revok|reus|invalid_grant/i.test(err.message);
        if (revocado) {
          const reg = this._getRotation(String(provider || '').toUpperCase(), level, identifier);
          if (reg) {
            reg.revoked_at = new Date().toISOString();
            await this._saveRotations();
            this.metrics?.increment('credential-manager.rotations.revoked', { provider: String(provider).toUpperCase() });
            this.logger.warn('credential-manager.rotations.revoked', {
              provider: String(provider).toUpperCase(), reason: err.message
            });
          }
        }
        this.metrics?.increment('credential-manager.rotations.refresh.failed', { provider: String(provider || '').toUpperCase() });
        return this._errorResponse(revocado ? 409 : 502,
          revocado ? 'CREDENTIAL_REVOKED' : 'REFRESH_FAILED',
          err.message, { entity_type: 'rotation', entity_id: String(provider || '').toUpperCase() });
      }
    });
  }

  async _refreshTokens({ token_url, client_id, refresh_token, provider }) {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token });
    if (client_id) body.set('client_id', client_id);
    const resp = await this._fetchWithTimeout(token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }, 15000);
    const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
    if (!json?.access_token) throw new Error('refresh sin access_token');
    return json;
  }

  async onRotationRevokeRequest(event) {
    const d = event?.data || event || {};
    const { provider, level, identifier } = d;
    return this._atender(event, 'rotate.revoke', 'credential.rotate.revoke.response', async () => {
      const providerUpper = String(provider || '').toUpperCase();
      const reg = this._getRotation(providerUpper, level, identifier);
      if (!reg) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `No hay credencial rotativa para ${providerUpper}`,
          { entity_type: 'rotation', entity_id: providerUpper });
      }
      reg.revoked_at = new Date().toISOString();
      await this._saveRotations();
      this.metrics?.increment('credential-manager.rotations.revoked', { provider: providerUpper });
      this.logger.info('credential-manager.rotations.revoked', { provider: providerUpper, level: level || 'GLOBAL' });
      return { status: 200, data: { provider: providerUpper, revoked: true } };
    });
  }

  async onRotationStateRequest(event) {
    const d = event?.data || event || {};
    const correlation_id = event?.correlation_id || event?.correlationId;
    const out = [];
    for (const [provider, levels] of this.rotations.entries()) {
      for (const reg of levels.values()) {
        out.push(this._rotationState(reg.provider, reg.level, reg.identifier));
      }
    }
    const payload = { rotations: out, total: out.length, env_file: this.envFilePath };
    if (d.request_id) {
      return this.eventBus.publish('credential.rotate.state.response', { request_id: d.request_id, ...payload });
    }
    await this._publicarEvento('credential.rotate.state', payload, { correlation_id });
    return null;
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
  // Vendor Glovo (multi-campo, POR PROYECTO)
  // ==========================================
  //
  // Reintegrado en el core (el modulo credential-vendor-glovo planeado quedaba
  // pendiente y bloqueaba el alta de Glovo). Glovo es multi-tenant: cada
  // proyecto/tienda tiene SUS credenciales (client_id, client_secret, chain_id
  // y, opcional, webhook_token) → SOLO nivel PROJECT, sin caída a global. Cada
  // campo se persiste como GLOVO_<CAMPO>_API_KEY_PROJECT_<slug> (mismo esquema
  // que el resto), que es lo que leen el provider local.glovo y el webhook.

  /**
   * Guarda la config Glovo de UN proyecto (client_id + client_secret + chain_id
   * [+ webhook_token opcional]). Invariante: solo PROJECT con identifier=slug.
   * UI: credential/glovo.save. Payload: { level, identifier, client_id,
   * client_secret, chain_id, webhook_token? }.
   */
  async handleGlovoSave(data) {
    try {
      const { level, identifier, client_id, client_secret, chain_id, webhook_token } = data || {};

      if (level && level !== 'PROJECT') {
        return this._errorResponse(400, 'INVALID_INPUT', 'Glovo es por-proyecto: solo nivel PROJECT', { kind: 'domain', field: 'level', allowed_level: 'PROJECT' });
      }
      if (!identifier) {
        return this._errorResponse(400, 'INVALID_INPUT', 'identifier (slug del proyecto) requerido', { kind: 'domain', field: 'identifier' });
      }
      if (!client_id || !client_secret || !chain_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'client_id, client_secret y chain_id son requeridos', { kind: 'domain', field: 'client_id|client_secret|chain_id' });
      }

      const fields = {
        GLOVO_CLIENT_ID: client_id,
        GLOVO_CLIENT_SECRET: client_secret,
        GLOVO_CHAIN_ID: chain_id
      };
      if (webhook_token) fields.GLOVO_WEBHOOK_TOKEN = webhook_token;

      let existed = false;
      for (const [provider, value] of Object.entries(fields)) {
        const key = this._buildKey(provider, 'PROJECT', identifier);
        if (this.credentials.has(key)) existed = true;
        this.credentials.set(key, value);
        process.env[key] = value;
      }
      await this._saveEnvFile();
      this._updateCredentialMetrics();

      await this._publicarEvento(existed ? 'credential.updated' : 'credential.saved', {
        provider: 'GLOVO', level: 'PROJECT', identifier,
        key: this._buildKey('GLOVO_CLIENT_ID', 'PROJECT', identifier)
      });
      this.metrics?.increment('credential-manager.created', { provider: 'GLOVO', level: 'PROJECT' });
      await this._publishState();

      return { status: existed ? 200 : 201, data: { provider: 'GLOVO', level: 'PROJECT', identifier, created: !existed } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.glovo.save.failed', err, 'glovo_save');
    }
  }

  /**
   * Elimina la config Glovo de un proyecto (borra los 4 campos).
   * UI: credential/glovo.delete. Payload: { level, identifier }.
   */
  async handleGlovoDelete(data) {
    try {
      const { level, identifier } = data || {};
      if (level && level !== 'PROJECT') {
        return this._errorResponse(400, 'INVALID_INPUT', 'Glovo es por-proyecto: solo nivel PROJECT', { kind: 'domain', field: 'level', allowed_level: 'PROJECT' });
      }
      if (!identifier) {
        return this._errorResponse(400, 'INVALID_INPUT', 'identifier (slug del proyecto) requerido', { kind: 'domain', field: 'identifier' });
      }

      let deleted = 0;
      for (const provider of GLOVO_FIELDS) {
        const key = this._buildKey(provider, 'PROJECT', identifier);
        if (this.credentials.has(key)) {
          this.credentials.delete(key);
          delete process.env[key];
          deleted++;
        }
      }
      if (deleted === 0) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay config Glovo para ese proyecto', { entity_type: 'glovo_config', entity_id: identifier });
      }
      await this._saveEnvFile();
      this._updateCredentialMetrics();

      await this._publicarEvento('credential.deleted', { provider: 'GLOVO', level: 'PROJECT', identifier });
      this.metrics?.increment('credential-manager.deleted');
      await this._publishState();

      return { status: 200, data: { provider: 'GLOVO', level: 'PROJECT', identifier, deleted } };
    } catch (err) {
      return this._handleHandlerError('credential-manager.glovo.delete.failed', err, 'glovo_delete');
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
          })),
          // Las rotaciones se listan aparte: son credenciales vivas con estado,
          // no keys estáticas. Nunca con token ni refresh.
          rotations_total: state.rotations_total,
          rotations: state.rotations
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
    // Rotaciones (nunca con token ni refresh: solo estado y preview).
    const rotations = [];
    for (const [provider, levels] of this.rotations.entries()) {
      for (const reg of levels.values()) {
        rotations.push(this._rotationState(reg.provider, reg.level, reg.identifier));
      }
    }
    return {
      credentials,
      total: credentials.length,
      glovoConfigs: this._getGlovoConfigs(),
      rotations,
      rotations_total: rotations.length,
      env_file: this.envFilePath,
      rotations_file: this.rotationFilePath
    };
  }

  /**
   * Vista agrupada del vendor Glovo (multi-campo) por proyecto. Agrupa las
   * claves GLOVO_*_API_KEY_PROJECT_<slug> por identifier. NO expone secretos:
   * client_id enmascarado, secret/webhook solo como booleano, chain_id en claro
   * (no es secreto). Lo consume el frontend (response.data.glovoConfigs).
   * @private
   */
  _getGlovoConfigs() {
    const byProject = new Map();
    for (const [key, value] of this.credentials.entries()) {
      const parsed = this._parseKey(key);
      if (!parsed || parsed.level !== 'PROJECT' || !GLOVO_FIELDS.includes(parsed.provider)) continue;
      const id = parsed.identifier;
      if (!byProject.has(id)) byProject.set(id, {});
      byProject.get(id)[parsed.provider] = value;
    }
    const configs = [];
    for (const [identifier, f] of byProject.entries()) {
      const clientId = f.GLOVO_CLIENT_ID || '';
      configs.push({
        level: 'PROJECT',
        identifier,
        clientIdPreview: clientId ? this._maskApiKey(clientId) : '',
        hasSecret: !!f.GLOVO_CLIENT_SECRET,
        chainId: f.GLOVO_CHAIN_ID || '',
        hasWebhookToken: !!f.GLOVO_WEBHOOK_TOKEN,
        configured: !!(clientId && f.GLOVO_CLIENT_SECRET && f.GLOVO_CHAIN_ID)
      });
    }
    return configs;
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
