/**
 * Handler Proyecto: Comando /procesafacturas
 *
 * Escucha: bot.command.received
 * Emite: gmail.check
 *
 * Comando de Telegram para revisar correos de Gmail
 * y procesar facturas pendientes.
 *
 * Uso: /procesafacturas
 */

const BOT_NAME = 'facturas_asesoria_bot';
const GMAIL_ACCOUNT = 'noninapizzicas';

module.exports = {
  name: 'comando-procesafacturas',
  description: 'Comando /procesafacturas para revisar Gmail',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.botName === BOT_NAME && data.command === 'procesafacturas';
  },

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const chatId = data.chatId;

    logger.info('comando-procesafacturas.ejecutando', {
      chatId,
      account: GMAIL_ACCOUNT
    });

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName: BOT_NAME,
      chatId,
      text: '📧 Revisando correos de Gmail...'
    });

    // Disparar revisión de Gmail
    emit('gmail.check', {
      account: GMAIL_ACCOUNT,
      query: 'has:attachment is:unread',
      maxResults: 10,
      // Pasar datos para notificación de resultado
      _notify: {
        botName: BOT_NAME,
        chatId
      }
    });

    return { success: true, message: 'Revisión de Gmail iniciada' };
  }
};
