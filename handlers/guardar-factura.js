/**
 * Handler: Guardar factura procesada
 *
 * Escucha factura.procesada y:
 * 1. Mueve imagen de origen → storage/procesadas/
 * 2. Guarda JSON con datos estructurados en storage/procesadas/
 * 3. (El texto OCR ya se guardó en storage/ocr/ por otro handler)
 *
 * ENTRADA (evento): factura.procesada
 * SALIDA (evento): factura.guardada
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'guardar-factura',
  description: 'Guarda factura procesada en storage',
  trigger: 'factura.procesada',

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { filePath, datos, datosRaw, requestId, notificar, _meta } = data;

    logger.info('guardar-factura.inicio', { filePath, requestId });

    try {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Archivo origen no encontrado: ${filePath}`);
      }

      // Determinar directorio de storage
      // Detectar proyecto desde la ruta del archivo o usar config
      let storageBase = config?.storage?.base;

      if (!storageBase) {
        // Intentar detectar desde la ruta del archivo
        // Si viene de data/bots/{botName}/received/ → usar data/projects/{projectId}/storage/
        const match = filePath.match(/data\/bots\/([^/]+)\/received/);
        if (match) {
          const botName = match[1];
          // Mapear bot a proyecto (por convención: facturas_xxx_bot → facturas-xxx)
          const projectId = botName.replace(/_bot$/, '').replace(/_/g, '-');
          storageBase = path.join(process.cwd(), 'data/projects', projectId, 'storage');
        } else {
          storageBase = path.join(process.cwd(), 'data/projects/facturas-nonina/storage');
        }
      }

      const dirProcesadas = path.join(storageBase, 'procesadas');
      const dirOcr = path.join(storageBase, 'ocr');

      // Crear directorios si no existen
      fs.mkdirSync(dirProcesadas, { recursive: true });
      fs.mkdirSync(dirOcr, { recursive: true });

      // Nombre base del archivo
      const nombreOriginal = path.basename(filePath);
      const nombreBase = path.basename(filePath, path.extname(filePath));
      const extension = path.extname(filePath);

      // Generar nombre único con timestamp
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const nombreFinal = `${timestamp}_${nombreBase}`;

      // 1. Mover imagen a procesadas
      const destImagen = path.join(dirProcesadas, `${nombreFinal}${extension}`);
      fs.copyFileSync(filePath, destImagen);
      fs.unlinkSync(filePath); // Eliminar original

      logger.info('guardar-factura.imagen-movida', {
        origen: filePath,
        destino: destImagen
      });

      // 2. Guardar JSON con datos estructurados
      const destJson = path.join(dirProcesadas, `${nombreFinal}.json`);
      const jsonContent = {
        archivo_original: nombreOriginal,
        archivo_procesado: `${nombreFinal}${extension}`,
        fecha_procesado: new Date().toISOString(),
        requestId,
        datos,
        datosRaw,
        _meta
      };
      fs.writeFileSync(destJson, JSON.stringify(jsonContent, null, 2));

      logger.info('guardar-factura.json-guardado', { destino: destJson });

      // Emitir evento de guardado completado
      emit('factura.guardada', {
        requestId,
        filePath: destImagen,
        jsonPath: destJson,
        datos,
        notificar
      });

      logger.info('guardar-factura.completado', {
        imagen: destImagen,
        json: destJson,
        requestId
      });

      return {
        success: true,
        imagen: destImagen,
        json: destJson
      };

    } catch (error) {
      logger.error('guardar-factura.error', {
        error: error.message,
        filePath,
        requestId
      });

      emit('factura.guardar.error', {
        error: error.message,
        filePath,
        requestId,
        notificar
      });

      return { success: false, error: error.message };
    }
  }
};
