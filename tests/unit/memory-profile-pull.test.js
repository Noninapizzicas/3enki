'use strict';

/**
 * memory-user-profile · entrega por PULL (slice 2 de 3).
 *
 * Igual que summary: el push perdía la carrera; ahora ai-gateway TIRA los facts.
 * Fija handleLeer (lectura de facts), el responder de bus, y el compose del nervio.
 *
 * Ejecutar: node tests/unit/memory-profile-pull.test.js
 */

const assert = require('assert');
const Profile = require('../../modules/conversacion/memory-user-profile');
const AiGateway = require('../../modules/conversacion/ai-gateway');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoProfile(rows = []) {
  const publicados = [];
  const m = new Profile();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {}, gauge() {} };
  m.config = {};
  m.eventBus = {
    publish: (event, payload) => {
      publicados.push({ event, payload });
      if (event === 'db.query.request') {
        queueMicrotask(() => m.onDbQueryResponse({ request_id: payload.request_id, rows }));
      }
    }
  };
  return { m, publicados };
}

test('handleLeer sin user_id -> 400 INVALID_INPUT', async () => {
  const { m } = nuevoProfile();
  const res = await m.handleLeer({ project_id: 'p1' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
});

test('handleLeer devuelve los facts acumulados', async () => {
  const { m } = nuevoProfile([{ fact: 'el usuario se llama Nonina' }, { fact: 'el usuario es vegano' }]);
  const res = await m.handleLeer({ project_id: 'p1', user_id: 'u1' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.count, 2);
  assert.ok(res.data.facts.includes('el usuario es vegano'));
});

test('handleLeer sin facts -> array vacío (count 0)', async () => {
  const { m } = nuevoProfile([]);
  const res = await m.handleLeer({ project_id: 'p1', user_id: 'nuevo' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.count, 0);
});

test('onLeerRequest publica memory.profile.leer.response correlado', async () => {
  const { m, publicados } = nuevoProfile([{ fact: 'el usuario prefiere food cost bajo' }]);
  await m.onLeerRequest({ data: { request_id: 'req-9', project_id: 'p1', user_id: 'u1' } });
  const resp = publicados.find(p => p.event === 'memory.profile.leer.response');
  assert.ok(resp);
  assert.strictEqual(resp.payload.request_id, 'req-9');
  assert.strictEqual(resp.payload.status, 200);
  assert.deepStrictEqual(resp.payload.data.facts, ['el usuario prefiere food cost bajo']);
});

test('ai-gateway: _composePerfilSection es silenciosa y lista los facts', () => {
  const g = new AiGateway();
  const s = g._composePerfilSection(['el usuario es vegano', 'el usuario se llama Nonina']);
  assert.ok(/# LO QUE SABEMOS DEL USUARIO/.test(s));
  assert.ok(s.includes('vegano'));
  assert.ok(/SILENCIO/.test(s));
  assert.ok(/NO lo recites/.test(s));
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[memory-profile-pull] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[memory-profile-pull] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
