/**
 * PLANTILLA: Router de archivos Telegram para un bot específico
 *
 * INSTRUCCIONES:
 * 1. Copia este archivo sin el prefijo _ (ej: router-telegram-mibot.js)
 * 2. Cambia BOT_NAME por el nombre de tu bot
 * 3. Ajusta los tipos de archivo que quieres procesar
 * 4. Personaliza las rutas de destino si lo necesitas
 *
 * Este router escucha eventos de archivos de un bot específico
 * y los reenvía al handler genérico para su descarga.
 *
 * Arquitectura:
 *   telegram.*.received (filtrado por botName)
 *        ↓
 *   [Este Router]
 *        ↓
 *   telegram.file.download.request
 *        ↓
 *   [Handler Genérico] → descarga + confirmación
 */

// ⚠️ CONFIGURA AQUÍ EL NOMBRE DE TU BOT
const BOT_NAME = 'mi-bot';

// Tipos de archivo a procesar (true = procesar, false = ignorar)
const PROCESAR = {
  document: true,   // Documentos (PDF, ZIP, etc.)
  photo: true,      // Fotos
  video: true,      // Videos
  audio: true,      // Archivos de audio
  voice: true       // Notas de voz
};

module.exports = {
  name: `router-telegram-${BOT_NAME}`,
  description: `Router de archivos para bot ${BOT_NAME}`,

  // Escucha TODOS los tipos de archivo
  // (el filter discrimina por botName)
  trigger: 'telegram.document.received',

  // Solo procesar eventos de nuestro bot
  filter: (event) => {
    const data = event.data || event;
    return data.botName === BOT_NAME;
  },

  async handle(event, { emit, logger }) {
    const data = event.data || event;

    logger.info(`router-telegram-${BOT_NAME}.documento`, {
      fileName: data.fileName,
      mimeType: data.mimeType,
      from: data.from?.username
    });

    // Reenviar al handler genérico
    emit('telegram.file.download.request', {
      botName: data.botName,
      fileId: data.fileId,
      chatId: data.chatId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      notify: true,
      metadata: {
        messageId: data.messageId,
        from: data.from,
        caption: data.caption,
        type: 'document'
      }
    });

    return { routed: true };
  }
};

/**
 * NOTA: Para procesar otros tipos de archivo (foto, video, etc.)
 * crea handlers adicionales con triggers diferentes:
 *
 * - trigger: 'telegram.photo.received'
 * - trigger: 'telegram.video.received'
 * - trigger: 'telegram.audio.received'
 * - trigger: 'telegram.voice.received'
 *
 * O crea un único router que escuche múltiples eventos
 * registrándose manualmente en el eventBus.
 */
