/**
 * Handler: Generar CSV para Asesoría
 *
 * Genera un archivo CSV con las facturas procesadas, formateado
 * para importación en programas de contabilidad/asesoría.
 *
 * ENTRADA (evento): csv.asesoria.generar
 * {
 *   projectId: string,       // ID del proyecto
 *   periodo: string,         // Opcional: 'YYYY-MM' para filtrar
 *   notificar: object        // Opcional: datos para notificación
 * }
 *
 * También escucha: factura.guardada (acumula en memoria para export batch)
 *
 * SALIDA (evento): csv.asesoria.generado
 * {
 *   archivo: string,         // Ruta del CSV generado
 *   facturas: number,        // Número de facturas incluidas
 *   periodo: string,
 *   notificar: object
 * }
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Columnas del CSV para asesoría (formato estándar contabilidad española)
const CSV_COLUMNS = [
  'Fecha',
  'Numero',
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

/**
 * Escapa valor para CSV
 */
function escapeCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // Si contiene comas, comillas o saltos de línea, entrecomillar
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formatea número para CSV (usa coma como decimal para España)
 */
function formatNumber(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  return num.toFixed(2).replace('.', ',');
}

/**
 * Extrae descripción resumida de las líneas de factura
 */
function extraerConcepto(datos) {
  if (!datos.lineas || !Array.isArray(datos.lineas)) {
    return datos.observaciones || '';
  }

  // Tomar las primeras 3 descripciones
  const descripciones = datos.lineas
    .slice(0, 3)
    .map(l => l.descripcion)
    .filter(Boolean);

  if (descripciones.length === 0) return '';

  let concepto = descripciones.join('; ');
  if (datos.lineas.length > 3) {
    concepto += ` (+${datos.lineas.length - 3} más)`;
  }

  return concepto;
}

/**
 * Convierte datos de factura a fila CSV
 */
function facturaToRow(datos, archivoOrigen) {
  return [
    datos.factura?.fecha || '',
    datos.factura?.numero || '',
    datos.emisor?.nif || '',
    datos.emisor?.nombre || '',
    extraerConcepto(datos),
    formatNumber(datos.totales?.base_imponible),
    formatNumber(datos.totales?.iva_porcentaje),
    formatNumber(datos.totales?.iva_importe),
    formatNumber(datos.totales?.total),
    datos.forma_pago || '',
    archivoOrigen || ''
  ].map(escapeCsv).join(';'); // Usar ; como separador (estándar para Excel en español)
}

/**
 * Lee todos los JSON de facturas procesadas
 */
async function leerFacturasProcesadas(storageBase, periodo) {
  const procesadasDir = path.join(storageBase, 'procesadas');
  const facturas = [];

  if (!fs.existsSync(procesadasDir)) {
    return facturas;
  }

  const archivos = fs.readdirSync(procesadasDir)
    .filter(f => f.endsWith('.json'));

  for (const archivo of archivos) {
    try {
      const contenido = fs.readFileSync(path.join(procesadasDir, archivo), 'utf8');
      const datos = JSON.parse(contenido);

      // Filtrar por periodo si se especifica
      if (periodo) {
        const fechaFactura = datos.factura?.fecha || '';
        if (!fechaFactura.startsWith(periodo)) {
          continue;
        }
      }

      facturas.push({
        datos,
        archivo: archivo.replace('.json', '')
      });
    } catch (e) {
      // Ignorar archivos con errores
    }
  }

  // Ordenar por fecha
  facturas.sort((a, b) => {
    const fechaA = a.datos.factura?.fecha || '';
    const fechaB = b.datos.factura?.fecha || '';
    return fechaA.localeCompare(fechaB);
  });

  return facturas;
}

/**
 * Detecta ruta de storage desde projectId
 */
function getStoragePath(projectId) {
  return path.join(process.cwd(), 'data/projects', projectId, 'storage');
}

module.exports = {
  name: 'generar-csv-asesoria',
  description: 'Genera CSV de facturas para asesoría contable',
  trigger: 'csv.asesoria.generar',

  async handle(event, { logger, emit }) {
    const data = event.data || event;
    const {
      projectId,
      periodo,
      notificar
    } = data;

    logger.info('generar-csv-asesoria.inicio', { projectId, periodo });

    try {
      if (!projectId) {
        throw new Error('projectId es requerido');
      }

      const storageBase = getStoragePath(projectId);

      // Leer todas las facturas procesadas
      const facturas = await leerFacturasProcesadas(storageBase, periodo);

      if (facturas.length === 0) {
        logger.warn('generar-csv-asesoria.sin-facturas', { projectId, periodo });

        emit('csv.asesoria.error', {
          error: 'No hay facturas procesadas para el periodo especificado',
          projectId,
          periodo,
          notificar
        });

        return { success: false, error: 'Sin facturas' };
      }

      // Generar CSV
      const header = CSV_COLUMNS.join(';');
      const rows = facturas.map(f => facturaToRow(f.datos, f.archivo));
      const csvContent = [header, ...rows].join('\n');

      // Crear directorio de exports si no existe
      const exportsDir = path.join(storageBase, 'exports');
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      // Nombre del archivo
      const timestamp = new Date().toISOString().slice(0, 10);
      const periodoSuffix = periodo ? `_${periodo}` : '';
      const fileName = `facturas_asesoria_${timestamp}${periodoSuffix}.csv`;
      const filePath = path.join(exportsDir, fileName);

      // Escribir archivo con BOM para Excel
      const BOM = '\uFEFF';
      fs.writeFileSync(filePath, BOM + csvContent, 'utf8');

      logger.info('generar-csv-asesoria.completado', {
        archivo: filePath,
        facturas: facturas.length,
        periodo
      });

      // Calcular totales para el resumen
      const totales = facturas.reduce((acc, f) => {
        acc.base += parseFloat(f.datos.totales?.base_imponible) || 0;
        acc.iva += parseFloat(f.datos.totales?.iva_importe) || 0;
        acc.total += parseFloat(f.datos.totales?.total) || 0;
        return acc;
      }, { base: 0, iva: 0, total: 0 });

      emit('csv.asesoria.generado', {
        archivo: filePath,
        fileName,
        facturas: facturas.length,
        periodo: periodo || 'todos',
        totales: {
          base_imponible: totales.base.toFixed(2),
          iva: totales.iva.toFixed(2),
          total: totales.total.toFixed(2)
        },
        notificar
      });

      return { success: true, archivo: filePath, facturas: facturas.length };

    } catch (error) {
      logger.error('generar-csv-asesoria.error', {
        error: error.message,
        projectId
      });

      emit('csv.asesoria.error', {
        error: error.message,
        projectId,
        periodo,
        notificar
      });

      return { success: false, error: error.message };
    }
  }
};
