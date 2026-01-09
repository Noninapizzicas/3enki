/**
 * Download Manager
 * Descarga archivos de Telegram y los guarda en el storage configurado
 */

const fs = require('fs').promises;
const path = require('path');

class DownloadManager {
  constructor(config, logger, eventBus) {
    this.config = config;
    this.logger = logger;
    this.eventBus = eventBus;
  }

  /**
   * Descarga un archivo de Telegram y lo guarda en el storage del bot
   */
  async downloadAndStore(botName, fileId, originalName, mimeType, storagePath) {
    // Crear directorio si no existe
    await fs.mkdir(storagePath, { recursive: true });

    // Generar nombre único para evitar colisiones
    const timestamp = Date.now();
    const safeName = this.sanitizeFileName(originalName || `file_${timestamp}`);
    const destPath = path.join(storagePath, `${timestamp}_${safeName}`);

    this.logger.info('download-manager.downloading', {
      botName,
      fileId,
      destPath
    });

    try {
      // Solicitar descarga a telegram-service via evento
      const result = await this.requestDownload(botName, fileId, destPath);

      if (!result.success) {
        throw new Error(result.error || 'Download failed');
      }

      // Obtener tamaño del archivo
      const stats = await fs.stat(destPath);

      this.logger.info('download-manager.downloaded', {
        botName,
        fileId,
        path: destPath,
        size: stats.size
      });

      return {
        success: true,
        path: destPath,
        originalName: safeName,
        mimeType,
        size: stats.size
      };

    } catch (error) {
      this.logger.error('download-manager.failed', {
        botName,
        fileId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Solicita descarga a telegram-service via evento request/response
   */
  async requestDownload(botName, fileId, destPath) {
    return new Promise((resolve, reject) => {
      const requestId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timeout = setTimeout(() => {
        this.eventBus.unsubscribe(responseHandler);
        reject(new Error('Download timeout'));
      }, 30000);

      const responseHandler = (event) => {
        const data = event?.data || event?.payload || event;
        if (data.request_id === requestId) {
          clearTimeout(timeout);
          this.eventBus.unsubscribe(responseHandler);
          resolve(data);
        }
      };

      // Suscribirse a la respuesta
      this.eventBus.subscribe('telegram.get_file.response', responseHandler);

      // Publicar request
      this.eventBus.publish('telegram.get_file.request', {
        request_id: requestId,
        botName,
        fileId,
        download: true,
        destPath
      });
    });
  }

  /**
   * Guarda texto como archivo JSON
   */
  async storeText(botName, text, metadata, storagePath) {
    await fs.mkdir(storagePath, { recursive: true });

    const timestamp = Date.now();
    const fileName = `message_${timestamp}.json`;
    const destPath = path.join(storagePath, fileName);

    const content = {
      text,
      ...metadata,
      storedAt: new Date().toISOString()
    };

    await fs.writeFile(destPath, JSON.stringify(content, null, 2), 'utf8');

    this.logger.info('download-manager.text-stored', {
      botName,
      path: destPath
    });

    return {
      success: true,
      path: destPath,
      originalName: fileName,
      mimeType: 'application/json',
      size: Buffer.byteLength(JSON.stringify(content))
    };
  }

  /**
   * Sanitiza nombre de archivo
   */
  sanitizeFileName(name) {
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/__+/g, '_')
      .substring(0, 200);
  }
}

module.exports = DownloadManager;
