#!/usr/bin/env bash
# ============================================================
# setup-pc.sh — Instala el thin bridge Moonraker en un PC Linux limpio.
#
# Qué hace:
#   1. Instala Node.js 20 LTS (si no existe)
#   2. Crea la carpeta ~/enki-bridge-moonraker
#   3. Genera los 3 archivos del bridge (empotrados aquí)
#   4. Instala las 2 dependencias npm (mqtt, ws)
#   5. Genera config.json (solo pide la IP de la impresora)
#   6. Crea el servicio systemd para arranque automático
#
# El broker MQTT es wss://enki-ai.online/mqtt (sin autenticación).
#
# Uso:
#   chmod +x setup-pc.sh
#   ./setup-pc.sh
#
# Después:
#   cd ~/enki-bridge-moonraker
#   node index.js --mock          # probar sin impresora
#   node index.js                 # producción
#   sudo systemctl start enki-bridge-moonraker   # como servicio
# ============================================================

set -euo pipefail

BRIDGE_DIR="$HOME/enki-bridge-moonraker"
SERVICE_NAME="enki-bridge-moonraker"
MQTT_BROKER="wss://enki-ai.online/mqtt"
MQTT_CLIENT_ID="bridge-moonraker-pc"

echo ""
echo "=== Bridge Moonraker — Instalador para PC Linux ==="
echo "    Broker: $MQTT_BROKER (sin autenticación)"
echo ""

# ── 1. Node.js ─────────────────────────────────────────────

install_node() {
  echo "[1/6] Verificando Node.js..."
  if command -v node &>/dev/null; then
    NODE_V=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_V" -ge 18 ]; then
      echo "  Node.js $(node -v) detectado. OK."
      return
    fi
    echo "  Node.js $(node -v) es viejo (necesita >=18). Instalando v20..."
  else
    echo "  Node.js no encontrado. Instalando v20 LTS..."
  fi

  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
  elif command -v pacman &>/dev/null; then
    sudo pacman -Sy --noconfirm nodejs npm
  else
    echo "  ERROR: no se detectó apt/dnf/pacman. Instala Node.js 20+ manualmente."
    echo "  https://nodejs.org/en/download/"
    exit 1
  fi

  echo "  Node.js $(node -v) instalado."
}

# ── 2. Directorio ─────────────────────────────────────────

create_dir() {
  echo "[2/6] Creando directorio $BRIDGE_DIR..."
  mkdir -p "$BRIDGE_DIR"
}

# ── 3. Archivos del bridge ─────────────────────────────────

write_files() {
  echo "[3/6] Generando archivos del bridge..."

  # ── package.json ──
  cat > "$BRIDGE_DIR/package.json" << 'PKGJSON'
{
  "name": "bridge-moonraker",
  "version": "0.1.0",
  "description": "Thin bridge: PC del dueño <-> SPARKX i7 (Moonraker/Klipper). Traduce MQTT <-> Moonraker REST+WebSocket.",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "mock": "node index.js --mock"
  },
  "dependencies": {
    "mqtt": "^5.0.0",
    "ws": "^8.14.0"
  },
  "private": true
}
PKGJSON

  # ── moonraker-client.js ──
  cat > "$BRIDGE_DIR/moonraker-client.js" << 'MOONRAKER_CLIENT'
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
    const path = `/printer/objects/query?${Object.keys(OBJETOS_SUSCRIPCION)
      .map(k => `${k}=${OBJETOS_SUSCRIPCION[k].join(',')}`).join('&')}`;
    const res = await this._request('GET', path);
    if (res.status >= 200 && res.status < 300 && res.data?.result?.status) {
      this._estado = res.data.result.status;
      return { ok: true, data: this._estado };
    }
    return { ok: false, error: res.data };
  }

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
      } catch (_) {}
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
MOONRAKER_CLIENT

  # ── index.js ──
  cat > "$BRIDGE_DIR/index.js" << 'INDEXJS'
'use strict';

const mqtt = require('mqtt');
const MoonrakerClient = require('./moonraker-client');
const fs = require('fs');
const path = require('path');

const MOCK = process.argv.includes('--mock');
const CONFIG_PATH = process.argv.find(a => a.startsWith('--config='))
  ?.split('=')[1] || path.join(__dirname, 'config.json');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
  console.error(`No se pudo leer config: ${CONFIG_PATH} — ${err.message}`);
  process.exit(1);
}

const TOPIC_PREFIX = config.topicPrefix || 'bridge.moonraker';
const TOPICS = {
  subirReq:     `${TOPIC_PREFIX}.subir_gcode.request`,
  subirRes:     `${TOPIC_PREFIX}.subir_gcode.response`,
  iniciarReq:   `${TOPIC_PREFIX}.iniciar_impresion.request`,
  iniciarRes:   `${TOPIC_PREFIX}.iniciar_impresion.response`,
  observarReq:  `${TOPIC_PREFIX}.observar_estado.request`,
  observarRes:  `${TOPIC_PREFIX}.observar_estado.response`,
  estadoPush:   `${TOPIC_PREFIX}.estado_push`
};

