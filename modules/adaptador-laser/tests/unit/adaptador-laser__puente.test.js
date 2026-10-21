'use strict';
const assert = require('assert');
const AdaptadorLaserReflejo = require('../../index.js');

// =============================================================
// Stubs
// =============================================================
function makeStubs() {
  const publicados = [];
  const suscripciones = {};
  const eventBus = {
    publish: (ev, data) => {
      publicados.push({ ev, data });
      if (suscripciones[ev]) suscripciones[ev].forEach(fn => fn(data));
    },
    subscribe: (ev, fn) => {
      if (!suscripciones[ev]) suscripciones[ev] = [];
      suscripciones[ev].push(fn);
      return () => { suscripciones[ev] = suscripciones[ev].filter(f => f !== fn); };
    }
  };
  const logger = { info: () => {}, error: () => {} };
  const metrics = { increment: () => {} };
  return { publicados, suscripciones, eventBus, logger, metrics };
}

function makeModulo({ rpcBridgeResponse, subscribeBridgeData } = {}) {
  const m = new AdaptadorLaserReflejo();
  const stubs = makeStubs();
  m.eventBus = stubs.eventBus;
  m.logger = stubs.logger;
  m.metrics = stubs.metrics;
  if (rpcBridgeResponse !== undefined) {
    m._rpcBridge = async () => rpcBridgeResponse;
  }
  const bridgeSubs = {};
  m._subscribeBridge = (topic, handler) => {
    if (!bridgeSubs[topic]) bridgeSubs[topic] = [];
    bridgeSubs[topic].push(handler);
    if (subscribeBridgeData && subscribeBridgeData[topic]) {
      for (const d of subscribeBridgeData[topic]) handler(d);
    }
    return () => { bridgeSubs[topic] = (bridgeSubs[topic] || []).filter(f => f !== handler); };
  };
  return { m, bridgeSubs, ...stubs };
}

// =============================================================
// Tests
// =============================================================
const tests = [];

// ── enviar_gcode ──────────────────────────────────────────────

tests.push({
  name: 'enviar_gcode ok -> confirmacion + lineas',
  fn: async () => {
    const { m, publicados } = makeModulo({
      rpcBridgeResponse: { ok: true, lineas: 5, request_id: 'r1' }
    });
    const res = await m._enviarGcode({ project_id: 'p1', gcode: 'G28\nG1 X10\nG1 Y10' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.lineas, 5);
    assert.strictEqual(res.data.confirmado, true);
    assert.ok(!publicados.some(p => p.ev === 'enviar_gcode.failed'));
  }
});

tests.push({
  name: 'enviar_gcode gcode vacio -> 400 + enviar_gcode.failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    const res = await m._enviarGcode({ project_id: 'p1', gcode: '   ' });
    assert.strictEqual(res.status, 400);
    assert.ok(publicados.some(p => p.ev === 'enviar_gcode.failed' && p.data.motivo === 'gcode_vacio'));
  }
});

tests.push({
  name: 'enviar_gcode sin gcode -> 400',
  fn: async () => {
    const { m } = makeModulo();
    const res = await m._enviarGcode({ project_id: 'p1' });
    assert.strictEqual(res.status, 400);
  }
});

tests.push({
  name: 'enviar_gcode bridge timeout -> 503 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo({ rpcBridgeResponse: null });
    const res = await m._enviarGcode({ project_id: 'p1', gcode: 'G28' });
    assert.strictEqual(res.status, 503);
    assert.ok(publicados.some(p => p.ev === 'enviar_gcode.failed' && p.data.motivo === 'bridge_sin_respuesta'));
  }
});

tests.push({
  name: 'enviar_gcode bridge rechazo -> 502 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo({ rpcBridgeResponse: { ok: false, error: 'grbl_alarm' } });
    const res = await m._enviarGcode({ project_id: 'p1', gcode: 'G28' });
    assert.strictEqual(res.status, 502);
    assert.ok(publicados.some(p => p.ev === 'enviar_gcode.failed' && p.data.motivo === 'bridge_rechazo'));
  }
});

