/**
 * Handler de Proyecto: Tareas de mantenimiento nocturno
 *
 * Escucha: schedule.night (22:00 cada día)
 * Emite: Eventos para procesamiento OCR, backup, limpieza, etc.
 *
 * EJEMPLO de cómo encadenar múltiples acciones en un evento de tiempo.
 */
module.exports = {
  name: 'mantenimiento-nocturno',
  description: 'Ejecuta tareas nocturnas del proyecto',
  trigger: 'schedule.night',

  async handle(event, { emit, config, logger }) {
    const { paths, telegram } = config.project || {};

    if (!paths) {
      logger.warn('mantenimiento-nocturno.sin-paths');
      return;
    }

    logger.info('mantenimiento-nocturno.iniciando');

    // 1. Convertir PDFs a imágenes
    if (paths.gmail && paths.images) {
      emit('pdf.batch.convert', {
        sourceDir: paths.gmail,
        outputDir: paths.images,
        dpi: 300
      });
    }

    // 2. Procesar OCR de imágenes
    if (paths.images) {
      // Esperar un poco para que termine la conversión
      setTimeout(() => {
        emit('ocr.batch.process', {
          sourceDir: paths.images,
          force: false
        });
      }, 60000); // 1 minuto después
    }

    // 3. Notificar inicio de mantenimiento
    if (telegram?.botName && telegram?.chatId) {
      emit('telegram.send_message.request', {
        botName: telegram.botName,
        chatId: telegram.chatId,
        text: '🌙 Mantenimiento nocturno iniciado'
      });
    }

    logger.info('mantenimiento-nocturno.programado');
  }
};
