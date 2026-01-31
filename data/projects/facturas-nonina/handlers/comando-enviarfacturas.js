/**
 * Handler Proyecto: Comando /enviarfacturas
 *
 * Escucha: bot.command.received
 * Emite: facturas.comprimir.request
 *
 * Uso:
 *   /enviarfacturas              → mes actual
 *   /enviarfacturas mes-anterior → mes pasado
 *   /enviarfacturas 2026-01      → mes específico
 *   /enviarfacturas todo         → todas las facturas
 *
 * @version 2.0.0
 */

const { EVENTS } = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-enviarfacturas',
  description: 'Comando /enviarfacturas para comprimir y enviar',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'enviarfacturas';
  },

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const args = data.args || '';

    const cfg = config.config || {};
    const telegram = cfg.telegram || {};
    const botName = telegram.botName || data.botName;
    const asesoria = cfg.asesoria || {};

    const periodo = args.trim() || 'mes-actual';

    logger.info('comando-enviarfacturas.ejecutando', { chatId, periodo });

    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: `Comprimiendo facturas: ${periodo}...`
    });

    const enviarEmail = !!asesoria.email;

    emit('facturas.comprimir.request', {
      periodo,
      enviarEmail,
      destinatario: asesoria.email || null,
      botName, chatId
    });

    return { success: true, periodo };
  }
};
