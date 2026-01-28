/**
 * Handler: Guardar texto OCR crudo
 *
 * Escucha documento.ocr.completado y guarda el texto
 * extraído en storage/ocr/
 *
 * ENTRADA (evento): documento.ocr.completado
 * SALIDA: Archivo .txt en storage/ocr/
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'guardar-ocr',
  description: 'Guarda texto OCR crudo en storage/ocr/',
  trigger: 'documento.ocr.completado',

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { filePath, texto, confianza, requestId } = data;

    // Solo guardar si hay texto
    if (!texto || texto.trim().length === 0) {
      logger.warn('guardar-ocr.sin-texto', { filePath, requestId });
      return { success: false, reason: 'Sin texto' };
    }

    try {
      // Determinar directorio de storage
      // Detectar proyecto desde la ruta del archivo o usar config
      let storageBase = config?.storage?.base;

      if (!storageBase) {
        // Intentar detectar desde la ruta del archivo
        const match = filePath.match(/data\/bots\/([^/]+)\/received/);
        if (match) {
          const botName = match[1];
          const projectId = botName.replace(/_bot$/, '').replace(/_/g, '-');
          storageBase = path.join(process.cwd(), 'data/projects', projectId, 'storage');
        } else {
          storageBase = path.join(process.cwd(), 'data/projects/facturas-nonina/storage');
        }
      }

      const dirOcr = path.join(storageBase, 'ocr');

      // Crear directorio si no existe
      fs.mkdirSync(dirOcr, { recursive: true });

      // Nombre del archivo
      const nombreBase = path.basename(filePath, path.extname(filePath));
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const nombreFinal = `${timestamp}_${nombreBase}.txt`;

      const destino = path.join(dirOcr, nombreFinal);

      // Contenido con metadata
      const contenido = [
        `# OCR Extraído`,
        `# Archivo: ${path.basename(filePath)}`,
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
        destino,
        caracteres: texto.length,
        confianza,
        requestId
      });

      return { success: true, path: destino };

    } catch (error) {
      logger.error('guardar-ocr.error', {
        error: error.message,
        filePath,
        requestId
      });

      return { success: false, error: error.message };
    }
  }
};
