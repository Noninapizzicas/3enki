/**
 * gateway-manager v2.0.0 — Reescrito al canon (POC2 #6 del horizontal).
 *
 * Ciclo de vida de gateways software que traducen MQTT a protocolos nativos
 * (TCP, BLE, USB, CMD). Un gateway es un "ESP32 virtual" — desde el servidor
 * es indistinguible de un ESP32 real (mismo contrato MQTT: birth, status,
 * command, ack).
 *
 * Sub-piezas:
 *  - base.js: GatewayBase abstracto (contrato MQTT + lifecycle compartido).
 *  - gateways/{tcp,ble,usb,cmd}.js: implementaciones por protocolo.
 *  - index.js (este archivo): manager que arranca/para gateways segun config
 *    y expone UI handlers + eventos al bus.
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers UI devuelven { status, data | error: { code, message } }.
 *    Metodos privados lanzan con _code canonico.
 *  - observability: log + metric en cada error path. Prefix gateway-manager.*.
 *  - events: 5 eventos canonicos preservados invariantes (4 emitidos +
 *    gateway.device_lost como extension point para device-shadow).
 *    correlation_id propagado.
 *  - lifecycle: onLoad arranca gateways, onUnload limpia (gateways.clear +
 *    metrics reset).
 *  - persistence: in-memory unicamente (gateways viven solo en memoria).
 *  - resilience: si MQTT no disponible warn + return graceful sin crash.
 *
 * 5 helpers POC2 transferibles:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar especifico _instantiateGateway.
 *
 * Monolito (311 LOC) preservado en
 * arquitectura/migracion/_legacy/gateway-manager-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/gateway-manager-mapa.md
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

const GatewayTCP = require('./gateways/tcp');
const GatewayBLE = require('./gateways/ble');
const GatewayUSB = require('./gateways/usb');
const GatewayCMD = require('./gateways/cmd');

const GATEWAY_TYPES = {
  tcp: GatewayTCP,
  ble: GatewayBLE,
  usb: GatewayUSB,
  cmd: GatewayCMD
};

const VALID_TYPES = Object.keys(GATEWAY_TYPES);

const DEFAULT_CONFIG = {
  tcp: { enabled: false, autodiscovery: true, manual_devices: [] },
  ble: { enabled: false, autodiscovery: false, manual_devices: [] },
  usb: { enabled: false, autodiscovery: false, manual_devices: [] },
  cmd: { enabled: false, autodiscovery: false, manual_devices: [] }
};

class GatewayManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'gateway-manager';
    this.version = '2.0.0';

    this.config = { gateways: { ...DEFAULT_CONFIG } };

    this.gateways = new Map();

    this.internalMetrics = {
      started_total: 0,
      devices_found_total: 0,
      commands_processed_total: 0,
      errors_total: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    const correlation_id = crypto.randomUUID();
    this.logger.info('gateway-manager.loading', {
      module: this.name, version: this.version, correlation_id
    });

    if (core.config?.['gateway-manager']?.gateways) {
      this.config.gateways = { ...this.config.gateways, ...core.config['gateway-manager'].gateways };
    }
    if (core.config?.gateways) {
      this.config.gateways = { ...this.config.gateways, ...core.config.gateways };
    }

    await this._startEnabledGateways(correlation_id);

    this.logger.info('gateway-manager.loaded', {
      active_gateways: this.gateways.size,
      types: Array.from(this.gateways.keys()),
      correlation_id
    });
  }

  async onUnload() {
    const correlation_id = crypto.randomUUID();
    this.logger.info('gateway-manager.unloading', {
      gateways_to_stop: this.gateways.size, correlation_id
    });

    const entries = Array.from(this.gateways.entries());
    this.gateways.clear();
    for (const [type, gateway] of entries) {
      await this._stopGateway(type, gateway, correlation_id);
    }

    this.internalMetrics = {
      started_total: 0,
      devices_found_total: 0,
      commands_processed_total: 0,
      errors_total: 0
    };
  }

  async _stopGateway(type, gateway, correlation_id) {
    try {
      await gateway.stop();
      await this._publicarEvento('gateway.stopped', { type }, { correlation_id });
    } catch (err) {
      this.logger.error('gateway-manager.stop.failed', {
        type, error: err.message, correlation_id
      });
      this.metrics?.increment('gateway-manager.errors', { kind: 'stop', type });
      this.internalMetrics.errors_total++;
    }
  }

  // ==========================================
  // Gateway lifecycle (privados, lanzan con _code canonico)
  // ==========================================

  async _startEnabledGateways(correlation_id) {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('gateway-manager.mqtt.not_available', {
        nota: 'MQTT no disponible — no se pueden arrancar gateways',
        correlation_id
      });
      this.metrics?.increment('gateway-manager.errors', { kind: 'mqtt_not_available' });
      return;
    }

    for (const [type, gatewayConfig] of Object.entries(this.config.gateways)) {
      if (!gatewayConfig.enabled) continue;
      await this._tryStartGateway(type, gatewayConfig, mqtt, correlation_id);
    }
  }

  async _tryStartGateway(type, gatewayConfig, mqtt, correlation_id) {
    const GatewayClass = GATEWAY_TYPES[type];
    if (!GatewayClass) {
      this.logger.warn('gateway-manager.unknown_type', { type, correlation_id });
      this.metrics?.increment('gateway-manager.errors', { kind: 'unknown_type' });
      return;
    }

    try {
      const gateway = await this._instantiateGateway(GatewayClass, gatewayConfig, mqtt);
      await gateway.start();

      this.gateways.set(type, gateway);
      this.internalMetrics.started_total++;
      this.internalMetrics.devices_found_total += gateway.metrics.devices_found;

      this.logger.info('gateway-manager.gateway.started', {
        type, devices: gateway.devices.size, correlation_id
      });
      this.metrics?.increment('gateway-manager.gateway.started', { type });

      await this._publicarEvento('gateway.started', {
        type, devices_count: gateway.devices.size
      }, { correlation_id });

      await this._publishDeviceFoundEvents(type, gateway, correlation_id);
    } catch (err) {
      this.internalMetrics.errors_total++;
      this.logger.error('gateway-manager.gateway.start.failed', {
        type, error: err.message, correlation_id
      });
      this.metrics?.increment('gateway-manager.errors', { kind: 'start', type });

      await this._publicarEvento('gateway.error', {
        type, error: err.message
      }, { correlation_id });
    }
  }

  async _publishDeviceFoundEvents(type, gateway, correlation_id) {
    for (const [deviceId, entry] of gateway.devices) {
      await this._publicarEvento('gateway.device_found', {
        device_id: deviceId,
        gateway_type: type,
        device_type: entry.type,
        capabilities: entry.capabilities
      }, { correlation_id });
    }
  }

  async _restartGateway(type, correlation_id) {
    if (!VALID_TYPES.includes(type)) {
      throw Object.assign(new Error(`Gateway type not supported: ${type}`),
        { _code: 'INVALID_INPUT',
          _details: { kind: 'domain', field: 'type', allowed: VALID_TYPES } });
    }

    const gatewayConfig = this.config.gateways[type];
    if (!gatewayConfig) {
      throw Object.assign(new Error(`Gateway type not configured: ${type}`),
        { _code: 'RESOURCE_NOT_FOUND',
          _details: { entity_type: 'gateway_config', entity_id: type } });
    }

    const mqtt = this.eventBus?.mqtt;
    if (!mqtt?.isConnected) {
      throw Object.assign(new Error('MQTT not available'),
        { _code: 'UPSTREAM_UNREACHABLE',
          _details: { upstream: 'mqtt', state: 'disconnected' } });
    }

    const existing = this.gateways.get(type);
    if (existing) {
      this.gateways.delete(type);
      try { await existing.stop(); } catch (err) {
        this.logger.warn('gateway-manager.restart.stop_failed', {
          type, error: err.message, correlation_id
        });
      }
    }

    const GatewayClass = GATEWAY_TYPES[type];
    const gateway = await this._instantiateGateway(GatewayClass, gatewayConfig, mqtt);
    await gateway.start();
    this.gateways.set(type, gateway);

    this.metrics?.increment('gateway-manager.gateway.restarted', { type });
    return { type, devices: gateway.devices.size };
  }

  async _discoverGateway(type) {
    if (!VALID_TYPES.includes(type)) {
      throw Object.assign(new Error(`Gateway type not supported: ${type}`),
        { _code: 'INVALID_INPUT',
          _details: { kind: 'domain', field: 'type', allowed: VALID_TYPES } });
    }

    const mqtt = this.eventBus?.mqtt;
    if (!mqtt?.isConnected) {
      throw Object.assign(new Error('MQTT not available'),
        { _code: 'UPSTREAM_UNREACHABLE',
          _details: { upstream: 'mqtt', state: 'disconnected' } });
    }

    const GatewayClass = GATEWAY_TYPES[type];
    const tempConfig = { autodiscovery: true, ...this.config.gateways[type] };
    const tempGateway = await this._instantiateGateway(GatewayClass, tempConfig, mqtt);

    const devices = await tempGateway._discoverDevices();
    return { type, devices, count: devices.length };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleList() {
    try {
      const gateways = [];
      for (const [type, gwConfig] of Object.entries(this.config.gateways)) {
        const running = this.gateways.get(type);
        gateways.push({
          type,
          enabled: gwConfig.enabled || false,
          running: !!running,
          ...(running ? running.getInfo() : { devices_count: 0 })
        });
      }
      return {
        status: 200,
        data: {
          gateways,
          active: this.gateways.size,
          total_configured: Object.keys(this.config.gateways).length
        }
      };
    } catch (err) {
      return this._handleHandlerError('gateway-manager.ui.list.failed', err, 'ui_list');
    }
  }

  async handleStatus(data) {
    try {
      const { type } = data || {};
      if (!type) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Gateway type is required',
          { kind: 'domain', field: 'type', allowed: VALID_TYPES });
      }
      if (!VALID_TYPES.includes(type)) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `Gateway type not supported: ${type}`,
          { kind: 'domain', field: 'type', allowed: VALID_TYPES });
      }

      const gateway = this.gateways.get(type);
      if (!gateway) {
        return {
          status: 200,
          data: {
            type,
            running: false,
            enabled: this.config.gateways[type]?.enabled || false
          }
        };
      }
      return { status: 200, data: gateway.getInfo() };
    } catch (err) {
      return this._handleHandlerError('gateway-manager.ui.status.failed', err, 'ui_status');
    }
  }

  async handleRestart(data) {
    try {
      const { type } = data || {};
      if (!type) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Gateway type is required',
          { kind: 'domain', field: 'type', allowed: VALID_TYPES });
      }
      const result = await this._restartGateway(type, crypto.randomUUID());
      return {
        status: 200,
        data: { type: result.type, restarted: true, devices: result.devices }
      };
    } catch (err) {
      return this._handleHandlerError('gateway-manager.ui.restart.failed', err, 'ui_restart');
    }
  }

  async handleDiscover(data) {
    try {
      const { type } = data || {};
      if (!type) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Gateway type is required',
          { kind: 'domain', field: 'type', allowed: VALID_TYPES });
      }
      const result = await this._discoverGateway(type);
      return {
        status: 200,
        data: result
      };
    } catch (err) {
      return this._handleHandlerError('gateway-manager.ui.discover.failed', err, 'ui_discover');
    }
  }

  // ==========================================
  // Helpers POC2 (transferibles) + auxiliares
  // ==========================================

  // Helpers POC2 (_errorResponse, _classifyHandlerError, _publicarEvento)
  // heredados de BaseModule. Override de _handleHandlerError solo para
  // incrementar el contador interno operacional propio.

  _handleHandlerError(logEvent, err, kind) {
    const result = super._handleHandlerError(logEvent, err, kind);
    this.internalMetrics.errors_total++;
    return result;
  }

  async _instantiateGateway(GatewayClass, gatewayConfig, mqtt) {
    return new GatewayClass(gatewayConfig, {
      mqtt,
      eventBus: this.eventBus,
      logger: this.logger
    });
  }
}

module.exports = GatewayManagerModule;
