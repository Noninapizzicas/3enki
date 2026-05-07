/**
 * File Writer
 *
 * Escribe el estado del buffer a disco periódicamente. El archivo resultante
 * es lo que la IA lee para conocer el estado del sistema.
 *
 * Características:
 * - Escribe cada N segundos (configurable).
 * - Escritura atómica (tmp + rename) — POSIX garantiza que el rename es atómico.
 * - Maneja errores de escritura sin crashear y los reporta al callback `onError`
 *   del módulo (sin acoplar la lib al logger del core).
 * - No crece infinitamente (sobreescribe).
 */

const fs   = require('fs');
const path = require('path');

class FileWriter {
  /**
   * @param {Object} options
   * @param {ConsoleBuffer} options.buffer - Buffer a escribir
   * @param {string} options.filePath - Ruta del archivo
   * @param {number} options.intervalMs - Intervalo de escritura (default: 2000)
   * @param {string} options.coreId - ID del core
   * @param {number} options.startTime - Timestamp de inicio
   * @param {Function} [options.onError] - Callback (level, event, payload) para
   *   enrutar logs al logger del módulo. Si no se pasa, fallback silencioso.
   */
  constructor(options = {}) {
    this.buffer    = options.buffer;
    this.filePath  = options.filePath || './data/system-console.json';
    this.intervalMs = options.intervalMs || 2000;
    this.coreId    = options.coreId    || 'unknown';
    this.startTime = options.startTime || Date.now();
    this.onError   = typeof options.onError === 'function' ? options.onError : () => {};

    this.timer     = null;
    this.writing   = false;
    this.lastError = null;
  }

  start() {
    if (this.timer) return;
    this._ensureDirectory();
    this._write();
    this.timer = setInterval(() => this._write(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Última escritura síncrona-best-effort (no esperar al promise para no
    // bloquear el unload del módulo si falla la red de archivos).
    this._write();
  }

  flush() {
    return this._write();
  }

  _ensureDirectory() {
    const dir = path.dirname(this.filePath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      this._reportError('mkdir', error);
    }
  }

  async _write() {
    if (this.writing) return;
    this.writing = true;

    const tempPath = `${this.filePath}.tmp`;

    try {
      const state = this.buffer.getFullState(this.coreId, this.startTime);
      const json  = JSON.stringify(state, null, 2);

      await fs.promises.writeFile(tempPath, json, 'utf8');
      await fs.promises.rename(tempPath, this.filePath);

      this.lastError = null;
    } catch (error) {
      try { await fs.promises.unlink(tempPath); } catch (_e) { /* ignore */ }
      this._reportError('write', error);
    } finally {
      this.writing = false;
    }
  }

  // Reporta error solo si cambió (evita ruido en logs por fallos repetidos).
  _reportError(stage, error) {
    if (this.lastError === error.message) return;
    this.lastError = error.message;
    this.onError('error', `system-inspector.file_writer.${stage}_failed`, {
      error: error.message,
      file:  this.filePath
    });
  }
}

module.exports = FileWriter;
