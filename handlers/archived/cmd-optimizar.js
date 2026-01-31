/**
 * Paso 2b: /optimizar → agente image-processor con visión
 *
 * Manda la última foto al agente AI que VE la imagen y decide
 * qué operaciones de Sharp aplicar. Luego reintenta OCR automáticamente.
 *
 * Flujo: imagen → agente (DeepSeek visión) → Sharp optimizado → OCR retry
 */

const fs = require('fs');
const path = require('path');

function findLatestFile(dir, extensions) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => extensions.some(ext => f.toLowerCase().endsWith(ext)))
    .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return files.length > 0 ? path.join(dir, files[0].name) : null;
}

module.exports = {
  name: 'cmd-optimizar',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'optimizar';
  },

  async handle(event, { logger, emit, services }) {
    const data = event.data || event;
    const { botName, chatId } = data;

    // Buscar última foto descargada
    const receivedDir = path.join(process.cwd(), 'data/bots', botName, 'received');
    const filePath = findLatestFile(receivedDir, ['.jpg', '.jpeg', '.png']);

    if (!filePath) {
      emit('telegram.send_message.request', {
        botName, chatId,
        text: '❌ No hay fotos descargadas. Manda una foto primero.'
      });
      return { success: false };
    }

    emit('telegram.send_message.request', {
      botName, chatId,
      text: `🤖 Enviando imagen al agente con visión...\n📄 ${path.basename(filePath)}`
    });

    try {
      // Obtener info de imagen
      let imageBase64 = null;
      let imageInfo = null;

      const infoResult = await services.call('local.sharp', 'info', { image: filePath });
      if (infoResult.data?.success) {
        imageInfo = {
          width: infoResult.data.width,
          height: infoResult.data.height,
          format: infoResult.data.format
        };

        // Redimensionar si es muy grande (>1500px) para no gastar tokens
        if (imageInfo.width > 1500 || imageInfo.height > 1500) {
          const resizeResult = await services.call('local.sharp', 'resize', {
            image: filePath,
            width: 1500,
            height: 1500,
            fit: 'inside'
          });
          if (resizeResult.data?.success) {
            imageBase64 = resizeResult.data.image;
          }
        } else {
          imageBase64 = fs.readFileSync(filePath).toString('base64');
        }
      } else {
        imageBase64 = fs.readFileSync(filePath).toString('base64');
      }

      logger.info('cmd-optimizar.enviando-agente', {
        filePath,
        imageSize: imageInfo ? `${imageInfo.width}x${imageInfo.height}` : 'unknown'
      });

      // Disparar agente image-processor con visión
      emit('imagen.optimizar.request', {
        filePath,
        imageBase64,
        ocrResult: { texto: '', confianza: 0 },
        imageInfo,
        requestId: `opt-${Date.now()}`,
        notificar: { telegram: true, botName, chatId },
        _pipeline: 'factura',
        _optimizacionIntento: 1
      });

      return { success: true };

    } catch (error) {
      logger.error('cmd-optimizar.error', { error: error.message });
      emit('telegram.send_message.request', {
        botName, chatId,
        text: `❌ Error: ${error.message}`
      });
      return { success: false, error: error.message };
    }
  }
};
