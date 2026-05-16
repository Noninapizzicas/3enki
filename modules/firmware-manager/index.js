/**
 * firmware-manager v3.0.0 — Reescrito al canon (POC2 #13 del horizontal).
 *
 * Catálogo de firmwares con checksum SHA-256, versionado semver,
 * orquestación de OTA via device-shadow (emite shadow.set_desired +
 * escucha shadow.updated), y servicio HTTP de binarios para ESP32.
 *
 * 10 ui_handlers (list/register/trigger-ota/status/rollback/device-versions/
 *   cleanup-otas/update-meta/info/list-by-project).
 * 1 HTTP endpoint (GET /firmware/:type/:version/:file sirve binarios).
 * 4 subscribes de bus (shadow.updated/device.registered/firmware.build_completed/
 *   esp32.build_completed).
 * 4 publishes de dominio (firmware.registered/ota_requested/ota_completed/ota_failed).
 *
 * Cumple los contratos transversales:
 *  - errors: todos los handlers devuelven { status, data | error: { code, message } }.
 *    Codes canónicos: INVALID_INPUT, RESOURCE_NOT_FOUND, UNKNOWN_ERROR.
 *  - observability: correlation_id propagado vía _publicarEvento.
 *  - lifecycle: onLoad inicializa catálogo + OTA log; onUnload limpia timers y persiste.
 *  - persistence: manifest.json + ota-log.json en data_path.
 *
 * 5 helpers POC2:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar _sanitizeFile.
 *
 * Monolito (1093 LOC) preservado en
 * arquitectura/migracion/_legacy/firmware-manager-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/firmware-manager-mapa.md
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
class FirmwareManagerModule extends BaseModule {
  constructor() {
    super();
    this.name = 'firmware-manager';
    this.version = '3.0.0';
    this.config = {
      data_path: './data/firmware',
      auto_check_on_register: true,
      ota_timeout_ms: 5 * 60 * 1000,
      ota_cleanup_interval_ms: 60 * 1000,
      validate_binaries_on_load: true
    };

    this.catalog = {};
    this.pendingOtas = new Map();
    this._otaTimeoutTimers = new Map();
    this._cleanupTimer = null;
    this.otaLog = [];
    this.maxOtaLog = 500;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('firmware-manager.loading', { module: this.name, version: this.version });

    if (core.config?.['firmware-manager']) {
      this.config = { ...this.config, ...core.config['firmware-manager'] };
    }

    this._validateConfig();
    this.config.data_path = path.resolve(this.config.data_path);

    await this._loadCatalog();
    await this._loadOtaLog();

    if (this.config.validate_binaries_on_load) {
      await this._validateCatalogIntegrity();
    }

    this._publishCatalogMetrics();
    this.metrics.gauge('firmware.pending_otas.count', 0);

    this._cleanupTimer = setInterval(
      () => this._cleanupStaleOtas(),
      this.config.ota_cleanup_interval_ms
    );

    this.logger.info('firmware-manager.loaded', {
      module: this.name,
      version: this.version,
      catalog_types: Object.keys(this.catalog).length,
      data_path: this.config.data_path,
      ota_timeout_ms: this.config.ota_timeout_ms
    });
  }

  async onUnload() {
    this.logger.info('firmware-manager.unloading', { module: this.name });

    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    for (const timer of this._otaTimeoutTimers.values()) {
      clearTimeout(timer);
    }
    this._otaTimeoutTimers.clear();

    await this._saveCatalog();
    await this._saveOtaLog();

    this.catalog = {};
    this.pendingOtas.clear();
    this.otaLog = [];

    this.logger.info('firmware-manager.unloaded', { module: this.name });
  }

  // ==========================================
  // Config validation
  // ==========================================

  _validateConfig() {
    if (typeof this.config.data_path !== 'string' || !this.config.data_path) {
      this.logger.warn('firmware-manager.config.invalid', {
        field: 'data_path', value: this.config.data_path, fallback: './data/firmware'
      });
      this.config.data_path = './data/firmware';
    }

    if (typeof this.config.auto_check_on_register !== 'boolean') {
      this.config.auto_check_on_register = true;
    }

    if (typeof this.config.ota_timeout_ms !== 'number' || this.config.ota_timeout_ms < 100) {
      this.logger.warn('firmware-manager.config.invalid', {
        field: 'ota_timeout_ms', value: this.config.ota_timeout_ms, fallback: 300000
      });
      this.config.ota_timeout_ms = 5 * 60 * 1000;
    }

    if (typeof this.config.ota_cleanup_interval_ms !== 'number' || this.config.ota_cleanup_interval_ms < 10000) {
      this.config.ota_cleanup_interval_ms = 60 * 1000;
    }
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onShadowUpdated(event) {
    const data = event?.data || event?.payload || event;
    const { device_id, reported } = data;

    if (!device_id || !reported?.firmware) return;

    const pending = this.pendingOtas.get(device_id);
    if (!pending) return;

    const reportedVersion = typeof reported.firmware === 'string'
      ? reported.firmware
      : reported.firmware.version;

    if (!reportedVersion) return;

    if (reportedVersion === pending.target_version) {
      this._clearOtaTimeout(device_id);
      this.pendingOtas.delete(device_id);

      const duration = Date.now() - new Date(pending.requested_at).getTime();
      this.metrics.increment('firmware.ota_completed.total');
      this.metrics.timing('firmware.ota.duration', duration);
      this.metrics.gauge('firmware.pending_otas.count', this.pendingOtas.size);

      const logEntry = {
        device_id,
        type: pending.type,
        from: pending.previous_version,
        to: pending.target_version,
        status: 'completed',
        duration_ms: duration,
        requested_at: pending.requested_at,
        completed_at: new Date().toISOString()
      };

      this._addOtaLog(logEntry);

      this.logger.info('firmware-manager.ota.completed', {
        device_id, from: pending.previous_version, to: pending.target_version, duration_ms: duration
      });

      await this._publicarEvento('firmware.ota_completed', logEntry, data);

    } else if (reportedVersion === pending.previous_version) {
      // Firmware no cambió — dispositivo puede estar descargando, no marcar como fallido
    } else {
      this._clearOtaTimeout(device_id);
      this.pendingOtas.delete(device_id);
      this.metrics.increment('firmware.ota_failed.total');
      this.metrics.gauge('firmware.pending_otas.count', this.pendingOtas.size);

      const logEntry = {
        device_id,
        type: pending.type,
        from: pending.previous_version,
        to: pending.target_version,
        actual: reportedVersion,
        status: 'failed',
        reason: 'version_mismatch',
        requested_at: pending.requested_at,
        failed_at: new Date().toISOString()
      };

      this._addOtaLog(logEntry);

      this.logger.warn('firmware-manager.ota.failed', {
        device_id, expected: pending.target_version, actual: reportedVersion
      });

      await this._publicarEvento('firmware.ota_failed', logEntry, data);
    }
  }

  async onDeviceRegistered(event) {
    if (!this.config.auto_check_on_register) return;

    const data = event?.data || event?.payload || event;
    const device = data?.device;
    if (!device || !device.firmware || !device.type) return;

    const typeEntry = this.catalog[device.type];
    if (!typeEntry || !typeEntry.latest) return;

    if (device.firmware !== typeEntry.latest) {
      this.metrics.increment('firmware.device_outdated.total');
      this.logger.info('firmware-manager.device.outdated', {
        device_id: device.device_id, current: device.firmware,
        latest: typeEntry.latest, type: device.type
      });
    }
  }

  async onBuildCompleted(event) {
    const data = event?.data || event?.payload || event;
    const { driver, project_name, board, binary_path, binary_size } = data;

    const driverName = driver || project_name;
    if (!driverName || !binary_path) return;

    try {
      await fs.promises.access(binary_path, fs.constants.R_OK);
    } catch (_) {
      this.logger.warn('firmware-manager.auto_register.binary_not_found', {
        driver: driverName, binary_path
      });
      return;
    }

    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `${driverName}-${timestamp}.bin`;
      const version = this._timestampToVersion(now.toISOString());
      const type = driverName;

      const binariesDir = path.join(this.config.data_path, 'binaries');
      await fs.promises.mkdir(binariesDir, { recursive: true });

      const destPath = path.join(binariesDir, fileName);
      await fs.promises.copyFile(binary_path, destPath);

      this.logger.info('firmware-manager.auto_register.copied', {
        driver: driverName, from: binary_path, to: destPath, size: binary_size
      });

      const result = await this.handleRegister({
        type,
        version,
        file: fileName,
        changelog: `Build de driver ${driverName} (${board || 'esp32dev'})`,
        utility: data.utility || '',
        description: data.description || '',
        board: board || 'esp32dev',
        capabilities: data.capabilities || []
      });

      if (result.status === 201) {
        this.logger.info('firmware-manager.auto_register.success', {
          driver: driverName, type, version, file: fileName
        });
      } else {
        this.logger.warn('firmware-manager.auto_register.failed', {
          driver: driverName, error: result.error?.message || result.error
        });
      }
    } catch (err) {
      this.logger.error('firmware-manager.auto_register.error', {
        driver: driverName, error: err.message
      });
      this.metrics?.increment('firmware-manager.errors', { kind: 'auto_register' });
    }
  }

  _timestampToVersion(timestamp) {
    const d = timestamp ? new Date(timestamp) : new Date();
    if (isNaN(d.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate() * 10000 + now.getHours() * 100 + now.getMinutes()}`;
    }
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate() * 10000 + d.getHours() * 100 + d.getMinutes()}`;
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleList() {
    const types = [];
    for (const [type, entry] of Object.entries(this.catalog)) {
      const latestRelease = entry.releases[entry.latest];
      types.push({
        type,
        latest: entry.latest,
        releases_count: Object.keys(entry.releases).length,
        releases: Object.keys(entry.releases),
        utility: entry.utility || '',
        description: entry.description || '',
        board: entry.board || '',
        capabilities: entry.capabilities || [],
        projects: entry.projects || [],
        binary_path: latestRelease?.file
          ? path.join(this.config.data_path, 'binaries', latestRelease.file)
          : null
      });
    }
    return { status: 200, data: { types, total: types.length } };
  }

  async handleRegister(data) {
    const startTime = Date.now();
    const { type, version, file, changelog, min_version } = data;

    if (!type) {
      this.logger.warn('firmware-manager.register.validation', { field: 'type' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'register', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'type requerido (ej: esp32-gateway-printer)');
    }
    if (!version) {
      this.logger.warn('firmware-manager.register.validation', { field: 'version' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'register', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'version requerida (semver)');
    }
    if (!file) {
      this.logger.warn('firmware-manager.register.validation', { field: 'file' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'register', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'file requerido (nombre del .bin)');
    }

    if (!/^\d+\.\d+\.\d+/.test(version)) {
      this.logger.warn('firmware-manager.register.invalid_version', { version });
      this.metrics?.increment('firmware-manager.errors', { kind: 'register', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'version debe ser semver (ej: 1.2.3)');
    }

    const safeFile = this._sanitizeFile(file);
    if (!safeFile) {
      this.logger.warn('firmware-manager.register.invalid_filename', { file });
      this.metrics?.increment('firmware-manager.errors', { kind: 'register', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Nombre de archivo inválido (sin rutas, solo nombre)');
    }

    const binPath = path.join(this.config.data_path, 'binaries', safeFile);

    let sha256, size;
    try {
      const stat = await fs.promises.stat(binPath);
      size = stat.size;
      const content = await fs.promises.readFile(binPath);
      sha256 = crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.logger.warn('firmware-manager.register.binary_not_found', { file: safeFile, binPath });
        this.metrics?.increment('firmware-manager.errors', { kind: 'register', code: 'RESOURCE_NOT_FOUND' });
        return this._errorResponse(400, 'RESOURCE_NOT_FOUND', `Binario no encontrado: ${binPath}`);
      }
      return this._handleHandlerError('firmware-manager.register.io_error', err, 'register');
    }

    if (!this.catalog[type]) {
      this.catalog[type] = {
        latest: version,
        releases: {},
        utility: data.utility || '',
        description: data.description || '',
        board: data.board || '',
        capabilities: data.capabilities || [],
        projects: data.projects || []
      };
    }

    if (data.utility) this.catalog[type].utility = data.utility;
    if (data.description) this.catalog[type].description = data.description;
    if (data.board) this.catalog[type].board = data.board;
    if (data.capabilities && data.capabilities.length > 0) this.catalog[type].capabilities = data.capabilities;

    this.catalog[type].releases[version] = {
      file,
      sha256,
      size,
      date: new Date().toISOString(),
      changelog: changelog || null,
      min_version: min_version || null
    };

    if (!this.catalog[type].latest || this._compareVersions(version, this.catalog[type].latest) >= 0) {
      this.catalog[type].latest = version;
    }

    this.metrics.increment('firmware.catalog_entries.total');
    this.metrics.timing('firmware.register.duration', Date.now() - startTime);
    this._publishCatalogMetrics();

    await this._saveCatalog();

    this.logger.info('firmware-manager.registered', { type, version, file, sha256, size });

    await this._publicarEvento('firmware.registered', { type, version, sha256 }, data);

    return { status: 201, data: { type, version, sha256, size, latest: this.catalog[type].latest } };
  }

  async handleTriggerOta(data) {
    const { device_id, project_id, type, version } = data;

    if (!device_id) {
      this.logger.warn('firmware-manager.trigger_ota.validation', { field: 'device_id' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'trigger_ota', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido');
    }
    if (!type) {
      this.logger.warn('firmware-manager.trigger_ota.validation', { field: 'type' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'trigger_ota', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'type requerido (tipo de firmware)');
    }

    const typeEntry = this.catalog[type];
    if (!typeEntry) {
      this.logger.warn('firmware-manager.trigger_ota.type_not_found', { type });
      this.metrics?.increment('firmware-manager.errors', { kind: 'trigger_ota', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Tipo de firmware '${type}' no encontrado en catálogo`);
    }

    const targetVersion = version || typeEntry.latest;
    const release = typeEntry.releases[targetVersion];
    if (!release) {
      this.logger.warn('firmware-manager.trigger_ota.version_not_found', { type, version: targetVersion });
      this.metrics?.increment('firmware-manager.errors', { kind: 'trigger_ota', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Versión ${targetVersion} no encontrada para ${type}`);
    }

    if (release.min_version && data.current_version) {
      if (this._compareVersions(data.current_version, release.min_version) < 0) {
        this.logger.warn('firmware-manager.trigger_ota.min_version_fail', {
          device_id, current: data.current_version, min: release.min_version, target: targetVersion
        });
        this.metrics?.increment('firmware-manager.errors', { kind: 'trigger_ota', code: 'INVALID_INPUT' });
        return this._errorResponse(400, 'INVALID_INPUT',
          `La versión mínima para actualizar a ${targetVersion} es ${release.min_version}. Dispositivo tiene ${data.current_version}.`);
      }
    }

    if (this.pendingOtas.has(device_id)) {
      this._clearOtaTimeout(device_id);
      this.pendingOtas.delete(device_id);
      this.logger.warn('firmware-manager.ota.replaced', { device_id, new_target: targetVersion });
    }

    const firmwareUrl = `/firmware/${encodeURIComponent(type)}/${encodeURIComponent(targetVersion)}/${encodeURIComponent(release.file)}`;

    await this._publicarEvento('shadow.set_desired', {
      device_id,
      project_id: project_id || 'default',
      state: {
        firmware: {
          version: targetVersion,
          url: firmwareUrl,
          sha256: release.sha256,
          size: release.size
        }
      }
    }, data);

    this.pendingOtas.set(device_id, {
      requested_at: new Date().toISOString(),
      target_version: targetVersion,
      previous_version: data.current_version || null,
      type,
      correlation_id: data.correlation_id || crypto.randomUUID()
    });

    this.metrics.increment('firmware.ota_requested.total');
    this.metrics.gauge('firmware.pending_otas.count', this.pendingOtas.size);

    this._scheduleOtaTimeout(device_id);

    this.logger.info('firmware-manager.ota.requested', {
      device_id, type, target_version: targetVersion,
      sha256: release.sha256, timeout_ms: this.config.ota_timeout_ms
    });

    await this._publicarEvento('firmware.ota_requested', {
      device_id, type, target_version: targetVersion,
      firmware_url: firmwareUrl, timestamp: new Date().toISOString()
    }, data);

    return {
      status: 200,
      data: {
        device_id, type, target_version: targetVersion,
        firmware_url: firmwareUrl, sha256: release.sha256,
        timeout_ms: this.config.ota_timeout_ms
      }
    };
  }

  async handleOtaStatus(data) {
    const pending = [];
    const now = Date.now();

    for (const [deviceId, ota] of this.pendingOtas) {
      if (!data?.device_id || data.device_id === deviceId) {
        const elapsed = now - new Date(ota.requested_at).getTime();
        pending.push({
          device_id: deviceId,
          ...ota,
          elapsed_ms: elapsed,
          timeout_ms: this.config.ota_timeout_ms,
          remaining_ms: Math.max(0, this.config.ota_timeout_ms - elapsed)
        });
      }
    }

    const limit = parseInt(data?.limit) || 20;
    const recentLog = this.otaLog.slice(0, limit);

    return {
      status: 200,
      data: {
        pending,
        pending_count: pending.length,
        recent_log: recentLog,
        log_total: this.otaLog.length
      }
    };
  }

  async handleRollback(data) {
    const { device_id, project_id, type, target_version } = data;

    if (!device_id) {
      this.logger.warn('firmware-manager.rollback.validation', { field: 'device_id' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'rollback', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'device_id requerido');
    }
    if (!type) {
      this.logger.warn('firmware-manager.rollback.validation', { field: 'type' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'rollback', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'type requerido');
    }
    if (!target_version) {
      this.logger.warn('firmware-manager.rollback.validation', { field: 'target_version' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'rollback', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'target_version requerido (versión a la que volver)');
    }

    this.metrics.increment('firmware.rollback.total');

    return this.handleTriggerOta({
      device_id,
      project_id,
      type,
      version: target_version,
      current_version: data.current_version,
      correlation_id: data.correlation_id
    });
  }

  async handleDeviceVersions(data) {
    const versions = [];

    for (const entry of this.otaLog) {
      if (!data?.device_id || data.device_id === entry.device_id) {
        versions.push({
          device_id: entry.device_id,
          type: entry.type,
          from: entry.from,
          to: entry.to,
          status: entry.status,
          timestamp: entry.completed_at || entry.failed_at || entry.requested_at
        });
      }
    }

    return { status: 200, data: { versions, total: versions.length } };
  }

  async handleCleanupOtas(data) {
    let cleaned = 0;

    if (data?.device_id) {
      if (this.pendingOtas.has(data.device_id)) {
        this._clearOtaTimeout(data.device_id);
        this.pendingOtas.delete(data.device_id);
        cleaned = 1;
      }
    } else {
      cleaned = this.pendingOtas.size;
      for (const timer of this._otaTimeoutTimers.values()) {
        clearTimeout(timer);
      }
      this._otaTimeoutTimers.clear();
      this.pendingOtas.clear();
    }

    this.metrics.gauge('firmware.pending_otas.count', this.pendingOtas.size);
    this.logger.info('firmware-manager.ota.cleanup.manual', { cleaned });

    return { status: 200, data: { cleaned, remaining: this.pendingOtas.size } };
  }

  async handleUpdateMeta(data) {
    const { type, utility, description, board, capabilities, projects, docs_url } = data;

    if (!type) {
      this.logger.warn('firmware-manager.update_meta.validation', { field: 'type' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'update_meta', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'type requerido');
    }

    const entry = this.catalog[type];
    if (!entry) {
      this.logger.warn('firmware-manager.update_meta.not_found', { type });
      this.metrics?.increment('firmware-manager.errors', { kind: 'update_meta', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Tipo '${type}' no encontrado`);
    }

    if (utility !== undefined) entry.utility = utility;
    if (description !== undefined) entry.description = description;
    if (board !== undefined) entry.board = board;
    if (capabilities !== undefined) entry.capabilities = capabilities;
    if (projects !== undefined) entry.projects = projects;
    if (docs_url !== undefined) entry.docs_url = docs_url;

    await this._saveCatalog();
    this.logger.info('firmware-manager.meta.updated', { type });

    return { status: 200, data: { type, ...this._getTypeMeta(type) } };
  }

  async handleGetInfo(data) {
    const { type } = data;

    if (!type) {
      this.logger.warn('firmware-manager.get_info.validation', { field: 'type' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'get_info', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'type requerido');
    }

    const entry = this.catalog[type];
    if (!entry) {
      this.logger.warn('firmware-manager.get_info.not_found', { type });
      this.metrics?.increment('firmware-manager.errors', { kind: 'get_info', code: 'RESOURCE_NOT_FOUND' });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Tipo '${type}' no encontrado`);
    }

    const releases = Object.entries(entry.releases || {}).map(([version, rel]) => ({
      version,
      file: rel.file,
      sha256: rel.sha256,
      size: rel.size,
      date: rel.date,
      changelog: rel.changelog,
      min_version: rel.min_version
    })).sort((a, b) => b.date.localeCompare(a.date));

    return {
      status: 200,
      data: {
        type,
        latest: entry.latest,
        utility: entry.utility || '',
        description: entry.description || '',
        board: entry.board || '',
        capabilities: entry.capabilities || [],
        projects: entry.projects || [],
        docs_url: entry.docs_url || '',
        releases_count: releases.length,
        releases
      }
    };
  }

  async handleListByProject(data) {
    const { project_id } = data;

    if (!project_id) {
      this.logger.warn('firmware-manager.list_by_project.validation', { field: 'project_id' });
      this.metrics?.increment('firmware-manager.errors', { kind: 'list_by_project', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido');
    }

    const types = [];
    for (const [type, entry] of Object.entries(this.catalog)) {
      if (entry.projects && entry.projects.includes(project_id)) {
        types.push({
          type,
          latest: entry.latest,
          utility: entry.utility || '',
          board: entry.board || '',
          releases_count: Object.keys(entry.releases).length
        });
      }
    }

    return { status: 200, data: { project_id, types, total: types.length } };
  }

  // ==========================================
  // HTTP handler
  // ==========================================

  async handleServeBinary(req) {
    const { type, version, file } = req.params || req;

    const safeFile = this._sanitizeFile(file);
    if (!safeFile) {
      this.logger.warn('firmware-manager.serve_binary.invalid_filename', { file });
      this.metrics?.increment('firmware-manager.errors', { kind: 'serve_binary', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Nombre de archivo inválido');
    }

    const binPath = path.join(this.config.data_path, 'binaries', safeFile);
    const binariesDir = path.resolve(this.config.data_path, 'binaries');
    if (!path.resolve(binPath).startsWith(binariesDir)) {
      this.logger.warn('firmware-manager.serve_binary.path_traversal', { file, binPath });
      this.metrics?.increment('firmware-manager.errors', { kind: 'serve_binary', code: 'INVALID_INPUT' });
      return this._errorResponse(400, 'INVALID_INPUT', 'Ruta inválida');
    }

    this.metrics.increment('firmware.binary_served.total');

    try {
      const content = await fs.promises.readFile(binPath);
      this.metrics.increment('firmware.binary_served.bytes', content.length);

      const safeName = safeFile.replace(/["\r\n]/g, '_');
      return {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': content.length,
          'Content-Disposition': `attachment; filename="${safeName}"`
        },
        body: content
      };
    } catch (err) {
      this.metrics.increment('firmware.binary_served.errors');
      this.logger.warn('firmware-manager.serve_binary.not_found', { file: safeFile, error: err.message });
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Firmware binary not found: ${safeFile}`);
    }
  }

  // ==========================================
  // OTA Timeout Management
  // ==========================================

  _scheduleOtaTimeout(device_id) {
    this._clearOtaTimeout(device_id);

    const timer = setTimeout(() => {
      this._otaTimeoutTimers.delete(device_id);
      const pending = this.pendingOtas.get(device_id);
      if (!pending) return;

      this.pendingOtas.delete(device_id);
      this.metrics.increment('firmware.ota_failed.total');
      this.metrics.increment('firmware.ota_timeout.total');
      this.metrics.gauge('firmware.pending_otas.count', this.pendingOtas.size);

      const logEntry = {
        device_id,
        type: pending.type,
        from: pending.previous_version,
        to: pending.target_version,
        status: 'failed',
        reason: 'timeout',
        requested_at: pending.requested_at,
        failed_at: new Date().toISOString()
      };

      this._addOtaLog(logEntry);

      this.logger.warn('firmware-manager.ota.timeout', {
        device_id, target_version: pending.target_version,
        timeout_ms: this.config.ota_timeout_ms
      });

      this.eventBus.publish('firmware.ota_failed', {
        ...logEntry,
        timestamp: new Date().toISOString(),
        correlation_id: pending.correlation_id || crypto.randomUUID()
      }).catch(err => {
        this.logger.error('firmware-manager.ota.timeout.publish_error', {
          device_id, error: err.message
        });
      });
    }, this.config.ota_timeout_ms);

    this._otaTimeoutTimers.set(device_id, timer);
  }

  _clearOtaTimeout(device_id) {
    const timer = this._otaTimeoutTimers.get(device_id);
    if (timer) {
      clearTimeout(timer);
      this._otaTimeoutTimers.delete(device_id);
    }
  }

  _cleanupStaleOtas() {
    const now = Date.now();
    let cleaned = 0;

    for (const [deviceId, ota] of this.pendingOtas) {
      const elapsed = now - new Date(ota.requested_at).getTime();
      if (elapsed > this.config.ota_timeout_ms * 2) {
        this._clearOtaTimeout(deviceId);
        this.pendingOtas.delete(deviceId);
        this.metrics.increment('firmware.ota_failed.total');
        this.metrics.increment('firmware.ota_stale_cleanup.total');

        this._addOtaLog({
          device_id: deviceId,
          type: ota.type,
          from: ota.previous_version,
          to: ota.target_version,
          status: 'failed',
          reason: 'stale_cleanup',
          requested_at: ota.requested_at,
          failed_at: new Date().toISOString()
        });

        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.metrics.gauge('firmware.pending_otas.count', this.pendingOtas.size);
      this.logger.info('firmware-manager.ota.stale_cleanup', {
        cleaned, remaining: this.pendingOtas.size
      });
    }
  }

  // ==========================================
  // Persistencia
  // ==========================================

  async _loadCatalog() {
    const filePath = path.join(this.config.data_path, 'manifest.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      await fs.promises.mkdir(path.join(this.config.data_path, 'binaries'), { recursive: true });

      const raw = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      this.catalog = data.catalog || data;

      this.logger.info('firmware-manager.catalog.loaded', {
        types: Object.keys(this.catalog).length,
        entries: this._countCatalogEntries()
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('firmware-manager.catalog.load_error', { error: err.message });
      }
      this.catalog = {};
    }
  }

  async _saveCatalog() {
    const filePath = path.join(this.config.data_path, 'manifest.json');

    try {
      await fs.promises.mkdir(this.config.data_path, { recursive: true });
      const data = {
        _version: '2.0.0',
        _updated: new Date().toISOString(),
        catalog: this.catalog
      };
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('firmware-manager.catalog.save_error', { error: err.message });
    }
  }

  async _loadOtaLog() {
    const filePath = path.join(this.config.data_path, 'ota-log.json');

    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      this.otaLog = data.log || [];
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('firmware-manager.ota_log.load_error', { error: err.message });
      }
      this.otaLog = [];
    }
  }

  async _saveOtaLog() {
    const filePath = path.join(this.config.data_path, 'ota-log.json');

    try {
      const data = {
        _version: '1.0.0',
        _updated: new Date().toISOString(),
        log: this.otaLog
      };
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('firmware-manager.ota_log.save_error', { error: err.message });
    }
  }

  _addOtaLog(entry) {
    this.otaLog.unshift(entry);
    if (this.otaLog.length > this.maxOtaLog) {
      this.otaLog.pop();
    }
  }

  // ==========================================
  // Validación de integridad
  // ==========================================

  async _validateCatalogIntegrity() {
    let valid = 0;
    let missing = 0;
    const missingFiles = [];

    for (const [type, entry] of Object.entries(this.catalog)) {
      for (const [version, release] of Object.entries(entry.releases || {})) {
        const binPath = path.join(this.config.data_path, 'binaries', release.file);
        try {
          await fs.promises.access(binPath, fs.constants.R_OK);
          valid++;
        } catch {
          missing++;
          missingFiles.push({ type, version, file: release.file });
        }
      }
    }

    this.metrics.gauge('firmware.catalog_valid_binaries.count', valid);
    this.metrics.gauge('firmware.catalog_missing_binaries.count', missing);

    if (missing > 0) {
      this.logger.warn('firmware-manager.catalog.integrity_check', {
        valid, missing, missing_files: missingFiles
      });
    } else {
      this.logger.info('firmware-manager.catalog.integrity_check', { valid, missing: 0 });
    }
  }

  // ==========================================
  // Helpers de métricas y utilidades
  // ==========================================

  _countCatalogEntries() {
    let count = 0;
    for (const type of Object.values(this.catalog)) {
      count += Object.keys(type.releases || {}).length;
    }
    return count;
  }

  _publishCatalogMetrics() {
    this.metrics.gauge('firmware.catalog_types.count', Object.keys(this.catalog).length);
    this.metrics.gauge('firmware.catalog_entries.count', this._countCatalogEntries());
  }

  _getTypeMeta(type) {
    const entry = this.catalog[type];
    if (!entry) return {};
    return {
      utility: entry.utility || '',
      description: entry.description || '',
      board: entry.board || '',
      capabilities: entry.capabilities || [],
      projects: entry.projects || [],
      docs_url: entry.docs_url || ''
    };
  }

  _compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na < nb) return -1;
      if (na > nb) return 1;
    }
    return 0;
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
    const status = code === 'INVALID_INPUT'      ? 400 :
                   code === 'RESOURCE_NOT_FOUND'     ? 404 :
                   code === 'PERMISSION_DENIED' ? 403 :
                   code === 'CONFLICT_STATE'               ? 409 :
                   code === 'UPSTREAM_UNREACHABLE'   ? 503 :
                                                        500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code });
    this.metrics?.increment('firmware-manager.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    if (err.code === 'ENOENT') return 'RESOURCE_NOT_FOUND';
    if (err.code === 'EACCES' || err.code === 'EPERM') return 'PERMISSION_DENIED';
    if (err.code === 'EEXIST') return 'CONFLICT_STATE';
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid')) return 'INVALID_INPUT';
    if (msg.includes('access denied') || msg.includes('forbidden')) return 'PERMISSION_DENIED';
    if (msg.includes('already')) return 'CONFLICT_STATE';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = { timestamp: new Date().toISOString(), ...payload };
    if (sourcePayload?.correlation_id) enriched.correlation_id = sourcePayload.correlation_id;
    else if (!enriched.correlation_id) enriched.correlation_id = crypto.randomUUID();
    await this.eventBus.publish(name, enriched);
  }

  // Auxiliar de dominio: sanitiza nombres de archivo para prevenir path traversal.
  _sanitizeFile(file) {
    if (!file || typeof file !== 'string') return null;
    const basename = path.basename(file);
    if (basename !== file || file.includes('..') || file.includes('\0')) return null;
    return basename;
  }
}

module.exports = FirmwareManagerModule;
