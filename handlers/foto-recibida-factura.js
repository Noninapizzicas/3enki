/**
 * Handler: Procesar foto recibida como factura
 *
 * Dos pasos:
 * 1. telegram.photo.received → descargar archivo
 * 2. telegram.get_file.response → procesar factura
 *
 * @version 1.2.0
 */

const path = require('path');
const fs = require('fs');

module.exports = [
  // =========================================================================
  // PASO 1: Foto recibida → Descargar
  // =========================================================================
  {
    name: 'foto-recibida-descargar',
    description: 'Descarga foto recibida del bot de facturas',
    trigger: 'telegram.photo.received',

    // Solo bots de facturas
    filter: (event) => {
      const data = event.data || event;
      const botName = data.botName || '';
      return botName.includes('factura') ||
             botName.includes('noninapizzicas');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { botName, chatId, messageId, fileId, caption, sizes } = data;

      const requestId = `fac-${Date.now()}`;

      logger.info('foto-recibida.descargando', { botName, chatId, requestId });

      // Notificar
      emit('telegram.send_message.request', {
        botName,
        chatId,
        text: '📸 Foto recibida. Procesando factura...',
        replyToMessageId: messageId
      });

      // Obtener mejor calidad (TelegramClient usa camelCase: fileId)
      const bestFileId = sizes && sizes.length > 0
        ? sizes[sizes.length - 1].fileId
        : fileId;

      // Path destino
      const destPath = path.join(
        process.cwd(),
        'data/bots',
        botName,
        'received',
        `photo_${requestId}.jpg`
      );

      // Crear directorio
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Solicitar descarga
      emit('telegram.get_file.request', {
        botName,
        fileId: bestFileId,
        download: true,
        destPath,
        request_id: requestId,
        // Metadata para el siguiente paso
        _meta: {
          requestId,
          chatId,
          messageId,
          caption,
          esProcesarFactura: true
        }
      });

      return { success: true, requestId };
    }
  },

  // =========================================================================
  // PASO 2: Archivo descargado → Procesar factura
  // =========================================================================
  {
    name: 'foto-descargada-procesar',
    description: 'Procesa foto descargada como factura',
    trigger: 'telegram.get_file.response',

    // Solo si viene de nuestro flujo
    filter: (event) => {
      const data = event.data || event;
      return data._meta?.esProcesarFactura === true ||
             data.request_id?.startsWith('fac-');
    },

    async handle(event, { logger, emit }) {
      const data = event.data || event;
      const { localPath, success, error, botName, _meta } = data;
      const requestId = _meta?.requestId || data.request_id;
      const chatId = _meta?.chatId;

      if (!success || !localPath) {
        logger.error('foto-descargada.error', { error, requestId });

        if (chatId && botName) {
          emit('telegram.send_message.request', {
            botName,
            chatId,
            text: `❌ Error descargando foto: ${error || 'desconocido'}`
          });
        }
        return { success: false, error };
      }

      logger.info('foto-descargada.procesando', { localPath, requestId });

      // Iniciar pipeline de factura
      emit('factura.procesar.request', {
        filePath: localPath,
        fileName: path.basename(localPath),
        requestId,
        notificar: {
          telegram: true,
          botName,
          chatId
        }
      });

      return { success: true, requestId };
    }
  }
];
