/**
 * Handler: Guardar Archivo
 *
 * Escucha: bot.file.stored (cuando bot-manager guarda un archivo)
 * Emite: archivo.guardado
 *
 * Copia archivos del bot a storage/facturas/originales/
 */
const path = require('path');

module.exports = {
  name: 'guardar-archivo',
  description: 'Guarda archivos recibidos del bot en storage del proyecto',
  trigger: 'bot.file.stored',

  // Solo procesar archivos del bot de facturas
  filter: (event) => {
    const botPermitido = 'facturas_asesoria_bot';
    return event.botName === botPermitido;
  },

  async handle(event, { services, logger, projectId, emit, store }) {
    const { botName, chatId, userId, file, timestamp } = event;
    const { path: rutaOrigen, originalName, mimeType, size } = file;

    logger.info('guardar-archivo.iniciando', {
      botName,
      archivo: originalName,
      mimeType,
      size
    });

    try {
      // 1. Generar nombre con fecha
      const ahora = new Date();
      const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
      const hora = ahora.toISOString().slice(11, 19).replace(/:/g, '');
      const extension = path.extname(originalName);
      const nombreBase = path.basename(originalName, extension);
      const nuevoNombre = `${fecha}-${hora}_${nombreBase}${extension}`;

      // 2. Ruta destino
      const rutaDestino = `./data/projects/${projectId}/storage/facturas/originales/${nuevoNombre}`;

      // 3. Leer archivo origen
      const contenido = await services.call('fs', 'read', {
        path: rutaOrigen,
        encoding: 'base64'
      });

      if (!contenido.success) {
        throw new Error(`No se pudo leer el archivo origen: ${contenido.error}`);
      }

      // 4. Escribir en destino
      const guardado = await services.call('fs', 'write', {
        path: rutaDestino,
        content: contenido.content,
        encoding: 'base64'
      });

      if (!guardado.success) {
        throw new Error(`No se pudo guardar el archivo: ${guardado.error}`);
      }

      // 5. Actualizar contador
      const total = await store.increment('archivos_guardados');

      logger.info('guardar-archivo.completado', {
        archivo: nuevoNombre,
        destino: rutaDestino,
        total
      });

      // 6. Confirmar por Telegram
      await services.call('telegram', 'send_message', {
        botName,
        chatId,
        text: `✅ Guardado: ${originalName}\n📁 Total recibidos: ${total}`
      });

      // 7. Emitir evento para siguiente handler
      emit('archivo.guardado', {
        archivo: {
          nombre: nuevoNombre,
          nombreOriginal: originalName,
          ruta: rutaDestino,
          mimeType,
          size
        },
        origen: {
          bot: botName,
          chatId,
          userId,
          timestamp
        }
      });

      return { success: true, archivo: nuevoNombre, total };

    } catch (error) {
      logger.error('guardar-archivo.error', {
        archivo: originalName,
        error: error.message
      });

      // Notificar error por Telegram
      await services.call('telegram', 'send_message', {
        botName,
        chatId,
        text: `❌ Error al guardar: ${originalName}\n${error.message}`
      });

      throw error;
    }
  }
};
