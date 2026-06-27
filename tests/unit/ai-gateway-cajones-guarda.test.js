'use strict';

/**
 * ai-gateway · cajones — guarda de internas no declaradas (v2.10.0).
 *
 * Al abrir un cajón, si su pseudocódigo llama a un helper interno _xxx(...) que
 * EXISTE como operación del blueprint pero no viaja en `internas` (usa_internas
 * incompleto), se enciende una luz (warn + métrica). No auto-incluye.
 *
 * Ejecutar: node tests/unit/ai-gateway-cajones-guarda.test.js
 */

const assert = require('assert');
const AiGateway = require('../../modules/conversacion/ai-gateway');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo(operaciones) {
  const g = new AiGateway();
  const warns = [];
  g.logger = { warn: (e, d) => warns.push({ e, d }), info() {}, debug() {}, error() {} };
  g.metrics = { increment() {}, gauge() {} };
  g.blueprintModules.set('recetas', { cajonesEnabled: true, child: { operaciones } });
  g.cajonesCatalog.set('recetas', [{ nombre: 'crear', descripcion: 'crea' }]);
  return { g, warns };
}

const ctx = { page_id: 'recetas', conversation_id: 'c1' };

test('avisa cuando el pseudocódigo llama a un _helper no declarado', () => {
  const { g, warns } = nuevo({
    crear: { pseudocodigo: 'LLAMA _faltante(x)\nLUEGO _presente(y)', usa_internas: ['_presente'] },
    _presente: { pseudocodigo: 'hace algo' },
    _faltante: { pseudocodigo: 'hace otra cosa' } // existe como op, NO declarada
  });
  g._executeCajonTool('cajon.abrir', { nombre: 'crear' }, ctx);
  const w = warns.find(x => x.e === 'ai-gateway.cajon.internas_no_declaradas');
  assert.ok(w, 'no encendió la luz');
  assert.deepStrictEqual(w.d.faltan, ['_faltante']);
  assert.ok(!w.d.faltan.includes('_presente'), 'la declarada no debe figurar como faltante');
});

test('NO avisa cuando todas las internas referenciadas están declaradas', () => {
  const { g, warns } = nuevo({
    crear: { pseudocodigo: 'LLAMA _a(x)\n_b(y)', usa_internas: ['_a', '_b'] },
    _a: { pseudocodigo: '...' },
    _b: { pseudocodigo: '...' }
  });
  g._executeCajonTool('cajon.abrir', { nombre: 'crear' }, ctx);
  assert.ok(!warns.some(x => x.e === 'ai-gateway.cajon.internas_no_declaradas'));
});

test('NO avisa por un _token que no es operación del blueprint (prosa/ruido)', () => {
  const { g, warns } = nuevo({
    crear: { pseudocodigo: 'escribe en _propiocepcion(json) y responde', usa_internas: [] }
    // _propiocepcion no existe como op → no es el bug, no se avisa
  });
  g._executeCajonTool('cajon.abrir', { nombre: 'crear' }, ctx);
  assert.ok(!warns.some(x => x.e === 'ai-gateway.cajon.internas_no_declaradas'));
});

test('cajon.abrir sigue devolviendo el cajón pese a la guarda', () => {
  const { g } = nuevo({
    crear: { pseudocodigo: '_faltante(x)', usa_internas: [], input: 'algo', reglas_clave: 'r' },
    _faltante: { pseudocodigo: '...' }
  });
  const res = g._executeCajonTool('cajon.abrir', { nombre: 'crear' }, ctx);
  assert.strictEqual(res.nombre, 'crear');
  assert.strictEqual(res.pseudocodigo, '_faltante(x)');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[ai-gateway-cajones-guarda] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway-cajones-guarda] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
