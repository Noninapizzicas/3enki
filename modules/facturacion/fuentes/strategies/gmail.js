/**
 * GmailStrategy v2.0.0 — POC2 canonico.
 *
 * Adapta Gmail (adjuntos de correos) a `factura.entrada`.
 *
 * Flujo bajo demanda:
 *   handleCheckGmail({ proyecto }) -> checkAndProcess(proyecto)
 *     -> local.gmail.search -> local.gmail.read -> local.gmail.attachments.download
 *     -> modulo._publicarEvento('factura.entrada', ...) por adjunto
 *
 * Config por proyecto:
 *   { fuentes: { gmail: { enabled: true, account: "mi-cuenta",
 *                         query: "has:attachment is:unread", maxResults: 20 } } }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];

class GmailStrategy {
  constructor() {
    this.tipo = 'gmail';
    this.version = '2.0.0';
    this.modulo = null;
  }

  init(modulo) {
    this.modulo = modulo;
  }

  // ==========================================
  // Core: Check Gmail and process attachments
  // ==========================================

  async checkAndProcess(projectId, opts = {}) {
    const { correlation_id } = opts;

    const config = await this.modulo.getProjectFuentesConfig(projectId);
    const gmailConfig = config?.fuentes?.gmail;

    if (!gmailConfig?.enabled || !gmailConfig?.account) {
      return { processed: 0, error: 'Gmail no configurado para este proyecto' };
    }

    const { account, query, maxResults } = gmailConfig;
    const searchQuery = query || 'has:attachment is:unread';

    this.modulo.logger.info('fuentes.gmail.checking', { projectId, account, query: searchQuery });

    let processed = 0;
    let errors = 0;
    let totalAttachments = 0;

    try {
      const searchResult = await this.modulo.services.call(
        'local.gmail', 'search',
        { account, query: searchQuery, maxResults: maxResults || 20 },
        { timeout: 30000 }
      );

      const searchData = searchResult?.data || searchResult;
      const messages = searchData?.messages || [];

      if (messages.length === 0) {
        this.modulo.logger.info('fuentes.gmail.sin-correos', { account });
        return { processed: 0, errors: 0, total_attachments: 0 };
      }

      for (const msg of messages) {
        try {
          const readResult = await this.modulo.services.call(
            'local.gmail', 'read',
            { account, messageId: msg.id, format: 'full' },
            { timeout: 15000 }
          );

          const emailData = readResult?.data || readResult;
          const attachments = emailData?.attachments || [];

          for (const att of attachments) {
            if (att.mimeType && !TIPOS_PERMITIDOS.includes(att.mimeType)) {
              continue;
            }

            totalAttachments++;

            try {
              const filePath = await this._downloadAttachment(projectId, account, msg.id, att);
              if (filePath) {
                await this.modulo.emitFacturaEntrada({
                  projectId,
                  filePath,
                  source: 'gmail',
                  origen: {
                    account,
                    de: emailData?.from,
                    asunto: emailData?.subject,
                    messageId: msg.id,
                    fileName: att.filename
                  },
                  correlation_id
                });
                processed++;
              }
            } catch (e) {
              errors++;
              this.modulo.metrics?.increment?.('fuentes.gmail.adjunto-error');
              this.modulo.logger.error('fuentes.gmail.adjunto-error', {
                messageId: msg.id, filename: att.filename, error_message: e.message
              });
            }
          }
        } catch (e) {
          errors++;
          this.modulo.metrics?.increment?.('fuentes.gmail.mensaje-error');
          this.modulo.logger.error('fuentes.gmail.mensaje-error', {
            messageId: msg.id, error_message: e.message
          });
        }
      }
    } catch (e) {
      this.modulo.metrics?.increment?.('fuentes.gmail.search-error');
      this.modulo.logger.error('fuentes.gmail.search-error', {
        account, error_message: e.message
      });
      return { processed: 0, errors: 1, error: e.message };
    }

    this.modulo.logger.info('fuentes.gmail.completado', {
      projectId, processed, errors, totalAttachments
    });

    return { processed, errors, total_attachments: totalAttachments };
  }

  async _downloadAttachment(projectId, account, messageId, attachment) {
    const destDir = path.join(
      process.cwd(), 'data/projects', projectId, 'storage', 'pendientes'
    );
    fs.mkdirSync(destDir, { recursive: true });

    const safeName = (attachment.filename || `gmail_${Date.now()}.pdf`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(destDir, `${Date.now()}_${safeName}`);

    const result = await this.modulo.services.call(
      'local.gmail', 'attachments.download',
      { account, messageId, attachmentId: attachment.attachmentId },
      { timeout: 30000 }
    );

    const data = result?.data || result;

    if (!data?.content) {
      throw new Error('Sin contenido en adjunto');
    }

    const buffer = Buffer.from(data.content, 'base64');
    fs.writeFileSync(destPath, buffer);

    this.modulo.metrics?.increment?.('fuentes.gmail.adjunto-descargado');
    this.modulo.logger.info('fuentes.gmail.adjunto-descargado', {
      file: safeName, size: buffer.length, projectId
    });

    return destPath;
  }

  getHealth() {
    return { status: 'ok' };
  }

  cleanup() {
    /* nothing to clean */
  }
}

module.exports = GmailStrategy;
