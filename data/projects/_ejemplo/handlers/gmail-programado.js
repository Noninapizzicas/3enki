/**
 * Handler de Proyecto: Gmail Programado
 *
 * Escucha: schedule.time
 * Filtra: Solo MI alarma específica (por _job.id)
 *
 * IMPORTANTE: Este handler requiere que el proyecto haya creado
 * su alarma en el scheduler. Ejemplo de alarma:
 *
 * {
 *   "id": "_ejemplo-gmail",
 *   "trigger": { "type": "cron", "expression": "0 8 * * 1" },
 *   "action": { "type": "mqtt", "topic": "schedule.time" },
 *   "metadata": { "projectId": "_ejemplo" }
 * }
 */
module.exports = {
  name: 'gmail-programado',
  description: 'Revisa Gmail cuando se dispara MI alarma',
  trigger: 'schedule.time',

  // Filtrar: solo MI alarma específica
  filter: (event) => {
    const data = event.data || event;
    const job = data._job;
    return job?.id === '_ejemplo-gmail';
  },

  async handle(event, { emit, config, logger }) {
    // Leer MI configuración
    const { gmail, telegram } = config.project || {};

    if (!gmail?.account) {
      logger.warn('gmail-programado.sin-config', {
        mensaje: 'Configura gmail.account en config/project.json'
      });
      return;
    }

    const data = event.data || event;
    logger.info('gmail-programado.ejecutando', {
      hora: data._time?.hour,
      cuenta: gmail.account
    });

    // Emitir evento para handler global
    emit('gmail.check', {
      account: gmail.account,
      query: gmail.query || 'has:attachment is:unread',
      notifyTelegram: !!telegram?.botName,
      botName: telegram?.botName,
      chatId: telegram?.chatId
    });
  }
};
