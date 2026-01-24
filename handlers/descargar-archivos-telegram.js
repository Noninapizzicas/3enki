/**
 * Handler Global: Descargar Archivos Telegram
 *
 * Escucha: telegram.document.received (documentos)
 * Emite:
 *   - telegram.get_file.request (para descargar)
 *   - telegram.send_message.request (confirmación)
 *   - telegram.file.stored (para encadenar)
 *
 * Guarda archivos en: ./data/bots/{botName}/received/
 */
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'descargar-archivos-telegram',
  description: 'Descarga archivos recibidos por bots de Telegram',
  trigger: 'telegram.document.received',

  async handle(event, { logger, emit, store }) {
    const data = event.data || event;
    const {
      botName,
      chatId,
      messageId,
      from,
      fileId,
      fileName,
      mimeType,
      fileSize,
      caption
    } = data;

    if (!fileId || !botName) {
      logger.warn('descargar-telegram.datos-incompletos', { fileId, botName });
      return { success: false, reason: 'missing fileId or botName' };
    }

    // Construir ruta de destino con fecha/hora
    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
    const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');

    // Nombre seguro del archivo
    const ext = fileName ? path.extname(fileName) : '';
    const base = fileName ? path.basename(fileName, ext) : `file_${fileId.slice(-8)}`;
    const safeName = base.replace(/[^a-zA-Z0-9_-]/g, '_');
    const nuevoNombre = `${fecha}-${hora}_${safeName}${ext}`;

    const destPath = path.join('./data/bots', botName, 'received', nuevoNombre);

    // Generar request_id para tracking
    const requestId = crypto.randomUUID();

    logger.info('descargar-telegram.iniciando', {
      botName,
      fileId,
      fileName,
      destPath,
      requestId
    });

    // 1. Solicitar descarga del archivo
    emit('telegram.get_file.request', {
      request_id: requestId,
      botName,
      fileId,
      download: true,
      destPath
    });

    // 2. Enviar confirmación al usuario
    const fromName = from?.firstName || from?.username || 'Usuario';
    const fileSizeKB = fileSize ? Math.round(fileSize / 1024) : '?';
    const mensaje = `Archivo recibido: ${fileName || 'documento'}\nTamaño: ${fileSizeKB} KB\nGuardado correctamente.`;

    emit('telegram.send_message.request', {
      request_id: crypto.randomUUID(),
      botName,
      chatId,
      text: mensaje
    });

    // 3. Emitir evento para encadenar con otros handlers
    emit('telegram.file.stored', {
      botName,
      chatId,
      messageId,
      from,
      fileId,
      file: {
        path: destPath,
        originalName: fileName,
        mimeType,
        size: fileSize
      },
      caption,
      timestamp: ahora.toISOString()
    });

    // 4. Actualizar estadísticas
    await store.increment('archivos_descargados', 1);

    logger.info('descargar-telegram.completado', {
      botName,
      archivo: nuevoNombre,
      from: fromName
    });

    return {
      success: true,
      archivo: nuevoNombre,
      destPath
    };
  }
};
