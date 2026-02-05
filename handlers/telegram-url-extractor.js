/**
 * telegram-url-extractor.js
 *
 * Cuando alguien envía una URL por Telegram, automáticamente:
 * 1. Extrae metadata (título, descripción, OG tags)
 * 2. Extrae texto limpio del contenido
 * 3. Responde con un resumen estructurado
 *
 * Usa: local.url-data (extract, metadata)
 * Trigger: telegram.text.received
 *
 * @version 1.0.0
 * @created 2026-02-05
 * @generated-by local.handler-generator
 */

// Regex para detectar URLs en texto
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

module.exports = {
  name: 'telegram-url-extractor',
  description: 'Extrae datos de URLs enviadas por Telegram y responde con resumen',
  trigger: 'telegram.text.received',
  enabled: true,

  /**
   * Solo procesar si el mensaje contiene una URL
   */
  filter(event) {
    const data = event.data || event;
    const text = data.text || '';
    return URL_REGEX.test(text);
  },

  /**
   * @param {Object} event - Evento telegram.text.received
   * @param {Object} context - Contexto de ejecución
   */
  async handle(event, { services, logger, emit, config }) {
    const data = event.data || event;
    const text = data.text || '';
    const chatId = data.chatId || data.chat_id;
    const botName = config?.telegram?.botName || data.botName;

    // Extraer todas las URLs del mensaje
    const urls = text.match(URL_REGEX) || [];
    if (urls.length === 0) return;

    logger.info('telegram-url-extractor.detected', {
      chatId,
      urls: urls.length
    });

    for (const url of urls.slice(0, 3)) { // Máximo 3 URLs por mensaje
      try {
        // 1. Extraer metadata
        const metaResult = await services.call('local.url-data', 'metadata', { url });

        if (!metaResult.success) {
          logger.warn('telegram-url-extractor.metadata_failed', { url, error: metaResult.error });
          emit('telegram.send_message.request', {
            botName,
            chatId,
            text: `No pude acceder a ${url}\n${metaResult.error}`
          });
          continue;
        }

        const meta = metaResult.data;

        // 2. Extraer texto (resumen corto)
        const extractResult = await services.call('local.url-data', 'extract', {
          url,
          format: 'text'
        });

        // 3. Construir resumen
        let resumen = '';

        // Título
        if (meta.title) {
          resumen += `*${escapeMd(meta.title)}*\n`;
        }

        // Descripción
        if (meta.description) {
          resumen += `${escapeMd(meta.description)}\n`;
        }

        // OG info extra
        if (meta.og && meta.og.site_name) {
          resumen += `_${escapeMd(meta.og.site_name)}_\n`;
        }

        // Idioma
        if (meta.language) {
          resumen += `Idioma: ${meta.language}\n`;
        }

        // Estructura
        resumen += `\nLinks: ${meta.links?.internal || 0} internos, ${meta.links?.external || 0} externos\n`;
        resumen += `Imágenes: ${meta.images || 0}\n`;

        // Headings (primeros 5)
        if (meta.headings && meta.headings.length > 0) {
          resumen += `\n*Estructura:*\n`;
          for (const h of meta.headings.slice(0, 5)) {
            const indent = '  '.repeat(h.level - 1);
            resumen += `${indent}${escapeMd(h.text)}\n`;
          }
        }

        // Preview del contenido (primeros 300 chars)
        if (extractResult.success && extractResult.data.content) {
          const preview = extractResult.data.content.substring(0, 300).trim();
          if (preview) {
            resumen += `\n*Preview:*\n${escapeMd(preview)}...`;
          }
        }

        // URL original
        resumen += `\n\n${url}`;

        // 4. Enviar por Telegram
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: resumen,
          parse_mode: 'Markdown'
        });

        logger.info('telegram-url-extractor.sent', {
          url,
          chatId,
          title: meta.title
        });

      } catch (error) {
        logger.error('telegram-url-extractor.error', {
          url,
          error: error.message
        });
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: `Error procesando ${url}: ${error.message}`
        });
      }
    }
  }
};

/**
 * Escapa caracteres especiales de Markdown para Telegram
 */
function escapeMd(text) {
  if (!text) return '';
  return text
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
    .substring(0, 500);
}
