/**
 * Handler: Convertir PDFs a Imágenes
 *
 * Escucha: pdf.batch.convert
 * Convierte todos los PDFs de un directorio a imágenes PNG
 *
 * Payload:
 * {
 *   sourceDir: 'data/gmail/noninapizzicas',      // Directorio con PDFs
 *   outputDir: 'data/gmail/noninapizzicas-images' // Directorio destino (opcional, genera automático)
 *   scale: 2.0                                    // Escala (opcional, default 2.0)
 * }
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'convertir-pdf-a-imagen',
  description: 'Convierte PDFs de un directorio a imágenes PNG',
  trigger: 'pdf.batch.convert',

  async handle(event, { emit, logger }) {
    const data = event.data || event;
    // scale 4.0 ≈ 288 DPI (72 base × 4), óptimo para OCR
    const { sourceDir, outputDir, scale = 4.0 } = data;

    if (!sourceDir) {
      logger.error('convertir-pdf.sin-directorio');
      return { success: false, error: 'sourceDir requerido' };
    }

    // Resolver rutas
    const srcPath = sourceDir.startsWith('./') ? sourceDir : `./${sourceDir}`;
    const outPath = outputDir
      ? (outputDir.startsWith('./') ? outputDir : `./${outputDir}`)
      : `${srcPath}-images`;

    // Verificar directorio origen
    if (!fs.existsSync(srcPath)) {
      logger.error('convertir-pdf.directorio-no-existe', { srcPath });
      return { success: false, error: `Directorio no existe: ${srcPath}` };
    }

    // Crear directorio destino
    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
      logger.info('convertir-pdf.directorio-creado', { outPath });
    }

    // Listar PDFs
    const files = fs.readdirSync(srcPath).filter(f =>
      f.toLowerCase().endsWith('.pdf')
    );

    if (files.length === 0) {
      logger.info('convertir-pdf.sin-pdfs', { srcPath });
      return { success: true, processed: 0, message: 'No hay PDFs' };
    }

    logger.info('convertir-pdf.iniciando', {
      srcPath,
      outPath,
      totalPdfs: files.length
    });

    let processed = 0;
    let errors = [];

    // Procesar cada PDF
    for (const file of files) {
      const pdfPath = path.join(srcPath, file);
      const baseName = path.basename(file, '.pdf').replace(/[^a-zA-Z0-9_-]/g, '_');
      const pdfOutputDir = path.join(outPath, baseName);

      logger.info('convertir-pdf.procesando', { file, pdfOutputDir });

      // Emitir request al provider
      emit('local.pdf-to-png.convert.request', {
        pdf: pdfPath,
        scale,
        outputFolder: pdfOutputDir
      });

      processed++;
    }

    logger.info('convertir-pdf.completado', {
      processed,
      errors: errors.length
    });

    return {
      success: true,
      processed,
      outputDir: outPath,
      errors: errors.length > 0 ? errors : undefined
    };
  }
};
