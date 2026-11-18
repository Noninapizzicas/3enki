'use strict';

/**
 * carta-digital — EL SLUG ES IDENTIDAD, NO CÁLCULO.
 *
 * El `project_slug` horneado en el bundle es el ancla entre la PWA y el proyecto: el mensaje
 * `PEDIDO <slug>-<nonce>` viaja al ingest, que lo compara con el slug del proyecto y DESCARTA
 * el pedido entero si no coincide ("pedido de otro negocio").
 *
 * El fallback histórico fabricaba la identidad con `String(project_id).slice(0, 8)`, pensado
 * para UUIDs. En proyectos con nombre el id ES el slug ("the-pirate"), así que producía
 * "the-pira": un slug válido en apariencia que se horneaba en la carta y tiraba los pedidos
 * (medido 18-nov-2026: pedido T226, 12 €, descartado en el ingest 6 s después de entrar).
 *
 * La regla que se prueba aquí: el slug llega como DATO (slugHint del caller, carril del
 * project.activated/list.response, o el resolutor que consulta al dueño). Si no hay dato, se
 * ABORTA — nunca se fabrica una identidad.
 *
 * Ejecutar: node tests/unit/carta-digital__slug-de-id.test.js
 */

const assert = require('assert');
const CartaDigital = require('../../modules/pizzepos/carta-digital');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const UUID = 'aaaa1111-2222-3333-4444-555566667777';
const BASE = '/opt/enki/data/projects/the-pirate';

function nuevo({ resolver } = {}) {
  const m = new CartaDigital();
  m.logs = [];
  m.logger = { info: () => {}, warn: (e, p) => m.logs.push([e, p]), error: () => {}, debug: () => {} };
  m.eventBus = { publish: () => {}, subscribe: () => () => {} };
  m._proyectos = { slugDe: resolver || (async (id) => id) };
  return m;
}

test('_indexarCarril SIN slug no indexa: un carril sin identidad no se inventa', () => {
  const m = nuevo();
  const r = m._indexarCarril('the-pirate', 'The Pirate', BASE);
  assert.strictEqual(r, null);
  assert.strictEqual(m.activos.size, 0);
  assert.ok(m.logs.some(([e]) => e === 'carta-digital.carril.sin_slug'));
});

test('_indexarCarril usa el slug DATO tal cual (no lo re-deriva del name)', () => {
  const m = nuevo();
  const r = m._indexarCarril('the-pirate', 'The Pirate', BASE, 'the-pirate');
  assert.strictEqual(r.slug, 'the-pirate');
  assert.strictEqual(m.activos.get('the-pirate').slug, 'the-pirate');
});

test('_resolverSlug: el slugHint del caller manda', async () => {
  const m = nuevo({ resolver: async () => { throw new Error('no debería consultar'); } });
  assert.strictEqual(await m._resolverSlug('the-pirate', 'the-pirate'), 'the-pirate');
});

test('_resolverSlug: usa el carril ya conocido sin consultar', async () => {
  const m = nuevo({ resolver: async () => { throw new Error('no debería consultar'); } });
  m._indexarCarril('the-pirate', 'The Pirate', BASE, 'the-pirate');
  assert.strictEqual(await m._resolverSlug('the-pirate'), 'the-pirate');
});

test('_resolverSlug: sin dato, resuelve con el resolutor (mapa del dueño / base_path)', async () => {
  const m = nuevo({ resolver: async (id) => (id === 'the-pirate' ? 'the-pirate' : id) });
  assert.strictEqual(await m._resolverSlug('the-pirate'), 'the-pirate');
});

test('_resolverSlug: UUID sin mapa → null (fail-closed, no se publica)', async () => {
  const m = nuevo({ resolver: async (id) => id });   // el resolutor devuelve la llave tal cual
  assert.strictEqual(await m._resolverSlug(UUID), null);
});

test('project.activated PARCIAL (sin name/base_path/slug) conserva el carril conocido', async () => {
  const m = nuevo();
  m._indexarCarril('the-pirate', 'The Pirate', BASE, 'the-pirate');

  // Lo que emitió hermes-cli el 18-nov: solo el id.
  await m._onProjectActivated({ data: { project_id: 'the-pirate' } });

  assert.strictEqual(m.activos.get('the-pirate').slug, 'the-pirate', 'el slug se truncó al activar');
  assert.strictEqual(m.activos.get('the-pirate').name, 'The Pirate', 'el name se perdió al activar');
  assert.strictEqual(m.activos.get('the-pirate').base_path, BASE);
});

test('project.activated PARCIAL sin carril previo: resuelve, nunca trunca', async () => {
  const m = nuevo({ resolver: async (id) => (id === 'the-pirate' ? 'the-pirate' : id) });
  await m._onProjectActivated({ data: { project_id: 'the-pirate' } });
  assert.strictEqual(m.activos.get('the-pirate')?.slug, 'the-pirate');
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
