/**
 * Handler Global: Descargar Fotos Telegram
 *
 * Escucha: telegram.photo.received
 * Guarda en: ./data/bots/{botName}/received/
 */
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'descargar-fotos-telegram',
  description: 'Descarga fotos recibidas por bots de Telegram',
  trigger: 'telegram.photo.received',

  async handle(event, { logger, emit, store }) {
    const data = event.data || event;
    const {
      botName,
      chatId,
      messageId,
      from,
      fileId,
      fileSize,
      width,
      height,
      mimeType,
      caption
    } = data;

    if (!fileId || !botName) {
      logger.warn('descargar-foto-telegram.datos-incompletos', { fileId, botName });
      return { success: false, reason: 'missing fileId or botName' };
    }

    // Construir nombre con fecha/hora
    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
    const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
    const nuevoNombre = `${fecha}-${hora}_photo_${fileId.slice(-8)}.jpg`;

    const destPath = path.join('./data/bots', botName, 'received', nuevoNombre);
    const requestId = crypto.randomUUID();

    logger.info('descargar-foto-telegram.iniciando', {
      botName,
      fileId,
      destPath,
      dimensions: `${width}x${height}`
    });

    // 1. Solicitar descarga
    emit('telegram.get_file.request', {
      request_id: requestId,
      botName,
      fileId,
      download: true,
      destPath
    });

    // 2. Confirmar al usuario
    const fromName = from?.firstName || from?.username || 'Usuario';
    const mensaje = `Foto recibida (${width}x${height})\nGuardada correctamente.`;

    emit('telegram.send_message.request', {
      request_id: crypto.randomUUID(),
      botName,
      chatId,
      text: mensaje
    });

    // 3. Emitir evento para encadenar
    emit('telegram.file.stored', {
      botName,
      chatId,
      messageId,
      from,
      fileId,
      file: {
        path: destPath,
        originalName: nuevoNombre,
        mimeType: mimeType || 'image/jpeg',
        size: fileSize,
        width,
        height
      },
      caption,
      type: 'photo',
      timestamp: ahora.toISOString()
    });

    await store.increment('fotos_descargadas', 1);

    return { success: true, archivo: nuevoNombre, destPath };
  }
};
