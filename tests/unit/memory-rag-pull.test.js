'use strict';

/**
 * memory-rag · entrega por PULL (slice 3 de 3).
 *
 * onMessageSaved deja de buscar+empujar: solo indexa y deja el embedding en stash.
 * La búsqueda se hace al PULL (handleBuscar) reusando ese vector — cero re-embedding
 * en el turno. Esta suite fija:
 *   - handleBuscar valida; sin stash → sin matches (best-effort);
 *   - busca top-K en el cache y NO se matchea a sí mismo;
 *   - el responder de bus publica memory.rag.buscar.response;
 *   - el nervio de ai-gateway compone la sección silenciosa.
 *
 * Ejecutar: node tests/unit/memory-rag-pull.test.js
 */

const assert = require('assert');
const Rag = require('../../modules/conversacion/memory-rag');
const AiGateway = require('../../modules/conversacion/ai-gateway');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevoRag() {
  const publicados = [];
  const m = new Rag();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {}, gauge() {} };
  m.config = { min_similarity: 0.5, top_k: 5 };
  m.eventBus = { publish: (event, payload) => { publicados.push({ event, payload }); } };
  // marca el cache del proyecto como ya cargado para que handleBuscar no lea DB
  m.schemaReady.add('p1');
  m.schemaReady.add('loaded:p1');
  return { m, publicados };
}

// inyecta un vector en el cache (project, user) como si estuviera indexado
function indexar(m, { message_id, content, vector }) {
  const bucket = m._getCacheBucket('p1', 'u1');
  bucket.push({ message_id, conversation_id: 'c1', role: 'user', content, vector, created_at: Date.now() });
}

test('handleBuscar sin conversation_id -> 400', async () => {
  const { m } = nuevoRag();
  const res = await m.handleBuscar({ project_id: 'p1', user_id: 'u1' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
});

test('sin stash (embedding aún no listo) -> 0 matches, best-effort', async () => {
  const { m } = nuevoRag();
  const res = await m.handleBuscar({ project_id: 'p1', user_id: 'u1', conversation_id: 'c1' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.matches, 0);
  assert.strictEqual(res.data.snippet, '');
});

test('busca top-K reusando el stash y NO se matchea a sí mismo', async () => {
  const { m } = nuevoRag();
  // historico: un mensaje afín (mismo vector) y el PROPIO mensaje actual
  indexar(m, { message_id: 'viejo', content: 'la masa de 48h queda brutal', vector: [1, 0, 0] });
  indexar(m, { message_id: 'actual', content: 'mensaje de ahora', vector: [1, 0, 0] });
  // stash = embedding del mensaje actual (id 'actual')
  m.lastQuery.set('c1', { vector: [1, 0, 0], message_id: 'actual', ts: Date.now() });
  const res = await m.handleBuscar({ project_id: 'p1', user_id: 'u1', conversation_id: 'c1' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.matches, 1, 'debe encontrar 1 (el viejo), no 2');
  assert.ok(/masa de 48h/.test(res.data.snippet));
  assert.ok(!/mensaje de ahora/.test(res.data.snippet), 'no debe incluirse a sí mismo');
});

test('por debajo de min_similarity -> 0 matches', async () => {
  const { m } = nuevoRag();
  indexar(m, { message_id: 'otro', content: 'algo no relacionado', vector: [0, 1, 0] });
  m.lastQuery.set('c1', { vector: [1, 0, 0], message_id: 'actual', ts: Date.now() }); // ortogonal → sim 0
  const res = await m.handleBuscar({ project_id: 'p1', user_id: 'u1', conversation_id: 'c1' });
  assert.strictEqual(res.data.matches, 0);
});

test('onBuscarRequest publica memory.rag.buscar.response correlado', async () => {
  const { m, publicados } = nuevoRag();
  indexar(m, { message_id: 'viejo', content: 'pizza margarita', vector: [1, 0, 0] });
  m.lastQuery.set('c1', { vector: [1, 0, 0], message_id: 'actual', ts: Date.now() });
  await m.onBuscarRequest({ data: { request_id: 'req-r', project_id: 'p1', user_id: 'u1', conversation_id: 'c1' } });
  const resp = publicados.find(p => p.event === 'memory.rag.buscar.response');
  assert.ok(resp);
  assert.strictEqual(resp.payload.request_id, 'req-r');
  assert.strictEqual(resp.payload.status, 200);
  assert.strictEqual(resp.payload.data.matches, 1);
});

test('ai-gateway: _composeRagSection es silenciosa y lleva el snippet', () => {
  const g = new AiGateway();
  const s = g._composeRagSection('- [Usuario, sim=0.91]: la masa de 48h');
  assert.ok(/# MENSAJES PREVIOS RELEVANTES/.test(s));
  assert.ok(s.includes('masa de 48h'));
  assert.ok(/SILENCIO/.test(s));
  assert.ok(/NO lo recites/.test(s));
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[memory-rag-pull] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[memory-rag-pull] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
