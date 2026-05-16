/**
 * Asesoria Module v2.0.0 — POC2 canonico.
 *
 * Genera paquetes fiscales (CSV + ZIP con originales) on-demand para asesoria
 * contable espaniola. Lee facturas procesadas via `local.facturas-db`,
 * empaqueta via `local.zip`. Emite asesoria.paquete.{generado,error}.
 *
 * Topics MQTT (frontend Svelte facturas.ts): asesoria.{generar-paquete,
 * historial, descargar, preview}. Retorno con base64 inline para descarga
 * directa via triggerDownload.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const ServiceExecutor = require('../../../core/service-executor');

const BaseModule = require('../../_shared/base-module');
const CSV_COLUMNS = [
  'Fecha', 'Num_Factura', 'NIF_Emisor', 'Nombre_Emisor', 'Concepto',
  'Base_Imponible', 'Tipo_IVA', 'Cuota_IVA', 'Total', 'Forma_Pago', 'Archivo_Origen'
];

class AsesoriaModule extends BaseModule {
  constructor() {
    super();
    this.name = 'asesoria';
    this.version = '2.0.0';
    this.services = null;
    this.config = {
      csv: { separator: ';', decimal: ',', bom: true },
      timeouts: { db: 30000, zip: 60000 }
    };
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics || null;
    this.eventBus = core.eventBus;
    this.services = new ServiceExecutor(this.eventBus, this.logger);

    if (core.moduleConfig) {
      Object.assign(this.config, core.moduleConfig);
    } else if (core.config?.asesoria) {
      Object.assign(this.config, core.config.asesoria);
    }

    this.logger.info('asesoria.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger?.info?.('asesoria.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?._code || err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'FILESYSTEM_ERROR' };
    if (code === 'INVALID_INPUT') return { status: 400, code: 'INVALID_INPUT' };
    if (code === 'RESOURCE_NOT_FOUND') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrad|no hay/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/timeout|timed out/i.test(msg)) return { status: 504, code: 'TIMEOUT' };
    if (/dependency|service|unavailable/i.test(msg)) return { status: 503, code: 'DEPENDENCY_UNAVAILABLE' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('asesoria.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  _validateRequiredFields(data, fields) {
    const missing = fields.filter(f => data?.[f] === undefined || data?.[f] === null || data?.[f] === '');
    if (missing.length > 0) {
      const err = new Error(`Campos requeridos faltantes: ${missing.join(', ')}`);
      err._code = 'INVALID_INPUT';
      throw err;
    }
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      payload?.projectId ??
      sourcePayload?.project_id ??
      sourcePayload?.projectId ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('asesoria.publish.failed', {
        event: name, error_message: err.message
      });
    }
    return enriched;
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGenerarPaquete(data) {
    try {
      this._validateRequiredFields(data, ['proyecto']);
      const { proyecto, periodo, incluirOriginales = true, correlation_id } = data;

      const result = await this._generarPaquete(proyecto, { periodo, incluirOriginales, correlation_id });

      if (!result.success) {
        await this._publicarEvento('asesoria.paquete.error', {
          projectId: proyecto,
          error: result.error,
          correlation_id
        });
        return this._errorResponse(400, 'RESOURCE_NOT_FOUND', result.error);
      }

      if (result.archivo && fs.existsSync(result.archivo)) {
        result.contenido = fs.readFileSync(result.archivo, 'base64');
        result.mimeType = 'application/zip';
      }

      return { status: 200, data: result };
    } catch (err) {
      await this._publicarEvento('asesoria.paquete.error', {
        projectId: data?.proyecto,
        error: err.message,
        correlation_id: data?.correlation_id
      });
      return this._handleHandlerError('asesoria.generar-paquete.error', err, 'ui_handler');
    }
  }

  async handleHistorial(data) {
    try {
      this._validateRequiredFields(data, ['proyecto']);
      const { proyecto } = data;
      const paquetes = this._listarPaquetes(proyecto);
      return { status: 200, data: { paquetes, total: paquetes.length } };
    } catch (err) {
      return this._handleHandlerError('asesoria.historial.error', err, 'ui_handler');
    }
  }

  async handleDescargar(data) {
    try {
      this._validateRequiredFields(data, ['proyecto', 'archivo']);
      const { proyecto, archivo } = data;

      const exportDir = this._getExportDir(proyecto);
      const filePath = path.join(exportDir, path.basename(archivo));

      if (!fs.existsSync(filePath)) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Archivo no encontrado');
      }

      const contenido = fs.readFileSync(filePath, 'base64');
      const nombre = path.basename(filePath);
      const mimeType = nombre.endsWith('.zip') ? 'application/zip' : 'text/csv';

      return { status: 200, data: { nombre, contenido, mimeType } };
    } catch (err) {
      return this._handleHandlerError('asesoria.descargar.error', err, 'ui_handler');
    }
  }

  async handlePreview(data) {
    try {
      this._validateRequiredFields(data, ['proyecto']);
      const { proyecto, periodo } = data;

      const facturas = await this._obtenerFacturasProcesadas(proyecto, periodo);
      const totales = this._calcularTotales(facturas);

      return {
        status: 200,
        data: {
          facturas: facturas.length,
          periodo: periodo || 'todos',
          totales,
          desglose: facturas.map(f => ({
            id: f.id,
            fecha: f.factura_fecha,
            numero: f.factura_numero,
            proveedor: f.proveedor_nombre,
            total: f.total_factura
          }))
        }
      };
    } catch (err) {
      return this._handleHandlerError('asesoria.preview.error', err, 'ui_handler');
    }
  }

  async handleHealth(_data) {
    return {
      status: 200,
      data: {
        module: this.name,
        version: this.version,
        config: { csv: this.config.csv, timeouts: this.config.timeouts }
      }
    };
  }

  // ==========================================
  // AI Tool Handlers
  // ==========================================

  async handleToolGenerarPaquete(args) {
    try {
      this._validateRequiredFields(args, ['projectId']);
      const { projectId, periodo, incluirOriginales = true, correlation_id } = args;

      const result = await this._generarPaquete(projectId, { periodo, incluirOriginales, correlation_id });

      if (!result.success) {
        await this._publicarEvento('asesoria.paquete.error', {
          projectId, error: result.error, correlation_id
        });
        return this._errorResponse(400, 'RESOURCE_NOT_FOUND', result.error);
      }

      return { status: 200, data: result };
    } catch (err) {
      await this._publicarEvento('asesoria.paquete.error', {
        projectId: args?.projectId,
        error: err.message,
        correlation_id: args?.correlation_id
      });
      return this._handleHandlerError('asesoria.tool.generar-paquete.error', err, 'tool');
    }
  }

  async handleToolHistorial(args) {
    return this.handleHistorial({ proyecto: args?.projectId });
  }

  // ==========================================
  // Core: Generar paquete
  // ==========================================

  async _generarPaquete(projectId, options = {}) {
    const { periodo = null, incluirOriginales = true, correlation_id = null } = options;
    const startTime = Date.now();

    this.logger.info('asesoria.generando-paquete', { projectId, periodo, incluirOriginales });

    const facturas = await this._obtenerFacturasProcesadas(projectId, periodo);

    if (facturas.length === 0) {
      return { success: false, error: 'No hay facturas procesadas para el periodo especificado' };
    }

    const exportDir = this._getExportDir(projectId);
    fs.mkdirSync(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().slice(0, 10);
    const periodoSuffix = periodo ? `_${periodo}` : '';
    const baseName = `asesoria${periodoSuffix}_${timestamp}`;

    const csvPath = path.join(exportDir, `${baseName}.csv`);
    this._generarCSV(csvPath, facturas);

    const totales = this._calcularTotales(facturas);
    const resumenPath = path.join(exportDir, `${baseName}_resumen.txt`);
    this._generarResumen(resumenPath, facturas, totales, periodo);

    const zipPath = path.join(exportDir, `${baseName}.zip`);
    await this._crearZIP(zipPath, csvPath, resumenPath, facturas, incluirOriginales);

    this._limpiarTemporales(csvPath, resumenPath);

    const duration = Date.now() - startTime;

    this.metrics?.increment?.('asesoria.paquetes.generados.total');
    this.metrics?.timing?.('asesoria.generacion.duration', duration);

    await this._publicarEvento('asesoria.paquete.generado', {
      projectId,
      archivo: zipPath,
      facturas: facturas.length,
      periodo: periodo || 'todos',
      totales,
      duration_ms: duration,
      correlation_id
    });

    this.logger.info('asesoria.paquete.generado', {
      archivo: zipPath, facturas: facturas.length, duration_ms: duration
    });

    return {
      success: true,
      archivo: zipPath,
      nombre: path.basename(zipPath),
      facturas: facturas.length,
      periodo: periodo || 'todos',
      totales,
      duration_ms: duration
    };
  }

  // ==========================================
  // Data: Leer facturas de facturas-db
  // ==========================================

  async _obtenerFacturasProcesadas(projectId, periodo) {
    const result = await this.services.call(
      'local.facturas-db', 'listar',
      { proyecto: projectId, estado: 'procesada', limit: 1000 },
      { timeout: this.config.timeouts.db }
    );

    const data = result?.data || result;
    let facturas = data?.facturas || [];

    if (periodo) {
      facturas = facturas.filter(f => (f.factura_fecha || '').startsWith(periodo));
    }

    facturas.sort((a, b) => (a.factura_fecha || '').localeCompare(b.factura_fecha || ''));

    return facturas;
  }

  // ==========================================
  // CSV / Resumen / ZIP
  // ==========================================

  _generarCSV(outputPath, facturas) {
    const sep = this.config.csv.separator;
    const BOM = this.config.csv.bom ? '﻿' : '';

    let csv = BOM + CSV_COLUMNS.join(sep) + '\n';

    for (const f of facturas) {
      const row = [
        f.factura_fecha || '', f.factura_numero || '',
        f.proveedor_nif || '', f.proveedor_nombre || '',
        f.concepto || '',
        this._formatNumber(f.base_imponible), this._formatNumber(f.tipo_iva),
        this._formatNumber(f.cuota_iva), this._formatNumber(f.total_factura),
        f.metodo_pago || '', f.nombre_archivo || ''
      ];
      csv += row.map(v => this._escapeCsv(v)).join(sep) + '\n';
    }

    const totales = this._calcularTotales(facturas);
    const totalRow = [
      '', '', '', 'TOTALES', '',
      this._formatNumber(totales.base), '',
      this._formatNumber(totales.iva), this._formatNumber(totales.total),
      '', ''
    ];
    csv += totalRow.map(v => this._escapeCsv(v)).join(sep) + '\n';

    fs.writeFileSync(outputPath, csv, 'utf-8');
    return outputPath;
  }

  _generarResumen(outputPath, facturas, totales, periodo) {
    const fecha = new Date().toLocaleDateString('es-ES');
    const lines = [
      '='.repeat(50),
      'RESUMEN PAQUETE ASESORIA',
      '='.repeat(50), '',
      `Fecha generacion: ${fecha}`,
      `Periodo: ${periodo || 'Todos'}`,
      `Facturas incluidas: ${facturas.length}`, '',
      '-'.repeat(30), 'TOTALES', '-'.repeat(30),
      `Base imponible: ${totales.base.toFixed(2)} EUR`,
      `IVA: ${totales.iva.toFixed(2)} EUR`,
      `Total: ${totales.total.toFixed(2)} EUR`, '',
      '-'.repeat(30), 'DETALLE', '-'.repeat(30)
    ];

    for (const f of facturas) {
      lines.push(
        `${f.factura_fecha || 'sin fecha'} | ${f.factura_numero || 'sin nº'} | ${f.proveedor_nombre || 'desconocido'} | ${parseFloat(f.total_factura || 0).toFixed(2)} EUR`
      );
    }

    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  }

  async _crearZIP(zipPath, csvPath, resumenPath, facturas, incluirOriginales) {
    const files = [
      { source: csvPath, name: path.basename(csvPath) },
      { source: resumenPath, name: 'resumen.txt' }
    ];

    if (incluirOriginales) {
      for (const f of facturas) {
        const originalPath = f.path_original;
        if (originalPath && fs.existsSync(originalPath)) {
          files.push({
            source: originalPath,
            name: `originales/${f.nombre_archivo || path.basename(originalPath)}`
          });
        }
      }
    }

    const cwd = process.cwd();
    const relativeFiles = files.map(f => ({
      source: f.source.startsWith(cwd) ? path.relative(cwd, f.source) : f.source,
      name: f.name
    }));
    const relativeOutput = zipPath.startsWith(cwd) ? path.relative(cwd, zipPath) : zipPath;

    const result = await this.services.call('local.zip', 'createFromFiles', {
      files: relativeFiles, output: relativeOutput
    }, { timeout: this.config.timeouts.zip });

    const data = result?.data || result;
    if (!data?.success) {
      const err = new Error(`Error creando ZIP: ${data?.error || 'desconocido'}`);
      err._code = 'DEPENDENCY_UNAVAILABLE';
      throw err;
    }

    this.logger.info('asesoria.zip.creado', {
      path: zipPath, files: data.files, size: data.size
    });

    return zipPath;
  }

  // ==========================================
  // Historial
  // ==========================================

  _listarPaquetes(projectId) {
    const exportDir = this._getExportDir(projectId);
    if (!fs.existsSync(exportDir)) return [];

    return fs.readdirSync(exportDir)
      .filter(f => f.endsWith('.zip'))
      .map(nombre => {
        const filePath = path.join(exportDir, nombre);
        const stats = fs.statSync(filePath);
        return {
          nombre, path: filePath, size: stats.size,
          fecha: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  // ==========================================
  // Helpers
  // ==========================================

  _getExportDir(projectId) {
    return path.join(process.cwd(), 'data/projects', projectId, 'storage', 'export', 'asesoria');
  }

  _calcularTotales(facturas) {
    return facturas.reduce((acc, f) => {
      acc.base += parseFloat(f.base_imponible) || 0;
      acc.iva += parseFloat(f.cuota_iva) || 0;
      acc.total += parseFloat(f.total_factura) || 0;
      return acc;
    }, { base: 0, iva: 0, total: 0 });
  }

  _escapeCsv(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(this.config.csv.separator) || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  _formatNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2).replace('.', this.config.csv.decimal);
  }

  _limpiarTemporales(...paths) {
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (_) { /* non critical */ }
    }
  }
}

module.exports = AsesoriaModule;
