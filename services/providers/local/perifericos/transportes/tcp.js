/**
 * Transporte TCP — Socket TCP directo al dispositivo
 *
 * Para impresoras de red, CNC con puerto TCP, cualquier dispositivo IP.
 *
 * Config esperada:
 *   { host: '192.168.1.50', puerto: 9100 }
 *
 * Migrado desde modules/pizzepos/impresion/transporte.js (modo "tcp")
 */

const net = require('net');
const TransporteBase = require('./base');
const { ESTADO } = require('./base');

class TransporteTCP extends TransporteBase {
  constructor(config, logger) {
    super('tcp', config, logger);
    this.config = {
      host: '127.0.0.1',
      puerto: 9100,
      timeout_conexion: 5000,
      ...config
    };
    this.socket = null;
  }

  async conectar() {
    this.estado = ESTADO.CONECTANDO;
    const { host, puerto, timeout_conexion } = this.config;

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      const timeout = setTimeout(() => {
        this.socket.destroy();
        this.estado = ESTADO.ERROR;
        const err = `Timeout conectando a ${host}:${puerto}`;
        this.logger.error('transporte.tcp.timeout', { host, puerto });
        resolve({ ok: false, error: err });
      }, timeout_conexion);

      this.socket.connect(puerto, host, () => {
        clearTimeout(timeout);
        this.estado = ESTADO.CONECTADO;
        this.logger.info('transporte.tcp.conectado', { host, puerto });
        resolve({ ok: true });
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeout);
        this.estado = ESTADO.ERROR;
        this.logger.error('transporte.tcp.error', { error: err.message });
        resolve({ ok: false, error: err.message });
      });

      this.socket.on('close', () => {
        this.socket = null;
        this.estado = ESTADO.DESCONECTADO;
      });
    });
  }

  async enviar(datos, opciones) {
    const buffer = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'binary');

    if (!this.socket || this.socket.destroyed) {
      const result = await this.conectar();
      if (!result.ok) {
        return { ok: false, error: `No conectado: ${result.error}` };
      }
    }

    return new Promise((resolve) => {
      this.socket.write(buffer, (err) => {
        if (err) {
          this.logger.error('transporte.tcp.envio.error', { error: err.message });
          resolve({ ok: false, error: err.message });
        } else {
          this.logger.debug('transporte.tcp.enviado', { bytes: buffer.length });
          resolve({ ok: true, bytes: buffer.length });
        }
      });
    });
  }

  async getEstado() {
    return {
      conectado: this.estado === ESTADO.CONECTADO,
      tipo: this.tipo,
      estado: this.estado,
      info: {
        host: this.config.host,
        puerto: this.config.puerto
      }
    };
  }

  async desconectar() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.estado = ESTADO.DESCONECTADO;
    this.logger.info('transporte.tcp.desconectado');
  }
}

module.exports = TransporteTCP;
