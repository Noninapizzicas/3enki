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
}

module.exports = DeepSeekAnthropicProvider;
