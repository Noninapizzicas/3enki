'use strict';

/**
 * carta-digital — REPUBLICACIÓN AUTOMÁTICA (v2.25.0).
 *
 * El bundle de la PWA es ESTÁTICO: hasta v2.24 cada cambio de carta exigía pulsar `publicar` a
 * mano, y si el dueño no lo hacía la web se quedaba VIEJA EN SILENCIO. Ahora el proyector
 * re-hornea solo, con tres reglas que lo mantienen honesto:
 *   1) SOLO proyectos que YA publicaron (la verdad es el DISCO: fs.exists /www/index.html).
 *   2) UN horneado por edición (debounce: N carta.editada → 1 horneado).
 *   3) Interruptor por proyecto (opciones_visualizacion.auto_publicar === false).
 * Y nada es silencioso: cada fallo emite cartadigital.republicar.fallido.
 *
 * Ejecutar: node tests/unit/carta-digital__republicacion-auto.test.js
 */

const assert = require('assert');
const CartaDigital = require('../../modules/pizzepos/carta-digital');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const esperar = ms => new Promise(r => setTimeout(r, ms));

const PID = 'aaaa1111-2222-3333-4444-555566667777';

// Harness: módulo + stubs de rpc/publicar. `opciones` = fs.exists (bundle en disco), `config`
// = config del canal, `publicar` = cómo responde _publicarBundle.
function nuevo({ bundle = true, auto = null, publicar = async () => ({ status: 200, data: { alojada_url: '/a/demo' } }) } = {}) {
  const m = new CartaDigital();
  m.repubMs = 20;                                     // ventana corta para el test
  m.logs = []; m.responses = []; m.metricsCalls = []; m.horneados = [];
  m.logger = { info: (e, p) => m.logs.push(['info', e, p]), warn: (e, p) => m.logs.push(['warn', e, p]), error: (e, p) => m.logs.push(['error', e, p]) };
  m.metrics = { increment: (n, l) => m.metricsCalls.push([n, l]) };
  m.eventBus = { publish: (ev, p) => m.responses.push([ev, p]), subscribe: () => () => {} };
  m._rpc = async (ev) => {
    if (ev === 'fs.exists.request') return bundle ? { exists: true, path: '/www/index.html' } : { exists: false };
    if (ev === 'fs.read.request') return { content: JSON.stringify({ opciones_visualizacion: auto === null ? {} : { auto_publicar: auto } }) };
    return null;
  };
  m._publicarBundle = async (project_id) => { m.horneados.push(project_id); return publicar(); };
  return m;
}

const señal = (m, ev = 'carta.editada') => m._autoPublicar({ data: { project_id: PID, motivo: 'update_prices' } });
const tiene = (m, ev) => m.responses.some(r => r[0] === ev);

test('sin bundle en disco → NO republica (publicar la 1ª vez es acto del dueño)', async () => {
  const m = nuevo({ bundle: false });
  await señal(m); await esperar(60);
  assert.strictEqual(m.horneados.length, 0);
});

test('con bundle → republica UNA vez aunque lleguen 5 señales seguidas (coalescencia)', async () => {
  const m = nuevo();
  for (let i = 0; i < 5; i++) { await señal(m); await esperar(2); }
  await esperar(80);
  assert.strictEqual(m.horneados.length, 1, `esperaba 1 horneado, hubo ${m.horneados.length}`);
  assert.strictEqual(m.horneados[0], PID);
  assert.ok(m.logs.some(l => l[1] === 'carta-digital.republicado'));
  assert.ok(m.metricsCalls.some(c => c[0] === 'cartadigital.republicado'));
});

test('interruptor: auto_publicar=false en el config del canal → no republica', async () => {
  const m = nuevo({ auto: false });
  await señal(m); await esperar(60);
  assert.strictEqual(m.horneados.length, 0);
});

test('fallo al republicar (412 activo) → NO silencioso: warn + métrica + evento', async () => {
  const m = nuevo({ publicar: async () => ({ status: 412, error: { code: 'PRECONDITION_FAILED', message: 'otro proyecto activo' } }) });
  await señal(m); await esperar(60);
  assert.strictEqual(m.horneados.length, 1);
  assert.ok(m.logs.some(l => l[1] === 'carta-digital.republicar.omitido'));
  assert.ok(m.metricsCalls.some(c => c[0] === 'cartadigital.republicar.fallido'));
  const ev = m.responses.find(r => r[0] === 'cartadigital.republicar.fallido');
  assert.ok(ev, 'debe emitir cartadigital.republicar.fallido');
  assert.strictEqual(ev[1].status, 412);
});

test('onUnload → los timers pendientes se cancelan (no hornea tras descargar)', async () => {
  const m = nuevo();
  await señal(m);
  await m.onUnload();
  await esperar(60);
  assert.strictEqual(m.horneados.length, 0);
});

test('señal sin project_id → no arranca timer', async () => {
  const m = nuevo();
  m._autoPublicar({ data: { motivo: 'x' } });
  await esperar(40);
  assert.strictEqual(m.horneados.length, 0);
});

// ── el guard de _publicarBundle (fs multi-tenant) ──
function paraGuard(activos, ultimoActivo) {
  const m = nuevo();
  delete m._publicarBundle;                          // el stub de nuevo() tapa el real → se quita
  m.activos = activos; m.ultimoActivo = ultimoActivo;
  m._proyectarPublica = async () => ({ status: 200, data: { branding: {}, productos: [], categorias: [] } });
  m._rpc = async (ev) => (ev === 'project.ensure-feature.request' ? { status: 200 } : { status: 200 });
  m._catalogoIngredientes = async () => ({ catalogo: [], sin_precio: 0 });
  return m;
}

test('guard: proyecto CONOCIDO por el fs → publica aunque el activo global sea otro', async () => {
  const otro = 'bbbb2222-3333-4444-5555-666677778888';
  const m = paraGuard(new Map([[PID, { name: 'the-pirate', slug: 'the-pirate' }], [otro, { name: 'nonina', slug: 'nonina' }]]), otro);
  const r = await m._publicarBundle(PID);
  assert.strictEqual(r.status, 200, JSON.stringify(r.error));
});

test('guard: proyecto DESCONOCIDO y activo distinto → 412 (no escribe en otro proyecto)', async () => {
  const otro = 'bbbb2222-3333-4444-5555-666677778888';
  const m = paraGuard(new Map([[otro, { name: 'nonina', slug: 'nonina' }]]), otro);
  const r = await m._publicarBundle(PID);
  assert.strictEqual(r.status, 412);
  assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[carta-digital__republicacion-auto] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[carta-digital__republicacion-auto] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
