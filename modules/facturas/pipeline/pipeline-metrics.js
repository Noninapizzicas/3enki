/**
 * PipelineMetrics — Commercial observability for invoice processing
 *
 * Tracks per-step timing, costs, success rates, and provides
 * dashboard-ready aggregated data.
 *
 * Uses core Metrics (counters + histograms) for persistence,
 * adds a local history ring buffer for recent invoice details.
 *
 * @version 1.0.0
 */

class PipelineMetrics {
  /**
   * @param {Object} coreMetrics - core/observability/metrics.js instance (from context.metrics)
   * @param {Object} logger
   */
  constructor(coreMetrics, logger) {
    this.metrics = coreMetrics;
    this.logger = logger;

    // Recent invoice history (ring buffer, last 200)
    this.history = [];
    this.maxHistory = 200;
  }

  // ==========================================================================
  // Recording — called by the pipeline after each run
  // ==========================================================================

  /**
   * Record a completed pipeline execution (success or failure).
   * Call this once per invoice after pipeline.process() finishes.
   *
   * @param {Object} result - Pipeline result
   * @param {Object} result.metrics - The metrics object from pipeline state
   * @param {boolean} result.success
   * @param {string} result.id - facturaId
   * @param {Object} result.estructura - structured data (if success)
   * @param {Object} result.validacion - validation result
   */
  record(result) {
    if (!this.metrics) return;

    const m = result.metrics || {};
    const steps = m.steps || {};
    const success = result.success;

    // ── Global counters ──
    this.metrics.increment('pipeline.invoices.total');
    this.metrics.increment(success ? 'pipeline.invoices.success' : 'pipeline.invoices.failed');

    if (result.duplicate) {
      this.metrics.increment('pipeline.invoices.duplicates');
    }

    // ── Total duration histogram ──
    if (m.totalDuration) {
      this.metrics.observe('pipeline.duration_ms', m.totalDuration);
    }

    // ── Cost tracking ──
    if (m.totalCost > 0) {
      this.metrics.increment('pipeline.cost.total_cents', Math.round(m.totalCost * 10000));
      this.metrics.observe('pipeline.cost_per_invoice', m.totalCost);
    }

    if (m.totalTokens > 0) {
      this.metrics.increment('pipeline.tokens.total', m.totalTokens);
    }

    // ── Per-step metrics ──
    for (const [stepName, stepData] of Object.entries(steps)) {
      if (stepData.duration) {
        this.metrics.observe(`pipeline.step.${stepName}.duration_ms`, stepData.duration);
      }

      this.metrics.increment(`pipeline.step.${stepName}.total`);
      this.metrics.increment(`pipeline.step.${stepName}.${stepData.status || 'unknown'}`);

      if (stepData.retries > 0) {
        this.metrics.increment(`pipeline.step.${stepName}.retries`, stepData.retries);
      }

      if (stepData.cost > 0) {
        this.metrics.observe(`pipeline.step.${stepName}.cost`, stepData.cost);
      }
    }

    // ── Provider tracking ──
    if (result.estructura) {
      const provider = Object.values(steps).find(s => s.status === 'completed' && s.cost > 0);
      // The structureProvider is in the pipeline state, passed via result
      // We track it via a counter
    }

    // ── Validation stats ──
    if (result.validacion) {
      this.metrics.increment('pipeline.validation.total');
      this.metrics.increment(
        result.validacion.valid
          ? 'pipeline.validation.passed'
          : 'pipeline.validation.failed'
      );

      const issueCount = result.validacion.issues?.length || 0;
      if (issueCount > 0) {
        this.metrics.increment('pipeline.validation.issues', issueCount);
      }
    }

    // ── History ring buffer ──
    this._addToHistory(result);
  }

  // ==========================================================================
  // Dashboard data — returns aggregated metrics for UI
  // ==========================================================================

