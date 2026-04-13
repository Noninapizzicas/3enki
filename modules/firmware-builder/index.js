/**
 * firmware-builder — Compilación de firmware ESP32 (BASE + LÓGICA)
 *
 * Reemplaza al antiguo esp32-dev. En vez de templates y scaffolding,
 * detecta drivers en firmware/drivers/ y compila directamente via PlatformIO.
 *
 * Cada subdirectorio de firmware/drivers/ que tenga platformio.ini es un driver.
 * Ejemplo: firmware/drivers/print-proxy/ → driver "print-proxy"
 *
 * Simplificación radical:
 *   Antes:  elegir template → crear proyecto → configurar variables → compilar
 *   Ahora:  elegir driver → compilar
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Boards soportados
const BOARDS = {
  esp32dev: { name: 'ESP32 DevKit', platform: 'espressif32', mcu: 'esp32', flash: '4MB', psram: false },
  'esp32-s2': { name: 'ESP32-S2', platform: 'espressif32', mcu: 'esp32s2', flash: '4MB', psram: false },
  'esp32-s3': { name: 'ESP32-S3', platform: 'espressif32', mcu: 'esp32s3', flash: '8MB', psram: true },
  'esp32-c3': { name: 'ESP32-C3', platform: 'espressif32', mcu: 'esp32c3', flash: '4MB', psram: false },
  'esp32-c6': { name: 'ESP32-C6', platform: 'espressif32', mcu: 'esp32c6', flash: '4MB', psram: false }
};

class FirmwareBuilderModule {
  constructor() {
    this.name = 'firmware-builder';
    this.version = '1.1.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    this.config = {
      firmware_path: './firmware/drivers',
      platformio_path: 'platformio',
      build_timeout_ms: 5 * 60 * 1000,
      max_concurrent_builds: 2
    };

    // Drivers detectados: driver_name → { name, path, board, description, has_binary, last_build }
    this.drivers = new Map();

    // Builds activos: driver_name → { process, started_at, log }
    this.activeBuilds = new Map();
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    if (core.config?.['firmware-builder']) {
      this.config = { ...this.config, ...core.config['firmware-builder'] };
    }

    this.config.firmware_path = path.resolve(this.config.firmware_path);

    // Detectar drivers
    await this._scanDrivers();

    this.metrics.gauge('firmware.drivers.count', this.drivers.size);
    this.metrics.gauge('firmware.active_builds.count', 0);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      drivers: this.drivers.size,
      firmware_path: this.config.firmware_path
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    for (const [name, build] of this.activeBuilds) {
      if (build.process && !build.process.killed) {
        build.process.kill('SIGTERM');
        this.logger.warn('firmware.build.killed_on_unload', { driver: name });
      }
    }
    this.activeBuilds.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ─── UI Handlers ──────────────────────────────────────────

  /**
   * Lista drivers disponibles (subdirectorios de firmware/drivers/ con platformio.ini).
   */
  async handleListDrivers() {
    // Re-escanear para detectar cambios
    await this._scanDrivers();

    const list = [];
    for (const [id, driver] of this.drivers) {
      list.push({
        id,
        name: driver.name,
        description: driver.description,
        utility: driver.utility || '',
        board: driver.board,
        capabilities: driver.capabilities || [],
        path: driver.path,
        has_binary: driver.has_binary,
        binary_size: driver.binary_size || null,
        last_build: driver.last_build,
        is_building: this.activeBuilds.has(id),
        source_files: driver.source_files || []
      });
    }

    return {
      status: 200,
      data: { drivers: list, total: list.length }
    };
  }

  /**
   * Compila un driver via PlatformIO.
   */
  async handleBuild(data) {
    const { driver, board, clean } = data;
    if (!driver) return { status: 400, error: 'driver requerido' };

    const driverInfo = this.drivers.get(driver);
    if (!driverInfo) return { status: 404, error: `Driver '${driver}' no encontrado` };

    if (this.activeBuilds.has(driver)) {
      return { status: 409, error: `Driver '${driver}' ya está compilando` };
    }

    if (this.activeBuilds.size >= this.config.max_concurrent_builds) {
      return { status: 429, error: `Máximo de builds concurrentes alcanzado (${this.config.max_concurrent_builds})` };
    }

    const startTime = Date.now();
    const buildEnv = driverInfo.buildEnv || board || driverInfo.board;

    // Si clean, primero limpiar y luego compilar (clean solo no compila)
    if (clean) {
      await this._runClean(driverInfo.path, buildEnv);
    }

    const args = ['run', '-d', driverInfo.path];
    if (board) args.push('-e', board);

    this.logger.info('firmware.build.starting', { driver, board: board || driverInfo.board, clean: !!clean });
    this.metrics.increment('firmware.build_started.total');
    this.metrics.gauge('firmware.active_builds.count', this.activeBuilds.size + 1);

    await this.eventBus.publish('firmware.build_started', {
      driver, board: board || driverInfo.board, timestamp: new Date().toISOString()
    });

    // Build asíncrono
    const buildPromise = this._runBuild(driver, driverInfo.path, args, startTime, board || driverInfo.board);
    buildPromise.catch(err => {
      this.logger.error('firmware.build.unhandled_error', { driver, error: err.message });
    });

    return {
      status: 202,
      data: {
        driver,
        board: board || driverInfo.board,
        status: 'building',
        message: 'Compilación iniciada. Usa builder.build-status para ver progreso.'
      }
    };
  }

  /**
   * Estado del build en curso o último build.
   */
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
      if (!driver) return { status: 404, error: `Driver '${driverName}' no encontrado` };

      return {
        status: 200,
        data: {
          driver: driverName,
          status: driver.last_build_status || 'never',
          last_build: driver.last_build
        }
      };
    }

    // Sin filtro: todos los builds activos
    const active = [];
    for (const [name, build] of this.activeBuilds) {
      active.push({
        driver: name,
        status: 'building',
        started_at: build.started_at,
        elapsed_ms: Date.now() - new Date(build.started_at).getTime()
      });
    }

    return {
      status: 200,
      data: { active_builds: active, count: active.length }
    };
  }

  /**
   * Lista boards soportados.
   */
  async handleListBoards() {
    const boards = Object.entries(BOARDS).map(([id, info]) => ({ id, ...info }));
    return { status: 200, data: { boards, total: boards.length } };
  }

  // ─── Build execution ─────────────────────────────────────

  async _runBuild(driverName, driverPath, args, startTime, board) {
    const driverInfo = this.drivers.get(driverName);
    const buildEnv = driverInfo?.buildEnv || board;

    return new Promise((resolve) => {
      const buildLog = [];
      let resolved = false; // Evitar doble resolución por error+close
      const buildInfo = {
        started_at: new Date(startTime).toISOString(),
        log: buildLog,
        process: null
      };

      this.activeBuilds.set(driverName, buildInfo);

      const proc = spawn(this.config.platformio_path, args, {
        cwd: driverPath,
        env: { ...process.env, PLATFORMIO_FORCE_COLOR: 'false' },
        timeout: this.config.build_timeout_ms
      });

      buildInfo.process = proc;

      proc.stdout.on('data', (chunk) => {
        buildLog.push(...chunk.toString().split('\n').filter(l => l.trim()));
      });

      proc.stderr.on('data', (chunk) => {
        buildLog.push(...chunk.toString().split('\n').filter(l => l.trim()));
      });

      proc.on('close', async (code) => {
        if (resolved) return;
        resolved = true;

        const duration = Date.now() - startTime;
        this.activeBuilds.delete(driverName);
        this.metrics.gauge('firmware.active_builds.count', this.activeBuilds.size);

        const driver = this.drivers.get(driverName);

        if (code === 0) {
          const binPath = path.join(driverPath, '.pio', 'build', buildEnv, 'firmware.bin');
          let binarySize = 0;
          try {
            const stat = await fs.promises.stat(binPath);
            binarySize = stat.size;
          } catch (_) {}

          if (driver) {
            driver.last_build = new Date().toISOString();
            driver.last_build_status = 'success';
            driver.has_binary = binarySize > 0;
            driver.binary_size = binarySize;
          }

          this.metrics.increment('firmware.build_completed.total');
          this.metrics.timing('firmware.build.duration', duration);

          this.logger.info('firmware.build.completed', {
            driver: driverName, duration_ms: duration, binary_size: binarySize
          });

          await this.eventBus.publish('firmware.build_completed', {
            driver: driverName,
            board,
            binary_path: binPath,
            binary_size: binarySize,
            duration_ms: duration,
            // Pass metadata for firmware-manager auto-registration
            utility: driverInfo?.utility || '',
            description: driverInfo?.description || '',
            capabilities: driverInfo?.capabilities || []
          });

          resolve({ success: true, binary_path: binPath, binary_size: binarySize, duration_ms: duration });
        } else {
          const errorOutput = buildLog.slice(-30).join('\n');

          if (driver) {
            driver.last_build = new Date().toISOString();
            driver.last_build_status = 'failed';
          }

          this.metrics.increment('firmware.build_failed.total');
          this.metrics.timing('firmware.build.duration', duration);

          this.logger.error('firmware.build.failed', {
            driver: driverName, exit_code: code, duration_ms: duration
          });

          await this.eventBus.publish('firmware.build_failed', {
            driver: driverName,
            board,
            error: errorOutput,
            exit_code: code,
            duration_ms: duration
          });

          resolve({ success: false, error: errorOutput, exit_code: code, duration_ms: duration });
        }
      });

      proc.on('error', async (err) => {
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

        this.logger.error('firmware.build.spawn_error', { driver: driverName, error: err.message });

        await this.eventBus.publish('firmware.build_failed', {
          driver: driverName,
          board,
          error: `No se pudo ejecutar '${this.config.platformio_path}': ${err.message}`,
          exit_code: -1,
          duration_ms: duration
        });

        resolve({ success: false, error: err.message, duration_ms: duration });
      });
    });
  }

  /**
   * Ejecuta pio run -t clean de forma síncrona (espera a que termine).
   */
  _runClean(driverPath, buildEnv) {
    return new Promise((resolve) => {
      const args = ['run', '-t', 'clean', '-d', driverPath];
      if (buildEnv) args.push('-e', buildEnv);

      const proc = spawn(this.config.platformio_path, args, {
        cwd: driverPath,
        env: { ...process.env, PLATFORMIO_FORCE_COLOR: 'false' },
        timeout: 60000
      });

      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
  }

  // ─── Driver scanner ───────────────────────────────────────

  /**
   * Escanea firmware/drivers/ buscando subdirectorios con platformio.ini.
   * Cada uno es un driver compilable.
   */
  async _scanDrivers() {
    // Preservar estado de builds anteriores antes de re-escanear
    const prevState = new Map();
    for (const [id, drv] of this.drivers) {
      if (drv.last_build || drv.last_build_status) {
        prevState.set(id, { last_build: drv.last_build, last_build_status: drv.last_build_status });
      }
    }

    this.drivers.clear();

    try {
      const entries = await fs.promises.readdir(this.config.firmware_path, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const driverPath = path.join(this.config.firmware_path, entry.name);
        const pioIni = path.join(driverPath, 'platformio.ini');

        try {
          await fs.promises.access(pioIni);
        } catch {
          continue; // No es un driver compilable
        }

        // Leer board y env del platformio.ini
        let board = 'esp32dev';
        let envName = null;
        let description = '';
        try {
          const ini = await fs.promises.readFile(pioIni, 'utf-8');
          const boardMatch = ini.match(/board\s*=\s*(\S+)/);
          if (boardMatch) board = boardMatch[1];
          const envMatch = ini.match(/\[env:(\S+)\]/);
          if (envMatch) envName = envMatch[1];
        } catch (_) {}

        // Leer descripción del README si existe
        try {
          const readme = await fs.promises.readFile(path.join(driverPath, 'README.md'), 'utf-8');
          const firstLine = readme.split('\n').find(l => l.trim() && !l.startsWith('#'));
          if (firstLine) description = firstLine.trim().substring(0, 120);
        } catch (_) {}

        // Read driver metadata if exists
        let driverMeta = {};
        try {
          const metaRaw = await fs.promises.readFile(path.join(driverPath, 'driver.json'), 'utf-8');
          driverMeta = JSON.parse(metaRaw);
        } catch (_) {}

        // Resolver directorio de build (env name o board name)
        const buildEnv = envName || board;

        // Comprobar si hay binario compilado
        let hasBinary = false;
        let binarySize = 0;
        const binPath = path.join(driverPath, '.pio', 'build', buildEnv, 'firmware.bin');
        try {
          const stat = await fs.promises.stat(binPath);
          hasBinary = true;
          binarySize = stat.size;
        } catch (_) {}

        // Listar archivos fuente
        let sourceFiles = [];
        try {
          const srcDir = path.join(driverPath, 'src');
          const srcEntries = await fs.promises.readdir(srcDir);
          sourceFiles = srcEntries.filter(f => f.endsWith('.cpp') || f.endsWith('.h') || f.endsWith('.c'));
        } catch (_) {}

        // Restaurar estado previo de build si existe
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

        this.logger.info('firmware.driver.detected', { driver: entry.name, board, buildEnv, source_files: sourceFiles.length });
      }
    } catch (err) {
      this.logger.warn('firmware.scan.failed', { path: this.config.firmware_path, error: err.message });
    }
  }
}

module.exports = FirmwareBuilderModule;
