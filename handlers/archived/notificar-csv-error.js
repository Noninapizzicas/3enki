/**
 * Handler: Notificar Error CSV
 *
 * Envía notificación por Telegram cuando hay error al generar CSV.
 *
 * ENTRADA (evento): csv.asesoria.error
 * {
 *   error: string,
 *   projectId: string,
 *   periodo: string,
 *   notificar: { chatId, botName }
 * }
 *
 * @version 1.0.0
 */

module.exports = {
  name: 'notificar-csv-error',
  description: 'Notifica errores al generar CSV',
  trigger: 'csv.asesoria.error',

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const { error, periodo, notificar } = data;

    if (!notificar || !notificar.chatId) {
      return { success: true, notified: false };
    }

    const { chatId, botName } = notificar;

    logger.warn('notificar-csv-error.enviando', { chatId, error });

    emit('bot.message.send', {
      chatId,
      botName,
      text: `❌ Error al generar CSV${periodo ? ` (${periodo})` : ''}:\n${error}`
    });

    return { success: true, notified: true };
  }
};
