'use strict';

const http = require('http');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

const OBJETOS_SUSCRIPCION = {
  print_stats: ['state', 'filename', 'filament_used', 'print_duration',
    'total_duration', 'current_layer', 'total_layer'],
  virtual_sdcard: ['progress', 'is_active', 'file_position'],
  extruder: ['temperature', 'target'],
  heater_bed: ['temperature', 'target'],
  pause_resume: ['is_paused'],
  idle_timeout: ['state'],
  filament_switch_sensor: ['filament_detected']
};

class MoonrakerClient extends EventEmitter {
  constructor({ host = '127.0.0.1', port = 7125, logger } = {}) {
    super();
    this._host = host;
    this._port = port;
    this._log = logger || console;
    this._ws = null;
    this._rpcId = 0;
    this._pendientes = new Map();
    this._reconectando = false;
    this._estado = {};
  }

  get baseUrl() { return `http://${this._host}:${this._port}`; }
  get wsUrl() { return `ws://${this._host}:${this._port}/websocket`; }

  // ── REST ────────────────────────────────────────────────────

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const opts = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        timeout: 15000
      };
      if (body) opts.headers = { 'Content-Type': 'application/json' };

      const req = http.request(opts, (res) => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
          catch (_) { resolve({ status: res.statusCode, data: raw }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async subirGcode(contenido, filename) {
    const nombre = filename || `enki_${Date.now()}.gcode`;
    const boundary = `----EnkiBridge${Date.now()}`;
    const partes = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${nombre}"\r\n`,
      `Content-Type: application/octet-stream\r\n\r\n`,
      contenido,
      `\r\n--${boundary}--\r\n`
    ];
    const payload = Buffer.concat(partes.map(p => Buffer.from(p)));

    return new Promise((resolve, reject) => {
      const opts = {
        method: 'POST',
        hostname: this._host,
        port: this._port,
        path: '/server/files/upload',
        timeout: 30000,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length
        }
      };
      const req = http.request(opts, (res) => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            const data = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, id: data.item?.path || nombre });
            } else {
              resolve({ ok: false, error: data.error || raw });
            }
          } catch (_) {
            resolve({ ok: false, error: raw });
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout subida')); });
      req.write(payload);
      req.end();
    });
  }

  async iniciarImpresion(filename) {
    if (!filename) return { ok: false, error: 'filename requerido' };
    const res = await this._request('POST',
      `/printer/print/start?filename=${encodeURIComponent(filename)}`);
    return { ok: res.status >= 200 && res.status < 300 };
  }

  async consultarEstado() {
    const objetos = Object.keys(OBJETOS_SUSCRIPCION).join('&');
    const path = `/printer/objects/query?${Object.keys(OBJETOS_SUSCRIPCION)
      .map(k => `${k}=${OBJETOS_SUSCRIPCION[k].join(',')}`).join('&')}`;
    const res = await this._request('GET', path);
    if (res.status >= 200 && res.status < 300 && res.data?.result?.status) {
      this._estado = res.data.result.status;
      return { ok: true, data: this._estado };
    }
    return { ok: false, error: res.data };
  }

  // ── WebSocket (stream de estado por push) ──────────────────

  conectarStream() {
    if (this._ws) return;
    this._log.info?.('moonraker.ws.conectando', { url: this.wsUrl });

    this._ws = new WebSocket(this.wsUrl);

    this._ws.on('open', () => {
      this._log.info?.('moonraker.ws.conectado');
      this._suscribirObjetos();
    });

    this._ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._procesarMensajeWs(msg);
      } catch (_) { /* mensaje no JSON, ignorar */ }
    });

    this._ws.on('close', () => {
      this._log.info?.('moonraker.ws.cerrado');
      this._ws = null;
      this._reconectar();
    });

    this._ws.on('error', (err) => {
      this._log.error?.('moonraker.ws.error', { error: err.message });
    });
  }

  desconectarStream() {
    this._reconectando = false;
    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.close();
      this._ws = null;
    }
  }

  _suscribirObjetos() {
    const id = ++this._rpcId;
    const payload = {
      jsonrpc: '2.0', method: 'printer.objects.subscribe',
      params: { objects: OBJETOS_SUSCRIPCION }, id
    };
    this._ws.send(JSON.stringify(payload));
  }

  _procesarMensajeWs(msg) {
    if (msg.method === 'notify_status_update' && msg.params?.[0]) {
      const parcial = msg.params[0];
      for (const [k, v] of Object.entries(parcial)) {
        this._estado[k] = { ...(this._estado[k] || {}), ...v };
      }
      this.emit('estado', { ...this._estado });
      return;
    }
    if (msg.id && this._pendientes.has(msg.id)) {
      this._pendientes.get(msg.id)(msg);
      this._pendientes.delete(msg.id);
    }
  }

  _reconectar() {
    if (this._reconectando) return;
    this._reconectando = true;
    setTimeout(() => {
      this._reconectando = false;
      if (!this._ws) this.conectarStream();
    }, 5000);
  }
}

module.exports = MoonrakerClient;
