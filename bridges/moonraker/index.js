'use strict';

const mqtt = require('mqtt');
const MoonrakerClient = require('./moonraker-client');
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

// ── Logger mínimo ─────────────────────────────────────────────

const log = {
  info:  (ev, d) => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info',  ev, ...d })),
  error: (ev, d) => console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', ev, ...d }))
};

// ── Mock de Moonraker (para testear sin impresora) ────────────

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
    print_stats: { state: mock._state, message: '', filename: 'mock.gcode', filament_used: 0,
      print_duration: 0, total_duration: 0, current_layer: 0, total_layer: 10, start_time: 0 },
    virtual_sdcard: { progress: mock._progreso, is_active: false, file_position: 0 },
    extruder: { temperature: 200, target: 200, pressure_advance: 0.04 },
    heater_bed: { temperature: 60, target: 60 },
    toolhead: { position: [0, 0, 0, 0], status: 'Idle', homed_axes: 'xyz', print_time: 0 },
    gcode_move: { gcode_position: [0, 0, 0, 0], absolute_coordinates: true, absolute_extrude: true, extrude_factor: 1, speed_factor: 1 },
    pause_resume: { is_paused: false },
    idle_timeout: { state: 'Printing' },
    display_status: { message: '', progress: mock._progreso },
    filament_switch_sensor: { filament_detected: true },
    fan: { speed: 1.0, rpm: 5200 },
    mcu: { mcu_state: 'ready', mcu_avg_voltage: 24.5, mcu_current_frequency: 70000000, mcu_last_avr8_est: 0, mcu_last_est: 0, mcu_temp: 42 },
    system_stats: { sysload: 0.2, total_memory: 8388608, available_memory: 4194304 }
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

// ── Moonraker (real o mock) ───────────────────────────────────

const moonraker = MOCK
  ? crearMock()
  : new MoonrakerClient({ ...config.moonraker, logger: log });

// ── MQTT ──────────────────────────────────────────────────────

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

// ── Handlers ──────────────────────────────────────────────────

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

// ── Graceful shutdown ─────────────────────────────────────────

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

// ── Arranque ──────────────────────────────────────────────────

log.info('bridge.arrancado', {
  modo: MOCK ? 'MOCK' : 'REAL',
  moonraker: MOCK ? 'simulado' : `${config.moonraker.host}:${config.moonraker.port}`,
  broker: config.mqtt.broker,
  topics: TOPICS
});
