'use strict';
const assert = require('assert');
const AdaptadorImpresoraReflejo = require('../../index.js');

// =============================================================
// Stubs
// =============================================================
function makeStubs() {
  const publicados = [];
  const eventBus = {
    publish: (ev, data) => { publicados.push({ ev, data }); },
    subscribe: () => () => {}
  };
  const logger = { info: () => {}, error: () => {} };
  const metrics = { increment: () => {} };
  return { publicados, eventBus, logger, metrics };
}

function makeModulo() {
  const m = new AdaptadorImpresoraReflejo();
  const stubs = makeStubs();
  m.eventBus = stubs.eventBus;
  m.logger = stubs.logger;
  m.metrics = stubs.metrics;
  return { m, ...stubs };
}

// Impresora fake que reporta por push
function makeImpresora({ subirOk = true, iniciarOk = true, streamOk = true, crudos = [] } = {}) {
  return {
    subirGcode: async () => (subirOk ? { ok: true, id: 'gcode-1' } : { ok: false }),
    iniciarImpresion: async () => (iniciarOk ? { ok: true } : { ok: false }),
    observarEstado: async (onPush) => {
      if (!streamOk) return { ok: false };
      for (const c of crudos) onPush(c);
      return { ok: true, unsubscribe: () => {} };
    }
  };
}

// =============================================================
// Tests
// =============================================================
const tests = [];

tests.push({
  name: 'subir_gcode ok -> confirmacion + sin failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    m.registrarImpresora(makeImpresora());
    const res = await m._subirGcode({ project_id: 'p1', gcode: 'G28\nG1 X0' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.id, 'gcode-1');
    assert.strictEqual(res.data.confirmado, true);
    assert.ok(!publicados.some(p => p.ev === 'subir_gcode.failed'));
  }
});

tests.push({
  name: 'subir_gcode gcode vacio -> 400 + subir_gcode.failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    m.registrarImpresora(makeImpresora());
    const res = await m._subirGcode({ project_id: 'p1', gcode: '   ' });
    assert.strictEqual(res.status, 400);
    assert.ok(publicados.some(p => p.ev === 'subir_gcode.failed' && p.data.motivo === 'gcode_vacio'));
  }
});

tests.push({
  name: 'subir_gcode sin impresora -> 503 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    const res = await m._subirGcode({ project_id: 'p1', gcode: 'G28' });
    assert.strictEqual(res.status, 503);
    assert.ok(publicados.some(p => p.ev === 'subir_gcode.failed' && p.data.motivo === 'impresora_no_configurada'));
  }
});

tests.push({
  name: 'subir_gcode impresora rechaza -> 502 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    m.registrarImpresora(makeImpresora({ subirOk: false }));
    const res = await m._subirGcode({ project_id: 'p1', gcode: 'G28' });
    assert.strictEqual(res.status, 502);
    assert.ok(publicados.some(p => p.ev === 'subir_gcode.failed' && p.data.motivo === 'impresora_rechazo'));
  }
});

