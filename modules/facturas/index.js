/**
 * facturas v3.0.0 — Procesamiento comercial de facturas (POC2 rewrite).
 *
 * Pipeline v2 step-based: Intake → Convert → Prepare → OCR → Structure (IA) → Validate → Store.
 * Cada paso con retry, timeout, metricas, resumible. La inteligencia del pipeline vive en
 * `pipeline/invoice-pipeline.js`; este modulo expone la superficie publica (events + tools + UI).
 *
 * Eventos del bus:
 *   subscribes: factura.entrada
 *   publishes:  factura.recibida, factura.procesada, factura.error, factura.exportada,
 *               telegram.send_message.request (fire-and-forget al chat de origen)
 *
 * 9 ui_handlers (procesar, subir, reprocesar, listar, obtener, actualizar, estadisticas,
 * exportar, pipeline-metrics) + 3 tools del LLM (procesar, listar, estadisticas).
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const crypto = require('crypto');

const ServiceExecutor = require('../../core/service-executor');
const InvoicePipeline = require('./pipeline/invoice-pipeline');
const PipelineMetrics = require('./pipeline/pipeline-metrics');

const DEFAULT_PROJECT_ID = 'default';

class FacturasModule {
  constructor() {
    this.name    = 'facturas';
    this.version = '3.0.0';

    this.logger    = null;
    this.eventBus  = null;
    this.uiHandler = null;
    this.metrics   = null;

    this.services        = null;
    this.pipeline        = null;
    this.pipelineMetrics = null;

    this.config = {
      ocr: {
        provider:  'local.google-vision',
        hint:      'DOCUMENT_TEXT_DETECTION',
        languages: ['es', 'en']
      },
      ai: {
        providers:   ['deepseek', 'anthropic', 'openai', 'gemini'],
        temperature: 0.1,
        maxTokens:   2000
      },
      processing: {
        dpi:       300,
        maxWidth:  2400,
        maxHeight: 3200,
        sharp:     { grayscale: true, normalize: true, sharpen: true }
      },
      timeouts: {
        pdfConvert: 60000,
        sharp:      30000,
        ocr:        60000,
        ai:         60000,
        db:         30000
      }
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger    = context.logger;
    this.eventBus  = context.eventBus;
    this.uiHandler = context.uiHandler;
    this.metrics   = context.metrics;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    if (context.moduleConfig && Object.keys(context.moduleConfig).length > 0) {
      Object.assign(this.config, context.moduleConfig);
    }

    this.services = new ServiceExecutor(this.eventBus, this.logger);

    this.pipeline = new InvoicePipeline({
      services: this.services,
      eventBus: this.eventBus,
      logger:   this.logger,
      config:   this.config
    });

    this.pipelineMetrics = new PipelineMetrics(this.metrics, this.logger);

    this.logger.info('module.loaded', {
      module:   this.name,
      version:  this.version,
      pipeline: 'v2',
      metrics:  !!this.metrics
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this.services        = null;
    this.pipeline        = null;
    this.pipelineMetrics = null;
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus handler
  // ==========================================

  /**
   * factura.entrada — entrada del pipeline desde fuentes externas (telegram, gmail, manual).
   * Contrato: { projectId, filePath, source, origen, project_id?, correlation_id? }
   */
  async onFacturaEntrada(event) {
    const data = this._unwrap(event);
    const { projectId, filePath, source, origen } = data || {};
    const projectKey = data?.project_id || projectId;

    if (!projectId || !filePath) {
      this._logError('facturas.entrada.invalida', { has_project: !!projectId, has_path: !!filePath }, 'entrada', 'INVALID_INPUT');
      return;
    }

    if (!fs.existsSync(filePath)) {
      this._logError('facturas.entrada.archivo_no_existe', { filePath, projectId }, 'entrada', 'RESOURCE_NOT_FOUND');
      await this._publicarEvento('factura.error', {
        project_id: projectKey,
        file_path:  filePath,
        source,
        code:       'RESOURCE_NOT_FOUND',
        message:    'Archivo de entrada no existe en disco'
      }, data);
      return;
    }

    this.logger.info('facturas.entrada.recibida', { source, projectId, filePath });

    await this._publicarEvento('factura.recibida', {
      project_id: projectKey,
      file_path:  filePath,
      source
    }, data);

    try {
      const result = await this._procesarArchivo(filePath, projectId, { source, origen });

      if (result?.success) {
        await this._publicarEvento('factura.procesada', {
          project_id: projectKey,
          file_path:  filePath,
          factura_id: result.facturaId || null,
          duplicate:  !!result.duplicate,
          source
        }, data);
      } else {
        await this._publicarEvento('factura.error', {
          project_id: projectKey,
          file_path:  filePath,
          source,
          code:       'UNKNOWN_ERROR',
          message:    result?.error || 'Procesamiento fallido sin error explicito'
        }, data);
      }

      if (source === 'telegram' && origen?.botName && origen?.chatId) {
        this._notifyTelegramResult(origen.botName, origen.chatId, result);
      }
    } catch (err) {
      this.logger.error('facturas.entrada.error', { error: err.message, filePath, projectId });
      this.metrics?.increment('facturas.errors', { kind: 'entrada', code: 'UNKNOWN_ERROR' });

      await this._publicarEvento('factura.error', {
        project_id: projectKey,
        file_path:  filePath,
        source,
        code:       'UNKNOWN_ERROR',
        message:    err.message
      }, data);

      if (source === 'telegram' && origen?.botName && origen?.chatId) {
        this._notifyTelegramResult(origen.botName, origen.chatId, { success: false, error: err.message });
      }
    }
  }

  // ==========================================
  // Telegram notify (fire-and-forget)
  // ==========================================

  _notifyTelegramResult(botName, chatId, result) {
    let text;

    if (result?.duplicate) {
      text = `⚠️ <b>Factura duplicada</b>\nYa existe en el sistema.`;
    } else if (result?.success) {
      const e = result.estructura || {};
      const proveedor = e.emisor?.nombre || 'Proveedor desconocido';
      const total     = e.totales?.total_factura;
      const numero    = e.factura?.numero;
      const fecha     = e.factura?.fecha;

      text = `✅ <b>Factura procesada</b>\n\n`
        + `📋 <b>${proveedor}</b>\n`
        + (numero ? `🔢 Nº: <code>${numero}</code>\n` : '')
        + (fecha  ? `📅 ${fecha}\n` : '')
        + (total  ? `💰 ${Number(total).toFixed(2)} €\n` : '')
        + `\n⏱ ${((result.metrics?.totalDuration || 0) / 1000).toFixed(1)}s`;
    } else {
      text = `❌ <b>Error procesando factura</b>\n<code>${result?.error || 'Error desconocido'}</code>`;
    }

    try {
      this.eventBus.publish('telegram.send_message.request', {
        request_id: crypto.randomUUID(),
        botName,
        chatId,
        text,
        parseMode: 'HTML'
      });
    } catch (err) {
      this.logger.warn('facturas.telegram.notify.error', { error: err.message });
      this.metrics?.increment('facturas.errors', { kind: 'telegram_notify', code: 'EXTERNAL_API_FAILED' });
    }
  }

  // ==========================================
  // Pipeline core
  // ==========================================

  async _procesarArchivo(filePath, projectId, options = {}) {
    const result = await this.pipeline.process(filePath, projectId, options);
    this.pipelineMetrics.record(result);
    return result;
  }

  // ==========================================
  // UI Handlers (mqttRequest cross-modulo)
  // ==========================================

  async handleProcesar(data) {
    try {
      const { proyecto, filePath, source = 'manual', origen } = data || {};
      if (!proyecto || !filePath) {
        this._logError('facturas.ui.procesar.validation_failed', { has_project: !!proyecto, has_path: !!filePath }, 'ui_procesar', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'proyecto y filePath son requeridos', { fields: ['proyecto', 'filePath'] });
      }
      if (!fs.existsSync(filePath)) {
        this._logError('facturas.ui.procesar.not_found', { filePath }, 'ui_procesar', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Archivo no encontrado: ${filePath}`, {
          entity_type: 'archivo', entity_id: filePath
        });
      }

      const result = await this._procesarArchivo(filePath, proyecto, { source, origen });
      const status = result.success ? 200 : (result.duplicate ? 409 : 500);
      return { status, data: result };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.procesar.failed', err, 'ui_procesar');
    }
  }

  async handleSubir(data) {
    try {
      const { proyecto, archivo, source = 'manual' } = data || {};
      if (!proyecto || !archivo?.nombre || !archivo?.contenido) {
        this._logError('facturas.ui.subir.validation_failed', {
          has_project: !!proyecto, has_nombre: !!archivo?.nombre, has_contenido: !!archivo?.contenido
        }, 'ui_subir', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT',
          'proyecto y archivo (nombre, contenido) son requeridos',
          { fields: ['proyecto', 'archivo.nombre', 'archivo.contenido'] });
      }

      const storageDir = path.join(process.cwd(), 'data/projects', proyecto, 'storage', 'pendientes');
      await fsp.mkdir(storageDir, { recursive: true });

      const timestamp = Date.now();
      const safeName  = archivo.nombre.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath  = path.join(storageDir, `${timestamp}_${safeName}`);

      const buffer = Buffer.from(archivo.contenido, 'base64');
      await fsp.writeFile(filePath, buffer);

      this.logger.info('facturas.subida.ok', { nombre: safeName, size: buffer.length, proyecto });
      this.metrics?.increment('facturas.subidas.total', { project_id: proyecto });

      const result = await this._procesarArchivo(filePath, proyecto, {
        source,
        origen: { manual: true, nombreOriginal: archivo.nombre }
      });
      const status = result.success ? 201 : (result.duplicate ? 409 : 500);
      return { status, data: result };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.subir.failed', err, 'ui_subir');
    }
  }

  async handleReprocesar(data) {
    try {
      const { proyecto, id } = data || {};
      if (!proyecto || !id) {
        this._logError('facturas.ui.reprocesar.validation_failed', { has_project: !!proyecto, has_id: !!id }, 'ui_reprocesar', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'proyecto e id son requeridos', { fields: ['proyecto', 'id'] });
      }

      let factura;
      try {
        const result = await this.services.call('local.facturas-db', 'obtener', { proyecto, id }, { timeout: this.config.timeouts.db });
        factura = result.data || result;
      } catch (err) {
        this._logError('facturas.ui.reprocesar.not_found_db', { id, proyecto }, 'ui_reprocesar', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Factura no encontrada: ${err.message}`, {
          entity_type: 'factura', entity_id: id
        });
      }

      if (!factura?.path_original || !fs.existsSync(factura.path_original)) {
        this._logError('facturas.ui.reprocesar.archivo_no_existe', { id, path: factura?.path_original }, 'ui_reprocesar', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Archivo original no encontrado en disco', {
          entity_type: 'archivo', entity_id: factura?.path_original || null
        });
      }

      const result = await this._procesarArchivo(factura.path_original, proyecto, {
        source:    factura.source || 'manual',
        facturaId: id
      });
      return { status: result.success ? 200 : 500, data: result };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.reprocesar.failed', err, 'ui_reprocesar');
    }
  }

  async handleListar(data) {
    try {
      const { proyecto, estado, desde, hasta, limit = 100 } = data || {};
      if (!proyecto) {
        this._logError('facturas.ui.listar.validation_failed', { missing: 'proyecto' }, 'ui_listar', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'proyecto es requerido', { field: 'proyecto' });
      }

      const result = await this.services.call('local.facturas-db', 'listar',
        { proyecto, estado, desde, hasta, limit },
        { timeout: this.config.timeouts.db }
      );
      return { status: 200, data: result.data || result };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.listar.failed', err, 'ui_listar');
    }
  }

  async handleObtener(data) {
    try {
      const { proyecto, id } = data || {};
      if (!proyecto || !id) {
        this._logError('facturas.ui.obtener.validation_failed', { has_project: !!proyecto, has_id: !!id }, 'ui_obtener', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'proyecto e id son requeridos', { fields: ['proyecto', 'id'] });
      }

      const result = await this.services.call('local.facturas-db', 'obtener',
        { proyecto, id },
        { timeout: this.config.timeouts.db }
      );

      const factura = ('data' in (result || {})) ? result.data : result;
      if (!factura) {
        this._logError('facturas.ui.obtener.not_found', { id, proyecto }, 'ui_obtener', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Factura no encontrada', {
          entity_type: 'factura', entity_id: id
        });
      }
      return { status: 200, data: { factura } };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.obtener.failed', err, 'ui_obtener');
    }
  }

  async handleActualizar(data) {
    try {
      const { proyecto, id, datos } = data || {};
      if (!proyecto || !id || !datos) {
        this._logError('facturas.ui.actualizar.validation_failed', {
          has_project: !!proyecto, has_id: !!id, has_datos: !!datos
        }, 'ui_actualizar', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'proyecto, id y datos son requeridos', { fields: ['proyecto', 'id', 'datos'] });
      }

      const result = await this.services.call('local.facturas-db', 'actualizar',
        { proyecto, id, campos: datos },
        { timeout: this.config.timeouts.db }
      );
      return { status: 200, data: result.data || result };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.actualizar.failed', err, 'ui_actualizar');
    }
  }

  async handleEstadisticas(data) {
    try {
      const { proyecto } = data || {};
      if (!proyecto) {
        this._logError('facturas.ui.estadisticas.validation_failed', { missing: 'proyecto' }, 'ui_estadisticas', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'proyecto es requerido', { field: 'proyecto' });
      }

      const result = await this.services.call('local.facturas-db', 'estadisticas',
        { proyecto },
        { timeout: this.config.timeouts.db }
      );
      const stats = result.data || result;

      return {
        status: 200,
        data: {
          total:      stats.general?.total      || 0,
          pendientes: stats.general?.pendientes || 0,
          procesadas: stats.general?.procesadas || 0,
          errores:    stats.general?.errores    || 0,
          exportadas: stats.general?.exportadas || 0,
          porSource:  stats.porSource || []
        }
      };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.estadisticas.failed', err, 'ui_estadisticas');
    }
  }

  async handleExportar(data) {
    try {
      const { proyecto, semana } = data || {};
      if (!proyecto) {
        this._logError('facturas.ui.exportar.validation_failed', { missing: 'proyecto' }, 'ui_exportar', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'proyecto es requerido', { field: 'proyecto' });
      }

      const result = await this.services.call('local.facturas-db', 'exportar',
        { proyecto, semana },
        { timeout: this.config.timeouts.db }
      );
      const exportData = result.data || result;

      const csvPath = await this._generarCSV(proyecto, exportData.facturas || []);

      if (exportData.ids?.length > 0) {
        const semanaExport = exportData.semana || this._calcularSemanaISO();
        await this.services.call('local.facturas-db', 'marcarExportadas',
          { proyecto, ids: exportData.ids, semana: semanaExport },
          { timeout: this.config.timeouts.db }
        );
      }

      const contenido = await fsp.readFile(csvPath, { encoding: 'base64' });
      const nombre    = path.basename(csvPath);

      await this._publicarEvento('factura.exportada', {
        project_id: proyecto,
        total:      exportData.total || 0,
        archivo:    csvPath
      }, data);

      return {
        status: 200,
        data: {
          path:      csvPath,
          nombre,
          contenido,
          mimeType:  'text/csv',
          total:     exportData.total || 0
        }
      };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.exportar.failed', err, 'ui_exportar');
    }
  }

  async handlePipelineMetrics() {
    try {
      return { status: 200, data: this.pipelineMetrics.getDashboard() };
    } catch (err) {
      return this._handleHandlerError('facturas.ui.metrics.failed', err, 'ui_metrics');
    }
  }

  // ==========================================
  // Tool handlers (LLM)
  // ==========================================

  async handleToolProcesar(args) {
    try {
      const { projectId, filePath, source = 'manual' } = args || {};
      if (!projectId || !filePath) {
        this._logError('facturas.tool.procesar.validation_failed', { has_project: !!projectId, has_path: !!filePath }, 'tool_procesar', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'projectId y filePath son requeridos', { fields: ['projectId', 'filePath'] });
      }
      if (!fs.existsSync(filePath)) {
        this._logError('facturas.tool.procesar.not_found', { filePath }, 'tool_procesar', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Archivo no encontrado: ${filePath}`, {
          entity_type: 'archivo', entity_id: filePath
        });
      }

      const result = await this._procesarArchivo(filePath, projectId, { source });
      return { status: result.success ? 200 : 500, data: result };
    } catch (err) {
      return this._handleHandlerError('facturas.tool.procesar.failed', err, 'tool_procesar');
    }
  }

  async handleToolListar(args) {
    return this.handleListar({ proyecto: args?.projectId, ...args });
  }

  async handleToolEstadisticas(args) {
    return this.handleEstadisticas({ proyecto: args?.projectId });
  }

  // ==========================================
  // CSV export — fiscal espanol
  // ==========================================

  async _generarCSV(projectId, facturas) {
    const exportDir = path.join(process.cwd(), 'data/projects', projectId, 'storage', 'export');
    await fsp.mkdir(exportDir, { recursive: true });

    const headers = [
      'Fecha', 'Num_Factura', 'NIF_Emisor', 'Nombre_Emisor',
      'NIF_Receptor', 'Nombre_Receptor', 'Descripcion',
      'Base_Imponible', 'Tipo_IVA', 'Cuota_IVA',
      'Tipo_RE', 'Cuota_RE', 'Total_Factura',
      'Forma_Pago', 'Clave_Operacion'
    ];

    const BOM = '﻿';
    let csv = BOM + headers.join(';') + '\n';

    for (const f of facturas) {
      const nif      = f['NIF Proveedor'] || '';
      const total    = parseFloat(f['Total'] || 0);
      const claveOp  = (!nif || (total < 400 && !(f['NIF Receptor'] || ''))) ? 'F2' : 'F1';

      const row = [
        f['Fecha Factura']  || '',
        f['Nº Factura']     || '',
        nif,
        f['Proveedor']      || '',
        '',
        '',
        f['Concepto']       || '',
        f['Base Imponible'] || 0,
        f['% IVA']          || 0,
        f['Cuota IVA']      || 0,
        0,
        0,
        total,
        '',
        claveOp
      ];

      csv += row.map(v => this._escapeCsv(v)).join(';') + '\n';
    }

    const fecha   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const csvPath = path.join(exportDir, `facturas_${fecha}.csv`);
    await fsp.writeFile(csvPath, csv, 'utf-8');

    return csvPath;
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'AUTHENTICATION_REQUIRED' ? 401 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'TIMEOUT'                 ? 504 :
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'FILESYSTEM_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('facturas.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (ecod === 'EACCES' || msg.includes('permission') || msg.includes('forbidden'))    return 'PERMISSION_DENIED';
    if (ecod === 'EEXIST' || msg.includes('already exists'))                             return 'ALREADY_EXISTS';
    if (msg.includes('timeout'))                                                         return 'TIMEOUT';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (ecod && ecod.startsWith('E'))                                                     return 'FILESYSTEM_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      project_id:     sourcePayload?.project_id || sourcePayload?.projectId || payload?.project_id || DEFAULT_PROJECT_ID,
      timestamp:      new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }

  // 5o helper auxiliar — escapado canonico de CSV (preservado del monolito)
  _escapeCsv(value) {
    const str = String(value);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // 6o helper — calculo de semana ISO (preservado del monolito)
  _calcularSemanaISO(fecha = new Date()) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo    = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  // ==========================================
  // Internals
  // ==========================================

  _unwrap(event) {
    return event?.data || event?.payload || event || {};
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('facturas.errors', { kind, code });
  }
}

module.exports = FacturasModule;
