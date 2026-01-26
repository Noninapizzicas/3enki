/**
 * Handler: Procesar OCR de Imágenes
 *
 * Escucha: ocr.batch.process
 * Procesa todas las imágenes de un directorio con Google Vision OCR
 * y guarda el JSON maestro junto a cada imagen.
 *
 * Payload:
 * {
 *   sourceDir: 'data/gmail/noninapizzicas-images',  // Directorio con imágenes
 *   force: false                                     // Reprocesar aunque exista JSON
 * }
 *
 * Resultado:
 * - imagen.png -> imagen.json (JSON maestro con OCR completo)
 */

const fs = require('fs');
const path = require('path');

// Importar servicio Google Vision directamente
const googleVision = require('../services/providers/local/google-vision/index.js');

module.exports = {
  name: 'procesar-ocr-imagenes',
  description: 'Procesa imágenes con OCR y guarda JSON maestro',
  trigger: 'ocr.batch.process',

  async handle(event, { emit, logger }) {
    const data = event.data || event;
    const { sourceDir, force = false } = data;

    if (!sourceDir) {
      logger.error('procesar-ocr.error', { error: 'sourceDir es requerido' });
      return { success: false, error: 'sourceDir es requerido' };
    }

    // Verificar que el directorio existe
    if (!fs.existsSync(sourceDir)) {
      logger.error('procesar-ocr.error', { error: `Directorio no existe: ${sourceDir}` });
      return { success: false, error: `Directorio no existe: ${sourceDir}` };
    }

    // Extensiones de imagen soportadas
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif'];

    // Listar imágenes en el directorio
    const files = fs.readdirSync(sourceDir);
    const images = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return imageExtensions.includes(ext);
    });

    logger.info('procesar-ocr.iniciando', {
      sourceDir,
      totalImages: images.length,
      force
    });

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const imageFile of images) {
      const imagePath = path.join(sourceDir, imageFile);
      const baseName = path.basename(imageFile, path.extname(imageFile));
      const jsonPath = path.join(sourceDir, `${baseName}.json`);

      // Si ya existe el JSON y no es force, saltar
      if (fs.existsSync(jsonPath) && !force) {
        logger.debug('procesar-ocr.skip', { imageFile, reason: 'JSON ya existe' });
        skipped++;
        continue;
      }

      logger.info('procesar-ocr.procesando', { imageFile });

      try {
        // Llamar directamente al servicio de Google Vision
        const ocrResult = await googleVision.extract({
          image: imagePath,
          hint: 'DOCUMENT_TEXT_DETECTION',
          languageHints: ['es']
        });

        // Construir JSON maestro
        const masterJson = {
          source: {
            file: imageFile,
            path: imagePath,
            type: imagePath.includes('/gmail/') ? 'gmail' :
                  imagePath.includes('/bots/') ? 'telegram' : 'unknown'
          },
          ocr: {
            provider: 'google-vision',
            hint: 'DOCUMENT_TEXT_DETECTION',
            text: ocrResult.text || '',
            confidence: ocrResult.confidence || 0,
            blocks: ocrResult.blocks || 0,
            pages: ocrResult.pages || 0,
            locale: ocrResult.locale || '',
            textLength: ocrResult.textLength || 0
          },
          raw: ocrResult.raw || null,
          processedAt: new Date().toISOString()
        };

        // Guardar JSON
        fs.writeFileSync(jsonPath, JSON.stringify(masterJson, null, 2), 'utf8');

        logger.info('procesar-ocr.guardado', {
          imageFile,
          jsonPath,
          textLength: masterJson.ocr.textLength,
          confidence: masterJson.ocr.confidence
        });

        processed++;

      } catch (error) {
        logger.error('procesar-ocr.error', {
          imageFile,
          error: error.message
        });
        errors++;
      }
    }

    logger.info('procesar-ocr.completado', {
      sourceDir,
      processed,
      skipped,
      errors,
      total: images.length
    });

    // Notificar resultado si hay telegram disponible
    if (data.notifyTelegram) {
      emit('telegram.send_message.request', {
        botName: data.botName || 'facturas_asesoria_bot',
        chatId: data.chatId,
        text: `✅ OCR completado:\n- Procesados: ${processed}\n- Saltados: ${skipped}\n- Errores: ${errors}`
      });
    }

    return {
      success: true,
      sourceDir,
      processed,
      skipped,
      errors,
      total: images.length
    };
  }
};
