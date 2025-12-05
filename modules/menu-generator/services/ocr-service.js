/**
 * OCR Service para Menu Generator
 * Extrae texto de imágenes (Tesseract.js) y PDFs (pdf-parse)
 * para enviar a DeepSeek en formato texto
 *
 * IMPORTANTE: Tesseract.js requiere descargar archivos de idioma (~15MB) la primera vez.
 * Si no hay conexión a internet, solo funcionará la extracción de PDFs.
 */

const pdfParse = require('pdf-parse');
const path = require('path');
const fs = require('fs');

class OCRService {
  constructor(logger) {
    this.logger = logger;
    this.worker = null;
    this.initialized = false;
    this.tesseractAvailable = false;
    this.initializationAttempted = false;
    this.langDataPath = path.join(__dirname, '..', 'tessdata');
  }

  /**
   * Intenta inicializar Tesseract de forma segura
   * Retorna true si está disponible, false si no
   */
  async tryInitializeTesseract() {
    if (this.initializationAttempted) {
      return this.tesseractAvailable;
    }

    this.initializationAttempted = true;

    // Verificar si ya existen los archivos de idioma descargados
    const engTrainedData = path.join(this.langDataPath, 'eng.traineddata.gz');
    const hasLocalData = fs.existsSync(engTrainedData);

    if (!hasLocalData) {
      this.logger?.warn('ocr.tesseract_needs_download', {
        message: 'Tesseract requiere descargar archivos de idioma. Solo PDFs serán soportados.',
        langDataPath: this.langDataPath
      });
      this.tesseractAvailable = false;
      return false;
    }

    try {
      this.logger?.info('ocr.initializing_tesseract', {
        localData: hasLocalData,
        langDataPath: this.langDataPath
      });

      const Tesseract = require('tesseract.js');

      // Crear directorio si no existe
      if (!fs.existsSync(this.langDataPath)) {
        fs.mkdirSync(this.langDataPath, { recursive: true });
      }

      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress) {
            this.logger?.debug('ocr.progress', { progress: Math.round(m.progress * 100) });
          }
        },
        cacheMethod: 'readOnly',
        cachePath: this.langDataPath
      });

      this.tesseractAvailable = true;
      this.logger?.info('ocr.tesseract_ready', { languages: ['eng'] });
      return true;

    } catch (error) {
      this.logger?.warn('ocr.tesseract_init_failed', {
        error: error.message,
        suggestion: 'Use PDFs instead of images'
      });
      this.tesseractAvailable = false;
      return false;
    }
  }

  /**
   * Extrae texto de un archivo (imagen o PDF)
   * @param {string} base64Data - Contenido del archivo en base64
   * @param {string} fileName - Nombre del archivo
   * @param {string} mimeType - Tipo MIME del archivo
   * @returns {Promise<{text: string, confidence: number, pages?: number}>}
   */
  async extractText(base64Data, fileName, mimeType) {
    const startTime = Date.now();

    this.logger?.info('ocr.extract.start', { fileName, mimeType });

    try {
      let result;

      if (mimeType === 'application/pdf') {
        // PDFs siempre funcionan - no requieren descarga
        result = await this.extractTextFromPDF(base64Data);
      } else if (mimeType.startsWith('image/')) {
        // Imágenes requieren Tesseract
        result = await this.extractTextFromImage(base64Data, mimeType);
      } else {
        throw new Error(`Tipo de archivo no soportado: ${mimeType}. Use imágenes (jpg, png) o PDFs.`);
      }

      const duration = Date.now() - startTime;

      this.logger?.info('ocr.extract.success', {
        fileName,
        textLength: result.text.length,
        confidence: result.confidence,
        pages: result.pages,
        duration
      });

      return result;
    } catch (error) {
      this.logger?.error('ocr.extract.error', {
        fileName,
        mimeType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extrae texto de una imagen usando Tesseract.js
   * Requiere que los archivos de idioma estén descargados
   */
  async extractTextFromImage(base64Data, mimeType) {
    // Para este entorno sin internet, mostrar mensaje claro
    // En producción con internet, Tesseract descargará los archivos automáticamente
    const canUseTesseract = await this.tryInitializeTesseract();

    if (!canUseTesseract) {
      throw new Error(
        'OCR de imágenes no disponible en este momento. ' +
        'Tesseract.js necesita descargar archivos de idioma (~15MB) la primera vez que se usa. ' +
        '\n\nAlternativas:\n' +
        '1. Usa un archivo PDF en lugar de imagen\n' +
        '2. Convierte la imagen a PDF antes de subirla\n' +
        '3. Conecta a internet y reinicia el servidor para habilitar OCR de imágenes'
      );
    }

    // Crear buffer desde base64
    const buffer = Buffer.from(base64Data, 'base64');

    // Reconocer texto
    const { data } = await this.worker.recognize(buffer);

    return {
      text: data.text.trim(),
      confidence: data.confidence / 100,
      words: data.words?.length || 0
    };
  }

  /**
   * Extrae texto de un PDF usando pdf-parse
   * No requiere conexión a internet
   */
  async extractTextFromPDF(base64Data) {
    // Crear buffer desde base64
    const buffer = Buffer.from(base64Data, 'base64');

    // Parsear PDF
    const data = await pdfParse(buffer, {
      max: 0 // Sin límite de páginas
    });

    return {
      text: data.text.trim(),
      confidence: 0.95, // PDF text extraction es generalmente preciso
      pages: data.numpages,
      info: data.info
    };
  }

  /**
   * Preprocesa el texto extraído para mejorar la calidad
   */
  preprocessText(text) {
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
   * Formatea el texto extraído como contexto para el LLM
   */
  formatForLLM(extractedResult, fileName) {
    const { text, confidence, pages } = extractedResult;
    const processedText = this.preprocessText(text);

    let context = `=== CONTENIDO EXTRAÍDO DEL ARCHIVO: ${fileName} ===\n`;

    if (pages) {
      context += `(${pages} página${pages > 1 ? 's' : ''})\n`;
    }

    if (confidence < 0.8) {
      context += `[Nota: La calidad de extracción es ${Math.round(confidence * 100)}%, algunos textos pueden no ser exactos]\n`;
    }

    context += '\n';
    context += processedText;
    context += '\n\n=== FIN DEL CONTENIDO ===';

    return context;
  }

  /**
   * Limpia recursos del worker
   */
  async terminate() {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch (e) {
        // Ignorar errores de terminación
      }
      this.worker = null;
      this.tesseractAvailable = false;
      this.initializationAttempted = false;
      this.logger?.info('ocr.terminated');
    }
  }
}

module.exports = OCRService;
