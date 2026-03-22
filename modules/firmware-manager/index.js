/**
 * Módulo Firmware Manager v1.0.0
 *
 * Gestión de firmwares, versionado, y orquestación de OTA.
 *
 * Responsabilidades:
 *   - Catálogo de firmwares: tipo, versión, sha256, changelog
 *   - Servir binarios por HTTP: GET /firmware/:type/:version/:file
 *   - Orquestar OTA via device-shadow (escribe desired.firmware)
 *   - Trackear progreso: escucha shadow.updated para detectar reported.firmware
 *   - Rollback: re-escribe desired con versión anterior
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
    this.version = '1.0.0';

    // Dependencias
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      data_path: './data/firmware',
      auto_check_on_register: true
    };

    // Catálogo de firmwares: { tipo: { latest, releases: { version: {...} } } }
    this.catalog = {};

    // OTA en progreso: device_id → { requested_at, target_version, previous_version, type }
    this.pendingOtas = new Map();

    // Log de OTAs: [ { device_id, type, from, to, status, timestamp } ]
    this.otaLog = [];
    this.maxOtaLog = 500;

    // Métricas
    this.internalMetrics = {
      ota_requested_total: 0,
      ota_completed_total: 0,
      ota_failed_total: 0,
      catalog_entries_total: 0
    };
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

    this.config.data_path = path.resolve(this.config.data_path);

    await this._loadCatalog();
    await this._loadOtaLog();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      catalog_types: Object.keys(this.catalog).length,
      data_path: this.config.data_path
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    await this._saveCatalog();
    await this._saveOtaLog();
    this.logger.info('module.unloaded', { module: this.name });
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
      this.pendingOtas.delete(device_id);
      this.internalMetrics.ota_completed_total++;

      const logEntry = {
        device_id,
        type: pending.type,
        from: pending.previous_version,
        to: pending.target_version,
        status: 'completed',
        requested_at: pending.requested_at,
        completed_at: new Date().toISOString()
      };

      this._addOtaLog(logEntry);

      this.logger.info('firmware.ota.completed', {
        device_id,
        from: pending.previous_version,
        to: pending.target_version
      });

      await this.eventBus.publish('firmware.ota_completed', logEntry);

    } else if (reportedVersion === pending.previous_version) {
      // Firmware no cambió — posible fallo
      // No marcar como fallido inmediatamente, el dispositivo puede estar descargando
    } else {
      // Firmware cambió pero no a la versión esperada — fallo
      this.pendingOtas.delete(device_id);
      this.internalMetrics.ota_failed_total++;

      const logEntry = {
        device_id,
        type: pending.type,
        from: pending.previous_version,
        to: pending.target_version,
        actual: reportedVersion,
        status: 'failed',
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
      this.logger.info('firmware.device.outdated', {
        device_id: device.device_id,
        current: device.firmware,
        latest: typeEntry.latest,
        type: device.type
      });
    }
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
      types.push({
        type,
        latest: entry.latest,
        releases_count: Object.keys(entry.releases).length,
        releases: Object.keys(entry.releases)
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
    const { type, version, file, changelog, min_version } = data;

    if (!type) return { status: 400, error: 'type requerido (ej: esp32-gateway-printer)' };
    if (!version) return { status: 400, error: 'version requerida (semver)' };
    if (!file) return { status: 400, error: 'file requerido (nombre del .bin)' };

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
      this.catalog[type] = { latest: version, releases: {} };
    }

    this.catalog[type].releases[version] = {
      file,
      sha256,
      size,
      date: new Date().toISOString(),
      changelog: changelog || null,
      min_version: min_version || null
    };

    this.catalog[type].latest = version;
    this.internalMetrics.catalog_entries_total++;

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

    this.internalMetrics.ota_requested_total++;

    this.logger.info('firmware.ota.requested', {
      device_id,
      type,
      target_version: targetVersion,
      sha256: release.sha256
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
        sha256: release.sha256
      }
    };
  }

  /**
   * Estado de OTAs pendientes y log reciente.
   */
  async handleOtaStatus(data) {
    const pending = [];
    for (const [deviceId, ota] of this.pendingOtas) {
      if (!data?.device_id || data.device_id === deviceId) {
        pending.push({ device_id: deviceId, ...ota });
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

    // Reutilizar la lógica de trigger
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

    // Recorrer OTA log para construir historial por dispositivo
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
   * HTTP handler: sirve binarios de firmware.
   * GET /firmware/:type/:version/:file
   */
  async handleServeBinary(req) {
    const { type, version, file } = req.params || req;
    const binPath = path.join(this.config.data_path, 'binaries', file);

    try {
      const content = await fs.promises.readFile(binPath);
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
      return { status: 404, error: `Firmware binary not found: ${file}` };
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

      // Contar entradas
      let count = 0;
      for (const type of Object.values(this.catalog)) {
        count += Object.keys(type.releases || {}).length;
      }
      this.internalMetrics.catalog_entries_total = count;

      this.logger.info('firmware.catalog.loaded', {
        types: Object.keys(this.catalog).length,
        entries: count
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
        _version: '1.0.0',
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
  // Utilidades
  // ==========================================

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
