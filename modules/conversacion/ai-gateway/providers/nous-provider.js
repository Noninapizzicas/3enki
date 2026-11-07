const OpenAIProvider = require('./openai-provider');

/**
 * Nous Portal Provider — la cuenta del dueño, vía credential-manager.
 *
 * Por qué este provider y no "leer el store de Hermes": la cuenta Nous NO es una
 * key estática. Da un access_token de 1 h y un refresh_token que ROTA en cada
 * uso; el Portal revoca la cadena entera si dos refrescadores pisan el mismo
 * token. Por eso la credencial la guarda y la refresca credential-manager
 * (credential.rotate.*), y este provider SOLO la pide:
 *
 *   credential.rotate.resolve.request { provider:'NOUS', level:'GLOBAL' }
 *     → { token, expires_at, generation, refreshed }
 *
 * El provider nunca ve el refresh_token ni lo persiste: solo recibe el access
 * vigente. Si la rotación está revocada o vencida sin refresh, credential-manager
 * devuelve error y el provider queda no disponible — no reintenta a ciegas.
 *
 * Endpoint: OpenAI-compat en inference-api.nousresearch.com/v1.
 *   - api_base CON BARRA FINAL: `new URL('chat/completions', 'https://…/v1')`
 *     DESCARTA el /v1 (base sin barra = directorio) y caería en /chat/completions.
 *     Es el mismo error 404 que tuvo deepseek-anthropic; el path va relativo.
 *
 * Modelos: SOLO los `:free` del catálogo VIVO. La cuenta no tiene saldo y un
 * modelo de pago devuelve 404 "requires available credits". El catálogo se
 * captura de /v1/models en configure() y esa es la fuente de verdad; la lista
 * declarada en config es solo respaldo.
 */
const DEFAULT_BASE = 'https://inference-api.nousresearch.com/v1';
const RATE_LIMIT_MS = 30 * 1000;

