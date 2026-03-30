/**
 * GatewayTCP — Traduce MQTT→TCP socket.
 *
 * Para impresoras de red (puerto 9100), CNC, displays IP.
 * Autodescubrimiento via escaneo de puertos conocidos en red local.
 *
 * Reutiliza: services/providers/local/perifericos/transportes/tcp.js
 */

const GatewayBase = require('../base');
const net = require('net');

class GatewayTCP extends GatewayBase {
  constructor(config, deps) {
    super('tcp', config, deps);
    this.scanPorts = config.scan_ports || [9100];
    this.scanSubnet = config.scan_subnet || null; // auto-detect if null
  }

  _getProtocol() {
    return 'tcp';
  }

  async _createTransport(deviceConfig) {
    try {
      const TransporteTCP = require('../../../services/providers/local/perifericos/transportes/tcp');
      return new TransporteTCP({
        host: deviceConfig.host || deviceConfig.ip,
        puerto: deviceConfig.port || deviceConfig.puerto || 9100,
        timeout_conexion: deviceConfig.timeout || 5000
      }, this.logger);
    } catch (err) {
      this.logger.warn('gateway.tcp.transport_load_error', { error: err.message });
      return null;
    }
  }

  /**
   * Descubrir dispositivos TCP escaneando puertos conocidos en la red local.
   * Escaneo rápido: intenta conectar a puerto 9100 en IPs del rango local.
   */
  async _discoverDevices() {
    if (!this.config.autodiscovery) return [];

    const subnet = this.scanSubnet || this._detectSubnet();
    if (!subnet) {
      this.logger.info('gateway.tcp.autodiscovery.no_subnet');
      return [];
    }

    this.logger.info('gateway.tcp.autodiscovery.scanning', {
      subnet,
      ports: this.scanPorts
    });

    const found = [];
    const scanPromises = [];

    // Escanear rango .1 a .254
    for (let i = 1; i <= 254; i++) {
      const host = `${subnet}.${i}`;
      for (const port of this.scanPorts) {
        scanPromises.push(
          this._probeHost(host, port).then(result => {
            if (result) found.push(result);
          })
        );
      }
    }

    // Ejecutar en batches de 50 para no saturar
    const batchSize = 50;
    for (let i = 0; i < scanPromises.length; i += batchSize) {
      await Promise.all(scanPromises.slice(i, i + batchSize));
    }

    this.logger.info('gateway.tcp.autodiscovery.completed', {
      found: found.length
    });

    return found;
  }

  /**
   * Intenta conectar a un host:port con timeout corto.
   */
  _probeHost(host, port) {
    return new Promise(resolve => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(null);
      }, 1000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          device_id: `tcp-${host.replace(/\./g, '-')}-${port}`,
          host,
          port,
          type: port === 9100 ? 'impresora-termica' : 'unknown',
          capabilities: port === 9100 ? ['imprimir'] : ['status'],
          metadata: { ip: host, puerto: port }
        });
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Detecta el subnet del servidor a partir de las interfaces de red.
   * Retorna los primeros 3 octetos (ej: "192.168.1").
   */
  _detectSubnet() {
    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const iface of Object.values(interfaces)) {
        for (const addr of iface) {
          if (addr.family === 'IPv4' && !addr.internal && addr.address.startsWith('192.168.')) {
            const parts = addr.address.split('.');
            return `${parts[0]}.${parts[1]}.${parts[2]}`;
          }
        }
      }
    } catch {}
    return null;
  }
}

module.exports = GatewayTCP;
