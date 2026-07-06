'use strict';

/**
 * precio-ingredientes-web-seed — la semilla de cantera que enlaza fastcrw a escandallo.
 *
 * No es un cableado: es una SKILL descubrible. Verifica que la cantera la indexa, que se
 * halla buscando por "precio ingrediente", que declara su HOGAR (lente_dominio escandallo →
 * el conserje la ofrece al costear, y se puede promover a lente), y que obtener trae el
 * SKILL.md completo conduciendo las tools de fastcrw.
 *
 * Ejecutar: node tests/unit/precio-ingredientes-web-seed.test.js
 */

const assert = require('assert');
const CosechaModule = require('../../modules/cosecha/index.js');

const LOG = { debug() {}, info() {}, warn() {}, error() {} };

async function makeCargado() {
  const m = new CosechaModule();
  await m.onLoad({ logger: LOG, eventBus: null, metrics: null });
  return m;
}

async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); if (process.env.STACK) console.error(err.stack); process.exit(1); }
}

(async () => {
  console.log('precio-ingredientes-web — semilla de cantera (fastcrw → escandallo)\n');

  await test('la cantera DESCUBRE la semilla', async () => {
    const m = await makeCargado();
    assert.ok([...m._skills.keys()].includes('precio-ingredientes-web'), 'no indexada');
  });

  await test('se HALLA buscando por "precio ingrediente" (descubrimiento)', async () => {
    const m = await makeCargado();
    const { data } = m._buscar({ query: 'precio ingrediente' });
    assert.ok(data.skills.some(s => s.nombre === 'precio-ingredientes-web'), 'no aparece en la búsqueda');
  });

  await test('declara su HOGAR: lente_dominio escandallo (el conserje la ofrece / se promueve)', async () => {
    const m = await makeCargado();
    // el hogar vive en _skills (parseado) y en el catálogo _buscar — _obtener solo trae contenido.
    const s = m._skills.get('precio-ingredientes-web');
    assert.strictEqual(s.dominio, 'escandallo');
    assert.strictEqual(s.lente_dominio, 'escandallo', 'sin hogar no se promueve a lente');
    assert.strictEqual(s.lente_tarea, 'costear');
    const row = m._buscar({ query: 'precio-ingredientes-web' }).data.skills.find(x => x.nombre === 'precio-ingredientes-web');
    assert.strictEqual(row.lente_dominio, 'escandallo', 'el catálogo expone el hogar (para el conserje)');
  });

  await test('obtener trae el SKILL.md COMPLETO que CONDUCE fastcrw (no inventa el precio)', async () => {
    const m = await makeCargado();
    const [s] = m._obtener({ nombres: ['precio-ingredientes-web'] }).data.skills;
    assert.ok(s.contenido.includes('fastcrw.extract'), 'debe conducir fastcrw.extract');
    assert.ok(s.contenido.includes('sin_precio'), 'debe honrar el guard no-inventar');
  });

  console.log('\n✓ semilla precio-ingredientes-web: descubrimiento + hogar + conducción verificados');
})();
