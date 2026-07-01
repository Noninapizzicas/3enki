'use strict';

/**
 * cosecha__index — el órgano CANTERA (biblioteca viva de skills).
 *
 * Verifica: auto-descubre cantera/<fuente>/<skill>/SKILL.md, parsea el frontmatter,
 * busca BARATO (catálogo sin contenido, rankeado, filtrable por dominio/tarea) y
 * entrega el SKILL.md completo solo bajo demanda. Dos fuentes en un pozo (ecc + enki).
 *
 * Ejecutar: node tests/unit/cosecha__index.test.js
 */

const assert = require('assert');
const CosechaModule = require('../../modules/cosecha/index.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };

async function makeCargado() {
  const m = new CosechaModule();
  await m.onLoad({ logger: LOG, eventBus: null, metrics: null });
  return m;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('descubre las skills semilla de la cantera (>=3, con las conocidas)', async () => {
  const m = await makeCargado();
  const nombres = [...m._skills.keys()];
  assert.ok(m._skills.size >= 3, `esperaba >=3 skills, hay ${m._skills.size}`);
  for (const n of ['deep-research', 'agentic-engineering', 'verificar-en-vivo']) {
    assert.ok(nombres.includes(n), `falta la skill ${n}`);
  }
});

test('parsea el frontmatter: name/description/fuente/dominio/tags', async () => {
  const m = await makeCargado();
  const dr = m._skills.get('deep-research');
  assert.strictEqual(dr.fuente, 'ECC');
  assert.strictEqual(dr.dominio, 'investigacion');
  assert.ok(Array.isArray(dr.tags) && dr.tags.includes('research'), 'tags debe ser array con research');
  assert.ok(dr.descripcion.length > 0 && dr.contenido.includes('Deep Research'), 'descripcion+contenido cargados');
});

test('buscar: catálogo BARATO (sin contenido) y rankeado por query', async () => {
  const m = await makeCargado();
  const { data } = m._buscar({ query: 'research fuentes' });
  assert.ok(data.skills.length >= 1);
  const dr = data.skills.find(s => s.nombre === 'deep-research');
  assert.ok(dr, 'deep-research debe salir para query research');
  assert.strictEqual(dr.contenido, undefined, 'buscar NO devuelve contenido (catálogo barato)');
});

test('buscar: filtra por dominio', async () => {
  const m = await makeCargado();
  const { data } = m._buscar({ dominio: 'agentes' });
  assert.ok(data.skills.every(s => s.dominio === 'agentes'), 'solo dominio agentes');
  assert.ok(data.skills.some(s => s.nombre === 'agentic-engineering'));
});

test('buscar: tarea pesa más y ordena', async () => {
  const m = await makeCargado();
  const { data } = m._buscar({ query: 'routing', tarea: 'routing' });
  assert.strictEqual(data.skills[0].nombre, 'agentic-engineering', 'la de routing debe ir primera');
});

test('obtener: devuelve el SKILL.md COMPLETO de las pedidas + faltan', async () => {
  const m = await makeCargado();
  const { data } = m._obtener({ nombres: ['deep-research', 'no-existe'] });
  assert.strictEqual(data.skills.length, 1);
  assert.ok(data.skills[0].contenido.includes('Cada afirmación necesita fuente'), 'contenido completo');
  assert.deepStrictEqual(data.faltan, ['no-existe']);
});

test('obtener sin nombres -> INVALID_INPUT', async () => {
  const m = await makeCargado();
  const r = m._obtener({ nombres: [] });
  assert.strictEqual(r.status, 400);
});

test('stats: dos fuentes en un pozo (ecc + enki)', async () => {
  const m = await makeCargado();
  const { data } = m._stats();
  assert.ok(data.fuentes.includes('ECC') && data.fuentes.includes('enki'), 'ambas fuentes');
  assert.ok(data.por_fuente['ECC'] >= 2 && data.por_fuente['enki'] >= 1);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cosecha__index] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cosecha__index] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
