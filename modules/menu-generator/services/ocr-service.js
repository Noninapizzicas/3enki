/**
 * OCR Service para Menu Generator
 * Extrae texto de imágenes (Tesseract.js) y PDFs (pdf-parse)
 * para enviar a DeepSeek en formato texto
 */

const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');

class OCRService {
  constructor(logger) {
    this.logger = logger;
    this.worker = null;
    this.initialized = false;
  }

  /**
   * Inicializa el worker de Tesseract (lazy initialization)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.logger?.info('ocr.initializing', { engine: 'tesseract.js' });

      // Crear worker con idiomas español e inglés
      this.worker = await Tesseract.createWorker('spa+eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress) {
            this.logger?.debug('ocr.progress', { progress: Math.round(m.progress * 100) });
          }
        }
      });

      this.initialized = true;
      this.logger?.info('ocr.initialized', { languages: ['spa', 'eng'] });
    } catch (error) {
      this.logger?.error('ocr.init_failed', { error: error.message });
      throw error;
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
        result = await this.extractTextFromPDF(base64Data);
      } else if (mimeType.startsWith('image/')) {
        result = await this.extractTextFromImage(base64Data, mimeType);
      } else {
        throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
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
   */
  async extractTextFromImage(base64Data, mimeType) {
    await this.initialize();

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
   */
  async extractTextFromPDF(base64Data) {
    // Crear buffer desde base64
    const buffer = Buffer.from(base64Data, 'base64');

    // Parsear PDF
    const data = await pdfParse(buffer, {
      // Opciones para mejor extracción
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
   * Limpia caracteres extraños, normaliza espacios, etc.
   */
  preprocessText(text) {
    if (!text) return '';

    return text
      // Normalizar saltos de línea
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Eliminar líneas con solo espacios
      .replace(/^\s*$/gm, '')
      // Reducir múltiples saltos de línea a máximo 2
      .replace(/\n{3,}/g, '\n\n')
      // Normalizar espacios múltiples
      .replace(/[ \t]+/g, ' ')
      // Eliminar espacios al inicio/final de líneas
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Eliminar espacios al inicio/final
      .trim();
  }

  /**
   * Formatea el texto extraído como contexto para el LLM
   */
  formatForLLM(extractedResult, fileName) {
    const { text, confidence, pages } = extractedResult;

    const processedText = this.preprocessText(text);

    // Construir mensaje descriptivo
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
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.logger?.info('ocr.terminated');
    }
  }
}

module.exports = OCRService;