const log = {
  info:  (ev, d) => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info',  ev, ...d })),
  error: (ev, d) => console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', ev, ...d }))
};

function crearMock() {
  const { EventEmitter } = require('events');
  const mock = new EventEmitter();
  mock.subirGcode = async (contenido, filename) => {
    log.info('mock.subir_gcode', { filename, bytes: contenido.length });
    return { ok: true, id: filename || `mock_${Date.now()}.gcode` };
  };
  mock.iniciarImpresion = async (filename) => {
    log.info('mock.iniciar_impresion', { filename });
    mock._simularProgreso();
    return { ok: true };
  };
  mock.consultarEstado = async () => ({ ok: true, data: mock._estadoActual() });
  mock.conectarStream = () => {
    log.info('mock.stream.abierto');
    mock._intervalo = setInterval(() => {
      mock.emit('estado', mock._estadoActual());
    }, 5000);
  };
  mock.desconectarStream = () => {
    if (mock._intervalo) clearInterval(mock._intervalo);
  };
  mock._progreso = 0;
  mock._state = 'standby';
  mock._estadoActual = () => ({
    print_stats: { state: mock._state, filament_used: 0, print_duration: 0,
      total_duration: 0, current_layer: 0, total_layer: 10 },
    virtual_sdcard: { progress: mock._progreso },
    extruder: { temperature: 200, target: 200 },
    heater_bed: { temperature: 60, target: 60 },
    pause_resume: { is_paused: false },
    idle_timeout: { state: 'Printing' },
    filament_switch_sensor: { filament_detected: true }
  });
  mock._simularProgreso = () => {
    mock._state = 'printing';
    mock._progreso = 0;
    const iv = setInterval(() => {
      mock._progreso = Math.min(1, mock._progreso + 0.1);
      mock.emit('estado', mock._estadoActual());
      if (mock._progreso >= 1) {
        mock._state = 'complete';
        mock.emit('estado', mock._estadoActual());
        clearInterval(iv);
        mock._state = 'standby';
        mock._progreso = 0;
      }
    }, 3000);
  };
  return mock;
}

const moonraker = MOCK
  ? crearMock()
  : new MoonrakerClient({ ...config.moonraker, logger: log });

