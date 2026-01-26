/**
 * Handler: Comando /gmail de Telegram
 *
 * Escucha: telegram.command.received (comando: gmail)
 * Emite: gmail.check
 *
 * Dispara revisión manual de Gmail
 *
 * Uso:
 *   /gmail              - Revisa todas las cuentas configuradas
 *   /gmail noninapizzicas - Revisa solo esa cuenta
 */

module.exports = {
  name: 'comando-gmail-telegram',
  description: 'Comando /gmail para revisar correos manualmente',
  trigger: 'telegram.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'gmail';
  },

  async handle(event, { emit, logger }) {
    const data = event.data || event;
    const { botName, chatId, from, args = [] } = data;

    logger.info('comando-gmail.ejecutando', {
      botName,
      chatId,
      from: from?.username || from?.firstName,
      args
    });

    // Cuenta específica si se pasa como argumento
    const account = args.length > 0 ? args[0].toLowerCase().trim() : null;

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: `📧 Revisando Gmail...\n${account ? `📁 Cuenta: ${account}` : '📁 Todas las cuentas'}`
    });

    // Disparar revisión de Gmail
    emit('gmail.check', {
      account,
      notifyTelegram: true,
      botName,
      chatId
    });

    return { triggered: true };
  }
};
