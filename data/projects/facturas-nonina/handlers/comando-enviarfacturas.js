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
 */

const BOT_NAME = 'facturas_asesoria_bot';
const EMAIL_ASESORIA = process.env.EMAIL_ASESORIA || null;

module.exports = {
  name: 'comando-enviarfacturas',
  description: 'Comando /enviarfacturas para comprimir y enviar',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.botName === BOT_NAME && data.command === 'enviarfacturas';
  },

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const args = data.args || '';  // Argumentos después del comando

    // Parsear período de los argumentos
    const periodo = args.trim() || 'mes-actual';

    logger.info('comando-enviarfacturas.ejecutando', {
      chatId,
      periodo
    });

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName: BOT_NAME,
      chatId,
      text: `📦 Comprimiendo facturas: ${periodo}...`
    });

    // Determinar si enviar email
    const enviarEmail = !!EMAIL_ASESORIA;

    // Disparar compresión
    emit('facturas.comprimir.request', {
      periodo,
      enviarEmail,
      destinatario: EMAIL_ASESORIA,
      chatId  // Para notificación de resultado
    });

    return { success: true, periodo };
  }
};
