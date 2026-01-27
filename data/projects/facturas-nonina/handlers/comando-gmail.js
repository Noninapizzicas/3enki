/**
 * Handler Proyecto: Comando /gmailnoninapizzicas
 *
 * Escucha: bot.command.received
 * Emite: gmail.check
 *
 * Disparador MANUAL para descargar adjuntos PDF de Gmail.
 * Usa configuración del proyecto (config.json).
 */

module.exports = {
  name: 'comando-gmail',
  description: 'Comando /gmailnoninapizzicas - Descarga adjuntos de Gmail',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    const { botName, command } = data;
    // Filtrar por comando (sin importar botName, usa config)
    return command === 'gmailnoninapizzicas';
  },

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { chatId } = data;

    // Leer config del proyecto (config.config porque el archivo es config/config.json)
    const cfg = config.config || {};
    const telegram = cfg.telegram || {};
    const gmail = cfg.gmail || {};

    if (!gmail.account) {
      logger.error('comando-gmail.error', { error: 'gmail.account no configurado' });
      emit('telegram.send_message.request', {
        botName: telegram.botName,
        chatId,
        text: '❌ Error: cuenta Gmail no configurada en el proyecto'
      });
      return { success: false, error: 'gmail.account no configurado' };
    }

    logger.info('comando-gmail.ejecutando', {
      chatId,
      account: gmail.account
    });

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName: telegram.botName,
      chatId,
      text: `📧 Revisando Gmail (${gmail.account})...`
    });

    // Disparar revisión de Gmail (usa handlers globales)
    emit('gmail.check', {
      account: gmail.account,
      query: gmail.query || 'has:attachment is:unread',
      maxResults: gmail.maxResults || 20,
      // Notificación de resultado
      notifyTelegram: true,
      botName: telegram.botName,
      chatId
    });

    return { success: true, message: 'Revisión de Gmail iniciada' };
  }
};