tests.push({
  name: 'enviar_gcode recibe progreso_push y lo re-emite',
  fn: async () => {
    const { m, publicados } = makeModulo({
      rpcBridgeResponse: { ok: true, lineas: 3, request_id: 'r1' },
      subscribeBridgeData: {
        'bridge.grbl.progreso_push': [
          { data: { linea: 1, total: 3, progreso: 0.33 } },
          { data: { linea: 2, total: 3, progreso: 0.66 } }
        ]
      }
    });
    const res = await m._enviarGcode({ project_id: 'p1', gcode: 'G28\nG1 X10\nG1 Y10' });
    assert.strictEqual(res.status, 200);
    const progresos = publicados.filter(p => p.ev === 'adaptador-laser.progreso');
    assert.strictEqual(progresos.length, 2);
    assert.strictEqual(progresos[0].data.linea, 1);
    assert.strictEqual(progresos[1].data.progreso, 0.66);
  }
});

// ── iniciar_trabajo ───────────────────────────────────────────

tests.push({
  name: 'iniciar_trabajo ok -> confirmacion',
  fn: async () => {
    const { m, publicados } = makeModulo({ rpcBridgeResponse: { ok: true, request_id: 'r1' } });
    const res = await m._iniciarTrabajo({ project_id: 'p1', comando: '!' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.confirmado, true);
    assert.ok(!publicados.some(p => p.ev === 'iniciar_trabajo.failed'));
  }
});

tests.push({
  name: 'iniciar_trabajo sin comando -> 400 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    const res = await m._iniciarTrabajo({ project_id: 'p1' });
    assert.strictEqual(res.status, 400);
    assert.ok(publicados.some(p => p.ev === 'iniciar_trabajo.failed' && p.data.motivo === 'comando_requerido'));
  }
});

tests.push({
  name: 'iniciar_trabajo bridge timeout -> 503 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo({ rpcBridgeResponse: null });
    const res = await m._iniciarTrabajo({ project_id: 'p1', comando: '$H' });
    assert.strictEqual(res.status, 503);
    assert.ok(publicados.some(p => p.ev === 'iniciar_trabajo.failed' && p.data.motivo === 'bridge_sin_respuesta'));
  }
});

tests.push({
  name: 'iniciar_trabajo bridge rechazo -> 502 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo({ rpcBridgeResponse: { ok: false, error: 'unknown_cmd' } });
    const res = await m._iniciarTrabajo({ project_id: 'p1', comando: 'INVALID' });
    assert.strictEqual(res.status, 502);
    assert.ok(publicados.some(p => p.ev === 'iniciar_trabajo.failed' && p.data.motivo === 'bridge_rechazo'));
  }
});

// ── observar_estado ───────────────────────────────────────────

tests.push({
  name: 'observar_estado abre stream via bridge',
  fn: async () => {
    const { m, publicados } = makeModulo({
      rpcBridgeResponse: { ok: true, stream: 'abierto', request_id: 'r1' }
    });
    const res = await m._observarEstado({ project_id: 'p1' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.stream, 'abierto');
    assert.strictEqual(res.data.via, 'bridge');
  }
});

tests.push({
  name: 'observar_estado ya abierto -> devuelve ya_abierto',
  fn: async () => {
    const { m } = makeModulo({ rpcBridgeResponse: { ok: true, stream: 'abierto', request_id: 'r1' } });
    await m._observarEstado({ project_id: 'p1' });
    const res2 = await m._observarEstado({ project_id: 'p1' });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.stream, 'ya_abierto');
  }
});

tests.push({
  name: 'observar_estado recibe estado_push y emite estado_crudo interpretado',
  fn: async () => {
    const { m, publicados, bridgeSubs } = makeModulo({
      rpcBridgeResponse: { ok: true, stream: 'abierto', request_id: 'r1' }
    });
    await m._observarEstado({ project_id: 'p1' });
    const handlers = bridgeSubs['bridge.grbl.estado_push'];
    assert.ok(handlers && handlers.length > 0, 'debe suscribirse a estado_push');
    handlers[0]({
      data: {
        estado_maquina: 'Run',
        estado_sistema: 'grabando',
        mpos: { x: 10.5, y: 20.3, z: 0 },
        feed: 1000,
        spindle: 500
      }
    });
    const emitido = publicados.find(p => p.ev === 'adaptador-laser.estado_crudo');
    assert.ok(emitido, 'debe emitir estado_crudo');
    assert.strictEqual(emitido.data.estado_sistema.estado, 'grabando');
    assert.strictEqual(emitido.data.estado_sistema.pos_x, 10.5);
    assert.strictEqual(emitido.data.estado_sistema.pos_y, 20.3);
    assert.strictEqual(emitido.data.estado_sistema.laser_activo, true);
  }
});

