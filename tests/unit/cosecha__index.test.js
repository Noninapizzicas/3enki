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
const fs = require('fs');
const path = require('path');
const CosechaModule = require('../../modules/cosecha/index.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };

// fuente exclusiva de las pruebas de importar (se limpia al final; no pisa la semilla).
// _slug la normaliza a 'test-import' (así se llama el dir en disco).
const FUENTE_TEST = '__test-import__';
const FUENTE_TEST_DIR = path.join(process.cwd(), 'data', 'cosecha', 'cantera', 'test-import');
function limpiar() { try { fs.rmSync(FUENTE_TEST_DIR, { recursive: true, force: true }); } catch (_) {} }

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
  // Scopeado al dominio 'agentes': el invariante es que DENTRO del dominio la tarea 'routing'
  // ordena primero. Sin scope el test era frágil — una skill de OTRO dominio que mencione
  // 'routing' por casualidad (p.ej. routing web) colisiona por palabra sobre el catálogo abierto.
  const { data } = m._buscar({ query: 'routing', tarea: 'routing', dominio: 'agentes' });
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

test('importar: vuelca una skill, la escribe en data/ y la re-indexa (buscable)', async () => {
  limpiar();
  const m = await makeCargado();
  const antes = m._skills.size;
  const r = m._importar({ fuente: FUENTE_TEST, skills: [
    { nombre: 'skill-importada', descripcion: 'venida de fuera', dominio: 'prueba', tags: ['x', 'y'], contenido: '# Cuerpo\nviva en caliente' }
  ]});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.importadas, 1);
  assert.strictEqual(r.data.total, antes + 1, 're-indexa: la cantera crece');
  const s = m._skills.get('skill-importada');
  assert.ok(s, 'la skill importada es descubrible');
  assert.strictEqual(s.dominio, 'prueba');
  assert.ok(s.contenido.includes('viva en caliente'));
  // el fichero está en disco
  const mdPath = path.join(FUENTE_TEST_DIR, 'skill-importada', 'SKILL.md');
  assert.ok(fs.existsSync(mdPath), 'SKILL.md escrito en data/');
  limpiar();
});

test('importar con HOGAR: persiste lente_dominio/lente_tarea y buscar los expone', async () => {
  limpiar();
  const m = await makeCargado();
  m._importar({ fuente: FUENTE_TEST, skills: [
    { nombre: 'con-hogar', contenido: '# c', descripcion: 'un oficio', lente_dominio: 'diseño', lente_tarea: 'tema' }
  ]});
  const s = m._skills.get('con-hogar');
  assert.strictEqual(s.lente_dominio, 'diseño', 'hogar persistido y re-leído');
  assert.strictEqual(s.lente_tarea, 'tema');
  const { data } = m._buscar({ query: 'con-hogar' });
  const row = data.skills.find(x => x.nombre === 'con-hogar');
  assert.strictEqual(row.lente_dominio, 'diseño', 'el catálogo expone el hogar (para el conserje)');
  limpiar();
});

test('importar: idempotente por nombre (re-importar pisa, no duplica)', async () => {
  limpiar();
  const m = await makeCargado();
  m._importar({ fuente: FUENTE_TEST, skills: [{ nombre: 'dup', contenido: 'v1' }] });
  const trasPrimera = m._skills.size;
  m._importar({ fuente: FUENTE_TEST, skills: [{ nombre: 'dup', contenido: 'v2 nueva' }] });
  assert.strictEqual(m._skills.size, trasPrimera, 'no duplica');
  assert.ok(m._skills.get('dup').contenido.includes('v2 nueva'), 'la re-importación pisa');
  limpiar();
});

test('importar: fuente/skills inválidos -> INVALID_INPUT; skill sin contenido -> rechazada', async () => {
  limpiar();
  const m = await makeCargado();
  assert.strictEqual(m._importar({ fuente: '', skills: [{ nombre: 'x', contenido: 'y' }] }).status, 400);
  assert.strictEqual(m._importar({ fuente: FUENTE_TEST, skills: [] }).status, 400);
  const r = m._importar({ fuente: FUENTE_TEST, skills: [{ nombre: 'sin-cuerpo' }] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.importadas, 0);
  assert.strictEqual(r.data.rechazadas.length, 1, 'la skill sin contenido se rechaza, no se traga');
  limpiar();
});

test('olvidar: borra una skill crecida, re-indexa y quita el dir', async () => {
  limpiar();
  const m = await makeCargado();
  m._importar({ fuente: FUENTE_TEST, skills: [{ nombre: 'temporal', contenido: '# c' }] });
  const antes = m._skills.size;
  assert.ok(m._skills.has('temporal'));
  const r = m._olvidar({ nombre: 'temporal' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.olvidada, true);
  assert.strictEqual(m._skills.size, antes - 1, 'la cantera decrece');
  assert.ok(!m._skills.has('temporal'), 'ya no es descubrible');
  assert.ok(!fs.existsSync(path.join(FUENTE_TEST_DIR, 'temporal')), 'el dir se borró');
  limpiar();
});

test('olvidar la SEMILLA -> 409 (intocable en caliente)', async () => {
  const m = await makeCargado();
  const r = m._olvidar({ nombre: 'deep-research' });   // vive en el código, no en data/
  assert.strictEqual(r.status, 409);
  assert.ok(m._skills.has('deep-research'), 'la semilla sigue ahí');
});

test('olvidar skill inexistente -> 404', async () => {
  const m = await makeCargado();
  assert.strictEqual(m._olvidar({ nombre: 'no-existe' }).status, 404);
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
