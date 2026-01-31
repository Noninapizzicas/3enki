/**
 * Utilidades compartidas para handlers Event-Core
 *
 * Elimina duplicación entre handlers proporcionando funciones
 * comunes para resolución de rutas, búsqueda de archivos,
 * formateo y escape.
 *
 * Uso desde un handler:
 *   const utils = require('../lib/handler-utils');
 *   // o desde proyecto:
 *   const utils = require('../../../../lib/handler-utils');
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Extensiones válidas para documentos/facturas
const EXTENSIONES_IMAGEN = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'];
const EXTENSIONES_PDF = ['.pdf'];
const EXTENSIONES_DOCUMENTO = [...EXTENSIONES_IMAGEN, ...EXTENSIONES_PDF];

/**
 * Resuelve la ruta de storage para un handler.
 *
 * Prioridad:
 * 1. config.storage.base (configuración explícita del proyecto)
 * 2. Derivar de projectId si existe
 * 3. Derivar de filePath si contiene data/bots/{botName}/
 *
 * @param {object} options
 * @param {object} options.config - Config del handler context
 * @param {string} options.projectId - ProjectId del handler context
 * @param {string} [options.filePath] - Ruta del archivo (fallback)
 * @param {string} [options.subdir] - Subdirectorio dentro de storage (ej: 'ocr', 'procesadas')
 * @returns {string} Ruta absoluta al directorio de storage
 */
function resolveStoragePath({ config, projectId, filePath, subdir }) {
  let base = config?.storage?.base;

  if (!base && projectId) {
    base = path.join(process.cwd(), 'data/projects', projectId, 'storage');
  }

  if (!base && filePath) {
    const pid = resolveProjectFromPath(filePath);
    if (pid) {
      base = path.join(process.cwd(), 'data/projects', pid, 'storage');
    }
  }

  if (!base) {
    base = path.join(process.cwd(), 'data/storage');
  }

  const dir = subdir ? path.join(base, subdir) : base;

  // Crear directorio si no existe
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

/**
 * Intenta derivar un projectId desde la ruta de un archivo.
 *
 * Patrones soportados:
 * - data/bots/{botName}/received/ → busca proyecto por botName
 * - data/projects/{projectId}/ → extrae directamente
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function resolveProjectFromPath(filePath) {
  if (!filePath) return null;

  // Patrón: data/projects/{projectId}/...
  const projectMatch = filePath.match(/data\/projects\/([^/]+)/);
  if (projectMatch) {
    return projectMatch[1];
  }

  // Patrón: data/bots/{botName}/...
  const botMatch = filePath.match(/data\/bots\/([^/]+)/);
  if (botMatch) {
    return findProjectByBot(botMatch[1]);
  }

  return null;
}

/**
 * Busca el proyecto que tiene configurado un bot de Telegram.
 *
 * Lee configs de data/projects/{id}/config/config.json y busca
 * coincidencia en config.telegram.botName.
 *
 * @param {string} botName - Nombre del bot (ej: facturas_noninapizzicas_bot)
 * @returns {string|null} ProjectId o null
 */
function findProjectByBot(botName) {
  if (!botName) return null;

  const projectsDir = path.join(process.cwd(), 'data/projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const configPath = path.join(projectsDir, entry.name, 'config/config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.telegram?.botName === botName) {
          return config.id || entry.name;
        }
      }
    }
  } catch (e) { /* fallback si no se puede leer */ }

  // Fallback: derivar por convención (facturas_xxx_bot → facturas-xxx)
  return botName.replace(/_bot$/, '').replace(/_/g, '-');
}

/**
 * Busca el archivo más reciente en un directorio.
 *
 * @param {string} dir - Directorio donde buscar
 * @param {string[]} [extensions] - Extensiones válidas (default: imágenes)
 * @returns {{ path: string, name: string, mtime: Date }|null}
 */
function findLatestFile(dir, extensions = EXTENSIONES_IMAGEN) {
  if (!dir || !fs.existsSync(dir)) return null;

  try {
    const files = fs.readdirSync(dir)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return extensions.includes(ext);
      })
      .map(f => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        return { path: fullPath, name: f, mtime: stat.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Busca archivos válidos en un directorio (recursivo).
 *
 * @param {string} dir - Directorio raíz
 * @param {string[]} [extensions] - Extensiones válidas (default: documentos)
 * @returns {{ path: string, name: string, ext: string }[]}
 */
function findFiles(dir, extensions = EXTENSIONES_DOCUMENTO) {
  const archivos = [];
  if (!dir || !fs.existsSync(dir)) return archivos;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursivo (ignorar directorios ocultos y archived)
        if (!entry.name.startsWith('.') && entry.name !== 'archived') {
          archivos.push(...findFiles(fullPath, extensions));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          archivos.push({ path: fullPath, name: entry.name, ext });
        }
      }
    }
  } catch (e) {
    // Ignorar errores de lectura
  }

  return archivos;
}

