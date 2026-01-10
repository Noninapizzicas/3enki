/**
 * Local Tesseract OCR Service
 *
 * Servicio local para OCR usando Tesseract.js.
 * No requiere credenciales externas.
 *
 * Eventos:
 * - local.tesseract.extract.request -> local.tesseract.extract.response
 */

const fs = require('fs');
const path = require('path');

// Lazy load Tesseract.js
let Tesseract = null;

const loadTesseract = () => {
  if (!Tesseract) {
    try {
      Tesseract = require('tesseract.js');
    } catch (e) {
      throw new Error('tesseract.js not installed. Run: npm install tesseract.js');
    }
  }
  return Tesseract;
};

module.exports = {
  name: 'local.tesseract',
  description: 'Servicio local de OCR usando Tesseract.js',

  functions: {
    extract: {
      event: 'local.tesseract.extract.request',
      description: 'Extraer texto de imagen usando Tesseract OCR',
      input: {
        image: {
          type: 'string',
          description: 'Imagen en base64 o path al archivo',
          required: true
        },
        language: {
          type: 'string',
          description: 'Codigo de idioma (eng, spa, deu, fra, etc.)',
          default: 'eng'
        }
      },
      output: {
        text: { type: 'string', description: 'Texto extraido' },
        confidence: { type: 'number', description: 'Confianza 0-100' }
      }
    }
  },

  // Worker compartido para mejor rendimiento
  _worker: null,
  _workerLanguage: null,

  /**
   * Obtener o crear worker
   */
  async getWorker(language) {
    const T = loadTesseract();

    // Si el worker existe y el idioma coincide, reutilizar
    if (this._worker && this._workerLanguage === language) {
      return this._worker;
    }

    // Si hay worker con otro idioma, terminarlo
    if (this._worker) {
      await this._worker.terminate();
    }

    // Crear nuevo worker
    this._worker = await T.createWorker(language, 1, {
      logger: () => {} // Silenciar logs
    });

    this._workerLanguage = language;
    return this._worker;
  },

  /**
   * Extraer texto de imagen
   */
  async extract({ image, language = 'eng' }) {
    const worker = await this.getWorker(language);

    // Determinar si es base64 o path
    let imageInput = image;

    if (!image.startsWith('data:') && !image.startsWith('/') && !image.startsWith('./')) {
      // Asumir que es base64 sin prefijo
      imageInput = `data:image/png;base64,${image}`;
    } else if (image.startsWith('/') || image.startsWith('./')) {
      // Es un path - verificar que existe
      if (!fs.existsSync(image)) {
        return {
          success: false,
          error: `Image file not found: ${image}`
        };
      }
    }

    try {
      const { data } = await worker.recognize(imageInput);

      return {
        success: true,
        text: data.text.trim(),
        confidence: data.confidence,
        words: data.words?.length || 0,
        lines: data.lines?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Cleanup al descargar el servicio
   */
  async cleanup() {
    if (this._worker) {
      await this._worker.terminate();
      this._worker = null;
    }
  }
};
