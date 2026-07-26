/**
 * project-profile__principal — test del módulo project-profile.
 * node tests/unit/project-profile__principal.test.js
 */
'use strict';
const assert = require('assert');
const ProjectProfileReflejo = require('../../modules/project-profile');

const tests = [];

const test = (n, f) => tests.push({ n, f });

// Setup
let modulo;
test('carga del módulo', () => {
  modulo = new ProjectProfileReflejo();
  assert.ok(modulo);
  assert.strictEqual(modulo.name, 'project-profile');
});

test('get sin project_id → 400', () => {
  const r = modulo._get({});
  assert.strictEqual(r.status, 400);
});

test('get de proyecto inexistente → crea perfil vacío + 200', () => {
  const r = modulo._get({ project_id: 'test-1' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.perfil);
  assert.strictEqual(r.data.perfil.proposito, '');
  assert.deepStrictEqual(r.data.perfil.temporalidad, { inicio: null, fin_estimado: null });
  assert.deepStrictEqual(r.data.perfil.entregables, []);
});

test('update proyecto existente → merge parcial', () => {
  const r = modulo._update({ project_id: 'test-1', proposito: 'probar el módulo' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.perfil.proposito, 'probar el módulo');
  assert.deepStrictEqual(r.data.campos_actualizados, ['proposito']);
  // El resto del perfil sigue vacío (merge parcial)
  assert.strictEqual(r.data.perfil.valor, '');
});

test('update con múltiples campos', () => {
  const r = modulo._update({
    project_id: 'test-1',
    proposito: 'test',
    valor: 'aprender',
    entregables: [{ nombre: 'código', descripcion: 'el módulo funcionando' }]
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.perfil.proposito, 'test');
  assert.strictEqual(r.data.perfil.valor, 'aprender');
  assert.strictEqual(r.data.perfil.entregables.length, 1);
  assert.deepStrictEqual(r.data.campos_actualizados, ['proposito', 'entregables', 'valor']);
});

test('onProjectCreated → inicializa perfil vacío', () => {
  modulo.onProjectCreated({ data: { project_id: 'test-nuevo' } });
  const r = modulo._get({ project_id: 'test-nuevo' });
  assert.ok(r.data.perfil);
  assert.strictEqual(r.data.perfil.proposito, '');
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`[project-profile] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`[project-profile] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}: ${e.message}`);
  process.exit(1);
})();
