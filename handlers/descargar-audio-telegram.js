/**
 * Handler Global: Descargar Audio Telegram
 *
 * Escucha: telegram.audio.received (archivos de audio)
 * Escucha: telegram.voice.received (notas de voz) - handler separado
 * Guarda en: ./data/bots/{botName}/received/
 */
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'descargar-audio-telegram',
  description: 'Descarga archivos de audio recibidos por bots de Telegram',
  trigger: 'telegram.audio.received',

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
      title,
      performer
    } = data;

    if (!fileId || !botName) {
      logger.warn('descargar-audio-telegram.datos-incompletos', { fileId, botName });
      return { success: false, reason: 'missing fileId or botName' };
    }

    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
    const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');

    // Usar título si existe
    let baseName = 'audio';
    if (title) {
      baseName = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    const ext = mimeType?.includes('ogg') ? '.ogg' : '.mp3';
    const nuevoNombre = `${fecha}-${hora}_${baseName}_${fileId.slice(-8)}${ext}`;

    const destPath = path.join('./data/bots', botName, 'received', nuevoNombre);
    const requestId = crypto.randomUUID();

    logger.info('descargar-audio-telegram.iniciando', {
      botName,
      fileId,
      destPath,
      title,
      performer
    });

    emit('telegram.get_file.request', {
      request_id: requestId,
      botName,
      fileId,
      download: true,
      destPath
    });

    const duracionStr = duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '?';
    const infoExtra = title ? `\n${performer ? performer + ' - ' : ''}${title}` : '';
    const mensaje = `Audio recibido (${duracionStr})${infoExtra}\nGuardado correctamente.`;

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
        mimeType: mimeType || 'audio/mpeg',
        duration,
        title,
        performer
      },
      type: 'audio',
      timestamp: ahora.toISOString()
    });

    await store.increment('audios_descargados', 1);

    return { success: true, archivo: nuevoNombre, destPath };
  }
};
