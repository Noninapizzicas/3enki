/**
 * Handler: Comando /ocr de Telegram
 *
 * Escucha: telegram.command.received (comando: ocr)
 * Emite: ocr.batch.process
 *
 * Procesa imágenes con OCR y guarda JSON maestro
 *
 * Uso:
 *   /ocr                    - Procesa data/gmail/noninapizzicas-images
 *   /ocr force              - Reprocesa aunque exista JSON
 *   /ocr bots               - Procesa data/bots/facturas_asesoria_bot/images
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

    // Determinar directorio según argumentos
    let sourceDir = 'data/gmail/noninapizzicas-images';
    let force = false;

    for (const arg of args) {
      if (arg === 'force') {
        force = true;
      } else if (arg === 'bots' || arg === 'telegram') {
        sourceDir = 'data/bots/facturas_asesoria_bot/images';
      } else if (arg === 'gmail') {
        sourceDir = 'data/gmail/noninapizzicas-images';
      }
    }

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

    return { triggered: true };
  }
};
