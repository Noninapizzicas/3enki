/**
 * Tesseract.js OCR Engine
 *
 * Engine builtin para OCR usando Tesseract.js
 * Soporta imágenes (jpg, png, etc.) y PDFs
 *
 * Nota: La primera ejecución descarga archivos de idioma (~15MB)
 */

const path = require('path');
const fs = require('fs');

// Capacidades del engine
const capabilities = ['image', 'pdf'];

// Idiomas soportados
const supportedLanguages = ['eng', 'spa', 'fra', 'deu', 'ita', 'por'];

// Configuración por defecto
const config = {
  defaultLanguage: 'eng',
  confidenceThreshold: 0.6,
  cachePath: path.join(__dirname, '..', 'data', 'tessdata')
};

// Estado del worker
let worker = null;
let initialized = false;
let currentLanguage = null;

/**
 * Inicializa el worker de Tesseract
 */
async function initWorker(language = 'eng') {
  // Si ya está inicializado con el mismo idioma, reutilizar
  if (worker && initialized && currentLanguage === language) {
    return true;
  }

  // Terminar worker anterior si existe
  if (worker) {
    try {
      await worker.terminate();
    } catch (e) {
      // Ignorar errores de terminación
    }
    worker = null;
    initialized = false;
  }

  try {
    const Tesseract = require('tesseract.js');

    // Asegurar que existe el directorio de cache
    if (!fs.existsSync(config.cachePath)) {
      fs.mkdirSync(config.cachePath, { recursive: true });
    }

    worker = await Tesseract.createWorker(language, 1, {
      langPath: config.cachePath,
      cacheMethod: 'none',
      gzip: false,
      logger: (m) => {
        // Solo loguear progreso significativo
        if (m.status === 'recognizing text' && m.progress > 0 && m.progress < 1) {
          // Progreso silencioso
        }
      }
    });

    initialized = true;
    currentLanguage = language;

    return true;

  } catch (error) {
    console.error('Tesseract init error:', error.message);
    initialized = false;
    return false;
  }
}

/**
 * Extrae texto de una imagen o PDF
 * @param {Buffer|string} input - Buffer de imagen o base64
 * @param {Object} options - Opciones de procesamiento
 * @returns {Object} { text, confidence, words, engine }
 */
async function extract(input, options = {}) {
  const language = options.language || config.defaultLanguage;

  // Validar idioma
  if (!supportedLanguages.includes(language)) {
    throw new Error(`Idioma no soportado: ${language}. Soportados: ${supportedLanguages.join(', ')}`);
  }

  // Inicializar worker
  const ready = await initWorker(language);

  if (!ready) {
    throw new Error(
      'Tesseract no disponible. Requiere descargar archivos de idioma (~15MB). ' +
      'Verifica la conexión a internet y reinicia el servidor.'
    );
  }

  // Preparar buffer
  let buffer;
  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (typeof input === 'string') {
    // Asumir base64
    buffer = Buffer.from(input, 'base64');
  } else {
    throw new Error('Input debe ser Buffer o string base64');
  }

  // Detectar tipo de archivo
  const fileType = detectFileType(buffer);

  if (fileType === 'pdf') {
    return extractFromPDF(buffer, options);
  }

  // Procesar imagen con Tesseract
  const { data } = await worker.recognize(buffer);

  return {
    text: data.text.trim(),
    confidence: data.confidence / 100,
    words: data.words?.length || 0,
    lines: data.lines?.length || 0,
    engine: 'tesseract',
    language: currentLanguage
  };
}

/**
 * Extrae texto de un PDF usando pdf-parse
 */
async function extractFromPDF(buffer, options = {}) {
  try {
    const pdfParse = require('pdf-parse');

    const data = await pdfParse(buffer, {
      max: options.maxPages || 0 // 0 = sin límite
    });

    return {
      text: data.text.trim(),
      confidence: 0.95, // PDF text extraction es generalmente preciso
      pages: data.numpages,
      engine: 'tesseract-pdf',
      info: {
        title: data.info?.Title,
        author: data.info?.Author
      }
    };

  } catch (error) {
    throw new Error(`Error procesando PDF: ${error.message}`);
  }
}

/**
 * Detecta el tipo de archivo por magic bytes
 */
function detectFileType(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image';
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image';
  }

  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image';
  }

  // WebP: RIFF....WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image';
  }

  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'image';
  }

  // Asumir imagen si no se reconoce
  return 'image';
}

/**
 * Preprocesa el texto extraído
 */
function preprocessText(text) {
  if (!text) return '';

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
}

/**
 * Limpieza de recursos
 */
async function terminate() {
  if (worker) {
    try {
      await worker.terminate();
    } catch (e) {
      // Ignorar errores de terminación
    }
    worker = null;
    initialized = false;
    currentLanguage = null;
  }
}

/**
 * Obtener idiomas soportados
 */
function getLanguages() {
  return supportedLanguages;
}

module.exports = {
  capabilities,
  config,
  supportedLanguages,
  extract,
  terminate,
  getLanguages,
  preprocessText
};
