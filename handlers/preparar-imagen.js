/**
 * Handler: Preparar imagen para OCR
 *
 * Preprocesa imágenes antes del OCR para mejorar resultados:
 * - Escala de grises
 * - Normalización de contraste
 * - Aumento de nitidez
 * - Binarización opcional
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
 * @version 1.0.0
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
      // Opciones por defecto optimizadas para facturas/documentos
      const defaultOptions = {
        grayscale: true,      // Blanco y negro
        normalize: true,      // Mejora contraste automático
        sharpen: true,        // Aumenta nitidez
        threshold: null,      // Sin binarización por defecto (puede perder info)
        denoise: false        // Sin reducción de ruido por defecto
      };

      const processOptions = { ...defaultOptions, ...options };

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
        _pipeline
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
