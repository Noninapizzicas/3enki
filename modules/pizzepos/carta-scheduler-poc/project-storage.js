'use strict';

const fs   = require('fs').promises;
const path = require('path');

/**
 * ProjectStorage — Persistencia json-file-per-project canonica.
 *
 * Aplica las reglas del contrato `persistence` (modo json-file-per-project):
 *  - Write atomico: tempFile + fs.rename. NUNCA fs.writeFile sobre el archivo final.
 *  - ENOENT en read es graceful (log info + estado vacio, NUNCA error).
 *  - JSON.parse fallido tambien graceful (log warn + estado vacio).
 *  - mkdir recursive antes de escribir.
 *  - Encoding UTF-8, indent 2 (legibilidad humana de backups).
 *  - Telemetria obligatoria: log + metric en cada read/write y en cada error.
 *  - Aislamiento absoluto entre proyectos: cada uno tiene su path resuelto via
 *    basePath registrado en register(); el storage NUNCA lee paths de otro.
 *
 * Coverage del POC3 vs el contrato persistence (regla atomic_writes_mandatory):
 * el original carta-scheduler escribia con fs.writeFile directo — drift cerrado
 * aqui en _writeAtomic.
 */
class ProjectStorage {
  /**
   * @param {Object} args
   * @param {Object} args.logger      — logger structured json (this.logger)
   * @param {Object} args.metrics     — metrics canonico (increment / gauge / timing)
   * @param {string} args.moduleName  — nombre del modulo (carta-scheduler) para signatures
   * @param {string} args.subdir      — subdirectorio dentro de basePath (ej. 'storage/pizzepos/config')
   */
  constructor({ logger, metrics, moduleName, subdir }) {
    if (!logger)     throw new Error('ProjectStorage: logger is required');
    if (!moduleName) throw new Error('ProjectStorage: moduleName is required');
    if (!subdir)     throw new Error('ProjectStorage: subdir is required');
    this.logger     = logger;
    this.metrics    = metrics;
    this.moduleName = moduleName;
    this.subdir     = subdir;
    this._basePaths = new Map();   // project_id → basePath resuelto
  }

  /**
   * Registra el basePath del proyecto. Llamado desde onProjectActivated.
   * El storage NUNCA accede a paths de otros proyectos: solo los registrados.
   */
  register(projectId, basePath) {
    if (!projectId || !basePath) {
      this.logger.warn(`${this.moduleName}.storage.register.invalid`, { project_id: projectId, base_path: basePath });
      return;
    }
    this._basePaths.set(projectId, basePath);
  }

  /**
   * Libera el basePath de un proyecto (typicamente onProjectDeactivated).
   * NO borra los archivos en disco — solo libera la referencia en memoria.
   */
  unregister(projectId) {
    this._basePaths.delete(projectId);
  }

  /**
   * Resuelve el path absoluto de un archivo en el proyecto.
   * Devuelve null si el proyecto no esta registrado.
   */
  pathFor(projectId, fileName) {
    const base = this._basePaths.get(projectId);
    if (!base) return null;
    return path.join(base, this.subdir, fileName);
  }

