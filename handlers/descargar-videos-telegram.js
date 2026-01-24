/**
 * Handler Global: Descargar Videos Telegram
 *
 * Escucha: telegram.video.received
 * Guarda en: ./data/bots/{botName}/received/
 */
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'descargar-videos-telegram',
  description: 'Descarga videos recibidos por bots de Telegram',
  trigger: 'telegram.video.received',

  async handle(event, { logger, emit, store }) {
    const data = event.data || event;
    const {
      botName,
      chatId,
      messageId,
      from,
      fileId,
      mimeType,
      duration,
      width,
      height,
      caption
    } = data;

    if (!fileId || !botName) {
      logger.warn('descargar-video-telegram.datos-incompletos', { fileId, botName });
      return { success: false, reason: 'missing fileId or botName' };
    }

    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
    const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
    const ext = mimeType === 'video/mp4' ? '.mp4' : '.mp4';
    const nuevoNombre = `${fecha}-${hora}_video_${fileId.slice(-8)}${ext}`;

    const destPath = path.join('./data/bots', botName, 'received', nuevoNombre);
    const requestId = crypto.randomUUID();

    logger.info('descargar-video-telegram.iniciando', {
      botName,
      fileId,
      destPath,
      duration
    });

    emit('telegram.get_file.request', {
      request_id: requestId,
      botName,
      fileId,
      download: true,
      destPath
    });

    const duracionStr = duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '?';
    const mensaje = `Video recibido (${duracionStr})\nGuardado correctamente.`;

    emit('telegram.send_message.request', {
      request_id: crypto.randomUUID(),
      botName,
      chatId,
      text: mensaje
    });

    emit('telegram.file.stored', {
      botName,
      chatId,
      messageId,
      from,
      fileId,
      file: {
        path: destPath,
        originalName: nuevoNombre,
        mimeType: mimeType || 'video/mp4',
        duration,
        width,
        height
      },
      caption,
      type: 'video',
      timestamp: ahora.toISOString()
    });

    await store.increment('videos_descargados', 1);

    return { success: true, archivo: nuevoNombre, destPath };
  }
};
