#!/usr/bin/env bash
# ============================================================
# setup-pc.sh — Instala el thin bridge GRBL en un PC Linux limpio.
#
# Qué hace:
#   1. Instala Node.js 20 LTS (si no existe)
#   2. Crea la carpeta ~/enki-bridge-grbl
#   3. Genera los 3 archivos del bridge (empotrados aquí)
#   4. Instala la dependencia npm (mqtt)
#   5. Genera config.json (solo pide la IP de la grabadora)
#   6. Crea el servicio systemd para arranque automático
#
# El broker MQTT es wss://enki-ai.online/mqtt (sin autenticación).
# La grabadora Atomstack A20 Pro V2 habla GRBL por TCP puerto 23.
#
# Uso:
#   chmod +x setup-pc.sh
#   ./setup-pc.sh
#
# Después:
#   cd ~/enki-bridge-grbl
#   node index.js --mock          # probar sin grabadora
#   node index.js                 # producción
#   sudo systemctl start enki-bridge-grbl   # como servicio
# ============================================================

set -euo pipefail

BRIDGE_DIR="$HOME/enki-bridge-grbl"
SERVICE_NAME="enki-bridge-grbl"
MQTT_BROKER="wss://enki-ai.online/mqtt"
MQTT_CLIENT_ID="bridge-grbl-pc"

echo ""
echo "=== Bridge GRBL — Instalador para PC Linux ==="
echo "    Grabadora: Atomstack A20 Pro V2 (GRBL WiFi TCP)"
echo "    Broker:    $MQTT_BROKER (sin autenticación)"
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
  "name": "bridge-grbl",
  "version": "0.1.0",
  "description": "Thin bridge: PC del dueño <-> Atomstack A20 Pro V2 (GRBL WiFi). Traduce MQTT <-> GRBL TCP.",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "mock": "node index.js --mock"
  },
  "dependencies": {
    "mqtt": "^5.0.0"
  },
  "private": true
}
PKGJSON

  # ── grbl-client.js ──
  cat > "$BRIDGE_DIR/grbl-client.js" << 'GRBL_CLIENT'
'use strict';

const net = require('net');
const { EventEmitter } = require('events');

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
GRBL_CLIENT

  # ── index.js ──
  cat > "$BRIDGE_DIR/index.js" << 'INDEXJS'
'use strict';

const mqtt = require('mqtt');
const GrblClient = require('./grbl-client');
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

const TOPIC_PREFIX = config.topicPrefix || 'bridge.grbl';
const TOPICS = {
  enviarReq:    `${TOPIC_PREFIX}.enviar_gcode.request`,
  enviarRes:    `${TOPIC_PREFIX}.enviar_gcode.response`,
  iniciarReq:   `${TOPIC_PREFIX}.iniciar_trabajo.request`,
  iniciarRes:   `${TOPIC_PREFIX}.iniciar_trabajo.response`,
  observarReq:  `${TOPIC_PREFIX}.observar_estado.request`,
  observarRes:  `${TOPIC_PREFIX}.observar_estado.response`,
  estadoPush:   `${TOPIC_PREFIX}.estado_push`,
  progresoPush: `${TOPIC_PREFIX}.progreso_push`
};

const log = {
  info:  (ev, d) => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info',  ev, ...d })),
  error: (ev, d) => console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', ev, ...d }))
};

function crearMock() {
  const { EventEmitter } = require('events');
  const mock = new EventEmitter();

  mock._estado = 'Idle';
  mock._progreso = 0;
  mock._mpos = { x: 0, y: 0, z: 0 };

  mock.conectar = () => {
    log.info('mock.conectado');
    mock.emit('conectado');
  };

  mock.desconectar = () => {
    log.info('mock.desconectado');
    if (mock._pollInterval) clearInterval(mock._pollInterval);
  };

  mock.enviarGcode = async (gcode) => {
    const lineas = gcode.split('\n').filter(l => l.trim().length > 0);
    log.info('mock.enviar_gcode', { lineas: lineas.length });

    mock._estado = 'Run';
    mock._progreso = 0;

    for (let i = 0; i < lineas.length; i++) {
      mock._progreso = (i + 1) / lineas.length;
      mock.emit('progreso', {
        linea: i + 1,
        total: lineas.length,
        progreso: mock._progreso
      });
      await new Promise(r => setTimeout(r, 50));
    }

    mock._estado = 'Idle';
    mock._progreso = 0;
    return { ok: true, lineas: lineas.length };
  };

  mock.enviarComando = async (cmd) => {
    log.info('mock.comando', { cmd });
    return { ok: true };
  };

  mock.consultarEstado = async () => ({
    ok: true,
    data: {
      estado_maquina: mock._estado,
      estado_sistema: mock._estado === 'Run' ? 'grabando' : 'libre',
      mpos: { ...mock._mpos },
      feed: 0,
      spindle: 0
    }
  });

  mock.conectarStream = (intervaloMs = 1000) => {
    log.info('mock.stream.abierto');
    mock._pollInterval = setInterval(() => {
      mock.emit('estado', {
        estado_maquina: mock._estado,
        estado_sistema: mock._estado === 'Run' ? 'grabando' : 'libre',
        mpos: { ...mock._mpos },
        feed: mock._estado === 'Run' ? 1000 : 0,
        spindle: mock._estado === 'Run' ? 1000 : 0
      });
    }, intervaloMs);
  };

  mock.desconectarStream = () => {
    if (mock._pollInterval) clearInterval(mock._pollInterval);
  };

  return mock;
}

