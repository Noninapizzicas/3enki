/**
 * Handler Proyecto: /guardar
 *
 * Paso manual 5 (final): Archiva la factura validada.
 * - Mueve imagen original a storage/procesadas/
 * - Guarda JSON con datos estructurados junto a la imagen
 * - Limpia archivos intermedios (ocr/, ia/)
 *
 * Flujo: /listar → /ocr → /ia → /validar → [/guardar]
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const {
  EVENTS, resolveStoragePath, sanitizeFileName, moveFile
} = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-guardar',
  description: 'Archiva factura validada (paso manual final)',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'guardar';
  },

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;

    logger.info('comando-guardar.ejecutando', { chatId, projectId });

    // 1. Leer ultimo resultado IA (tiene los datos + filePath)
    const iaDir = resolveStoragePath({
      config: cfg, projectId, subdir: 'ia'
    });

    let iaFiles;
    try {
      iaFiles = fs.readdirSync(iaDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
    } catch (e) {
      iaFiles = [];
    }

    if (iaFiles.length === 0) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: 'No hay datos para guardar. Ejecuta /ocr + /ia primero.'
      });
      return { success: false };
    }

    const iaData = JSON.parse(
      fs.readFileSync(path.join(iaDir, iaFiles[0]), 'utf-8')
    );
    const datos = iaData.datos;
    const filePath = iaData.filePath;

    if (!filePath || !fs.existsSync(filePath)) {
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `Archivo original no encontrado: ${filePath || 'desconocido'}`
      });
      return { success: false, error: 'Archivo no encontrado' };
    }

    try {
      // 2. Determinar nombre descriptivo
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const num = sanitizeFileName(datos?.factura?.numero || 'SIN-NUM');
      const vendor = sanitizeFileName(datos?.emisor?.nombre || '').substring(0, 20);
      const nombreBase = `${dateStr}_${num}${vendor ? '_' + vendor : ''}`;
      const extension = path.extname(filePath);

      // 3. Mover imagen a procesadas
      const dirProcesadas = resolveStoragePath({
        config: cfg, projectId, subdir: 'procesadas'
      });

      const destImagen = path.join(dirProcesadas, `${nombreBase}${extension}`);
      moveFile(filePath, destImagen);

      logger.info('comando-guardar.imagen-movida', {
        origen: filePath, destino: destImagen
      });

      // 4. Guardar JSON con datos completos
      const destJson = path.join(dirProcesadas, `${nombreBase}.json`);
      const jsonContent = {
        archivo_original: iaData.fileName,
        archivo_procesado: `${nombreBase}${extension}`,
        fecha_procesado: new Date().toISOString(),
        requestId: iaData.requestId,
        datos,
        ia: {
          provider: iaData.provider,
          tokens: iaData.tokens,
          tiempoMs: iaData.tiempoMs
        }
      };
      fs.writeFileSync(destJson, JSON.stringify(jsonContent, null, 2));

      // 5. Limpiar intermedios
      const iaFile = path.join(iaDir, iaFiles[0]);
      try { fs.unlinkSync(iaFile); } catch (e) { /* ok */ }

      const ocrDir = resolveStoragePath({
        config: cfg, projectId, subdir: 'ocr'
      });
      try {
        const ocrFile = path.join(ocrDir, `${iaData.requestId}.json`);
        if (fs.existsSync(ocrFile)) fs.unlinkSync(ocrFile);
      } catch (e) { /* ok */ }

      // 6. Notificar
      const resumen = [
        `Factura guardada: ${nombreBase}`,
        '',
        `Emisor: ${datos?.emisor?.nombre || '?'}`,
        `N. factura: ${datos?.factura?.numero || '?'}`,
        `Total: ${datos?.totales?.total ?? '?'}`,
        '',
        `Imagen: ${path.basename(destImagen)}`,
        `JSON: ${path.basename(destJson)}`,
        '',
        'Usa /listar para ver si quedan mas archivos.'
      ];

      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: resumen.join('\n')
      });

      logger.info('comando-guardar.completado', {
        imagen: destImagen, json: destJson, requestId: iaData.requestId
      });

      return { success: true, imagen: destImagen, json: destJson };

    } catch (error) {
      logger.error('comando-guardar.error', { error: error.message });
      emit(EVENTS.TELEGRAM_SEND_MESSAGE, {
        botName, chatId,
        text: `Error guardando: ${error.message}`
      });
      return { success: false, error: error.message };
    }
  }
};
