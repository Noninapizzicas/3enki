/**
 * Handler: OCR con Tesseract
 *
 * Extrae texto de imagen/documento usando Tesseract OCR (local, gratis)
 *
 * ENTRADA (evento): documento.ocr.request
 * {
 *   filePath: string,      // Ruta al archivo (imagen)
 *   image: string,         // Imagen preprocesada en base64 (opcional, prioridad sobre filePath)
 *   language: string,      // Idioma OCR (default: 'spa')
 *   requestId: string      // ID para correlación (opcional)
 * }
 *
 * SALIDA (evento): documento.ocr.completado
 * {
 *   filePath: string,      // Ruta original
 *   texto: string,         // Texto extraído
 *   confianza: number,     // Confianza del OCR (0-100)
 *   language: string,      // Idioma usado
 *   requestId: string      // ID de correlación
 * }
 *
 * ERROR (evento): documento.ocr.error
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'ocr-tesseract',
  description: 'Extrae texto de imagen usando Tesseract OCR (local)',
  trigger: 'documento.ocr.request',

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const { filePath, image, language = 'spa', requestId, notificar, _pipeline } = data;

    logger.info('ocr-tesseract.inicio', {
      filePath,
      tieneImagenPreprocesada: !!image,
      language,
      requestId
    });

    try {
      // Validar input
      if (!filePath && !image) {
        throw new Error('filePath o image es requerido');
      }

      // Determinar qué usar para OCR
      let imageInput;
      let usandoPreprocesada = false;

      if (image) {
        // Usar imagen preprocesada (base64)
        imageInput = `data:image/png;base64,${image}`;
        usandoPreprocesada = true;
        logger.info('ocr-tesseract.usando-imagen-preprocesada');
      } else {
        // Usar archivo original
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(process.cwd(), filePath);

        if (!fs.existsSync(absolutePath)) {
          throw new Error(`Archivo no encontrado: ${absolutePath}`);
        }
        imageInput = absolutePath;
      }

      // Cargar Tesseract
      let Tesseract;
      try {
        Tesseract = require('tesseract.js');
      } catch (e) {
        throw new Error('tesseract.js no instalado. Ejecuta: npm install tesseract.js');
      }

      // Crear worker con idioma especificado
      logger.info('ocr-tesseract.procesando', { usandoPreprocesada });
      const worker = await Tesseract.createWorker(language, 1, {
        logger: () => {} // Silenciar logs internos
      });

      try {
        const startTime = Date.now();
        const { data: result } = await worker.recognize(imageInput);
        const elapsed = Date.now() - startTime;

        const texto = result.text.trim();
        const confianza = result.confidence;

        logger.info('ocr-tesseract.completado', {
          caracteres: texto.length,
          confianza: confianza.toFixed(1),
          tiempoMs: elapsed,
          requestId
        });

        // Emitir resultado
        emit('documento.ocr.completado', {
          filePath,
          texto,
          confianza,
          language,
          requestId,
          notificar,
          _pipeline,
          _meta: {
            tiempoMs: elapsed,
            backend: 'tesseract',
            preprocesada: usandoPreprocesada
          }
        });

        return { success: true, texto, confianza };

      } finally {
        await worker.terminate();
      }

    } catch (error) {
      logger.error('ocr-tesseract.error', { error: error.message, filePath, requestId });

      emit('documento.ocr.error', {
        filePath,
        error: error.message,
        requestId
      });

      return { success: false, error: error.message };
    }
  }
};
