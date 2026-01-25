/**
 * Handler: Comando /convertirpdf de Telegram
 *
 * Escucha: telegram.command.received (comando: convertirpdf)
 * Emite: pdf.batch.convert
 *
 * Convierte PDFs de data/gmail/noninapizzicas a imágenes
 */

module.exports = {
  name: 'comando-convertirpdf-telegram',
  description: 'Comando /convertirpdf para convertir PDFs a imágenes',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'convertirpdf';
  },

  async handle(event, { emit, logger }) {
    const data = event.data || event;
    const { botName, chatId, from } = data;

    logger.info('comando-convertirpdf.ejecutando', {
      botName,
      chatId,
      from: from?.username || from?.firstName
    });

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: '⏳ Convirtiendo PDFs a imágenes...'
    });

    // Disparar conversión (300 DPI óptimo para OCR)
    emit('pdf.batch.convert', {
      sourceDir: 'data/gmail/noninapizzicas',
      outputDir: 'data/gmail/noninapizzicas-images',
      dpi: 300
    });

    // Notificar fin (el handler de conversión es async, esto es aproximado)
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: '✅ Conversión iniciada. Las imágenes se guardarán en noninapizzicas-images/'
    });

    return { triggered: true };
  }
};
