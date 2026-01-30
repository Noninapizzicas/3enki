/**
 * Paso 1: Foto recibida → Descargar
 *
 * Solo descarga la foto y confirma. No lanza pipeline.
 * Para probar: manda una foto al bot, revisa data/bots/{bot}/received/
 */

const path = require('path');
const fs = require('fs');

module.exports = [
  // Foto recibida → solicitar descarga
  {
    name: 'foto-recibida-descargar',
    trigger: 'telegram.photo.received',

    filter: (event) => {
      const data = event.data || event;
      const botName = data.botName || '';
      return botName.includes('factura') || botName.includes('noninapizzicas');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { botName, chatId, messageId, fileId, caption, sizes } = data;
      const requestId = `fac-${Date.now()}`;

      logger.info('foto-recibida.descargando', { botName, chatId, fileId, requestId });

      // Mejor calidad (TelegramClient usa camelCase: fileId)
      const bestFileId = sizes && sizes.length > 0
        ? sizes[sizes.length - 1].fileId
        : fileId;

      const destPath = path.join(
        process.cwd(), 'data/bots', botName, 'received', `photo_${requestId}.jpg`
      );

      // Crear directorio
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Solicitar descarga al telegram-service
      emit('telegram.get_file.request', {
        botName,
        fileId: bestFileId,
        download: true,
        destPath,
        request_id: requestId,
        _meta: { requestId, chatId, messageId, caption }
      });

      return { success: true, requestId };
    }
  },

  // Descarga completada → confirmar
  {
    name: 'foto-descargada-confirmar',
    trigger: 'telegram.get_file.response',

    filter: (event) => {
      const data = event.data || event;
      return data.request_id?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { localPath, success, error, botName, _meta } = data;
      const chatId = _meta?.chatId;
      const requestId = _meta?.requestId || data.request_id;

      if (!success || !localPath) {
        logger.error('foto-descargada.error', { error, requestId });
        if (chatId && botName) {
          emit('telegram.send_message.request', {
            botName, chatId,
            text: `❌ Error descargando: ${error || 'desconocido'}`
          });
        }
        return { success: false, error };
      }

      logger.info('foto-descargada.ok', { localPath, requestId });

      // Confirmar al usuario
      if (chatId && botName) {
        emit('telegram.send_message.request', {
          botName, chatId,
          text: `✅ Foto guardada: ${path.basename(localPath)}\n📂 ${localPath}\n\nUsa /preprocesar para el siguiente paso.`
        });
      }

      return { success: true, localPath };
    }
  }
];
