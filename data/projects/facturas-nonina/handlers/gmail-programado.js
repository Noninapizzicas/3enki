/**
 * Handler Proyecto: Gmail Programado
 *
 * Escucha: schedule.time
 * Emite: gmail.check
 *
 * Disparador AUTOMATICO (domingos 3AM) para descargar adjuntos PDF de Gmail.
 * Filtra por job ID del scheduler.
 * Usa configuración del proyecto (config.json).
 */

const JOB_ID = 'facturas-nonina-gmail-domingo';

module.exports = {
  name: 'gmail-programado',
  description: 'Descarga Gmail programada - Domingos 3AM',
  trigger: 'schedule.time',

  filter: (event) => {
    const data = event.data || event;
    const job = data._job || {};
    // Solo ejecutar para MI job específico
    return job.id === JOB_ID;
  },

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const time = data._time || {};

    // Leer config del proyecto
    const telegram = config.telegram || {};
    const gmail = config.gmail || {};

    if (!gmail.account) {
      logger.error('gmail-programado.error', { error: 'gmail.account no configurado' });
      return { success: false, error: 'gmail.account no configurado' };
    }

    logger.info('gmail-programado.ejecutando', {
      jobId: JOB_ID,
      account: gmail.account,
      hora: time.iso
    });

    // Disparar revisión de Gmail (usa handlers globales)
    emit('gmail.check', {
      account: gmail.account,
      query: gmail.query || 'has:attachment is:unread',
      maxResults: gmail.maxResults || 20,
      // Notificación si hay chatId configurado
      notifyTelegram: !!telegram.chatId,
      botName: telegram.botName,
      chatId: telegram.chatId
    });

    return { success: true, message: 'Revisión de Gmail programada iniciada' };
  }
};
