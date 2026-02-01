/**
 * Handler: Procesar Adjuntos de Gmail
 *
 * Escucha: gmail.file.stored (emitido por descargar-adjuntos-gmail)
 * Emite: document.process.request
 *
 * Conecta el flujo de Gmail con el procesador de documentos.
 * Solo procesa PDFs e imágenes (facturas, documentos).
 *
 * Flujo completo:
 * gmail.check → gmail.message.found → gmail.file.stored → document.process.request
 */

module.exports = {
  name: 'procesar-adjuntos-gmail',
  description: 'Procesa adjuntos de Gmail con OCR/AI',
  trigger: 'gmail.file.stored',

  // Solo procesar PDFs e imágenes
  filter: (event) => {
    const data = event.data || event;
    const mimeType = data.file?.mimeType || '';
    const filename = data.file?.originalName || '';

    // Tipos soportados
    const supportedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/gif',
      'image/webp'
    ];

    // Extensiones soportadas (fallback)
    const supportedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.gif', '.webp'];

    const mimeOk = supportedMimes.some(m => mimeType.includes(m));
    const extOk = supportedExts.some(e => filename.toLowerCase().endsWith(e));

    return mimeOk || extOk;
  },

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { account, file, from, subject, messageId } = data;

    logger.info('procesar-adjuntos-gmail.iniciando', {
      account,
      archivo: file.originalName,
      mimeType: file.mimeType
    });

    // Obtener configuración de Telegram del proyecto (si existe)
    const telegram = config.project?.telegram || {};

    // Emitir evento para procesar documento
    emit('document.process.request', {
      document: file.path,
      type: 'invoice',  // Por defecto procesar como factura
      backend: 'auto',
      language: 'es',

      // Metadata del correo original
      metadata: {
        source: 'gmail',
        account,
        messageId,
        from,
        subject,
        originalFilename: file.originalName,
        mimeType: file.mimeType
      },

      // Notificar por Telegram si está configurado
      notifyTelegram: !!telegram.chatId,
      botName: telegram.botName,
      chatId: telegram.chatId
    });

    logger.info('procesar-adjuntos-gmail.emitido', {
      archivo: file.originalName,
      destino: 'document.process.request'
    });

    return { success: true, procesando: file.originalName };
  }
};
