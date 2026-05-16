'use strict';

const fs   = require('fs').promises;
const path = require('path');

/**
 * SnapshotStorage — Persistencia json-file single-tenant canonica.
 *
 * Aplica las reglas del contrato `persistence` en su modo `json-file`
 * (variante single-global, distinta a json-file-per-project del POC3):
 *
 *  - WRITE ATOMICO: tempFile + fs.rename. NUNCA fs.writeFile sobre el archivo
 *    final. Cleanup del .tmp si rename falla.
 *  - Save DEBOUNCED: agrupa mutaciones en una sola escritura tras N ms de
 *    inactividad. Util cuando el snapshot se guarda tras cada tap del cocinero
 *    (varias mutaciones por segundo).
 *  - flush() sincronico opcional (sin debounce) para onUnload.
 *  - ENOENT en read es graceful: log info + estado vacio (NUNCA error).
 *  - JSON corrupto tambien graceful: log warn + default.
 *  - mkdir recursive antes de escribir.
 *  - Encoding UTF-8.
 *  - Telemetria obligatoria en cada operacion: log + metric (timing duration,
 *    increment errors-enoent) con API canonica observability v1.1.0.
 *
 * Constructor enforce: lanza si falta logger / dataPath.
 */
class SnapshotStorage {
  /**
   * @param {Object} args
   * @param {string} args.dataPath      — path absoluto o relativo al snapshot
   * @param {Object} args.logger        — logger structured json
   * @param {Object} args.metrics       — metrics canonico (increment / gauge / timing)
   * @param {string} args.moduleName    — nombre del modulo (cocina) para signatures
   * @param {number} [args.debounceMs]  — agrupa saves dentro de la ventana (default 1000)
   */
  constructor({ dataPath, logger, metrics, moduleName = 'module', debounceMs = 1000 }) {
    if (!dataPath) throw new Error('SnapshotStorage: dataPath is required');
    if (!logger)   throw new Error('SnapshotStorage: logger is required');
    this.dataPath   = dataPath;
    this.logger     = logger;
    this.metrics    = metrics;
    this.moduleName = moduleName;
    this.debounceMs = debounceMs;

    this._timer       = null;
    this._pendingData = null;
    this._writeSeq    = 0;  // contador para diagnosticar coalescing
  }

  /**
   * Lee y parsea el snapshot. ENOENT y parse error son graceful: devuelve
   * { ok: true, data: defaultValue, source: 'enoent'|'corrupt'|'ok' }.
   *
   * @param {*} defaultValue — devuelto si el archivo no existe o esta corrupto
   */
  async read(defaultValue = {}) {
    const t0 = Date.now();
    try {
      const content = await fs.readFile(this.dataPath, 'utf-8');
      const parsed  = JSON.parse(content);
      const dur = Date.now() - t0;
      this.logger.info(`${this.moduleName}.snapshot.read.ok`, {
        path: this.dataPath, dur_ms: dur, bytes: content.length
      });
      this._timing(`${this.moduleName}.snapshot.read.duration`, dur, { status: 'ok' });
      return { ok: true, data: parsed, source: 'ok' };
    } catch (err) {
      const dur = Date.now() - t0;
      if (err.code === 'ENOENT') {
        this.logger.info(`${this.moduleName}.snapshot.read.enoent`, {
          path: this.dataPath, reason: 'first_run_or_manually_deleted'
        });
        this._increment(`${this.moduleName}.snapshot.enoent`, 1, {});
        return { ok: true, data: defaultValue, source: 'enoent' };
      }
      this.logger.warn(`${this.moduleName}.snapshot.read.error`, {
        path: this.dataPath, dur_ms: dur,
        error_code: err.code || null, error_message: err.message
      });
      this._increment(`${this.moduleName}.snapshot.errors`, 1, {
        op: 'read', kind: err.code || 'parse_error'
      });
      return { ok: true, data: defaultValue, source: 'corrupt' };
    }
  }

  /**
   * Programa una escritura debounced. Llamadas sucesivas dentro de debounceMs
   * coalescen en una sola escritura final (la ultima gana).
   */
  saveDebounced(data) {
    this._pendingData = data;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._flushPending(), this.debounceMs);
  }

  /**
   * Fuerza el flush inmediato (cancela debounce + escribe ya). Llamado desde
   * onUnload para evitar perder mutaciones recientes.
   */
  async flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._pendingData !== null) {
      const data = this._pendingData;
      this._pendingData = null;
      return this._writeAtomic(data);
    }
    return { ok: true, skipped: true };
  }

  /**
   * Para el debounce sin escribir (drop el dato pendiente). Util en tests.
   */
  cancel() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pendingData = null;
  }

  // ----------------------------------------------------------------- internal

  async _flushPending() {
    if (this._pendingData === null) return;
    const data = this._pendingData;
    this._pendingData = null;
    this._timer = null;
    await this._writeAtomic(data);
  }

  async _writeAtomic(data) {
    const t0 = Date.now();
    const tmpPath = `${this.dataPath}.tmp`;
    this._writeSeq++;
    try {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      const content = JSON.stringify(data);
      await fs.writeFile(tmpPath, content, 'utf-8');
      await fs.rename(tmpPath, this.dataPath);
      const dur = Date.now() - t0;
      this.logger.info(`${this.moduleName}.snapshot.write.ok`, {
        path: this.dataPath, dur_ms: dur, bytes: content.length, seq: this._writeSeq
      });
      this._timing(`${this.moduleName}.snapshot.write.duration`, dur, { status: 'ok' });
      return { ok: true };
    } catch (err) {
      const dur = Date.now() - t0;
      try { await fs.unlink(tmpPath); } catch (_) { /* ignore */ }
      this.logger.error(`${this.moduleName}.snapshot.write.error`, {
        path: this.dataPath, dur_ms: dur,
        error_code: err.code || null, error_message: err.message
      });
      this._increment(`${this.moduleName}.snapshot.errors`, 1, {
        op: 'write', kind: err.code || 'unknown'
      });
      return {
        ok: false,
        error: {
          code:    err.code === 'ENOSPC' ? 'SYSTEM_RESOURCE_EXHAUSTED' : 'UNKNOWN_ERROR',
          status:  500,
          message: `Snapshot write failed: ${err.message}`,
          details: { kind: 'infrastructure', retryable: err.code !== 'EACCES', error_code: err.code || null }
        }
      };
    }
  }

  _increment(name, value, labels) {
    if (this.metrics?.increment) this.metrics.increment(name, value || 1, labels);
  }

  _timing(name, value, labels) {
    if (this.metrics?.timing) this.metrics.timing(name, value, labels);
  }
}

module.exports = SnapshotStorage;