  /**
   * Returns dashboard-ready data for the facturas metrics UI.
   *
   * @returns {Object} Aggregated metrics
   */
  getDashboard() {
    if (!this.metrics) {
      return { available: false };
    }

    const stats = this.metrics.getStats();
    const c = stats.counters;

    const totalInvoices = c['pipeline.invoices.total'] || 0;
    const successCount = c['pipeline.invoices.success'] || 0;
    const failedCount = c['pipeline.invoices.failed'] || 0;
    const duplicates = c['pipeline.invoices.duplicates'] || 0;

    return {
      available: true,

      // ── Summary ──
      summary: {
        total: totalInvoices,
        success: successCount,
        failed: failedCount,
        duplicates,
        successRate: totalInvoices > 0
          ? parseFloat(((successCount / totalInvoices) * 100).toFixed(1))
          : 0
      },

      // ── Cost ──
      cost: {
        totalCents: c['pipeline.cost.total_cents'] || 0,
        totalEur: ((c['pipeline.cost.total_cents'] || 0) / 10000).toFixed(4),
        perInvoice: this.metrics.getHistogram('pipeline.cost_per_invoice'),
        totalTokens: c['pipeline.tokens.total'] || 0
      },

      // ── Timing ──
      timing: {
        overall: this.metrics.getHistogram('pipeline.duration_ms'),
        steps: this._getStepTimings()
      },

      // ── Validation ──
      validation: {
        total: c['pipeline.validation.total'] || 0,
        passed: c['pipeline.validation.passed'] || 0,
        failed: c['pipeline.validation.failed'] || 0,
        totalIssues: c['pipeline.validation.issues'] || 0
      },

      // ── Recent history ──
      recent: this.history.slice(-20).reverse()
    };
  }

  /**
   * Returns per-step timing breakdowns.
   */
  _getStepTimings() {
    const steps = ['intake', 'convert', 'prepare', 'ocr', 'structure', 'validate', 'store'];
    const result = {};

    for (const step of steps) {
      const stats = this.metrics.getStats();
      const c = stats.counters;

      result[step] = {
        timing: this.metrics.getHistogram(`pipeline.step.${step}.duration_ms`),
        total: c[`pipeline.step.${step}.total`] || 0,
        completed: c[`pipeline.step.${step}.completed`] || 0,
        failed: c[`pipeline.step.${step}.failed`] || 0,
        retries: c[`pipeline.step.${step}.retries`] || 0,
        cost: this.metrics.getHistogram(`pipeline.step.${step}.cost`)
      };
    }

    return result;
  }

  // ==========================================================================
  // History
  // ==========================================================================

  _addToHistory(result) {
    const m = result.metrics || {};

    const entry = {
      id: result.id,
      success: result.success,
      duplicate: result.duplicate || false,
      timestamp: m.completedAt || new Date().toISOString(),
      duration_ms: m.totalDuration || 0,
      cost: m.totalCost || 0,
      tokens: m.totalTokens || 0,
      steps: {},
      validation: result.validacion
        ? { valid: result.validacion.valid, issues: result.validacion.issues?.length || 0 }
        : null,
      proveedor: result.estructura?.emisor?.nombre || null,
      total: result.estructura?.totales?.total_factura || null,
      error: result.error || null
    };

    // Compact step data
    for (const [stepName, stepData] of Object.entries(m.steps || {})) {
      entry.steps[stepName] = {
        duration: stepData.duration || 0,
        status: stepData.status,
        retries: stepData.retries || 0
      };
    }

    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Reset all pipeline metrics (for testing or new period).
   */
  reset() {
    // Only reset pipeline-specific counters/histograms
    const stats = this.metrics.getStats();

    for (const key of Object.keys(stats.counters)) {
      if (key.startsWith('pipeline.')) {
        this.metrics.resetCounter(key);
      }
    }

    for (const key of Object.keys(stats.histograms)) {
      if (key.startsWith('pipeline.')) {
        this.metrics.resetHistogram(key);
      }
    }

    this.history = [];
  }
}

module.exports = PipelineMetrics;