const grbl = MOCK
  ? crearMock()
  : new GrblClient({ ...config.grbl, logger: log });

if (!MOCK) grbl.conectar();
else grbl.conectar();

const mqttOpts = {
  clientId: config.mqtt.clientId || `bridge-grbl-${Date.now()}`,
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
  mqttClient.subscribe([TOPICS.enviarReq, TOPICS.iniciarReq, TOPICS.observarReq], (err) => {
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

  if (topic === TOPICS.enviarReq) {
    await handleEnviarGcode(payload, reqId);
  } else if (topic === TOPICS.iniciarReq) {
    await handleIniciarTrabajo(payload, reqId);
  } else if (topic === TOPICS.observarReq) {
    await handleObservarEstado(payload, reqId);
  }
});

async function handleEnviarGcode(payload, reqId) {
  const gcode = payload.gcode || null;
  if (!gcode || typeof gcode !== 'string') {
    return publicar(TOPICS.enviarRes, { request_id: reqId, ok: false, error: 'gcode_vacio' });
  }

  grbl.on('progreso', (p) => {
    publicar(TOPICS.progresoPush, {
      project_id: payload.project_id || null,
      data: p,
      timestamp: new Date().toISOString()
    });
  });

  try {
    const res = await grbl.enviarGcode(gcode);
    grbl.removeAllListeners('progreso');
    publicar(TOPICS.enviarRes, { request_id: reqId, ...res });
  } catch (err) {
    grbl.removeAllListeners('progreso');
    log.error('handler.enviar.error', { error: err.message });
    publicar(TOPICS.enviarRes, { request_id: reqId, ok: false, error: err.message });
  }
}

async function handleIniciarTrabajo(payload, reqId) {
  const cmd = payload.comando || null;
  if (!cmd || typeof cmd !== 'string') {
    return publicar(TOPICS.iniciarRes, { request_id: reqId, ok: false, error: 'comando_requerido' });
  }
  try {
    const res = await grbl.enviarComando(cmd);
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
    grbl.on('estado', (estado) => {
      publicar(TOPICS.estadoPush, {
        project_id: payload.project_id || null,
        data: estado,
        timestamp: new Date().toISOString()
      });
    });
    grbl.conectarStream();
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
  grbl.desconectarStream();
  grbl.desconectar();
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
  grbl: MOCK ? 'simulado' : `${config.grbl.host}:${config.grbl.port}`,
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

  read -rp "  IP de la Atomstack A20 Pro V2 en tu red local [192.168.1.105]: " GRBL_HOST
  GRBL_HOST=${GRBL_HOST:-192.168.1.105}

  read -rp "  Puerto TCP de GRBL [23]: " GRBL_PORT
  GRBL_PORT=${GRBL_PORT:-23}

  cat > "$CONFIG_FILE" << CONFIGEOF
{
  "mqtt": {
    "broker": "${MQTT_BROKER}",
    "clientId": "${MQTT_CLIENT_ID}"
  },
  "grbl": {
    "host": "${GRBL_HOST}",
    "port": ${GRBL_PORT}
  },
  "topicPrefix": "bridge.grbl"
}
CONFIGEOF

  echo ""
  echo "  config.json creado:"
  echo "    Broker:    $MQTT_BROKER (sin autenticación)"
  echo "    Atomstack: $GRBL_HOST:$GRBL_PORT (GRBL TCP)"
  echo "    ClientId:  $MQTT_CLIENT_ID"
}

# ── 6. Servicio systemd ───────────────────────────────────

install_service() {
  echo "[6/6] Instalando servicio systemd..."

  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

  sudo tee "$SERVICE_FILE" > /dev/null << SERVICEEOF
[Unit]
Description=Enki Bridge GRBL (Atomstack A20 Pro V2)
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
echo "  Probar sin grabadora:"
echo "    cd $BRIDGE_DIR && node index.js --mock"
echo ""
echo "  Probar con grabadora:"
echo "    cd $BRIDGE_DIR && node index.js"
echo ""
echo "  Como servicio:"
echo "    sudo systemctl start $SERVICE_NAME"
echo ""
