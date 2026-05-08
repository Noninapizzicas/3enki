/**
 * TelegramStrategy v2.0.0 — POC2 canonico.
 *
 * Adapta eventos de Telegram (fotos y documentos) a `factura.entrada`.
 *
 * Flujo:
 *   telegram.{photo,document}.received -> resolver proyecto via channel-manager
 *     -> descargar via telegram.get_file (service)
 *     -> modulo._publicarEvento('factura.entrada', ...) canonico
 *
 * Config por proyecto:
 *   { fuentes: { telegram: { enabled: true, botName: "mi_bot" } } }
 */

'use strict';

const path = require('path');

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const TIPOS_DOCUMENTO = ['application/pdf'];
const TIPOS_PERMITIDOS = [...TIPOS_IMAGEN, ...TIPOS_DOCUMENTO];

class TelegramStrategy {
  constructor() {
    this.tipo = 'telegram';
    this.version = '2.0.0';
    this.modulo = null;
    this.pendingDownloads = new Set();
  }

  init(modulo) {
    this.modulo = modulo;
  }

  // ==========================================
  // Event handlers (called by fuentes module)
  // ==========================================

  async onPhotoReceived(event) {
    const data = event?.data || event;
    const { botName, chatId, from, fileId, caption, correlation_id } = data;

    if (!botName || !fileId) return;

    const resolved = await this._resolveProject(botName);
    if (!resolved) {
      this.modulo.logger.debug('fuentes.telegram.bot-sin-proyecto', { botName });
      return;
    }
    const projectId = resolved.project_id;

    if (this.pendingDownloads.has(fileId)) return;
    this.pendingDownloads.add(fileId);

    try {
      const filePath = await this._downloadFile(botName, fileId, projectId, 'photo');
      if (filePath) {
        await this.modulo.emitFacturaEntrada({
          projectId,
          filePath,
          source: 'telegram',
          origen: {
            botName,
            chatId,
            userId: from?.id,
            userName: from?.username || from?.firstName,
            caption
          },
          correlation_id
        });
      }
    } finally {
      this.pendingDownloads.delete(fileId);
    }
  }

  async onDocumentReceived(event) {
    const data = event?.data || event;
    const { botName, chatId, from, fileId, fileName, mimeType, caption, correlation_id } = data;

    if (!botName || !fileId) return;

    if (mimeType && !TIPOS_PERMITIDOS.includes(mimeType)) {
      this.modulo.logger.debug('fuentes.telegram.tipo-no-soportado', { mimeType, fileName });
      return;
    }

    const resolved = await this._resolveProject(botName);
    if (!resolved) {
      this.modulo.logger.debug('fuentes.telegram.bot-sin-proyecto', { botName });
      return;
    }
    const projectId = resolved.project_id;

    if (this.pendingDownloads.has(fileId)) return;
    this.pendingDownloads.add(fileId);

    try {
      const filePath = await this._downloadFile(botName, fileId, projectId, 'document', fileName);
      if (filePath) {
        await this.modulo.emitFacturaEntrada({
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
          },
          correlation_id
        });
      }
    } finally {
      this.pendingDownloads.delete(fileId);
    }
  }

  // ==========================================
  // Channel resolution via channel-manager
  // ==========================================

  async _resolveProject(botName) {
    try {
      const result = await this.modulo.services.call(
        'channel-manager', 'resolve',
        { channel_type: 'telegram', external_id: botName },
        { timeout: 3000 }
      );
      const data = result?.data || result;
      return data?.found ? data : null;
    } catch (e) {
      this.modulo.logger.debug('fuentes.telegram.resolve-error', { botName, error_message: e.message });
      return null;
    }
  }

  // ==========================================
  // File download via telegram service
  // ==========================================

  async _downloadFile(botName, fileId, projectId, type, originalFileName) {
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
      const result = await this.modulo.services.call(
        'telegram', 'get_file',
        { botName, fileId, download: true, destPath },
        { timeout: 30000 }
      );

      const data = result?.data || result;

      if (data?.success && data?.localPath) {
        this.modulo.metrics?.increment?.('fuentes.telegram.descargado');
        this.modulo.logger.info('fuentes.telegram.descargado', {
          projectId, file: safeName, localPath: data.localPath
        });
        return data.localPath;
      }

      this.modulo.metrics?.increment?.('fuentes.telegram.descarga-fallida');
      this.modulo.logger.error('fuentes.telegram.descarga-fallida', {
        botName, fileId, error_message: data?.error || 'sin respuesta'
      });
      return null;
    } catch (e) {
      this.modulo.metrics?.increment?.('fuentes.telegram.descarga-error');
      this.modulo.logger.error('fuentes.telegram.descarga-error', {
        botName, fileId, error_message: e.message
      });
      return null;
    }
  }

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
