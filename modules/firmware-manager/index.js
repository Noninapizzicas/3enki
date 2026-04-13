/**
 * Módulo Firmware Manager v2.0.0
 *
 * Gestión de firmwares, versionado, y orquestación de OTA.
 *
 * Responsabilidades:
 *   - Catálogo de firmwares: tipo, versión, sha256, changelog
 *   - Servir binarios por HTTP: GET /firmware/:type/:version/:file
 *   - Orquestar OTA via device-shadow (escribe desired.firmware)
 *   - Trackear progreso: escucha shadow.updated para detectar reported.firmware
 *   - Rollback: re-escribe desired con versión anterior
 *   - Timeout automático de OTAs que no completan
 *   - Validación de integridad de binarios al cargar
 *
 * NO compila firmware — solo gestiona binarios ya compilados.
 *
 * Tier: tier_3_core (depende de device-shadow y device-registry)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FirmwareManagerModule {
  constructor() {
    this.name = 'firmware-manager';
    this.version = '2.0.0';

    // Dependencias
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      data_path: './data/firmware',
      auto_check_on_register: true,
      ota_timeout_ms: 5 * 60 * 1000,
      ota_cleanup_interval_ms: 60 * 1000,
      validate_binaries_on_load: true
    };

    // Catálogo de firmwares: { tipo: { latest, releases: { version: {...} } } }
    this.catalog = {};

    // OTA en progreso: device_id → { requested_at, target_version, previous_version, type }
    this.pendingOtas = new Map();

    // Timers de OTA timeout: device_id → setTimeout handle
    this._otaTimeoutTimers = new Map();

    // Timer de limpieza periódica
    this._cleanupTimer = null;

    // Log de OTAs: [ { device_id, type, from, to, status, timestamp } ]
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

    this.logger.info('module.loading', { module: this.name, version: this.version });

    if (core.config?.['firmware-manager']) {
      this.config = { ...this.config, ...core.config['firmware-manager'] };
    }

    // Validar configuración
    this._validateConfig();

    this.config.data_path = path.resolve(this.config.data_path);

    await this._loadCatalog();
    await this._loadOtaLog();

    // Validar integridad de binarios referenciados en catálogo
    if (this.config.validate_binaries_on_load) {
      await this._validateCatalogIntegrity();
    }

    // Publicar métricas iniciales
    this._publishCatalogMetrics();
    this.metrics.gauge('firmware.pending_otas.count', 0);

    // Timer de limpieza periódica de OTAs huérfanas
    this._cleanupTimer = setInterval(
      () => this._cleanupStaleOtas(),
      this.config.ota_cleanup_interval_ms
    );

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      catalog_types: Object.keys(this.catalog).length,
      data_path: this.config.data_path,
      ota_timeout_ms: this.config.ota_timeout_ms
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Limpiar timer de cleanup
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // Limpiar todos los timers de OTA timeout
    for (const timer of this._otaTimeoutTimers.values()) {
      clearTimeout(timer);
    }
    this._otaTimeoutTimers.clear();

    await this._saveCatalog();
    await this._saveOtaLog();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Validación de configuración
  // ==========================================

  _validateConfig() {
    if (typeof this.config.data_path !== 'string' || !this.config.data_path) {
      this.logger.warn('firmware.config.invalid', {
        field: 'data_path',
        value: this.config.data_path,
        fallback: './data/firmware'
      });
      this.config.data_path = './data/firmware';
    }

    if (typeof this.config.auto_check_on_register !== 'boolean') {
      this.config.auto_check_on_register = true;
    }

    if (typeof this.config.ota_timeout_ms !== 'number' || this.config.ota_timeout_ms < 100) {
      this.logger.warn('firmware.config.invalid', {
        field: 'ota_timeout_ms',
        value: this.config.ota_timeout_ms,
        fallback: 300000
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

  /**
   * Escucha shadow.updated para detectar cambios en reported.firmware.
   * Si hay una OTA pendiente y el firmware reportado coincide → OTA completada.
   * Si difiere → OTA fallida o en progreso.
   */
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
      // OTA completada
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

      this.logger.info('firmware.ota.completed', {
        device_id,
        from: pending.previous_version,
        to: pending.target_version,
        duration_ms: duration
      });

      await this.eventBus.publish('firmware.ota_completed', logEntry);

    } else if (reportedVersion === pending.previous_version) {
      // Firmware no cambió — posible fallo
      // No marcar como fallido inmediatamente, el dispositivo puede estar descargando
    } else {
      // Firmware cambió pero no a la versión esperada — fallo
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

      this.logger.warn('firmware.ota.failed', {
        device_id,
        expected: pending.target_version,
        actual: reportedVersion
      });

      await this.eventBus.publish('firmware.ota_failed', logEntry);
    }
  }

  /**
   * Cuando se registra un nuevo dispositivo, verificar si tiene firmware desactualizado.
   */
  async onDeviceRegistered(event) {
    if (!this.config.auto_check_on_register) return;

    const data = event?.data || event?.payload || event;
    const device = data?.device;
    if (!device || !device.firmware || !device.type) return;

    const typeEntry = this.catalog[device.type];
    if (!typeEntry || !typeEntry.latest) return;

    if (device.firmware !== typeEntry.latest) {
      this.metrics.increment('firmware.device_outdated.total');

      this.logger.info('firmware.device.outdated', {
        device_id: device.device_id,
        current: device.firmware,
        latest: typeEntry.latest,
        type: device.type
      });
    }
  }

  /**
   * Auto-registro de firmware tras build exitoso.
   * Copia el binario a data/firmware/binaries/ y lo registra en el catálogo.
   * Acepta tanto el nuevo campo "driver" como el legacy "project_name".
   */
  async onBuildCompleted(event) {
    const data = event?.data || event?.payload || event;
    const { driver, project_name, board, binary_path, binary_size } = data;

    // Compatibilidad: "driver" (nuevo firmware-builder) o "project_name" (legacy esp32-dev)
    const driverName = driver || project_name;
    if (!driverName || !binary_path) return;

    try {
      await fs.promises.access(binary_path, fs.constants.R_OK);
    } catch (_) {
      this.logger.warn('firmware.auto_register.binary_not_found', {
        driver: driverName, binary_path
      });
      return;
    }

    // Generar nombre y versión para el binario
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${driverName}-${timestamp}.bin`;
    const version = this._timestampToVersion(timestamp);
    const type = driverName;

    // Asegurar que el directorio binaries existe
    const binariesDir = path.join(this.config.data_path, 'binaries');
    await fs.promises.mkdir(binariesDir, { recursive: true });

    // Copiar binario
    const destPath = path.join(binariesDir, fileName);
    await fs.promises.copyFile(binary_path, destPath);

    this.logger.info('firmware.auto_register.copied', {
      driver: driverName, from: binary_path, to: destPath, size: binary_size
    });

    // Registrar en catálogo
    const result = await this.handleRegister({
      type,
      version,
      file: fileName,
      changelog: `Build de driver ${driverName} (${board || 'esp32dev'})`,
      // Pass metadata from builder
      utility: data.utility || '',
      description: data.description || '',
      board: board || 'esp32dev',
      capabilities: data.capabilities || []
    });

    if (result.status === 201) {
      this.logger.info('firmware.auto_register.success', {
        driver: driverName, type, version, file: fileName
      });
    } else {
      this.logger.warn('firmware.auto_register.failed', {
        driver: driverName, error: result.error
      });
    }
  }

  /**
   * Genera una versión semver a partir de un timestamp.
   * Formato: YYYY.M.DDHHMM (ej: 2026.3.231045)
   */
  _timestampToVersion(timestamp) {
    const now = new Date();
    const major = now.getFullYear();
    const minor = now.getMonth() + 1;
    const patch = now.getDate() * 10000 + now.getHours() * 100 + now.getMinutes();
    return `${major}.${minor}.${patch}`;
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  /**
   * Lista el catálogo completo de firmwares.
   */
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

    return {
      status: 200,
      data: { types, total: types.length }
    };
  }

  /**
   * Registrar un nuevo firmware en el catálogo.
   * El binario debe existir en data/firmware/binaries/
   */
  async handleRegister(data) {
    const startTime = Date.now();
    const { type, version, file, changelog, min_version } = data;

    if (!type) return { status: 400, error: 'type requerido (ej: esp32-gateway-printer)' };
    if (!version) return { status: 400, error: 'version requerida (semver)' };
    if (!file) return { status: 400, error: 'file requerido (nombre del .bin)' };

    // Validar formato semver básico
    if (!/^\d+\.\d+\.\d+/.test(version)) {
      return { status: 400, error: 'version debe ser semver (ej: 1.2.3)' };
    }

    const binPath = path.join(this.config.data_path, 'binaries', file);

    // Verificar que el archivo existe y calcular sha256
    let sha256, size;
    try {
      const stat = await fs.promises.stat(binPath);
      size = stat.size;

      const content = await fs.promises.readFile(binPath);
      sha256 = crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { status: 400, error: `Binario no encontrado: ${binPath}` };
      }
      return { status: 500, error: err.message };
    }

    // Registrar en catálogo
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

    // Update metadata if provided (refresh on each build)
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

    this.catalog[type].latest = version;

    this.metrics.increment('firmware.catalog_entries.total');
    this.metrics.timing('firmware.register.duration', Date.now() - startTime);
    this._publishCatalogMetrics();

    await this._saveCatalog();

    this.logger.info('firmware.registered', {
      type, version, file, sha256, size
    });

    await this.eventBus.publish('firmware.registered', { type, version, sha256 });

    return {
      status: 201,
      data: { type, version, sha256, size, latest: this.catalog[type].latest }
    };
  }

  /**
   * Disparar OTA para un dispositivo.
   * Escribe desired.firmware en device-shadow.
   */
  async handleTriggerOta(data) {
    const { device_id, project_id, type, version } = data;

    if (!device_id) return { status: 400, error: 'device_id requerido' };
    if (!type) return { status: 400, error: 'type requerido (tipo de firmware)' };

    const typeEntry = this.catalog[type];
    if (!typeEntry) return { status: 404, error: `Tipo de firmware '${type}' no encontrado en catálogo` };

    const targetVersion = version || typeEntry.latest;
    const release = typeEntry.releases[targetVersion];
    if (!release) return { status: 404, error: `Versión ${targetVersion} no encontrada para ${type}` };

    // Verificar min_version
    if (release.min_version && data.current_version) {
      if (this._compareVersions(data.current_version, release.min_version) < 0) {
        return {
          status: 400,
          error: `La versión mínima para actualizar a ${targetVersion} es ${release.min_version}. Dispositivo tiene ${data.current_version}.`
        };
      }
    }

    // Si ya hay OTA pendiente para este dispositivo, limpiar
    if (this.pendingOtas.has(device_id)) {
      this._clearOtaTimeout(device_id);
      this.pendingOtas.delete(device_id);
      this.logger.warn('firmware.ota.replaced', {
        device_id,
        new_target: targetVersion
      });
    }

    // Construir URL del binario
    const firmwareUrl = `/firmware/${encodeURIComponent(type)}/${encodeURIComponent(targetVersion)}/${encodeURIComponent(release.file)}`;

    // Escribir desired en shadow
    await this.eventBus.publish('shadow.set_desired', {
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
    });

    // Registrar OTA pendiente
    this.pendingOtas.set(device_id, {
      requested_at: new Date().toISOString(),
      target_version: targetVersion,
      previous_version: data.current_version || null,
      type
    });

    this.metrics.increment('firmware.ota_requested.total');
    this.metrics.gauge('firmware.pending_otas.count', this.pendingOtas.size);

    // Programar timeout
    this._scheduleOtaTimeout(device_id);

    this.logger.info('firmware.ota.requested', {
      device_id,
      type,
      target_version: targetVersion,
      sha256: release.sha256,
      timeout_ms: this.config.ota_timeout_ms
    });

    await this.eventBus.publish('firmware.ota_requested', {
      device_id,
      type,
      target_version: targetVersion,
      firmware_url: firmwareUrl,
      timestamp: new Date().toISOString()
    });

    return {
      status: 200,
      data: {
        device_id,
        type,
        target_version: targetVersion,
        firmware_url: firmwareUrl,
        sha256: release.sha256,
        timeout_ms: this.config.ota_timeout_ms
      }
    };
  }

  /**
   * Estado de OTAs pendientes y log reciente.
   */
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

  /**
   * Rollback: escribe la versión anterior como desired.
   */
  async handleRollback(data) {
    const { device_id, project_id, type, target_version } = data;

    if (!device_id) return { status: 400, error: 'device_id requerido' };
    if (!type) return { status: 400, error: 'type requerido' };
    if (!target_version) return { status: 400, error: 'target_version requerido (versión a la que volver)' };

    this.metrics.increment('firmware.rollback.total');

    return this.handleTriggerOta({
      device_id,
      project_id,
      type,
      version: target_version,
      current_version: data.current_version
    });
  }

  /**
   * Listar versiones de firmware por dispositivo.
   */
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

    return {
      status: 200,
      data: { versions, total: versions.length }
    };
  }

  /**
   * Limpiar OTAs pendientes manualmente (para un dispositivo o todas).
   */
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

    this.logger.info('firmware.ota.cleanup.manual', { cleaned });

    return {
      status: 200,
      data: { cleaned, remaining: this.pendingOtas.size }
    };
  }

  /**
   * Actualizar metadatos de un tipo de firmware existente.
   */
  async handleUpdateMeta(data) {
    const { type, utility, description, board, capabilities, projects, docs_url } = data;
    if (!type) return { status: 400, error: 'type requerido' };

    const entry = this.catalog[type];
    if (!entry) return { status: 404, error: `Tipo '${type}' no encontrado` };

    if (utility !== undefined) entry.utility = utility;
    if (description !== undefined) entry.description = description;
    if (board !== undefined) entry.board = board;
    if (capabilities !== undefined) entry.capabilities = capabilities;
    if (projects !== undefined) entry.projects = projects;
    if (docs_url !== undefined) entry.docs_url = docs_url;

    await this._saveCatalog();

    this.logger.info('firmware.meta.updated', { type });

    return { status: 200, data: { type, ...this._getTypeMeta(type) } };
  }

  /**
   * Información detallada de un tipo de firmware.
   */
  async handleGetInfo(data) {
    const { type } = data;
    if (!type) return { status: 400, error: 'type requerido' };

    const entry = this.catalog[type];
    if (!entry) return { status: 404, error: `Tipo '${type}' no encontrado` };

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

  /**
   * Listar firmwares asociados a un proyecto.
   */
  async handleListByProject(data) {
    const { project_id } = data;
    if (!project_id) return { status: 400, error: 'project_id requerido' };

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

  /**
   * HTTP handler: sirve binarios de firmware.
   * GET /firmware/:type/:version/:file
   */
  async handleServeBinary(req) {
    const { type, version, file } = req.params || req;
    const binPath = path.join(this.config.data_path, 'binaries', file);

    this.metrics.increment('firmware.binary_served.total');

    try {
      const content = await fs.promises.readFile(binPath);

      this.metrics.increment('firmware.binary_served.bytes', content.length);

      return {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': content.length,
          'Content-Disposition': `attachment; filename="${file}"`
        },
        body: content
      };
    } catch (err) {
      this.metrics.increment('firmware.binary_served.errors');
      return { status: 404, error: `Firmware binary not found: ${file}` };
    }
  }

  // ==========================================
  // OTA Timeout Management
  // ==========================================

  _scheduleOtaTimeout(device_id) {
    this._clearOtaTimeout(device_id);

    const timer = setTimeout(async () => {
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

      this.logger.warn('firmware.ota.timeout', {
        device_id,
        target_version: pending.target_version,
        timeout_ms: this.config.ota_timeout_ms
      });

      await this.eventBus.publish('firmware.ota_failed', logEntry);
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

  /**
   * Limpieza periódica de OTAs que sobrevivieron al timeout
   * (safety net por si el setTimeout falla o se recarga el módulo)
   */
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
      this.logger.info('firmware.ota.stale_cleanup', { cleaned, remaining: this.pendingOtas.size });
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

      this.logger.info('firmware.catalog.loaded', {
        types: Object.keys(this.catalog).length,
        entries: this._countCatalogEntries()
      });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('firmware.catalog.load_error', { error: err.message });
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
      this.logger.error('firmware.catalog.save_error', { error: err.message });
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
        this.logger.warn('firmware.ota_log.load_error', { error: err.message });
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
      this.logger.error('firmware.ota_log.save_error', { error: err.message });
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

  /**
   * Verifica que cada binario referenciado en el catálogo existe en disco.
   * Reporta warnings pero no elimina entradas — puede ser que el archivo
   * se suba después.
   */
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
      this.logger.warn('firmware.catalog.integrity_check', {
        valid,
        missing,
        missing_files: missingFiles
      });
    } else {
      this.logger.info('firmware.catalog.integrity_check', { valid, missing: 0 });
    }
  }

  // ==========================================
  // Métricas helpers
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

  // ==========================================
  // Utilidades
  // ==========================================

  /**
   * Obtener metadatos de un tipo de firmware.
   */
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

  /**
   * Comparación simple de versiones semver.
   * Retorna: -1 si a < b, 0 si a == b, 1 si a > b
   */
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
}

module.exports = FirmwareManagerModule;