class NousProvider extends OpenAIProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'nous';
    this.apiBase = (config.api_base || DEFAULT_BASE).replace(/\/+$/, '') + '/';
    this.rateLimitedUntil = 0;
    this._catalogo = null;
  }

  /** Credencial: SIEMPRE la rotación de credential-manager. Nunca el entorno. */
  async refreshApiKey() {
    if (!this.credentialResolver) {
      this.logger?.warn?.('nous.no-credential-resolver', {
        message: 'Nous requiere credential-manager (credencial rotativa); sin resolver no hay token'
      });
      this.apiKey = null;
      return;
    }
    try {
      const token = await this.credentialResolver('NOUS', {
        projectId: this.currentProjectId,
        clientId: this.currentClientId
      });
      this.apiKey = token || null;
      if (!this.apiKey) this.logger?.warn?.('nous.no-token', { message: 'credential-manager devolvió un token vacío' });
    } catch (err) {
      this.apiKey = null;
      this.logger?.warn?.('nous.token-error', { error: err.message });
    }
  }

  /** El entorno NO es fuente: una key congelada no sirve para un token que rota. */
  refreshApiKeyFromEnv() {
    this.apiKey = null;
  }

  /**
   * makeRequest/makeStreamRequest de base-provider resuelven la URL con
   * `_apiBase()` (que devuelve `config.api_base` tal cual). Este provider lo
   * sobrescribe con BARRA FINAL: sin ella, `new URL('chat/completions',
   * 'https://…/v1')` descarta el /v1 y la petición cae en
   * https://…/chat/completions → 404 (el mismo fallo de deepseek-anthropic).
   * La ruta relativa + el base con barra es lo que da /v1/chat/completions.
   */
  _apiBase() {
    return this.apiBase;
  }

  async configure() {
    await this.refreshApiKey();
    await this._capturarCatalogo();
    this.logger?.info?.('nous.initialized', {
      available: await this.isAvailable(),
      catalogo: this._catalogo?.length || 0,
      modelos: this.config.models
    });
  }

  /** Catálogo VIVO del Portal: los `:free` que hoy existen. Best-effort. */
  async _capturarCatalogo() {
    try {
      const resp = await this.makeRequest('GET', 'models', null, this._authHeaders());
      const ids = (resp?.data || []).map((m) => m?.id).filter(Boolean);
      const gratis = ids.filter((id) => /:free$/i.test(id));
      if (gratis.length > 0) this._catalogo = [...new Set([...gratis, ...this._gratisDeclarados()])];
      else this._catalogo = this._gratisDeclarados();
    } catch (err) {
      this._catalogo = this._gratisDeclarados();
      this.logger?.debug?.('nous.catalogo.failed', { error: err.message });
    }
  }

  _gratisDeclarados() {
    return (this.config.models || []).filter((id) => /:free$/i.test(id));
  }

  /** Los modelos que este provider puede servir: solo `:free`. */
  catalogo() {
    return this._catalogo || this._gratisDeclarados();
  }

  /** Filtra un modelo pedido: si no es `:free`, NO se sirve. */
  _modeloValido(model) {
    const gratis = this.catalogo();
    if (gratis.includes(model)) return model;
    if (gratis.includes(this.config.default_model)) return this.config.default_model;
    return gratis[0] || null;
  }

  _authHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      // Cloudflare del Portal bloquea requests sin User-Agent reconocible
      // (403 "Sorry, you have been blocked"). Node http no manda UA por defecto.
      'User-Agent': 'enki-ai-gateway/2.38.0 (+https://enki-ai.online)'
    };
  }

  async isAvailable() {
    if (this.rateLimitedUntil && Date.now() < this.rateLimitedUntil) return false;
    if (!this.apiKey) await this.refreshApiKey();
    return this.apiKey !== null && this.config.enabled !== false;
  }

  async chatCompletion(messages, options = {}) {
    if (!(await this.isAvailable())) {
      throw new Error('Nous provider not available (sin credencial rotativa o 429 reciente)');
    }
    const model = this._modeloValido(options.model || this.config.default_model);
    if (!model) throw new Error('Nous: no hay modelos :free disponibles en el catálogo');
    if (options.model && model !== options.model) {
      this.logger?.warn?.('nous.modelo.no-gratis', { pedido: options.model, sirviendo: model });
    }

    const requestData = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 2000,
      top_p: options.top_p ?? 1,
      stream: false
    };
    if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
      requestData.tools = options.tools;
      requestData.tool_choice = options.tool_choice || 'auto';
    }

    let response;
    try {
      response = await this.withRetry(
        () => this.makeRequest('POST', 'chat/completions', requestData, this._authHeaders()),
        options.retryConfig || {}
      );
    } catch (err) {
      if (/HTTP 429/.test(err.message)) this._rateLimited();
      throw err;
    }

    const message = response.choices?.[0]?.message || {};
    const content = message.content || '';
    const toolCalls = message.tool_calls || null;
    const inputTokens = response.usage?.prompt_tokens || this.countTokens(messages.map((m) => m.content || '').join(' '));
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
    if (!(await this.isAvailable())) {
      throw new Error('Nous provider not available (sin credencial rotativa o 429 reciente)');
    }
    const model = this._modeloValido(options.model || this.config.default_model);
    if (!model) throw new Error('Nous: no hay modelos :free disponibles en el catálogo');

    const requestData = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 2000,
      top_p: options.top_p ?? 1,
      stream: true
    };

    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';
      this.makeStreamRequest(
        'POST', 'chat/completions', requestData, this._authHeaders(),
        (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') { resolve({ provider: this.name, model, content: fullContent, done: true }); return; }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              fullContent += delta;
            } catch { /* chunk parcial */ }
          }
        },
        () => resolve({ provider: this.name, model, content: fullContent, done: true }),
        (err) => { if (/HTTP 429/.test(err.message)) this._rateLimited(); reject(err); }
      );
    });
  }

  _rateLimited() {
    this.rateLimitedUntil = Date.now() + RATE_LIMIT_MS;
    this.logger?.warn?.('nous.rate-limited', { hasta: new Date(this.rateLimitedUntil).toISOString() });
  }
}

module.exports = NousProvider;
