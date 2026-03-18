/**
 * Transporte BLE Directo — Bluetooth vía rfcomm en Termux/Linux
 *
 * Escribe datos directamente a /dev/rfcommN. Requiere:
 *   - bluetoothctl → pair <MAC>
 *   - rfcomm bind 0 <MAC> 1
 *
 * Config esperada:
 *   { dispositivo: '/dev/rfcomm0', mac: 'AA:BB:CC:DD:EE:FF', rfcomm_canal: 1 }
 *
 * Migrado desde modules/pizzepos/impresion/transporte.js (modo "dispositivo")
 */

const fs = require('fs');
const { execSync } = require('child_process');
const TransporteBase = require('./base');
const { ESTADO } = require('./base');

class TransporteBLE extends TransporteBase {
  constructor(config, logger) {
    super('ble-directo', config, logger);
    this.config = {
      dispositivo: '/dev/rfcomm0',
      mac: null,
      rfcomm_canal: 1,
      ...config
    };
  }

  async conectar() {
    this.estado = ESTADO.CONECTANDO;

    try {
      await this._prepararRfcomm();
      this.estado = ESTADO.CONECTADO;
      this.logger.info('transporte.ble.conectado', {
        dispositivo: this.config.dispositivo
      });
      return { ok: true };
    } catch (error) {
      this.estado = ESTADO.ERROR;
      this.logger.error('transporte.ble.error', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  async enviar(datos, opciones) {
    const buffer = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'binary');
    const { dispositivo } = this.config;

    if (this.estado !== ESTADO.CONECTADO) {
      const result = await this.conectar();
      if (!result.ok) {
        return { ok: false, error: `No conectado: ${result.error}` };
      }
    }

    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(dispositivo, { flags: 'a' });

      stream.on('error', (err) => {
        this.estado = ESTADO.ERROR;
        reject({ ok: false, error: `Error escribiendo a ${dispositivo}: ${err.message}` });
      });

      stream.write(buffer, () => {
        stream.end(() => {
          this.logger.debug('transporte.ble.enviado', { bytes: buffer.length });
          resolve({ ok: true, bytes: buffer.length });
        });
      });
    });
  }

  async getEstado() {
    return {
      conectado: this.estado === ESTADO.CONECTADO,
      tipo: this.tipo,
      estado: this.estado,
      info: {
        dispositivo: this.config.dispositivo,
        mac: this.config.mac
      }
    };
  }

  async desconectar() {
    this.estado = ESTADO.DESCONECTADO;
    this.logger.info('transporte.ble.desconectado');
  }

  // --- Internal ---

  async _prepararRfcomm() {
    const { mac, dispositivo, rfcomm_canal } = this.config;

    if (fs.existsSync(dispositivo)) {
      this.logger.info('transporte.ble.rfcomm.existe', { dispositivo });
      return;
    }

    if (!mac) {
      throw new Error(
        `No existe ${dispositivo} y no se proporcionó MAC para rfcomm bind. ` +
        `Ejecuta manualmente: rfcomm bind 0 <MAC> ${rfcomm_canal}`
      );
    }

    const match = dispositivo.match(/rfcomm(\d+)/);
    const devNum = match ? match[1] : '0';

    try {
      this.logger.info('transporte.ble.rfcomm.bind', { mac, canal: rfcomm_canal, dev: devNum });
      execSync(`rfcomm bind ${devNum} ${mac} ${rfcomm_canal}`, { timeout: 5000 });
      await this._esperarDispositivo(dispositivo, 3000);
    } catch (error) {
      throw new Error(
        `Error al hacer rfcomm bind: ${error.message}. ` +
        `Verifica que el dispositivo está emparejado y bluetooth-utils instalado.`
      );
    }
  }

  async _esperarDispositivo(ruta, timeoutMs) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      if (fs.existsSync(ruta)) return;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!fs.existsSync(ruta)) {
      throw new Error(`Timeout esperando ${ruta}`);
    }
  }
}

module.exports = TransporteBLE;
