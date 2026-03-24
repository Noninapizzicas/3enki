/**
 * esp32-flasher — Flash de firmware a ESP32 y monitor serial
 *
 * Métodos de flash:
 * - esptool: Flash directo via esptool.py (más control, soporta erase/verify)
 * - platformio: Flash via `pio run -t upload` (auto-detecta config del proyecto)
 *
 * Monitor serial: lectura en tiempo real con publicación de líneas via eventBus
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

class ESP32FlasherModule {
  constructor() {
    this.name = 'esp32-flasher';
    this.version = '1.0.0';

    // Dependencias inyectadas en onLoad
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      esptool_path: 'esptool',
      platformio_path: 'platformio',
      default_baud: 115200,
      flash_baud: 460800,
      monitor_baud: 115200,
      flash_timeout_ms: 120000,
      serial_patterns: ['/dev/ttyUSB*', '/dev/ttyACM*'],
      max_monitor_buffer: 5000,
      max_history: 200
    };

    // Flash activos: flash_id → { process, port, method, started_at, log, progress }
    this.activeFlashes = new Map();

    // Monitores serial activos: port → { process, baud, buffer, started_at }
    this.activeMonitors = new Map();

    // Historial de flashes
    this.flashHistory = [];

    // Último build completado (para auto-suggest)
    this.lastBuild = null;
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    if (core.config?.['esp32-flasher']) {
      this.config = { ...this.config, ...core.config['esp32-flasher'] };
    }

    // Métricas iniciales
    this.metrics.gauge('flash.active.count', 0);
    this.metrics.gauge('flash.monitors.count', 0);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      esptool_path: this.config.esptool_path,
      flash_baud: this.config.flash_baud
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Matar flashes activos
    for (const [id, flash] of this.activeFlashes) {
      if (flash.process && !flash.process.killed) {
        flash.process.kill('SIGTERM');
        this.logger.warn('flash.killed_on_unload', { flash_id: id });
      }
    }
    this.activeFlashes.clear();

    // Cerrar monitores
    for (const [port, monitor] of this.activeMonitors) {
      if (monitor.process && !monitor.process.killed) {
        monitor.process.kill('SIGTERM');
      }
    }
    this.activeMonitors.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ─── Event Handlers ──────────────────────────────────────

  /**
   * Cuando firmware-builder completa un build, guardamos referencia para auto-suggest.
   */
  async onBuildCompleted(event) {
    const data = event?.data || event?.payload || event;
    if (!data?.binary_path) return;

    this.lastBuild = {
      driver: data.driver || data.project_name,
      board: data.board,
      binary_path: data.binary_path,
      binary_size: data.binary_size,
      timestamp: new Date().toISOString()
    };

    this.logger.info('flash.build_available', {
      driver: data.driver || data.project_name,
      binary_path: data.binary_path
    });
  }

  // ─── UI Handlers ──────────────────────────────────────────

  /**
   * Detecta puertos serial disponibles.
   */
  async handleListPorts() {
    const ports = await this._scanPorts();

    this.metrics.gauge('flash.ports_detected.count', ports.length);

    // Incluir info de último build si hay
    return {
      status: 200,
      data: {
        ports,
        total: ports.length,
        last_build: this.lastBuild,
        active_flash: this.activeFlashes.size > 0 ?
          Array.from(this.activeFlashes.keys()) : null,
        active_monitors: this.activeMonitors.size > 0 ?
          Array.from(this.activeMonitors.keys()) : null
      }
    };
  }

  /**
   * Inicia flash de firmware a un ESP32.
   */
  async handleStart(data) {
    const { port, binary_path, method, baud, flash_mode, flash_freq, erase_before, project_dir } = data;

    if (!port) return { status: 400, error: 'port requerido (ej: /dev/ttyUSB0)' };
    if (!binary_path) return { status: 400, error: 'binary_path requerido (ruta al .bin)' };

    // Verificar que el binario existe
    try {
      await fs.promises.access(binary_path, fs.constants.R_OK);
    } catch {
      return { status: 400, error: `Binario no encontrado: ${binary_path}` };
    }

    // Verificar que el puerto no está en uso por otro flash
    for (const [id, flash] of this.activeFlashes) {
      if (flash.port === port) {
        return { status: 409, error: `Puerto ${port} ya en uso por flash ${id}` };
      }
    }

    // Si hay monitor en ese puerto, cerrarlo primero
    if (this.activeMonitors.has(port)) {
      await this._stopMonitor(port);
      this.logger.info('flash.monitor_stopped_for_flash', { port });
    }

    const flashMethod = method || 'esptool';

    // Verificar que la herramienta de flash existe antes de intentar
    const toolCheck = await this._checkFlashTool(flashMethod);
    if (!toolCheck.available) {
      return { status: 400, error: toolCheck.error };
    }

    // Verificar que el puerto serial existe
    try {
      await fs.promises.access(port, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      return { status: 400, error: `Puerto serial no accesible: ${port}. ¿Está conectado el dispositivo? ¿Permisos?` };
    }

    const flashBaud = baud || this.config.flash_baud;
    const flashId = this._generateId();

    const flashInfo = {
      flash_id: flashId,
      port,
      method: flashMethod,
      binary_path,
      baud: flashBaud,
      started_at: new Date().toISOString(),
      log: [],
      progress: { stage: 'starting', percent: 0 },
      process: null
    };

    this.activeFlashes.set(flashId, flashInfo);

    this.metrics.increment('flash.started.total');
    this.metrics.gauge('flash.active.count', this.activeFlashes.size);

    this.logger.info('flash.starting', {
      flash_id: flashId,
      port,
      method: flashMethod,
      binary: binary_path,
      baud: flashBaud
    });

    await this.eventBus.publish('flash.started', {
      flash_id: flashId,
      port,
      method: flashMethod,
      binary_path,
      baud: flashBaud,
      timestamp: flashInfo.started_at
    });

    // Lanzar flash async
    if (flashMethod === 'esptool') {
      this._runEsptoolFlash(flashId, {
        port, binary_path, baud: flashBaud,
        flash_mode: flash_mode || 'dio',
        flash_freq: flash_freq || '80m',
        erase_before: !!erase_before
      });
    } else if (flashMethod === 'platformio') {
      const pioDir = project_dir || this._findPlatformioRoot(binary_path);
      if (!pioDir) {
        this.activeFlashes.delete(flashId);
        return { status: 400, error: `No se encontró platformio.ini subiendo desde ${binary_path}. Verifica la ruta o usa el método esptool.` };
      }
      this._runPlatformioFlash(flashId, {
        port,
        project_dir: pioDir
      });
    } else {
      this.activeFlashes.delete(flashId);
      return { status: 400, error: `Método '${flashMethod}' no soportado. Usa: esptool, platformio` };
    }

    return {
      status: 202,
      data: {
        flash_id: flashId,
        port,
        method: flashMethod,
        baud: flashBaud,
        status: 'flashing',
        message: 'Flash iniciado. Usa flash.status para ver progreso.'
      }
    };
  }

  /**
   * Estado de flash activo o último flash.
   */
  async handleStatus(data) {
    const flashId = data?.flash_id;

    if (flashId) {
      const flash = this.activeFlashes.get(flashId);
      if (flash) {
        return {
          status: 200,
          data: {
            flash_id: flashId,
            port: flash.port,
            method: flash.method,
            status: 'flashing',
            started_at: flash.started_at,
            elapsed_ms: Date.now() - new Date(flash.started_at).getTime(),
            progress: flash.progress,
            log_lines: flash.log.length,
            log_tail: flash.log.slice(-20)
          }
        };
      }

      // Buscar en historial
      const hist = this.flashHistory.find(h => h.flash_id === flashId);
      if (hist) {
        return { status: 200, data: hist };
      }

      return { status: 404, error: `Flash '${flashId}' no encontrado` };
    }

    // Sin filtro: todos los flashes activos
    const active = [];
    for (const [id, flash] of this.activeFlashes) {
      active.push({
        flash_id: id,
        port: flash.port,
        method: flash.method,
        status: 'flashing',
        started_at: flash.started_at,
        progress: flash.progress,
        elapsed_ms: Date.now() - new Date(flash.started_at).getTime()
      });
    }

    return {
      status: 200,
      data: { active, count: active.length }
    };
  }

  /**
   * Cancela un flash en curso.
   */
  async handleCancel(data) {
    const { flash_id } = data;
    if (!flash_id) return { status: 400, error: 'flash_id requerido' };

    const flash = this.activeFlashes.get(flash_id);
    if (!flash) return { status: 404, error: `Flash '${flash_id}' no encontrado o ya terminó` };

    if (flash.process && !flash.process.killed) {
      flash.process.kill('SIGTERM');
    }

    const duration = Date.now() - new Date(flash.started_at).getTime();
    this.activeFlashes.delete(flash_id);

    this.metrics.increment('flash.cancelled.total');
    this.metrics.gauge('flash.active.count', this.activeFlashes.size);

    this._addHistory({
      flash_id,
      port: flash.port,
      method: flash.method,
      binary_path: flash.binary_path,
      status: 'cancelled',
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    this.logger.info('flash.cancelled', { flash_id, port: flash.port, duration_ms: duration });

    return {
      status: 200,
      data: { flash_id, status: 'cancelled', duration_ms: duration }
    };
  }

  /**
   * Inicia monitor serial en un puerto.
   */
  async handleMonitorStart(data) {
    const { port, baud } = data;
    if (!port) return { status: 400, error: 'port requerido' };

    if (this.activeMonitors.has(port)) {
      return { status: 409, error: `Monitor ya activo en ${port}` };
    }

    // Verificar que no hay flash activo en ese puerto
    for (const [, flash] of this.activeFlashes) {
      if (flash.port === port) {
        return { status: 409, error: `Puerto ${port} en uso por flash activo` };
      }
    }

    const monitorBaud = baud || this.config.monitor_baud;

    try {
      await this._startMonitor(port, monitorBaud);
    } catch (err) {
      return { status: 500, error: `Error iniciando monitor: ${err.message}` };
    }

    this.metrics.increment('flash.monitor_started.total');
    this.metrics.gauge('flash.monitors.count', this.activeMonitors.size);

    this.logger.info('flash.monitor.started', { port, baud: monitorBaud });

    return {
      status: 200,
      data: {
        port,
        baud: monitorBaud,
        status: 'monitoring',
        message: 'Monitor serial iniciado. Salida publicada via flash.serial_output'
      }
    };
  }

  /**
   * Detiene monitor serial.
   */
  async handleMonitorStop(data) {
    const { port } = data;
    if (!port) return { status: 400, error: 'port requerido' };

    if (!this.activeMonitors.has(port)) {
      return { status: 404, error: `No hay monitor activo en ${port}` };
    }

    await this._stopMonitor(port);

    this.metrics.gauge('flash.monitors.count', this.activeMonitors.size);
    this.logger.info('flash.monitor.stopped', { port });

    return {
      status: 200,
      data: { port, status: 'stopped' }
    };
  }

  /**
   * Envía datos al serial (para interactuar con el firmware en ejecución).
   */
  async handleMonitorSend(data) {
    const { port, data: text } = data;
    if (!port) return { status: 400, error: 'port requerido' };
    if (!text) return { status: 400, error: 'data requerido' };

    const monitor = this.activeMonitors.get(port);
    if (!monitor) return { status: 404, error: `No hay monitor activo en ${port}` };

    try {
      monitor.process.stdin.write(text + '\n');
      return { status: 200, data: { port, sent: text } };
    } catch (err) {
      return { status: 500, error: `Error enviando datos: ${err.message}` };
    }
  }

  /**
   * Historial de flashes.
   */
  async handleHistory(data) {
    const limit = parseInt(data?.limit) || 50;
    const portFilter = data?.port;

    let history = this.flashHistory;
    if (portFilter) {
      history = history.filter(h => h.port === portFilter);
    }

    return {
      status: 200,
      data: {
        history: history.slice(0, limit),
        total: history.length
      }
    };
  }

  // ─── Pre-flash validation ────────────────────────────────

  /**
   * Sube desde binary_path hasta encontrar platformio.ini.
   * Retorna el directorio raíz del proyecto PlatformIO o null.
   */
  _findPlatformioRoot(binaryPath) {
    let dir = path.dirname(path.resolve(binaryPath));
    const root = path.parse(dir).root;
    while (dir !== root) {
      if (fs.existsSync(path.join(dir, 'platformio.ini'))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    return null;
  }

  async _checkFlashTool(method) {
    const { execFileSync } = require('child_process');
    const toolPath = method === 'platformio'
      ? this.config.platformio_path
      : this.config.esptool_path;

    try {
      execFileSync('which', [toolPath], { timeout: 3000, stdio: 'pipe' });
      return { available: true };
    } catch {
      const installHint = method === 'platformio'
        ? 'Instala PlatformIO: pip install platformio'
        : 'Instala esptool: pip install esptool';
      return {
        available: false,
        error: `'${toolPath}' no encontrado en PATH. ${installHint}`
      };
    }
  }

  // ─── Flash: esptool ───────────────────────────────────────

  _runEsptoolFlash(flashId, opts) {
    const { port, binary_path, baud, flash_mode, flash_freq, erase_before } = opts;
    const flash = this.activeFlashes.get(flashId);
    if (!flash) return;

    const startTime = Date.now();

    // Construir args de esptool
    const args = [
      '--chip', 'auto',
      '--port', port,
      '--baud', String(baud)
    ];

    if (erase_before) {
      // Primero erasear, luego flashear — usamos write_flash directo con erase
      args.push('--before', 'default_reset', '--after', 'hard_reset');
    }

    args.push('write_flash');
    args.push('--flash_mode', flash_mode);
    args.push('--flash_freq', flash_freq);
    args.push('0x10000', binary_path);

    const proc = spawn(this.config.esptool_path, args, {
      timeout: this.config.flash_timeout_ms,
      env: { ...process.env }
    });

    flash.process = proc;

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      flash.log.push(...lines);
      this._parseEsptoolProgress(flashId, lines);
    });

    proc.stderr.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      flash.log.push(...lines);
      this._parseEsptoolProgress(flashId, lines);
    });

    proc.on('close', async (code) => {
      await this._onFlashComplete(flashId, code, startTime);
    });

    proc.on('error', async (err) => {
      await this._onFlashError(flashId, err, startTime);
    });
  }

  /**
   * Parsea salida de esptool para extraer progreso.
   */
  _parseEsptoolProgress(flashId, lines) {
    const flash = this.activeFlashes.get(flashId);
    if (!flash) return;

    for (const line of lines) {
      // Detectar etapas
      if (line.includes('Connecting')) {
        flash.progress = { stage: 'connecting', percent: 5 };
      } else if (line.includes('Chip is')) {
        flash.progress = { stage: 'connected', percent: 10, message: line.trim() };
      } else if (line.includes('Erasing flash')) {
        flash.progress = { stage: 'erasing', percent: 20 };
      } else if (line.includes('Writing at')) {
        // "Writing at 0x00010000... (1 %)" o similar
        const match = line.match(/\((\d+)\s*%\)/);
        if (match) {
          const pct = parseInt(match[1]);
          // Mapear 0-100% de escritura a 25-90% del total
          flash.progress = { stage: 'writing', percent: 25 + Math.round(pct * 0.65) };
        }
      } else if (line.includes('Hash of data verified')) {
        flash.progress = { stage: 'verifying', percent: 95 };
      } else if (line.includes('Hard resetting')) {
        flash.progress = { stage: 'resetting', percent: 98 };
      }

      // Publicar progreso
      this.eventBus.publish('flash.progress', {
        flash_id: flashId,
        stage: flash.progress.stage,
        percent: flash.progress.percent,
        message: line.trim()
      }).catch(() => {});
    }
  }

  // ─── Flash: platformio ────────────────────────────────────

  _runPlatformioFlash(flashId, opts) {
    const { port, project_dir } = opts;
    const flash = this.activeFlashes.get(flashId);
    if (!flash) return;

    const startTime = Date.now();

    const args = ['run', '-t', 'upload', '--upload-port', port];
    if (project_dir) args.push('-d', project_dir);

    const proc = spawn(this.config.platformio_path, args, {
      cwd: project_dir || undefined,
      timeout: this.config.flash_timeout_ms,
      env: { ...process.env, PLATFORMIO_FORCE_COLOR: 'false' }
    });

    flash.process = proc;

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      flash.log.push(...lines);

      for (const line of lines) {
        // PlatformIO usa esptool internamente
        this._parseEsptoolProgress(flashId, [line]);

        if (line.includes('Compiling') || line.includes('Building')) {
          flash.progress = { stage: 'building', percent: 10 };
        } else if (line.includes('Uploading')) {
          flash.progress = { stage: 'uploading', percent: 30 };
        } else if (line.includes('SUCCESS')) {
          flash.progress = { stage: 'done', percent: 100 };
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      flash.log.push(...lines);
    });

    proc.on('close', async (code) => {
      await this._onFlashComplete(flashId, code, startTime);
    });

    proc.on('error', async (err) => {
      await this._onFlashError(flashId, err, startTime);
    });
  }

  // ─── Flash completion ─────────────────────────────────────

  async _onFlashComplete(flashId, exitCode, startTime) {
    const flash = this.activeFlashes.get(flashId);
    if (!flash) return;

    const duration = Date.now() - startTime;
    this.activeFlashes.delete(flashId);
    this.metrics.gauge('flash.active.count', this.activeFlashes.size);

    let binarySize = 0;
    try {
      const stat = await fs.promises.stat(flash.binary_path);
      binarySize = stat.size;
    } catch (_) {}

    if (exitCode === 0) {
      this.metrics.increment('flash.completed.total');
      this.metrics.timing('flash.duration', duration);

      const entry = {
        flash_id: flashId,
        port: flash.port,
        method: flash.method,
        binary_path: flash.binary_path,
        binary_size: binarySize,
        status: 'completed',
        duration_ms: duration,
        timestamp: new Date().toISOString()
      };

      this._addHistory(entry);

      this.logger.info('flash.completed', {
        flash_id: flashId, port: flash.port, duration_ms: duration, binary_size: binarySize
      });

      await this.eventBus.publish('flash.completed', {
        flash_id: flashId,
        port: flash.port,
        method: flash.method,
        binary_path: flash.binary_path,
        binary_size: binarySize,
        duration_ms: duration
      });
    } else {
      this.metrics.increment('flash.failed.total');
      this.metrics.timing('flash.duration', duration);

      const errorOutput = flash.log.slice(-20).join('\n');

      const entry = {
        flash_id: flashId,
        port: flash.port,
        method: flash.method,
        binary_path: flash.binary_path,
        status: 'failed',
        error: errorOutput,
        exit_code: exitCode,
        duration_ms: duration,
        timestamp: new Date().toISOString()
      };

      this._addHistory(entry);

      this.logger.error('flash.failed', {
        flash_id: flashId, port: flash.port, exit_code: exitCode, duration_ms: duration
      });

      await this.eventBus.publish('flash.failed', {
        flash_id: flashId,
        port: flash.port,
        method: flash.method,
        error: errorOutput,
        exit_code: exitCode,
        duration_ms: duration
      });
    }
  }

  async _onFlashError(flashId, err, startTime) {
    const flash = this.activeFlashes.get(flashId);
    if (!flash) return;

    const duration = Date.now() - startTime;
    this.activeFlashes.delete(flashId);

    this.metrics.increment('flash.failed.total');
    this.metrics.gauge('flash.active.count', this.activeFlashes.size);

    const errorMsg = `No se pudo ejecutar: ${err.message}`;

    this._addHistory({
      flash_id: flashId,
      port: flash.port,
      method: flash.method,
      binary_path: flash.binary_path,
      status: 'failed',
      error: errorMsg,
      exit_code: -1,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    this.logger.error('flash.spawn_error', {
      flash_id: flashId, error: err.message
    });

    await this.eventBus.publish('flash.failed', {
      flash_id: flashId,
      port: flash.port,
      method: flash.method,
      error: errorMsg,
      exit_code: -1,
      duration_ms: duration
    });
  }

  // ─── Serial Monitor ──────────────────────────────────────

  async _startMonitor(port, baud) {
    // Usar stty + cat para leer serial sin dependencias externas,
    // o python -m serial.tools.miniterm si está disponible.
    // Fallback: usar un script simple con Node serialport o cat directo.

    const proc = spawn('stty', ['-F', port, String(baud), 'raw', '-echo'], {
      timeout: 5000
    });

    await new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`stty failed on ${port} (code ${code}). ¿Puerto existe?`));
      });
      proc.on('error', reject);
    });

    // Leer del puerto serial
    const catProc = spawn('cat', [port], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const buffer = [];
    const monitor = {
      process: catProc,
      baud,
      buffer,
      started_at: new Date().toISOString()
    };

    catProc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '');
        if (!trimmed) continue;

        buffer.push(trimmed);
        if (buffer.length > this.config.max_monitor_buffer) {
          buffer.shift();
        }

        this.eventBus.publish('flash.serial_output', {
          port,
          line: trimmed,
          timestamp: new Date().toISOString()
        }).catch(() => {});
      }
    });

    catProc.on('close', () => {
      this.activeMonitors.delete(port);
      this.metrics.gauge('flash.monitors.count', this.activeMonitors.size);
      this.logger.info('flash.monitor.closed', { port });
    });

    catProc.on('error', (err) => {
      this.activeMonitors.delete(port);
      this.metrics.gauge('flash.monitors.count', this.activeMonitors.size);
      this.logger.error('flash.monitor.error', { port, error: err.message });
    });

    this.activeMonitors.set(port, monitor);
  }

  async _stopMonitor(port) {
    const monitor = this.activeMonitors.get(port);
    if (!monitor) return;

    if (monitor.process && !monitor.process.killed) {
      monitor.process.kill('SIGTERM');
    }

    this.activeMonitors.delete(port);
  }

  // ─── Port scanning ───────────────────────────────────────

  async _scanPorts() {
    const ports = [];

    for (const pattern of this.config.serial_patterns) {
      // Expandir glob manualmente: /dev/ttyUSB* → buscar en /dev/
      const dir = path.dirname(pattern);
      const prefix = path.basename(pattern).replace('*', '');

      try {
        const entries = await fs.promises.readdir(dir);
        for (const entry of entries) {
          if (entry.startsWith(prefix)) {
            const portPath = path.join(dir, entry);

            // Intentar obtener info del puerto
            let info = { path: portPath, name: entry };
            try {
              const stat = await fs.promises.stat(portPath);
              info.type = stat.isCharacterDevice() ? 'serial' : 'other';
            } catch (_) {
              info.type = 'unknown';
            }

            // Verificar si está en uso
            info.in_use_by = null;
            for (const [id, flash] of this.activeFlashes) {
              if (flash.port === portPath) info.in_use_by = `flash:${id}`;
            }
            if (this.activeMonitors.has(portPath)) {
              info.in_use_by = 'monitor';
            }

            ports.push(info);
          }
        }
      } catch (_) {
        // Directorio no existe o no es legible
      }
    }

    return ports;
  }

  // ─── Helpers ──────────────────────────────────────────────

  _generateId() {
    return crypto.randomBytes(6).toString('hex');
  }

  _addHistory(entry) {
    this.flashHistory.unshift(entry);
    if (this.flashHistory.length > this.config.max_history) {
      this.flashHistory.length = this.config.max_history;
    }
  }
}

module.exports = ESP32FlasherModule;
