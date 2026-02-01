/**
 * Handler Proyecto: /ocr
 *
 * Paso manual 2: Emite evento para preparar imagen + OCR.
 * Reutiliza los handlers globales (preparar-imagen.js, ocr-tesseract.js).
 * manual-notificador.js se encarga de notificar resultados.
 *
 * Flujo: /listar → [/ocr] → /ia → /validar → /guardar
 *
 * @version 2.0.0 - Refactor: eventos en vez de services.call directo
 */

const path = require('path');
const {
  EVENTS, findFiles, EXTENSIONES_DOCUMENTO
} = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-ocr',
  description: 'Dispara OCR manual via eventos',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'ocr';
  },

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;
    const storage = cfg.storage || {};

    logger.info('comando-ocr.ejecutando', { chatId, projectId });

    // 1. Buscar primer archivo pendiente
    const inboxDirs = [];
    if (storage.inbox) {
      if (storage.inbox.telegram) inboxDirs.push(storage.inbox.telegram);
      if (storage.inbox.gmail) inboxDirs.push(storage.inbox.gmail);
    }
    if (inboxDirs.length === 0 && botName) {
      inboxDirs.push(path.join('data/bots', botName, 'received'));
    }

    let archivos = [];
    for (const dir of inboxDirs) {
      const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
      archivos.push(...findFiles(absDir, EXTENSIONES_DOCUMENTO));
    }

    if (archivos.length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: 'No hay archivos pendientes. Envia una foto primero.'
      });
      return { success: false, error: 'Sin archivos' };
    }

    const archivo = archivos[0];
    const requestId = `manual-${Date.now()}`;

    // 2. Notificar inicio
    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: `Preparando imagen: ${archivo.name}...`
    });

    // 3. Emitir evento - los handlers globales hacen el trabajo
    //    preparar-imagen.js → imagen.preparada
    //    manual-notificador.js encadena a OCR y notifica resultado
    emit(EVENTS.IMAGEN_PREPARAR, {
      filePath: archivo.path,
      language: cfg.processing?.language || 'spa',
      requestId,
      notificar: { botName, chatId },
      _manual: true
    });

    logger.info('comando-ocr.emitido', {
      filePath: archivo.path, requestId
    });

    return { success: true, requestId };
  }
};
