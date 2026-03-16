/**
 * Transporte Bluetooth para impresora térmica en Termux/Android
 *
 * Soporta 3 modos de envío:
 *   1. "dispositivo" — escribe a /dev/rfcomm0 (requiere rfcomm bind)
 *   2. "comando"     — pipe a un comando shell arbitrario
 *   3. "tcp"         — socket TCP (para apps bridge BT→TCP)
 *
 * Setup Termux (modo dispositivo):
 *   pkg install termux-api bluetooth-utils
 *   bluetoothctl → pair <MAC>
 *   rfcomm bind 0 <MAC> 1
 *   → escribe a /dev/rfcomm0
 */

const fs = require('fs');
const net = require('net');
const { execSync, spawn } = require('child_process');

// Estado de conexión
const ESTADO = {
  DESCONECTADO: 'desconectado',
  CONECTANDO: 'conectando',
  CONECTADO: 'conectado',
  ERROR: 'error'
};

class TransporteBluetooth {
  /**
   * @param {Object} config
   * @param {string} config.modo          - "dispositivo" | "comando" | "tcp" | "mqtt"
   * @param {string} config.mac           - MAC del dispositivo BT (AA:BB:CC:DD:EE:FF)
   * @param {string} config.dispositivo   - ruta al device file (default: /dev/rfcomm0)
   * @param {number} config.rfcomm_canal  - canal RFCOMM (default: 1)
   * @param {string} config.comando       - comando shell para modo "comando"
   * @param {string} config.tcp_host      - host para modo TCP (default: 127.0.0.1)
   * @param {number} config.tcp_puerto    - puerto para modo TCP
   * @param {string} config.mqtt_device   - ID del ESP32 destino (modo mqtt)
   * @param {string} config.mqtt_project  - project_id para topics (modo mqtt)
   * @param {number} config.mqtt_timeout  - timeout ACK en ms (default: 10000)
   * @param {Object} logger
   * @param {Object} eventBus             - EventBus para modo MQTT (opcional)
   */
  constructor(config, logger, eventBus) {
    this.config = {
      modo: 'dispositivo',
      mac: null,
      dispositivo: '/dev/rfcomm0',
      rfcomm_canal: 1,
      comando: null,
      tcp_host: '127.0.0.1',
      tcp_puerto: 9100,
      mqtt_device: null,
      mqtt_project: null,
      mqtt_timeout: 10000,
      ...config
    };
    this.logger = logger;
    this.eventBus = eventBus;
    this.estado = ESTADO.DESCONECTADO;
    this.tcpSocket = null;
    this._mqttAckResolvers = new Map();
  }

  // ==========================================
  // Conexión
  // ==========================================

  /**
   * Prepara la conexión según el modo configurado.
   * En modo "dispositivo": hace rfcomm bind si es necesario.
   * En modo "tcp": abre el socket.
   * En modo "comando": no hace nada (se ejecuta por envío).
   */
  async conectar() {
    this.estado = ESTADO.CONECTANDO;
    const { modo } = this.config;

    try {
      if (modo === 'dispositivo') {
        await this._prepararRfcomm();
      } else if (modo === 'tcp') {
        await this._conectarTcp();
      } else if (modo === 'mqtt') {
        await this._prepararMqtt();
      }
      // modo "comando" no necesita conexión previa

      this.estado = ESTADO.CONECTADO;
      this.logger.info('transporte.conectado', { modo });
    } catch (error) {
      this.estado = ESTADO.ERROR;
      this.logger.error('transporte.conexion.error', { modo, error: error.message });
      throw error;
    }
  }

  async desconectar() {
    if (this.tcpSocket) {
      this.tcpSocket.destroy();
      this.tcpSocket = null;
    }
    if (this.config.modo === 'mqtt') {
      await this.desconectarMqtt();
    }
    this.estado = ESTADO.DESCONECTADO;
    this.logger.info('transporte.desconectado');
  }

