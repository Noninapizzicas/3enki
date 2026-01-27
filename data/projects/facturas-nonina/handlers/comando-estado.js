/**
 * Handler Proyecto: Comando /estado
 *
 * Muestra estadísticas de facturas procesadas.
 */

const fs = require('fs');
const path = require('path');

const BOT_NAME = 'facturas_asesoria_bot';
const PROCESADAS_PATH = './data/projects/facturas-nonina/procesadas';
const PENDIENTES_PATH = './data/projects/facturas-nonina/pendientes';

module.exports = {
  name: 'comando-estado',
  description: 'Muestra estadísticas',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.botName === BOT_NAME && data.command === 'estado';
  },

  async handle(event, { emit }) {
    const data = event.data || event;

    // Contar facturas por mes
    let totalFacturas = 0;
    let meses = [];

    if (fs.existsSync(PROCESADAS_PATH)) {
      const dirs = fs.readdirSync(PROCESADAS_PATH)
        .filter(d => /^\d{4}-\d{2}$/.test(d))
        .sort()
        .reverse();

      for (const dir of dirs) {
        const dirPath = path.join(PROCESADAS_PATH, dir);
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.json') && !f.includes('error'));
        totalFacturas += files.length;
        if (meses.length < 3) {
          meses.push(`${dir}: ${files.length} facturas`);
        }
      }
    }

    // Contar pendientes
    let pendientes = 0;
    if (fs.existsSync(PENDIENTES_PATH)) {
      pendientes = fs.readdirSync(PENDIENTES_PATH)
        .filter(f => !f.endsWith('.json'))
        .length;
    }

    const text = `
<b>📊 Estado Facturas</b>

<b>Total procesadas:</b> ${totalFacturas}
<b>Pendientes/errores:</b> ${pendientes}

<b>Últimos meses:</b>
${meses.length > 0 ? meses.map(m => '• ' + m).join('\n') : '• Sin facturas aún'}

<b>Comandos:</b>
/procesafacturas - Procesar nuevas
/enviarfacturas - Enviar a asesoría
    `.trim();

    emit('telegram.send_message.request', {
      botName: BOT_NAME,
      chatId: data.chatId,
      text,
      parse_mode: 'HTML'
    });

    return { success: true };
  }
};
