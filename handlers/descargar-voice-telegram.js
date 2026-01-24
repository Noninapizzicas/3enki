/**
 * Handler Global: Descargar Notas de Voz Telegram
 *
 * Escucha: telegram.voice.received (notas de voz)
 * Guarda en: ./data/bots/{botName}/received/
 *
 * Nota: Las notas de voz de Telegram son siempre OGG OPUS
 */
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'descargar-voice-telegram',
  description: 'Descarga notas de voz recibidas por bots de Telegram',
  trigger: 'telegram.voice.received',

  async handle(event, { logger, emit, store }) {
    const data = event.data || event;
    const {
      botName,
      chatId,
      messageId,
      from,
      fileId,
      mimeType,
      duration
    } = data;

    if (!fileId || !botName) {
      logger.warn('descargar-voice-telegram.datos-incompletos', { fileId, botName });
      return { success: false, reason: 'missing fileId or botName' };
    }

    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
    const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
    const nuevoNombre = `${fecha}-${hora}_voice_${fileId.slice(-8)}.ogg`;

    const destPath = path.join('./data/bots', botName, 'received', nuevoNombre);
    const requestId = crypto.randomUUID();

    logger.info('descargar-voice-telegram.iniciando', {
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

    const duracionStr = duration ? `${duration}s` : '?';
    const fromName = from?.firstName || from?.username || 'Usuario';
    const mensaje = `Nota de voz recibida (${duracionStr})\nGuardada correctamente.`;

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
        mimeType: mimeType || 'audio/ogg',
        duration
      },
      type: 'voice',
      timestamp: ahora.toISOString()
    });

    await store.increment('notas_voz_descargadas', 1);

    return { success: true, archivo: nuevoNombre, destPath };
  }
};
