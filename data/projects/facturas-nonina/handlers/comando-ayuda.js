/**
 * Handler Proyecto: Comando /ayuda
 *
 * Escucha: bot.command.received
 * Emite: telegram.send_message.request
 *
 * Muestra todos los comandos disponibles del bot.
 * Lee botName y comandos desde config del proyecto.
 *
 * @version 2.0.0
 */

const { EVENTS } = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-ayuda',
  description: 'Muestra ayuda del bot',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'ayuda' || data.command === 'help' || data.command === 'start';
  },

  async handle(event, { emit, config }) {
    const data = event.data || event;
    const cfg = config.config || {};
    const telegram = cfg.telegram || {};
    const botName = telegram.botName || data.botName;
    const projectName = cfg.name || 'Facturas';

    // Construir texto de ayuda dinámicamente desde config
    const comandos = telegram.commands || {};
    const cmdList = Object.entries(comandos)
      .map(([cmd, desc]) => `${cmd}\n  → ${desc}`)
      .join('\n\n');

    const text = `
<b>Bot ${projectName}</b>

<b>Comandos disponibles:</b>
${cmdList || 'No hay comandos configurados'}

<b>Factura directa:</b>
  → Envía un PDF o imagen al chat
  → Se procesa automáticamente

<b>Info:</b>
/ayuda - Este mensaje
/estado - Ver estadísticas
    `.trim();

    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName,
      chatId: data.chatId,
      text,
      parse_mode: 'HTML'
    });

    return { success: true };
  }
};
