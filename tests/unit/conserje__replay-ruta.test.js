'use strict';

/**
 * REPLAY SUGERENTE — el conserje enchufado al destilador (sesión ruflo/ReasoningBank).
 *
 * El conserje, cuando el interruptor 'conserje-rutas' está ON, pregunta a destilador.ruta
 * "desde la última capacidad tocada, ¿qué ruta aprendida suele seguir?" y, si hay una ruta
 * probada (ocurrencias >= umbral), ofrece la continuación como empujón (una vez, con cooldown).
 *
 * Prueba _tickRutas con un eventBus stub que hace de destilador. Sin fs, sin LLM, sin frontend.
 *
 * Ejecutar: node tests/unit/conserje__replay-ruta.test.js
 */

const assert = require('assert');

const Mod = require('../../modules/conserje');
const Conserje = Mod.default || Mod;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Conserje con un eventBus stub: destilador.ruta.request -> responde con `rutaResp`.
function nuevoConserje({ rutaResp, ultimaCapacidad = 'recetas', activoRutas = true }) {
  const c = new Conserje();
  const subs = {};
  c._published = [];
  c.eventBus = {
    subscribe(ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return () => {}; },
    publish(ev, payload) {
      c._published.push({ ev, payload });
      if (ev === 'destilador.ruta.request') {
        const resp = { request_id: payload.request_id, status: 'ok', data: { rutas: rutaResp ? [rutaResp] : [] } };
        (subs['destilador.ruta.response'] || []).forEach(fn => fn({ data: resp }));
      }
    }
  };
  c.logger = { info() {}, warn() {} };
  c.metrics = { increment() {} };
  c.activoRutas = activoRutas;
  c.umbralRuta = 3;
  c.cooldownMs = 60000;
  c.pendientes = new Map();
  c.cooldown = new Map();
  c.estados = new Map([['p', { usadas: new Set(), intentadas: new Set(), ultimaCapacidad }]]);
  return c;
}

const RUTA_OK = {
  firma: 'f1',
  secuencia: ['recetas.obtener', 'escandallo.costear', 'carta.add_product'],
  continuacion: ['escandallo.costear', 'carta.add_product'],
  ocurrencias: 9
};

test('ruta aprendida probada -> emite empujón tipo "ruta" con la continuación', async () => {
  const c = nuevoConserje({ rutaResp: RUTA_OK });
  await c._tickRutas(['p']);
  const emp = c.pendientes.get('p');
  assert.ok(emp, 'debe haber empujón pendiente');
  assert.strictEqual(emp.tipo, 'ruta');
  assert.deepStrictEqual(emp.ruta, ['escandallo.costear', 'carta.add_product']);
  assert.ok(/escandallo → carta/.test(emp.mensaje), 'mensaje legible con dominios');
  assert.ok(c._published.some(p => p.ev === 'conserje.empujon'));
});

test('interruptor conserje-rutas OFF -> no pregunta ni empuja', async () => {
  const c = nuevoConserje({ rutaResp: RUTA_OK, activoRutas: false });
  // _tick no debe disparar la pasada de rutas con el switch OFF
  c.activo = false;
  await c._tick();
  assert.strictEqual(c.pendientes.size, 0);
});

test('ruta poco probada (ocurrencias < umbral) -> no empuja (solo lo probado)', async () => {
  const c = nuevoConserje({ rutaResp: { ...RUTA_OK, ocurrencias: 1 } });
  await c._tickRutas(['p']);
  assert.strictEqual(c.pendientes.size, 0);
});

test('sin ruta aprendida desde aquí -> no inventa', async () => {
  const c = nuevoConserje({ rutaResp: null });
  await c._tickRutas(['p']);
  assert.strictEqual(c.pendientes.size, 0);
});

test('sin ultimaCapacidad -> no pregunta', async () => {
  const c = nuevoConserje({ rutaResp: RUTA_OK, ultimaCapacidad: null });
  await c._tickRutas(['p']);
  assert.strictEqual(c.pendientes.size, 0);
  assert.ok(!c._published.some(p => p.ev === 'destilador.ruta.request'));
});

test('el empujón de brecha tiene prioridad: si ya hay pendiente, la ruta no lo pisa', async () => {
  const c = nuevoConserje({ rutaResp: RUTA_OK });
  c.pendientes.set('p', { tipo: 'desbloqueo', recurso: 'marca', mensaje: 'brecha' });
  await c._tickRutas(['p']);
  assert.strictEqual(c.pendientes.get('p').tipo, 'desbloqueo');   // no fue pisado por la ruta
});

test('cooldown: la misma ruta no se ofrece dos veces seguidas', async () => {
  const c = nuevoConserje({ rutaResp: RUTA_OK });
  await c._tickRutas(['p']);
  c.pendientes.delete('p');            // el nervio la consumió
  await c._tickRutas(['p']);           // segundo tick inmediato
  assert.strictEqual(c.pendientes.size, 0, 'el cooldown evita repetir');
});

// ── runner (soporta tests async) ──
(async () => {
  let passed = 0, failed = 0;
  const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { failed++; fails.push({ name, err }); }
  }
  if (failed === 0) {
    console.log(`\n[conserje__replay-ruta] OK ${passed}/${tests.length}`);
    process.exit(0);
  }
  console.error(`\n[conserje__replay-ruta] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of fails) { console.error(`  x ${name}\n    ${err.message}`); }
  process.exit(1);
})();
