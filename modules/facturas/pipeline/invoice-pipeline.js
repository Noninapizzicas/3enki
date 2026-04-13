/**
 * InvoicePipeline — Commercial-grade invoice processing
 *
 * Deterministic, step-based pipeline with:
 * - Per-step retry with exponential backoff
 * - Resume from any failed step
 * - Full observability (timing, cost, success rates)
 * - Clean input/output contracts per step
 *
 * The pipeline is CODE, not LLM-orchestrated.
 * IA is a tool called at specific steps, not the decision maker.
 *
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Step names (ordered)
const STEPS = [
  'intake',      // validate, hash, dedup, register in DB
  'convert',     // PDF → PNG images
  'prepare',     // Sharp image optimization for OCR
  'ocr',         // Text extraction
  'structure',   // IA: OCR text → structured JSON
  'validate',    // IA: verify data coherence
  'store'        // DB update, file archival, notifications
];

class InvoicePipeline {
  /**
   * @param {Object} deps - Injected dependencies
   * @param {Object} deps.services - ServiceExecutor instance
   * @param {Object} deps.eventBus - EventBus for publishing events
   * @param {Object} deps.logger - Structured logger
   * @param {Object} deps.config - Pipeline configuration
   */
  constructor(deps) {
    this.services = deps.services;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger;
    this.config = deps.config;
  }

  /**
   * Process an invoice file through the full pipeline.
   *
   * @param {string} filePath - Path to the invoice file (PDF or image)
   * @param {string} projectId - Project ID
   * @param {Object} options
   * @param {string} options.source - Origin: 'telegram' | 'gmail' | 'manual'
   * @param {Object} options.origen - Source metadata
   * @param {number} options.facturaId - Existing DB ID (for reprocessing)
   * @param {boolean} options.skipDuplicateCheck - Skip SHA-256 dedup
   * @param {string} options.resumeFrom - Step name to resume from
   * @param {Object} options.previousState - State from a previous interrupted run
   * @returns {Promise<PipelineResult>}
   */
  async process(filePath, projectId, options = {}) {
    const {
      source = 'manual',
      origen = {},
      facturaId = null,
      skipDuplicateCheck = false,
      resumeFrom = null,
      previousState = null
    } = options;

    // Initialize pipeline state
    const state = previousState || {
      filePath,
      projectId,
      source,
      origen,
      facturaId,
      fileHash: null,
      images: [],
      preparedImages: [],
      ocrTexts: [],
      estructura: null,
      validacion: null,
      datosDB: null,
      // Metrics
      metrics: {
        startedAt: new Date().toISOString(),
        steps: {},
        totalCost: 0,
        totalTokens: 0
      }
    };

    // Determine which steps to run
    const startIndex = resumeFrom ? STEPS.indexOf(resumeFrom) : 0;
    if (startIndex === -1) {
      throw new Error(`Unknown step: ${resumeFrom}. Valid: ${STEPS.join(', ')}`);
    }

    const fileName = path.basename(filePath);
    this.logger.info('pipeline.started', {
      fileName,
      projectId,
      source,
      resumeFrom: resumeFrom || 'intake',
      totalSteps: STEPS.length - startIndex
    });

    try {
      for (let i = startIndex; i < STEPS.length; i++) {
        const stepName = STEPS[i];
        const stepResult = await this._executeStep(stepName, state, {
          skipDuplicateCheck
        });

        // If a step returns early (e.g., duplicate found), stop
        if (stepResult?.earlyReturn) {
          return this._buildResult(state, stepResult);
        }
      }

      state.metrics.completedAt = new Date().toISOString();
      state.metrics.totalDuration = Date.now() - new Date(state.metrics.startedAt).getTime();

      this.logger.info('pipeline.completed', {
        id: state.facturaId,
        fileName,
        duration_ms: state.metrics.totalDuration,
        cost: state.metrics.totalCost,
        tokens: state.metrics.totalTokens
      });

      return this._buildResult(state, { success: true });

    } catch (error) {
      state.metrics.completedAt = new Date().toISOString();
      state.metrics.totalDuration = Date.now() - new Date(state.metrics.startedAt).getTime();
      state.metrics.error = error.message;

      // Find which step failed for resume capability
      const failedStep = Object.entries(state.metrics.steps)
        .find(([, s]) => s.status === 'failed')?.[0];

      this.logger.error('pipeline.failed', {
        id: state.facturaId,
        fileName,
        failedStep,
        error: error.message,
        duration_ms: state.metrics.totalDuration
      });

      // Update DB with error state
      if (state.facturaId) {
        await this._safeDBUpdate(projectId, state.facturaId, {
          estado: 'error',
          ocr_error: error.message
        });
      }

      // Publish error event
      this.eventBus.publish('factura.error', {
        projectId,
        id: state.facturaId,
        error: error.message,
        failedStep,
        resumable: !!failedStep
      });

      return {
        success: false,
        id: state.facturaId,
        error: error.message,
        failedStep,
        state, // Return state for resume
        metrics: state.metrics
      };
    }
  }

  // ==========================================================================
  // Step execution with retry and observability
  // ==========================================================================

  async _executeStep(stepName, state, options = {}) {
    const stepConfig = this.config.steps?.[stepName] || {};
    const maxRetries = stepConfig.retries ?? this.config.defaultRetries ?? 2;
    const timeout = stepConfig.timeout ?? this.config.timeouts?.[stepName] ?? 60000;

    const stepMetrics = {
      startedAt: Date.now(),
      status: 'running',
      retries: 0,
      cost: 0,
      tokens: 0
    };
    state.metrics.steps[stepName] = stepMetrics;

    this.logger.debug('pipeline.step.start', { step: stepName, timeout, maxRetries });

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          this.logger.info('pipeline.step.retry', { step: stepName, attempt, backoff });
          await this._sleep(backoff);
          stepMetrics.retries = attempt;
        }

        const result = await this._runStepWithTimeout(stepName, state, options, timeout);

        // Track IA costs if returned
        if (result?.cost) {
          stepMetrics.cost = result.cost;
          state.metrics.totalCost += result.cost;
        }
        if (result?.tokens) {
          stepMetrics.tokens = result.tokens;
          state.metrics.totalTokens += result.tokens;
        }

        stepMetrics.duration = Date.now() - stepMetrics.startedAt;
        stepMetrics.status = 'completed';

        this.logger.debug('pipeline.step.done', {
          step: stepName,
          duration_ms: stepMetrics.duration,
          retries: stepMetrics.retries
        });

        return result;

      } catch (error) {
        lastError = error;
        this.logger.warn('pipeline.step.error', {
          step: stepName,
          attempt,
          maxRetries,
          error: error.message
        });
      }
    }

    // All retries exhausted
    stepMetrics.duration = Date.now() - stepMetrics.startedAt;
    stepMetrics.status = 'failed';
    stepMetrics.error = lastError.message;

    throw new Error(`Step "${stepName}" failed after ${maxRetries + 1} attempts: ${lastError.message}`);
  }

  async _runStepWithTimeout(stepName, state, options, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step "${stepName}" timed out after ${timeout}ms`));
      }, timeout);

      this['_step_' + stepName](state, options)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  // ==========================================================================
  // STEP 1: INTAKE — validate, hash, dedup, register
  // ==========================================================================

  async _step_intake(state, options) {
    const { filePath, projectId, source, origen } = state;
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Validate extension
    const VALID_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];
    if (!VALID_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported format: ${ext}. Accepted: ${VALID_EXTENSIONS.join(', ')}`);
    }

    // Calculate SHA-256 hash
    const fileBuffer = fs.readFileSync(filePath);
    state.fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check for duplicates
    if (!state.facturaId && !options.skipDuplicateCheck) {
      try {
        const dupResult = await this.services.call(
          'local.facturas-db', 'buscarPorHash',
          { proyecto: projectId, hash: state.fileHash },
          { timeout: this.config.timeouts.db }
        );
        const dupData = dupResult.data || dupResult;
        if (dupData.factura) {
          return {
            earlyReturn: true,
            success: false,
            duplicate: true,
            existingId: dupData.factura.id,
            existingNombre: dupData.factura.nombre_archivo,
            error: `Duplicate: already exists as "${dupData.factura.nombre_archivo}"`
          };
        }
      } catch (e) {
        // buscarPorHash might not exist yet — don't block processing
        this.logger.debug('pipeline.intake.dedup-skip', { error: e.message });
      }
    }

    // Register in DB (new invoice)
    if (!state.facturaId) {
      const regResult = await this.services.call(
        'local.facturas-db', 'registrar',
        { proyecto: projectId, nombre_archivo: fileName, source, path_original: filePath, origen },
        { timeout: this.config.timeouts.db }
      );
      const regData = regResult.data || regResult;
      state.facturaId = regData.id;

      // Save file hash for future dedup
      if (state.fileHash) {
        await this._safeDBUpdate(projectId, state.facturaId, { file_hash: state.fileHash });
      }

      // Notify UI: new invoice received
      this.eventBus.publish('factura.recibida', {
        projectId, id: state.facturaId, nombre_archivo: fileName, source
      });
    }

    // Mark as processing
    await this._safeDBUpdate(projectId, state.facturaId, { estado: 'procesando' });

    // Ensure storage directories exist
    const storageDir = path.join(process.cwd(), 'data/projects', projectId, 'storage');
    for (const sub of ['preprocesadas', 'ocr', 'estructuradas']) {
      const dir = path.join(storageDir, sub);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    state.ext = ext;
    state.fileName = fileName;
    state.storageDir = storageDir;
  }

  // ==========================================================================
  // STEP 2: CONVERT — PDF → PNG images
  // ==========================================================================

  async _step_convert(state) {
    const { filePath, ext, storageDir, fileName } = state;
    const preproDir = path.join(storageDir, 'preprocesadas');

    if (ext === '.pdf') {
      const result = await this.services.call('local.pdf-to-png', 'convert', {
        pdf: filePath,
        dpi: this.config.processing.dpi,
        outputFolder: preproDir
      }, { timeout: this.config.timeouts.pdfConvert });

      const data = result.data || result;
      state.images = (data.images || []).map(img => img.path || path.join(preproDir, img.name));
    } else {
      // Image file — copy to preprocesadas
      const dest = path.join(preproDir, fileName);
      if (path.resolve(filePath) !== path.resolve(dest)) {
        fs.copyFileSync(filePath, dest);
      }
      state.images = [dest];
    }

    if (state.images.length === 0) {
      throw new Error('No images produced from file');
    }
  }

  // ==========================================================================
  // STEP 3: PREPARE — Sharp image optimization for OCR
  // ==========================================================================

  async _step_prepare(state) {
    const { images, storageDir } = state;
    const preproDir = path.join(storageDir, 'preprocesadas');

    state.preparedImages = [];

    for (const imgPath of images) {
      const baseName = path.basename(imgPath, path.extname(imgPath));
      const preparedPath = path.join(preproDir, `prepared_${baseName}.png`);

      await this.services.call('local.sharp', 'prepare-ocr', {
        image: imgPath,
        options: {
          ...this.config.processing.sharp,
          maxWidth: this.config.processing.maxWidth,
          maxHeight: this.config.processing.maxHeight
        },
        output: preparedPath
      }, { timeout: this.config.timeouts.sharp });

      state.preparedImages.push(preparedPath);
    }
  }

  // ==========================================================================
  // STEP 4: OCR — Text extraction
  // ==========================================================================

  async _step_ocr(state) {
    const { preparedImages, storageDir } = state;
    const ocrDir = path.join(storageDir, 'ocr');

    state.ocrTexts = [];

    for (const imgPath of preparedImages) {
      const baseName = path.basename(imgPath, path.extname(imgPath));

      const result = await this.services.call(this.config.ocr.provider, 'extract', {
        image: imgPath,
        hint: this.config.ocr.hint,
        languageHints: this.config.ocr.languages
      }, { timeout: this.config.timeouts.ocr });

      const data = result.data || result;
      const text = data.text || '';

      if (text) {
        fs.writeFileSync(path.join(ocrDir, `${baseName}.txt`), text, 'utf-8');
        state.ocrTexts.push({ baseName, text });
      }
    }

    if (state.ocrTexts.length === 0) {
      throw new Error('OCR extracted no text from any page');
    }
  }

  // ==========================================================================
  // STEP 5: STRUCTURE — IA: OCR text → structured JSON
  // ==========================================================================

  async _step_structure(state) {
    const fullText = state.ocrTexts.map(t => t.text).join('\n\n--- PAGE ---\n\n');

    const providers = this.config.ai.providers || ['deepseek'];
    let lastError = null;

    for (const provider of providers) {
      try {
        this.logger.debug('pipeline.structure.trying', { provider });

        const result = await this.services.call('ai', 'chat', {
          messages: [
            { role: 'system', content: STRUCTURING_PROMPT },
            { role: 'user', content: fullText }
          ],
          provider,
          temperature: this.config.ai.temperature,
          max_tokens: this.config.ai.maxTokens
        }, { timeout: this.config.timeouts.ai });

        const data = result.data || result;
        const response = data.content || data.message || '';

        if (!response) {
          this.logger.warn('pipeline.structure.empty', { provider });
          continue;
        }

        // Clean markdown wrapping
        const cleaned = response.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

        try {
          state.estructura = JSON.parse(cleaned);
          state.structureProvider = provider;

          // Track cost
          const cost = data.cost || 0;
          const tokens = data.usage?.total_tokens || 0;

          // Save structured JSON to disk
          const baseName = path.basename(state.fileName, state.ext);
          const structDir = path.join(state.storageDir, 'estructuradas');
          fs.writeFileSync(
            path.join(structDir, `${baseName}.json`),
            JSON.stringify(state.estructura, null, 2),
            'utf-8'
          );

          this.logger.info('pipeline.structure.success', { provider, cost, tokens });
          return { cost, tokens };

        } catch (e) {
          this.logger.warn('pipeline.structure.parse-error', { provider, error: e.message });
          lastError = e;
          continue;
        }

      } catch (e) {
        this.logger.warn('pipeline.structure.provider-error', { provider, error: e.message });
        lastError = e;
        continue;
      }
    }

    throw new Error(`All AI providers failed to structure invoice: ${lastError?.message}`);
  }

  // ==========================================================================
  // STEP 6: VALIDATE — IA: verify data coherence
  // ==========================================================================

  async _step_validate(state) {
    const { estructura } = state;
    if (!estructura) {
      throw new Error('No structured data to validate');
    }

    // Deterministic validations first (free, instant, reliable)
    const issues = [];

    // Check totals coherence
    const totales = estructura.totales || {};
    const base = parseFloat(totales.base_imponible) || 0;
    const ivaPct = parseFloat(totales.iva_porcentaje) || 0;
    const ivaAmount = parseFloat(totales.iva_importe) || 0;
    const total = parseFloat(totales.total_factura) || 0;

    if (base > 0 && total > 0) {
      const expectedTotal = base + ivaAmount;
      const tolerance = 0.02; // 2 cent tolerance for rounding
      if (Math.abs(expectedTotal - total) > tolerance) {
        issues.push({
          field: 'totales',
          type: 'math_mismatch',
          message: `base(${base}) + iva(${ivaAmount}) = ${expectedTotal}, but total = ${total}`,
          severity: 'warning'
        });
      }
    }

    // Verify IVA percentage makes sense (Spain: 0, 4, 10, 21)
    if (ivaPct > 0 && ![4, 10, 21].includes(ivaPct)) {
      issues.push({
        field: 'totales.iva_porcentaje',
        type: 'unusual_iva',
        message: `IVA ${ivaPct}% is unusual. Standard rates: 4%, 10%, 21%`,
        severity: 'info'
      });
    }

    // Check lines sum vs base
    const lineas = estructura.lineas || [];
    if (lineas.length > 0 && base > 0) {
      const lineSum = lineas.reduce((acc, l) => acc + (parseFloat(l.importe) || 0), 0);
      if (lineSum > 0 && Math.abs(lineSum - base) > 0.05) {
        issues.push({
          field: 'lineas',
          type: 'lines_sum_mismatch',
          message: `Sum of lines (${lineSum.toFixed(2)}) != base imponible (${base.toFixed(2)})`,
          severity: 'warning'
        });
      }
    }

    // Check required fields
    if (!estructura.emisor?.nombre && !estructura.emisor?.cif) {
      issues.push({
        field: 'emisor',
        type: 'missing_issuer',
        message: 'No issuer name or CIF detected',
        severity: 'error'
      });
    }

    if (!estructura.factura?.numero) {
      issues.push({
        field: 'factura.numero',
        type: 'missing_number',
        message: 'No invoice number detected',
        severity: 'warning'
      });
    }

    state.validacion = {
      valid: !issues.some(i => i.severity === 'error'),
      issues,
      checkedAt: new Date().toISOString()
    };

    // If there are warnings, log them but don't fail
    if (issues.length > 0) {
      this.logger.info('pipeline.validate.issues', {
        id: state.facturaId,
        issues: issues.length,
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length
      });
    }
  }

  // ==========================================================================
  // STEP 7: STORE — DB update, file archival, notifications
  // ==========================================================================

  async _step_store(state) {
    const { projectId, facturaId, estructura, validacion, ocrTexts, structureProvider } = state;

    if (!facturaId || !estructura) return;

    const fullOcrText = ocrTexts.map(t => t.text).join('\n\n');

    // Flatten structured data for DB
    const datosDB = {
      factura_numero: estructura.factura?.numero || null,
      factura_fecha: estructura.factura?.fecha || null,
      proveedor_nif: estructura.emisor?.cif || null,
      proveedor_nombre: estructura.emisor?.nombre || null,
      concepto: (estructura.lineas || []).map(l => l.descripcion).filter(Boolean).join(' + ') || null,
      base_imponible: estructura.totales?.base_imponible || null,
      tipo_iva: estructura.totales?.iva_porcentaje || null,
      cuota_iva: estructura.totales?.iva_importe || null,
      total_factura: estructura.totales?.total_factura || null,
      metodo_pago: estructura.factura?.forma_pago || null,
      ocr_texto: fullOcrText ? fullOcrText.substring(0, 5000) : null,
      ocr_provider: this.config.ocr.provider,
      estado: validacion?.valid !== false ? 'procesada' : 'error',
      fecha_procesado: new Date().toISOString()
    };

    // If validation found errors, mark for review
    if (validacion && !validacion.valid) {
      datosDB.estado = 'error';
      datosDB.ocr_error = validacion.issues
        .filter(i => i.severity === 'error')
        .map(i => i.message)
        .join('; ');
    }

    state.datosDB = datosDB;

    await this.services.call('local.facturas-db', 'actualizar', {
      proyecto: projectId, id: facturaId, campos: datosDB
    }, { timeout: this.config.timeouts.db });

    // Publish real-time event for UI
    this.eventBus.publish('factura.procesada', {
      projectId,
      id: facturaId,
      datos: {
        estado: datosDB.estado,
        numero_factura: estructura.factura?.numero,
        nombre_proveedor: estructura.emisor?.nombre,
        total: estructura.totales?.total_factura,
        fecha_factura: estructura.factura?.fecha
      },
      validation: validacion,
      metrics: {
        duration_ms: state.metrics.totalDuration,
        cost: state.metrics.totalCost,
        tokens: state.metrics.totalTokens,
        provider: structureProvider
      }
    });
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  _buildResult(state, stepResult) {
    if (stepResult?.earlyReturn) {
      return { ...stepResult, metrics: state.metrics };
    }

    return {
      success: stepResult.success,
      id: state.facturaId,
      estructura: state.estructura,
      validacion: state.validacion,
      datosDB: state.datosDB,
      paginas: state.images?.length || 0,
      metrics: state.metrics
    };
  }

  async _safeDBUpdate(projectId, facturaId, campos) {
    try {
      await this.services.call('local.facturas-db', 'actualizar', {
        proyecto: projectId, id: facturaId, campos
      }, { timeout: this.config.timeouts.db });
    } catch (e) {
      this.logger.error('pipeline.db.update.error', { id: facturaId, error: e.message });
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// STRUCTURING PROMPT — Specialized for Spanish invoices
// =============================================================================

const STRUCTURING_PROMPT = `Eres un experto en extracción de datos de facturas españolas.
A partir del texto OCR proporcionado, extrae los datos estructurados en JSON.

FORMATO EXACTO requerido:
{
  "emisor": {
    "nombre": "",
    "cif": "",
    "direccion": "",
    "telefono": "",
    "web": ""
  },
  "receptor": {
    "nombre": "",
    "cif": "",
    "direccion": "",
    "codigo_cliente": ""
  },
  "factura": {
    "numero": "",
    "fecha": "",
    "forma_pago": ""
  },
  "lineas": [
    {
      "descripcion": "",
      "unidades": 0,
      "precio": 0,
      "descuento": "",
      "importe": 0
    }
  ],
  "totales": {
    "base_imponible": 0,
    "iva_porcentaje": 0,
    "iva_importe": 0,
    "total_factura": 0,
    "resto_cobrar": 0
  }
}

REGLAS:
- Devuelve SOLO el JSON, sin explicaciones ni markdown.
- Precios siempre con 2 decimales.
- Si un campo no se puede leer con certeza, usa null.
- CIF/NIF: formato español (letra + 8 dígitos o 8 dígitos + letra).
- Fecha: formato DD/MM/YYYY o YYYY-MM-DD.
- IVA: en España es 21% general, 10% reducido, 4% superreducido.
- Verifica que base_imponible + iva_importe ≈ total_factura.`;

module.exports = InvoicePipeline;
