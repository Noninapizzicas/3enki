#Requires -Version 5.1
<#
  setup-pc.ps1 — Instala el thin bridge GRBL en un PC Windows.

  QUÉ ES
    El PC habla con la Atomstack A20 Pro V2 por TCP (GRBL) y publica su estado
    en MQTT (wss://enki-ai.online/mqtt). Enki, desde el VPS, lo ve como
    `bridge.grbl.*`. El láser NO se expone a internet: el que sale es el PC.

  POR QUÉ EXISTE
    setup-pc.sh era sólo para Linux. El portátil pasó a Windows y el bridge se
    quedó sin instalador. El código es Node puro (sólo depende de `mqtt`), así
    que corre igual: lo único que cambia es cómo se instala y cómo arranca solo.

  QUÉ HACE
    1. Comprueba Node.js (no lo instala: te dice el comando si falta).
    2. Pide IP y puerto de la grabadora.
    3. Crea %USERPROFILE%\enki-bridge-grbl con los 3 ficheros.
    4. Instala la dependencia mqtt.
    5. Crea una tarea programada que arranca al iniciar sesión.
    6. Arranca el bridge y muestra el estado.

  USO
    Click derecho → "Ejecutar con PowerShell".
    O bien:  powershell -ExecutionPolicy Bypass -File .\setup-pc.ps1
#>

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '=== Enki Bridge GRBL — instalacion en Windows ===' -ForegroundColor Cyan
Write-Host ''

# ── 1. Node.js ────────────────────────────────────────────────────────────
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host '  ERROR: Node.js no esta instalado.' -ForegroundColor Red
    Write-Host '  Instalalo con una de estas (y vuelve a ejecutar este script):'
    Write-Host '    winget install OpenJS.NodeJS.LTS'
    Write-Host '    o descarga: https://nodejs.org/  (LTS)'
    exit 1
}
$nodeVersion = (& node --version).Trim()
Write-Host "  Node.js: $nodeVersion"

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host '  ERROR: npm no esta en el PATH (viene con Node.js).' -ForegroundColor Red
    exit 1
}

# ── 2. Datos de la grabadora ──────────────────────────────────────────────
Write-Host ''
Write-Host '  La grabadora tiene que estar en la MISMA red que este PC.' -ForegroundColor Yellow
Write-Host '  Su IP se ve en el router, o en el panel de la Atomstack.' -ForegroundColor Yellow
Write-Host ''

$grblHost = Read-Host '  IP de la Atomstack A20 Pro V2 [192.168.1.153]'
if ([string]::IsNullOrWhiteSpace($grblHost)) { $grblHost = '192.168.1.153' }

$grblPort = Read-Host '  Puerto TCP de GRBL [8080]'
if ([string]::IsNullOrWhiteSpace($grblPort)) { $grblPort = '8080' }
if ($grblPort -notmatch '^\d+$') {
    Write-Host '  ERROR: el puerto tiene que ser un numero.' -ForegroundColor Red
    exit 1
}

# ── 3. Carpeta y ficheros ─────────────────────────────────────────────────
$dir = Join-Path $env:USERPROFILE 'enki-bridge-grbl'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host ''
Write-Host "  Carpeta: $dir"

$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, $utf8)
}

$indexJs = @'
'use strict';

const mqtt = require('mqtt');
const GrblClient = require('./grbl-client');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────

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

// ── Logger mínimo ─────────────────────────────────────────────

const log = {
  info:  (ev, d) => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info',  ev, ...d })),
  error: (ev, d) => console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', ev, ...d }))
};

// ── Mock de GRBL (para testear sin grabadora) ─────────────────

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

// ── GRBL (real o mock) ────────────────────────────────────────

const grbl = MOCK
  ? crearMock()
  : new GrblClient({ ...config.grbl, logger: log });

if (!MOCK) grbl.conectar();
else grbl.conectar();

// ── MQTT ──────────────────────────────────────────────────────

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

// ── Handlers ──────────────────────────────────────────────────

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

// ── Graceful shutdown ─────────────────────────────────────────

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

// ── Arranque ──────────────────────────────────────────────────

log.info('bridge.arrancado', {
  modo: MOCK ? 'MOCK' : 'REAL',
  grbl: MOCK ? 'simulado' : `${config.grbl.host}:${config.grbl.port}`,
  broker: config.mqtt.broker,
  topics: TOPICS
});
'@

