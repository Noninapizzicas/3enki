const AnthropicProvider = require('./anthropic-provider');

/**
 * DeepSeek (Anthropic-compatible) Provider — "mismo idioma".
 *
 * DeepSeek expone un endpoint compatible con Anthropic en
 * https://api.deepseek.com/anthropic. Este provider hace que deepseek hable el
 * protocolo NATIVO de Anthropic (POST /v1/messages, bloques `tool_use`
 * estructurados) — el MISMO idioma que el provider `anthropic` (Claude) — en vez
 * del dialecto OpenAI-compat (deepseek-provider.js) que exige traducción de
 * nombres (punto→guion_bajo) y correlación por tool_call_id, y que históricamente
 * emitía tool-calls como texto (lo que aparcó los agentes).
 *
 * Reusa TODA la implementación de AnthropicProvider (translateTools,
 * convertMessages, parsing de bloques tool_use, prompt caching). No sobreescribe
 * NADA del protocolo: solo cambian endpoint, credencial y nombres de modelo.
 *
 * Compatibilidad del endpoint /anthropic (verificada contra la doc de DeepSeek):
 *   - x-api-key            : soportado  -> reusa el header de AnthropicProvider tal cual.
 *   - anthropic-version    : ignorado   -> mandarlo es inocuo.
 *   - cache_control        : ignorado   -> la inyección de caching de AnthropicProvider
 *                                          NO rompe (pasa de largo, sin 400).
 *   - tool_use / tool_result / tool_choice(auto|any|tool): soportado (el idioma nativo).
 *   - modelos              : deepseek-v4-pro / deepseek-v4-flash directos.
 *
 * Credencial: reutiliza la de 'deepseek' (misma API key), NO una credencial nueva
 * 'deepseek-anthropic'. Por eso refreshApiKey resuelve bajo this.credentialName.
 *
 * NOTA económica: este endpoint ignora cache_control. La ventaja de KV-cache
 * automático (-98% input en hits) del path OpenAI-compat puede NO aplicar aquí —
 * a medir antes de decidir si reemplaza al OpenAI-compat o conviven.
 */
class DeepSeekAnthropicProvider extends AnthropicProvider {
  constructor(config, logger, credentialResolver) {
    super(config, logger, credentialResolver);
    this.name = 'deepseek-anthropic';
    // Resuelve la credencial de 'deepseek' (misma key), no una bajo this.name.
    this.credentialName = 'deepseek';
  }

  /**
   * Resuelve la API key bajo `credentialName` ('deepseek'), no bajo this.name.
   * Si el resolver no da key, cae al entorno (DEEPSEEK_API_KEY).
   */
  async refreshApiKey() {
    if (this.credentialResolver) {
      try {
        const key = await this.credentialResolver(this.credentialName, {
          projectId: this.currentProjectId,
          clientId: this.currentClientId
        });
        if (key) { this.apiKey = key; return; }
      } catch (error) {
        this.logger.debug(`${this.name}.credential.resolver.failed`, {
          error: error.message,
          fallback: 'environment'
        });
      }
    }
    this.refreshApiKeyFromEnv();
  }

  refreshApiKeyFromEnv() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY_GLOBAL || null;
  }

  /**
   * El endpoint compatible vive bajo /anthropic (api.deepseek.com/anthropic/v1/messages).
   * AnthropicProvider llama a makeRequest/makeStreamRequest con path ABSOLUTO '/v1/messages';
   * `new URL(path, api_base)` DESCARTA el segmento de path del base cuando el path es absoluto,
   * así que un api_base con '/anthropic' perdería ese prefijo y la petición caería en
   * api.deepseek.com/v1/messages -> 404. Por eso api_base NO lleva '/anthropic' (es solo el host)
   * y lo anteponemos aquí al path. Verificado en vivo: sin esto, 404; con esto, tool_use OK.
   */
  _anthropicPath(path) {
    return (typeof path === 'string' && path.startsWith('/anthropic')) ? path : '/anthropic' + path;
  }

  async makeRequest(method, path, data = null, headers = {}) {
    return super.makeRequest(method, this._anthropicPath(path), data, headers);
  }

  makeStreamRequest(method, path, data = null, headers = {}, onChunk, onEnd, onError) {
    return super.makeStreamRequest(method, this._anthropicPath(path), data, headers, onChunk, onEnd, onError);
  }

  /**
   * Coerce de modelo: una conversación GUARDADA con un nombre que el endpoint /anthropic
   * NO acepta (legacy deepseek-chat/coder/reasoner del retirado provider OpenAI-compat, o
   * cualquier modelo de otro provider) cae al default_model en vez de fallar. Se respetan
   * los modelos propios (config.models: v4-flash/v4-pro) y los alias claude-* (que el
   * endpoint mapea a v4-pro/v4-flash). Evita romper conversaciones tras retirar el OpenAI-compat.
   */
  _coerceModel(options = {}) {
    const m = options.model;
    if (m && !this.config.models.includes(m) && !/^claude-/.test(m)) {
      return { ...options, model: this.config.default_model };
    }
    return options;
  }

  async chatCompletion(messages, options = {}) {
    return super.chatCompletion(messages, this._coerceModel(options));
  }

  async chatCompletionStream(messages, options = {}) {
    return super.chatCompletionStream(messages, this._coerceModel(options));
  }
}

module.exports = DeepSeekAnthropicProvider;
