/**
 * Telegram Bot API Client
 * Wrapper para la API de Telegram Bot
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class TelegramClient {
  constructor(botToken, logger) {
    this.botToken = botToken;
    this.logger = logger;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
    this.fileUrl = `https://api.telegram.org/file/bot${botToken}`;
  }

  /**
   * Hace una petición a la API de Telegram
   */
  async request(method, params = {}) {
    const url = `${this.baseUrl}/${method}`;

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(params);

      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ok) {
              resolve(json.result);
            } else {
              reject(new Error(json.description || 'Telegram API error'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Obtiene información del bot
   */
  async getMe() {
    return this.request('getMe');
  }

  /**
   * Envía un mensaje de texto
   */
  async sendMessage(chatId, text, options = {}) {
    const params = {
      chat_id: chatId,
      text: text,
      parse_mode: options.parseMode || 'HTML',
      ...options
    };

    if (options.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }

    this.logger?.info('telegram.sendMessage', { chatId, textLength: text.length });

    return this.request('sendMessage', params);
  }

  /**
   * Envía una foto
   */
  async sendPhoto(chatId, photo, options = {}) {
    const params = {
      chat_id: chatId,
      photo: photo, // file_id, URL, o base64
      ...options
    };

    if (options.caption) {
      params.caption = options.caption;
    }

    this.logger?.info('telegram.sendPhoto', { chatId, hasCaption: !!options.caption });

    return this.request('sendPhoto', params);
  }

  /**
   * Obtiene información de un archivo
   */
  async getFile(fileId) {
    this.logger?.info('telegram.getFile', { fileId });
    return this.request('getFile', { file_id: fileId });
  }

  /**
   * Descarga un archivo
   */
  async downloadFile(fileId, destPath) {
    const file = await this.getFile(fileId);
    const fileUrl = `${this.fileUrl}/${file.file_path}`;

    return new Promise((resolve, reject) => {
      // Crear directorio si no existe
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(destPath);

      https.get(fileUrl, (res) => {
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          this.logger?.info('telegram.fileDownloaded', { fileId, destPath, size: file.file_size });
          resolve({
            path: destPath,
            size: file.file_size,
            originalPath: file.file_path
          });
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {}); // Limpiar archivo parcial
        reject(err);
      });
    });
  }

  /**
   * Descarga un archivo y lo devuelve como Buffer
   */
  async downloadFileAsBuffer(fileId) {
    const file = await this.getFile(fileId);
    const fileUrl = `${this.fileUrl}/${file.file_path}`;

    return new Promise((resolve, reject) => {
      https.get(fileUrl, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          this.logger?.info('telegram.fileDownloadedBuffer', {
            fileId,
            size: buffer.length
          });
          resolve({
            buffer,
            size: file.file_size,
            mimeType: this.getMimeType(file.file_path)
          });
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Configura el webhook
   */
  async setWebhook(url, options = {}) {
    const params = {
      url: url,
      ...options
    };

    this.logger?.info('telegram.setWebhook', { url });
    return this.request('setWebhook', params);
  }

  /**
   * Elimina el webhook
   */
  async deleteWebhook() {
    this.logger?.info('telegram.deleteWebhook');
    return this.request('deleteWebhook');
  }

  /**
   * Obtiene info del webhook actual
   */
  async getWebhookInfo() {
    return this.request('getWebhookInfo');
  }

  /**
   * Determina el MIME type basado en la extensión
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Responde a un mensaje
   */
  async reply(chatId, messageId, text, options = {}) {
    return this.sendMessage(chatId, text, {
      ...options,
      replyToMessageId: messageId
    });
  }

  /**
   * Envía indicador de "escribiendo..."
   */
  async sendChatAction(chatId, action = 'typing') {
    return this.request('sendChatAction', {
      chat_id: chatId,
      action: action
    });
  }
}

module.exports = TelegramClient;
