'use strict';
/**
 * prisma__insumos — la RECONCILIACIÓN (paso 0 de la skill prisma-compuestos).
 * _normalizar y _score son PUROS: capturan typo/tildes/plural/mayúsculas/solape.
 * Los SINÓNIMOS/IDIOMAS los resuelve el LLM, no el reflejo (frontera documentada abajo).
 * Ejecutar: node tests/unit/prisma__insumos.test.js
 */
const assert = require('assert');
const Mod = require('../../modules/prisma/insumos/index.js');
const m = new Mod();

const tests = [];
const test = (n, f) => tests.push({ n, f });
const cerca = (x, y, msg) => assert.ok(x >= y, `${msg}: ${x} < ${y}`);

test('_normalizar: tildes · mayúsculas · plural · espacios', () => {
  assert.strictEqual(m._normalizar('  Tomáte '), 'tomate');
  assert.strictEqual(m._normalizar('MOZZARELLA'), 'mozzarella');
  assert.strictEqual(m._normalizar('Olivas'), 'oliva');           // plural simple
  assert.strictEqual(m._normalizar('Aceite  de   Oliva'), 'aceite de oliva');
});

test('_score EXACTO tras normalizar (tilde/plural/mayúscula) = 1', () => {
  assert.strictEqual(m._score('Tomate', 'tomate'), 1);
  assert.strictEqual(m._score('olivas', 'oliva'), 1);
  assert.strictEqual(m._score('Mozzarella', 'mozzarella'), 1);
});

test('_score TYPO de una letra (mozarella≈mozzarella) alto', () => {
  cerca(m._score('mozarella', 'mozzarella'), 0.85, 'typo mozzarella');
  cerca(m._score('espinaca', 'espinacas'), 0.85, 'plural largo');
});

test('_score AMBIGUO (variante) medio, no 1 → la skill PREGUNTA', () => {
  const s = m._score('tomate frito', 'tomate');
  cerca(s, 0.5, 'contiene');
  assert.ok(s < 1, 'no es el mismo insumo');
});

test('_score DISTINTOS bajo', () => {
  assert.ok(m._score('harina', 'azucar') < 0.4, 'harina≠azucar');
});

test('FRONTERA: sinónimo/idioma NO lo pilla el reflejo (es del LLM)', () => {
  assert.ok(m._score('aceituna', 'oliva') < 0.5, 'sinónimo semántico → job del LLM, no del reflejo');
});

test('_buscar rankea candidatos y detecta exacto', async () => {
  m._leerTodos = async () => ([
    { id: 'mozzarella', nombre: 'Mozzarella', clasificacion_ref: { familia: 'queso' }, naturalezas: { coste_centimos_por_unidad: 720 } },
    { id: 'tomate', nombre: 'Tomate', naturalezas: {} },
    { id: 'harina', nombre: 'Harina', naturalezas: {} },
  ]);
  const r = await m._buscar({ project_id: 'p', nombre: 'mozarella' });   // typo
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.candidatos[0].id, 'mozzarella', 'el typo rankea la mozzarella primera');
  assert.strictEqual(r.data.exacto, null, 'typo no es exacto');
  const r2 = await m._buscar({ project_id: 'p', nombre: 'TOMATE' });     // exacto tras normalizar
  assert.strictEqual(r2.data.exacto?.id, 'tomate', 'exacto detectado');
});

test('_buscar y _crear validan entradas', async () => {
  assert.strictEqual((await m._buscar({})).status, 400);
  assert.strictEqual((await m._crear({ project_id: 'p' })).status, 400);
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); console.log('  ✓ ' + n); ok++; }
    catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); }
  }
  console.log(`[prisma__insumos] ${ok === tests.length ? 'OK' : 'FAIL'} ${ok}/${tests.length}`);
  process.exit(ok === tests.length ? 0 : 1);
})();
