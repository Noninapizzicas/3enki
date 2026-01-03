/**
 * Invoice Collector Module
 * Recopila facturas desde Telegram, procesa con OCR, sincroniza a la nube
 *
 * Flujo:
 * 1. telegram.photo.received → Descarga imagen
 * 2. OCR → Extrae texto
 * 3. Parsea → Extrae vendor, date, total
 * 4. Guarda localmente
 * 5. (Semanal) Sincroniza a Google Drive
 */

const fs = require('fs');
const path = require('path');
const InvoiceProcessor = require('./services/invoice-processor');

// Event names (will be added to core/constants.js via generate:constants)
const INVOICE_EVENTS = {
  RECEIVED: 'invoice.received',
  PROCESSED: 'invoice.processed',
  SYNCED: 'invoice.synced',
  ERROR: 'invoice.error',
  SYNC_REQUEST: 'invoice.sync.request'
};

// External event from telegram-service
const TELEGRAM_EVENTS = {
  PHOTO_RECEIVED: 'telegram.photo.received',
  SEND_REQUEST: 'telegram.send.request'
};

class InvoiceCollectorModule {
  constructor() {
    this.name = 'invoice-collector';
    this.version = '1.0.0';

    // Dependencies
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
    this.activity = null;

    // Services
    this.processor = null;
    this.telegramService = null;
    this.ocrService = null;

    // State
    this.invoices = new Map(); // id -> invoice data
    this.storagePath = null;

    // Unsubscribe functions (pattern from conversation-manager)
    this.unsubscribes = [];
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};
    this.activity = core.activity?.forModule(this.name);

    this.activity?.action('module.loading', { version: this.version });
    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Configurar paths
    this.storagePath = path.resolve(
      this.config.storagePath || './data/invoices'
    );

