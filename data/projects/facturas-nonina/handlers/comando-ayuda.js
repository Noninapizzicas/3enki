/**
 * Handler Proyecto: Comando /ayuda
 *
 * Muestra todos los comandos disponibles del bot.
 */

const BOT_NAME = 'facturas_asesoria_bot';

const AYUDA = `
<b>🤖 Bot Facturas Asesoría</b>

<b>📧 Procesar facturas:</b>
/procesafacturas
  → Revisa Gmail y procesa facturas nuevas
  → Extrae datos con OCR/AI
  → Guarda en procesadas/

<b>📦 Enviar a asesoría:</b>
/enviarfacturas
  → Comprime mes actual en ZIP

/enviarfacturas mes-anterior
  → Comprime el mes pasado

/enviarfacturas 2026-01
  → Comprime mes específico

/enviarfacturas todo
  → Comprime todas las facturas

<b>📄 Enviar factura directa:</b>
  → Envía un PDF o imagen al chat
  → Se procesa automáticamente

<b>ℹ️ Ayuda:</b>
/ayuda - Este mensaje
/estado - Ver estadísticas

<b>📁 Archivos guardados en:</b>
<code>data/projects/facturas-nonina/</code>
├── procesadas/{mes}/
├── pendientes/
└── envios/
`.trim();

module.exports = {
  name: 'comando-ayuda',
  description: 'Muestra ayuda del bot',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.botName === BOT_NAME &&
           (data.command === 'ayuda' || data.command === 'help' || data.command === 'start');
  },

  async handle(event, { emit }) {
    const data = event.data || event;

    emit('telegram.send_message.request', {
      botName: BOT_NAME,
      chatId: data.chatId,
      text: AYUDA,
      parse_mode: 'HTML'
    });

    return { success: true };
  }
};
