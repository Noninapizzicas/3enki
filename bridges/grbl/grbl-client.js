'use strict';

const net = require('net');
const { EventEmitter } = require('events');

// ── Estados GRBL 1.1 ─────────────────────────────────────────
// El status report (<...>) reporta estos estados de máquina.

const ESTADOS_GRBL = {
  Idle:  'libre',
  Run:   'grabando',
  Hold:  'pausado',
  Jog:   'jog',
  Alarm: 'alarma',
  Door:  'puerta_abierta',
  Check: 'check',
  Home:  'homing',
  Sleep: 'dormido'
};

// ── Parser de status report GRBL ─────────────────────────────
// Formato: <Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>

function parsearStatusReport(linea) {
  const match = linea.match(/^<([A-Za-z]+)\|(.*)>$/);
  if (!match) return null;

  const estado = match[1];
  const campos = match[2].split('|');
  const resultado = {
    estado_maquina: estado,
    estado_sistema: ESTADOS_GRBL[estado] || 'desconocido'
  };

  for (const campo of campos) {
    const [clave, valor] = campo.split(':');
    if (!valor) continue;

    switch (clave) {
      case 'MPos': {
        const [x, y, z] = valor.split(',').map(Number);
        resultado.mpos = { x, y, z };
        break;
      }
      case 'WPos': {
        const [x, y, z] = valor.split(',').map(Number);
        resultado.wpos = { x, y, z };
        break;
      }
      case 'WCO': {
        const [x, y, z] = valor.split(',').map(Number);
        resultado.wco = { x, y, z };
        break;
      }
      case 'FS': {
        const [feed, spindle] = valor.split(',').map(Number);
        resultado.feed = feed;
        resultado.spindle = spindle;
        break;
      }
      case 'F': {
        resultado.feed = Number(valor);
        break;
      }
      case 'Bf': {
        const [bloques, bytes] = valor.split(',').map(Number);
        resultado.buffer = { bloques, bytes };
        break;
      }
      case 'Ln': {
        resultado.linea_actual = Number(valor);
        break;
      }
      case 'Ov': {
        const [feed_ov, rapid_ov, spindle_ov] = valor.split(',').map(Number);
        resultado.override = { feed: feed_ov, rapid: rapid_ov, spindle: spindle_ov };
        break;
      }
      case 'A': {
        resultado.accesorios = valor;
        break;
      }
      case 'Pn': {
        resultado.pines = valor;
        break;
      }
    }
  }

  return resultado;
}

// ── GrblClient ───────────────────────────────────────────────

class GrblClient extends EventEmitter {
  constructor({ host = '127.0.0.1', port = 23, logger } = {}) {
    super();
    this._host = host;
    this._port = port;
    this._log = logger || console;
    this._socket = null;
    this._reconectando = false;
    this._buffer = '';
    this._estado = {};

    this._colaGcode = [];
    this._enviando = false;
    this._lineaActual = 0;
    this._totalLineas = 0;
    this._esperandoOk = false;

    this._pollInterval = null;
  }

  // ── Conexión TCP ───────────────────────────────────────────

  conectar() {
    if (this._socket) return;
    this._log.info?.('grbl.tcp.conectando', { host: this._host, port: this._port });

    this._socket = net.connect(this._port, this._host);
    this._socket.setEncoding('utf8');

    this._socket.on('connect', () => {
      this._log.info?.('grbl.tcp.conectado');
      this._buffer = '';
      this.emit('conectado');
    });

    this._socket.on('data', (data) => {
      this._buffer += data;
      this._procesarBuffer();
    });

    this._socket.on('close', () => {
      this._log.info?.('grbl.tcp.cerrado');
      this._socket = null;
      this._detenerPoll();
      this._reconectar();
    });

    this._socket.on('error', (err) => {
      this._log.error?.('grbl.tcp.error', { error: err.message });
    });

    this._socket.on('timeout', () => {
      this._log.error?.('grbl.tcp.timeout');
      this._socket.destroy();
    });

    this._socket.setTimeout(30000);
  }

  desconectar() {
    this._reconectando = false;
    this._detenerPoll();
    if (this._socket) {
      this._socket.removeAllListeners();
      this._socket.destroy();
      this._socket = null;
    }
  }

  _reconectar() {
    if (this._reconectando) return;
    this._reconectando = true;
    setTimeout(() => {
      this._reconectando = false;
      if (!this._socket) this.conectar();
    }, 5000);
  }

  // ── Envío de comandos ──────────────────────────────────────

  _enviarRaw(linea) {
    if (!this._socket) return false;
    this._socket.write(linea + '\n');
    return true;
  }

