/**
 * FASE 2 REVISADA: Recipe Ingestion Pipeline
 *
 * Reutiliza la lógica determinista de invoice-pipeline.js (sharp + google-vision)
 * SIN duplicar código. Solo adaptamos para recetas.
 *
 * Pipeline steps (como facturas):
 *   intake → download/read → prepare (sharp) → ocr (google-vision) → normalize
 *
 * NO incluimos "structure" aquí — eso lo hacen agentes vía eventos.
 *
 * Flujo event-driven:
 *   receta.ingestion.completed → agente recipe-structurer procesa
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const STEPS = [
  'intake',      // validar input, registrar en BD con estado 'ingesting'
  'download',    // fetch URL o read archivo local
  'prepare',     // sharp: normalize imagen para OCR (igual que facturas)
  'ocr',         // google-vision: extraer texto (igual que facturas)
  'normalize'    // parseamos campos básicos (nombre, ingredientes candidatos, etc.)
];

class RecipeIngestionPipeline {
  constructor(deps) {
    this.services = deps.services;        // ServiceExecutor (reutilizamos providers)
    this.eventBus = deps.eventBus;        // Para publicar eventos
    this.logger = deps.logger;
    this.sqliteManager = deps.sqliteManager;  // Para guardar estado
    this.metrics = deps.metrics;

    // Config igual que facturas
    this.config = {
      sharp: { grayscale: true, normalize: true, sharpen: true },
      ocr: {
        provider: 'local.google-vision',
        hint: 'DOCUMENT_TEXT_DETECTION',
        languages: ['es', 'en']
      },
      processing: {
        dpi: 300,
        maxWidth: 2400,
        maxHeight: 3200
      },
      timeouts: {
        download: 30000,
        sharp: 30000,
        ocr: 60000
      }
    };
  }

  /**
   * Procesar receta desde cualquier fuente
   */
  async process(projectId, input, options = {}) {
    const {
      tipo = 'auto',           // 'url' | 'pdf' | 'imagen' | 'json' | 'manual' | 'auto'
      fuente_referencia = null,
      resumeFrom = null,
      previousState = null
    } = options;

    // Estado del pipeline (para resume capability)
    const state = previousState || {
      projectId,
      input,
      tipo,
      fuente_referencia,
      ingestion_id: `ing_${crypto.randomBytes(6).toString('hex')}`,
      // Datos intermedios
      filePath: null,
      fileContent: null,
      preparedImage: null,
      ocrText: null,
      datosNormalizados: null,
      // Métricas
      metrics: {
        startedAt: new Date().toISOString(),
        steps: {}
      }
    };

    // Detectar tipo si es 'auto'
    if (tipo === 'auto') {
      state.tipo = this._detectType(input);
    }

    // Publicar evento de inicio
    await this.eventBus.publish('receta.ingestion.started', {
      ingestion_id: state.ingestion_id,
      projectId,
      tipo: state.tipo,
      timestamp: Date.now()
    });

    // Ejecutar steps
    const startIndex = resumeFrom ? STEPS.indexOf(resumeFrom) : 0;
    if (startIndex === -1) {
      throw new Error(`Unknown step: ${resumeFrom}`);
    }

    try {
      for (let i = startIndex; i < STEPS.length; i++) {
        const step = STEPS[i];
        const stepStart = Date.now();

        try {
          this.logger.info('receta.ingestion.step', { ingestion_id: state.ingestion_id, step });

          // Ejecutar step
          switch (step) {
            case 'intake':
              await this._stepIntake(state, projectId);
              break;
            case 'download':
              await this._stepDownload(state);
              break;
            case 'prepare':
              await this._stepPrepare(state);
              break;
            case 'ocr':
              await this._stepOcr(state);
              break;
            case 'normalize':
              await this._stepNormalize(state);
              break;
          }

          state.metrics.steps[step] = {
            status: 'completed',
            duration_ms: Date.now() - stepStart
          };
        } catch (err) {
          // Error en step — guardar estado para resume
          state.metrics.steps[step] = {
            status: 'failed',
            error: err.message
          };

          await this.eventBus.publish('receta.ingestion.failed', {
            ingestion_id: state.ingestion_id,
            projectId,
            step,
            error: err.message,
            estado_resumible: state,
            timestamp: Date.now()
          });

          this.metrics?.increment('receta.ingestion.failed');
          throw err;
        }
      }

      // ✅ Ingestion completada — emitir evento para agentes
      await this.eventBus.publish('receta.ingestion.completed', {
        ingestion_id: state.ingestion_id,
        projectId,
        datosNormalizados: state.datosNormalizados,
        ocrText: state.ocrText,
        tipo: state.tipo,
        fuente_referencia: state.fuente_referencia,
        metrics: state.metrics,
        timestamp: Date.now()
      });

      this.metrics?.increment('receta.ingestion.completed');
      this.logger.info('receta.ingestion.completed', { ingestion_id: state.ingestion_id });

      return { success: true, ingestion_id: state.ingestion_id, datos: state.datosNormalizados };
    } catch (err) {
      this.logger.error('receta.ingestion.fatal', { ingestion_id: state.ingestion_id, error: err.message });
      throw err;
    }
  }

  // ==========================================
  // STEPS (igual que invoice-pipeline)
  // ==========================================

  async _stepIntake(state, projectId) {
    // Validar input
    if (!state.input) throw new Error('Input requerido');

    // Si es URL, guardar como fuente_referencia
    if (typeof state.input === 'string' && state.input.startsWith('http')) {
      state.fuente_referencia = state.input;
      state.tipo = 'url';
    }

    // Si es archivo local, validar que existe
    if (typeof state.input === 'string' && !state.input.startsWith('http')) {
      try {
        await fs.access(state.input);
        state.filePath = state.input;
        state.tipo = state.tipo === 'auto' ? this._detectTypeFromExt(state.input) : state.tipo;
      } catch {
        throw new Error(`Archivo no encontrado: ${state.input}`);
      }
    }

    // Si es JSON object, ya tenemos los datos
    if (typeof state.input === 'object') {
      state.datosNormalizados = state.input;
      state.tipo = 'json';
    }
  }

  async _stepDownload(state) {
    // Si ya tenemos archivo local o JSON, skip
    if (state.filePath || state.tipo === 'json') return;

    // Si es URL, descargar
    if (typeof state.input === 'string' && state.input.startsWith('http')) {
      try {
        const response = await fetch(state.input, { timeout: this.config.timeouts.download });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const buffer = await response.buffer();
        const ext = this._getExtFromUrl(state.input) || '.pdf';
        state.filePath = path.join('/tmp', `recipe_${Date.now()}${ext}`);
        await fs.writeFile(state.filePath, buffer);
      } catch (err) {
        throw new Error(`Download failed: ${err.message}`);
      }
    }
  }

  async _stepPrepare(state) {
    // Solo para archivos (PDF/imagen), skip para JSON
    if (state.tipo === 'json' || state.datosNormalizados) return;

    try {
      // Reutilizar sharp.prepare-ocr de facturas
      const result = await this.services.call('local.sharp', 'prepare-ocr', {
        filePath: state.filePath,
        ...this.config.processing,
        sharp: this.config.sharp
      }, { timeout: this.config.timeouts.sharp });

      state.preparedImage = result.preparedPath;
    } catch (err) {
      throw new Error(`Sharp prepare failed: ${err.message}`);
    }
  }

  async _stepOcr(state) {
    // Solo para archivos, skip para JSON
    if (state.tipo === 'json' || state.datosNormalizados) return;

    try {
      // Reutilizar google-vision de facturas
      const result = await this.services.call(this.config.ocr.provider, 'extract-text', {
        filePath: state.preparedImage,
        hint: this.config.ocr.hint,
        languages: this.config.ocr.languages
      }, { timeout: this.config.timeouts.ocr });

      state.ocrText = result.text;
    } catch (err) {
      throw new Error(`OCR failed: ${err.message}`);
    }
  }

  async _stepNormalize(state) {
    // Para JSON, ya está normalizado
    if (state.tipo === 'json') {
      state.datosNormalizados = state.input;
      return;
    }

    // Para texto (de OCR o manual), parsear campos básicos
    const text = state.ocrText || state.input;
    if (!text) throw new Error('No hay texto para normalizar');

    // Extracción muy básica (será mejorada por agente structurer)
    state.datosNormalizados = {
      texto_crudo: text,
      // Agente structurer hará la extracción real
      campos_candidatos: {
        nombre: this._extractName(text),
        ingredientes_crudos: this._extractIngredients(text),
        instrucciones_crudas: this._extractInstructions(text),
        tiempo_aproximado: this._extractTime(text)
      }
    };
  }

  // ==========================================
  // HELPERS para normalización básica
  // ==========================================

  _detectType(input) {
    if (typeof input === 'string') {
      if (input.startsWith('http')) return 'url';
      if (input.endsWith('.pdf')) return 'pdf';
      if (input.match(/\.(jpg|jpeg|png|webp|tiff)$/i)) return 'imagen';
      return 'manual';
    }
    if (typeof input === 'object') return 'json';
    return 'unknown';
  }

  _detectTypeFromExt(filePath) {
    if (filePath.endsWith('.pdf')) return 'pdf';
    if (filePath.match(/\.(jpg|jpeg|png|webp|tiff)$/i)) return 'imagen';
    return 'archivo';
  }

  _getExtFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname);
      return ext || '.pdf';
    } catch {
      return '.pdf';
    }
  }

  _extractName(text) {
    // Muy básico: primera línea o palabra "Receta:"
    const lines = text.split('\n').filter(l => l.trim());
    const recetaLine = lines.find(l => l.toLowerCase().includes('receta'));
    if (recetaLine) return recetaLine.replace(/receta\s*/i, '').trim();
    return lines[0]?.trim() || 'Sin título';
  }

  _extractIngredients(text) {
    // Buscar líneas con patrones comunes: "- ingrediente", "* ingrediente", "ingrediente: cantidad"
    const lines = text.split('\n');
    const ingredients = [];
    let inIngredientSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes('ingrediente')) {
        inIngredientSection = true;
        continue;
      }
      if (inIngredientSection && (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./))) {
        ingredients.push(trimmed.replace(/^[-*\d.]\s*/, ''));
      }
    }

    return ingredients;
  }

  _extractInstructions(text) {
    // Buscar sección de instrucciones/preparación
    const lines = text.split('\n');
    const instructions = [];
    let inInstructionSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().match(/(preparación|instrucciones|elaboración|pasos)/)) {
        inInstructionSection = true;
        continue;
      }
      if (inInstructionSection && (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./))) {
        instructions.push(trimmed.replace(/^[-*\d.]\s*/, ''));
      }
    }

    return instructions;
  }

  _extractTime(text) {
    // Buscar patrones como "30 minutos", "1 hora", "45 min"
    const match = text.match(/(\d+)\s*(minutos?|horas?|min|h)/i);
    if (match) {
      const num = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      if (unit.includes('hora')) return num * 60;
      return num;
    }
    return null;
  }
}

module.exports = RecipeIngestionPipeline;