  // ==========================================
  // Envío
  // ==========================================

  /**
   * Envía datos raw (ESC/POS) a la impresora.
   * @param {string|Buffer} datos - contenido ESC/POS
   */
  async enviar(datos) {
    const buffer = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'binary');
    const { modo } = this.config;

    this.logger.debug('transporte.enviando', { modo, bytes: buffer.length });

    switch (modo) {
      case 'dispositivo':
        return this._enviarDispositivo(buffer);
      case 'comando':
        return this._enviarComando(buffer);
      case 'tcp':
        return this._enviarTcp(buffer);
      case 'mqtt':
        return this._enviarMqtt(buffer);
      default:
        throw new Error(`Modo de transporte desconocido: ${modo}`);
    }
  }

  // ==========================================
  // Modo: Dispositivo (rfcomm)
  // ==========================================

  async _prepararRfcomm() {
    const { mac, dispositivo, rfcomm_canal } = this.config;

    // Verificar si el device file ya existe
    if (fs.existsSync(dispositivo)) {
      this.logger.info('transporte.rfcomm.existe', { dispositivo });
      return;
    }

    // Necesitamos MAC para hacer bind
    if (!mac) {
      throw new Error(
        `No existe ${dispositivo} y no se proporcionó MAC para rfcomm bind. ` +
        `Ejecuta manualmente: rfcomm bind 0 <MAC> ${rfcomm_canal}`
      );
    }

    // Extraer número de dispositivo de la ruta (/dev/rfcomm0 → 0)
    const match = dispositivo.match(/rfcomm(\d+)/);
    const devNum = match ? match[1] : '0';

    try {
      this.logger.info('transporte.rfcomm.bind', { mac, canal: rfcomm_canal, dev: devNum });
      execSync(`rfcomm bind ${devNum} ${mac} ${rfcomm_canal}`, { timeout: 5000 });

      // Esperar un momento a que el device aparezca
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

  async _enviarDispositivo(buffer) {
    const { dispositivo } = this.config;

    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(dispositivo, { flags: 'a' });

      stream.on('error', (err) => {
        this.estado = ESTADO.ERROR;
        reject(new Error(`Error escribiendo a ${dispositivo}: ${err.message}`));
      });

      stream.write(buffer, () => {
        stream.end(() => {
          this.logger.debug('transporte.dispositivo.enviado', { bytes: buffer.length });
          resolve();
        });
      });
    });
  }

  // ==========================================
  // Modo: Comando shell
  // ==========================================

  async _enviarComando(buffer) {
    const { comando } = this.config;

    if (!comando) {
      throw new Error('No se configuró comando para modo "comando"');
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('sh', ['-c', comando], { stdio: ['pipe', 'ignore', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('error', (err) => {
        reject(new Error(`Error ejecutando comando: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.logger.debug('transporte.comando.enviado', { bytes: buffer.length });
          resolve();
        } else {
          reject(new Error(`Comando salió con código ${code}: ${stderr}`));
        }
      });

      proc.stdin.write(buffer);
      proc.stdin.end();
    });
  }

  // ==========================================
  // Modo: TCP socket
  // ==========================================

  async _conectarTcp() {
    const { tcp_host, tcp_puerto } = this.config;

    return new Promise((resolve, reject) => {
      this.tcpSocket = new net.Socket();

      const timeout = setTimeout(() => {
        this.tcpSocket.destroy();
        reject(new Error(`Timeout conectando a ${tcp_host}:${tcp_puerto}`));
      }, 5000);

      this.tcpSocket.connect(tcp_puerto, tcp_host, () => {
        clearTimeout(timeout);
        this.logger.info('transporte.tcp.conectado', { host: tcp_host, puerto: tcp_puerto });
        resolve();
      });

      this.tcpSocket.on('error', (err) => {
        clearTimeout(timeout);
        this.estado = ESTADO.ERROR;
        this.logger.error('transporte.tcp.error', { error: err.message });
        reject(err);
      });

      this.tcpSocket.on('close', () => {
        this.tcpSocket = null;
        this.estado = ESTADO.DESCONECTADO;
        this.logger.info('transporte.tcp.cerrado');
      });
    });
  }

  async _enviarTcp(buffer) {
    if (!this.tcpSocket || this.tcpSocket.destroyed) {
      await this._conectarTcp();
    }

    return new Promise((resolve, reject) => {
      this.tcpSocket.write(buffer, (err) => {
        if (err) {
          reject(new Error(`Error enviando por TCP: ${err.message}`));
        } else {
          this.logger.debug('transporte.tcp.enviado', { bytes: buffer.length });
          resolve();
        }
      });
    });
  }

  // ==========================================
  // Modo: MQTT (ESP32 print proxy)
  // ==========================================

  async _prepararMqtt() {
    const { mqtt_device, mqtt_project } = this.config;

    if (!mqtt_device) {
      throw new Error('Falta mqtt_device (ID del ESP32 destino)');
    }
    if (!mqtt_project) {
      throw new Error('Falta mqtt_project (project_id)');
    }
    if (!this.eventBus) {
      throw new Error('Se necesita eventBus para modo MQTT');
    }

    // Suscribirse al ACK del ESP32
    const ackTopic = `impresion/${mqtt_project}/printed/${mqtt_device}`;
    this.eventBus.subscribe(ackTopic, (event) => {
      const data = event.data || event;
      const jobId = data.job_id;
      if (jobId && this._mqttAckResolvers.has(jobId)) {
        const { resolve, reject, timer } = this._mqttAckResolvers.get(jobId);
        clearTimeout(timer);
        this._mqttAckResolvers.delete(jobId);
        if (data.success) {
          resolve();
        } else {
          reject(new Error(data.error || 'ESP32 reportó error'));
        }
      }
    });

    this.logger.info('transporte.mqtt.preparado', {
      device: mqtt_device,
      project: mqtt_project,
      ack_topic: ackTopic
    });
  }

  async _enviarMqtt(buffer) {
    const { mqtt_device, mqtt_project, mqtt_timeout } = this.config;
    const printTopic = `impresion/${mqtt_project}/print/${mqtt_device}`;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Codificar ESC/POS en base64
    const b64data = buffer.toString('base64');

    // Publicar y esperar ACK con timeout
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._mqttAckResolvers.delete(jobId);
        reject(new Error(`Timeout esperando ACK del ESP32 '${mqtt_device}' (${mqtt_timeout}ms)`));
      }, mqtt_timeout);

      this._mqttAckResolvers.set(jobId, { resolve, reject, timer });

      this.eventBus.publish(printTopic, {
        job_id: jobId,
        data: b64data,
        device_id: mqtt_device,
        timestamp: Date.now()
      });

      this.logger.debug('transporte.mqtt.enviado', {
        job_id: jobId,
        device: mqtt_device,
        bytes: buffer.length,
        b64_bytes: b64data.length
      });
    });
  }

  // ==========================================
  // Utilidades
  // ==========================================

  getEstado() {
    return {
      modo: this.config.modo,
      estado: this.estado,
      dispositivo: this.config.modo === 'dispositivo' ? this.config.dispositivo : undefined,
      mac: this.config.mac || null,
      tcp: this.config.modo === 'tcp'
        ? `${this.config.tcp_host}:${this.config.tcp_puerto}`
        : undefined,
      mqtt: this.config.modo === 'mqtt'
        ? { device: this.config.mqtt_device, project: this.config.mqtt_project }
        : undefined
    };
  }

  async desconectarMqtt() {
    // Limpiar resolvers pendientes
    for (const [jobId, { reject, timer }] of this._mqttAckResolvers) {
      clearTimeout(timer);
      reject(new Error('Transporte desconectado'));
    }
    this._mqttAckResolvers.clear();
  }
}

module.exports = TransporteBluetooth;
module.exports.ESTADO = ESTADO;
