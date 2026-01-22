/**
 * Handler: Recibir Documento
 *
 * Cuando llega un archivo al bot de Telegram:
 * 1. Lo copia a storage/facturas/recibidas/
 * 2. Responde al usuario confirmando recepción
 * 3. Emite evento 'documento.recibido' para encadenar con procesamiento
 *
 * Ubicación: data/projects/facturas-nonina/handlers/
 * Credenciales: PROJECT_facturas-nonina
 */

const path = require('path');

module.exports = {
  name: 'recibir-documento',

  description: 'Recibe archivos del bot Telegram y los guarda en storage',

  trigger: 'bot.file.stored',

  // Solo procesar archivos del bot de este proyecto
  filter: (event) => {
    // Log para debug - ver qué botName llega
    console.log('[recibir-documento] filter - botName:', event?.botName);

    const botsProyecto = ['facturas_asesoria_bot'];
    return botsProyecto.includes(event?.botName);
  },

  async handle(event, { services, logger, projectId, emit, config, store }) {
    // Validar evento
    if (!event || !event.file) {
      logger.error('recibir-documento.evento-invalido', { event });
      return { success: false, error: 'Evento sin datos de archivo' };
    }

    const { botName, chatId, userId, file, timestamp } = event;

    logger.info('recibir-documento.inicio', {
      botName,
      archivo: file?.originalName || 'sin-nombre',
      tipo: file?.mimeType,
      tamaño: file?.size,
      path: file?.path,
      chatId
    });

    try {
      // 1. Leer configuración del proyecto
      const projectConfig = config?.project ?? {};
      const botConfig = projectConfig.bots?.[botName] ?? {};

      // 2. Preparar ruta destino
      const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const hora = new Date().toISOString().split('T')[1].slice(0, 8).replace(/:/g, '');
      const nombreArchivo = file?.originalName || `archivo_${Date.now()}`;
      const nombreDestino = `${fecha}-${hora}_${nombreArchivo}`;

      // Ruta base del proyecto
      const storageBase = `./data/projects/${projectId}/storage/facturas/recibidas`;
      const rutaDestino = path.join(storageBase, nombreDestino);

      logger.info('recibir-documento.rutas', {
        origen: file?.path,
        destino: rutaDestino
      });

      // 3. Crear directorio si no existe
      await services.call('fs', 'mkdir', { path: storageBase });

      // 4. Copiar archivo desde ubicación del bot
      const contenido = await services.call('fs', 'read', {
        path: file.path,
        encoding: 'base64'
      });

      if (!contenido?.success) {
        throw new Error(`No se pudo leer archivo origen: ${contenido?.error || 'respuesta vacía'}`);
      }

      // 5. Escribir en storage del proyecto
      const guardado = await services.call('fs', 'write', {
        path: rutaDestino,
        content: contenido.content,
        encoding: 'base64'
      });

      if (!guardado?.success) {
        throw new Error(`No se pudo guardar archivo: ${guardado?.error || 'respuesta vacía'}`);
      }

      // 6. Actualizar contadores
      const totalRecibidos = await store.increment('total_recibidos');
      const hoy = new Date().toISOString().split('T')[0];
      await store.increment(`dia:${hoy}`);

      await store.set('ultimo_archivo', {
        nombre: nombreArchivo,
        ruta: rutaDestino,
        timestamp: Date.now(),
        chatId
      });

      // 7. Responder al usuario por Telegram
      const mensajeConfig = botConfig.mensajes?.recibido ?? '✅ Archivo recibido: {nombre}';
      const mensaje = mensajeConfig
        .replace('{nombre}', nombreArchivo)
        .replace('{total}', totalRecibidos);

      await services.call('telegram', 'send_message', {
        botName,
        chatId,
        text: mensaje
      });

      // 8. Emitir evento para siguiente handler (OCR, extracción, etc.)
      emit('documento.recibido', {
        archivo: {
          nombre: nombreArchivo,
          ruta: rutaDestino,
          mimeType: file?.mimeType,
          tamaño: file?.size
        },
        origen: {
          bot: botName,
          chatId,
          userId,
          timestamp
        },
        proyecto: projectId
      });

      logger.info('recibir-documento.completado', {
        archivo: nombreArchivo,
        destino: rutaDestino,
        totalRecibidos
      });

      return {
        success: true,
        archivo: rutaDestino,
        totalRecibidos
      };

    } catch (error) {
      logger.error('recibir-documento.error', {
        archivo: file?.originalName,
        error: error.message,
        stack: error.stack
      });

      // Intentar notificar error al usuario
      try {
        await services.call('telegram', 'send_message', {
          botName,
          chatId,
          text: `❌ Error procesando archivo: ${error.message}`
        });
      } catch (sendError) {
        logger.error('recibir-documento.error-notificacion', {
          error: sendError.message
        });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }
};
