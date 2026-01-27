/**
 * Handler: Comando /ocr de Telegram
 *
 * Escucha: telegram.command.received (comando: ocr)
 * Emite: ocr.batch.process
 *
 * Procesa imágenes con OCR y guarda JSON maestro
 *
 * Uso:
 *   /ocr <directorio>        - Procesa imágenes del directorio especificado
 *   /ocr <directorio> force  - Reprocesa aunque exista JSON
 *
 * Ejemplo:
 *   /ocr data/gmail/mi-cuenta-images
 *   /ocr data/bots/mi-bot/received force
 */

module.exports = {
  name: 'comando-ocr-telegram',
  description: 'Comando /ocr para procesar imágenes con OCR',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'ocr';
  },

  async handle(event, { emit, logger }) {
    const data = event.data || event;
    const { botName, chatId, from, args = [] } = data;

    logger.info('comando-ocr.ejecutando', {
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
        text: '❌ Uso: /ocr <directorio> [force]\n\nEjemplo:\n/ocr data/gmail/mi-cuenta-images\n/ocr data/bots/mi-bot/received force'
      });
      return { triggered: false, error: 'Directorio no especificado' };
    }

    // Primer argumento es el directorio
    const sourceDir = args[0];

    // Verificar si hay flag 'force'
    const normalizedArgs = args.slice(1).map(a => String(a).toLowerCase().trim());
    const force = normalizedArgs.includes('force');

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: `⏳ Procesando OCR...\n📁 ${sourceDir}\n🔄 Force: ${force ? 'Sí' : 'No'}`
    });

    // Disparar procesamiento OCR
    emit('ocr.batch.process', {
      sourceDir,
      force,
      notifyTelegram: true,
      botName,
      chatId
    });

    return { triggered: true, sourceDir, force };
  }
};
