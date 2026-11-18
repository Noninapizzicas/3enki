'use strict';

/**
 * carta-digital — EL SLUG DEL BUNDLE NO SE TRUNCA.
 *
 * El `project_slug` horneado en el bundle es el ancla entre la PWA y el proyecto: el
 * mensaje `PEDIDO <slug>-<nonce>` viaja al ingest, que compara ese slug con el del
 * proyecto y DESCARTA el pedido entero si no coincide ("pedido de otro negocio").
 *
 * El fallback histórico hacía `String(project_id).slice(0, 8)`, pensado para UUIDs.
 * En proyectos con nombre el id ES el slug ("the-pirate"), así que el corte producía
 * "the-pira": un slug válido en apariencia que se horneaba en la carta y tiraba todos
 * los pedidos (medido 18-nov-2026: pedido T226, 12 €, descartado en el ingest).
 *
 * Ejecutar: node tests/unit/carta-digital__slug-de-id.test.js
 */

const assert = require('assert');
const CartaDigital = require('../../modules/pizzepos/carta-digital');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('id-slug (el id ES el slug) → se usa COMPLETO, no truncado a 8', () => {
  const m = new CartaDigital();
  assert.strictEqual(m._slugDeId('the-pirate'), 'the-pirate');
  assert.strictEqual(m._slugDeId('nonina'), 'nonina');
  assert.strictEqual(m._slugDeId('despacho-de-pan'), 'despacho-de-pan');
});

test('UUID → sí se abrevia a 8 (no hay nombre del que sacar slug)', () => {
  const m = new CartaDigital();
  assert.strictEqual(m._slugDeId('aaaa1111-2222-3333-4444-555566667777'), 'aaaa1111');
});

test('id con mayúsculas/espacios → slugify, sin cortar', () => {
  const m = new CartaDigital();
  assert.strictEqual(m._slugDeId('The Pirate'), 'the-pirate');
});

test('carril indexado sin name: el slug del id-slug no se trunca', () => {
  const m = new CartaDigital();
  const carril = m._indexarCarril('the-pirate', null, null);
  assert.strictEqual(carril.slug, 'the-pirate', `slug horneado: ${carril.slug}`);
  // y queda alcanzable por su propio id (mapa de caras)
  assert.strictEqual(m.activos.get('the-pirate').slug, 'the-pirate');
});

test('project.activated PARCIAL (sin name) no pisa el carril ya conocido', () => {
  const m = new CartaDigital();
  m.eventBus = { publish: () => {} };
  m._indexarCarril('the-pirate', 'The Pirate', '/opt/enki/data/projects/the-pirate');
  assert.strictEqual(m.activos.get('the-pirate').slug, 'the-pirate');

  // Lo que emitió hermes-cli el 18-nov: solo el id.
  m._onProjectActivated({ data: { project_id: 'the-pirate' } });

  assert.strictEqual(m.activos.get('the-pirate').slug, 'the-pirate', 'el slug se truncó al activar');
  assert.strictEqual(m.activos.get('the-pirate').name, 'The Pirate', 'el name se perdió al activar');
  assert.strictEqual(m.activos.get('the-pirate').base_path, '/opt/enki/data/projects/the-pirate');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[carta-digital__slug-de-id] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[carta-digital__slug-de-id] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
