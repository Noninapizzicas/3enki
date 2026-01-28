/**
 * Handler: Comando Telegram para procesar facturas
 *
 * Escucha comando de Telegram y procesa todos los archivos
 * del directorio de recibidos.
 *
 * Comando: /procesarfacturas
 *
 * ENTRADA (evento): bot.command.received
 * SALIDA (evento): factura.procesar.request (por cada archivo)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Extensiones válidas para facturas
const EXTENSIONES_VALIDAS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'];

module.exports = {
  name: 'comando-procesar-facturas',
  description: 'Comando /procesarfacturas - Procesa facturas del inbox',
  trigger: 'bot.command.received',

  // Filtrar solo el comando específico
  filter: (event) => {
    const data = event.data || event;
    const comando = data.command || '';
    return comando === 'procesarfacturas' || comando === '/procesarfacturas';
  },

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { chatId, botName, userId } = data;

    logger.info('comando-procesar-facturas.inicio', { chatId, botName, userId });

    // Directorio de facturas recibidas
    // Configurable via config o usa default
    const dirRecibidos = config?.facturas?.inbox ||
      path.join(process.cwd(), 'data/bots/facturas_noninapizzicas_bot/received');

    try {
      // Notificar inicio
      emit('telegram.send_message.request', {
        botName,
        chatId,
        text: '🔍 Buscando facturas pendientes...'
      });

      // Verificar si existe el directorio
      if (!fs.existsSync(dirRecibidos)) {
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: `❌ Directorio no encontrado: ${dirRecibidos}`
        });
        return { success: false, error: 'Directorio no existe' };
      }

      // Buscar archivos válidos
      const archivos = buscarArchivos(dirRecibidos);

      if (archivos.length === 0) {
        emit('telegram.send_message.request', {
          botName,
          chatId,
          text: '✅ No hay facturas pendientes de procesar.'
        });
        return { success: true, procesados: 0 };
      }

      // Notificar cantidad encontrada
      emit('telegram.send_message.request', {
        botName,
        chatId,
        text: `📄 Encontradas ${archivos.length} facturas. Procesando...`
      });

      // Procesar cada archivo
      let procesados = 0;
      for (const archivo of archivos) {
        const requestId = `fac-${Date.now()}-${procesados}`;

        logger.info('comando-procesar-facturas.procesando', {
          archivo: archivo.name,
          requestId
        });

        // Emitir evento para procesar
        emit('factura.procesar.request', {
          filePath: archivo.path,
          fileName: archivo.name,
          requestId,
          // Datos para notificación
          notificar: {
            telegram: true,
            botName,
            chatId
          }
        });

        procesados++;

        // Pequeña pausa entre archivos para no saturar
        await sleep(100);
      }

      logger.info('comando-procesar-facturas.emitidos', { total: procesados });

      emit('telegram.send_message.request', {
        botName,
        chatId,
        text: `🚀 Iniciado procesamiento de ${procesados} facturas.\nRecibirás notificación cuando termine cada una.`
      });

      return { success: true, procesados };

    } catch (error) {
      logger.error('comando-procesar-facturas.error', { error: error.message });

      emit('telegram.send_message.request', {
        botName,
        chatId,
        text: `❌ Error: ${error.message}`
      });

      return { success: false, error: error.message };
    }
  }
};

/**
 * Busca archivos válidos en un directorio (recursivo)
 */
function buscarArchivos(dir, archivos = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursivo
        buscarArchivos(fullPath, archivos);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (EXTENSIONES_VALIDAS.includes(ext)) {
          archivos.push({
            path: fullPath,
            name: entry.name,
            ext
          });
        }
      }
    }
  } catch (err) {
    // Ignorar errores de lectura
  }

  return archivos;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
