/**
 * Factura Processor Module
 *
 * Procesa facturas recibidas via Telegram con OCR (Tesseract).
 *
 * Flujo:
 * 1. Escucha bot.file.stored (filtrado por botName)
 * 2. Lee archivo del disco
 * 3. Envía a OCR via ocr.extract.request
 * 4. Recibe resultado via ocr.extract.completed
 * 5. Guarda texto extraído en outputPath
 * 6. Actualiza estado del archivo original
 *
 * @module factura-processor
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FacturaProcessorModule {
  constructor() {
    this.name = 'factura-processor';
    this.version = '1.0.0';

    // Dependencies (inyectadas en onLoad)
    this.logger = null;
    this.eventBus = null;
    this.uiHandler = null;
    this.config = null;

    // Estado
    this.pendingRequests = new Map(); // request_id -> { filePath, originalName, ... }
    this.processingQueue = [];
    this.isProcessing = false;
    this.startTime = Date.now();

    // Stats
    this.stats = {
      received: 0,
      processed: 0,
      failed: 0,
      totalTextExtracted: 0
    };

    // Cleanup
    this.unsubscribes = [];
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    // Cargar config desde module.json
    const moduleJsonPath = path.join(__dirname, 'module.json');
    const moduleJson = JSON.parse(await fs.readFile(moduleJsonPath, 'utf-8'));
    this.config = moduleJson.config || {};

    this.logger.info('factura-processor.loading', {
      version: this.version,
      botName: this.config.botName,
      outputPath: this.config.outputPath
    });

    // Asegurar que existe el directorio de salida
    await this.ensureOutputDirectory();

    // Suscribirse a eventos
    await this.subscribeToEvents();

    // Registrar handlers UI
    await this.registerUIHandlers();

    // Procesar archivos pendientes al inicio si está configurado
    if (this.config.processOnStartup) {
      // Delayed para permitir que otros módulos carguen
      setTimeout(() => this.processPendingFiles(), 3000);
    }

    this.logger.info('factura-processor.loaded', {
      version: this.version,
      config: this.config
    });
  }

  async onUnload() {
    this.logger.info('factura-processor.unloading');

    // Unsubscribe
    for (const unsub of this.unsubscribes) {
      if (typeof unsub === 'function') {
        await unsub();
      }
    }
    this.unsubscribes = [];

    // Limpiar requests pendientes
    for (const [requestId, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
    }
    this.pendingRequests.clear();

    this.logger.info('factura-processor.unloaded');
  }

  // ==========================================
  // Setup
  // ==========================================

  async ensureOutputDirectory() {
    const outputPath = path.resolve(this.config.outputPath);
    try {
      await fs.mkdir(outputPath, { recursive: true });
      this.logger.info('factura-processor.output_dir.ready', { path: outputPath });
    } catch (error) {
      this.logger.error('factura-processor.output_dir.error', {
        path: outputPath,
        error: error.message
      });
    }
  }

  async subscribeToEvents() {
    // 1. Escuchar archivos guardados por el bot
    const unsubFileStored = await this.eventBus.subscribe(
      'bot.file.stored',
      this.onFileStored.bind(this)
    );
    this.unsubscribes.push(unsubFileStored);

    // 2. Escuchar resultados de OCR
    const unsubOcrCompleted = await this.eventBus.subscribe(
      'ocr.extract.completed',
      this.onOcrCompleted.bind(this)
    );
    this.unsubscribes.push(unsubOcrCompleted);

    // 3. Escuchar errores de OCR
    const unsubOcrFailed = await this.eventBus.subscribe(
      'ocr.extract.failed',
      this.onOcrFailed.bind(this)
    );
    this.unsubscribes.push(unsubOcrFailed);

    this.logger.info('factura-processor.subscribed', {
      events: ['bot.file.stored', 'ocr.extract.completed', 'ocr.extract.failed']
    });
  }

  async registerUIHandlers() {
    if (!this.uiHandler) return;

    this.uiHandler.register('factura', 'list-pending', this.handleUIListPending.bind(this));
    this.uiHandler.register('factura', 'list-processed', this.handleUIListProcessed.bind(this));
    this.uiHandler.register('factura', 'process', this.handleUIProcess.bind(this));

    this.logger.info('factura-processor.ui_handlers.registered');
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  /**
   * Maneja archivos recibidos del bot
   */
  async onFileStored(event) {
    const data = event?.data || event?.payload || event;
    const { botName, file, caption, chatId, userId, userName } = data;

    // Filtrar por bot configurado
    if (botName !== this.config.botName) {
      this.logger.debug('factura-processor.file.ignored', {
        botName,
        expected: this.config.botName
      });
      return;
    }

    // Verificar que es un tipo soportado
    const mimeType = file?.mimeType || '';
    if (!this.isSupportedMimeType(mimeType)) {
      this.logger.info('factura-processor.file.unsupported_type', {
        mimeType,
        supported: this.config.supportedMimeTypes
      });
      return;
    }

    this.stats.received++;

    this.logger.info('factura-processor.file.received', {
      botName,
      filePath: file.path,
      originalName: file.originalName,
      mimeType,
      caption
    });

    // Encolar para procesamiento
    await this.queueForProcessing({
      filePath: file.path,
      originalName: file.originalName,
      mimeType,
      caption,
      chatId,
      userId,
      userName,
      receivedAt: new Date().toISOString()
    });
  }

  /**
   * Maneja resultado exitoso de OCR
   */
  async onOcrCompleted(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, text, confidence, words, engine, duration } = data;

    // Verificar que es un request nuestro
    const request = this.pendingRequests.get(request_id);
    if (!request) {
      return; // No es nuestro request
    }

    // Limpiar timeout y eliminar de pendientes
    clearTimeout(request.timeout);
    this.pendingRequests.delete(request_id);

    this.logger.info('factura-processor.ocr.completed', {
      request_id,
      filePath: request.filePath,
      confidence,
      words,
      engine,
      duration
    });

    // Guardar resultado
    await this.saveProcessedResult(request, {
      text,
      confidence,
      words,
      engine,
      duration
    });
  }

  /**
   * Maneja error de OCR
   */
  async onOcrFailed(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, error } = data;

    const request = this.pendingRequests.get(request_id);
    if (!request) {
      return;
    }

    clearTimeout(request.timeout);
    this.pendingRequests.delete(request_id);

    this.stats.failed++;

    this.logger.error('factura-processor.ocr.failed', {
      request_id,
      filePath: request.filePath,
      error
    });

    // Publicar evento de fallo
    await this.eventBus.publish('factura.failed', {
      filePath: request.filePath,
      originalName: request.originalName,
      error,
      timestamp: new Date().toISOString()
    });

    // Continuar con siguiente en cola
    this.processNext();
  }

  // ==========================================
  // Processing Logic
  // ==========================================

  isSupportedMimeType(mimeType) {
    return this.config.supportedMimeTypes.some(supported =>
      mimeType.startsWith(supported.replace('*', ''))
    );
  }

  async queueForProcessing(fileInfo) {
    this.processingQueue.push(fileInfo);

    // Publicar evento de encolado
    await this.eventBus.publish('factura.queued', {
      filePath: fileInfo.filePath,
      originalName: fileInfo.originalName,
      queuePosition: this.processingQueue.length,
      timestamp: new Date().toISOString()
    });

    // Iniciar procesamiento si no está activo
    if (!this.isProcessing) {
      this.processNext();
    }
  }

  async processNext() {
    if (this.processingQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const fileInfo = this.processingQueue.shift();

    await this.processFile(fileInfo);
  }

  async processFile(fileInfo) {
    const { filePath, originalName, mimeType } = fileInfo;

    this.logger.info('factura-processor.processing', {
      filePath,
      originalName,
      mimeType
    });

    try {
      // Verificar que el archivo existe
      await fs.access(filePath);

      // Leer archivo
      const fileBuffer = await fs.readFile(filePath);
      const input = fileBuffer.toString('base64');

      // Generar request_id único
      const request_id = crypto.randomUUID();

      // Guardar request para tracking
      this.pendingRequests.set(request_id, {
        ...fileInfo,
        request_id,
        startedAt: new Date().toISOString(),
        timeout: setTimeout(() => this.handleTimeout(request_id), 60000) // 60s timeout
      });

      // Publicar evento de procesando
      await this.eventBus.publish('factura.processing', {
        request_id,
        filePath,
        originalName,
        timestamp: new Date().toISOString()
      });

      // Enviar a OCR
      await this.eventBus.publish('ocr.extract.request', {
        request_id,
        input,
        options: {
          language: this.config.language || 'spa',
          engine: 'tesseract'
        }
      });

      this.logger.info('factura-processor.ocr.request_sent', {
        request_id,
        filePath,
        language: this.config.language
      });

    } catch (error) {
      this.logger.error('factura-processor.process.error', {
        filePath,
        error: error.message
      });

      this.stats.failed++;

      await this.eventBus.publish('factura.failed', {
        filePath,
        originalName,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Continuar con siguiente
      this.processNext();
    }
  }

  handleTimeout(request_id) {
    const request = this.pendingRequests.get(request_id);
    if (!request) return;

    this.pendingRequests.delete(request_id);
    this.stats.failed++;

    this.logger.error('factura-processor.ocr.timeout', {
      request_id,
      filePath: request.filePath
    });

    this.eventBus.publish('factura.failed', {
      filePath: request.filePath,
      originalName: request.originalName,
      error: 'OCR_TIMEOUT',
      timestamp: new Date().toISOString()
    });

    this.processNext();
  }

  async saveProcessedResult(request, ocrResult) {
    const { filePath, originalName, caption, chatId, userId, userName, receivedAt } = request;
    const { text, confidence, words, engine, duration } = ocrResult;

    try {
      // Generar nombre de archivo de salida
      const baseName = path.basename(originalName, path.extname(originalName));
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFileName = `${timestamp}_${baseName}.txt`;
      const outputPath = path.resolve(this.config.outputPath);
      const outputFilePath = path.join(outputPath, outputFileName);

      // Crear contenido con metadata
      const content = [
        '=' .repeat(60),
        `FACTURA PROCESADA`,
        '=' .repeat(60),
        '',
        `Archivo Original: ${originalName}`,
        `Ruta Original: ${filePath}`,
        `Fecha Recepción: ${receivedAt}`,
        `Fecha Procesamiento: ${new Date().toISOString()}`,
        `Caption: ${caption || '(sin caption)'}`,
        '',
        `--- OCR Info ---`,
        `Engine: ${engine}`,
        `Confianza: ${(confidence * 100).toFixed(1)}%`,
        `Palabras: ${words}`,
        `Duración: ${duration}ms`,
        '',
        '=' .repeat(60),
        `TEXTO EXTRAÍDO`,
        '=' .repeat(60),
        '',
        text || '(No se pudo extraer texto)',
        '',
        '=' .repeat(60)
      ].join('\n');

      // Guardar archivo
      await fs.writeFile(outputFilePath, content, 'utf-8');

      // También guardar JSON con metadata estructurada
      const jsonFileName = `${timestamp}_${baseName}.json`;
      const jsonFilePath = path.join(outputPath, jsonFileName);
      const jsonContent = {
        source: {
          filePath,
          originalName,
          receivedAt,
          caption,
          chatId,
          userId,
          userName
        },
        ocr: {
          text,
          confidence,
          words,
          engine,
          duration
        },
        processedAt: new Date().toISOString()
      };
      await fs.writeFile(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf-8');

      this.stats.processed++;
      this.stats.totalTextExtracted += (text?.length || 0);

      this.logger.info('factura-processor.saved', {
        outputFilePath,
        jsonFilePath,
        textLength: text?.length,
        confidence
      });

      // Intentar actualizar estado del archivo original a "P" (Procesado)
      await this.updateFileStatus(filePath, 'P');

      // Publicar evento de procesado
      await this.eventBus.publish('factura.processed', {
        originalFile: {
          path: filePath,
          name: originalName
        },
        outputFile: {
          textPath: outputFilePath,
          jsonPath: jsonFilePath
        },
        ocr: {
          confidence,
          words,
          engine,
          textLength: text?.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('factura-processor.save.error', {
        filePath,
        error: error.message
      });

      this.stats.failed++;

      await this.eventBus.publish('factura.failed', {
        filePath,
        originalName,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    // Continuar con siguiente en cola
    this.processNext();
  }

  /**
   * Actualiza el estado del archivo (renombra añadiendo estado)
   * Ej: factura_R.pdf -> factura_RP.pdf (R=Recibido, P=Procesado)
   */
  async updateFileStatus(filePath, newStatus) {
    try {
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);

      // Pattern: {date}_{time}_{name}_{STATUS}.ext
      // Buscar el último _ y los estados
      const match = baseName.match(/^(.+)_([RPVAXED]+)$/);

      let newBaseName;
      if (match) {
        // Ya tiene estados, añadir nuevo
        const [, nameWithoutStatus, currentStatus] = match;
        if (!currentStatus.includes(newStatus)) {
          newBaseName = `${nameWithoutStatus}_${currentStatus}${newStatus}`;
        } else {
          // Ya tiene este estado
          return;
        }
      } else {
        // No tiene estados aún
        newBaseName = `${baseName}_${newStatus}`;
      }

      const newFilePath = path.join(dir, `${newBaseName}${ext}`);
      await fs.rename(filePath, newFilePath);

      this.logger.info('factura-processor.file.status_updated', {
        from: filePath,
        to: newFilePath,
        status: newStatus
      });
    } catch (error) {
      this.logger.warn('factura-processor.file.status_update_failed', {
        filePath,
        error: error.message
      });
    }
  }

  // ==========================================
  // Proceso de archivos pendientes al inicio
  // ==========================================

  async processPendingFiles() {
    const botStoragePath = path.resolve(`./data/bots/${this.config.botName}/received`);

    try {
      await fs.access(botStoragePath);
    } catch {
      this.logger.info('factura-processor.pending.no_directory', {
        path: botStoragePath
      });
      return;
    }

    const files = await fs.readdir(botStoragePath);

    // Filtrar archivos con estado "R" (solo recibidos, no procesados)
    const pendingFiles = files.filter(f => {
      const match = f.match(/_([RPVAXED]+)\.[^.]+$/);
      if (!match) return false;
      const status = match[1];
      // Solo procesar si tiene R pero no tiene P
      return status.includes('R') && !status.includes('P');
    });

    if (pendingFiles.length === 0) {
      this.logger.info('factura-processor.pending.none_found');
      return;
    }

    this.logger.info('factura-processor.pending.found', {
      count: pendingFiles.length,
      files: pendingFiles
    });

    for (const fileName of pendingFiles) {
      const filePath = path.join(botStoragePath, fileName);

      // Determinar mimeType por extensión
      const ext = path.extname(fileName).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.pdf': 'application/pdf'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      if (this.isSupportedMimeType(mimeType)) {
        await this.queueForProcessing({
          filePath,
          originalName: fileName,
          mimeType,
          caption: null,
          chatId: null,
          userId: null,
          userName: null,
          receivedAt: new Date().toISOString()
        });
      }
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleHealthCheck(req, context) {
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime,
        config: {
          botName: this.config.botName,
          outputPath: this.config.outputPath
        },
        stats: this.stats,
        queue: {
          pending: this.processingQueue.length,
          processing: this.pendingRequests.size
        },
        timestamp: new Date().toISOString()
      }
    };
  }

  async handleGetPending(req, context) {
    const botStoragePath = path.resolve(`./data/bots/${this.config.botName}/received`);

    try {
      await fs.access(botStoragePath);
    } catch {
      return { status: 200, data: { files: [], count: 0 } };
    }

    const files = await fs.readdir(botStoragePath);
    const pending = files.filter(f => {
      const match = f.match(/_([RPVAXED]+)\.[^.]+$/);
      if (!match) return false;
      return match[1].includes('R') && !match[1].includes('P');
    });

    return {
      status: 200,
      data: {
        files: pending,
        count: pending.length,
        storagePath: botStoragePath
      }
    };
  }

  async handleGetProcessed(req, context) {
    const outputPath = path.resolve(this.config.outputPath);

    try {
      await fs.access(outputPath);
    } catch {
      return { status: 200, data: { files: [], count: 0 } };
    }

    const files = await fs.readdir(outputPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const processed = [];
    for (const jsonFile of jsonFiles.slice(-50)) { // últimos 50
      try {
        const content = await fs.readFile(path.join(outputPath, jsonFile), 'utf-8');
        processed.push(JSON.parse(content));
      } catch {
        // ignorar archivos con error
      }
    }

    return {
      status: 200,
      data: {
        files: processed,
        count: processed.length,
        outputPath
      }
    };
  }

  async handleProcessFile(req, context) {
    const { filename } = context.params;
    const botStoragePath = path.resolve(`./data/bots/${this.config.botName}/received`);
    const filePath = path.join(botStoragePath, filename);

    try {
      await fs.access(filePath);
    } catch {
      return { status: 404, data: { error: 'FILE_NOT_FOUND' } };
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf'
    };

    await this.queueForProcessing({
      filePath,
      originalName: filename,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      caption: null,
      receivedAt: new Date().toISOString()
    });

    return {
      status: 202,
      data: {
        message: 'File queued for processing',
        filename,
        queuePosition: this.processingQueue.length
      }
    };
  }

  async handleReprocessAll(req, context) {
    await this.processPendingFiles();

    return {
      status: 202,
      data: {
        message: 'Reprocessing started',
        queueLength: this.processingQueue.length
      }
    };
  }

  // ==========================================
  // UI Handlers (MQTT)
  // ==========================================

  async handleUIListPending(data, context) {
    const result = await this.handleGetPending({}, context);
    return { status: result.status, data: result.data };
  }

  async handleUIListProcessed(data, context) {
    const result = await this.handleGetProcessed({}, context);
    return { status: result.status, data: result.data };
  }

  async handleUIProcess(data, context) {
    const { filename } = data;
    if (!filename) {
      return { status: 400, error: 'filename is required' };
    }
    const result = await this.handleProcessFile({}, { params: { filename } });
    return { status: result.status, data: result.data };
  }
}

module.exports = FacturaProcessorModule;
