/**
 * Transporte ESP32-Proxy — ESP32 como bridge BLE/Serial via MQTT
 *
 * El ESP32 se suscribe a topics MQTT, recibe datos y los reenvía
 * por BLE o Serial a dispositivos cercanos (impresoras, CNC, etc.).
 *
 * Config esperada:
 *   { esp32_device_id: 'esp32-cocina-01' }
 *
 * Topics MQTT:
 *   periferico/{esp32_device_id}/send   → datos al dispositivo
 *   periferico/{esp32_device_id}/ack    → confirmación del ESP32
 *   periferico/{esp32_device_id}/status → estado del ESP32
 */

const TransporteBase = require('./base');
const { ESTADO } = require('./base');

class TransporteESP32Proxy extends TransporteBase {
  /**
   * @param {Object} config - { esp32_device_id: string }
   * @param {Object} logger
   * @param {Object} [deps] - { eventBus } inyectado por el provider
   */
  constructor(config, logger, deps) {
    super('esp32-proxy', config, logger);
    this.config = {
      esp32_device_id: null,
      ...config
    };
    this.eventBus = deps?.eventBus || null;
  }

  async conectar() {
    if (!this.config.esp32_device_id) {
      this.estado = ESTADO.ERROR;
      return { ok: false, error: 'esp32_device_id no configurado' };
    }

    // ESP32-proxy no necesita conexión activa — publica MQTT y listo.
    // Verificamos que tenemos eventBus disponible.
    if (!this.eventBus) {
      this.estado = ESTADO.ERROR;
      return { ok: false, error: 'eventBus no disponible para MQTT' };
    }

    this.estado = ESTADO.CONECTADO;
    this.logger.info('transporte.esp32-proxy.listo', {
      esp32_device_id: this.config.esp32_device_id
    });
    return { ok: true };
  }

  async enviar(datos, opciones) {
    const { esp32_device_id, project_id } = this.config;
    if (!esp32_device_id) {
      return { ok: false, error: 'esp32_device_id no configurado' };
    }

    if (!this.eventBus) {
      return { ok: false, error: 'eventBus no disponible' };
    }

    const mqtt = this.eventBus.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      return { ok: false, error: 'MQTT no disponible' };
    }

    const buffer = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'binary');
    const pid = project_id || 'enki';

    // Publicar al topic que el ESP32 REALMENTE escucha:
    //   impresion/{project}/print/{device}
    // (NO periferico/{device}/send — ese topic no existe en el firmware)
    const topic = `impresion/${pid}/print/${esp32_device_id}`;

    const payload = JSON.stringify({
      job_id: `test_${Date.now().toString(36)}`,
      data: buffer.toString('base64')
    });

    try {
      await mqtt.publish(topic, payload, { qos: 1 });

      this.logger.info('transporte.esp32-proxy.enviado', {
        esp32_device_id,
        bytes: buffer.length,
        topic
      });
      return { ok: true, bytes: buffer.length };
    } catch (error) {
      this.logger.error('transporte.esp32-proxy.error', {
        esp32_device_id,
        error: error.message
      });
      return { ok: false, error: error.message };
    }
  }

  async getEstado() {
    return {
      conectado: this.estado === ESTADO.CONECTADO,
      tipo: this.tipo,
      estado: this.estado,
      info: {
        esp32_device_id: this.config.esp32_device_id,
        eventBus_disponible: !!this.eventBus
      }
    };
  }

  async desconectar() {
    this.estado = ESTADO.DESCONECTADO;
    this.logger.info('transporte.esp32-proxy.desconectado', {
      esp32_device_id: this.config.esp32_device_id
    });
  }
}

module.exports = TransporteESP32Proxy;
