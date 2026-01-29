/**
 * Handler: Preparar imagen para OCR
 *
 * Preprocesa TODAS las imágenes antes del OCR con opciones agresivas:
 * - Escala de grises
 * - Normalización de contraste
 * - Aumento de nitidez
 * - Binarización (threshold)
 *
 * GUARDA la imagen procesada en storage/preprocesadas/ para debug.
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
 *   imagenProcesadaPath: string, // Ruta donde se guardó
 *   requestId: string,
 *   notificar: object
 * }
 *
 * @version 2.1.0
 */

const fs = require('fs');
const path = require('path');

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

      // Determinar ruta de guardado para debug
      // Si viene de bots: data/bots/{bot}/received/ → data/projects/{project}/storage/preprocesadas/
      let outputDir;
      const match = filePath.match(/data\/bots\/([^/]+)\/received/);
      if (match) {
        const botName = match[1];
        const projectId = botName.replace(/_bot$/, '').replace(/_/g, '-');
        outputDir = path.join(process.cwd(), 'data/projects', projectId, 'storage/preprocesadas');
      } else {
        outputDir = path.join(process.cwd(), 'data/storage/preprocesadas');
      }

      // Crear directorio si no existe
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Nombre del archivo procesado
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
      const nombreBase = path.basename(filePath, path.extname(filePath));
      const outputPath = path.join(outputDir, `${timestamp}_${nombreBase}_prep.png`);

      // Llamar al provider local.sharp con output para guardar
      const result = await services.call('local.sharp', 'prepare-ocr', {
        image: filePath,
        options: processOptions,
        output: outputPath  // Guardar imagen procesada
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Error procesando imagen');
      }

      // Leer la imagen guardada para obtener base64
      const imagenBase64 = fs.readFileSync(outputPath).toString('base64');

      logger.info('preparar-imagen.completado', {
        filePath,
        outputPath,
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
        imagenProcesada: imagenBase64,
        imagenProcesadaPath: outputPath,  // Ruta donde se guardó
        width: result.data.width,
        height: result.data.height,
        requestId,
        notificar,
        _pipeline,
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
        imagenProcesadaPath: null,
        requestId,
        notificar,
        _pipeline,
        _preprocesadoFallido: true
      });

      return { success: false, error: error.message };
    }
  }
};
