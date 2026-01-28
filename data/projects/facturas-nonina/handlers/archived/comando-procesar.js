/**
 * Handler Proyecto: Comando /procesarnoninapizzicas
 *
 * Escucha: bot.command.received
 * Emite: factura.procesar.request (por cada archivo)
 *
 * Disparador MANUAL para procesar facturas con Document AI.
 * Busca archivos en:
 *   - storage.inbox.telegram (archivos del bot)
 *   - storage.inbox.gmail (adjuntos de Gmail)
 *
 * Usa configuración del proyecto (config.json).
 */

const fs = require('fs');
const path = require('path');

// Extensiones válidas para facturas
const VALID_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];

module.exports = {
  name: 'comando-procesar',
  description: 'Comando /procesarnoninapizzicas - Procesa facturas con Document AI',
  trigger: 'bot.command.received',

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'procesarnoninapizzicas';
  },

  async handle(event, { logger, emit, config }) {
    const data = event.data || event;
    const { chatId } = data;

    // Leer config del proyecto (config.config porque el archivo es config/config.json)
    const cfg = config.config || {};
    const telegram = cfg.telegram || {};
    const storage = cfg.storage || {};
    const inboxTelegram = storage.inbox?.telegram;
    const inboxGmail = storage.inbox?.gmail;

    logger.info('comando-procesar.ejecutando', { chatId });

    // Notificar inicio
    emit('telegram.send_message.request', {
      botName: telegram.botName,
      chatId,
      text: '🔄 Buscando facturas pendientes...'
    });

    // Buscar archivos en ambas ubicaciones
    const archivos = [];

    // 1. Archivos del bot Telegram
    if (inboxTelegram && fs.existsSync(inboxTelegram)) {
      const telegramFiles = findFiles(inboxTelegram);
      archivos.push(...telegramFiles.map(f => ({ ...f, source: 'telegram' })));
    }

    // 2. Archivos de Gmail
    if (inboxGmail && fs.existsSync(inboxGmail)) {
      const gmailFiles = findFiles(inboxGmail);
      archivos.push(...gmailFiles.map(f => ({ ...f, source: 'gmail' })));
    }

    if (archivos.length === 0) {
      emit('telegram.send_message.request', {
        botName: telegram.botName,
        chatId,
        text: '✅ No hay facturas pendientes de procesar.'
      });
      return { success: true, archivos: 0 };
    }

    // Notificar cantidad encontrada
    emit('telegram.send_message.request', {
      botName: telegram.botName,
      chatId,
      text: `📄 Encontradas ${archivos.length} facturas. Procesando con Document AI...`
    });

    // Emitir evento por cada archivo para procesar
    for (const archivo of archivos) {
      emit('factura.procesar.request', {
        filePath: archivo.path,
        fileName: archivo.name,
        source: archivo.source,
        // Datos para notificación
        notifyTelegram: true,
        botName: telegram.botName,
        chatId
      });
    }

    logger.info('comando-procesar.emitidos', {
      total: archivos.length,
      telegram: archivos.filter(a => a.source === 'telegram').length,
      gmail: archivos.filter(a => a.source === 'gmail').length
    });

    return { success: true, archivos: archivos.length };
  }
};

/**
 * Busca archivos válidos en un directorio (recursivo)
 */
function findFiles(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        findFiles(fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VALID_EXTENSIONS.includes(ext)) {
          files.push({
            path: fullPath,
            name: entry.name
          });
        }
      }
    }
  } catch (err) {
    // Ignorar errores de lectura
  }

  return files;
}