  enviarComando(cmd) {
    return new Promise((resolve, reject) => {
      if (!this._socket) return reject(new Error('no conectado'));

      const timeout = setTimeout(() => {
        this.removeListener('_respuesta', onResp);
        reject(new Error('timeout comando'));
      }, 10000);

      const onResp = (resp) => {
        clearTimeout(timeout);
        if (resp.tipo === 'ok') resolve({ ok: true });
        else if (resp.tipo === 'error') resolve({ ok: false, error: resp.codigo });
        else resolve({ ok: true, data: resp });
      };

      this.once('_respuesta', onResp);
      this._enviarRaw(cmd);
    });
  }

  consultarEstado() {
    if (!this._socket) return Promise.resolve({ ok: false, error: 'no conectado' });
    this._enviarRaw('?');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.removeListener('_status', onStatus);
        resolve({ ok: false, error: 'timeout status' });
      }, 5000);

      const onStatus = (estado) => {
        clearTimeout(timeout);
        resolve({ ok: true, data: estado });
      };

      this.once('_status', onStatus);
    });
  }

  // ── Streaming de G-code (línea a línea con flow control) ──

  async enviarGcode(gcode) {
    const lineas = gcode
      .split('\n')
      .map(l => l.replace(/;.*$/, '').trim())
      .filter(l => l.length > 0);

    if (lineas.length === 0) return { ok: false, error: 'gcode_vacio' };

    this._colaGcode = lineas;
    this._lineaActual = 0;
    this._totalLineas = lineas.length;
    this._enviando = true;

    this._log.info?.('grbl.gcode.iniciando', { lineas: this._totalLineas });

    return new Promise((resolve, reject) => {
      const enviarSiguiente = () => {
        if (!this._enviando) {
          return resolve({ ok: false, error: 'cancelado' });
        }
        if (this._lineaActual >= this._totalLineas) {
          this._enviando = false;
          this._log.info?.('grbl.gcode.completado', { lineas: this._totalLineas });
          return resolve({ ok: true, lineas: this._totalLineas });
        }

        const linea = this._colaGcode[this._lineaActual];
        this._esperandoOk = true;
        this._enviarRaw(linea);
      };

      const onRespuesta = (resp) => {
        if (!this._enviando) return;

        if (resp.tipo === 'ok') {
          this._esperandoOk = false;
          this._lineaActual++;
          this.emit('progreso', {
            linea: this._lineaActual,
            total: this._totalLineas,
            progreso: this._lineaActual / this._totalLineas
          });
          enviarSiguiente();
        } else if (resp.tipo === 'error') {
          this._enviando = false;
          this.removeListener('_respuesta', onRespuesta);
          resolve({
            ok: false,
            error: `error GRBL ${resp.codigo} en linea ${this._lineaActual + 1}`,
            linea: this._lineaActual + 1,
            contenido: this._colaGcode[this._lineaActual]
          });
        }
      };

      this.on('_respuesta', onRespuesta);
      enviarSiguiente();
    });
  }

  cancelarEnvio() {
    this._enviando = false;
    this._colaGcode = [];
    this._enviarRaw('\x18');
  }

  // ── Stream de estado (polling con ?) ───────────────────────

  conectarStream(intervaloMs = 1000) {
    if (this._pollInterval) return;
    this._log.info?.('grbl.stream.abierto', { intervalo: intervaloMs });

    this._pollInterval = setInterval(() => {
      if (this._socket) this._enviarRaw('?');
    }, intervaloMs);
  }

  desconectarStream() {
    this._detenerPoll();
  }

  _detenerPoll() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  // ── Parser del buffer TCP ──────────────────────────────────

  _procesarBuffer() {
    const lineas = this._buffer.split('\n');
    this._buffer = lineas.pop();

    for (const raw of lineas) {
      const linea = raw.replace(/\r/g, '').trim();
      if (!linea) continue;

      if (linea === 'ok') {
        this.emit('_respuesta', { tipo: 'ok' });
        continue;
      }

      if (linea.startsWith('error:')) {
        const codigo = parseInt(linea.split(':')[1], 10);
        this.emit('_respuesta', { tipo: 'error', codigo });
        this.emit('error_grbl', { codigo, linea });
        continue;
      }

      if (linea.startsWith('ALARM:')) {
        const codigo = parseInt(linea.split(':')[1], 10);
        this.emit('alarma', { codigo });
        continue;
      }

      if (linea.startsWith('<') && linea.endsWith('>')) {
        const estado = parsearStatusReport(linea);
        if (estado) {
          this._estado = estado;
          this.emit('_status', estado);
          this.emit('estado', estado);
        }
        continue;
      }

      if (linea.startsWith('Grbl ')) {
        this._log.info?.('grbl.banner', { version: linea });
        this.emit('conectado_grbl', { version: linea });
        continue;
      }

      if (linea.startsWith('[')) {
        this.emit('mensaje', { texto: linea });
        continue;
      }

      if (linea.startsWith('$')) {
        this.emit('config', { linea });
      }
    }
  }
}

module.exports = GrblClient;
module.exports.parsearStatusReport = parsearStatusReport;
module.exports.ESTADOS_GRBL = ESTADOS_GRBL;
