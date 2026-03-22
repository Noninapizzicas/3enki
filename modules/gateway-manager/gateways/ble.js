/**
 * GatewayBLE — Traduce MQTT→BLE/rfcomm.
 *
 * Para impresoras Bluetooth directas cuando NO hay ESP32 como bridge.
 * Útil en Termux (Android) o Linux con dongle BT.
 *
 * Reutiliza: services/providers/local/perifericos/transportes/ble.js
 */

const GatewayBase = require('../base');

class GatewayBLE extends GatewayBase {
  constructor(config, deps) {
    super('ble', config, deps);
  }

  _getProtocol() {
    return 'ble';
  }

  async _createTransport(deviceConfig) {
    try {
      const TransporteBLE = require('../../../services/providers/local/perifericos/transportes/ble');
      return new TransporteBLE({
        dispositivo: deviceConfig.device || deviceConfig.dispositivo,
        mac: deviceConfig.mac
      }, this.logger);
    } catch (err) {
      this.logger.warn('gateway.ble.transport_load_error', { error: err.message });
      return null;
    }
  }

  /**
   * Autodescubrimiento BLE: intenta ejecutar bluetoothctl para listar paired devices.
   * Filtro: dispositivos con nombre que sugiera impresora.
   */
  async _discoverDevices() {
    if (!this.config.autodiscovery) return [];

    try {
      const { execSync } = require('child_process');
      const output = execSync('bluetoothctl devices', {
        timeout: 5000,
        encoding: 'utf8'
      });

      const found = [];
      const printerKeywords = ['printer', 'pos', 'thermal', 'nt-', 'netum', 'xprinter'];

      for (const line of output.split('\n')) {
        const match = line.match(/^Device\s+([0-9A-F:]+)\s+(.+)$/i);
        if (!match) continue;

        const [, mac, name] = match;
        const lowerName = name.toLowerCase();
        const isPrinter = printerKeywords.some(kw => lowerName.includes(kw));

        if (isPrinter) {
          found.push({
            device_id: `ble-${mac.replace(/:/g, '-').toLowerCase()}`,
            mac,
            name,
            type: 'impresora-termica',
            capabilities: ['imprimir'],
            metadata: { mac, bluetooth_name: name }
          });
        }
      }

      this.logger.info('gateway.ble.autodiscovery.completed', { found: found.length });
      return found;
    } catch (err) {
      this.logger.info('gateway.ble.autodiscovery.not_available', { error: err.message });
      return [];
    }
  }
}

module.exports = GatewayBLE;
