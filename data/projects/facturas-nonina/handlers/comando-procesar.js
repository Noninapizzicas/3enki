/**
 * Handler Proyecto: Comando /procesarnoninapizzicas
 *
 * Escucha: bot.command.received
 * Emite: factura.procesar.request
 *
 * Busca archivos pendientes (imágenes/PDFs) en las carpetas
 * inbox del proyecto y dispara el pipeline de factura para cada uno.
 *
 * Flujo:
 *   /procesarnoninapizzicas
 *     → busca en storage.inbox.telegram + storage.inbox.gmail
 *     → para cada archivo: emit('factura.procesar.request', { filePath })
 *     → el pipeline global se encarga del resto
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const {
  EVENTS, findFiles, EXTENSIONES_DOCUMENTO
} = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-procesar',
  description: 'Comando para procesar facturas pendientes',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'procesarnoninapizzicas' ||
           data.command === 'procesarfacturas';
  },

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;

    const cfg = config.config || {};
    const telegram = cfg.telegram || {};
    const storage = cfg.storage || {};
    const botName = telegram.botName || data.botName;

    logger.info('comando-procesar.ejecutando', { chatId, projectId });

    // Recopilar carpetas inbox donde buscar
    const inboxDirs = [];
    if (storage.inbox) {
      if (storage.inbox.telegram) inboxDirs.push(storage.inbox.telegram);
      if (storage.inbox.gmail) inboxDirs.push(storage.inbox.gmail);
    }

    // Fallback: carpeta por defecto del bot
    if (inboxDirs.length === 0 && telegram.botName) {
      inboxDirs.push(path.join('data/bots', telegram.botName, 'received'));
    }

    // Buscar archivos procesables
    const archivos = [];
    for (const dir of inboxDirs) {
      const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
      const found = findFiles(absDir, EXTENSIONES_DOCUMENTO);
      archivos.push(...found);
    }

    if (archivos.length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: 'No hay archivos pendientes para procesar.'
      });
      return { success: true, procesados: 0 };
    }

    // Notificar inicio
    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: `Procesando ${archivos.length} archivo(s)...`
    });

    // Disparar pipeline para cada archivo
    let count = 0;
    for (const archivo of archivos) {
      const requestId = `fac-${Date.now()}-${count}`;

      emit(EVENTS.FACTURA_PROCESAR, {
        filePath: archivo.path,
        requestId,
        language: cfg.processing?.language || 'spa',
        notificar: { botName, chatId },
        _pipeline: 'factura'
      });

      count++;

      logger.info('comando-procesar.dispatched', {
        filePath: archivo.path, requestId
      });
    }

    return { success: true, procesados: count };
  }
};