tests.push({
  name: 'iniciar_impresion ok -> confirmacion',
  fn: async () => {
    const { m, publicados } = makeModulo();
    m.registrarImpresora(makeImpresora());
    const res = await m._iniciarImpresion({ project_id: 'p1' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.ok(!publicados.some(p => p.ev === 'iniciar_impresion.failed'));
  }
});

tests.push({
  name: 'iniciar_impresion sin impresora -> 503 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    const res = await m._iniciarImpresion({ project_id: 'p1' });
    assert.strictEqual(res.status, 503);
    assert.ok(publicados.some(p => p.ev === 'iniciar_impresion.failed'));
  }
});

tests.push({
  name: 'observar_estado abre stream y emite estado_crudo interpretado por push',
  fn: async () => {
    const { m, publicados } = makeModulo();
    const crudo = {
      data: {
        print_stats: { state: 'printing', filament_used: 123.456, print_duration: 60, total_duration: 120, current_layer: 3, total_layer: 10 },
        virtual_sdcard: { progress: 0.3 },
        filament_switch_sensor: { filament_detected: true },
        extruder: { temperature: 200.5, target: 210 },
        heater_bed: { temperature: 55, target: 60 },
        idle_timeout: { state: 'Idle' }
      }
    };
    m.registrarImpresora(makeImpresora({ crudos: [crudo] }));
    const res = await m._observarEstado({ project_id: 'p1' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.stream, 'abierto');
    const emitido = publicados.find(p => p.ev === 'adaptador-impresora.estado_crudo');
    assert.ok(emitido, 'debe emitir estado_crudo');
    assert.strictEqual(emitido.data.estado_sistema.estado, 'imprimiendo');
    assert.strictEqual(emitido.data.estado_sistema.progress, 0.3);
    assert.strictEqual(emitido.data.estado_sistema.filament_used_mm, 123.46);
    assert.strictEqual(emitido.data.estado_sistema.current_layer, 3);
    assert.strictEqual(emitido.data.estado_sistema.filament_detected, true);
  }
});

tests.push({
  name: 'observar_estado sin impresora -> 503 + failed',
  fn: async () => {
    const { m, publicados } = makeModulo();
    const res = await m._observarEstado({ project_id: 'p1' });
    assert.strictEqual(res.status, 503);
    assert.ok(publicados.some(p => p.ev === 'iniciar_impresion.failed'));
  }
});

tests.push({
  name: 'interpretarEstado: complete -> completado',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ data: { print_stats: { state: 'complete' } } });
    assert.strictEqual(s.estado, 'completado');
  }
});

tests.push({
  name: 'interpretarEstado: error -> fallo',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({ data: { print_stats: { state: 'error' } } });
    assert.strictEqual(s.estado, 'fallo');
  }
});

tests.push({
  name: 'interpretarEstado: paused o pause_resume.is_paused -> pausado',
  fn: async () => {
    const { m } = makeModulo();
    const s1 = m._interpretarEstado({ data: { print_stats: { state: 'paused' } } });
    assert.strictEqual(s1.estado, 'pausado');
    const s2 = m._interpretarEstado({ data: { print_stats: { state: 'printing' }, pause_resume: { is_paused: true } } });
    assert.strictEqual(s2.estado, 'pausado');
  }
});

tests.push({
  name: 'interpretarEstado: standby/idle/ready -> desconectado',
  fn: async () => {
    const { m } = makeModulo();
    assert.strictEqual(m._interpretarEstado({ data: { print_stats: { state: 'standby' } } }).estado, 'desconectado');
    assert.strictEqual(m._interpretarEstado({ data: { print_stats: { state: 'idle' } } }).estado, 'desconectado');
    assert.strictEqual(m._interpretarEstado({ data: { print_stats: { state: 'ready' } } }).estado, 'desconectado');
  }
});

tests.push({
  name: 'interpretarEstado: crudo vacio -> desconectado con huecos null',
  fn: async () => {
    const { m } = makeModulo();
    const s = m._interpretarEstado({});
    assert.strictEqual(s.estado, 'desconectado');
    assert.strictEqual(s.progress, null);
    assert.strictEqual(s.filament_used_mm, null);
    assert.strictEqual(s.current_layer, null);
  }
});

tests.push({
  name: 'handlers delegan en _atender con 4 args y this.name/version correctos',
  fn: async () => {
    const { m } = makeModulo();
    assert.strictEqual(m.name, 'adaptador-impresora');
    assert.strictEqual(m.version, 'reflejo-0.1.0');
    assert.strictEqual(typeof m.onSubirGcodeRequest, 'function');
    assert.strictEqual(typeof m.onIniciarImpresionRequest, 'function');
    assert.strictEqual(typeof m.onObservarEstadoRequest, 'function');
    assert.ok(m instanceof AdaptadorImpresoraReflejo);
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
  console.log(`\nadaptador-impresora: ${ok}/${tests.length} OK`);
  process.exit(fail === 0 ? 0 : 1);
})();
