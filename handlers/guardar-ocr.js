/**
 * Handler Base: Guardar texto OCR
 *
 * Escucha documento.ocr.completado y guarda el texto extraído
 * en storage/ocr/ del proyecto correspondiente.
 *
 * ENTRADA (evento): documento.ocr.completado
 * {
 *   filePath: string,
 *   texto: string,
 *   confianza: number,
 *   requestId: string
 * }
 *
 * SALIDA: Archivo .txt en storage/ocr/
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const { resolveStoragePath, generateFileName } = require('../lib/handler-utils');

module.exports = {
  name: 'guardar-ocr',
  description: 'Guarda texto OCR crudo en storage/ocr/',
  trigger: 'documento.ocr.completado',

  async handle(event, { logger, config, projectId }) {
    const data = event.data || event;
    const { filePath, texto, confianza, requestId } = data;

    if (!texto || texto.trim().length === 0) {
      logger.warn('guardar-ocr.sin-texto', { filePath, requestId });
      return { success: false, reason: 'Sin texto' };
    }

    try {
      // Resolver directorio de storage (sin hardcodes)
      const dirOcr = resolveStoragePath({
        config, projectId, filePath,
        subdir: 'ocr'
      });

      const nombreFinal = generateFileName(filePath, '', '.txt');
      const destino = path.join(dirOcr, nombreFinal);

      // Contenido con metadata
      const contenido = [
        `# OCR Extraído`,
        `# Archivo: ${path.basename(filePath || 'desconocido')}`,
        `# Fecha: ${new Date().toISOString()}`,
        `# Confianza: ${confianza?.toFixed(1) || 'N/A'}%`,
        `# RequestId: ${requestId || 'N/A'}`,
        ``,
        `---`,
        ``,
        texto
      ].join('\n');

      fs.writeFileSync(destino, contenido);

      logger.info('guardar-ocr.completado', {
        destino, caracteres: texto.length, confianza, requestId
      });

      return { success: true, path: destino };

    } catch (error) {
      logger.error('guardar-ocr.error', {
        error: error.message, filePath, requestId
      });

      return { success: false, error: error.message };
    }
  }
};
