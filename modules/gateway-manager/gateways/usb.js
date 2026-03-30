/**
 * GatewayUSB — Traduce MQTT→USB.
 *
 * Para impresoras USB conectadas directamente al servidor o PC.
 * Detecta dispositivos via /dev/usb/lp* y lsusb.
 */

const GatewayBase = require('../base');
const fs = require('fs');

class GatewayUSB extends GatewayBase {
  constructor(config, deps) {
    super('usb', config, deps);
  }

  _getProtocol() {
    return 'usb';
  }

  async _createTransport(deviceConfig) {
    // Transporte USB simple: escribe directo al device file
    const devicePath = deviceConfig.path || deviceConfig.dispositivo || '/dev/usb/lp0';
    return {
      tipo: 'usb',
      _devicePath: devicePath,
      estado: 'desconectado',

      async conectar() {
        try {
          await fs.promises.access(devicePath, fs.constants.W_OK);
          this.estado = 'conectado';
          return { ok: true };
        } catch (err) {
          this.estado = 'error';
          return { ok: false, error: `No se puede acceder a ${devicePath}: ${err.message}` };
        }
      },

      async enviar(datos) {
        const buffer = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'binary');
        try {
          await fs.promises.writeFile(devicePath, buffer);
          return { ok: true, bytes: buffer.length };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },

      async getEstado() {
        return {
          conectado: this.estado === 'conectado',
          tipo: 'usb',
          estado: this.estado,
          info: { path: devicePath }
        };
      },

      async desconectar() {
        this.estado = 'desconectado';
      }
    };
  }

  /**
   * Autodescubrimiento USB: busca /dev/usb/lp* devices.
   */
  async _discoverDevices() {
    if (!this.config.autodiscovery) return [];

    const found = [];

    try {
      const entries = await fs.promises.readdir('/dev/usb/').catch(() => []);
      for (const entry of entries) {
        if (entry.startsWith('lp')) {
          const devicePath = `/dev/usb/${entry}`;
          found.push({
            device_id: `usb-${entry}`,
            path: devicePath,
            type: 'impresora-termica',
            capabilities: ['imprimir'],
            metadata: { usb_path: devicePath }
          });
        }
      }
    } catch {
      // /dev/usb/ no existe — no hay dispositivos USB
    }

    this.logger.info('gateway.usb.autodiscovery.completed', { found: found.length });
    return found;
  }
}

module.exports = GatewayUSB;
