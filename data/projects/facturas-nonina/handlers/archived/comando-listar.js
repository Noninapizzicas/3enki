/**
 * Handler Proyecto: /listar
 *
 * Muestra archivos pendientes en las bandejas de entrada del proyecto.
 * Primer paso del flujo manual: listar → ocr → ia → validar → guardar
 *
 * @version 1.0.0
 */

const path = require('path');
const {
  EVENTS, findFiles, EXTENSIONES_DOCUMENTO
} = require('../../../../lib/handler-utils');

module.exports = {
  name: 'comando-listar',
  description: 'Lista archivos pendientes en inbox',
  trigger: EVENTS.BOT_COMMAND,

  filter: (event) => {
    const data = event.data || event;
    return data.command === 'listar';
  },

  async handle(event, { logger, emit, config, projectId }) {
    const data = event.data || event;
    const chatId = data.chatId;
    const cfg = config.config || {};
    const botName = cfg.telegram?.botName || data.botName;
    const storage = cfg.storage || {};

    logger.info('comando-listar.ejecutando', { chatId, projectId });

    // Recopilar carpetas inbox
    const inboxDirs = [];
    if (storage.inbox) {
      if (storage.inbox.telegram) inboxDirs.push({ label: 'Telegram', dir: storage.inbox.telegram });
      if (storage.inbox.gmail) inboxDirs.push({ label: 'Gmail', dir: storage.inbox.gmail });
    }
    if (inboxDirs.length === 0 && botName) {
      inboxDirs.push({ label: 'Bot', dir: path.join('data/bots', botName, 'received') });
    }

    let mensaje = 'Archivos pendientes:\n\n';
    let totalArchivos = 0;

    for (const { label, dir } of inboxDirs) {
      const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
      const archivos = findFiles(absDir, EXTENSIONES_DOCUMENTO);

      if (archivos.length > 0) {
        mensaje += `[${label}] (${archivos.length}):\n`;
        archivos.forEach((f, i) => {
          mensaje += `  ${i + 1}. ${f.name}\n`;
        });
        mensaje += '\n';
        totalArchivos += archivos.length;
      }
    }

    if (totalArchivos === 0) {
      mensaje = 'No hay archivos pendientes en ninguna bandeja.';
    } else {
      mensaje += `Total: ${totalArchivos} archivo(s)\n\nSiguiente paso: /ocr`;
    }

    emit(EVENTS.TELEGRAM_SEND_MESSAGE, { botName, chatId, text: mensaje });
    return { success: true, total: totalArchivos };
  }
};
