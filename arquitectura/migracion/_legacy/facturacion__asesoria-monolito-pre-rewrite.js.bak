/**
 * Módulo Asesoría
 *
 * Genera paquetes para la asesoría contable:
 *   CSV con datos de facturas + ZIP con archivos originales
 *
 * Responsabilidad única: empaquetar y exportar.
 * NO procesa facturas, NO modifica datos — solo lee de facturas-db.
 *
 * Expone:
 * - UI handlers (domain: asesoria) para el frontend
 * - Tools para AI agents
 * - Eventos: asesoria.paquete.generado / error
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');
const ServiceExecutor = require('../../../core/service-executor');

// Columnas CSV para asesoría (formato contabilidad española)
const CSV_COLUMNS = [
  'Fecha',
  'Num_Factura',
  'NIF_Emisor',
  'Nombre_Emisor',
  'Concepto',
  'Base_Imponible',
  'Tipo_IVA',
  'Cuota_IVA',
  'Total',
  'Forma_Pago',
  'Archivo_Origen'
];


class AsesoriaModule {
  constructor() {
    this.name = 'asesoria';
    this.version = '1.0.0';

    // Injected by loader
    this.logger = null;
    this.eventBus = null;
    this.uiHandler = null;

    // Service executor
    this.services = null;

    // Active project

    // Config (from module.json)
    this.config = {
      csv: { separator: ';', decimal: ',', bom: true },
      timeouts: { db: 30000, zip: 60000 }
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;

    this.services = new ServiceExecutor(this.eventBus, this.logger);

    if (context.config?.asesoria) {
      Object.assign(this.config, context.config.asesoria);
    }

    this.logger.info('asesoria.loaded');
  }

  async onUnload() {
    this.logger.info('asesoria.unloaded');
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  /**
   * Generar paquete para asesoría
   * UI: mqttRequest('asesoria', 'generar-paquete', { proyecto, periodo?, incluirOriginales? })
   */
  async handleGenerarPaquete(data) {
    const { proyecto, periodo, incluirOriginales = true } = data;
    if (!proyecto) {
      return { status: 400, error: 'proyecto es requerido' };
    }

    try {
      const result = await this.generarPaquete(proyecto, { periodo, incluirOriginales });

      if (!result.success) {
        return { status: 400, data: result };
      }

      // Leer ZIP y devolverlo como base64 para descarga directa en el frontend
      if (result.archivo && fs.existsSync(result.archivo)) {
        result.contenido = fs.readFileSync(result.archivo, 'base64');
        result.mimeType = 'application/zip';
      }

      return { status: 200, data: result };
    } catch (e) {
      this.logger.error('asesoria.generar-paquete.error', { error: e.message, proyecto });
      return { status: 500, error: e.message };
    }
  }

  /**
   * Listar paquetes generados
   * UI: mqttRequest('asesoria', 'historial', { proyecto })
   */
  async handleHistorial(data) {
    const { proyecto } = data;
    if (!proyecto) {
      return { status: 400, error: 'proyecto es requerido' };
    }

    try {
      const paquetes = this.listarPaquetes(proyecto);
      return { status: 200, data: { paquetes, total: paquetes.length } };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }

  /**
   * Descargar paquete
   * UI: mqttRequest('asesoria', 'descargar', { proyecto, archivo })
   */
  async handleDescargar(data) {
    const { proyecto, archivo } = data;
    if (!proyecto || !archivo) {
      return { status: 400, error: 'proyecto y archivo son requeridos' };
    }

    const exportDir = this.getExportDir(proyecto);
    const filePath = path.join(exportDir, path.basename(archivo));

    if (!fs.existsSync(filePath)) {
      return { status: 404, error: 'Archivo no encontrado' };
    }

    // Leer y devolver contenido base64 para descarga en el frontend
    const contenido = fs.readFileSync(filePath, 'base64');
    const nombre = path.basename(filePath);
    const mimeType = nombre.endsWith('.zip') ? 'application/zip' : 'text/csv';

    return {
      status: 200,
      data: { nombre, contenido, mimeType }
    };
  }

  /**
   * Preview: qué se incluiría en el paquete sin generarlo
   * UI: mqttRequest('asesoria', 'preview', { proyecto, periodo? })
   */
  async handlePreview(data) {
    const { proyecto, periodo } = data;
    if (!proyecto) {
      return { status: 400, error: 'proyecto es requerido' };
    }

    try {
      const facturas = await this.obtenerFacturasProcesadas(proyecto, periodo);

      const totales = this.calcularTotales(facturas);

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
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }

  // ==========================================
  // AI Tool Handlers
  // ==========================================

  async handleToolGenerarPaquete(args) {
    const { projectId, periodo, incluirOriginales = true } = args;
    if (!projectId) {
      return { status: 400, data: { error: 'projectId es requerido' } };
    }

    const result = await this.generarPaquete(projectId, { periodo, incluirOriginales });
    return { status: result.success ? 200 : 500, data: result };
  }

  async handleToolHistorial(args) {
    return this.handleHistorial({ proyecto: args.projectId });
  }

  // ==========================================
  // Core: Generar paquete
  // ==========================================

  async generarPaquete(projectId, options = {}) {
    const { periodo = null, incluirOriginales = true } = options;
    const startTime = Date.now();

    this.logger.info('asesoria.generando-paquete', { projectId, periodo, incluirOriginales });

    // 1. Obtener facturas procesadas
    const facturas = await this.obtenerFacturasProcesadas(projectId, periodo);

    if (facturas.length === 0) {
      return { success: false, error: 'No hay facturas procesadas para el periodo especificado' };
    }

    // 2. Preparar directorio de salida
    const exportDir = this.getExportDir(projectId);
    fs.mkdirSync(exportDir, { recursive: true });

    const timestamp = new Date().toISOString().slice(0, 10);
    const periodoSuffix = periodo ? `_${periodo}` : '';
    const baseName = `asesoria${periodoSuffix}_${timestamp}`;

    // 3. Generar CSV
    const csvPath = path.join(exportDir, `${baseName}.csv`);
    this.generarCSV(csvPath, facturas);

    // 4. Generar resumen
    const totales = this.calcularTotales(facturas);
    const resumenPath = path.join(exportDir, `${baseName}_resumen.txt`);
    this.generarResumen(resumenPath, facturas, totales, periodo);

    // 5. Crear ZIP con CSV + resumen + originales
    const zipPath = path.join(exportDir, `${baseName}.zip`);
    await this.crearZIP(zipPath, csvPath, resumenPath, facturas, incluirOriginales);

    // 6. Limpiar archivos sueltos (ya están en el ZIP)
    this.limpiarTemporales(csvPath, resumenPath);

    // 7. Emitir evento
    const duration = Date.now() - startTime;
    this.eventBus.publish('asesoria.paquete.generado', {
      projectId,
      archivo: zipPath,
      facturas: facturas.length,
      periodo: periodo || 'todos',
      totales,
      duration_ms: duration
    });

    this.logger.info('asesoria.paquete.generado', {
      archivo: zipPath,
      facturas: facturas.length,
      duration_ms: duration
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

  async obtenerFacturasProcesadas(projectId, periodo) {
    // Pedimos todas las procesadas — el filtro por periodo se hace sobre factura_fecha,
    // no sobre fecha_entrada (una factura de marzo puede haberse subido en abril)
    const result = await this.services.call(
      'local.facturas-db', 'listar',
      { proyecto: projectId, estado: 'procesada', limit: 1000 },
      { timeout: this.config.timeouts.db }
    );

    const data = result.data || result;
    let facturas = data.facturas || [];

    // Filtrar por periodo (YYYY-MM) usando la fecha de la factura
    if (periodo) {
      facturas = facturas.filter(f => {
        const fecha = f.factura_fecha || '';
        return fecha.startsWith(periodo);
      });
    }

    // Ordenar por fecha de factura ascendente
    facturas.sort((a, b) => {
      const fa = a.factura_fecha || '';
      const fb = b.factura_fecha || '';
      return fa.localeCompare(fb);
    });

    return facturas;
  }

  // ==========================================
  // CSV Generation
  // ==========================================

  generarCSV(outputPath, facturas) {
    const sep = this.config.csv.separator;
    const BOM = this.config.csv.bom ? '\uFEFF' : '';

    let csv = BOM + CSV_COLUMNS.join(sep) + '\n';

    for (const f of facturas) {
      const row = [
        f.factura_fecha || '',
        f.factura_numero || '',
        f.proveedor_nif || '',
        f.proveedor_nombre || '',
        f.concepto || '',
        this.formatNumber(f.base_imponible),
        this.formatNumber(f.tipo_iva),
        this.formatNumber(f.cuota_iva),
        this.formatNumber(f.total_factura),
        f.metodo_pago || '',
        f.nombre_archivo || ''
      ];

      csv += row.map(v => this.escapeCsv(v)).join(sep) + '\n';
    }

    // Fila de totales
    const totales = this.calcularTotales(facturas);
    const totalRow = [
      '', '', '', 'TOTALES', '',
      this.formatNumber(totales.base),
      '',
      this.formatNumber(totales.iva),
      this.formatNumber(totales.total),
      '', ''
    ];
    csv += totalRow.map(v => this.escapeCsv(v)).join(sep) + '\n';

    fs.writeFileSync(outputPath, csv, 'utf-8');
    return outputPath;
  }

  // ==========================================
  // Resumen text file
  // ==========================================

  generarResumen(outputPath, facturas, totales, periodo) {
    const fecha = new Date().toLocaleDateString('es-ES');
    const lines = [
      '='.repeat(50),
      'RESUMEN PAQUETE ASESORÍA',
      '='.repeat(50),
      '',
      `Fecha generación: ${fecha}`,
      `Periodo: ${periodo || 'Todos'}`,
      `Facturas incluidas: ${facturas.length}`,
      '',
      '-'.repeat(30),
      'TOTALES',
      '-'.repeat(30),
      `Base imponible: ${totales.base.toFixed(2)} €`,
      `IVA: ${totales.iva.toFixed(2)} €`,
      `Total: ${totales.total.toFixed(2)} €`,
      '',
      '-'.repeat(30),
      'DETALLE',
      '-'.repeat(30),
    ];

    for (const f of facturas) {
      lines.push(
        `${f.factura_fecha || 'sin fecha'} | ${f.factura_numero || 'sin nº'} | ${f.proveedor_nombre || 'desconocido'} | ${parseFloat(f.total_factura || 0).toFixed(2)} €`
      );
    }

    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  }

  // ==========================================
  // ZIP: Empaquetar CSV + originales
  // ==========================================

  async crearZIP(zipPath, csvPath, resumenPath, facturas, incluirOriginales) {
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

    // Llamar al servicio ZIP via ServiceExecutor
    // El zip service usa resolvePath que transforma rutas con / → data/...
    // Para evitar esto, pasamos rutas relativas al cwd
    const cwd = process.cwd();
    const relativeFiles = files.map(f => ({
      source: f.source.startsWith(cwd) ? path.relative(cwd, f.source) : f.source,
      name: f.name
    }));
    const relativeOutput = zipPath.startsWith(cwd) ? path.relative(cwd, zipPath) : zipPath;

    const result = await this.services.call('local.zip', 'createFromFiles', {
      files: relativeFiles,
      output: relativeOutput
    }, { timeout: this.config.timeouts.zip });

    const data = result.data || result;
    if (!data.success) {
      throw new Error(`Error creando ZIP: ${data.error || 'desconocido'}`);
    }

    this.logger.info('asesoria.zip.creado', {
      path: zipPath,
      files: data.files,
      size: data.size
    });

    return zipPath;
  }

  // ==========================================
  // Historial: Leer paquetes del filesystem
  // ==========================================

  listarPaquetes(projectId) {
    const exportDir = this.getExportDir(projectId);

    if (!fs.existsSync(exportDir)) {
      return [];
    }

    return fs.readdirSync(exportDir)
      .filter(f => f.endsWith('.zip'))
      .map(nombre => {
        const filePath = path.join(exportDir, nombre);
        const stats = fs.statSync(filePath);
        return {
          nombre,
          path: filePath,
          size: stats.size,
          fecha: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  // ==========================================
  // Helpers
  // ==========================================

  getExportDir(projectId) {
    return path.join(process.cwd(), 'data/projects', projectId, 'storage', 'export', 'asesoria');
  }

  calcularTotales(facturas) {
    return facturas.reduce((acc, f) => {
      acc.base += parseFloat(f.base_imponible) || 0;
      acc.iva += parseFloat(f.cuota_iva) || 0;
      acc.total += parseFloat(f.total_factura) || 0;
      return acc;
    }, { base: 0, iva: 0, total: 0 });
  }

  escapeCsv(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(this.config.csv.separator) || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  formatNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2).replace('.', this.config.csv.decimal);
  }

  limpiarTemporales(...paths) {
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {
        // No critical
      }
    }
  }
}

module.exports = AsesoriaModule;
