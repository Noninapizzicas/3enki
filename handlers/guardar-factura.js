/**
 * Handler Base: Guardar factura procesada
 *
 * Escucha factura.procesada y:
 * 1. Mueve imagen de origen → storage/procesadas/
 * 2. Guarda JSON con datos estructurados en storage/procesadas/
 *
 * ENTRADA (evento): factura.procesada
 * {
 *   filePath: string,
 *   datos: object,          // Datos normalizados
 *   datosRaw: object,       // Datos crudos del LLM
 *   requestId: string,
 *   notificar: object,
 *   _meta: object
 * }
 *
 * SALIDA (evento): factura.guardada
 * {
 *   requestId: string,
 *   filePath: string,       // Ruta de imagen movida
 *   jsonPath: string,       // Ruta del JSON guardado
 *   datos: object,
 *   notificar: object
 * }
 *
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const {
  resolveStoragePath, generateFileName, moveFile,
  sanitizeFileName, EVENTS
} = require('../lib/handler-utils');

module.exports = {
  name: 'guardar-factura',
  description: 'Guarda factura procesada en storage',
  trigger: EVENTS.FACTURA_PROCESADA,

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const { filePath, datos, datosRaw, requestId, notificar, _meta } = data;

    logger.info('guardar-factura.inicio', { filePath, requestId });

    try {
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Archivo origen no encontrado: ${filePath}`);
      }

      // Resolver directorio de storage (sin hardcodes)
      const dirProcesadas = resolveStoragePath({
        config, projectId, filePath,
        subdir: 'procesadas'
      });

      // Generar nombre descriptivo si hay datos de factura
      let nombreFinal;
      if (datos?.numero_factura || datos?.nombre_proveedor) {
        const num = sanitizeFileName(datos.numero_factura || 'SIN-NUM');
        const vendor = sanitizeFileName(datos.nombre_proveedor || '').substring(0, 20);
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        nombreFinal = `${dateStr}_${num}${vendor ? '_' + vendor : ''}`;
      } else {
        nombreFinal = generateFileName(filePath, '').replace(path.extname(filePath), '');
      }

      const extension = path.extname(filePath);

      // 1. Mover imagen a procesadas
      const destImagen = path.join(dirProcesadas, `${nombreFinal}${extension}`);
      moveFile(filePath, destImagen);

      logger.info('guardar-factura.imagen-movida', {
        origen: filePath, destino: destImagen
      });

      // 2. Guardar JSON con datos estructurados
      const destJson = path.join(dirProcesadas, `${nombreFinal}.json`);
      const jsonContent = {
        archivo_original: path.basename(filePath),
        archivo_procesado: `${nombreFinal}${extension}`,
        fecha_procesado: new Date().toISOString(),
        requestId,
        datos,
        datosRaw,
        _meta
      };
      fs.writeFileSync(destJson, JSON.stringify(jsonContent, null, 2));

      logger.info('guardar-factura.completado', {
        imagen: destImagen, json: destJson, requestId
      });

      emit(EVENTS.FACTURA_GUARDADA, {
        requestId,
        filePath: destImagen,
        jsonPath: destJson,
        datos,
        notificar
      });

      return { success: true, imagen: destImagen, json: destJson };

    } catch (error) {
      logger.error('guardar-factura.error', {
        error: error.message, filePath, requestId
      });

      emit('factura.guardar.error', {
        error: error.message, filePath, requestId, notificar
      });

      return { success: false, error: error.message };
    }
  }
};
