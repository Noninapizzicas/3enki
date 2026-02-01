/**
 * Handler Proyecto: /ia
 *
 * Paso manual 3: Lee ultimo resultado OCR de storage y emite
 * evento texto.estructurar.request para que estructurar-texto.js
 * (handler global) haga el trabajo con el LLM.
 *
 * manual-notificador.js se encarga de guardar resultado y notificar.
 *
 * Flujo: /listar → /ocr → [/ia] → /validar → /guardar
 *
 * @version 2.0.0 - Refactor: eventos en vez de HTTP directo
 */

const fs = require('fs');
const path = require('path');
const { EVENTS, resolveStoragePath } = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-ia',
  description: 'Estructura texto OCR con IA via eventos',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'ia';
  },

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    logger.info('comando-ia.ejecutando', { chatId, projectId });

    // 1. Leer ultimo resultado OCR de storage
    const ocrDir = resolveStoragePath({
      config: cfg, projectId, subdir: 'ocr'
    });

    let ocrFiles;
    try {
      ocrFiles = fs.readdirSync(ocrDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
    } catch (e) {
      ocrFiles = [];
    }

    if (ocrFiles.length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: 'No hay resultados OCR. Ejecuta /ocr primero.'
      });
      return { success: false, error: 'Sin OCR' };
    }

    const ocrData = JSON.parse(
      fs.readFileSync(path.join(ocrDir, ocrFiles[0]), 'utf-8')
    );

    if (!ocrData.texto || ocrData.texto.trim().length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `OCR de ${ocrData.fileName} no extrajo texto. Prueba con otra imagen.`
      });
      return { success: false, error: 'Texto vacio' };
    }

    // 2. Notificar inicio
    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: `Estructurando con IA: ${ocrData.fileName} (${ocrData.texto.length} chars)...`
    });

    // 3. Emitir evento - estructurar-texto.js (global) hace el trabajo
    //    manual-notificador.js guarda resultado y notifica
    emit(EVENTS.TEXTO_ESTRUCTURAR, {
      texto: ocrData.texto,
      tipo: 'factura',
      filePath: ocrData.filePath,
      requestId: ocrData.requestId,
      notificar: { botName, chatId },
      _manual: true
    });

    logger.info('comando-ia.emitido', {
      fileName: ocrData.fileName, requestId: ocrData.requestId
    });

    return { success: true, requestId: ocrData.requestId };
  }
};
