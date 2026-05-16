/**
 * esp32-flasher v2.0.0 — POC2 canonico.
 *
 * Flash de firmware a ESP32 y monitor serial.
 * Metodos: esptool (flash directo) + platformio (auto-detecta config del proyecto).
 *
 * Publishes canonicos: flash.started, flash.progress, flash.completed,
 * flash.failed, flash.serial_output (todos con correlation_id + project_id +
 * timestamp via _publicarEvento).
 *
 * Debug remoto: bridge MQTT enki/<project>/debug/<device> → flash.serial_output.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const VALID_FLASH_MODES = ['qio', 'qout', 'dio', 'dout'];
const VALID_FLASH_FREQS = ['20m', '26m', '40m', '80m'];
const VALID_PORT_REGEX = /^(\/dev\/tty(USB|ACM|S|AMA)\d+|COM\d+)$/;
const DEBUG_STREAM_TIMEOUT_MS = 30000;
const DEBUG_BUFFER_MAX_LINES = 500;
const DEFAULT_HISTORY_MAX = 200;

class ESP32FlasherModule extends BaseModule {
  constructor() {
    super();
    this.name = 'esp32-flasher';
    this.version = '2.0.0';
    this.config = {
      esptool_path: 'esptool',
      platformio_path: 'platformio',
      default_baud: 115200,
      flash_baud: 460800,
      monitor_baud: 115200,
      flash_timeout_ms: 120000,
      serial_patterns: ['/dev/ttyUSB*', '/dev/ttyACM*'],
      max_monitor_buffer: 5000,
      max_history: DEFAULT_HISTORY_MAX
    };

    this.activeFlashes = new Map();
    this.activeMonitors = new Map();
    this.flashHistory = [];
    this.lastBuild = null;
    this.debugBuffers = new Map();
    this._onDebugMessage = null;
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

    this.metrics?.gauge?.('esp32-flasher.active.count', 0);
    this.metrics?.gauge?.('esp32-flasher.monitors.count', 0);

    this._startDebugListener();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      esptool_path: this.config.esptool_path,
      flash_baud: this.config.flash_baud
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    for (const [id, flash] of this.activeFlashes) {
      if (flash.process && !flash.process.killed) {
        flash.process.kill('SIGTERM');
        this.logger.warn('flash.killed_on_unload', { flash_id: id });
      }
    }
    this.activeFlashes.clear();

    for (const [, monitor] of this.activeMonitors) {
      if (monitor.process && !monitor.process.killed) {
        monitor.process.kill('SIGTERM');
      }
    }
    this.activeMonitors.clear();

    if (this._onDebugMessage) {
      const mqtt = this.eventBus?.mqtt;
      if (mqtt) {
        try { mqtt.removeListener('message', this._onDebugMessage); } catch (_) {}
        try { await mqtt.unsubscribe('enki/+/debug/+'); } catch (_) {}
      }
      this._onDebugMessage = null;
    }

    for (const [, buf] of this.debugBuffers) {
      for (const waiter of buf.waiters) {
        try { waiter([]); } catch (_) {}
      }
      buf.waiters = [];
    }
    this.debugBuffers.clear();
    this.flashHistory = [];
    this.lastBuild = null;

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ─── Helpers POC2 ─────────────────────────────────────────

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'FILESYSTEM_ERROR' };
    if (/timeout/i.test(msg)) return { status: 504, code: 'TIMEOUT' };
    if (/required|invalid|missing/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado|not accessible/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/conflict|already|in use/i.test(msg)) return { status: 409, code: 'CONFLICT_STATE' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('esp32-flasher.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.warn?.('esp32-flasher.publish.failed', {
        event: name, error_message: err.message
      });
      this.metrics?.increment?.('esp32-flasher.errors', { code: 'PUBLISH_FAILED', kind: 'publish' });
    }
    return enriched;
  }

  // ─── Bus subscriber ──────────────────────────────────────

  async onBuildCompleted(event) {
    try {
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
    } catch (err) {
      this._handleHandlerError('esp32-flasher.build_completed.error', err, 'subscribe');
    }
  }

  // ─── UI Handlers ──────────────────────────────────────────

  async handleListPorts() {
    try {
      const ports = await this._scanPorts();
      this.metrics?.gauge?.('esp32-flasher.ports_detected.count', ports.length);
      return {
        status: 200,
        data: {
          ports,
          total: ports.length,
          last_build: this.lastBuild,
          active_flash: this.activeFlashes.size > 0 ? Array.from(this.activeFlashes.keys()) : null,
          active_monitors: this.activeMonitors.size > 0 ? Array.from(this.activeMonitors.keys()) : null
        }
      };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.list_ports.error', err);
    }
  }

  async handleStart(data) {
    try {
      const { port, binary_path, method, baud, flash_mode, flash_freq, erase_before, project_dir, project_id } = data || {};

      if (!port) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'start' });
        this.logger.warn('flash.start.missing', { field: 'port' });
        return this._errorResponse(400, 'INVALID_INPUT', 'port requerido (ej: /dev/ttyUSB0)', { field: 'port' });
      }
      if (!binary_path) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'start' });
        this.logger.warn('flash.start.missing', { field: 'binary_path' });
        return this._errorResponse(400, 'INVALID_INPUT', 'binary_path requerido (ruta al .bin)', { field: 'binary_path' });
      }

      try {
        await fs.promises.access(binary_path, fs.constants.R_OK);
      } catch {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'start' });
        this.logger.warn('flash.start.binary_not_found', { binary_path });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Binario no encontrado: ${binary_path}`,
          { binary_path });
      }

      for (const [id, flash] of this.activeFlashes) {
        if (flash.port === port) {
          this.metrics?.increment?.('esp32-flasher.errors', { code: 'CONFLICT_STATE', kind: 'start' });
          this.logger.warn('flash.start.port_in_use', { port, flash_id: id });
          return this._errorResponse(409, 'CONFLICT_STATE',
            `Puerto ${port} ya en uso por flash ${id}`,
            { port, flash_id: id });
        }
      }

      if (this.activeMonitors.has(port)) {
        await this._stopMonitor(port);
        this.logger.info('flash.monitor_stopped_for_flash', { port });
      }

      const flashMethod = method || 'esptool';

      const toolCheck = await this._checkFlashTool(flashMethod);
      if (!toolCheck.available) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'DEPENDENCY_UNAVAILABLE', kind: 'start' });
        this.logger.warn('flash.start.tool_unavailable', { method: flashMethod, error: toolCheck.error });
        return this._errorResponse(400, 'DEPENDENCY_UNAVAILABLE', toolCheck.error,
          { method: flashMethod });
      }

      if (!VALID_PORT_REGEX.test(port)) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'start' });
        this.logger.warn('flash.start.invalid_port', { port });
        return this._errorResponse(400, 'INVALID_INPUT',
          `Puerto '${port}' no parece un dispositivo serial valido. Esperado: /dev/ttyUSB0, /dev/ttyACM0, COM3, etc.`,
          { port });
      }

      try {
        await fs.promises.access(port, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'start' });
        this.logger.warn('flash.start.port_not_accessible', { port });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Puerto serial no accesible: ${port}. ¿Esta conectado el dispositivo? ¿Permisos?`,
          { port });
      }

      const flashBaud = baud || this.config.flash_baud;
      const flashId = this._generateId();

      const flashInfo = {
        flash_id: flashId,
        port,
        method: flashMethod,
        binary_path,
        baud: flashBaud,
        project_id: project_id || null,
        started_at: new Date().toISOString(),
        log: [],
        progress: { stage: 'starting', percent: 0 },
        process: null
      };

      if (flashMethod === 'platformio') {
        const pioDir = project_dir || this._findPlatformioRoot(binary_path);
        if (!pioDir) {
          this.metrics?.increment?.('esp32-flasher.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'start' });
          this.logger.warn('flash.start.no_platformio_ini', { binary_path });
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
            `No se encontro platformio.ini subiendo desde ${binary_path}. Verifica la ruta o usa el metodo esptool.`,
            { binary_path });
        }
        flashInfo._pioDir = pioDir;
      } else if (flashMethod !== 'esptool') {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'start' });
        this.logger.warn('flash.start.invalid_method', { method: flashMethod });
        return this._errorResponse(400, 'INVALID_INPUT',
          `Metodo '${flashMethod}' no soportado. Usa: esptool, platformio`,
          { method: flashMethod, valid_methods: ['esptool', 'platformio'] });
      }

      this.activeFlashes.set(flashId, flashInfo);
      this.metrics?.increment?.('esp32-flasher.started.total');
      this.metrics?.gauge?.('esp32-flasher.active.count', this.activeFlashes.size);

      this.logger.info('flash.starting', {
        flash_id: flashId, port, method: flashMethod,
        binary: binary_path, baud: flashBaud
      });

      const safeFlashMode = VALID_FLASH_MODES.includes(flash_mode) ? flash_mode : 'dio';
      const safeFlashFreq = VALID_FLASH_FREQS.includes(flash_freq) ? flash_freq : '80m';

      await this._publicarEvento('flash.started', {
        flash_id: flashId,
        port,
        method: flashMethod,
        binary_path,
        baud: flashBaud
      }, { project_id: flashInfo.project_id });

      if (flashMethod === 'esptool') {
        this._runEsptoolFlash(flashId, {
          port, binary_path, baud: flashBaud,
          flash_mode: safeFlashMode,
          flash_freq: safeFlashFreq,
          erase_before: !!erase_before
        });
      } else {
        this._runPlatformioFlash(flashId, { port, project_dir: flashInfo._pioDir });
      }

      return {
        status: 202,
        data: {
          flash_id: flashId, port, method: flashMethod, baud: flashBaud,
          status: 'flashing',
          message: 'Flash iniciado. Usa flash.status para ver progreso.'
        }
      };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.start.error', err);
    }
  }

  async handleStatus(data) {
    try {
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

        const hist = this.flashHistory.find(h => h.flash_id === flashId);
        if (hist) return { status: 200, data: hist };

        this.metrics?.increment?.('esp32-flasher.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'status' });
        this.logger.warn('flash.status.not_found', { flash_id: flashId });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Flash '${flashId}' no encontrado`, { flash_id: flashId });
      }

      const active = [];
      for (const [id, flash] of this.activeFlashes) {
        active.push({
          flash_id: id, port: flash.port, method: flash.method,
          status: 'flashing', started_at: flash.started_at,
          progress: flash.progress,
          elapsed_ms: Date.now() - new Date(flash.started_at).getTime()
        });
      }
      return { status: 200, data: { active, count: active.length } };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.status.error', err);
    }
  }

  async handleCancel(data) {
    try {
      const { flash_id } = data || {};
      if (!flash_id) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'cancel' });
        this.logger.warn('flash.cancel.missing', { field: 'flash_id' });
        return this._errorResponse(400, 'INVALID_INPUT', 'flash_id requerido', { field: 'flash_id' });
      }

      const flash = this.activeFlashes.get(flash_id);
      if (!flash) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'cancel' });
        this.logger.warn('flash.cancel.not_found', { flash_id });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `Flash '${flash_id}' no encontrado o ya termino`, { flash_id });
      }

      if (flash.process && !flash.process.killed) {
        flash.process.kill('SIGTERM');
      }

      const duration = Date.now() - new Date(flash.started_at).getTime();
      this.activeFlashes.delete(flash_id);
      this.metrics?.increment?.('esp32-flasher.cancelled.total');
      this.metrics?.gauge?.('esp32-flasher.active.count', this.activeFlashes.size);

      this._addHistory({
        flash_id, port: flash.port, method: flash.method,
        binary_path: flash.binary_path,
        status: 'cancelled', duration_ms: duration,
        timestamp: new Date().toISOString()
      });

      this.logger.info('flash.cancelled', { flash_id, port: flash.port, duration_ms: duration });

      await this._publicarEvento('flash.failed', {
        flash_id, port: flash.port, method: flash.method,
        error: 'cancelled', exit_code: null, duration_ms: duration
      }, { project_id: flash.project_id });

      return {
        status: 200,
        data: { flash_id, status: 'cancelled', duration_ms: duration }
      };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.cancel.error', err);
    }
  }

  async handleMonitorStart(data) {
    try {
      const { port, baud, project_id } = data || {};
      if (!port) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'monitor-start' });
        this.logger.warn('flash.monitor_start.missing', { field: 'port' });
        return this._errorResponse(400, 'INVALID_INPUT', 'port requerido', { field: 'port' });
      }

      if (this.activeMonitors.has(port)) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'CONFLICT_STATE', kind: 'monitor-start' });
        this.logger.warn('flash.monitor_start.already_active', { port });
        return this._errorResponse(409, 'CONFLICT_STATE',
          `Monitor ya activo en ${port}`, { port });
      }

      for (const [, flash] of this.activeFlashes) {
        if (flash.port === port) {
          this.metrics?.increment?.('esp32-flasher.errors', { code: 'CONFLICT_STATE', kind: 'monitor-start' });
          this.logger.warn('flash.monitor_start.flash_active', { port });
          return this._errorResponse(409, 'CONFLICT_STATE',
            `Puerto ${port} en uso por flash activo`, { port });
        }
      }

      const monitorBaud = baud || this.config.monitor_baud;

      try {
        await this._startMonitor(port, monitorBaud, project_id);
      } catch (err) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'UNKNOWN_ERROR', kind: 'monitor-start' });
        this.logger.error('flash.monitor_start.failed', { port, error_message: err.message });
        return this._errorResponse(500, 'UNKNOWN_ERROR',
          `Error iniciando monitor: ${err.message}`, { port });
      }

      this.metrics?.increment?.('esp32-flasher.monitor_started.total');
      this.metrics?.gauge?.('esp32-flasher.monitors.count', this.activeMonitors.size);
      this.logger.info('flash.monitor.started', { port, baud: monitorBaud });

      return {
        status: 200,
        data: {
          port, baud: monitorBaud,
          status: 'monitoring',
          message: 'Monitor serial iniciado. Salida publicada via flash.serial_output'
        }
      };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.monitor_start.error', err);
    }
  }

  async handleMonitorStop(data) {
    try {
      const { port } = data || {};
      if (!port) {
        return this._errorResponse(400, 'INVALID_INPUT', 'port requerido', { field: 'port' });
      }
      if (!this.activeMonitors.has(port)) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'monitor-stop' });
        this.logger.warn('flash.monitor_stop.not_found', { port });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `No hay monitor activo en ${port}`, { port });
      }

      await this._stopMonitor(port);
      this.metrics?.gauge?.('esp32-flasher.monitors.count', this.activeMonitors.size);
      this.logger.info('flash.monitor.stopped', { port });

      return { status: 200, data: { port, status: 'stopped' } };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.monitor_stop.error', err);
    }
  }

  async handleMonitorSend(data) {
    try {
      const { port, data: text } = data || {};
      if (!port) {
        return this._errorResponse(400, 'INVALID_INPUT', 'port requerido', { field: 'port' });
      }
      if (!text) {
        return this._errorResponse(400, 'INVALID_INPUT', 'data requerido', { field: 'data' });
      }
      const monitor = this.activeMonitors.get(port);
      if (!monitor) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'RESOURCE_NOT_FOUND', kind: 'monitor-send' });
        this.logger.warn('flash.monitor_send.not_found', { port });
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
          `No hay monitor activo en ${port}`, { port });
      }

      try {
        await fs.promises.writeFile(port, text + '\n');
        return { status: 200, data: { port, sent: text } };
      } catch (err) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'FILESYSTEM_ERROR', kind: 'monitor-send' });
        this.logger.error('flash.monitor_send.io_error', {
          port, error_code: err.code, error_message: err.message
        });
        return this._errorResponse(500, 'FILESYSTEM_ERROR',
          `Error enviando datos al puerto ${port}: ${err.message}`,
          { port });
      }
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.monitor_send.error', err);
    }
  }

  async handleHistory(data) {
    try {
      const limit = parseInt(data?.limit) || 50;
      const portFilter = data?.port;

      let history = this.flashHistory;
      if (portFilter) history = history.filter(h => h.port === portFilter);

      return {
        status: 200,
        data: { history: history.slice(0, limit), total: history.length }
      };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.history.error', err);
    }
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        active_flashes: this.activeFlashes.size,
        active_monitors: this.activeMonitors.size,
        history_entries: this.flashHistory.length
      }
    };
  }

  // ─── Debug remoto (bus-friendly versions de los antiguos HTTP endpoints) ─

  async handleDebugControl(data) {
    try {
      const { device, project, enable } = data || {};
      if (!device || !project) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'debug-control' });
        this.logger.warn('flash.debug_control.missing', { fields: ['device', 'project'] });
        return this._errorResponse(400, 'INVALID_INPUT',
          'device y project requeridos',
          { fields: ['device', 'project'] });
      }
      const mqtt = this.eventBus?.mqtt;
      if (!mqtt || !mqtt.isConnected) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'DEPENDENCY_UNAVAILABLE', kind: 'debug-control' });
        this.logger.warn('flash.debug_control.no_mqtt', { device, project });
        return this._errorResponse(503, 'DEPENDENCY_UNAVAILABLE', 'MQTT no disponible',
          { mqtt: 'disconnected' });
      }
      const topic = `enki/${project}/debug/${device}/control`;
      await mqtt.publish(topic, JSON.stringify({ enable: !!enable }));
      this.logger.info('flash.debug_control', { device, project, enable: !!enable });

      return {
        status: 200,
        data: { ok: true, device, project, enable: !!enable }
      };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.debug_control.error', err);
    }
  }

  async handleDebugStream(data) {
    try {
      const device = data?.device;
      if (!device) {
        return this._errorResponse(400, 'INVALID_INPUT', 'device requerido', { field: 'device' });
      }

      let buf = this.debugBuffers.get(device);
      if (!buf) {
        buf = { lines: [], waiters: [] };
        this.debugBuffers.set(device, buf);
      }

      if (buf.lines.length > 0) {
        const lines = buf.lines.splice(0);
        return { status: 200, data: { lines, device } };
      }

      const lines = await new Promise((resolve) => {
        let done = false;
        const finish = (l) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const idx = buf.waiters.indexOf(waiter);
          if (idx >= 0) buf.waiters.splice(idx, 1);
          resolve(l);
        };
        const timer = setTimeout(() => finish([]), DEBUG_STREAM_TIMEOUT_MS);
        const waiter = (l) => finish(l);
        buf.waiters.push(waiter);
      });

      return { status: 200, data: { lines, device } };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.debug_stream.error', err);
    }
  }

  async handleSerialRelay(data) {
    try {
      const { port, device, project, lines, project_id } = data || {};
      if (!lines || !Array.isArray(lines)) {
        this.metrics?.increment?.('esp32-flasher.errors', { code: 'INVALID_INPUT', kind: 'serial-relay' });
        this.logger.warn('flash.serial_relay.missing', { field: 'lines' });
        return this._errorResponse(400, 'INVALID_INPUT', 'lines array requerido', { field: 'lines' });
      }
      for (const line of lines) {
        await this._publicarEvento('flash.serial_output', {
          port: port || 'cli-relay',
          device_id: device,
          project,
          line,
          source: 'cli'
        }, { project_id });
      }
      return { status: 200, data: { ok: true, relayed: lines.length } };
    } catch (err) {
      return this._handleHandlerError('esp32-flasher.serial_relay.error', err);
    }
  }

  // ─── Pre-flash validation ────────────────────────────────

  _findPlatformioRoot(binaryPath) {
    let dir = path.dirname(path.resolve(binaryPath));
    const root = path.parse(dir).root;
    while (dir !== root) {
      if (fs.existsSync(path.join(dir, 'platformio.ini'))) return dir;
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

    const args = ['--chip', 'auto', '--port', port, '--baud', String(baud)];
    if (erase_before) {
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

  _parseEsptoolProgress(flashId, lines) {
    const flash = this.activeFlashes.get(flashId);
    if (!flash) return;

    for (const line of lines) {
      if (line.includes('Connecting')) {
        flash.progress = { stage: 'connecting', percent: 5 };
      } else if (line.includes('Chip is')) {
        flash.progress = { stage: 'connected', percent: 10, message: line.trim() };
      } else if (line.includes('Erasing flash')) {
        flash.progress = { stage: 'erasing', percent: 20 };
      } else if (line.includes('Writing at')) {
        const match = line.match(/\((\d+)\s*%\)/);
        if (match) {
          const pct = parseInt(match[1]);
          flash.progress = { stage: 'writing', percent: 25 + Math.round(pct * 0.65) };
        }
      } else if (line.includes('Hash of data verified')) {
        flash.progress = { stage: 'verifying', percent: 95 };
      } else if (line.includes('Hard resetting')) {
        flash.progress = { stage: 'resetting', percent: 98 };
      }

      this._publicarEvento('flash.progress', {
        flash_id: flashId,
        stage: flash.progress.stage,
        percent: flash.progress.percent,
        message: line.trim()
      }, { project_id: flash.project_id });
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
    this.metrics?.gauge?.('esp32-flasher.active.count', this.activeFlashes.size);

    let binarySize = 0;
    try {
      const stat = await fs.promises.stat(flash.binary_path);
      binarySize = stat.size;
    } catch (_) { /* binary may have been moved */ }

    if (exitCode === 0) {
      this.metrics?.increment?.('esp32-flasher.completed.total');
      this.metrics?.timing?.('esp32-flasher.duration', duration);

      const entry = {
        flash_id: flashId,
        port: flash.port, method: flash.method,
        binary_path: flash.binary_path, binary_size: binarySize,
        status: 'completed', duration_ms: duration,
        timestamp: new Date().toISOString()
      };
      this._addHistory(entry);

      this.logger.info('flash.completed', {
        flash_id: flashId, port: flash.port,
        duration_ms: duration, binary_size: binarySize
      });

      await this._publicarEvento('flash.completed', {
        flash_id: flashId,
        port: flash.port, method: flash.method,
        binary_path: flash.binary_path, binary_size: binarySize,
        duration_ms: duration
      }, { project_id: flash.project_id });
    } else {
      this.metrics?.increment?.('esp32-flasher.failed.total');
      this.metrics?.timing?.('esp32-flasher.duration', duration);

      const errorOutput = flash.log.slice(-20).join('\n');

      const entry = {
        flash_id: flashId,
        port: flash.port, method: flash.method,
        binary_path: flash.binary_path,
        status: 'failed', error: errorOutput,
        exit_code: exitCode, duration_ms: duration,
        timestamp: new Date().toISOString()
      };
      this._addHistory(entry);

      this.logger.error('flash.failed', {
        flash_id: flashId, port: flash.port,
        exit_code: exitCode, duration_ms: duration
      });

      await this._publicarEvento('flash.failed', {
        flash_id: flashId,
        port: flash.port, method: flash.method,
        error: errorOutput, exit_code: exitCode,
        duration_ms: duration
      }, { project_id: flash.project_id });
    }
  }

  async _onFlashError(flashId, err, startTime) {
    const flash = this.activeFlashes.get(flashId);
    if (!flash) return;

    const duration = Date.now() - startTime;
    this.activeFlashes.delete(flashId);

    this.metrics?.increment?.('esp32-flasher.failed.total');
    this.metrics?.gauge?.('esp32-flasher.active.count', this.activeFlashes.size);

    const errorMsg = `No se pudo ejecutar: ${err.message}`;

    this._addHistory({
      flash_id: flashId,
      port: flash.port, method: flash.method,
      binary_path: flash.binary_path,
      status: 'failed', error: errorMsg,
      exit_code: -1, duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    this.logger.error('flash.spawn_error', {
      flash_id: flashId, error_message: err.message
    });

    await this._publicarEvento('flash.failed', {
      flash_id: flashId,
      port: flash.port, method: flash.method,
      error: errorMsg, exit_code: -1,
      duration_ms: duration
    }, { project_id: flash.project_id });
  }

  // ─── Serial Monitor ──────────────────────────────────────

  async _startMonitor(port, baud, project_id) {
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

    const catProc = spawn('cat', [port], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const buffer = [];
    const monitor = {
      process: catProc,
      baud,
      project_id: project_id || null,
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

        this._publicarEvento('flash.serial_output', {
          port, line: trimmed
        }, { project_id: monitor.project_id });
      }
    });

    catProc.on('close', () => {
      this.activeMonitors.delete(port);
      this.metrics?.gauge?.('esp32-flasher.monitors.count', this.activeMonitors.size);
      this.logger.info('flash.monitor.closed', { port });
    });

    catProc.on('error', (err) => {
      this.activeMonitors.delete(port);
      this.metrics?.gauge?.('esp32-flasher.monitors.count', this.activeMonitors.size);
      this.logger.error('flash.monitor.error', {
        port, error_message: err.message
      });
      this.metrics?.increment?.('esp32-flasher.errors', { code: 'MONITOR_ERROR', kind: 'monitor' });
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
      const dir = path.dirname(pattern);
      const prefix = path.basename(pattern).replace('*', '');

      try {
        const entries = await fs.promises.readdir(dir);
        for (const entry of entries) {
          if (entry.startsWith(prefix)) {
            const portPath = path.join(dir, entry);
            const info = { path: portPath, name: entry };
            try {
              const stat = await fs.promises.stat(portPath);
              info.type = stat.isCharacterDevice() ? 'serial' : 'other';
            } catch (_) {
              info.type = 'unknown';
            }

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
      } catch (err) {
        if (err.code !== 'ENOENT') {
          this.logger?.debug?.('flash.scan_ports.error', {
            dir, error_code: err.code, error_message: err.message
          });
        }
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

  // ─── Debug remoto: MQTT listener ─────────────────────────

  _startDebugListener() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) return;

    this._onDebugMessage = (topic, payload) => {
      const match = topic.match(/^enki\/([^/]+)\/debug\/([^/]+)$/);
      if (!match) return;

      const [, , deviceId] = match;
      let data;
      try {
        data = typeof payload === 'string' ? JSON.parse(payload)
             : Buffer.isBuffer(payload) ? JSON.parse(payload.toString())
             : payload;
      } catch {
        this.logger?.debug?.('flash.debug.parse_error', { topic });
        return;
      }

      if (!data.lines || !Array.isArray(data.lines)) return;

      let buf = this.debugBuffers.get(deviceId);
      if (!buf) {
        buf = { lines: [], waiters: [] };
        this.debugBuffers.set(deviceId, buf);
      }

      buf.lines.push(...data.lines);
      if (buf.lines.length > DEBUG_BUFFER_MAX_LINES) {
        buf.lines = buf.lines.slice(-DEBUG_BUFFER_MAX_LINES);
      }

      if (buf.waiters.length > 0) {
        const newLines = data.lines.slice();
        const waiters = buf.waiters.splice(0);
        for (const waiter of waiters) {
          try { waiter(newLines); } catch (_) {}
        }
      }

      this._publicarEvento('flash.serial_output', {
        port: `remote:${deviceId}`,
        line: data.lines.join('\n'),
        device_id: deviceId
      });
    };

    mqtt.on('message', this._onDebugMessage);
    mqtt.subscribe('enki/+/debug/+').catch((err) => {
      this.logger?.warn?.('flash.debug.subscribe_failed', {
        error_message: err.message
      });
    });

    this.logger.info('flash.debug_listener.started');
  }
}

module.exports = ESP32FlasherModule;
