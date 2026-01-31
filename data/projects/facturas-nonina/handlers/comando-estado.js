/**
 * Handler Proyecto: Comando /estado
 *
 * Escucha: bot.command.received
 * Emite: telegram.send_message.request
 *
 * Muestra estadísticas de facturas procesadas.
 * Rutas y botName leídos desde config del proyecto.
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const { EVENTS, resolveStoragePath } = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-estado',
  description: 'Muestra estadísticas',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'estado';
  },

  async handle(event, { emit, config, projectId }) {
    const data = event.data || event;
    const cfg = config.config || {};
    const telegram = cfg.telegram || {};
    const botName = telegram.botName || data.botName;

    const procesadasPath = resolveStoragePath({ config: cfg, projectId, subdir: 'procesadas' });
    const pendientesPath = resolveStoragePath({ config: cfg, projectId, subdir: 'pendientes' });

    // Contar facturas por mes
    let totalFacturas = 0;
    const meses = [];

    if (fs.existsSync(procesadasPath)) {
      const dirs = fs.readdirSync(procesadasPath)
        .filter(d => /^\d{4}-\d{2}$/.test(d))
        .sort()
        .reverse();

      for (const dir of dirs) {
        const dirPath = path.join(procesadasPath, dir);
        try {
          const files = fs.readdirSync(dirPath)
            .filter(f => f.endsWith('.json') && !f.includes('error'));
          totalFacturas += files.length;
          if (meses.length < 3) {
            meses.push(`${dir}: ${files.length} facturas`);
          }
        } catch (e) { /* ignorar error de lectura */ }
      }
    }

    // Contar pendientes
    let pendientes = 0;
    if (fs.existsSync(pendientesPath)) {
      try {
        pendientes = fs.readdirSync(pendientesPath)
          .filter(f => !f.endsWith('.json'))
          .length;
      } catch (e) { /* ignorar */ }
    }

    const text = `
<b>Estado ${cfg.name || 'Facturas'}</b>

<b>Total procesadas:</b> ${totalFacturas}
<b>Pendientes/errores:</b> ${pendientes}

<b>Últimos meses:</b>
${meses.length > 0 ? meses.map(m => '• ' + m).join('\n') : '• Sin facturas aún'}
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
