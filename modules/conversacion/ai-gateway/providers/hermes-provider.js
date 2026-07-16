const BaseProvider = require('./base-provider');
const hermesSwitch = require('./hermes-switch');

/**
 * Hermes Provider — el agente Hermes (NousResearch/hermes-agent) como trabajador de Enki.
 *
 * NO es un LLM crudo: al otro lado hay un AGENTE AUTÓNOMO con su propio arsenal
 * (browser, ejecución de código, subagentes, skills, memoria persistente). Enki
 * entrega el OBJETIVO; Hermes decide el CÓMO y devuelve el trabajo hecho.
 *
 * Superficie: api_server de Hermes, OpenAI-compatible, local (http://127.0.0.1:8642).
 * Memoria entre llamadas: cabecera X-Hermes-Session-Key — por defecto scoped al
 * proyecto ('enki:<project_id>'), así cada proyecto tiene SU Hermes que recuerda.
 *
 * Gobierno (la bomba, gobernada):
 *   - interruptor 'hermes-agente' (panel central, OFF por defecto) — OFF = Hermes
 *     no existe para Enki, ni por selección explícita ni por auto-fallback.
 *   - credencial obligatoria (API_SERVER_KEY de Hermes): credential-manager
 *     provider 'hermes', fallback env HERMES_API_KEY.
 *   - AUDIT: cada delegación emite hermes.invocado (vía hermes-switch) → propiocepción.
 *
 * Límite honesto: makeRequest corta a 90s. Un encargo largo de agente puede
 * excederlo — para eso está la capa async (POST /v1/runs + run_id), pieza futura.
 * Priority 90 en config: nunca gana el auto-fallback a los LLM de página.
 */
class HermesProvider extends BaseProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'hermes';
  }

  /**
   * Initialize: resuelve la key y sondea el api_server local (best-effort).
   */
  async configure() {
    await this.refreshApiKey();
    if (!this.apiKey) {
      this.logger.info('hermes.sin-credencial', {
        message: 'Hermes registrado sin key (credential-manager provider \'hermes\' o env HERMES_API_KEY)'
      });
      return;
    }
    try {
      await this.makeRequest('GET', '/v1/models', null, this._authHeaders());
      this.logger.info('hermes.initialized', { available: true, api_base: this._apiBase() });
    } catch (error) {
      this.logger.warn('hermes.not-running', {
        message: `Hermes api_server no responde en ${this._apiBase()} (¿hermes gateway activo?)`,
        error: error.message
      });
    }
  }

  refreshApiKeyFromEnv() {
    this.apiKey = process.env.HERMES_API_KEY || null;
  }

  /**
   * Disponible = interruptor 'hermes-agente' ON + enabled + key.
   * El interruptor manda: OFF corta también la selección explícita.
   */
  async isAvailable() {
    if (!hermesSwitch.isOn()) return false;
    return super.isAvailable();
  }

  _authHeaders() {
    return { 'Authorization': `Bearer ${this.apiKey}` };
  }

  /**
   * La memoria de Hermes viaja en esta cabecera. Prioridad:
   * options.hermes_session_key (el caller manda) → proyecto actual → config → sistema.
   */
  _sessionKey(options = {}) {
    if (options.hermes_session_key) return String(options.hermes_session_key);
    if (this.currentProjectId) return `enki:${this.currentProjectId}`;
    return this.config.session_key || 'enki:sistema';
  }

  _usageFrom(response, messagesText, content) {
    const u = response && response.usage;
    const input = u?.prompt_tokens ?? this.countTokens(messagesText);
    const output = u?.completion_tokens ?? this.countTokens(content);
    return { input_tokens: input, output_tokens: output, total_tokens: u?.total_tokens ?? (input + output) };
  }

  /**
   * Chat completion — delegación síncrona con memoria.
   */
  async chatCompletion(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error("Hermes provider no disponible (interruptor 'hermes-agente' OFF, sin key, o api_server caído)");
    }

    const model = options.model || this.config.default_model;
    const sessionKey = this._sessionKey(options);
    const messagesText = messages.map(m => m.content).join(' ');

    const requestData = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 4000,
      stream: false
    };

    const headers = {
      ...this._authHeaders(),
      'X-Hermes-Session-Key': sessionKey
    };

    const t0 = Date.now();
    try {
      const response = await this.withRetry(
        () => this.makeRequest('POST', '/v1/chat/completions', requestData, headers),
        options.retryConfig || {}
      );

      const content = response.choices?.[0]?.message?.content || '';
      const usage = this._usageFrom(response, messagesText, content);
      hermesSwitch.audit({ ok: true, duracion_ms: Date.now() - t0, model, session_key: sessionKey, modo: 'chat' });

      return {
        provider: this.name,
        model,
        content,
        usage,
        cost: 0, // local — el coste real vive en el provider LLM que Hermes tenga configurado
        finish_reason: response.choices?.[0]?.finish_reason || 'stop'
      };
    } catch (error) {
      hermesSwitch.audit({ ok: false, duracion_ms: Date.now() - t0, model, session_key: sessionKey, modo: 'chat', error: error.message });
      throw error;
    }
  }

  /**
   * Chat completion (streaming SSE, formato OpenAI).
   */
  async chatCompletionStream(messages, options = {}) {
    if (!await this.isAvailable()) {
      throw new Error("Hermes provider no disponible (interruptor 'hermes-agente' OFF, sin key, o api_server caído)");
    }

    const model = options.model || this.config.default_model;
    const sessionKey = this._sessionKey(options);
    const messagesText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.countTokens(messagesText);

    const requestData = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 4000,
      stream: true
    };

    const headers = {
      ...this._authHeaders(),
      'X-Hermes-Session-Key': sessionKey
    };

    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      let buffer = '';
      let fullContent = '';

      this.makeStreamRequest(
        'POST',
        '/v1/chat/completions',
        requestData,
        headers,
        (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  fullContent += delta;
                  if (options.onChunk) options.onChunk(delta);
                }
              } catch (_) {
                // JSON parcial entre chunks — se completa en la siguiente pasada
              }
            }
          }
        },
        () => {
          const outputTokens = this.countTokens(fullContent);
          hermesSwitch.audit({ ok: true, duracion_ms: Date.now() - t0, model, session_key: sessionKey, modo: 'stream' });
          resolve({
            provider: this.name,
            model,
            content: fullContent,
            usage: {
              input_tokens: estimatedTokens,
              output_tokens: outputTokens,
              total_tokens: estimatedTokens + outputTokens
            },
            cost: 0,
            finish_reason: 'stop'
          });
        },
        (error) => {
          hermesSwitch.audit({ ok: false, duracion_ms: Date.now() - t0, model, session_key: sessionKey, modo: 'stream', error: error.message });
          reject(error);
        }
      );
    });
  }
}

module.exports = HermesProvider;
