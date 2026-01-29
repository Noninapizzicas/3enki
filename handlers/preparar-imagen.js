/**
 * Handler: Preparar imagen para OCR
 *
 * Preprocesa TODAS las imágenes antes del OCR con opciones agresivas:
 * - Escala de grises
 * - Normalización de contraste
 * - Aumento de nitidez
 * - Binarización (threshold)
 *
 * ENTRADA (evento): imagen.preparar.request
 * {
 *   filePath: string,       // Ruta de la imagen
 *   options: object,        // Opciones de procesamiento (opcional)
 *   requestId: string,
 *   notificar: object
 * }
 *
 * SALIDA (evento): imagen.preparada
 * {
 *   filePath: string,       // Ruta imagen original
 *   imagenProcesada: string,// Base64 de imagen procesada
 *   requestId: string,
 *   notificar: object
 * }
 *
 * @version 2.0.0
 */

module.exports = {
  name: 'preparar-imagen',
  description: 'Preprocesa imagen para mejorar OCR usando Sharp',
  trigger: 'imagen.preparar.request',

  async handle(event, { logger, emit, services }) {
    const data = event.data || event;
    const {
      filePath,
      options = {},
      requestId,
      notificar,
      _pipeline
    } = data;

    logger.info('preparar-imagen.inicio', { filePath, requestId });

    try {
      // Opciones AGRESIVAS por defecto - optimizadas para fotos de facturas
      const defaultOptions = {
        grayscale: true,      // Blanco y negro (elimina colores que confunden)
        normalize: true,      // Mejora contraste automático
        sharpen: true,        // Aumenta nitidez de texto
        threshold: 140,       // Binarización agresiva (separa texto de fondo)
        denoise: false        // No reducir ruido (puede borrar texto fino)
      };

      const processOptions = { ...defaultOptions, ...options };

      logger.info('preparar-imagen.opciones', {
        filePath,
        opciones: processOptions,
        requestId
      });

      // Llamar al provider local.sharp
      const result = await services.call('local.sharp', 'prepare-ocr', {
        image: filePath,
        options: processOptions
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Error procesando imagen');
      }

      logger.info('preparar-imagen.completado', {
        filePath,
        requestId,
        width: result.data.width,
        height: result.data.height,
        originalSize: result.data.originalSize,
        processedSize: result.data.processedSize,
        reduccion: `${Math.round((1 - result.data.processedSize / result.data.originalSize) * 100)}%`
      });

      // Emitir imagen preparada
      emit('imagen.preparada', {
        filePath,
        imagenProcesada: result.data.image, // Base64
        width: result.data.width,
        height: result.data.height,
        requestId,
        notificar,
        _pipeline,
        _preprocesado: {
          opciones: processOptions,
          originalSize: result.data.originalSize,
          processedSize: result.data.processedSize
        }
      });

      return { success: true };

    } catch (error) {
      logger.error('preparar-imagen.error', {
        error: error.message,
        filePath,
        requestId
      });

      // Si falla el preprocesamiento, continuar con imagen original
      logger.warn('preparar-imagen.fallback', {
        mensaje: 'Usando imagen original sin preprocesar',
        filePath
      });

      emit('imagen.preparada', {
        filePath,
        imagenProcesada: null, // null = usar original
        requestId,
        notificar,
        _pipeline,
        _preprocesadoFallido: true
      });

      return { success: false, error: error.message };
    }
  }
};
