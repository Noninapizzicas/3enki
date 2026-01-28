/**
 * Handler: Comando Telegram /exportarcsv
 *
 * Comando para generar y enviar el CSV de facturas para la asesoría.
 *
 * Uso:
 *   /exportarcsv           - Exporta todas las facturas
 *   /exportarcsv 2025-01   - Exporta solo facturas de enero 2025
 *
 * ENTRADA (evento): bot.command.received
 * {
 *   command: '/exportarcsv',
 *   args: string,
 *   chatId: string,
 *   botName: string
 * }
 *
 * SALIDA (evento): csv.asesoria.generar
 *
 * @version 1.0.0
 */

const path = require('path');

module.exports = {
  name: 'comando-exportar-csv',
  description: 'Comando Telegram para exportar CSV de facturas',
  trigger: 'bot.command.received',

  filter(event) {
    const data = event.data || event;
    const command = data.command || data.text || '';
    return command.startsWith('/exportarcsv');
  },

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const {
      chatId,
      botName,
      args,
      text
    } = data;

    // Extraer periodo del argumento
    const fullText = text || args || '';
    const match = fullText.match(/(\d{4}-\d{2})/);
    const periodo = match ? match[1] : null;

    logger.info('comando-exportar-csv.recibido', {
      chatId,
      botName,
      periodo
    });

    // Detectar projectId desde botName
    // data/bots/facturas_xxx_bot -> facturas-xxx
    let projectId = 'facturas-nonina'; // Default
    if (botName) {
      projectId = botName.replace(/_bot$/, '').replace(/_/g, '-');
    }

    // Notificar inicio
    emit('bot.message.send', {
      chatId,
      botName,
      text: periodo
        ? `📊 Generando CSV de facturas para periodo ${periodo}...`
        : `📊 Generando CSV de todas las facturas procesadas...`
    });

    // Disparar generación
    emit('csv.asesoria.generar', {
      projectId,
      periodo,
      notificar: {
        chatId,
        botName
      }
    });

    return { success: true };
  }
};
