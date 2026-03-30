/**
 * Módulo Gateway Manager v1.0.0
 *
 * Gestiona el ciclo de vida de gateways software que traducen MQTT a
 * protocolos nativos (TCP, BLE, USB, CMD).
 *
 * Un gateway es un "ESP32 virtual" — desde el servidor es indistinguible
 * de un ESP32 real. Mismo contrato MQTT: birth, status, command, ack.
 *
 * Arranca gateways según config del proyecto:
 *   config.json → gateways.tcp.enabled = true → GatewayTCP arranca
 *
 * Cada gateway:
 *   1. Autodescubre dispositivos de su protocolo
 *   2. Publica birth message por cada dispositivo encontrado
 *   3. Se suscribe a topics de comando MQTT
 *   4. Traduce comando MQTT → protocolo nativo → publica ACK
 *
 * Tier: tier_2_platform (carga antes que módulos de dominio)
 */

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

class GatewayManagerModule {
  constructor() {
    this.name = 'gateway-manager';
    this.version = '1.0.0';

    // Dependencias
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      gateways: {
        tcp: { enabled: false, autodiscovery: true, manual_devices: [] },
        ble: { enabled: false, autodiscovery: false, manual_devices: [] },
        usb: { enabled: false, autodiscovery: false, manual_devices: [] },
        cmd: { enabled: false, autodiscovery: false, manual_devices: [] }
      }
    };

    // Gateways activos: type → GatewayBase instance
    this.gateways = new Map();

    // Métricas
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
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Merge config
    if (core.config?.['gateway-manager']?.gateways) {
      this.config.gateways = { ...this.config.gateways, ...core.config['gateway-manager'].gateways };
    }
    // Compatibilidad: config puede estar en core.config.gateways directamente
    if (core.config?.gateways) {
      this.config.gateways = { ...this.config.gateways, ...core.config.gateways };
    }

    // Arrancar gateways habilitados
    await this._startEnabledGateways();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      active_gateways: this.gateways.size,
      types: Array.from(this.gateways.keys())
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    for (const [type, gateway] of this.gateways) {
      try {
        await gateway.stop();
        await this.eventBus.publish('gateway.stopped', {
          type,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        this.logger.error('gateway-manager.stop_error', { type, error: err.message });
      }
    }

    this.gateways.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Gateway lifecycle
  // ==========================================

  async _startEnabledGateways() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('gateway-manager.mqtt.not_available', {
        nota: 'MQTT no disponible — no se pueden arrancar gateways'
      });
      return;
    }

    for (const [type, gatewayConfig] of Object.entries(this.config.gateways)) {
      if (!gatewayConfig.enabled) continue;

      const GatewayClass = GATEWAY_TYPES[type];
      if (!GatewayClass) {
        this.logger.warn('gateway-manager.unknown_type', { type });
        continue;
      }

      try {
        const gateway = new GatewayClass(gatewayConfig, {
          mqtt,
          eventBus: this.eventBus,
          logger: this.logger
        });

        await gateway.start();
        this.gateways.set(type, gateway);
        this.internalMetrics.started_total++;
        this.internalMetrics.devices_found_total += gateway.metrics.devices_found;

        this.logger.info('gateway-manager.gateway.started', {
          type,
          devices: gateway.devices.size
        });

        await this.eventBus.publish('gateway.started', {
          type,
          devices_count: gateway.devices.size,
          timestamp: new Date().toISOString()
        });

        // Emitir evento por cada dispositivo encontrado
        for (const [deviceId, entry] of gateway.devices) {
          await this.eventBus.publish('gateway.device_found', {
            device_id: deviceId,
            gateway_type: type,
            device_type: entry.type,
            capabilities: entry.capabilities,
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        this.internalMetrics.errors_total++;
        this.logger.error('gateway-manager.gateway.start_error', {
          type,
          error: err.message
        });

        await this.eventBus.publish('gateway.error', {
          type,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  async _restartGateway(type) {
    const existing = this.gateways.get(type);
    if (existing) {
      await existing.stop();
      this.gateways.delete(type);
    }

    const gatewayConfig = this.config.gateways[type];
    if (!gatewayConfig) return { success: false, error: `Tipo ${type} no existe en config` };

    const GatewayClass = GATEWAY_TYPES[type];
    if (!GatewayClass) return { success: false, error: `Tipo ${type} no soportado` };

    const mqtt = this.eventBus?.mqtt;
    if (!mqtt?.isConnected) return { success: false, error: 'MQTT no disponible' };

    const gateway = new GatewayClass(gatewayConfig, {
      mqtt,
      eventBus: this.eventBus,
      logger: this.logger
    });

    await gateway.start();
    this.gateways.set(type, gateway);

    return { success: true, devices: gateway.devices.size };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleList() {
    const gateways = [];

    for (const [type, config] of Object.entries(this.config.gateways)) {
      const running = this.gateways.get(type);
      gateways.push({
        type,
        enabled: config.enabled || false,
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
  }

  async handleStatus(data) {
    if (!data?.type) return { status: 400, error: 'type requerido (tcp, ble, usb, cmd)' };

    const gateway = this.gateways.get(data.type);
    if (!gateway) {
      return {
        status: 200,
        data: {
          type: data.type,
          running: false,
          enabled: this.config.gateways[data.type]?.enabled || false
        }
      };
    }

    return { status: 200, data: gateway.getInfo() };
  }

  async handleRestart(data) {
    if (!data?.type) return { status: 400, error: 'type requerido (tcp, ble, usb, cmd)' };

    try {
      const result = await this._restartGateway(data.type);
      if (!result.success) return { status: 500, error: result.error };

      return {
        status: 200,
        data: {
          type: data.type,
          restarted: true,
          devices: result.devices
        }
      };
    } catch (err) {
      return { status: 500, error: err.message };
    }
  }

  async handleDiscover(data) {
    if (!data?.type) return { status: 400, error: 'type requerido (tcp, ble, usb, cmd)' };

    const GatewayClass = GATEWAY_TYPES[data.type];
    if (!GatewayClass) return { status: 400, error: `Tipo ${data.type} no soportado` };

    const mqtt = this.eventBus?.mqtt;
    if (!mqtt?.isConnected) return { status: 500, error: 'MQTT no disponible' };

    try {
      const tempGateway = new GatewayClass(
        { autodiscovery: true, ...this.config.gateways[data.type] },
        { mqtt, eventBus: this.eventBus, logger: this.logger }
      );

      const devices = await tempGateway._discoverDevices();

      return {
        status: 200,
        data: {
          type: data.type,
          discovered: devices,
          count: devices.length
        }
      };
    } catch (err) {
      return { status: 500, error: err.message };
    }
  }
}

module.exports = GatewayManagerModule;
