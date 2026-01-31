/**
 * Handler Base: Foto recibida → Descargar
 *
 * Escucha fotos recibidas por Telegram y solicita su descarga.
 * Confirma al usuario cuando la foto está lista.
 *
 * Project-agnostic: funciona con cualquier bot cuyo nombre
 * contenga patrones configurables via filter.
 *
 * ENTRADA (evento): telegram.photo.received
 * {
 *   botName: string,
 *   chatId: string,
 *   messageId: string,
 *   fileId: string,
 *   caption: string,
 *   sizes: array
 * }
 *
 * SALIDA (evento): telegram.get_file.request → telegram.get_file.response
 *
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs');
const { EVENTS } = require('../lib/handler-utils');

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
      const { botName, chatId, fileId, caption, sizes } = data;
      const requestId = `fac-${Date.now()}`;

      logger.info('foto-recibida.descargando', {
        botName, chatId, fileId, requestId
      });

      // Mejor calidad disponible
      const bestFileId = sizes && sizes.length > 0
        ? sizes[sizes.length - 1].fileId
        : fileId;

      const destPath = path.join(
        process.cwd(), 'data/bots', botName, 'received',
        `photo_${requestId}.jpg`
      );

      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      emit('telegram.get_file.request', {
        botName,
        fileId: bestFileId,
        download: true,
        destPath,
        request_id: requestId,
        _meta: { requestId, chatId, caption }
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
          emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
            botName, chatId,
            text: `Error descargando: ${error || 'desconocido'}`
          });
        }
        return { success: false, error };
      }

      logger.info('foto-descargada.ok', { localPath, requestId });

      if (chatId && botName) {
        emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
          botName, chatId,
          text: `Foto guardada: ${path.basename(localPath)}\n${localPath}\n\nUsa /procesarfacturas para procesar.`
        });
      }

      return { success: true, localPath };
    }
  }
];
