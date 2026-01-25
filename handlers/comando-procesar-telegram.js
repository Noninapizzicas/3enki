/**
 * Handler: Comando /procesar de Telegram
 *
 * Escucha: telegram.command.received (comando: procesar)
 * Emite: telegram.cola.procesar
 *
 * Uso en Telegram:
 *   /procesar        → Procesa todos los archivos pendientes del bot
 *   /procesar 5      → Procesa máximo 5 archivos
 *
 * El comando solo procesa archivos del bot donde se ejecuta.
 */

module.exports = {
  name: 'comando-procesar-telegram',
  description: 'Comando /procesar para procesar archivos pendientes',
  trigger: 'telegram.command.received',

  // Solo responder al comando "procesar"
  filter: (event) => {
    const data = event.data || event;
    return data.command === 'procesar';
  },

  async handle(event, { emit, logger }) {
    const data = event.data || event;
    const { botName, chatId, args, from } = data;

    // Parsear límite opcional
    const limit = args?.[0] ? parseInt(args[0], 10) : 100;

    logger.info('comando-procesar.ejecutando', {
      botName,
      chatId,
      limit,
      from: from?.username || from?.firstName
    });

    // Notificar que empezamos
    emit('telegram.send_message.request', {
      botName,
      chatId,
      text: `⏳ Procesando archivos pendientes (máx: ${limit})...`
    });

    // Disparar procesamiento de la cola
    emit('telegram.cola.procesar', {
      botName,
      limit,
      triggeredBy: 'command',
      triggeredFrom: chatId
    });

    return { triggered: true, limit };
  }
};
