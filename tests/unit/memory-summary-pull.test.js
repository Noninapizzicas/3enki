'use strict';

/**
 * memory-conversation-summary · entrega por PULL (slice 1 de 3).
 *
 * El push (chat.context.enriched) perdía la carrera contra chat.prompt.ready.
 * Ahora ai-gateway TIRA el resumen en _executeLLM. Esta suite fija:
 *   - handleLeer valida y devuelve el resumen persistido (con bus de DB falso),
 *   - el responder de bus publica memory.summary.leer.response correlado,
 *   - el nervio de ai-gateway compone la sección silenciosa.
 *
 * Ejecutar: node tests/unit/memory-summary-pull.test.js
 */

const assert = require('assert');
const Summary = require('../../modules/conversacion/memory-conversation-summary');
const AiGateway = require('../../modules/conversacion/ai-gateway');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Módulo summary con un bus de DB falso: cada db.query.request se resuelve al
// instante devolviendo `rows` (o []), y captura los publish para inspección.
function nuevoSummary(rows = []) {
  const publicados = [];
  const m = new Summary();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {}, gauge() {} };
  m.config = {};
  m.eventBus = {
    publish: (event, payload) => {
      publicados.push({ event, payload });
      if (event === 'db.query.request') {
        // responde la query (schema o select). onDbQueryResponse hace
        // payload = event.data || event y luego payload.rows/​data → usamos `rows`.
        queueMicrotask(() => m.onDbQueryResponse({ request_id: payload.request_id, rows }));
      }
    }
  };
  return { m, publicados };
}

test('handleLeer sin conversation_id -> 400 INVALID_INPUT', async () => {
  const { m } = nuevoSummary();
  const res = await m.handleLeer({ project_id: 'p1' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
});

test('handleLeer devuelve el resumen persistido', async () => {
  const { m } = nuevoSummary([{ summary: 'Hablamos de la masa de 48h y el food cost objetivo.', message_count_at_summary: 20, updated_at: 123 }]);
  const res = await m.handleLeer({ project_id: 'p1', conversation_id: 'c1' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.conversation_id, 'c1');
  assert.ok(/masa de 48h/.test(res.data.summary));
});

test('handleLeer sin resumen aún -> summary null (conversación corta)', async () => {
  const { m } = nuevoSummary([]); // _loadSummary devuelve null
  const res = await m.handleLeer({ project_id: 'p1', conversation_id: 'nueva' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.summary, null);
});

test('onLeerRequest publica memory.summary.leer.response correlado', async () => {
  const { m, publicados } = nuevoSummary([{ summary: 'resumen X', updated_at: 1 }]);
  await m.onLeerRequest({ data: { request_id: 'req-1', project_id: 'p1', conversation_id: 'c1' } });
  const resp = publicados.find(p => p.event === 'memory.summary.leer.response');
  assert.ok(resp, 'no publicó la respuesta');
  assert.strictEqual(resp.payload.request_id, 'req-1');
  assert.strictEqual(resp.payload.status, 200);
  assert.strictEqual(resp.payload.data.summary, 'resumen X');
});

test('ai-gateway: _composeResumenSection es silenciosa y lleva el resumen', () => {
  const g = new AiGateway();
  const s = g._composeResumenSection('Hablamos de la masa de 48h.');
  assert.ok(/# RESUMEN DE LA CONVERSACION/.test(s));
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
  if (fails.length === 0) { console.log(`\n[memory-summary-pull] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[memory-summary-pull] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
