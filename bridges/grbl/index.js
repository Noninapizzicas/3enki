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
