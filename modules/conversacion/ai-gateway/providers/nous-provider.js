const fs = require('fs');
const path = require('path');
const BaseProvider = require('./base-provider');

/**
 * Nous Portal Provider
 *
 * El portal de Nous expone un endpoint OpenAI-compat en
 * https://inference-api.nousresearch.com/v1 y lo autentica con el token OAuth
 * de la cuenta del dueño (scope `inference:invoke`).
 *
 * LA FORMA DE LA CREDENCIAL — y por qué no es una API key más:
 *
 *   Nous NO da una API key duradera. Da un access_token de 1 hora y un
 *   refresh_token rotatorio. Guardar el access_token en un `.env` lo mata en
 *   una hora; guardar el refresh_token lo mata en el primer uso (rota).
 *   Este provider por eso NO depende de credential-manager: lee y RENUEVA el
 *   store compartido que Hermes ya mantiene (el mismo archivo que escribe
 *   `hermes auth add nous` y cada refresh de runtime). Con eso:
 *
 *     · el token nunca queda congelado;
 *     · Enki no pide ni guarda una clave nueva;
 *     · si Hermes se desloguea de Nous, el provider deja de estar disponible
 *       con un `NO_TOKEN` honesto, no con un 401 sorpresa.
 *
 * Modelos: SOLO los `:free` del catálogo del Portal. La cuenta del dueño no
 * tiene saldo, y un modelo de pago da 404 "requires available credits". La
 * lista se CAPTURA en vivo de /v1/models y el catálogo vivo manda (mismo
 * criterio que el provider ollama): un id que el Portal retira deja de
 * estar disponible y no se inventa.
 *
 * Rate limit: el free tier responde 429. `isAvailable()` falla en falso si el
 * último 429 es reciente, para que el fallback del gateway no encadene
 * reintentos contra un provider que está diciendo "espera".
 */
const DEFAULT_BASE = 'https://inference-api.nousresearch.com/v1';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;   // renueva 5 min antes de expirar
const RATE_LIMIT_COOLDOWN_MS = 30 * 1000;  // 429 → no está disponible 30 s
const SHARED_STORE_CANDIDATES = [
  // El store compartido de Hermes (todos los perfiles), y el del perfil propio.
  '/home/admin/.hermes/shared/nous_auth.json',
  (process.env.HERMES_HOME ? path.join(process.env.HERMES_HOME, 'shared', 'nous_auth.json') : null),
  (process.env.HOME ? path.join(process.env.HOME, '.hermes', 'shared', 'nous_auth.json') : null)
].filter(Boolean);

class NousProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'nous';
    // La credencial NO se resuelve por credential-manager: es OAuth vivo, no
    // una API key. El resolver se ignora a propósito (documentado en refreshApiKey).
    // CON BARRA FINAL. `new URL('chat/completions', 'https://…/v1')` descarta el
    // /v1 (base sin barra = directorio); con la barra se resuelve como
    // https://…/v1/chat/completions, que es donde vive el endpoint del Portal.
    // Es el mismo error 404 que tuvo deepseek-anthropic, y el mismo fix.
    this.apiBase = (config.api_base || DEFAULT_BASE).replace(/\/+$/, '') + '/';
    this.storePath = config.auth_store || SHARED_STORE_CANDIDATES.find((p) => fs.existsSync(p)) || SHARED_STORE_CANDIDATES[0];
    this.token = null;
    this.expiresAt = 0;
    this.rateLimitedUntil = 0;
    this.catalogoVivo = [];
  }

  async configure() {
    await this.refreshApiKey();
    if (!this.token) {
      this.logger?.warn?.('nous.no-token', {
        message: 'No hay token de Nous Portal (el store compartido de Hermes no existe o está vacío)',
        store: this.storePath
      });
      return;
    }
    // Catálogo VIVO: la oferta del Portal cambia y los `:free` se retiran.
    // OJO al path: RELATIVO. `new URL('/models', 'https://…/v1')` DESCARTA el
    // segmento /v1 del base (mismo error 404 que tuvo deepseek-anthropic) y la
    // petición caería a /models, que no existe.
    try {
      const resp = await this.makeRequest('GET', 'models', null, this._authHeaders());
      const vivos = (resp && Array.isArray(resp.data) ? resp.data : [])
        .map((m) => (m && (m.id || m.name)) || null)
        .filter((m) => typeof m === 'string' && m.endsWith(':free'));
      if (vivos.length) this.catalogoVivo = vivos;
    } catch (err) {
      this.logger?.debug?.('nous.catalogo.failed', { error: err.message });
    }
    this.logger?.info?.('nous.initialized', {
      available: await this.isAvailable(),
      store: this.storePath,
      gratis_vivos: this.catalogoVivo.length || '(config declarada)'
    });
  }

  // El token, leído y RENOVADO del store compartido. Sin red si no toca renovar.
  async refreshApiKey() {
    const token = this._leerToken();
    if (!token) { this.token = null; return; }
    if (this.token && token === this.token && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) return;
    this.token = token;
    this.expiresAt = this._leerExpiracion();
    // Si el store dice que ya expiró, NO se refresca aquí: el refresh del Portal
    // ROTA el refresh_token, y dos refrescadores peleándose por el token hacen
    // que el Portal revoque la cadena entera (mismo fallo que documenta Hermes
    // como `refresh_token_reused`). Hay UN refrescador: Hermes. Si el token está
    // vencido, este provider queda simplemente no disponible y lo dice.
    if (this.expiresAt && Date.now() >= this.expiresAt - REFRESH_MARGIN_MS) {
      this.logger?.warn?.('nous.token-expirado', {
        store: this.storePath,
        mensaje: 'el token de Nous expiró y Enki no refresca (lo hace Hermes, para no pelearse por el token rotatorio)'
      });
      this.token = null;
    }
  }

  // Credenciales del store compartido: access_token + refresh_token + expires_at.
  _leerStore() {
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      return d;
    } catch (_) {
      return null;
    }
  }

  _leerToken() {
    const d = this._leerStore();
    const t = d && d.access_token;
    return typeof t === 'string' && t.trim() ? t.trim() : null;
  }

  _leerExpiracion() {
    const d = this._leerStore();
    const v = d && d.expires_at;
    const t = typeof v === 'string' ? Date.parse(v) : Number(v);
    return Number.isFinite(t) ? t : 0;
  }

  // NO HAY refresh en este provider (ver refreshApiKey). El refresh del Portal
  // rota el refresh_token; el UNICO refrescador es Hermes, y este metodo queda
  // como documentacion ejecutable de por que no se llama. Si algún dia Enki
  // tuviera su propia cuenta Nous, aqui iria su refresh — nunca el de Hermes.
  async _refresh() {
    // A propósito sin implementar: el refresh rota el refresh_token y Hermes es
    // el único refrescador. Ver refreshApiKey().
    return false;
  }

  _authHeaders() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  // Disponible = token + no rate-limited hace poco + catálogo no vacío (si se capturó).
  async isAvailable() {
    if (Date.now() < this.rateLimitedUntil) return false;
    await this.refreshApiKey();
    if (!this.token) return false;
    if (this.catalogoVivo.length > 0) {
      return this.catalogoVivo.includes(this._modeloElegido());
    }
    return true;
  }

  _modeloElegido(options = {}) {
    const m = options.model || this.config.default_model;
    const gratis = this.catalogoVivo.length ? this.catalogoVivo : (this.config.models || []);
    if (gratis.length && !gratis.includes(m)) return null;
    return m || null;
  }

  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Nous provider not available (sin token de Nous Portal, catálogo vacío o 429 reciente)');
    }
    const model = this._modeloElegido(options);
    if (!model) {
      throw new Error(`Nous provider: el modelo '${options.model || this.config.default_model}' no está entre los gratis del Portal`);
    }
    const messagesText = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
    const estimatedTokens = this.countTokens(messagesText);
    const requestData = {
      model,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
      top_p: options.top_p || 1,
      stream: false
    };
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      requestData.tools = options.tools;
      requestData.tool_choice = options.tool_choice || 'auto';
    }
    let response;
    try {
      response = await this.makeRequest('POST', 'chat/completions', requestData, this._authHeaders());
    } catch (err) {
      if (/HTTP 429/.test(err.message)) this.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      throw err;
    }
    const message = response.choices?.[0]?.message || {};
    const content = message.content || '';
    const toolCalls = message.tool_calls || null;
    const inputTokens = response.usage?.prompt_tokens || estimatedTokens;
    const outputTokens = response.usage?.completion_tokens || this.countTokens(content);
    return {
      provider: this.name,
      model,
      content,
      tool_calls: toolCalls,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
      cost: 0,
      finish_reason: response.choices?.[0]?.finish_reason || 'stop'
    };
  }

  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error('Nous provider not available (sin token de Nous Portal o 429 reciente)');
    }
    const model = this._modeloElegido(options);
    if (!model) throw new Error(`Nous provider: modelo no gratis (${options.model || this.config.default_model})`);
    const messagesText = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
    const estimatedTokens = this.countTokens(messagesText);
    const requestData = {
      model,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
      top_p: options.top_p || 1,
      stream: true
    };
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      requestData.tools = options.tools;
      requestData.tool_choice = options.tool_choice || 'auto';
    }
    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';
      this.makeStreamRequest('POST', 'chat/completions', requestData, this._authHeaders(),
        (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                if (options.onChunk) options.onChunk(delta);
              }
            } catch (_) { /* JSON incompleto de un chunk partido: se ignora */ }
          }
        },
        () => resolve({
          provider: this.name, model, content: fullContent,
          usage: { input_tokens: estimatedTokens, output_tokens: this.countTokens(fullContent), total_tokens: estimatedTokens + this.countTokens(fullContent) },
          cost: 0, finish_reason: 'stop'
        }),
        (error) => {
          if (/HTTP 429/.test(error.message)) this.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          reject(error);
        });
    });
  }

  // Catálogo para el selector: lo vivo capturado si hay, si no la lista declarada.
  catalogo() {
    return this.catalogoVivo.length ? this.catalogoVivo.slice() : (this.config.models || []).slice();
  }
}

module.exports = NousProvider;
module.exports.SHARED_STORE_CANDIDATES = SHARED_STORE_CANDIDATES;
