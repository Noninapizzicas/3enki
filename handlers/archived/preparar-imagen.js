/**
 * Handler Base: Preparar imagen para OCR
 *
 * Preprocesa imágenes antes del OCR usando el provider local.sharp:
 * - Escala de grises (elimina colores que confunden al OCR)
 * - Normalización de contraste
 * - Aumento de nitidez
 *
 * Guarda copia en storage/preprocesadas/ para debug.
 *
 * ENTRADA (evento): imagen.preparar.request
 * {
 *   filePath: string,       // Ruta de la imagen
 *   options: object,        // Opciones de procesamiento (opcional)
 *   requestId: string,
 *   notificar: object,
 *   _pipeline: string       // Tag de pipeline (opcional)
 * }
 *
 * SALIDA (evento): imagen.preparada
 * {
 *   filePath: string,       // Ruta imagen original
 *   imagenProcesada: string, // Base64 de imagen procesada (null si falló)
 *   imagenProcesadaPath: string,
 *   requestId: string,
 *   notificar: object,
 *   _pipeline: string,
 *   _preprocesado: object   // Metadata del preprocesado
 * }
 *
 * Providers usados: local.sharp (prepare-ocr)
 *
 * @version 3.0.0
 */

const fs = require('fs');
const path = require('path');
const { resolveStoragePath, generateFileName, EVENTS } = require('../lib/handler-utils');

// Opciones por defecto (suaves - threshold destruye texto en fotos reales)
const DEFAULT_OPTIONS = {
  grayscale: true,
  normalize: true,
  sharpen: true,
  threshold: null,
  denoise: false
};

module.exports = {
  name: 'preparar-imagen',
  description: 'Preprocesa imagen para mejorar OCR usando Sharp',
  trigger: EVENTS.IMAGEN_PREPARAR,

  async handle(event, { logger, emit, services, config, projectId }) {
    const data = event.data || event;
    const { filePath, options = {}, requestId, notificar, _pipeline } = data;

    logger.info('preparar-imagen.inicio', { filePath, requestId });

    try {
      const processOptions = { ...DEFAULT_OPTIONS, ...options };

      // Resolver directorio de storage para guardar debug
      const outputDir = resolveStoragePath({
        config, projectId, filePath,
        subdir: 'preprocesadas'
      });

      const outputName = generateFileName(filePath, '_prep', '.png');
      const outputPath = path.join(outputDir, outputName);

      logger.info('preparar-imagen.opciones', {
        filePath, opciones: processOptions, requestId
      });

      // Llamar al provider local.sharp
      const result = await services.call('local.sharp', 'prepare-ocr', {
        image: filePath,
        options: processOptions,
        output: outputPath
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Error procesando imagen');
      }

      // Leer imagen procesada como base64
      const imagenBase64 = fs.readFileSync(outputPath).toString('base64');

      logger.info('preparar-imagen.completado', {
        filePath, outputPath, requestId,
        width: result.data.width,
        height: result.data.height,
        reduccion: `${Math.round((1 - result.data.processedSize / result.data.originalSize) * 100)}%`
      });

      emit(EVENTS.IMAGEN_PREPARADA, {
        filePath,
        imagenProcesada: imagenBase64,
        imagenProcesadaPath: outputPath,
        width: result.data.width,
        height: result.data.height,
        requestId, notificar, _pipeline,
        _preprocesado: {
          opciones: processOptions,
          outputPath,
          originalSize: result.data.originalSize,
          processedSize: result.data.processedSize
        }
      });

      return { success: true, outputPath };

    } catch (error) {
      logger.error('preparar-imagen.error', {
        error: error.message, filePath, requestId
      });

      // Fallback: continuar con imagen original sin bloquear el pipeline
      logger.warn('preparar-imagen.fallback', {
        mensaje: 'Usando imagen original sin preprocesar', filePath
      });

      emit(EVENTS.IMAGEN_PREPARADA, {
        filePath,
        imagenProcesada: null,
        imagenProcesadaPath: null,
        requestId, notificar, _pipeline,
        _preprocesadoFallido: true
      });

      return { success: false, error: error.message };
    }
  }
};
