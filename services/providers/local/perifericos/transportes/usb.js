/**
 * Transporte USB — Comunicación con dispositivos USB directos
 *
 * Casos de uso: impresora USB, escáner USB, lector de código de barras.
 * Config: { path: '/dev/usb/lp0' }
 *
 * Estado: placeholder para implementación futura.
 * Cuando se implemente, usar el módulo 'usb' de npm o fs.createWriteStream.
 *
 * @version 0.1.0
 */

const TransporteBase = require('./base');
const { ESTADO } = require('./base');

class TransporteUSB extends TransporteBase {
  constructor(config, logger) {
    super('usb', config, logger);
    this.path = config?.path || '/dev/usb/lp0';
  }

  async conectar() {
    this.logger.warn('transporte.usb.no_implementado', {
      path: this.path,
      nota: 'Transporte USB es placeholder — implementación futura'
    });
    return { ok: false, error: 'Transporte USB no implementado aún' };
  }

  async enviar(datos, opciones) {
    return { ok: false, error: 'Transporte USB no implementado aún' };
  }

  async getEstado() {
    return {
      conectado: false,
      tipo: this.tipo,
      estado: ESTADO.DESCONECTADO,
      info: { path: this.path, implementado: false }
    };
  }
}

module.exports = TransporteUSB;