tests.push({
  name: 'observar_estado bridge timeout -> 503 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo({ rpcBridgeResponse: null });
    const res = await m._observarEstado({ project_id: 'p1' });
    assert.strictEqual(res.status, 503);
    assert.ok(publicados.some(p => p.ev === 'observar_estado.failed' && p.data.motivo === 'bridge_sin_respuesta'));
  }
});

// ── interpretarEstado ─────────────────────────────────────────

tests.push({
  name: 'interpretarEstado: Run -> grabando, laser_activo=true',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ estado_maquina: 'Run', estado_sistema: 'grabando', mpos: { x: 1, y: 2, z: 0 }, feed: 800, spindle: 1000 });
    assert.strictEqual(s.estado, 'grabando');
    assert.strictEqual(s.estado_maquina, 'Run');
    assert.strictEqual(s.laser_activo, true);
    assert.strictEqual(s.pos_x, 1);
    assert.strictEqual(s.feed, 800);
    assert.strictEqual(s.spindle, 1000);
  }
});

tests.push({
  name: 'interpretarEstado: Idle -> libre, laser_activo=false',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ estado_maquina: 'Idle', estado_sistema: 'libre', mpos: { x: 0, y: 0, z: 0 }, feed: 0, spindle: 0 });
    assert.strictEqual(s.estado, 'libre');
    assert.strictEqual(s.laser_activo, false);
  }
});

tests.push({
  name: 'interpretarEstado: Hold -> pausado',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ estado_maquina: 'Hold', estado_sistema: 'pausado' });
    assert.strictEqual(s.estado, 'pausado');
  }
});

tests.push({
  name: 'interpretarEstado: Alarm -> alarma',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ estado_maquina: 'Alarm', estado_sistema: 'alarma' });
    assert.strictEqual(s.estado, 'alarma');
    assert.strictEqual(s.estado_maquina, 'Alarm');
  }
});

tests.push({
  name: 'interpretarEstado: Door -> puerta_abierta',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ estado_maquina: 'Door', estado_sistema: 'puerta_abierta' });
    assert.strictEqual(s.estado, 'puerta_abierta');
  }
});

tests.push({
  name: 'interpretarEstado: Home -> homing',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ estado_maquina: 'Home', estado_sistema: 'homing' });
    assert.strictEqual(s.estado, 'homing');
  }
});

tests.push({
  name: 'interpretarEstado: crudo vacio -> desconocido con huecos null',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({});
    assert.strictEqual(s.estado, 'desconocido');
    assert.strictEqual(s.pos_x, 0);
    assert.strictEqual(s.pos_y, 0);
    assert.strictEqual(s.feed, null);
    assert.strictEqual(s.spindle, null);
    assert.strictEqual(s.laser_activo, false);
  }
});

// ── metadata ──────────────────────────────────────────────────

tests.push({
  name: 'name y version correctos',
  fn: async () => {
    const { m } = makeModulo();
    assert.strictEqual(m.name, 'adaptador-laser');
    assert.strictEqual(m.version, 'reflejo-0.1.0');
    assert.strictEqual(typeof m.onEnviarGcodeRequest, 'function');
    assert.strictEqual(typeof m.onIniciarTrabajoRequest, 'function');
    assert.strictEqual(typeof m.onObservarEstadoRequest, 'function');
    assert.ok(m instanceof AdaptadorLaserReflejo);
  }
});

// =============================================================
// Runner inline
// =============================================================
(async () => {
  let ok = 0, fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      ok++;
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      fail++;
      console.error(`  FAIL ${t.name}\n       ${err.message}`);
    }
  }
  console.log(`\nadaptador-laser: ${ok}/${tests.length} OK`);
  process.exit(fail === 0 ? 0 : 1);
})();
