/**
 * Handler: Comando /convertirpdf de Telegram
 *
 * Escucha: telegram.command.received (comando: convertirpdf)
 * Emite: pdf.batch.convert
 *
 * Uso:
 *   /convertirpdf <sourceDir>           - Convierte PDFs del directorio especificado
 *   /convertirpdf <sourceDir> <outDir>  - Especifica también directorio de salida
 *
 * Ejemplo:
 *   /convertirpdf data/gmail/mi-cuenta
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
    const { botName, chatId, from, args = [] } = data;

    logger.info('comando-convertirpdf.ejecutando', {
      botName,
      chatId,
      from: from?.username || from?.firstName,
      args
    });

    // Validar que se proporcione el directorio
    if (!args || args.length === 0) {
      emit('telegram.send_message.request', {
        botName,
        chatId,
        text: '❌ Uso: /convertirpdf <directorio>\n\nEjemplo:\n/convertirpdf data/gmail/mi-cuenta'
      });
      return { triggered: false, error: 'Directorio no especificado' };
    }

    const sourceDir = args[0];
    const outputDir = args[1] || `${sourceDir}-images`;

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: `⏳ Convirtiendo PDFs a imágenes...\n📁 Origen: ${sourceDir}\n📁 Destino: ${outputDir}`
    });

    // Disparar conversión (300 DPI óptimo para OCR)
    emit('pdf.batch.convert', {
      sourceDir,
      outputDir,
      dpi: 300
    });

    // Notificar fin (el handler de conversión es async, esto es aproximado)
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: `✅ Conversión iniciada. Las imágenes se guardarán en ${outputDir}/`
    });

    return { triggered: true, sourceDir, outputDir };
  }
};