$grblClientJs = @'
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
  constructor({ host = '127.0.0.1', port = 8080, keepAliveMs = 3000, logger } = {}) {
    super();
    this._host = host;
    this._port = port;
    this._keepAliveMs = keepAliveMs;
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
      this._enviarRaw('?');
      if (this._keepAliveMs > 0) this.conectarStream(this._keepAliveMs);
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
          this.removeListener('_respuesta', onRespuesta);
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
        if (this._keepAliveMs > 0) this.conectarStream(this._keepAliveMs);
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
'@

$packageJson = @'
{
  "name": "bridge-grbl",
  "version": "0.1.0",
  "description": "Thin bridge: PC del dueno <-> Atomstack A20 Pro V2 (GRBL WiFi).",
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
'@

$configJson = @"
{
  "_doc": "Bridge GRBL en el PC del dueno. NO ejecutar esto en el VPS.",
  "mqtt": {
    "broker": "wss://enki-ai.online/mqtt",
    "clientId": "bridge-grbl-pc"
  },
  "grbl": {
    "host": "$grblHost",
    "port": $grblPort
  },
  "topicPrefix": "bridge.grbl"
}
"@

Write-Utf8 (Join-Path $dir 'index.js')        $indexJs
Write-Utf8 (Join-Path $dir 'grbl-client.js')  $grblClientJs
Write-Utf8 (Join-Path $dir 'package.json')    $packageJson
Write-Utf8 (Join-Path $dir 'config.json')     $configJson
Write-Host '  Ficheros escritos: index.js, grbl-client.js, package.json, config.json'

# Arranque manual (util para ver los logs en una ventana)
$startBat = "@echo off`r`ncd /d `"%~dp0`"`r`nnode index.js`r`npause`r`n"
Write-Utf8 (Join-Path $dir 'start.bat') $startBat

# ── 4. Dependencias ───────────────────────────────────────────────────────
Write-Host ''
Write-Host '  Instalando mqtt (npm)...'
Push-Location $dir
try {
    & npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host '  ERROR: npm install fallo.' -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}
Write-Host '  mqtt instalado.'

# ── 5. Prueba de alcance (antes de dejarlo arrancado) ─────────────────────
Write-Host ''
Write-Host "  Probando $grblHost`:$grblPort ..."
$tcpOk = $false
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($grblHost, [int]$grblPort, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(3000)) {
        $client.EndConnect($iar)
        $tcpOk = $true
    }
    $client.Close()
} catch { $tcpOk = $false }

if ($tcpOk) {
    Write-Host '  La grabadora responde. El bridge puede hablar con ella.' -ForegroundColor Green
} else {
    Write-Host '  AVISO: la grabadora NO responde en esa IP:puerto.' -ForegroundColor Yellow
    Write-Host '  El bridge arrancara igual y reintentara. Comprueba:' -ForegroundColor Yellow
    Write-Host '    - que la Atomstack esta encendida y en la misma WiFi'
    Write-Host '    - que la IP es la suya (router / panel)'
    Write-Host '    - el puerto (8080 en este modelo; algunos usan 23)'
}

# ── 6. Arranque automatico al iniciar sesion ──────────────────────────────
Write-Host ''
$taskName = 'EnkiBridgeGRBL'
$taskOk = $false
try {
    $action  = New-ScheduledTaskAction -Execute (Get-Command node).Source `
                                       -Argument (Join-Path $dir 'index.js') `
                                       -WorkingDirectory $dir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                                            -StartWhenAvailable -RestartCount 999 `
                                            -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
                           -Settings $set -Description 'Bridge GRBL Enki (Atomstack A20 Pro V2)' -Force | Out-Null
    $taskOk = $true
    Write-Host "  Tarea programada '$taskName' creada (arranca al iniciar sesion)."
} catch {
    Write-Host "  AVISO: no se pudo crear la tarea '$taskName': $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Arrancalo a mano con: $dir\start.bat" -ForegroundColor Yellow
}

# ── 7. Arrancar ahora ─────────────────────────────────────────────────────
if ($taskOk) {
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
} else {
    Start-Process -FilePath 'node' -ArgumentList "`"$(Join-Path $dir 'index.js')`"" -WorkingDirectory $dir -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

Write-Host ''
Write-Host '=== Listo ===' -ForegroundColor Cyan
Write-Host ''
Write-Host "  Carpeta:  $dir"
Write-Host "  Logs:     schtasks /Query /TN $taskName /V /FO LIST"
Write-Host "  Parar:    schtasks /End /TN $taskName"
Write-Host "  Arrancar: schtasks /Run /TN $taskName"
Write-Host "  Manual:   $dir\start.bat   (abre una ventana con los logs en vivo)"
Write-Host ''
Write-Host '  Desde Enki se vera como bridge.grbl.estado_push.' -ForegroundColor Green
Write-Host '  Si el VPS tiene el suyo arrancado, PARALO: compite por los mismos topics.'
Write-Host ''
Write-Host '  (Pulsa Enter para cerrar esta ventana)'
Read-Host | Out-Null
