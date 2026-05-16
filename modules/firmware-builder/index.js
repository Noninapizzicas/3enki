/**
 * firmware-builder v2.0.0 — Reescrito al canon (POC2 #20 del horizontal).
 *
 * Compilación de firmware ESP32 por convención: cada subdirectorio de
 * firmware/drivers/ con platformio.ini es un driver compilable. Spawn de
 * PlatformIO CLI con timeout + sliding-window log + dedupe close/error.
 *
 * 4 ui_handlers (list-drivers/build/build-status/list-boards), 4 tools
 * (mismos handlers, expuestos al LLM).
 * 0 subscribes — el upstream es la UI/tool que llama handleBuild.
 * 3 publishes de dominio: firmware.build_started/completed/failed.
 *
 * Cumple los contratos transversales:
 *  - errors: handlers devuelven { status, data | error: { code, message } }.
 *    Codes canónicos: INVALID_INPUT, RESOURCE_NOT_FOUND, CONFLICT_STATE,
 *    QUOTA_EXCEEDED, UNKNOWN_ERROR.
 *  - observability: correlation_id propagado vía _publicarEvento; counter
 *    firmware-builder.errors con labels kind+code en cada error path.
 *  - lifecycle: onLoad escanea drivers; onUnload mata builds activos +
 *    limpia drivers Map sin leak.
 *  - persistence: filesystem-read-only sobre firmware/drivers/ (declara en
 *    config.persistence.pattern del module.json).
 *
 * 5 helpers POC2:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar _parseBoardFromIni.
 *
 * Build asíncrono fire-and-forget: handleBuild devuelve 202 inmediato; el
 * cliente sondea con builder.build_status. Eventos canónicos del bus se
 * preservan invariantes — firmware-manager auto-registra binarios via
 * firmware.build_completed sin enterarse de la reescritura.
 *
 * Monolito (526 LOC v1.1.0) preservado en
 * arquitectura/migracion/_legacy/firmware-builder-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/firmware-builder-mapa.md
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const BOARDS = {
  esp32dev:    { name: 'ESP32 DevKit', platform: 'espressif32', mcu: 'esp32',   flash: '4MB', psram: false },
  'esp32-s2':  { name: 'ESP32-S2',     platform: 'espressif32', mcu: 'esp32s2', flash: '4MB', psram: false },
  'esp32-s3':  { name: 'ESP32-S3',     platform: 'espressif32', mcu: 'esp32s3', flash: '8MB', psram: true  },
  'esp32-c3':  { name: 'ESP32-C3',     platform: 'espressif32', mcu: 'esp32c3', flash: '4MB', psram: false },
  'esp32-c6':  { name: 'ESP32-C6',     platform: 'espressif32', mcu: 'esp32c6', flash: '4MB', psram: false }
};

const MAX_LOG_LINES = 500;
const CLEAN_TIMEOUT_MS = 60 * 1000;

class FirmwareBuilderModule {
  constructor() {
    this.name = 'firmware-builder';
    this.version = '2.0.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    this.config = {
      firmware_path: './firmware/drivers',
      platformio_path: 'platformio',
      build_timeout_ms: 5 * 60 * 1000,
      max_concurrent_builds: 2
    };

    this.drivers = new Map();
    this.activeBuilds = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('firmware-builder.loading', { module: this.name, version: this.version });

    if (core.config?.['firmware-builder']) {
      this.config = { ...this.config, ...core.config['firmware-builder'] };
    }

    this._validateConfig();
    this.config.firmware_path = path.resolve(this.config.firmware_path);

    await this._scanDrivers();

    this.metrics.gauge('firmware.drivers.count', this.drivers.size);
    this.metrics.gauge('firmware.active_builds.count', 0);

    this.logger.info('firmware-builder.loaded', {
      module: this.name,
      version: this.version,
      drivers: this.drivers.size,
      firmware_path: this.config.firmware_path
    });
  }

  async onUnload() {
    this.logger.info('firmware-builder.unloading', { module: this.name });

    let killed = 0;
    for (const [, build] of this.activeBuilds) {
      if (build.process && !build.process.killed) {
        build.process.kill('SIGTERM');
        killed++;
      }
    }

    if (killed > 0) {
      this.logger.warn('firmware-builder.builds.killed_on_unload', { count: killed });
    }

    this.activeBuilds.clear();
    this.drivers.clear();

    this.logger.info('firmware-builder.unloaded', { module: this.name });
  }

  // ==========================================
  // Config validation
  // ==========================================

  _validateConfig() {
    if (typeof this.config.firmware_path !== 'string' || !this.config.firmware_path) {
      this.logger.warn('firmware-builder.config.invalid', {
        field: 'firmware_path', value: this.config.firmware_path, fallback: './firmware/drivers'
      });
      this.config.firmware_path = './firmware/drivers';
    }
    if (typeof this.config.platformio_path !== 'string' || !this.config.platformio_path) {
      this.config.platformio_path = 'platformio';
    }
    if (typeof this.config.build_timeout_ms !== 'number' || this.config.build_timeout_ms < 1000) {
      this.logger.warn('firmware-builder.config.invalid', {
        field: 'build_timeout_ms', value: this.config.build_timeout_ms, fallback: 300000
      });
      this.config.build_timeout_ms = 5 * 60 * 1000;
    }
    if (typeof this.config.max_concurrent_builds !== 'number' || this.config.max_concurrent_builds < 1) {
      this.config.max_concurrent_builds = 2;
    }
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleListDrivers() {
    await this._scanDrivers();

    const drivers = [];
    for (const [id, drv] of this.drivers) {
      drivers.push({
        id,
        name: drv.name,
        description: drv.description,
        utility: drv.utility || '',
        board: drv.board,
        capabilities: drv.capabilities || [],
        path: drv.path,
        has_binary: drv.has_binary,
        binary_size: drv.binary_size || null,
        last_build: drv.last_build,
        is_building: this.activeBuilds.has(id),
        source_files: drv.source_files || []
      });
    }

    return { status: 200, data: { drivers, total: drivers.length } };
  }

  async handleBuild(data) {
    const driver = data?.driver;
    const board = data?.board;
    const clean = !!data?.clean;

    if (!driver) {
      this.logger.warn('firmware-builder.build.validation', { field: 'driver' });
      this.metrics?.increment('firmware-builder.errors', { kind: 'build', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'driver requerido', { field: 'driver' });
    }

    const driverInfo = this.drivers.get(driver);
    if (!driverInfo) {
      this.logger.warn('firmware-builder.build.driver_not_found', { driver });
      this.metrics?.increment('firmware-builder.errors', { kind: 'build', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        `Driver '${driver}' no encontrado`, { entity_type: 'driver', entity_id: driver });
    }

    if (this.activeBuilds.has(driver)) {
      this.logger.warn('firmware-builder.build.already_building', { driver });
      this.metrics?.increment('firmware-builder.errors', { kind: 'build', code: 'CONFLICT_STATE' });
      return this._errorResponse(409, 'CONFLICT_STATE',
        `Driver '${driver}' ya está compilando`, { entity_type: 'driver', entity_id: driver });
    }

    if (this.activeBuilds.size >= this.config.max_concurrent_builds) {
      this.logger.warn('firmware-builder.build.max_concurrent', {
        active: this.activeBuilds.size, max: this.config.max_concurrent_builds
      });
      this.metrics?.increment('firmware-builder.errors', { kind: 'build', code: 'QUOTA_EXCEEDED' });
      return this._errorResponse(429, 'QUOTA_EXCEEDED',
        `Máximo de builds concurrentes alcanzado (${this.config.max_concurrent_builds})`,
        { active: this.activeBuilds.size, max: this.config.max_concurrent_builds });
    }

    if (board && !BOARDS[board]) {
      this.logger.warn('firmware-builder.build.unsupported_board', { board });
      this.metrics?.increment('firmware-builder.errors', { kind: 'build', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT',
        `Board '${board}' no soportado`,
        { field: 'board', valid: Object.keys(BOARDS) });
    }

    const startTime = Date.now();
    const effectiveBoard = board || driverInfo.board;
    const buildEnv = driverInfo.buildEnv || effectiveBoard;

    if (clean) {
      await this._runClean(driverInfo.path, buildEnv);
    }

    const args = ['run', '-d', driverInfo.path];
    if (board) args.push('-e', board);

    this.logger.info('firmware-builder.build.starting', { driver, board: effectiveBoard, clean });

    const correlationId = data?.correlation_id || crypto.randomUUID();
    this._runBuild(driver, driverInfo.path, args, startTime, effectiveBoard, correlationId)
      .catch(err => {
        this.logger.error('firmware-builder.build.unhandled_error', { driver, error: err.message });
        this.metrics?.increment('firmware-builder.errors', { kind: 'build', code: 'UNKNOWN_ERROR' });
      });

    return {
      status: 202,
      data: {
        driver,
        board: effectiveBoard,
        status: 'building',
        message: `Compilación iniciada para driver '${driver}'`,
        correlation_id: correlationId
      }
    };
  }

  async handleBuildStatus(data) {
    const driverName = data?.driver;

    if (driverName) {
      const active = this.activeBuilds.get(driverName);
      if (active) {
        return {
          status: 200,
          data: {
            driver: driverName,
            status: 'building',
            started_at: active.started_at,
            elapsed_ms: Date.now() - new Date(active.started_at).getTime(),
            log_lines: active.log.length,
            log_tail: active.log.slice(-20)
          }
        };
      }

      const driver = this.drivers.get(driverName);
      if (!driver) {
        this.logger.warn('firmware-builder.build_status.driver_not_found', { driver: driverName });
        this.metrics?.increment('firmware-builder.errors', { kind: 'build_status', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Driver '${driverName}' no encontrado`,
          { entity_type: 'driver', entity_id: driverName });
      }

      return {
        status: 200,
        data: {
          driver: driverName,
          status: driver.last_build_status || 'never',
          last_build: driver.last_build
        }
      };
    }

    const active = [];
    for (const [name, build] of this.activeBuilds) {
      active.push({
        driver: name,
        status: 'building',
        started_at: build.started_at,
        elapsed_ms: Date.now() - new Date(build.started_at).getTime()
      });
    }

    return { status: 200, data: { active_builds: active, count: active.length } };
  }

  async handleListBoards() {
    const boards = Object.entries(BOARDS).map(([id, info]) => ({ id, ...info }));
    return { status: 200, data: { boards, total: boards.length } };
  }

  // ==========================================
  // Build execution
  // ==========================================

  async _runBuild(driverName, driverPath, args, startTime, board, correlationId) {
    const driverInfo = this.drivers.get(driverName);
    const buildEnv = driverInfo?.buildEnv || board;

    return new Promise((resolve) => {
      const buildLog = [];
      let resolved = false;
      const buildInfo = {
        started_at: new Date(startTime).toISOString(),
        log: buildLog,
        process: null,
        correlation_id: correlationId
      };

      this.activeBuilds.set(driverName, buildInfo);

      this.metrics.increment('firmware.build_started.total');
      this.metrics.gauge('firmware.active_builds.count', this.activeBuilds.size);

      this._publicarEvento('firmware.build_started', {
        driver: driverName, board, started_at: buildInfo.started_at
      }, { correlation_id: correlationId }).catch(err => {
        this.logger.error('firmware-builder.build_started.publish_error', { error: err.message });
      });

      const proc = spawn(this.config.platformio_path, args, {
        cwd: driverPath,
        env: { ...process.env, PLATFORMIO_FORCE_COLOR: 'false' },
        timeout: this.config.build_timeout_ms
      });

      buildInfo.process = proc;

      const appendLog = (chunk) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        buildLog.push(...lines);
        if (buildLog.length > MAX_LOG_LINES) {
          buildLog.splice(0, buildLog.length - MAX_LOG_LINES);
        }
      };

      proc.stdout.on('data', appendLog);
      proc.stderr.on('data', appendLog);

      proc.on('close', (code) => {
        if (resolved) return;
        resolved = true;

        const duration = Date.now() - startTime;
        this.activeBuilds.delete(driverName);
        this.metrics.gauge('firmware.active_builds.count', this.activeBuilds.size);

        const driver = this.drivers.get(driverName);
        const isTimeout = code === null;

        if (code === 0) {
          const binPath = path.join(driverPath, '.pio', 'build', buildEnv, 'firmware.bin');
          let binarySize = 0;
          try {
            const stat = fs.statSync(binPath);
            binarySize = stat.size;
          } catch (err) {
            this.logger.debug('firmware-builder.binary.stat_failed', {
              driver: driverName, bin_path: binPath, error: err.message
            });
          }

          if (driver) {
            driver.last_build = new Date().toISOString();
            driver.last_build_status = 'success';
            driver.has_binary = binarySize > 0;
            driver.binary_size = binarySize;
          }

          this.metrics.increment('firmware.build_completed.total');
          this.metrics.timing('firmware.build.duration', duration);

          this.logger.info('firmware-builder.build.completed', {
            driver: driverName, duration_ms: duration, binary_size: binarySize
          });

          this._publicarEvento('firmware.build_completed', {
            driver: driverName,
            board,
            binary_path: binPath,
            binary_size: binarySize,
            duration_ms: duration,
            utility: driverInfo?.utility || '',
            description: driverInfo?.description || '',
            capabilities: driverInfo?.capabilities || []
          }, { correlation_id: correlationId }).catch(err => {
            this.logger.error('firmware-builder.build_completed.publish_error', { error: err.message });
          });

          resolve({ success: true, binary_path: binPath, binary_size: binarySize, duration_ms: duration });
          return;
        }

        const reason = isTimeout ? 'timeout' : 'compilation_error';
        const errorOutput = buildLog.slice(-30).join('\n');

        if (driver) {
          driver.last_build = new Date().toISOString();
          driver.last_build_status = 'failed';
        }

        this.metrics.increment('firmware.build_failed.total');
        this.metrics.timing('firmware.build.duration', duration);

        this.logger.error('firmware-builder.build.failed', {
          driver: driverName, exit_code: code, reason, duration_ms: duration
        });

        this._publicarEvento('firmware.build_failed', {
          driver: driverName,
          board,
          error: isTimeout ? `Build timeout (${this.config.build_timeout_ms}ms)` : errorOutput,
          exit_code: code,
          reason,
          duration_ms: duration
        }, { correlation_id: correlationId }).catch(err => {
          this.logger.error('firmware-builder.build_failed.publish_error', { error: err.message });
        });

        resolve({ success: false, error: errorOutput, exit_code: code, reason, duration_ms: duration });
      });

      proc.on('error', (err) => {
        if (resolved) return;
        resolved = true;

        const duration = Date.now() - startTime;
        this.activeBuilds.delete(driverName);
        this.metrics.gauge('firmware.active_builds.count', this.activeBuilds.size);
        this.metrics.increment('firmware.build_failed.total');

        const driver = this.drivers.get(driverName);
        if (driver) {
          driver.last_build = new Date().toISOString();
          driver.last_build_status = 'failed';
        }

        this.logger.error('firmware-builder.build.spawn_error', {
          driver: driverName, error: err.message
        });

        this._publicarEvento('firmware.build_failed', {
          driver: driverName,
          board,
          error: `No se pudo ejecutar '${this.config.platformio_path}': ${err.message}`,
          exit_code: -1,
          reason: 'spawn_error',
          duration_ms: duration
        }, { correlation_id: correlationId }).catch(pubErr => {
          this.logger.error('firmware-builder.build_failed.publish_error', { error: pubErr.message });
        });

        resolve({ success: false, error: err.message, duration_ms: duration });
      });
    });
  }

  _runClean(driverPath, buildEnv) {
    return new Promise((resolve) => {
      const args = ['run', '-t', 'clean', '-d', driverPath];
      if (buildEnv) args.push('-e', buildEnv);

      const proc = spawn(this.config.platformio_path, args, {
        cwd: driverPath,
        env: { ...process.env, PLATFORMIO_FORCE_COLOR: 'false' },
        stdio: 'ignore',
        timeout: CLEAN_TIMEOUT_MS
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          this.logger.warn('firmware-builder.clean.failed', { driver_path: driverPath, exit_code: code });
        }
        resolve();
      });
      proc.on('error', (err) => {
        this.logger.warn('firmware-builder.clean.spawn_error', { driver_path: driverPath, error: err.message });
        resolve();
      });
    });
  }

  // ==========================================
  // Driver scanner
  // ==========================================

  async _scanDrivers() {
    const prevState = new Map();
    for (const [id, drv] of this.drivers) {
      if (drv.last_build || drv.last_build_status) {
        prevState.set(id, { last_build: drv.last_build, last_build_status: drv.last_build_status });
      }
    }

    this.drivers.clear();

    let entries;
    try {
      entries = await fs.promises.readdir(this.config.firmware_path, { withFileTypes: true });
    } catch (err) {
      this.logger.warn('firmware-builder.scan.failed', {
        path: this.config.firmware_path, error: err.message
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const driverPath = path.join(this.config.firmware_path, entry.name);
      const pioIni = path.join(driverPath, 'platformio.ini');

      try {
        await fs.promises.access(pioIni);
      } catch (err) {
        this.logger.debug('firmware-builder.scan.no_platformio_ini', {
          dir: entry.name, error: err.message
        });
        continue;
      }

      let board = 'esp32dev';
      let envName = null;
      let description = '';
      try {
        const ini = await fs.promises.readFile(pioIni, 'utf-8');
        const parsed = this._parseBoardFromIni(ini);
        if (parsed.board) board = parsed.board;
        if (parsed.envName) envName = parsed.envName;
      } catch (err) {
        this.logger.debug('firmware-builder.scan.ini_read_failed', {
          driver: entry.name, error: err.message
        });
      }

      try {
        const readme = await fs.promises.readFile(path.join(driverPath, 'README.md'), 'utf-8');
        const firstLine = readme.split('\n').find(l => l.trim() && !l.startsWith('#'));
        if (firstLine) description = firstLine.trim().substring(0, 120);
      } catch (err) {
        this.logger.debug('firmware-builder.scan.readme_read_failed', {
          driver: entry.name, error: err.message
        });
      }

      let driverMeta = {};
      try {
        const metaRaw = await fs.promises.readFile(path.join(driverPath, 'driver.json'), 'utf-8');
        driverMeta = JSON.parse(metaRaw);
      } catch (err) {
        this.logger.debug('firmware-builder.scan.meta_read_failed', {
          driver: entry.name, error: err.message
        });
      }

      const buildEnv = envName || board;

      let hasBinary = false;
      let binarySize = 0;
      const binPath = path.join(driverPath, '.pio', 'build', buildEnv, 'firmware.bin');
      try {
        const stat = await fs.promises.stat(binPath);
        hasBinary = true;
        binarySize = stat.size;
      } catch (err) {
        this.logger.debug('firmware-builder.scan.no_binary', {
          driver: entry.name, bin_path: binPath, error: err.message
        });
      }

      let sourceFiles = [];
      try {
        const srcDir = path.join(driverPath, 'src');
        const srcEntries = await fs.promises.readdir(srcDir);
        sourceFiles = srcEntries.filter(f => f.endsWith('.cpp') || f.endsWith('.h') || f.endsWith('.c'));
      } catch (err) {
        this.logger.debug('firmware-builder.scan.no_src_dir', {
          driver: entry.name, error: err.message
        });
      }

      const prev = prevState.get(entry.name);

      this.drivers.set(entry.name, {
        name: entry.name,
        description: driverMeta.description || description,
        utility: driverMeta.utility || '',
        board: driverMeta.board || board,
        capabilities: driverMeta.capabilities || [],
        path: driverPath,
        buildEnv,
        has_binary: hasBinary,
        binary_size: binarySize,
        source_files: sourceFiles,
        last_build: prev?.last_build || null,
        last_build_status: prev?.last_build_status || null
      });

      this.logger.info('firmware-builder.driver.detected', {
        driver: entry.name, board, build_env: buildEnv, source_files: sourceFiles.length
      });
    }
  }

  // ==========================================
  // 5 Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'    ? 400 :
                   code === 'RESOURCE_NOT_FOUND'   ? 404 :
                   code === 'CONFLICT_STATE'       ? 409 :
                   code === 'QUOTA_EXCEEDED'       ? 429 :
                   code === 'AUTHENTICATION_REQUIRED' ? 401 :
                                                     500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('firmware-builder.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    if (err.code === 'ENOENT') return 'RESOURCE_NOT_FOUND';
    if (err.code === 'EACCES' || err.code === 'EPERM') return 'AUTHENTICATION_REQUIRED';
    if (err.code === 'EEXIST') return 'CONFLICT_STATE';
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrado')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('requerido')) return 'INVALID_INPUT';
    if (msg.includes('already') || msg.includes('ya está') || msg.includes('ya esta')) return 'CONFLICT_STATE';
    if (msg.includes('quota') || msg.includes('máximo') || msg.includes('maximo')) return 'QUOTA_EXCEEDED';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = { timestamp: new Date().toISOString(), ...payload };
    if (sourcePayload?.correlation_id) enriched.correlation_id = sourcePayload.correlation_id;
    else if (!enriched.correlation_id) enriched.correlation_id = crypto.randomUUID();
    await this.eventBus.publish(name, enriched);
  }

  // Auxiliar de dominio: parsea board y env name del platformio.ini (regex
  // simple, evita dependencia de librería ini). Extraído como método para
  // ser testeable de forma aislada.
  _parseBoardFromIni(iniText) {
    if (!iniText || typeof iniText !== 'string') return { board: null, envName: null };
    const boardMatch = iniText.match(/board\s*=\s*(\S+)/);
    const envMatch = iniText.match(/\[env:(\S+)\]/);
    return {
      board: boardMatch ? boardMatch[1] : null,
      envName: envMatch ? envMatch[1] : null
    };
  }
}

module.exports = FirmwareBuilderModule;
