/**
 * Local Sharp Image Processing Service
 *
 * Servicio local para procesamiento de imágenes usando Sharp.
 * No requiere credenciales externas.
 *
 * Eventos:
 * - local.sharp.prepare-ocr.request -> local.sharp.prepare-ocr.response
 * - local.sharp.resize.request -> local.sharp.resize.response
 * - local.sharp.convert.request -> local.sharp.convert.response
 * - local.sharp.info.request -> local.sharp.info.response
 */

const fs = require('fs');
const path = require('path');

// Lazy load Sharp
let sharp = null;

const loadSharp = () => {
  if (!sharp) {
    try {
      sharp = require('sharp');
    } catch (e) {
      throw new Error('sharp not installed. Run: npm install sharp');
    }
  }
  return sharp;
};

module.exports = {
  name: 'local.sharp',
  description: 'Servicio local de procesamiento de imágenes usando Sharp',

  functions: {
    'prepare-ocr': {
      event: 'local.sharp.prepare-ocr.request',
      description: 'Prepara imagen para OCR: grayscale, contraste, nitidez',
      input: {
        image: {
          type: 'string',
          description: 'Imagen en base64 o path al archivo',
          required: true
        },
        options: {
          type: 'object',
          description: 'Opciones de procesamiento',
          properties: {
            grayscale: { type: 'boolean', default: true },
            normalize: { type: 'boolean', default: true },
            sharpen: { type: 'boolean', default: true },
            threshold: { type: 'number', description: 'Umbral binarización (0-255), null para no aplicar' },
            denoise: { type: 'boolean', default: false }
          }
        },
        output: {
          type: 'string',
          description: 'Path donde guardar resultado (opcional, si no se especifica devuelve base64)'
        }
      },
      output: {
        image: { type: 'string', description: 'Imagen procesada en base64 o path' },
        width: { type: 'number' },
        height: { type: 'number' }
      }
    },
    resize: {
      event: 'local.sharp.resize.request',
      description: 'Redimensionar imagen',
      input: {
        image: { type: 'string', required: true },
        width: { type: 'number', description: 'Ancho en pixels' },
        height: { type: 'number', description: 'Alto en pixels' },
        fit: { type: 'string', description: 'cover, contain, fill, inside, outside', default: 'inside' },
        output: { type: 'string', description: 'Path donde guardar (opcional)' }
      },
      output: {
        image: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' }
      }
    },
    convert: {
      event: 'local.sharp.convert.request',
      description: 'Convertir formato de imagen',
      input: {
        image: { type: 'string', required: true },
        format: { type: 'string', description: 'jpeg, png, webp, tiff, avif', required: true },
        quality: { type: 'number', description: 'Calidad 1-100', default: 80 },
        output: { type: 'string', description: 'Path donde guardar (opcional)' }
      },
      output: {
        image: { type: 'string' },
        format: { type: 'string' },
        size: { type: 'number', description: 'Tamaño en bytes' }
      }
    },
    info: {
      event: 'local.sharp.info.request',
      description: 'Obtener información de imagen',
      input: {
        image: { type: 'string', required: true }
      },
      output: {
        width: { type: 'number' },
        height: { type: 'number' },
        format: { type: 'string' },
        channels: { type: 'number' },
        size: { type: 'number' }
      }
    }
  },

  /**
   * Obtener buffer de imagen desde base64 o path
   */
  async getImageBuffer(image) {
    if (!image || typeof image !== 'string') {
      throw new Error(`Invalid image parameter: expected string, got ${typeof image}`);
    }

    // Si es data URI, extraer base64
    if (image.startsWith('data:')) {
      const base64Data = image.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    }

    // Detectar base64 por magic bytes
    const base64Prefixes = ['/9j/', 'iVBORw', 'R0lGOD', 'UklGR', 'Qk', 'SUkq', 'TU0A'];
    const looksLikeBase64 = base64Prefixes.some(p => image.startsWith(p));

    if (looksLikeBase64) {
      return Buffer.from(image, 'base64');
    }

    // Es un path de archivo
    if (!fs.existsSync(image)) {
      throw new Error(`Image file not found: ${image}`);
    }

    return fs.readFileSync(image);
  },

  /**
   * Preparar imagen para OCR
   */
  async 'prepare-ocr'({ image, options = {}, output } = {}) {
    const sharpLib = loadSharp();
    const buffer = await this.getImageBuffer(image);

    const {
      grayscale = true,
      normalize = true,
      sharpen = true,
      threshold = null,
      denoise = false
    } = options;

    let pipeline = sharpLib(buffer);

    // Convertir a escala de grises
    if (grayscale) {
      pipeline = pipeline.grayscale();
    }

    // Normalizar (mejora contraste automáticamente)
    if (normalize) {
      pipeline = pipeline.normalize();
    }

    // Reducir ruido (median filter)
    if (denoise) {
      pipeline = pipeline.median(3);
    }

    // Aumentar nitidez
    if (sharpen) {
      pipeline = pipeline.sharpen({
        sigma: 1,
        m1: 1,
        m2: 2
      });
    }

    // Binarización (blanco/negro puro)
    if (threshold !== null && typeof threshold === 'number') {
      pipeline = pipeline.threshold(threshold);
    }

    // Obtener metadata
    const metadata = await sharpLib(buffer).metadata();

    // Procesar
    const processedBuffer = await pipeline.png().toBuffer();

    // Guardar o devolver base64
    if (output) {
      const outputDir = path.dirname(output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(output, processedBuffer);

      return {
        success: true,
        image: output,
        width: metadata.width,
        height: metadata.height,
        originalSize: buffer.length,
        processedSize: processedBuffer.length
      };
    }

    return {
      success: true,
      image: processedBuffer.toString('base64'),
      width: metadata.width,
      height: metadata.height,
      originalSize: buffer.length,
      processedSize: processedBuffer.length
    };
  },

  /**
   * Redimensionar imagen
   */
  async resize({ image, width, height, fit = 'inside', output } = {}) {
    const sharpLib = loadSharp();
    const buffer = await this.getImageBuffer(image);

    if (!width && !height) {
      throw new Error('At least width or height must be specified');
    }

    const pipeline = sharpLib(buffer).resize({
      width: width || null,
      height: height || null,
      fit: fit,
      withoutEnlargement: true
    });

    const processedBuffer = await pipeline.toBuffer();
    const info = await sharpLib(processedBuffer).metadata();

    if (output) {
      const outputDir = path.dirname(output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(output, processedBuffer);

      return {
        success: true,
        image: output,
        width: info.width,
        height: info.height,
        size: processedBuffer.length
      };
    }

    return {
      success: true,
      image: processedBuffer.toString('base64'),
      width: info.width,
      height: info.height,
      size: processedBuffer.length
    };
  },

  /**
   * Convertir formato
   */
  async convert({ image, format, quality = 80, output } = {}) {
    const sharpLib = loadSharp();
    const buffer = await this.getImageBuffer(image);

    const validFormats = ['jpeg', 'jpg', 'png', 'webp', 'tiff', 'avif'];
    const normalizedFormat = format.toLowerCase();

    if (!validFormats.includes(normalizedFormat)) {
      throw new Error(`Invalid format: ${format}. Valid: ${validFormats.join(', ')}`);
    }

    const formatMethod = normalizedFormat === 'jpg' ? 'jpeg' : normalizedFormat;

    let pipeline = sharpLib(buffer);

    // Aplicar formato con calidad
    if (['jpeg', 'jpg', 'webp', 'avif'].includes(normalizedFormat)) {
      pipeline = pipeline[formatMethod]({ quality });
    } else {
      pipeline = pipeline[formatMethod]();
    }

    const processedBuffer = await pipeline.toBuffer();

    if (output) {
      const outputDir = path.dirname(output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(output, processedBuffer);

      return {
        success: true,
        image: output,
        format: formatMethod,
        size: processedBuffer.length
      };
    }

    return {
      success: true,
      image: processedBuffer.toString('base64'),
      format: formatMethod,
      size: processedBuffer.length
    };
  },

  /**
   * Obtener información de imagen
   */
  async info({ image } = {}) {
    const sharpLib = loadSharp();
    const buffer = await this.getImageBuffer(image);

    const metadata = await sharpLib(buffer).metadata();

    return {
      success: true,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      space: metadata.space,
      depth: metadata.depth,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      size: buffer.length
    };
  }
};
