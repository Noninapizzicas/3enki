/**
 * Handler: Cola de Archivos Telegram
 *
 * Escucha TODOS los eventos de archivos de Telegram y los guarda
 * como "pendientes" en el store. NO descarga nada.
 *
 * Los archivos se procesan cuando un disparador emite
 * 'telegram.cola.procesar' (comando /procesar, scheduler, etc.)
 *
 * Store structure:
 * {
 *   pending: [
 *     { botName, fileId, chatId, fileName, mimeType, type, timestamp, ... }
 *   ]
 * }
 */

module.exports = [
  // ═══════════════════════════════════════════════════════════
  // HANDLERS DE ENTRADA - Guardan archivos como pendientes
  // ═══════════════════════════════════════════════════════════

  {
    name: 'cola-telegram-document',
    trigger: 'telegram.document.received',
    async handle(event, { store, logger }) {
      const data = event.data || event;
      await guardarPendiente(store, logger, data, 'document');
    }
  },

  {
    name: 'cola-telegram-photo',
    trigger: 'telegram.photo.received',
    async handle(event, { store, logger }) {
      const data = event.data || event;
      await guardarPendiente(store, logger, data, 'photo');
    }
  },

  {
    name: 'cola-telegram-video',
    trigger: 'telegram.video.received',
    async handle(event, { store, logger }) {
      const data = event.data || event;
      await guardarPendiente(store, logger, data, 'video');
    }
  },

  {
    name: 'cola-telegram-audio',
    trigger: 'telegram.audio.received',
    async handle(event, { store, logger }) {
      const data = event.data || event;
      await guardarPendiente(store, logger, data, 'audio');
    }
  },

  {
    name: 'cola-telegram-voice',
    trigger: 'telegram.voice.received',
    async handle(event, { store, logger }) {
      const data = event.data || event;
      await guardarPendiente(store, logger, data, 'voice');
    }
  },

  // ═══════════════════════════════════════════════════════════
  // HANDLER DE PROCESAMIENTO - Procesa la cola
  // ═══════════════════════════════════════════════════════════

  {
    name: 'cola-telegram-procesar',
    description: 'Procesa archivos pendientes de la cola',
    trigger: 'telegram.cola.procesar',

    async handle(event, { store, logger, emit }) {
      const data = event.data || event;
      const { botName, limit = 100 } = data;

      // Leer pendientes
      const pending = await store.get('pending') || [];

      if (pending.length === 0) {
        logger.info('cola-telegram.vacia', { botName });
        return { processed: 0, message: 'Cola vacía' };
      }

      // Filtrar por bot si se especifica
      let toProcess = botName
        ? pending.filter(p => p.botName === botName)
        : pending;

      // Aplicar límite
      toProcess = toProcess.slice(0, limit);

      logger.info('cola-telegram.procesando', {
        total: pending.length,
        toProcess: toProcess.length,
        botName: botName || 'todos'
      });

      // Procesar cada archivo
      for (const item of toProcess) {
        emit('telegram.file.download.request', {
          botName: item.botName,
          fileId: item.fileId,
          chatId: item.chatId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          fileSize: item.fileSize,
          notify: true,
          metadata: {
            type: item.type,
            from: item.from,
            caption: item.caption,
            queuedAt: item.timestamp
          }
        });
      }

      // Remover procesados de la cola
      const processedIds = new Set(toProcess.map(p => p.fileId));
      const remaining = pending.filter(p => !processedIds.has(p.fileId));
      await store.set('pending', remaining);

      logger.info('cola-telegram.completado', {
        processed: toProcess.length,
        remaining: remaining.length
      });

      return {
        processed: toProcess.length,
        remaining: remaining.length
      };
    }
  }
];

// ═══════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════

async function guardarPendiente(store, logger, data, type) {
  const {
    botName, fileId, chatId, messageId, from,
    fileName, mimeType, fileSize, caption,
    // Datos específicos por tipo
    width, height, duration, title, performer
  } = data;

  const pending = await store.get('pending') || [];

  // Evitar duplicados
  if (pending.some(p => p.fileId === fileId)) {
    logger.debug('cola-telegram.duplicado', { fileId });
    return;
  }

  const item = {
    botName,
    fileId,
    chatId,
    messageId,
    from,
    fileName,
    mimeType,
    fileSize,
    caption,
    type,
    timestamp: new Date().toISOString(),
    // Metadata específica
    ...(width && { width }),
    ...(height && { height }),
    ...(duration && { duration }),
    ...(title && { title }),
    ...(performer && { performer })
  };

  pending.push(item);
  await store.set('pending', pending);

  logger.info('cola-telegram.agregado', {
    botName,
    type,
    fileName: fileName || `${type}_${fileId.slice(-8)}`,
    queueSize: pending.length
  });
}
