/**
 * Pipeline OCR para Menugener_bot — recibe fotos/PDFs de cartas,
 * convierte a imagen, prepara OCR, extrae texto y guarda en storage del proyecto.
 *
 * Flujo:
 *   1. Telegram foto/documento recibido (solo Menugener_bot)
 *   2. Descargar archivo via telegram.get_file
 *   3. Si PDF → local.pdf-to-png (cada página)
 *   4. Cada imagen → local.sharp prepare-ocr
 *   5. Imagen preparada → local.tesseract extract (idioma: spa)
 *   6. Guardar texto OCR en data/bots/Menugener_bot/ocr/
 *   7. Emitir menu.ocr.completed para que menu-generator pueda usarlo
 *   8. Notificar al usuario por Telegram
 *
 * Trigger: telegram.photo.received
 * Extra triggers: telegram.document.received
 * Emite:
 *   - telegram.send_message.request — Progreso y resultado
 *   - telegram.get_file.request — Descargar archivo de Telegram
 *   - menu.ocr.completed — Texto OCR listo para generar carta
 * Scope: global
 * Generado por local.handler-generator el 2026-02-05
 */

const fs = require('fs');
const path = require('path');

const BOT_DATA_DIR = path.join(process.cwd(), 'data', 'bots');
const SUPPORTED_DOC_MIMES = ['application/pdf'];
const SUPPORTED_IMG_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function notify(emit, botName, chatId, text) {
  emit('telegram.send_message.request', {
    botName,
    chatId,
    text,
    parse_mode: 'Markdown'
  });
}

