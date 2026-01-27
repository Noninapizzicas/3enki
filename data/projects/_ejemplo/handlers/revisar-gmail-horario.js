/**
 * Handler de Proyecto: Revisar Gmail en horario laboral
 *
 * Escucha: schedule.hour (cada hora en punto)
 * Filtra: Solo L-V de 9:00 a 18:00
 * Emite: gmail.check con la configuración del proyecto
 *
 * EJEMPLO de cómo un proyecto usa eventos genéricos de tiempo
 * y los convierte en acciones específicas con SU configuración.
 */
module.exports = {
  name: 'revisar-gmail-horario',
  description: 'Revisa Gmail cada hora en horario laboral',
  trigger: 'schedule.hour',

  // Filtrar: solo días laborables (L-V) de 9:00 a 18:00
  filter: (event) => {
    const data = event.data || event;
    const t = data._time;
    if (!t) return false;

    const esLaborable = t.dayOfWeek >= 1 && t.dayOfWeek <= 5;
    const enHorario = t.hour >= 9 && t.hour <= 18;

    return esLaborable && enHorario;
  },

  async handle(event, { emit, config, logger }) {
    // Leer MI configuración
    const { gmail, telegram } = config.project || {};

    if (!gmail?.account) {
      logger.warn('revisar-gmail-horario.sin-config', {
        mensaje: 'Configura gmail.account en config/project.json'
      });
      return;
    }

    const data = event.data || event;
    logger.info('revisar-gmail-horario.ejecutando', {
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