  /**
   * Lee y parsea un JSON del proyecto. ENOENT y parse error son graceful:
   * devuelven { ok: true, data: defaultValue }.
   *
   * @param {string} projectId
   * @param {string} fileName
   * @param {*}      defaultValue — devuelto si el archivo no existe o esta corrupto
   * @returns {Promise<{ok:true, data}>} — siempre ok=true (graceful)
   */
  async readJson(projectId, fileName, defaultValue = null) {
    const filePath = this.pathFor(projectId, fileName);
    if (!filePath) {
      this.logger.warn(`${this.moduleName}.storage.read.no_path`, {
        project_id: projectId, file: fileName, reason: 'project_not_registered'
      });
      return { ok: true, data: defaultValue };
    }

    const t0 = Date.now();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed  = JSON.parse(content);
      const dur = Date.now() - t0;
      this.logger.debug(`${this.moduleName}.storage.read.ok`, {
        project_id: projectId, file: fileName, dur_ms: dur, bytes: content.length
      });
      this._timing(`${this.moduleName}.storage.read.duration`, dur, { file: fileName, status: 'ok' });
      return { ok: true, data: parsed };
    } catch (err) {
      const dur = Date.now() - t0;
      if (err.code === 'ENOENT') {
        this.logger.info(`${this.moduleName}.storage.read.enoent`, {
          project_id: projectId, file: fileName,
          reason: 'first_run_or_manually_deleted'
        });
        this._increment(`${this.moduleName}.storage.enoent`, 1, { file: fileName });
        return { ok: true, data: defaultValue };
      }
      // Cualquier otro error de read (incluido JSON parse) → log warn + estado vacio
      this.logger.warn(`${this.moduleName}.storage.read.error`, {
        project_id: projectId, file: fileName, dur_ms: dur,
        error_code: err.code || null, error_message: err.message
      });
      this._increment(`${this.moduleName}.storage.errors`, 1, {
        file: fileName, op: 'read', kind: err.code || 'parse_error'
      });
      return { ok: true, data: defaultValue };
    }
  }

  /**
   * Escribe un JSON del proyecto con write ATOMICO (tempFile + rename).
   * Crea el directorio si no existe. UTF-8, indent 2.
   *
   * @param {string} projectId
   * @param {string} fileName
   * @param {*}      data
   * @returns {Promise<{ok: true} | {ok: false, error}>} — devuelve shape interno;
   *          el caller traduce al canonico antes de publicar al bus.
   */
  async writeJson(projectId, fileName, data) {
    const filePath = this.pathFor(projectId, fileName);
    if (!filePath) {
      const err = new Error(`Project ${projectId} not registered in storage`);
      this.logger.error(`${this.moduleName}.storage.write.no_path`, {
        project_id: projectId, file: fileName, error_message: err.message
      });
      this._increment(`${this.moduleName}.storage.errors`, 1, {
        file: fileName, op: 'write', kind: 'no_path'
      });
      return { ok: false, error: { code: 'FILESYSTEM_ERROR', status: 500, message: err.message, details: { kind: 'infrastructure', retryable: false, project_id: projectId, file: fileName } } };
    }

    const t0 = Date.now();
    const tmpPath = `${filePath}.tmp`;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const content = JSON.stringify(data, null, 2);
      // Write atomico: tempFile + rename. NUNCA fs.writeFile directo sobre filePath.
      await fs.writeFile(tmpPath, content, 'utf-8');
      await fs.rename(tmpPath, filePath);
      const dur = Date.now() - t0;
      this.logger.info(`${this.moduleName}.storage.write.ok`, {
        project_id: projectId, file: fileName, dur_ms: dur, bytes: content.length
      });
      this._timing(`${this.moduleName}.storage.write.duration`, dur, { file: fileName, status: 'ok' });
      return { ok: true };
    } catch (err) {
      const dur = Date.now() - t0;
      // Cleanup del tempFile si quedo abandonado
      try { await fs.unlink(tmpPath); } catch (_) { /* ignore — best effort */ }
      this.logger.error(`${this.moduleName}.storage.write.error`, {
        project_id: projectId, file: fileName, dur_ms: dur,
        error_code: err.code || null, error_message: err.message,
        path_tmp: tmpPath
      });
      this._increment(`${this.moduleName}.storage.errors`, 1, {
        file: fileName, op: 'write', kind: err.code || 'unknown'
      });
      return {
        ok: false,
        error: {
          code:    err.code === 'ENOSPC' ? 'DISK_FULL' : 'FILESYSTEM_ERROR',
          status:  500,
          message: `Write to ${fileName} failed: ${err.message}`,
          details: { kind: 'infrastructure', retryable: err.code !== 'EACCES', project_id: projectId, file: fileName, error_code: err.code || null }
        }
      };
    }
  }

  // ----------------------------------------------------------------- internal

  _increment(name, value, labels) {
    if (this.metrics?.increment) this.metrics.increment(name, value || 1, labels);
  }

  _timing(name, value, labels) {
    if (this.metrics?.timing) this.metrics.timing(name, value, labels);
  }
}

module.exports = ProjectStorage;