module.exports = {
  name: 'menu-ocr-pipeline',
  description: 'Pipeline OCR para Menugener_bot — recibe fotos/PDFs de cartas, convierte a imagen, prepara OCR, extrae texto y guarda en storage del proyecto',
  trigger: 'telegram.photo.received',
  enabled: true,

  filter(event) {
    const data = event.data || event;
    const botName = data.botName || '';
    return botName.toLowerCase().includes('menugener');
  },

  async handle(event, { services, logger, emit, config, store, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId || data.chat_id;
    const botName = data.botName || 'Menugener_bot';
    const caption = data.caption || '';
    const timestamp = Date.now();

    // Detectar tipo de archivo
    const isDocument = !!data.document || !!data.file_name;
    const isPhoto = !!data.sizes || !!data.fileId;

    let fileId = null;
    let fileName = null;
    let mimeType = null;

    if (isDocument) {
      fileId = data.document?.file_id || data.fileId;
      fileName = data.document?.file_name || data.file_name || `doc_${timestamp}`;
      mimeType = data.document?.mime_type || data.mimeType || '';
    } else if (isPhoto) {
      // Fotos de Telegram: sizes es array, el último es la mejor calidad
      const sizes = data.sizes || [];
      const best = sizes.length > 0 ? sizes[sizes.length - 1] : null;
      fileId = best?.file_id || data.fileId;
      fileName = `photo_${timestamp}.jpg`;
      mimeType = 'image/jpeg';
    }

    if (!fileId) {
      logger.warn('menu-ocr-pipeline: no fileId encontrado', { data: Object.keys(data) });
      return;
    }

    logger.info('menu-ocr-pipeline: inicio', {
      botName, chatId, fileId, fileName, mimeType, isDocument, isPhoto
    });

    // Directorio de trabajo
    const botDir = path.join(BOT_DATA_DIR, botName);
    const receivedDir = path.join(botDir, 'received');
    const ocrDir = path.join(botDir, 'ocr');
    ensureDir(receivedDir);
    ensureDir(ocrDir);

    const destPath = path.join(receivedDir, fileName);

    try {
      // ── Paso 1: Notificar inicio ──
      notify(emit, botName, chatId, '📥 Archivo recibido. Descargando...');

      // ── Paso 2: Descargar archivo ──
      const downloadResult = await services.call('local.telegram-service', 'get_file', {
        botName,
        fileId,
        download: true,
        destPath
      });
      const dlData = downloadResult?.data || downloadResult;

      const localPath = dlData?.localPath || dlData?.path || destPath;
      if (!fs.existsSync(localPath)) {
        notify(emit, botName, chatId, '❌ Error: no se pudo descargar el archivo.');
        logger.error('menu-ocr-pipeline: archivo no descargado', { localPath });
        return;
      }

      logger.info('menu-ocr-pipeline: archivo descargado', { localPath });

      // ── Paso 3: Determinar si es PDF o imagen ──
      const ext = path.extname(localPath).toLowerCase();
      const isPdf = ext === '.pdf' || SUPPORTED_DOC_MIMES.includes(mimeType);
      const isImage = SUPPORTED_IMG_MIMES.includes(mimeType) || ['.jpg', '.jpeg', '.png', '.webp', '.tiff'].includes(ext);

      if (!isPdf && !isImage) {
        notify(emit, botName, chatId, '⚠️ Formato no soportado. Envía una foto o PDF de la carta.');
        return;
      }

      // ── Paso 4: Obtener imágenes para OCR ──
      let imagesToProcess = [];

      if (isPdf) {
        notify(emit, botName, chatId, '📄 PDF detectado. Convirtiendo páginas a imágenes...');

        const pdfResult = await services.call('local.pdf-to-png', 'convert', {
          pdf: localPath,
          dpi: 300
        });
        const pdfData = pdfResult?.data || pdfResult;

        if (!pdfData?.images || pdfData.images.length === 0) {
          notify(emit, botName, chatId, '❌ Error convirtiendo PDF. Intenta con una foto.');
          logger.error('menu-ocr-pipeline: pdf-to-png falló', { pdfResult });
          return;
        }

        imagesToProcess = pdfData.images.map(img => ({
          content: img.content, // base64
          page: img.pageNumber,
          source: 'pdf'
        }));

        logger.info('menu-ocr-pipeline: PDF convertido', { pages: imagesToProcess.length });
      } else {
        // Imagen directa — leer como base64
        const imgBuffer = fs.readFileSync(localPath);
        imagesToProcess = [{
          content: imgBuffer.toString('base64'),
          page: 1,
          source: 'photo'
        }];
      }

      const totalPages = imagesToProcess.length;
      notify(emit, botName, chatId, `🔍 Procesando OCR${totalPages > 1 ? ` (${totalPages} páginas)` : ''}...`);

      // ── Paso 5: Pipeline por cada imagen: sharp → tesseract ──
      const ocrResults = [];

      for (const img of imagesToProcess) {
        // 5a. Preparar imagen para OCR
        const sharpResult = await services.call('local.sharp', 'prepare-ocr', {
          image: img.content,
          options: {
            trim: true,
            grayscale: true,
            normalize: true,
            sharpen: true,
            maxWidth: 2400,
            maxHeight: 3200
          }
        });
        const sharpData = sharpResult?.data || sharpResult;
        const preparedImage = sharpData?.image || img.content;

        // 5b. OCR con Tesseract
        const ocrResult = await services.call('local.tesseract', 'extract', {
          image: preparedImage,
          language: 'spa'
        });
        const ocrData = ocrResult?.data || ocrResult;

        ocrResults.push({
          page: img.page,
          text: ocrData?.text || '',
          confidence: ocrData?.confidence || 0,
          words: ocrData?.words || 0
        });

        logger.info('menu-ocr-pipeline: página procesada', {
          page: img.page,
          words: ocrData?.words || 0,
          confidence: ocrData?.confidence || 0
        });
      }

      // ── Paso 6: Combinar texto y guardar ──
      const fullText = ocrResults.map(r => r.text).join('\n\n--- Página ' + 'siguiente ---\n\n');
      const avgConfidence = ocrResults.reduce((s, r) => s + r.confidence, 0) / ocrResults.length;
      const totalWords = ocrResults.reduce((s, r) => s + r.words, 0);

      // Guardar OCR en archivo
      const ocrFileName = `ocr_${timestamp}.txt`;
      const ocrFilePath = path.join(ocrDir, ocrFileName);
      fs.writeFileSync(ocrFilePath, fullText, 'utf8');

      // Guardar metadata en JSON
      const metaFileName = `ocr_${timestamp}.json`;
      const metaFilePath = path.join(ocrDir, metaFileName);
      fs.writeFileSync(metaFilePath, JSON.stringify({
        timestamp: new Date().toISOString(),
        source: isPdf ? 'pdf' : 'photo',
        originalFile: fileName,
        pages: totalPages,
        totalWords,
        avgConfidence: Math.round(avgConfidence),
        caption,
        chatId,
        ocrFile: ocrFileName,
        results: ocrResults.map(r => ({ page: r.page, words: r.words, confidence: r.confidence }))
      }, null, 2), 'utf8');

      // Store persistente — guardar referencia del último OCR
      if (store) {
        await store.set('menu-ocr:last', JSON.stringify({
          file: ocrFilePath,
          meta: metaFilePath,
          timestamp: new Date().toISOString(),
          words: totalWords,
          confidence: Math.round(avgConfidence)
        }));
        await store.increment('menu-ocr:total');
      }

      logger.info('menu-ocr-pipeline: OCR completado', {
        ocrFile: ocrFilePath,
        totalWords,
        avgConfidence: Math.round(avgConfidence),
        pages: totalPages
      });

      // ── Paso 7: Emitir evento de OCR completado ──
      emit('menu.ocr.completed', {
        botName,
        chatId,
        ocrFile: ocrFilePath,
        metaFile: metaFilePath,
        text: fullText,
        pages: totalPages,
        totalWords,
        avgConfidence: Math.round(avgConfidence),
        originalFile: localPath,
        caption,
        timestamp: new Date().toISOString()
      });

      // ── Paso 8: Notificar resultado al usuario ──
      const preview = fullText.substring(0, 300).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
      const resultMsg = [
        `✅ *OCR completado*`,
        ``,
        `📊 *${totalWords}* palabras | *${totalPages}* ${totalPages === 1 ? 'página' : 'páginas'} | Confianza: *${Math.round(avgConfidence)}%*`,
        ``,
        `📝 *Preview:*`,
        `${preview}${fullText.length > 300 ? '...' : ''}`,
        ``,
        `💾 Guardado en: \`${ocrFileName}\``,
        ``,
        `_Envía más fotos/PDFs o escribe /generar para crear la carta._`
      ].join('\n');

      notify(emit, botName, chatId, resultMsg);

    } catch (error) {
      logger.error('menu-ocr-pipeline: error', { error: error.message, stack: error.stack });
      notify(emit, botName, chatId, `❌ Error procesando: ${error.message}`);
      emit('menu.ocr.pipeline.error', { error: error.message, botName, chatId });
    }
  }
};

module.exports._extraTriggers = ["telegram.document.received"];
