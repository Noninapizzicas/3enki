/**
 * Handler Proyecto: /gocr
 *
 * Test OCR con DeepSeek Vision.
 * Coge la ultima imagen preparada (o del inbox), la envia a DeepSeek
 * y devuelve el texto extraido.
 *
 * @version 1.0.0
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
      text: `OCR DeepSeek (${origen}): ${archivo.name}...`
    });

    // 2. Leer imagen y convertir a base64
    try {
      const imageBuffer = fs.readFileSync(archivo.path);
      const base64Image = imageBuffer.toString('base64');
      const ext = path.extname(archivo.name).toLowerCase();
      const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      const imageType = mimeTypes[ext] || 'image/jpeg';

      // 3. Llamar a DeepSeek via ai-gateway
      const result = await services.call('ai-gateway', 'chat', {
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en OCR de facturas. Extrae TODO el texto visible de la imagen. Devuelve el texto tal cual aparece, manteniendo la estructura. No interpretes ni resumas, solo extrae el texto.'
          },
          {
            role: 'user',
            content: 'Extrae todo el texto de esta factura:',
            image_base64: base64Image,
            image_type: imageType
          }
        ],
        provider: 'deepseek',
        temperature: 0.1,
        max_tokens: 2000
      }, { timeout: 120000 });

      const d = result.data || result;
      const texto = d.content || d.text || 'Sin respuesta';

      // Truncar para Telegram (max 4096 chars)
      const textoTelegram = texto.length > 3500
        ? texto.substring(0, 3500) + '\n\n... (truncado)'
        : texto;

      const mensaje = [
        `OCR DeepSeek OK`,
        `Imagen: ${archivo.name} (${origen})`,
        `Tokens: ${d.usage?.total_tokens || '?'}`,
        `Coste: $${(d.cost || 0).toFixed(4)}`,
        '',
        textoTelegram
      ].join('\n');

      emit('telegram.send_message.request', { botName, chatId, text: mensaje });

      logger.info('test-ocr.ok', {
        file: archivo.name, origen,
        tokens: d.usage?.total_tokens,
        cost: d.cost,
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