const mqttOpts = {
  clientId: config.mqtt.clientId || `bridge-moonraker-${Date.now()}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 8000
};
if (config.mqtt.username) mqttOpts.username = config.mqtt.username;
if (config.mqtt.password) mqttOpts.password = config.mqtt.password;

const mqttClient = mqtt.connect(config.mqtt.broker, mqttOpts);

let streamAbierto = false;

mqttClient.on('connect', () => {
  log.info('mqtt.conectado', { broker: config.mqtt.broker });
  mqttClient.subscribe([TOPICS.subirReq, TOPICS.iniciarReq, TOPICS.observarReq], (err) => {
    if (err) log.error('mqtt.subscribe.error', { error: err.message });
    else log.info('mqtt.suscrito', { topics: Object.values(TOPICS).filter(t => t.endsWith('.request')) });
  });
});

mqttClient.on('error', (err) => {
  log.error('mqtt.error', { error: err.message });
});

mqttClient.on('message', async (topic, raw) => {
  let payload;
  try { payload = JSON.parse(raw.toString()); }
  catch (_) { return; }

  const reqId = payload.request_id || null;

  if (topic === TOPICS.subirReq) {
    await handleSubirGcode(payload, reqId);
  } else if (topic === TOPICS.iniciarReq) {
    await handleIniciarImpresion(payload, reqId);
  } else if (topic === TOPICS.observarReq) {
    await handleObservarEstado(payload, reqId);
  }
});

async function handleSubirGcode(payload, reqId) {
  const gcode = payload.gcode || null;
  if (!gcode || typeof gcode !== 'string') {
    return publicar(TOPICS.subirRes, { request_id: reqId, ok: false, error: 'gcode_vacio' });
  }
  try {
    const res = await moonraker.subirGcode(gcode, payload.filename);
    publicar(TOPICS.subirRes, { request_id: reqId, ...res });
  } catch (err) {
    log.error('handler.subir.error', { error: err.message });
    publicar(TOPICS.subirRes, { request_id: reqId, ok: false, error: err.message });
  }
}

async function handleIniciarImpresion(payload, reqId) {
  const filename = payload.filename || payload.id || null;
  if (!filename) {
    return publicar(TOPICS.iniciarRes, { request_id: reqId, ok: false, error: 'filename_requerido' });
  }
  try {
    const res = await moonraker.iniciarImpresion(filename);
    publicar(TOPICS.iniciarRes, { request_id: reqId, ...res });
  } catch (err) {
    log.error('handler.iniciar.error', { error: err.message });
    publicar(TOPICS.iniciarRes, { request_id: reqId, ok: false, error: err.message });
  }
}

async function handleObservarEstado(payload, reqId) {
  if (streamAbierto) {
    return publicar(TOPICS.observarRes, { request_id: reqId, ok: true, stream: 'ya_abierto' });
  }
  try {
    moonraker.on('estado', (estado) => {
      publicar(TOPICS.estadoPush, {
        project_id: payload.project_id || null,
        data: estado,
        timestamp: new Date().toISOString()
      });
    });
    moonraker.conectarStream();
    streamAbierto = true;
    publicar(TOPICS.observarRes, { request_id: reqId, ok: true, stream: 'abierto' });
  } catch (err) {
    log.error('handler.observar.error', { error: err.message });
    publicar(TOPICS.observarRes, { request_id: reqId, ok: false, error: err.message });
  }
}

function publicar(topic, data) {
  mqttClient.publish(topic, JSON.stringify({ ...data, timestamp: new Date().toISOString() }));
}

function shutdown() {
  log.info('bridge.apagando');
  moonraker.desconectarStream();
  mqttClient.end(false, () => {
    log.info('bridge.apagado');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log.info('bridge.arrancado', {
  modo: MOCK ? 'MOCK' : 'REAL',
  moonraker: MOCK ? 'simulado' : `${config.moonraker.host}:${config.moonraker.port}`,
  broker: config.mqtt.broker,
  topics: TOPICS
});
INDEXJS

  echo "  3 archivos generados."
}

# ── 4. npm install ─────────────────────────────────────────

install_deps() {
  echo "[4/6] Instalando dependencias npm..."
  cd "$BRIDGE_DIR"
  npm install --production
  echo "  Dependencias instaladas."
}

# ── 5. Config interactivo ──────────────────────────────────

configure() {
  echo "[5/6] Configuracion del bridge..."
  echo ""

  CONFIG_FILE="$BRIDGE_DIR/config.json"

  if [ -f "$CONFIG_FILE" ]; then
    echo "  config.json ya existe. Borrando para regenerar con los datos correctos..."
    rm -f "$CONFIG_FILE"
  fi

  read -rp "  IP de la SPARKX i7 en tu red local [192.168.1.128]: " MOONRAKER_HOST
  MOONRAKER_HOST=${MOONRAKER_HOST:-192.168.1.128}

  read -rp "  Puerto de Moonraker [7125]: " MOONRAKER_PORT
  MOONRAKER_PORT=${MOONRAKER_PORT:-7125}

  cat > "$CONFIG_FILE" << CONFIGEOF
{
  "mqtt": {
    "broker": "${MQTT_BROKER}",
    "clientId": "${MQTT_CLIENT_ID}"
  },
  "moonraker": {
    "host": "${MOONRAKER_HOST}",
    "port": ${MOONRAKER_PORT}
  },
  "topicPrefix": "bridge.moonraker"
}
CONFIGEOF

  echo ""
  echo "  config.json creado:"
  echo "    Broker:    $MQTT_BROKER (sin autenticación)"
  echo "    Moonraker: $MOONRAKER_HOST:$MOONRAKER_PORT"
  echo "    ClientId:  $MQTT_CLIENT_ID"
}

# ── 6. Servicio systemd ───────────────────────────────────

install_service() {
  echo "[6/6] Instalando servicio systemd..."

  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

  sudo tee "$SERVICE_FILE" > /dev/null << SERVICEEOF
[Unit]
Description=Enki Bridge Moonraker (SPARKX i7)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$BRIDGE_DIR
ExecStart=$(command -v node) $BRIDGE_DIR/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICEEOF

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"

  echo "  Servicio $SERVICE_NAME instalado y habilitado."
  echo "  Comandos:"
  echo "    sudo systemctl start $SERVICE_NAME    # arrancar"
  echo "    sudo systemctl stop $SERVICE_NAME     # parar"
  echo "    sudo systemctl status $SERVICE_NAME   # estado"
  echo "    journalctl -u $SERVICE_NAME -f        # logs en vivo"
}

# ── Ejecutar todo ──────────────────────────────────────────

install_node
create_dir
write_files
install_deps
configure
install_service

echo ""
echo "=== Instalacion completada ==="
echo ""
echo "  Directorio: $BRIDGE_DIR"
echo "  Config:     $BRIDGE_DIR/config.json"
echo "  Broker:     $MQTT_BROKER (sin autenticación)"
echo ""
echo "  Probar sin impresora:"
echo "    cd $BRIDGE_DIR && node index.js --mock"
echo ""
echo "  Probar con impresora:"
echo "    cd $BRIDGE_DIR && node index.js"
echo ""
echo "  Como servicio:"
echo "    sudo systemctl start $SERVICE_NAME"
echo ""
