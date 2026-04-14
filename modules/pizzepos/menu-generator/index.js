/**
 * Menu Generator v6.1.0 — Generador puro
 *
 * Responsabilidad única: generar una carta estructurada en JSON
 * a partir de cualquier input (foto, PDF, texto, audio, dictado, recetas, scraping).
 *
 * Pipeline:
 *   Archivo → [PDF→render] → [sharp prepare] → [Google Vision OCR] → texto
 *   Texto → agente menu-structurer → carta.save → carta.actualizada
 *
 * La extracción OCR es determinista (no usa LLM).
 * La estructuración la hace el agente menu-structurer (sí usa LLM).
 *
 * Tools:
 *   menu.generate — Genera carta desde cualquier input (REQUIERE nombre)
 */

const path = require('path');
const fs = require('fs').promises;
const ServiceExecutor = require('../../../core/service-executor');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];
const PDF_EXTENSIONS = ['.pdf'];

// Timeouts por paso (ms)
const TIMEOUTS = {
  pdfInfo: 15000,
  pdfRender: 30000,
  sharp: 15000,
  ocr: 60000,
  structurer: 90000
};

class MenuGeneratorModule {
  constructor() {
    this.name = 'menu-generator';
    this.version = '6.1.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.services = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.services = new ServiceExecutor(this.eventBus, this.logger);
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Tool — el único: generar
  // ==========================================

  async toolGenerate({ nombre, texto, filePath, project_id }) {
    if (!nombre) {
      return {
        status: 400,
        error: 'Se requiere "nombre" para la carta. Pregunta al usuario cómo quiere llamarla antes de generar.'
      };
    }
    if (!texto && !filePath) {
      return {
        status: 400,
        error: 'Se requiere "texto" (contenido del menú) o "filePath" (ruta a PDF/imagen)'
      };
    }
    if (!project_id) {
      return { status: 400, error: 'Se requiere "project_id"' };
    }

    this.metrics?.increment('menu.generate.requested');

    // Si hay archivo, extraer texto primero (pipeline determinista)
    if (filePath && !texto) {
      this.logger.info('menu.generate.extracting', { filePath, project_id });

      await this.eventBus.publish('menu.generation.progress', {
        project_id, nombre, step: 'extracting', message: 'Extrayendo texto del documento...'
      });

      const extraction = await this.extractText(filePath, project_id);

      if (!extraction.success) {
        this.metrics?.increment('menu.generate.extract_failed');
        await this.eventBus.publish('menu.generation.failed', {
          project_id, nombre, step: 'extraction', error: extraction.error
        });
        return { status: 500, error: `Error extrayendo texto: ${extraction.error}` };
      }

      texto = extraction.text;
      this.logger.info('menu.generate.extracted', {
        project_id, ocr_provider: extraction.ocr_provider,
        pages: extraction.pages_processed, text_length: texto.length
      });
    }

    // Ahora tenemos texto — invocar agente structurer directamente
    await this.eventBus.publish('menu.generation.progress', {
      project_id, nombre, step: 'structuring', message: 'Estructurando carta con IA...'
    });

    await this.eventBus.publish('agent.execute.request', {
      agentName: 'menu-structurer',
      context: {
        texto,
        project_id,
        nombre
      },
      task: `Estructura este texto de carta de restaurante en JSON. Nombre: "${nombre}". Guarda con carta.save pasando project_id="${project_id}".`
    });

    this.logger.info('menu.generate.structuring', {
      project_id, nombre, texto_length: texto.length
    });

    return {
      status: 202,
      data: {
        nombre,
        pipeline: filePath ? 'document' : 'text',
        message: `Generando carta "${nombre}". El agente structurer procesará el texto.`
      }
    };
  }

  // ==========================================
  // Pipeline OCR determinista
  // ==========================================

  /**
   * Extrae texto de un archivo PDF o imagen.
   * Pipeline fijo: [PDF→render] → sharp prepare → Google Vision OCR.
   * No usa LLM — es puramente determinista.
   */
  async extractText(filePath, projectId) {
    const ext = path.extname(filePath).toLowerCase();
    const isPDF = PDF_EXTENSIONS.includes(ext);
    const isImage = IMAGE_EXTENSIONS.includes(ext);

    if (!isPDF && !isImage) {
      return { success: false, error: `Formato no soportado: ${ext}. Acepta PDF, JPG, PNG, WebP, TIFF.` };
    }

    try {
      let images = [];

      // Paso 1: Si es PDF, renderizar cada página a imagen
      if (isPDF) {
        images = await this.pdfToImages(filePath);
        if (images.length === 0) {
          return { success: false, error: 'No se pudieron renderizar páginas del PDF' };
        }
      } else {
        images = [{ image: filePath, page: 1, fromPath: true }];
      }

      // Paso 2-3: Para cada imagen → sharp prepare → Google Vision
      const pageTexts = [];

      for (const img of images) {
        // Paso 2: Sharp prepare-ocr
        const prepared = await this.prepareImage(img.image, img.fromPath);
        if (!prepared.success) {
          this.logger.warn('menu.extract.sharp_failed', { page: img.page, error: prepared.error });
          continue;
        }

        // Paso 3: Google Vision OCR
        const ocr = await this.ocrExtract(prepared.image);
        if (!ocr.success || !ocr.text) {
          this.logger.warn('menu.extract.ocr_failed', { page: img.page, error: ocr.error });
          continue;
        }

        pageTexts.push({ page: img.page, text: ocr.text, confidence: ocr.confidence });
      }

      if (pageTexts.length === 0) {
        return { success: false, error: 'No se pudo extraer texto de ninguna página' };
      }

      // Concatenar texto de todas las páginas
      const fullText = pageTexts.length === 1
        ? pageTexts[0].text
        : pageTexts.map(p => p.text).join('\n\n');

      return {
        success: true,
        text: fullText,
        source_type: isPDF ? 'pdf' : 'image',
        pages_processed: pageTexts.length,
        ocr_provider: 'google_vision'
      };

    } catch (err) {
      this.logger.error('menu.extract.pipeline_error', { filePath, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Renderiza todas las páginas de un PDF a imágenes base64.
   */
  async pdfToImages(filePath) {
    // Obtener info del PDF
    const infoResult = await this.services.call('local.pdfjs', 'info', {
      pdf: filePath
    }, { timeout: TIMEOUTS.pdfInfo });

    const info = infoResult.data || infoResult;
    const totalPages = info.pages || 1;

    const images = [];
    for (let page = 1; page <= totalPages; page++) {
      try {
        const renderResult = await this.services.call('local.pdfjs', 'render', {
          pdf: filePath,
          page,
          scale: 2.0
        }, { timeout: TIMEOUTS.pdfRender });

        const renderData = renderResult.data || renderResult;
        if (renderData.image) {
          images.push({ image: renderData.image, page, fromPath: false });
        }
      } catch (err) {
        this.logger.warn('menu.extract.pdf_render_failed', { page, error: err.message });
      }
    }

    return images;
  }

  /**
   * Prepara imagen para OCR: grayscale, normalize, sharpen.
   */
  async prepareImage(image, fromPath) {
    try {
      const result = await this.services.call('local.sharp', 'prepare-ocr', {
        image,
        options: { grayscale: true, normalize: true, sharpen: true }
      }, { timeout: TIMEOUTS.sharp });

      const data = result.data || result;
      return { success: true, image: data.image || image };
    } catch (err) {
      // Si sharp falla, usar imagen original
      this.logger.warn('menu.extract.sharp_fallback', { error: err.message });
      return { success: true, image };
    }
  }

  /**
   * Extrae texto con Google Vision OCR.
   */
  async ocrExtract(image) {
    try {
      const result = await this.services.call('local.google-vision', 'extract', {
        image,
        hint: 'DOCUMENT_TEXT_DETECTION',
        languageHints: ['es', 'en']
      }, { timeout: TIMEOUTS.ocr });

      const data = result.data || result;
      return {
        success: true,
        text: data.text || '',
        confidence: data.confidence || 0
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGenerate(data) {
    const result = await this.toolGenerate(data);
    if (result.error) {
      throw { status: result.status || 400, code: 'GENERATE_ERROR', message: result.error };
    }
    return result.data;
  }

  async handleHealth() {
    return { status: 'healthy', module: this.name, version: this.version };
  }
}

module.exports = MenuGeneratorModule;
