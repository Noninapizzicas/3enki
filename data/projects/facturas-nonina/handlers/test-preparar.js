/**
 * Handler Proyecto: /preparar
 *
 * Test del paso de preparación de imagen (Sharp prepare-ocr).
 * Coge el primer archivo del inbox, lo prepara y muestra resultado.
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

module.exports = {
  name: 'test-preparar',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'gosharp';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    // 1. Buscar primer archivo en inbox
    const inboxDir = cfg.storage?.inbox?.telegram
      || `data/bots/${botName}/received`;
    const absDir = path.isAbsolute(inboxDir)
      ? inboxDir
      : path.join(process.cwd(), inboxDir);

    if (!fs.existsSync(absDir)) {
      emit('telegram.send_message.request', {
        botName, chatId, text: 'No existe el directorio inbox.'
      });
      return;
    }

    const extensiones = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];
    const archivos = fs.readdirSync(absDir)
      .filter(f => extensiones.includes(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, path: path.join(absDir, f) }));

    if (archivos.length === 0) {
      emit('telegram.send_message.request', {
        botName, chatId, text: 'No hay imagenes en inbox. Envia una foto primero.'
      });
      return;
    }

    const archivo = archivos[0];

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `Preparando: ${archivo.name}...`
    });

    // 2. Llamar a Sharp prepare-ocr
    try {
      const outputDir = path.join(process.cwd(), 'data/projects', projectId, 'storage', 'preprocesadas');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `test_${Date.now()}.png`);

      const result = await services.call('local.sharp', 'prepare-ocr', {
        image: archivo.path,
        options: {
          trim: true,
          trimThreshold: 10,
          maxWidth: 2400,
          maxHeight: 3200,
          grayscale: true,
          normalize: true,
          sharpen: true
        },
        output: outputPath
      }, { timeout: 30000 });

      const d = result.data || result;

      const originalKB = d.originalSize ? (d.originalSize / 1024).toFixed(1) : '?';
      const processedKB = d.processedSize ? (d.processedSize / 1024).toFixed(1) : '?';

      const mensaje = [
        `Preparacion OK: ${archivo.name}`,
        '',
        `Original: ${d.width}x${d.height} (${originalKB} KB)`,
        `Procesado: ${processedKB} KB`,
        `Guardado: ${path.basename(outputPath)}`,
        '',
        'Pasos aplicados: trim, resize, grayscale, normalize, sharpen'
      ].join('\n');

      emit('telegram.send_message.request', { botName, chatId, text: mensaje });

      logger.info('test-preparar.ok', {
        file: archivo.name, width: d.width, height: d.height,
        originalKB, processedKB
      });

    } catch (error) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `Error preparando: ${error.message}`
      });
      logger.error('test-preparar.error', { error: error.message });
    }
  }
};
