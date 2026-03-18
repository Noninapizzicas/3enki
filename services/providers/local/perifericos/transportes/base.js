/**
 * TransporteBase — Interfaz común para todos los transportes de periféricos
 *
 * Todos los transportes (BLE, TCP, ESP32-proxy, comando, USB)
 * implementan estos métodos. El servicio de periféricos los usa
 * de forma polimórfica sin saber qué protocolo hay detrás.
 *
 * @abstract
 */

const ESTADO = {
  DESCONECTADO: 'desconectado',
  CONECTANDO: 'conectando',
  CONECTADO: 'conectado',
  ERROR: 'error'
};

class TransporteBase {
  /**
   * @param {string} tipo - Identificador del transporte (ble-directo, tcp, esp32-proxy, comando)
   * @param {Object} config - Configuración específica del transporte
   * @param {Object} [logger] - Logger instance
   */
  constructor(tipo, config, logger) {
    this.tipo = tipo;
    this.config = config || {};
    this.logger = logger || console;
    this.estado = ESTADO.DESCONECTADO;
  }

  /**
   * Establece conexión con el dispositivo.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async conectar() {
    throw new Error(`${this.tipo}: conectar() no implementado`);
  }

  /**
   * Envía datos al dispositivo.
   * @param {Buffer|string} datos - Datos a enviar (ESC/POS, gcode, etc.)
   * @param {Object} [opciones] - Opciones adicionales de envío
   * @returns {Promise<{ok: boolean, bytes?: number, error?: string}>}
   */
  async enviar(datos, opciones) {
    throw new Error(`${this.tipo}: enviar() no implementado`);
  }

  /**
   * Consulta el estado actual de la conexión.
   * @returns {Promise<{conectado: boolean, info: Object}>}
   */
  async getEstado() {
    return {
      conectado: this.estado === ESTADO.CONECTADO,
      tipo: this.tipo,
      estado: this.estado,
      info: {}
    };
  }

  /**
   * Cierra la conexión y libera recursos.
   * @returns {Promise<void>}
   */
  async desconectar() {
    this.estado = ESTADO.DESCONECTADO;
  }
}

module.exports = TransporteBase;
module.exports.ESTADO = ESTADO;
