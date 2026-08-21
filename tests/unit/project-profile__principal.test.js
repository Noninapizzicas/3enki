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
  // El reflejo publica al bus en cada update: un bus no-op mantiene las
  // promesas resueltas (sin él, cada update deja un rechazo pendiente).
  modulo.eventBus = { publish: async () => {} };
  assert.ok(modulo);
  assert.strictEqual(modulo.name, 'project-profile');
});

test('get sin project_id → 400', () => {
  const r = modulo._get({});
  assert.strictEqual(r.status, 400);
});

test('get de proyecto inexistente → crea perfil vacío bajo demanda + 200', () => {
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

// ── IDENTIDAD DEL NEGOCIO (FASE 0 — skill identidad-negocio) ──
// La transición sin_identidad → con_identidad es EDGE-TRIGGERED: emite una
// sola vez. La skill entrega el bloque completo en UNA llamada; estos tests
// afirman las tres caras de esa regla.

function conBus() {
  const publicados = [];
  const m = new ProjectProfileReflejo();
  m.eventBus = { publish: async (e, p) => { publicados.push([e, p]); } };
  return { m, publicados };
}

test('identidad completa en un update → con_identidad + declarado_el + negocio.identificado lleno', async () => {
  const { m, publicados } = conBus();
  const r = m._update({
    project_id: 'neg-1',
    proposito: 'que la gente cocine con fuego vivo sin humo en casa',
    identidad: {
      que_es: 'un taller de lámparas de hierro',
      que_vende: 'lámparas de mesa y de suelo',
      como_lo_elabora: 'compramos cable y piezas, cortamos y soldamos',
      tipo_derivado: 'elaborado+pieza',
      preguntas_abiertas: [{ campo: 'stock', para: 'saber si lleva almacén', porque: 'no lo dijo', respondida: false }]
    }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.perfil.identidad.estado, 'con_identidad');
  assert.ok(r.data.perfil.identidad.declarado_el, 'declarado_el sellado');
  // proposito viaja como HERMANO de identidad
  assert.strictEqual(r.data.perfil.proposito, 'que la gente cocine con fuego vivo sin humo en casa');

  await new Promise((res) => setImmediate(res));
  const ident = publicados.filter(([e]) => e === 'negocio.identificado');
  assert.strictEqual(ident.length, 1, 'un solo negocio.identificado');
  const p = ident[0][1];
  assert.strictEqual(p.project_id, 'neg-1');
  assert.strictEqual(p.que_es, 'un taller de lámparas de hierro');
  assert.strictEqual(p.tipo_derivado, 'elaborado+pieza', 'el tipo viaja en el payload');
  assert.strictEqual(p.preguntas_abiertas.length, 1);
  assert.ok(p.correlation_id && p.timestamp, 'enriquecido por el bus');
});

test('update posterior sobre con_identidad → NO re-emite (edge-triggered)', async () => {
  const { m, publicados } = conBus();
  m._update({ project_id: 'neg-2', identidad: { que_es: 'un taller', que_vende: 'lámparas' } });
  await new Promise((res) => setImmediate(res));
  publicados.length = 0;

  const r = m._update({ project_id: 'neg-2', identidad: { tipo_derivado: 'elaborado+pieza' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.perfil.identidad.tipo_derivado, 'elaborado+pieza', 'el merge sí refina');
  assert.strictEqual(r.data.perfil.identidad.que_es, 'un taller', 'el merge conserva lo anterior');

  await new Promise((res) => setImmediate(res));
  assert.strictEqual(publicados.filter(([e]) => e === 'negocio.identificado').length, 0,
    'la transición ya ocurrió: el segundo update solo actualiza');
  assert.ok(publicados.some(([e]) => e === 'project-profile.actualizado'));
});

test('identidad parcial (sin que_vende) → sin_identidad honesto, sin evento', async () => {
  const { m, publicados } = conBus();
  const r = m._update({
    project_id: 'neg-3',
    identidad: { que_es: 'un taller de lámparas', preguntas_abiertas: [{ campo: 'que_vende', respondida: false }] }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.perfil.identidad.estado, 'sin_identidad');
  assert.strictEqual(r.data.perfil.identidad.declarado_el, null, 'sin sello mientras falte el mínimo vital');

  await new Promise((res) => setImmediate(res));
  assert.strictEqual(publicados.filter(([e]) => e === 'negocio.identificado').length, 0);
});

test('perfil nuevo nace sin_identidad y sin contagio entre proyectos', () => {
  const { m } = conBus();
  m._update({ project_id: 'neg-4', identidad: { que_es: 'un taller', que_vende: 'lámparas' } });
  const otro = m._get({ project_id: 'neg-5' });
  assert.strictEqual(otro.data.perfil.identidad.estado, 'sin_identidad');
  assert.strictEqual(otro.data.perfil.identidad.que_es, '');
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`[project-profile] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`[project-profile] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}: ${e.message}`);
  process.exit(1);
})();
