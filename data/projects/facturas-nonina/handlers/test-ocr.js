/**
 * Handler Proyecto: /gocr
 *
 * Test OCR con Google Vision.
 * Coge la ultima imagen preparada (o del inbox), la envia a Google Vision
 * y devuelve el texto extraido.
 *
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'test-ocr',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'gocr';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    // 1. Buscar imagen: primero en preprocesadas, si no en inbox
    const preproDir = path.join(process.cwd(), 'data/projects', projectId, 'storage', 'preprocesadas');
    const inboxDir = cfg.storage?.inbox?.telegram || `data/bots/${botName}/received`;
    const absInbox = path.isAbsolute(inboxDir) ? inboxDir : path.join(process.cwd(), inboxDir);

    const extensiones = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];

    let archivo = null;
    let origen = '';

    // Buscar la mas reciente en preprocesadas
    if (fs.existsSync(preproDir)) {
      const archivos = fs.readdirSync(preproDir)
        .filter(f => extensiones.includes(path.extname(f).toLowerCase()))
        .map(f => ({ name: f, path: path.join(preproDir, f), mtime: fs.statSync(path.join(preproDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

      if (archivos.length > 0) {
        archivo = archivos[0];
        origen = 'preprocesada';
      }
    }

    // Si no hay preprocesada, buscar en inbox
    if (!archivo && fs.existsSync(absInbox)) {
      const archivos = fs.readdirSync(absInbox)
        .filter(f => extensiones.includes(path.extname(f).toLowerCase()))
        .map(f => ({ name: f, path: path.join(absInbox, f), mtime: fs.statSync(path.join(absInbox, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

      if (archivos.length > 0) {
        archivo = archivos[0];
        origen = 'inbox';
      }
    }

    if (!archivo) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: 'No hay imagenes. Envia una foto y usa /gosharp primero.'
      });
      return;
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `OCR Google Vision (${origen}): ${archivo.name}...`
    });

    // 2. Llamar a Google Vision (acepta ruta de archivo directamente)
    try {
      const result = await services.call('local.google-vision', 'extract', {
        image: archivo.path,
        hint: 'DOCUMENT_TEXT_DETECTION',
        languageHints: ['es']
      }, { timeout: 60000 });

      const d = result.data || result;
      const texto = d.text || 'Sin texto extraido';

      // Truncar para Telegram (max 4096 chars)
      const textoTelegram = texto.length > 3000
        ? texto.substring(0, 3000) + '\n\n... (truncado)'
        : texto;

      const mensaje = [
        'OCR Google Vision OK',
        `Imagen: ${archivo.name} (${origen})`,
        `Confianza: ${d.confidence || '?'}%`,
        `Bloques: ${d.blocks || '?'}`,
        `Idioma: ${d.locale || '?'}`,
        '',
        textoTelegram
      ].join('\n');

      emit('telegram.send_message.request', { botName, chatId, text: mensaje });

      logger.info('test-ocr.ok', {
        file: archivo.name, origen,
        confidence: d.confidence,
        blocks: d.blocks,
        locale: d.locale,
        textLength: texto.length
      });

    } catch (error) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Error OCR: ${error.message}`
      });
      logger.error('test-ocr.error', { error: error.message });
    }
  }
};
