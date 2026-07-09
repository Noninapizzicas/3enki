'use strict';

/**
 * herramientas-web-seed — el skill genérico que enseña a conducir crawl4rs por el bus.
 *
 * Verifica que la cantera lo indexa, que se halla buscando "datos web", y que su contenido
 * enseña el CANAL correcto (bus.publishAndWait, no curl por ejecutor) y cómo leer el error
 * — las dos cosas que evitan que el LLM improvise y se rinda.
 *
 * Ejecutar: node tests/unit/herramientas-web-seed.test.js
 */

const assert = require('assert');
const CosechaModule = require('../../modules/cosecha/index.js');

const LOG = { debug() {}, info() {}, warn() {}, error() {} };
async function makeCargado() { const m = new CosechaModule(); await m.onLoad({ logger: LOG, eventBus: null, metrics: null }); return m; }
async function test(desc, fn) { try { await fn(); console.log(`✓ ${desc}`); } catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); process.exit(1); } }

(async () => {
  console.log('herramientas-web — skill genérico de datos web\n');

  await test('la cantera DESCUBRE el skill genérico', async () => {
    const m = await makeCargado();
    assert.ok([...m._skills.keys()].includes('herramientas-web'), 'no indexado');
  });

  await test('se HALLA buscando por "datos web"', async () => {
    const m = await makeCargado();
    const { data } = m._buscar({ query: 'datos web' });
    assert.ok(data.skills.some(s => s.nombre === 'herramientas-web'), 'no aparece en la búsqueda');
  });

  await test('enseña el CANAL correcto (bus.publishAndWait, NO curl por ejecutor)', async () => {
    const m = await makeCargado();
    const [s] = m._obtener({ nombres: ['herramientas-web'] }).data.skills;
    assert.ok(s.contenido.includes("bus.publishAndWait('crawl4rs.leer.request'"), 'debe enseñar la invocación por bus');
    assert.ok(/NO uses.*ejecutor|no curl|sin curl/i.test(s.contenido), 'debe desaconsejar curl por ejecutor');
  });

  await test('enseña a LEER el error (no rendirse ante un transitorio)', async () => {
    const m = await makeCargado();
    const [s] = m._obtener({ nombres: ['herramientas-web'] }).data.skills;
    assert.ok(/degradado/.test(s.contenido), 'debe explicar la degradación honesta (apagado/sin_servicio)');
    assert.ok(/inscrapeable/i.test(s.contenido), 'debe negar el prior "web inscrapeable"');
    assert.ok(/backoff|reintenta/i.test(s.contenido), 'debe prescribir reintento, no rendición');
  });

  console.log('\n✓ herramientas-web: descubrimiento + canal + lectura del error verificados');
})();
