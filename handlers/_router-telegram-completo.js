/**
 * PLANTILLA COMPLETA: Router de TODOS los archivos para un bot
 *
 * INSTRUCCIONES:
 * 1. Copia este archivo sin el prefijo _ (ej: router-telegram-facturas.js)
 * 2. Cambia BOT_NAME por el nombre de tu bot
 * 3. Activa/desactiva tipos de archivo en PROCESAR
 *
 * Este archivo exporta MÚLTIPLES handlers (uno por tipo de archivo)
 * que comparten la misma configuración.
 */

// ═══════════════════════════════════════════════════════════
// ⚠️  CONFIGURACIÓN - EDITA AQUÍ
// ═══════════════════════════════════════════════════════════

const BOT_NAME = 'mi-bot';  // ← Cambia esto

const PROCESAR = {
  document: true,   // Documentos (PDF, ZIP, DOC, etc.)
  photo: true,      // Fotos (siempre JPEG en Telegram)
  video: true,      // Videos
  audio: true,      // Archivos de audio (MP3, etc.)
  voice: true       // Notas de voz (OGG)
};

// Mensaje de confirmación personalizado (opcional)
// Usa null para mensaje por defecto
const MENSAJE_CONFIRMACION = null;  // o "✅ Recibido, gracias!"

// ═══════════════════════════════════════════════════════════
// LÓGICA COMÚN (no necesitas editar esto)
// ═══════════════════════════════════════════════════════════

const crearRouter = (tipo, trigger) => ({
  name: `router-${BOT_NAME}-${tipo}`,
  description: `Router de ${tipo} para bot ${BOT_NAME}`,
  trigger,
  enabled: PROCESAR[tipo],

  filter: (event) => {
    const data = event.data || event;
    return data.botName === BOT_NAME;
  },

  async handle(event, { emit, logger }) {
    const data = event.data || event;

    logger.info(`router-${BOT_NAME}.${tipo}`, {
      fileId: data.fileId,
      fileName: data.fileName,
      from: data.from?.username || data.from?.firstName
    });

    emit('telegram.file.download.request', {
      botName: data.botName,
      fileId: data.fileId,
      chatId: data.chatId,
      fileName: data.fileName || `${tipo}_${data.fileId?.slice(-8)}`,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      notify: true,
      notifyMessage: MENSAJE_CONFIRMACION,
      metadata: {
        messageId: data.messageId,
        from: data.from,
        caption: data.caption,
        type: tipo,
        // Datos específicos por tipo
        ...(tipo === 'photo' && { width: data.width, height: data.height }),
        ...(tipo === 'video' && { duration: data.duration, width: data.width, height: data.height }),
        ...(tipo === 'audio' && { duration: data.duration, title: data.title, performer: data.performer }),
        ...(tipo === 'voice' && { duration: data.duration })
      }
    });

    return { routed: true, type: tipo };
  }
});

// ═══════════════════════════════════════════════════════════
// EXPORTAR HANDLERS
// ═══════════════════════════════════════════════════════════

// Exportamos array de handlers (el loader los registra todos)
module.exports = [
  crearRouter('document', 'telegram.document.received'),
  crearRouter('photo', 'telegram.photo.received'),
  crearRouter('video', 'telegram.video.received'),
  crearRouter('audio', 'telegram.audio.received'),
  crearRouter('voice', 'telegram.voice.received')
].filter(h => h.enabled);  // Solo exportar los habilitados
