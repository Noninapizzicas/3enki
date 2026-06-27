'use strict';

/**
 * deepseek__resolve-model — la migración a modelos vivos antes del corte del 2026-07-24.
 *
 * DeepSeek discontinúa `deepseek-chat` y `deepseek-coder` el 2026-07-24 15:59 UTC. El provider
 * los tenía como default_model y en la rama de visión -> el 24/07 deepseek se caería entero.
 * resolveModel() normaliza esos nombres legacy (incluso si vienen GUARDADOS en una conversación
 * vieja) al modelo vivo (default_model = deepseek-v4-flash, modo no-thinking, que es lo que
 * deepseek-chat era). El razonamiento sigue por deepseek-reasoner mientras viva.
 *
 * Ejecutar: node tests/unit/deepseek__resolve-model.test.js
 */

const assert = require('assert');
const DeepSeekProvider = require('../../modules/conversacion/ai-gateway/providers/deepseek-provider.js');

function makeProvider() {
  return new DeepSeekProvider(
    { models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-reasoner'], default_model: 'deepseek-v4-flash' },
    { debug(){}, info(){}, warn(){}, error(){} },
    async () => null
  );
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('sin opciones -> default_model vivo (v4-flash), no el deprecado deepseek-chat', () => {
  const p = makeProvider();
  assert.strictEqual(p.resolveModel({}), 'deepseek-v4-flash');
});

test('nombre legacy GUARDADO deepseek-chat -> default_model vivo (no se cae el 24/07)', () => {
  const p = makeProvider();
  assert.strictEqual(p.resolveModel({ model: 'deepseek-chat' }), 'deepseek-v4-flash');
});

test('nombre legacy deepseek-coder (retirado) -> default_model vivo', () => {
  const p = makeProvider();
  assert.strictEqual(p.resolveModel({ model: 'deepseek-coder' }), 'deepseek-v4-flash');
});

test('reasoning:true sin modelo -> deepseek-reasoner (único camino thinking documentado)', () => {
  const p = makeProvider();
  assert.strictEqual(p.resolveModel({ reasoning: true }), 'deepseek-reasoner');
});

test('model explícito deepseek-reasoner se respeta (useReasoning lo deriva del resultado)', () => {
  const p = makeProvider();
  assert.strictEqual(p.resolveModel({ model: 'deepseek-reasoner' }), 'deepseek-reasoner');
});

test('model vivo explícito (v4-pro) se respeta tal cual', () => {
  const p = makeProvider();
  assert.strictEqual(p.resolveModel({ model: 'deepseek-v4-pro' }), 'deepseek-v4-pro');
});

test('legacy + reasoning:true -> el legacy se descarta y gana el reasoner (no v4-flash)', () => {
  const p = makeProvider();
  // deepseek-chat se normaliza a null, luego reasoning:true -> reasoner
  assert.strictEqual(p.resolveModel({ model: 'deepseek-chat', reasoning: true }), 'deepseek-reasoner');
});

test('NINGÚN literal deprecado (deepseek-chat/deepseek-coder) sobrevive como modelo seleccionable', () => {
  const p = makeProvider();
  // Para todo el espacio razonable de entradas, el modelo resuelto nunca es un nombre que muere el 24/07
  const entradas = [{}, { model: 'deepseek-chat' }, { model: 'deepseek-coder' }, { reasoning: true }];
  for (const opt of entradas) {
    const m = p.resolveModel(opt);
    assert.ok(m !== 'deepseek-chat' && m !== 'deepseek-coder',
      `resolveModel(${JSON.stringify(opt)}) devolvió un nombre deprecado: ${m}`);
  }
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[deepseek__resolve-model] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[deepseek__resolve-model] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
