/**
 * Módulo Facturas
 *
 * Procesamiento de facturas: cualquier formato de entrada → datos estructurados.
 *
 * Pipeline comercial v2:
 *   Intake → Convert → Prepare → OCR → Structure (IA) → Validate → Store
 *   Cada paso: retry, timeout, métricas, resumible.
 *
 * Expone:
 * - UI handlers (domain: facturas) para el frontend
 * - Tools para AI agents
 * - Eventos en tiempo real (factura.recibida/procesada/error/exportada)
 *
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ServiceExecutor = require('../../core/service-executor');
const InvoicePipeline = require('./pipeline/invoice-pipeline');
const PipelineMetrics = require('./pipeline/pipeline-metrics');

// Extensiones de imagen soportadas (used by UI handlers for validation)
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];


class FacturasModule {
  constructor() {
    this.name = 'facturas';
    this.version = '1.0.0';

    // Injected by loader
    this.logger = null;
    this.eventBus = null;
    this.uiHandler = null;

    // Service executor (wraps eventBus request/response)
    this.services = null;

    // Active project tracking
    this.activeProjectId = null;

    // Module config (from module.json, overridable)
    this.config = {
      ocr: {
        provider: 'local.google-vision',
        hint: 'DOCUMENT_TEXT_DETECTION',
        languages: ['es', 'en']
      },
      ai: {
        // Cadena de fallback: intenta el primero, si falla pasa al siguiente
        providers: ['deepseek', 'anthropic', 'openai', 'gemini'],
        temperature: 0.1,
        maxTokens: 2000
      },
      processing: {
        dpi: 300,
        maxWidth: 2400,
        maxHeight: 3200,
        sharp: { grayscale: true, normalize: true, sharpen: true }
      },
      timeouts: {
        pdfConvert: 60000,
        sharp: 30000,
        ocr: 60000,
        ai: 60000,
        db: 30000
      }
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;

    // Create service executor for calling providers
    this.services = new ServiceExecutor(this.eventBus, this.logger);

    // Merge config from loader-injected moduleConfig
    if (context.moduleConfig && Object.keys(context.moduleConfig).length > 0) {
      Object.assign(this.config, context.moduleConfig);
    }

    // Initialize commercial pipeline
    this.pipeline = new InvoicePipeline({
      services: this.services,
      eventBus: this.eventBus,
      logger: this.logger,
      config: this.config
    });

    // Initialize metrics collector (uses core Metrics if available)
    this.pipelineMetrics = new PipelineMetrics(context.metrics, this.logger);

    this.logger.info('facturas.loaded', { pipeline: 'v2', metrics: !!context.metrics });
  }

  async onUnload() {
    this.logger.info('facturas.unloaded');
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  onProjectActivated(event) {
    const data = event.data || event;
    this.activeProjectId = data.project_id;
    this.logger.debug('facturas.project.activated', { project_id: data.project_id });
  }

  /**
   * Reacciona a factura.entrada (emitido por fuentes: telegram, gmail, manual, etc.)
   * Contrato: { projectId, filePath, source, origen }
   */
  async onFacturaEntrada(event) {
    const data = event.data || event;
    const { projectId, filePath, source, origen } = data;

    if (!projectId || !filePath) {
      this.logger.warn('facturas.entrada.invalida', { data });
      return;
    }

    if (!fs.existsSync(filePath)) {
      this.logger.error('facturas.entrada.archivo-no-existe', { filePath, projectId });
      return;
    }

    this.logger.info('facturas.entrada.recibida', { source, projectId, filePath });

    try {
      await this.procesarArchivo(filePath, projectId, { source, origen });
    } catch (e) {
      this.logger.error('facturas.entrada.error', { error: e.message, filePath, projectId });
    }
  }

  // ==========================================
  // CORE: Procesamiento de factura individual
  // ==========================================

  /**
   * Procesa un archivo de factura via pipeline comercial.
   *
   * Pipeline v2: intake → convert → prepare → ocr → structure → validate → store
   * Cada paso: retry con backoff, timeout, métricas, resumible.
   *
   * @param {string} filePath - Ruta al archivo (PDF o imagen)
   * @param {string} projectId - ID del proyecto
   * @param {Object} options
   * @param {string} options.source - 'telegram' | 'gmail' | 'manual'
   * @param {Object} options.origen - Metadata del origen
   * @param {number} options.facturaId - ID existente (para reprocesar)
   * @param {boolean} options.skipDuplicateCheck - Omitir dedup
   * @param {string} options.resumeFrom - Paso desde el que resumir
   * @param {Object} options.previousState - Estado de ejecución anterior
   * @returns {Promise<Object>} Resultado con datos estructurados y métricas
   */
  async procesarArchivo(filePath, projectId, options = {}) {
    const result = await this.pipeline.process(filePath, projectId, options);

    // Record metrics for every pipeline execution
    this.pipelineMetrics.record(result);

    return result;
  }

  // ==========================================
  // UI Handlers (domain: facturas)
  // ==========================================

  /**
   * Procesa un archivo existente en disco
   * UI: mqttRequest('facturas', 'procesar', { proyecto, filePath, source })
   */
  async handleProcesar(data) {
    const { proyecto, filePath, source = 'manual', origen } = data;
    if (!proyecto || !filePath) {
      return { status: 400, error: 'proyecto y filePath son requeridos' };
    }

    if (!fs.existsSync(filePath)) {
      return { status: 404, error: `Archivo no encontrado: ${filePath}` };
    }

    const result = await this.procesarArchivo(filePath, proyecto, { source, origen });
    const status = result.success ? 200 : (result.duplicate ? 409 : 500);
    return { status, data: result };
  }

  /**
   * Sube un archivo (base64) y lo procesa
   * UI: mqttRequest('facturas', 'subir', { proyecto, archivo: { nombre, contenido, mimeType }, source })
   */
  async handleSubir(data) {
    const { proyecto, archivo, source = 'manual' } = data;
    if (!proyecto || !archivo?.nombre || !archivo?.contenido) {
      return { status: 400, error: 'proyecto y archivo (nombre, contenido) son requeridos' };
    }

    // Guardar archivo en storage del proyecto
    const storageDir = path.join(process.cwd(), 'data/projects', proyecto, 'storage', 'pendientes');
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = archivo.nombre.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(storageDir, `${timestamp}_${safeName}`);

    // Decodificar base64 y guardar
    const buffer = Buffer.from(archivo.contenido, 'base64');
    fs.writeFileSync(filePath, buffer);

    this.logger.info('facturas.subida', { nombre: safeName, size: buffer.length, proyecto });

    // Procesar
    const result = await this.procesarArchivo(filePath, proyecto, {
      source,
      origen: { manual: true, nombreOriginal: archivo.nombre }
    });

    const status = result.success ? 201 : (result.duplicate ? 409 : 500);
    return { status, data: result };
  }

  /**
   * Reprocesa una factura existente
   * UI: mqttRequest('facturas', 'reprocesar', { proyecto, id })
   */
  async handleReprocesar(data) {
    const { proyecto, id } = data;
    if (!proyecto || !id) {
      return { status: 400, error: 'proyecto e id son requeridos' };
    }

    // Obtener factura de la DB
    let factura;
    try {
      const result = await this.services.call('local.facturas-db', 'obtener', {
        proyecto, id
      }, { timeout: this.config.timeouts.db });
      factura = (result.data || result);
    } catch (e) {
      return { status: 404, error: `Factura no encontrada: ${e.message}` };
    }

    if (!factura?.path_original || !fs.existsSync(factura.path_original)) {
      return { status: 404, error: 'Archivo original no encontrado en disco' };
    }

    const result = await this.procesarArchivo(factura.path_original, proyecto, {
      source: factura.source || 'manual',
      facturaId: id
    });

    return { status: result.success ? 200 : 500, data: result };
  }

  /**
   * Lista facturas con filtros
   * UI: mqttRequest('facturas', 'listar', { proyecto, estado?, source?, limit? })
   */
  async handleListar(data) {
    const { proyecto, estado, desde, hasta, limit = 100 } = data;
    if (!proyecto) {
      return { status: 400, error: 'proyecto es requerido' };
    }

    try {
      const result = await this.services.call('local.facturas-db', 'listar', {
        proyecto, estado, desde, hasta, limit
      }, { timeout: this.config.timeouts.db });

      return { status: 200, data: result.data || result };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }

  /**
   * Obtiene una factura por ID
   * UI: mqttRequest('facturas', 'obtener', { proyecto, id })
   */
  async handleObtener(data) {
    const { proyecto, id } = data;
    if (!proyecto || !id) {
      return { status: 400, error: 'proyecto e id son requeridos' };
    }

    try {
      const result = await this.services.call('local.facturas-db', 'obtener', {
        proyecto, id
      }, { timeout: this.config.timeouts.db });

      const factura = result.data || result;
      if (!factura) return { status: 404, error: 'Factura no encontrada' };

      return { status: 200, data: { factura } };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }

  /**
   * Actualiza campos de una factura
   * UI: mqttRequest('facturas', 'actualizar', { proyecto, id, datos })
   */
  async handleActualizar(data) {
    const { proyecto, id, datos } = data;
    if (!proyecto || !id || !datos) {
      return { status: 400, error: 'proyecto, id y datos son requeridos' };
    }

    try {
      const result = await this.services.call('local.facturas-db', 'actualizar', {
        proyecto, id, campos: datos
      }, { timeout: this.config.timeouts.db });

      return { status: 200, data: result.data || result };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }

  /**
   * Estadísticas de facturas
   * UI: mqttRequest('facturas', 'estadisticas', { proyecto })
   */
  async handleEstadisticas(data) {
    const { proyecto } = data;
    if (!proyecto) {
      return { status: 400, error: 'proyecto es requerido' };
    }

    try {
      const result = await this.services.call('local.facturas-db', 'estadisticas', {
        proyecto
      }, { timeout: this.config.timeouts.db });

      const stats = result.data || result;

      // Adaptar formato al que espera el frontend
      return {
        status: 200,
        data: {
          total: stats.general?.total || 0,
          pendientes: stats.general?.pendientes || 0,
          procesadas: stats.general?.procesadas || 0,
          errores: stats.general?.errores || 0,
          exportadas: stats.general?.exportadas || 0,
          porSource: stats.porSource || []
        }
      };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }

  /**
   * Exportar facturas procesadas
   * UI: mqttRequest('facturas', 'exportar', { proyecto, semana? })
   */
  async handleExportar(data) {
    const { proyecto, semana } = data;
    if (!proyecto) {
      return { status: 400, error: 'proyecto es requerido' };
    }

    try {
      const result = await this.services.call('local.facturas-db', 'exportar', {
        proyecto, semana
      }, { timeout: this.config.timeouts.db });

      const exportData = result.data || result;

      // Generar CSV fiscal
      const csvPath = await this.generarCSV(proyecto, exportData.facturas || []);

      // Marcar como exportadas si hay IDs
      if (exportData.ids?.length > 0) {
        const semanaExport = exportData.semana || this.calcularSemanaISO();
        await this.services.call('local.facturas-db', 'marcarExportadas', {
          proyecto, ids: exportData.ids, semana: semanaExport
        }, { timeout: this.config.timeouts.db });
      }

      // Leer contenido del CSV para enviarlo al frontend (no tiene acceso al filesystem)
      const contenido = fs.readFileSync(csvPath, 'base64');
      const nombre = path.basename(csvPath);

      // Notificar UI
      this.eventBus.publish('factura.exportada', {
        projectId: proyecto,
        total: exportData.total || 0,
        archivo: csvPath
      });

      return {
        status: 200,
        data: {
          path: csvPath,
          nombre,
          contenido,
          mimeType: 'text/csv',
          total: exportData.total || 0
        }
      };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }

  // ==========================================
  // AI Tool Handlers
  // ==========================================

  async handleToolProcesar(args) {
    const { projectId, filePath, source = 'manual' } = args;
    if (!projectId || !filePath) {
      return { status: 400, data: { error: 'projectId y filePath son requeridos' } };
    }

    const result = await this.procesarArchivo(filePath, projectId, { source });
    return { status: result.success ? 200 : 500, data: result };
  }

  async handleToolListar(args) {
    return this.handleListar({ proyecto: args.projectId, ...args });
  }

  async handleToolEstadisticas(args) {
    return this.handleEstadisticas({ proyecto: args.projectId });
  }

  // ==========================================
  // Pipeline Metrics (observability)
  // ==========================================

  /**
   * Dashboard de métricas del pipeline de procesamiento.
   * UI: mqttRequest('facturas', 'pipeline-metrics', {})
   *
   * Returns: summary, cost, timing per step, validation stats, recent history
   */
  async handlePipelineMetrics() {
    return {
      status: 200,
      data: this.pipelineMetrics.getDashboard()
    };
  }

  // ==========================================
  // CSV Export
  // ==========================================

  async generarCSV(projectId, facturas) {
    const exportDir = path.join(process.cwd(), 'data/projects', projectId, 'storage', 'export');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const headers = [
      'Fecha', 'Num_Factura', 'NIF_Emisor', 'Nombre_Emisor',
      'NIF_Receptor', 'Nombre_Receptor', 'Descripcion',
      'Base_Imponible', 'Tipo_IVA', 'Cuota_IVA',
      'Tipo_RE', 'Cuota_RE', 'Total_Factura',
      'Forma_Pago', 'Clave_Operacion'
    ];

    const BOM = '\uFEFF';
    let csv = BOM + headers.join(';') + '\n';

    for (const f of facturas) {
      const nif = f['NIF Proveedor'] || '';
      const total = parseFloat(f['Total'] || 0);
      const claveOp = (!nif || (total < 400 && !(f['NIF Receptor'] || ''))) ? 'F2' : 'F1';

      const row = [
        f['Fecha Factura'] || '',
        f['Nº Factura'] || '',
        nif,
        f['Proveedor'] || '',
        '', // NIF Receptor (se rellena de config del proyecto)
        '', // Nombre Receptor
        f['Concepto'] || '',
        f['Base Imponible'] || 0,
        f['% IVA'] || 0,
        f['Cuota IVA'] || 0,
        0, // Tipo RE
        0, // Cuota RE
        total,
        '', // Forma Pago
        claveOp
      ];

      csv += row.map(v => this.escapeCsv(v)).join(';') + '\n';
    }

    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const csvPath = path.join(exportDir, `facturas_${fecha}.csv`);
    fs.writeFileSync(csvPath, csv, 'utf-8');

    return csvPath;
  }

  escapeCsv(value) {
    const str = String(value);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  calcularSemanaISO(fecha = new Date()) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }
}

module.exports = FacturasModule;
