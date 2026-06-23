'use strict';

/**
 * REPLAY de trayectorias — lado lectura del destilador (norte en CLAUDE.md "Patrón Módulo Híbrido"
 * + sesión ruflo/ReasoningBank: capturar Y RE-EJECUTAR la trayectoria).
 *
 * El destilador YA captura la trayectoria (cluster.secuencia, persistida en clusters.json). Estas
 * pruebas fijan el LADO LECTURA: dado DONDE estas (project_id + desde), devuelve las rutas aprendidas
 * que arrancan ahi, con su CONTINUACION (los pasos que vienen despues) y rankeadas por ocurrencias.
 * Solo el matcher puro (_rutasDesde / _continuacion). Sin bus, sin fs, sin LLM.
 *
 * Ejecutar: node tests/unit/destilador__ruta-replay.test.js
 */

const assert = require('assert');

const Mod = require('../../modules/destilador');
const Destilador = Mod.default || Mod;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Instancia mínima con clusters inyectados (saltamos onLoad/bus).
function nuevoConClusters(secuencias) {
  const d = new Destilador();
  d.clusters = new Map();
  for (const [key, c] of Object.entries(secuencias)) d.clusters.set(key, c);
  d._clustersDeProyecto = (pid) => [...d.clusters.values()].filter(c => c.project_id === pid);
  return d;
}

const FIXTURE = {
  'p::a': { firma: 'a', project_id: 'p', secuencia: ['recetas.obtener', 'escandallo.costear', 'carta.add_product'], ocurrencias: 9, ultima_ts: 't' },
  'p::b': { firma: 'b', project_id: 'p', secuencia: ['recetas.obtener', 'viabilidad.evaluar'], ocurrencias: 3, ultima_ts: 't' },
  'p::c': { firma: 'c', project_id: 'p', secuencia: ['carta.list'], ocurrencias: 5, ultima_ts: 't' },
  'q::z': { firma: 'z', project_id: 'q', secuencia: ['recetas.obtener', 'otra.cosa'], ocurrencias: 99, ultima_ts: 't' },
};

test('desde un DOMINIO/pagina: arranca por el y continuacion = lo que viene despues', () => {
  const d = nuevoConClusters(FIXTURE);
  const r = d._rutasDesde('p', 'recetas', 5);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0].continuacion, ['escandallo.costear', 'carta.add_product']);
  assert.deepStrictEqual(r[1].continuacion, ['viabilidad.evaluar']);
});

test('ranking por ocurrencias DESC (la ruta mas probada primero)', () => {
  const d = nuevoConClusters(FIXTURE);
  const r = d._rutasDesde('p', 'recetas', 5);
  assert.strictEqual(r[0].ocurrencias, 9);
  assert.strictEqual(r[1].ocurrencias, 3);
});

test('prefijo de PASOS exactos: continuacion tras el prefijo', () => {
  const d = nuevoConClusters(FIXTURE);
  const r = d._rutasDesde('p', ['recetas.obtener', 'escandallo.costear'], 5);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].continuacion, ['carta.add_product']);
});

test('sin desde: devuelve TODAS las rutas del proyecto (continuacion = ruta entera)', () => {
  const d = nuevoConClusters(FIXTURE);
  const r = d._rutasDesde('p', null, 10);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r[0].continuacion, r[0].secuencia);
});

test('aislamiento por proyecto: no se filtran rutas de otro project_id', () => {
  const d = nuevoConClusters(FIXTURE);
  const r = d._rutasDesde('p', 'recetas', 10);
  assert.ok(r.every(x => x.firma !== 'z'));   // 'z' es de project 'q'
});

test('desde algo que no arranca ninguna ruta: vacio (no inventa)', () => {
  const d = nuevoConClusters(FIXTURE);
  assert.strictEqual(d._rutasDesde('p', 'inexistente', 5).length, 0);
});

test('limite recorta el top-K', () => {
  const d = nuevoConClusters(FIXTURE);
  assert.strictEqual(d._rutasDesde('p', null, 1).length, 1);
});

test('_continuacion: dominio que coincide exacto (sin punto) tambien matchea', () => {
  const d = nuevoConClusters({ 'p::x': { firma: 'x', project_id: 'p', secuencia: ['carta', 'siguiente.op'], ocurrencias: 1 } });
  const r = d._rutasDesde('p', 'carta', 5);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].continuacion, ['siguiente.op']);
});

// ── runner ──
let passed = 0, failed = 0;
const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; }
  catch (err) { failed++; fails.push({ name, err }); }
}
if (failed === 0) {
  console.log(`\n[destilador__ruta-replay] OK ${passed}/${tests.length}`);
  process.exit(0);
}
console.error(`\n[destilador__ruta-replay] FAIL ${failed}/${tests.length}`);
for (const { name, err } of fails) { console.error(`  x ${name}\n    ${err.message}`); }
process.exit(1);
