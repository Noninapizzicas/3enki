/**
 * Local PDF to PNG Service
 *
 * Convierte páginas de PDF a imágenes PNG usando pdf-to-png-converter.
 * Sin dependencias de binarios ni SO. Ideal para previews y OCR de PDFs escaneados.
 *
 * Eventos:
 * - local.pdf-to-png.convert.request -> local.pdf-to-png.convert.response
 *
 * LECCIONES APLICADAS (de contexto/lecciones-aprendidas-flow-engine.json):
 * - Bug #7: Validar parametros al inicio (no undefined.method())
 * - Bug #12: Detectar base64 por magic bytes ANTES de verificar si es path
 * - Bug #14: Documentar estructura exacta de respuesta
 *
 * @example
 * // Desde flow-engine:
 * {
 *   "type": "service",
 *   "service": "local.pdf-to-png",
 *   "action": "convert",
 *   "pdf": "{{ globalPath(trigger.file.path) }}",
 *   "pages": [1, 2, 3]
 * }
 *
 * // Acceso al resultado:
 * {{ steps.mi-step.data.images }}
 * {{ steps.mi-step.data.images[0].content }}
 *
 * @version 1.0.0
 * @created 2026-01-13
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Lazy load pdf-to-png-converter
let pdfToPng = null;
let pdfToPngLoadPromise = null;

const loadPdfToPng = async () => {
  if (pdfToPng) return pdfToPng;

  if (!pdfToPngLoadPromise) {
    pdfToPngLoadPromise = import('pdf-to-png-converter')
      .then(module => {
        pdfToPng = module.pdfToPng;
        return pdfToPng;
      })
      .catch(e => {
        pdfToPngLoadPromise = null;
        throw new Error(`pdf-to-png-converter not installed. Run: npm install pdf-to-png-converter`);
      });
  }

  return pdfToPngLoadPromise;
};

module.exports = {
  name: 'local.pdf-to-png',
  description: 'Convertir páginas de PDF a imágenes PNG',

  functions: {
    convert: {
      event: 'local.pdf-to-png.convert.request',
      description: 'Convertir páginas de PDF a PNG',
      input: {
        pdf: {
          type: 'string',
          description: 'PDF en base64 o path al archivo',
          required: true
        },
        pages: {
          type: 'array',
          description: 'Páginas a convertir [1,2,3] (1-based). Vacío = todas',
          default: []
        },
        scale: {
          type: 'number',
          description: 'Escala del viewport (2.0 = 200%)',
          default: 2.0
        },
        outputFolder: {
          type: 'string',
          description: 'Carpeta para guardar PNGs (opcional)',
          default: ''
        },
        password: {
          type: 'string',
          description: 'Contraseña para PDFs encriptados',
          default: ''
        }
      },
      output: {
        success: { type: 'boolean', description: 'Si la operacion fue exitosa' },
        data: {
          type: 'object',
          description: 'Datos de las imágenes (NOTA: acceder via steps.ID.data.images)',
          properties: {
            images: { type: 'array', description: 'Array de imágenes PNG' },
            totalPages: { type: 'number', description: 'Total de páginas convertidas' }
          }
        },
        error: { type: 'string', description: 'Mensaje de error si success=false' }
      }
    }
  },

  /**
   * Detectar si el string es base64 de PDF por magic bytes
   * PDF en base64 empieza con "JVBERi" (que es "%PDF-" en base64)
   *
   * LECCION #12: Detectar magic bytes ANTES de verificar si es path
   */
  isPdfBase64(str) {
    if (!str || typeof str !== 'string') return false;
    return str.startsWith('JVBERi');
  },

  /**
   * Resolver input: base64, path, o @/ path
   * pdf-to-png-converter acepta path o Buffer
   *
   * @returns {Promise<{input: string|Buffer, tempFile: string|null, error: string|null}>}
   */
  async resolveInput(pdf) {
    // Data URI completo
    if (pdf.startsWith('data:application/pdf;base64,')) {
      const base64Data = pdf.replace('data:application/pdf;base64,', '');
      const buffer = Buffer.from(base64Data, 'base64');
      return { input: buffer, tempFile: null, error: null };
    }

    // Base64 puro (detectado por magic bytes)
    if (this.isPdfBase64(pdf)) {
      const buffer = Buffer.from(pdf, 'base64');
      return { input: buffer, tempFile: null, error: null };
    }

    // Path de archivo
    if (pdf.startsWith('/') || pdf.startsWith('./') || pdf.startsWith('@/')) {
      let filePath = pdf;

      // Convertir @/ a ruta real (data/)
      if (pdf.startsWith('@/')) {
        filePath = pdf.replace('@/', './data/');
      }

      if (!fs.existsSync(filePath)) {
        return { input: null, tempFile: null, error: `PDF file not found: ${filePath}` };
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return { input: null, tempFile: null, error: `Path is not a file: ${filePath}` };
      }

      return { input: filePath, tempFile: null, error: null };
    }

    // Intentar como base64
    try {
      const buffer = Buffer.from(pdf, 'base64');
      // Verificar magic bytes de PDF
      if (buffer.slice(0, 5).toString() !== '%PDF-') {
        return { input: null, tempFile: null, error: 'Invalid input: not a valid PDF' };
      }
      return { input: buffer, tempFile: null, error: null };
    } catch (e) {
      return { input: null, tempFile: null, error: 'Invalid input: not a valid file path or base64' };
    }
  },

  /**
   * Convertir PDF a PNG
   *
   * LECCION #7: Validar TODOS los parametros al inicio
   * LECCION #14: Devolver estructura consistente
   */
  async convert({ pdf, pages = [], scale = 2.0, outputFolder = '', password = '' } = {}) {
    // === VALIDACION DE ENTRADA (Leccion #7) ===
    if (!pdf) {
      return {
        success: false,
        error: 'Parameter "pdf" is required',
        data: { images: [], totalPages: 0 }
      };
    }

    if (typeof pdf !== 'string') {
      return {
        success: false,
        error: `Invalid pdf parameter: expected string, got ${typeof pdf}`,
        data: { images: [], totalPages: 0 }
      };
    }

    if (pdf.trim() === '') {
      return {
        success: false,
        error: 'Parameter "pdf" cannot be empty',
        data: { images: [], totalPages: 0 }
      };
    }

    try {
      const converter = await loadPdfToPng();

      // Resolver input
      const resolved = await this.resolveInput(pdf);
      if (resolved.error) {
        return {
          success: false,
          error: resolved.error,
          data: { images: [], totalPages: 0 }
        };
      }

      // Preparar opciones
      const options = {
        disableFontFace: false,
        useSystemFonts: false,
        viewportScale: scale,
        verbosityLevel: 0,
        returnPageContent: true
      };

      // Páginas específicas
      if (Array.isArray(pages) && pages.length > 0) {
        options.pagesToProcess = pages;
        options.strictPagesToProcess = false;
      }

      // Carpeta de salida
      if (outputFolder && outputFolder.trim() !== '') {
        // Crear carpeta si no existe
        if (!fs.existsSync(outputFolder)) {
          fs.mkdirSync(outputFolder, { recursive: true });
        }
        options.outputFolder = outputFolder;
        options.outputFileMaskFunc = (pageNumber) => `page_${pageNumber}.png`;
      }

      // Contraseña
      if (password && password.trim() !== '') {
        options.pdfFilePassword = password;
      }

      // Convertir
      const pngPages = await converter(resolved.input, options);

      // Procesar resultado
      const images = pngPages.map(page => ({
        pageNumber: page.pageNumber,
        name: page.name,
        content: page.content ? page.content.toString('base64') : null,
        path: page.path || '',
        width: page.width,
        height: page.height
      }));

      return {
        success: true,
        data: {
          images,
          totalPages: images.length,
          scale,
          outputFolder: outputFolder || null
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `PDF to PNG conversion failed: ${error.message}`,
        data: { images: [], totalPages: 0 }
      };
    }
  },

  /**
   * Cleanup
   */
  async cleanup() {
    // No hay estado global que limpiar
  }
};
