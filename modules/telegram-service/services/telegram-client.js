/**
 * Telegram Bot API Client v2.0
 * Complete wrapper for Telegram Bot API
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class TelegramClient {
  constructor(botToken, logger) {
    this.botToken = botToken;
    this.logger = logger;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
    this.fileBaseUrl = `https://api.telegram.org/file/bot${botToken}`;
  }

  // ==========================================
  // Core Request
  // ==========================================

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

  // ==========================================
  // Bot Info
  // ==========================================

  async getMe() {
    return this.request('getMe');
  }

  // ==========================================
  // Sending Messages
  // ==========================================

  async sendMessage(chatId, text, options = {}) {
    const params = {
      chat_id: chatId,
      text: text
    };

    if (options.parseMode) params.parse_mode = options.parseMode;
    if (options.replyToMessageId) params.reply_to_message_id = options.replyToMessageId;
    if (options.disableNotification) params.disable_notification = true;
    if (options.replyMarkup) params.reply_markup = options.replyMarkup;

    return this.request('sendMessage', params);
  }

  async sendPhoto(chatId, photo, options = {}) {
    const params = {
      chat_id: chatId,
      photo: photo
    };

    if (options.caption) params.caption = options.caption;
    if (options.parseMode) params.parse_mode = options.parseMode;
    if (options.replyToMessageId) params.reply_to_message_id = options.replyToMessageId;

    return this.request('sendPhoto', params);
  }

  async sendDocument(chatId, document, options = {}) {
    const params = {
      chat_id: chatId,
      document: document
    };

    if (options.caption) params.caption = options.caption;
    if (options.parseMode) params.parse_mode = options.parseMode;
    if (options.replyToMessageId) params.reply_to_message_id = options.replyToMessageId;

    return this.request('sendDocument', params);
  }

  async sendAudio(chatId, audio, options = {}) {
    const params = {
      chat_id: chatId,
      audio: audio
    };

    if (options.caption) params.caption = options.caption;
    if (options.duration) params.duration = options.duration;
    if (options.performer) params.performer = options.performer;
    if (options.title) params.title = options.title;

    return this.request('sendAudio', params);
  }

  async sendVideo(chatId, video, options = {}) {
    const params = {
      chat_id: chatId,
      video: video
    };

    if (options.caption) params.caption = options.caption;
    if (options.duration) params.duration = options.duration;
    if (options.width) params.width = options.width;
    if (options.height) params.height = options.height;

    return this.request('sendVideo', params);
  }

  async sendVoice(chatId, voice, options = {}) {
    const params = {
      chat_id: chatId,
      voice: voice
    };

    if (options.caption) params.caption = options.caption;
    if (options.duration) params.duration = options.duration;

    return this.request('sendVoice', params);
  }

  async sendLocation(chatId, latitude, longitude, options = {}) {
    const params = {
      chat_id: chatId,
      latitude: latitude,
      longitude: longitude
    };

    if (options.replyToMessageId) params.reply_to_message_id = options.replyToMessageId;

    return this.request('sendLocation', params);
  }

  async sendContact(chatId, phoneNumber, firstName, options = {}) {
    const params = {
      chat_id: chatId,
      phone_number: phoneNumber,
      first_name: firstName
    };

    if (options.lastName) params.last_name = options.lastName;

    return this.request('sendContact', params);
  }

  // ==========================================
  // Keyboards
  // ==========================================

  async sendKeyboard(chatId, text, buttons, options = {}) {
    const params = {
      chat_id: chatId,
      text: text,
      reply_markup: {
        inline_keyboard: buttons
      }
    };

    if (options.parseMode) params.parse_mode = options.parseMode;
    if (options.replyToMessageId) params.reply_to_message_id = options.replyToMessageId;

    return this.request('sendMessage', params);
  }

  async sendReplyKeyboard(chatId, text, keyboard, options = {}) {
    const params = {
      chat_id: chatId,
      text: text,
      reply_markup: {
        keyboard: keyboard,
        resize_keyboard: options.resize !== false,
        one_time_keyboard: options.oneTime || false
      }
    };

    return this.request('sendMessage', params);
  }

  async removeKeyboard(chatId, text) {
    return this.request('sendMessage', {
      chat_id: chatId,
      text: text,
      reply_markup: { remove_keyboard: true }
    });
  }

  // ==========================================
  // Edit/Delete Messages
  // ==========================================

  async editMessageText(chatId, messageId, text, options = {}) {
    const params = {
      chat_id: chatId,
      message_id: messageId,
      text: text
    };

    if (options.parseMode) params.parse_mode = options.parseMode;
    if (options.replyMarkup) params.reply_markup = options.replyMarkup;

    return this.request('editMessageText', params);
  }

  async editMessageReplyMarkup(chatId, messageId, replyMarkup) {
    return this.request('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup
    });
  }

  async deleteMessage(chatId, messageId) {
    return this.request('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  // ==========================================
  // Callbacks
  // ==========================================

  async answerCallbackQuery(callbackId, options = {}) {
    const params = {
      callback_query_id: callbackId
    };

    if (options.text) params.text = options.text;
    if (options.showAlert) params.show_alert = options.showAlert;
    if (options.url) params.url = options.url;

    return this.request('answerCallbackQuery', params);
  }

  // ==========================================
  // Chat Actions
  // ==========================================

  async sendChatAction(chatId, action = 'typing') {
    return this.request('sendChatAction', {
      chat_id: chatId,
      action: action
    });
  }

  // ==========================================
  // Chat Info
  // ==========================================

  async getChat(chatId) {
    return this.request('getChat', { chat_id: chatId });
  }

  async getChatMember(chatId, userId) {
    return this.request('getChatMember', {
      chat_id: chatId,
      user_id: userId
    });
  }

  async getChatMembersCount(chatId) {
    return this.request('getChatMembersCount', { chat_id: chatId });
  }

  // ==========================================
  // Bot Commands
  // ==========================================

  async setMyCommands(commands, options = {}) {
    const params = {
      commands: commands.map(cmd => ({
        command: cmd.command,
        description: cmd.description
      }))
    };

    if (options.scope) params.scope = options.scope;
    if (options.languageCode) params.language_code = options.languageCode;

    return this.request('setMyCommands', params);
  }

  async getMyCommands(options = {}) {
    return this.request('getMyCommands', options);
  }

  async deleteMyCommands(options = {}) {
    return this.request('deleteMyCommands', options);
  }

  // ==========================================
  // Files
  // ==========================================

  async getFile(fileId) {
    return this.request('getFile', { file_id: fileId });
  }

  getFileUrl(filePath) {
    return `${this.fileBaseUrl}/${filePath}`;
  }

  async downloadFile(fileId, destPath) {
    const file = await this.getFile(fileId);
    const fileUrl = this.getFileUrl(file.file_path);

    return new Promise((resolve, reject) => {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(destPath);

      https.get(fileUrl, (res) => {
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve({
            path: destPath,
            size: file.file_size,
            originalPath: file.file_path
          });
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  async downloadFileAsBuffer(fileId) {
    const file = await this.getFile(fileId);
    const fileUrl = this.getFileUrl(file.file_path);

    return new Promise((resolve, reject) => {
      https.get(fileUrl, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            buffer,
            size: file.file_size,
            mimeType: this.getMimeType(file.file_path),
            filePath: file.file_path
          });
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  // ==========================================
  // Webhook
  // ==========================================

  async setWebhook(url, options = {}) {
    const params = { url };

    if (options.certificate) params.certificate = options.certificate;
    if (options.maxConnections) params.max_connections = options.maxConnections;
    if (options.allowedUpdates) params.allowed_updates = options.allowedUpdates;
    if (options.secretToken) params.secret_token = options.secretToken;

    return this.request('setWebhook', params);
  }

  async deleteWebhook(dropPendingUpdates = false) {
    return this.request('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates
    });
  }

  async getWebhookInfo() {
    return this.request('getWebhookInfo');
  }

  // ==========================================
  // Forward/Copy
  // ==========================================

  async forwardMessage(chatId, fromChatId, messageId) {
    return this.request('forwardMessage', {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId
    });
  }

  async copyMessage(chatId, fromChatId, messageId, options = {}) {
    const params = {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId
    };

    if (options.caption) params.caption = options.caption;

    return this.request('copyMessage', params);
  }

  // ==========================================
  // Helpers
  // ==========================================

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
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
      '.txt': 'text/plain'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  reply(chatId, messageId, text, options = {}) {
    return this.sendMessage(chatId, text, {
      ...options,
      replyToMessageId: messageId
    });
  }
}

module.exports = TelegramClient;
