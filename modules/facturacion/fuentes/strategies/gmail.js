/**
 * GmailStrategy
 *
 * Adapta Gmail (adjuntos de correos) a factura.entrada.
 *
 * Flujo bajo demanda:
 *   mqttRequest('fuentes', 'check-gmail', { proyecto })
 *     → buscar correos con adjuntos
 *     → descargar adjuntos (PDF/imágenes)
 *     → emitir factura.entrada por cada adjunto
 *
 * Flujo programado:
 *   Configurar job en scheduler con cron → emite evento
 *   → handler de proyecto escucha → llama check-gmail
 *
 * Config por proyecto:
 *   { fuentes: { gmail: { enabled: true, account: "mi-cuenta", query: "has:attachment is:unread" } } }
 */

const fs = require('fs');
const path = require('path');

const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];

class GmailStrategy {
  constructor() {
    this.tipo = 'gmail';
    this.version = '1.0.0';
    this.modulo = null;
  }

  init(modulo) {
    this.modulo = modulo;
  }

  // ==========================================
  // Core: Check Gmail and process attachments
  // ==========================================

  /**
   * Busca correos con adjuntos y emite factura.entrada por cada uno.
   * Llamado por handleCheckGmail del módulo fuentes.
   *
   * @param {string} projectId
   * @returns {Object} { processed, errors, total_attachments }
   */
  async checkAndProcess(projectId) {
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
      // 1. Buscar correos
      const searchResult = await this.modulo.services.call(
        'local.gmail', 'search',
        { account, query: searchQuery, maxResults: maxResults || 20 },
        { timeout: 30000 }
      );

      const searchData = searchResult.data || searchResult;
      const messages = searchData.messages || [];

      if (messages.length === 0) {
        this.modulo.logger.info('fuentes.gmail.sin-correos', { account });
        return { processed: 0, errors: 0, total_attachments: 0 };
      }

      // 2. Leer cada mensaje y descargar adjuntos
      for (const msg of messages) {
        try {
          const readResult = await this.modulo.services.call(
            'local.gmail', 'read',
            { account, messageId: msg.id, format: 'full' },
            { timeout: 15000 }
          );

          const emailData = readResult.data || readResult;
          const attachments = emailData.attachments || [];

          for (const att of attachments) {
            // Filtrar por tipo MIME
            if (att.mimeType && !TIPOS_PERMITIDOS.includes(att.mimeType)) {
              continue;
            }

            totalAttachments++;

            try {
              const filePath = await this.downloadAttachment(
                projectId, account, msg.id, att
              );

              if (filePath) {
                this.modulo.emitFacturaEntrada({
                  projectId,
                  filePath,
                  source: 'gmail',
                  origen: {
                    account,
                    de: emailData.from,
                    asunto: emailData.subject,
                    messageId: msg.id,
                    fileName: att.filename
                  }
                });
                processed++;
              }
            } catch (e) {
              errors++;
              this.modulo.logger.error('fuentes.gmail.adjunto-error', {
                messageId: msg.id, filename: att.filename, error: e.message
              });
            }
          }
        } catch (e) {
          errors++;
          this.modulo.logger.error('fuentes.gmail.mensaje-error', {
            messageId: msg.id, error: e.message
          });
        }
      }
    } catch (e) {
      this.modulo.logger.error('fuentes.gmail.search-error', {
        account, error: e.message
      });
      return { processed: 0, errors: 1, error: e.message };
    }

    this.modulo.logger.info('fuentes.gmail.completado', {
      projectId, processed, errors, totalAttachments
    });

    return { processed, errors, total_attachments: totalAttachments };
  }

  // ==========================================
  // Download attachment
  // ==========================================

  async downloadAttachment(projectId, account, messageId, attachment) {
    const destDir = path.join(
      process.cwd(), 'data/projects', projectId, 'storage', 'pendientes'
    );
    fs.mkdirSync(destDir, { recursive: true });

    const safeName = (attachment.filename || `gmail_${Date.now()}.pdf`)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(destDir, `${Date.now()}_${safeName}`);

    // Descargar adjunto via local.gmail
    const result = await this.modulo.services.call(
      'local.gmail', 'attachments.download',
      { account, messageId, attachmentId: attachment.attachmentId },
      { timeout: 30000 }
    );

    const data = result.data || result;

    if (!data.content) {
      throw new Error('Sin contenido en adjunto');
    }

    // Guardar base64 a disco
    const buffer = Buffer.from(data.content, 'base64');
    fs.writeFileSync(destPath, buffer);

    this.modulo.logger.info('fuentes.gmail.adjunto-descargado', {
      file: safeName, size: buffer.length, projectId
    });

    return destPath;
  }

  // ==========================================
  // Health
  // ==========================================

  getHealth() {
    return { status: 'ok' };
  }

  cleanup() {
    // Nothing to clean
  }
}

module.exports = GmailStrategy;
