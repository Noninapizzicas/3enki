/**
 * TelegramStrategy
 *
 * Adapta eventos de Telegram (fotos y documentos) a factura.entrada.
 *
 * Flujo:
 *   telegram.photo.received → detectar proyecto por botName
 *     → descargar archivo via telegram-service
 *     → emitir factura.entrada
 *
 * Config por proyecto:
 *   { fuentes: { telegram: { enabled: true, botName: "mi_bot" } } }
 */

const path = require('path');
const crypto = require('crypto');

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const TIPOS_DOCUMENTO = ['application/pdf'];
const TIPOS_PERMITIDOS = [...TIPOS_IMAGEN, ...TIPOS_DOCUMENTO];

class TelegramStrategy {
  constructor() {
    this.tipo = 'telegram';
    this.version = '1.0.0';
    this.modulo = null; // Set by init()

    // Track pending downloads to avoid duplicates
    this.pendingDownloads = new Set();
  }

  init(modulo) {
    this.modulo = modulo;
  }

  // ==========================================
  // Event handlers (called by fuentes module)
  // ==========================================

  /**
   * telegram.photo.received
   * Payload: { botName, chatId, from, fileId, mimeType, caption, ... }
   */
  async onPhotoReceived(event) {
    const data = event.data || event;
    const { botName, chatId, from, fileId, caption } = data;

    if (!botName || !fileId) return;

    // Resolver proyecto via channel-manager
    const resolved = await this.resolveProject(botName);
    if (!resolved) {
      this.modulo.logger.debug('fuentes.telegram.bot-sin-proyecto', { botName });
      return;
    }
    const projectId = resolved.project_id;

    // Evitar duplicados
    if (this.pendingDownloads.has(fileId)) return;
    this.pendingDownloads.add(fileId);

    try {
      const filePath = await this.downloadFile(botName, fileId, projectId, 'photo');

      if (filePath) {
        this.modulo.emitFacturaEntrada({
          projectId,
          filePath,
          source: 'telegram',
          origen: {
            botName,
            chatId,
            userId: from?.id,
            userName: from?.username || from?.firstName,
            caption
          }
        });
      }
    } finally {
      this.pendingDownloads.delete(fileId);
    }
  }

  /**
   * telegram.document.received
   * Payload: { botName, chatId, from, fileId, fileName, mimeType, caption, ... }
   */
  async onDocumentReceived(event) {
    const data = event.data || event;
    const { botName, chatId, from, fileId, fileName, mimeType, caption } = data;

    if (!botName || !fileId) return;

    // Filtrar por tipo MIME
    if (mimeType && !TIPOS_PERMITIDOS.includes(mimeType)) {
      this.modulo.logger.debug('fuentes.telegram.tipo-no-soportado', { mimeType, fileName });
      return;
    }

    // Resolver proyecto via channel-manager
    const resolved = await this.resolveProject(botName);
    if (!resolved) {
      this.modulo.logger.debug('fuentes.telegram.bot-sin-proyecto', { botName });
      return;
    }
    const projectId = resolved.project_id;

    // Evitar duplicados
    if (this.pendingDownloads.has(fileId)) return;
    this.pendingDownloads.add(fileId);

    try {
      const filePath = await this.downloadFile(botName, fileId, projectId, 'document', fileName);

      if (filePath) {
        this.modulo.emitFacturaEntrada({
          projectId,
          filePath,
          source: 'telegram',
          origen: {
            botName,
            chatId,
            userId: from?.id,
            userName: from?.username || from?.firstName,
            caption,
            fileName
          }
        });
      }
    } finally {
      this.pendingDownloads.delete(fileId);
    }
  }

  // ==========================================
  // Channel resolution via channel-manager
  // ==========================================

  /**
   * Resuelve botName → { project_id, purpose } via channel-manager.
   * Usa el eventBus request/response pattern.
   */
  async resolveProject(botName) {
    return new Promise((resolve) => {
      const correlationId = `fuentes_tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this.modulo.eventBus.unsubscribe('channel.resolve.response', handler);
        resolve(null);
      }, 3000);

      const handler = (event) => {
        const data = event.data || event;
        if (data.correlationId !== correlationId) return;
        this.modulo.eventBus.unsubscribe('channel.resolve.response', handler);
        clearTimeout(timeout);
        resolve(data.found ? data : null);
      };

      this.modulo.eventBus.subscribe('channel.resolve.response', handler);
      this.modulo.eventBus.publish('channel.resolve.request', {
        channel_type: 'telegram',
        external_id: botName,
        correlationId
      });
    });
  }

  // ==========================================
  // File download via telegram-service events
  // ==========================================

  async downloadFile(botName, fileId, projectId, type, originalFileName) {
    const destDir = path.join(
      process.cwd(), 'data/projects', projectId, 'storage', 'pendientes'
    );

    const ext = type === 'document' && originalFileName
      ? path.extname(originalFileName)
      : '.jpg';

    const safeName = originalFileName
      ? originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      : `telegram_${Date.now()}${ext}`;

    const destPath = path.join(destDir, `${Date.now()}_${safeName}`);

    try {
      // Request file download via telegram-service event pattern
      const requestId = crypto.randomUUID();

      const result = await this.modulo.services.call(
        'telegram', 'get_file',
        { botName, fileId, download: true, destPath },
        { timeout: 30000 }
      );

      const data = result.data || result;

      if (data.success && data.localPath) {
        this.modulo.logger.info('fuentes.telegram.descargado', {
          projectId, file: safeName, localPath: data.localPath
        });
        return data.localPath;
      }

      this.modulo.logger.error('fuentes.telegram.descarga-fallida', {
        botName, fileId, error: data.error || 'sin respuesta'
      });
      return null;

    } catch (e) {
      this.modulo.logger.error('fuentes.telegram.descarga-error', {
        botName, fileId, error: e.message
      });
      return null;
    }
  }

  // ==========================================
  // Health
  // ==========================================

  getHealth() {
    return {
      status: 'ok',
      pending_downloads: this.pendingDownloads.size
    };
  }

  cleanup() {
    this.pendingDownloads.clear();
  }
}

module.exports = TelegramStrategy;
