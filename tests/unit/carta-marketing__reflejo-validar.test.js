'use strict';

/**
 * carta-marketing — REFLEJO _validar / _checkMarca / gate de update_perfil (EL FRENO).
 *
 * El skill revela DOS naturalezas en marketing:
 *   - MARCA: SÍ tiene contrato mecánico (marca.schema.json). El onboarding produce el parche
 *     (fuzzy) y el reflejo valida la marca RESULTANTE del deep-merge contra el schema ANTES de
 *     escribir. Un parche que la rompe (voz como string, esencia.nombre no-texto) → 422, no persiste.
 *   - COPY: texto libre. Su contrato es la VOZ de marca, irreducible a un schema → no hay freno
 *     mecánico (la fidelidad se queda como mandato del PENSAR). Esta suite cubre la MARCA.
 *
 * Ejecutar: node tests/unit/carta-marketing__reflejo-validar.test.js
 */

const assert = require('assert');
const CartaMarketing = require('../../modules/pizzepos/carta-marketing');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const m = new CartaMarketing();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.writes = [];
  m.published = [];
  m.eventBus = { publish: (ev, p) => m.published.push([ev, p]) };
  m._leerJson = async () => null;                       // sin marca previa → base = identidadVacia()
  m._rpc = async (ev, payload) => { if (ev === 'fs.write.request') { m.writes.push(payload); return { status: 200 }; } return null; };
  return m;
}

const MARCA_OK = {
  _version: '1.0',
  esencia: { nombre: 'La Toscana', lema: 'Pasta con alma', valores: ['cercanía'] },
  voz: { tono: ['cálido', 'cercano'], registro: 'tú' },
  publico: { quien: 'familias del barrio' },
  visual: { colores: { principal: '#c00' } }
};
const clon = () => JSON.parse(JSON.stringify(MARCA_OK));

test('marca válida → valid:true', async () => {
  const m = nuevo();
  const r = await m._validar({ marca: MARCA_OK });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valid, true, JSON.stringify(r.data.errors));
});

test('esencia.nombre no-texto (número) → valid:false', async () => {
  const m = nuevo();
  const c = clon(); c.esencia.nombre = 42;
  const r = await m._validar({ marca: c });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(e => /nombre/.test(e.message)));
});

test('voz como string (no objeto) → valid:false', async () => {
  const m = nuevo();
  const c = clon(); c.voz = 'cálida y cercana';
  assert.strictEqual((await m._validar({ marca: c })).data.valid, false);
});

test('voz.tono como string (no array) → valid:false', async () => {
  const m = nuevo();
  const c = clon(); c.voz.tono = 'cálido';
  assert.strictEqual((await m._validar({ marca: c })).data.valid, false);
});

test('falta esencia (required) → valid:false', async () => {
  const m = nuevo();
  const c = clon(); delete c.esencia;
  assert.strictEqual((await m._validar({ marca: c })).data.valid, false);
});

test('falta _version (required) → valid:false', async () => {
  const m = nuevo();
  const c = clon(); delete c._version;
  assert.strictEqual((await m._validar({ marca: c })).data.valid, false);
});

test('esencia.nombre vacío ("") sigue siendo válido (type:string) — borrador inicial', async () => {
  const m = nuevo();
  const c = clon(); c.esencia.nombre = '';
  assert.strictEqual((await m._validar({ marca: c })).data.valid, true);
});

test('acepta la marca cruda (sin envoltorio "marca")', async () => {
  const m = nuevo();
  assert.strictEqual((await m._validar(MARCA_OK)).data.valid, true);
});

// ── gate de update_perfil ──

test('update_perfil GATE: parche válido (esencia.nombre) → escribe, 200', async () => {
  const m = nuevo();
  const r = await m._updatePerfil({ project_id: 'p', campos: { esencia: { nombre: 'La Toscana' } } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(m.writes.length, 1, 'debe persistir el parche válido');
});

test('update_perfil GATE: parche que rompe la marca (voz como string) → 422, NO escribe', async () => {
  const m = nuevo();
  const r = await m._updatePerfil({ project_id: 'p', campos: { voz: 'cálida' } });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'UPSTREAM_INVALID_RESPONSE');
  assert.ok(r.error.details.errors.length > 0);
  assert.strictEqual(m.writes.length, 0, 'NO debe persistir una marca rota que beberían los demás módulos');
});

test('update_perfil GATE: parche que rompe esencia (nombre número) → 422, NO escribe', async () => {
  const m = nuevo();
  const r = await m._updatePerfil({ project_id: 'p', campos: { esencia: { nombre: 7 } } });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(m.writes.length, 0);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[carta-marketing__reflejo-validar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[carta-marketing__reflejo-validar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
