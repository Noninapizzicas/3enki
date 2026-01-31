/**
 * Handler Proyecto: /ocr
 *
 * Paso manual 2: Prepara imagen + ejecuta OCR en el primer archivo pendiente.
 * Usa services.call() directo para feedback inmediato.
 * Guarda resultado en storage/ocr/ para el siguiente paso (/ia).
 *
 * Flujo: /listar → [/ocr] → /ia → /validar → /guardar
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const {
  EVENTS, findFiles, resolveStoragePath,
  EXTENSIONES_DOCUMENTO
} = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-ocr',
  description: 'OCR manual de un archivo con feedback inmediato',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'ocr';
  },

  async handle(event, { logger, emit, services, config, projectId }) {
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
    const requestId = `ocr-${Date.now()}`;

    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: `[1/2] Preparando imagen: ${archivo.name}...`
    });

    // 2. Preprocesar con Sharp
    let imagenParaOcr = archivo.path;
    try {
      const prepDir = resolveStoragePath({
        config: cfg, projectId, subdir: 'preprocesadas'
      });
      const outputPath = path.join(prepDir, `${requestId}_prep.png`);

      const prepResult = await services.call('local.sharp', 'prepare-ocr', {
        image: archivo.path,
        options: { grayscale: true, normalize: true, sharpen: true },
        output: outputPath
      }, { timeout: 30000 });

      if (prepResult.data?.success) {
        imagenParaOcr = outputPath;
        logger.info('comando-ocr.prep-ok', {
          width: prepResult.data.width,
          height: prepResult.data.height
        });
      } else {
        logger.warn('comando-ocr.prep-fallback', {
          error: prepResult.data?.error
        });
      }
    } catch (e) {
      logger.warn('comando-ocr.prep-error-fallback', { error: e.message });
      // Continuar con imagen original
    }

    // 3. OCR con Tesseract
    emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
      botName, chatId,
      text: '[2/2] Ejecutando OCR...'
    });

    try {
      const ocrResult = await services.call('local.tesseract', 'extract', {
        image: imagenParaOcr,
        language: cfg.processing?.language || 'spa'
      }, { timeout: 120000 });

      if (!ocrResult.data?.success) {
        throw new Error(ocrResult.data?.error || 'OCR fallo');
      }

      const texto = (ocrResult.data.text || '').trim();
      const confianza = ocrResult.data.confidence || 0;

      // 4. Guardar resultado para /ia
      const ocrDir = resolveStoragePath({
        config: cfg, projectId, subdir: 'ocr'
      });
      const resultPath = path.join(ocrDir, `${requestId}.json`);
      const resultData = {
        requestId,
        filePath: archivo.path,
        fileName: archivo.name,
        texto,
        confianza,
        imagenProcesada: imagenParaOcr,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2));

      // 5. Enviar resultado al usuario
      const preview = texto.length > 500
        ? texto.substring(0, 500) + '...'
        : texto;

      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: [
          `OCR completado: ${archivo.name}`,
          `Confianza: ${confianza.toFixed(1)}%`,
          `Caracteres: ${texto.length}`,
          '',
          'Texto extraido:',
          '---',
          preview,
          '---',
          '',
          `Guardado: ${path.basename(resultPath)}`,
          'Siguiente paso: /ia'
        ].join('\n')
      });

      logger.info('comando-ocr.completado', {
        fileName: archivo.name, confianza, chars: texto.length, requestId
      });

      return { success: true, texto, confianza, requestId };

    } catch (error) {
      logger.error('comando-ocr.error', {
        error: error.message, file: archivo.name
      });
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `Error OCR: ${error.message}\nArchivo: ${archivo.name}`
      });
      return { success: false, error: error.message };
    }
  }
};
