/**
 * Handler Base: OCR con Tesseract
 *
 * Extrae texto de imagen usando el provider local.tesseract.
 * Acepta imagen como ruta de archivo o base64.
 *
 * ENTRADA (evento): documento.ocr.request
 * {
 *   filePath: string,       // Ruta al archivo (imagen)
 *   image: string,          // Imagen preprocesada en base64 (prioridad sobre filePath)
 *   language: string,       // Idioma OCR (default: 'spa')
 *   requestId: string,
 *   notificar: object,
 *   _pipeline: string
 * }
 *
 * SALIDA (evento): documento.ocr.completado
 * {
 *   filePath: string,       // Ruta original (propagada)
 *   texto: string,          // Texto extraído
 *   confianza: number,      // Confianza del OCR (0-100)
 *   language: string,
 *   requestId: string,
 *   notificar: object,
 *   _pipeline: string,
 *   _meta: object
 * }
 *
 * ERROR (evento): documento.ocr.error
 *
 * Providers usados: local.tesseract (extract)
 *
 * @version 3.0.0
 */

const { resolveAbsolutePath, EVENTS } = require('../lib/handler-utils');

module.exports = {
  name: 'ocr-tesseract',
  description: 'Extrae texto de imagen usando Tesseract OCR (local)',
  trigger: EVENTS.OCR_REQUEST,

  async handle(event, { logger, emit, services }) {
    const data = event.data || event;
    const {
      filePath, image,
      language = 'spa',
      requestId, notificar, _pipeline,
      _optimizado, _optimizacionIntento
    } = data;

    logger.info('ocr-tesseract.inicio', {
      filePath,
      tieneImagenPreprocesada: !!image,
      language, requestId
    });

    try {
      if (!filePath && !image) {
        throw new Error('filePath o image es requerido');
      }

      // Determinar input para el provider
      let imageInput;
      let usandoPreprocesada = false;

      if (image) {
        // Imagen preprocesada en base64
        imageInput = `data:image/png;base64,${image}`;
        usandoPreprocesada = true;
      } else {
        // Archivo original
        imageInput = resolveAbsolutePath(filePath);
      }

      // Llamar al provider local.tesseract
      const startTime = Date.now();
      const result = await services.call('local.tesseract', 'extract', {
        image: imageInput,
        language
      }, { timeout: 120000 });

      const elapsed = Date.now() - startTime;

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Error en OCR');
      }

      const texto = (result.data.text || '').trim();
      const confianza = result.data.confidence || 0;

      logger.info('ocr-tesseract.completado', {
        caracteres: texto.length,
        confianza: confianza.toFixed(1),
        tiempoMs: elapsed,
        preprocesada: usandoPreprocesada,
        requestId
      });

      emit(EVENTS.OCR_COMPLETADO, {
        filePath, texto, confianza, language,
        requestId, notificar, _pipeline,
        _optimizado, _optimizacionIntento,
        _meta: {
          tiempoMs: elapsed,
          backend: 'tesseract',
          preprocesada: usandoPreprocesada
        }
      });

      return { success: true, texto, confianza };

    } catch (error) {
      logger.error('ocr-tesseract.error', {
        error: error.message, filePath, requestId
      });

      emit(EVENTS.OCR_ERROR, {
        filePath, error: error.message,
        requestId, notificar, _pipeline
      });

      return { success: false, error: error.message };
    }
  }
};