/**
 * Genera un nombre de archivo con timestamp.
 *
 * @param {string} originalName - Nombre original del archivo
 * @param {string} [suffix] - Sufijo opcional (ej: '_prep', '_ocr')
 * @param {string} [newExt] - Nueva extensión (ej: '.txt', '.json')
 * @returns {string}
 */
function generateFileName(originalName, suffix = '', newExt = null) {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const base = path.basename(originalName, path.extname(originalName));
  const ext = newExt || path.extname(originalName);
  return `${timestamp}_${base}${suffix}${ext}`;
}

/**
 * Resuelve ruta absoluta de un archivo.
 *
 * @param {string} filePath
 * @returns {string}
 */
function resolveAbsolutePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
}

// ============================================
// Formateo y escape
// ============================================

/**
 * Formatea número como moneda española (2 decimales, coma).
 *
 * @param {number|string} value
 * @param {string} [currency='€']
 * @returns {string}
 */
function formatMoney(value, currency = '€') {
  if (value === null || value === undefined) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + (currency ? ` ${currency}` : '');
}

/**
 * Formatea número con 2 decimales usando coma (CSV español).
 *
 * @param {number|string} value
 * @returns {string}
 */
function formatNumberCSV(value) {
  if (value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  return num.toFixed(2).replace('.', ',');
}

/**
 * Escapa valor para CSV con punto y coma como separador.
 *
 * @param {*} value
 * @returns {string}
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Escapa HTML para mensajes de Telegram.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitiza string para uso como nombre de archivo.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitizeFileName(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Mueve archivo (rename si mismo filesystem, copy+delete si no).
 *
 * @param {string} src - Ruta origen
 * @param {string} dest - Ruta destino
 */
function moveFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

// ============================================
// Constantes de eventos estandarizados
// ============================================

const EVENTS = {
  // Telegram (usar siempre estos)
  TELEGRAM_SEND_MESSAGE: 'telegram.send_message.request',
  TELEGRAM_SEND_DOCUMENT: 'telegram.send_document.request',
  BOT_COMMAND: 'bot.command.received',

  // Pipeline de documentos
  IMAGEN_PREPARAR: 'imagen.preparar.request',
  IMAGEN_PREPARADA: 'imagen.preparada',
  IMAGEN_OPTIMIZAR: 'imagen.optimizar.request',
  IMAGEN_OPTIMIZADA: 'imagen.optimizada',

  OCR_REQUEST: 'documento.ocr.request',
  OCR_COMPLETADO: 'documento.ocr.completado',
  OCR_ERROR: 'documento.ocr.error',

  TEXTO_ESTRUCTURAR: 'texto.estructurar.request',
  TEXTO_ESTRUCTURADO: 'texto.estructurado',
  TEXTO_ESTRUCTURAR_ERROR: 'texto.estructurar.error',

  // Factura
  FACTURA_PROCESAR: 'factura.procesar.request',
  FACTURA_VALIDADA: 'factura.validada',
  FACTURA_REVISION: 'factura.necesita_revision',
  FACTURA_PROCESADA: 'factura.procesada',
  FACTURA_GUARDADA: 'factura.guardada',
  FACTURA_ERROR: 'factura.error',

  // CSV
  CSV_GENERAR: 'csv.asesoria.generar',
  CSV_GENERADO: 'csv.asesoria.generado',
  CSV_ERROR: 'csv.asesoria.error',

  // Gmail
  GMAIL_CHECK: 'gmail.check',
  GMAIL_MESSAGE_FOUND: 'gmail.message.found',
  GMAIL_FILE_STORED: 'gmail.file.stored',

  // Aprendizaje
  APRENDIZAJE_FEEDBACK: 'aprendizaje.feedback'
};

module.exports = {
  // Resolución de rutas
  resolveStoragePath,
  resolveProjectFromPath,
  resolveAbsolutePath,
  findProjectByBot,

  // Búsqueda de archivos
  findLatestFile,
  findFiles,

  // Archivos
  generateFileName,
  sanitizeFileName,
  moveFile,

  // Formateo
  formatMoney,
  formatNumberCSV,
  escapeCsv,
  escapeHtml,

  // Constantes
  EVENTS,
  EXTENSIONES_IMAGEN,
  EXTENSIONES_PDF,
  EXTENSIONES_DOCUMENTO
};
