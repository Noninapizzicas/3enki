/**
 * Handler Genérico: Descargar Archivo Telegram
 *
 * Escucha: telegram.file.download.request
 * Emite:
 *   - telegram.get_file.request (descarga)
 *   - telegram.send_message.request (confirmación opcional)
 *   - telegram.file.stored (para encadenar)
 *
 * Este handler NO decide qué descargar - solo ejecuta lo que le piden.
 * Los disparadores/routers deciden qué archivos procesar.
 *
 * Payload esperado:
 * {
 *   botName: string,        // Bot que recibió el archivo
 *   fileId: string,         // ID del archivo en Telegram
 *   chatId: number,         // Chat para confirmar (opcional si notify=true)
 *   destPath: string,       // Ruta donde guardar (opcional, genera automática)
 *   fileName: string,       // Nombre original (opcional)
 *   mimeType: string,       // Tipo MIME (opcional)
 *   fileSize: number,       // Tamaño (opcional)
 *   notify: boolean,        // Enviar confirmación al usuario (default: true)
 *   notifyMessage: string,  // Mensaje personalizado (opcional)
 *   metadata: object        // Datos extra para telegram.file.stored
 * }
 */
const path = require('path');
const crypto = require('crypto');

module.exports = {
  name: 'descargar-archivo-telegram',
  description: 'Handler genérico para descargar archivos de Telegram bajo demanda',
  trigger: 'telegram.file.download.request',

  async handle(event, { logger, emit, store }) {
    const data = event.data || event;
    const {
      botName,
      fileId,
      chatId,
      destPath: customDestPath,
      fileName,
      mimeType,
      fileSize,
      notify = true,
      notifyMessage,
      metadata = {}
    } = data;

    // Validar datos mínimos
    if (!fileId || !botName) {
      logger.warn('descargar-archivo-telegram.datos-incompletos', { fileId, botName });
      return { success: false, reason: 'missing fileId or botName' };
    }

    // Construir ruta de destino
    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
    const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');

    let destPath = customDestPath;
    if (!destPath) {
      // Generar nombre automático
      const ext = fileName ? path.extname(fileName) : '';
      const base = fileName ? path.basename(fileName, ext) : `file_${fileId.slice(-8)}`;
      const safeName = base.replace(/[^a-zA-Z0-9_-]/g, '_');
      const nuevoNombre = `${fecha}-${hora}_${safeName}${ext}`;
      destPath = path.join('./data/bots', botName, 'received', nuevoNombre);
    }

    const requestId = crypto.randomUUID();

    logger.info('descargar-archivo-telegram.iniciando', {
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

    // 2. Enviar confirmación al usuario (si notify=true y tenemos chatId)
    if (notify && chatId) {
      const fileSizeKB = fileSize ? Math.round(fileSize / 1024) : null;
      const sizeText = fileSizeKB ? `\nTamaño: ${fileSizeKB} KB` : '';

      const mensaje = notifyMessage ||
        `✅ Archivo recibido: ${fileName || 'documento'}${sizeText}\nGuardado correctamente.`;

      emit('telegram.send_message.request', {
        request_id: crypto.randomUUID(),
        botName,
        chatId,
        text: mensaje
      });
    }

    // 3. Emitir evento para encadenar con otros handlers
    emit('telegram.file.stored', {
      botName,
      chatId,
      fileId,
      file: {
        path: destPath,
        originalName: fileName,
        mimeType,
        size: fileSize
      },
      timestamp: ahora.toISOString(),
      ...metadata
    });

    // 4. Actualizar estadísticas
    await store.increment('archivos_descargados', 1);

    logger.info('descargar-archivo-telegram.completado', {
      botName,
      destPath,
      fileId
    });

    return {
      success: true,
      destPath,
      fileId
    };
  }
};