    // Crear directorio si no existe
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }

    // Cargar OCR service (del menu-generator o crear uno propio)
    await this.initOCRService();

    // Inicializar procesador
    this.processor = new InvoiceProcessor(this.logger, this.ocrService);

    // Cargar facturas existentes
    await this.loadExistingInvoices();

    // Suscribirse a eventos
    await this.subscribeToEvents();

    this.logger.info('module.loaded', {
      module: this.name,
      storagePath: this.storagePath,
      existingInvoices: this.invoices.size
    });
  }

  async onUnload() {
    this.activity?.action('module.unloading');
    this.logger.info('module.unloading', { module: this.name });

    // Unsubscribe all event handlers
    for (const unsub of this.unsubscribes) {
      if (typeof unsub === 'function') {
        await unsub();
      }
    }
    this.unsubscribes = [];

    await this.saveInvoicesIndex();
  }

  async initOCRService() {
    // Intentar reutilizar OCR del menu-generator
    try {
      const OCRService = require('../menu-generator/services/ocr-service');
      this.ocrService = new OCRService(this.logger);
      this.logger.info('invoice.ocr.initialized', { source: 'menu-generator' });
    } catch (error) {
      this.logger.warn('invoice.ocr.fallback', {
        message: 'Using basic OCR. Install menu-generator for full OCR support.'
      });
      // Fallback básico
      this.ocrService = {
        extractText: async (base64, fileName, mimeType) => {
          return { text: '', confidence: 0, error: 'OCR not available' };
        }
      };
    }
  }

  async subscribeToEvents() {
    // Escuchar fotos de Telegram (tracking unsubscribes)
    const unsubPhoto = await this.eventBus.subscribe(
      TELEGRAM_EVENTS.PHOTO_RECEIVED,
      this.onTelegramPhoto.bind(this)
    );
    this.unsubscribes.push(unsubPhoto);

    // Escuchar peticiones de sync
    const unsubSync = await this.eventBus.subscribe(
      INVOICE_EVENTS.SYNC_REQUEST,
      this.onSyncRequest.bind(this)
    );
    this.unsubscribes.push(unsubSync);

    this.logger.info('invoice.events.subscribed', {
      events: [TELEGRAM_EVENTS.PHOTO_RECEIVED, INVOICE_EVENTS.SYNC_REQUEST]
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onTelegramPhoto(event) {
    const { chatId, messageId, photo, caption, from, timestamp } = event;

    this.logger.info('invoice.telegram.photo', {
      chatId,
      fileId: photo.fileId,
      size: photo.fileSize
    });

    try {
      // Responder que estamos procesando
      if (this.config.autoReplyTelegram) {
        await this.replyToTelegram(chatId, messageId,
          this.config.replyMessages?.received || '📄 Factura recibida. Procesando...'
        );
      }

      // Descargar imagen de Telegram
      const imageData = await this.downloadFromTelegram(photo.fileId);

      // Generar ID único
      const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Procesar con OCR
      const result = await this.processor.processImage(
        imageData.buffer,
        imageData.mimeType,
        `telegram_${photo.fileId}.jpg`
      );

      // Crear registro de factura
      const invoice = {
        id: invoiceId,
        source: 'telegram',
        chatId,
        messageId,
        from: from,
        originalFileId: photo.fileId,
        imagePath: null, // Se llenará al guardar
        ocrText: result.text,
        ocrConfidence: result.confidence,
        extracted: result.extracted,
        caption: caption,
        status: 'processed',
        receivedAt: timestamp,
        processedAt: new Date().toISOString(),
        syncedAt: null
      };

      // Guardar imagen localmente
      const fileName = this.processor.generateFileName(result.extracted, 'invoice.jpg');
      const imagePath = path.join(this.storagePath, fileName);
      fs.writeFileSync(imagePath, imageData.buffer);
      invoice.imagePath = imagePath;

      // Guardar en memoria y disco
      this.invoices.set(invoiceId, invoice);
      await this.saveInvoicesIndex();

      // Publicar evento
      await this.eventBus.publish(INVOICE_EVENTS.RECEIVED, invoice);
      await this.eventBus.publish(INVOICE_EVENTS.PROCESSED, {
        id: invoiceId,
        extracted: result.extracted
      });

      this.metrics?.increment('invoices.received.total');
      this.metrics?.increment('invoices.processed.total');
      this.activity?.action('invoice.processed', {
        id: invoiceId,
        vendor: result.extracted.vendor,
        total: result.extracted.total
      });

      // Responder con resultado
      if (this.config.autoReplyTelegram) {
        const validation = this.processor.validateExtraction(result.extracted);
        let replyText;

        if (validation.valid) {
          replyText = (this.config.replyMessages?.processed || '✅ Factura procesada: {vendor} - {total}€')
            .replace('{vendor}', result.extracted.vendor || 'Desconocido')
            .replace('{total}', result.extracted.total?.toFixed(2) || '?')
            .replace('{date}', result.extracted.date || '');
        } else {
          replyText = `⚠️ Factura guardada con datos parciales:\n${validation.issues.join('\n')}`;
        }

        await this.replyToTelegram(chatId, messageId, replyText);
      }

      this.logger.info('invoice.processed.success', {
        id: invoiceId,
        vendor: result.extracted.vendor,
        total: result.extracted.total
      });

    } catch (error) {
      this.logger.error('invoice.processing.error', {
        error: error.message,
        chatId,
        fileId: photo.fileId
      });

      this.metrics?.increment('invoices.errors.total');
      this.activity?.error('invoice.processing', error, { chatId, fileId: photo.fileId });

      await this.eventBus.publish(INVOICE_EVENTS.ERROR, {
        error: error.message,
        source: 'telegram',
        chatId
      });

      // Notificar error al usuario
      if (this.config.autoReplyTelegram) {
        await this.replyToTelegram(chatId, messageId,
          (this.config.replyMessages?.error || '❌ Error: {error}')
            .replace('{error}', error.message)
        );
      }
    }
  }

  async onSyncRequest(event) {
    const { respondTo } = event;

    try {
      const result = await this.syncToCloud();

      if (respondTo) {
        await this.eventBus.publish(respondTo, { success: true, result });
      }
    } catch (error) {
      if (respondTo) {
        await this.eventBus.publish(respondTo, { success: false, error: error.message });
      }
    }
  }

  // ==========================================
  // Telegram Integration
  // ==========================================

  async downloadFromTelegram(fileId) {
    // Buscar módulo telegram-service
    // Por ahora usar API directa
    const TelegramClient = require('../telegram-service/services/telegram-client');
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }

    const client = new TelegramClient(token, this.logger);
    return client.downloadFileAsBuffer(fileId);
  }

  async replyToTelegram(chatId, messageId, text) {
    try {
      await this.eventBus.publish(TELEGRAM_EVENTS.SEND_REQUEST, {
        chatId,
        text,
        replyToMessageId: messageId
      });
    } catch (error) {
      this.logger.warn('invoice.telegram.reply.failed', { error: error.message });
    }
  }

  // ==========================================
  // Storage
  // ==========================================

  async loadExistingInvoices() {
    const indexPath = path.join(this.storagePath, 'invoices.json');

    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        for (const invoice of data.invoices || []) {
          this.invoices.set(invoice.id, invoice);
        }
        this.logger.info('invoice.loaded.existing', { count: this.invoices.size });
      } catch (error) {
        this.logger.warn('invoice.load.error', { error: error.message });
      }
    }
  }

  async saveInvoicesIndex() {
    const indexPath = path.join(this.storagePath, 'invoices.json');
    const data = {
      updatedAt: new Date().toISOString(),
      invoices: Array.from(this.invoices.values())
    };

    fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
  }

  // ==========================================
  // Cloud Sync (placeholder)
  // ==========================================

  async syncToCloud() {
    const pending = Array.from(this.invoices.values())
      .filter(inv => inv.status === 'processed');

    this.logger.info('invoice.sync.start', { count: pending.length });

    // TODO: Implementar sync a Google Drive
    // Por ahora solo marcar como synced

    for (const invoice of pending) {
      invoice.status = 'synced';
      invoice.syncedAt = new Date().toISOString();
      this.metrics?.increment('invoices.synced.total');
    }

    await this.saveInvoicesIndex();

    await this.eventBus.publish(INVOICE_EVENTS.SYNCED, {
      count: pending.length,
      timestamp: new Date().toISOString()
    });

    this.activity?.action('invoice.synced', { count: pending.length });
    this.logger.info('invoice.sync.complete', { synced: pending.length });

    return { synced: pending.length };
  }

  // ==========================================
  // API Handlers
  // ==========================================

  async handleListInvoices(req, res) {
    const { status, limit } = req.query;

    let invoices = Array.from(this.invoices.values());

    if (status) {
      invoices = invoices.filter(inv => inv.status === status);
    }

    if (limit) {
      invoices = invoices.slice(0, parseInt(limit));
    }

    // Ordenar por fecha descendente
    invoices.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

    res.json({
      count: invoices.length,
      invoices: invoices.map(inv => ({
        id: inv.id,
        vendor: inv.extracted?.vendor,
        total: inv.extracted?.total,
        date: inv.extracted?.date,
        status: inv.status,
        receivedAt: inv.receivedAt
      }))
    });
  }

  async handleGetInvoice(req, res) {
    const { id } = req.params;
    const invoice = this.invoices.get(id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  }

  async handleSyncInvoices(req, res) {
    try {
      const result = await this.syncToCloud();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleDeleteInvoice(req, res) {
    const { id } = req.params;
    const invoice = this.invoices.get(id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Eliminar archivo
    if (invoice.imagePath && fs.existsSync(invoice.imagePath)) {
      fs.unlinkSync(invoice.imagePath);
    }

    this.invoices.delete(id);
    await this.saveInvoicesIndex();

    res.json({ success: true, deleted: id });
  }

  // ==========================================
  // Tool Handlers (para AI)
  // ==========================================

  async handleToolList(args) {
    const { status, limit } = args;

    let invoices = Array.from(this.invoices.values());

    if (status) {
      invoices = invoices.filter(inv => inv.status === status);
    }

    invoices.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

    if (limit) {
      invoices = invoices.slice(0, limit);
    }

    return {
      count: invoices.length,
      invoices: invoices.map(inv => ({
        id: inv.id,
        vendor: inv.extracted?.vendor || 'Desconocido',
        total: inv.extracted?.total,
        date: inv.extracted?.date,
        status: inv.status
      }))
    };
  }

  async handleToolSync(args) {
    const result = await this.syncToCloud();
    return {
      success: true,
      message: `Sincronizadas ${result.synced} facturas`
    };
  }

  async handleToolStats(args) {
    const invoices = Array.from(this.invoices.values());

    const stats = {
      total: invoices.length,
      byStatus: {
        pending: invoices.filter(i => i.status === 'pending').length,
        processed: invoices.filter(i => i.status === 'processed').length,
        synced: invoices.filter(i => i.status === 'synced').length,
        error: invoices.filter(i => i.status === 'error').length
      },
      totalAmount: invoices
        .filter(i => i.extracted?.total)
        .reduce((sum, i) => sum + i.extracted.total, 0)
    };

    return stats;
  }
}

module.exports = InvoiceCollectorModule;
