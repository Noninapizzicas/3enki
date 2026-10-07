/**
 * Test unitario — nichos/conversor-fuente (J2, conversor stateless)
 *
 * Cubre: carga real del loader, RPC convertir (éxito: cruza datos crudos de la fuente
 * a la señal homogenea interna), par de fallo determinista nichos.fuente.convertir.failed
 * si el formato es invalido (sin items / item sin titulo), y que el manifest coincide
 * con la hoja J2 (subscribes/publishes/proyecciones _cruzar/_mapear).
 *
 * Ejecutar: node tests/unit/nichos__conversor-fuente.test.js
 */

'use strict';
const assert = require('assert');
const ModuleLoader = require('../../core/modules/loader.js');

function makeMiniBus() {
  const subs = new Map();
  const published = [];
  return {
    published,
    subscribe(name, handler) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(handler);
      return () => subs.get(name)?.delete(handler);
    },
    async publish(name, data) {
      published.push([name, data]);
      const set = subs.get(name);
      if (!set) return;
      for (const h of [...set]) { try { await h(data); } catch (_) {} }
    },
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (err) {
    console.error(`✗ ${description}`);
    console.error(`  ${err.message}`);
    if (process.env.STACK) console.error(err.stack);
    process.exit(1);
  }
}

const LOG = { debug(){}, info(){}, warn(){}, error(){} };
const METRICS = { increment(){}, gauge(){} };

(async () => {
  console.log('nichos/conversor-fuente — conversor stateless (J2)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'conversor-fuente');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._cruzar, 'function', 'proyección _cruzar presente (única frontera de formatos)');
  assert.strictEqual(typeof instance._mapear, 'function', 'proyección _mapear presente');

  await testAsync('convierte datos crudos de fuente → señal homogénea interna + publica nichos.datos_homogeneos', async () => {
    const res = await instance.onConvertirRequest({
      data: {
        nicho: 'salsa picante',
        fuente: 'buscador',
        formato: 'search-engine',
        dataset_bruto: {
          items: [
            { title: 'Comunidad de salsas picantes', link: 'https://ejemplo.com/salsas', score: 0.9 },
            { nombre: 'Foro amantes del picante', url: 'https://ejemplo.com/foro', relevancia: 0.8 },
            { titulo: 'Mercado de capsicum', enlace: 'https://ejemplo.com/mercado', rank: 3 }
          ]
        },
        request_id: 'C1'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.nicho, 'salsa picante');
    assert.strictEqual(res.data.fuente, 'buscador');
    assert.strictEqual(res.data.formato, 'search-engine');
    assert.strictEqual(res.data.total, 3);
    assert.strictEqual(res.data.convertidos, 3);
    assert.strictEqual(res.data.items.length, 3, 'todos los items crudos convertidos');
    // Cada item ya tiene la forma interna canonica (id, titulo, url, fuente, formato, relevancia)
    for (const it of res.data.items) {
      assert.ok(it.id && it.id.length > 0, 'id derivado determinista presente');
      assert.ok(it.titulo && it.titulo.length > 0, 'titulo normalizado a campo interno');
      assert.ok(it.url && it.url.startsWith('https://'), 'url normalizada a campo interno');
      assert.strictEqual(it.fuente, 'buscador', 'la fuente se propaga al item interno');
      assert.strictEqual(it.formato, 'search-engine', 'el formato se propaga al item interno');
      assert.strictEqual(it.convertido, true, 'marcado convertido');
    }
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.fuente.convertir.response' && v.request_id === 'C1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(bus.published.some(([n]) => n === 'nichos.datos_homogeneos'), 'publica nichos.datos_homogeneos');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.fuente.convertir.failed'), 'éxito NO dispara el par de fallo');
  });

  await testAsync('cruza el alias de campos del formato nativo al campo interno canonico', async () => {
    // mapeo directo de _mapear: campos nativos distintos -> titulo/url internos
    const it = instance._mapear({ name: 'Un nombre crudo', href: 'https://x.org/a' }, { fuente: 'api', formato: 'rest', nicho: 'n' });
    assert.ok(it, 'item convertible producido');
    assert.strictEqual(it.titulo, 'Un nombre crudo', 'name -> titulo');
    assert.strictEqual(it.url, 'https://x.org/a', 'href -> url');
    assert.ok(it.id.length > 0, 'id derivado de fuente:url');
  });

  await testAsync('dataset_bruto sin items → nichos.fuente.convertir.failed (formato invalido)', async () => {
    const res = await instance.onConvertirRequest({
      data: { nicho: 'salsa', fuente: 'buscador', formato: 'search-engine', dataset_bruto: { items: [] }, request_id: 'C2' }
    });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.error.code, 'FORMATO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.convertir.failed'), 'cierra el circulo con el par de fallo');
  });

  await testAsync('item sin titulo ni url → rechazado; conversion falla por no haber convertibles', async () => {
    const res = await instance.onConvertirRequest({
      data: {
        nicho: 'cerveza artesanal',
        fuente: 'comunidad',
        formato: 'scraping',
        dataset_bruto: { items: [{ score: 0.5 }, { solo: 'campo' }] },
        request_id: 'C3'
      }
    });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.error.code, 'FORMATO_INVALIDO');
    assert.ok(res.error.message.includes('titulo o url'), 'mensaje explica el motivo');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.convertir.failed'), 'par de fallo presente');
  });

  await testAsync('dataset_bruto ausente → par de fallo (formato invalido)', async () => {
    const res = await instance.onConvertirRequest({
      data: { nicho: 'n', fuente: 'buscador', formato: 'search-engine', request_id: 'C4' }
    });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.error.code, 'FORMATO_INVALIDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.convertir.failed'), 'par de fallo presente');
  });

  await testAsync('sin nicho → INVALID_INPUT + par de fallo', async () => {
    const res = await instance.onConvertirRequest({
      data: { fuente: 'buscador', formato: 'search-engine', dataset_bruto: { items: [{ titulo: 'x', url: 'https://x.org' }] }, request_id: 'C5' }
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.convertir.failed'), 'par de fallo presente');
  });

  await testAsync('proyeccion pura _cruzar: mezcla de item valido + invalido — convierte los validos y cuenta rechazados', async () => {
    const res = instance._cruzar({
      nicho: 'vino tinto',
      fuente: 'api',
      formato: 'rest',
      dataset_bruto: { items: [
        { title: 'Enologia local', link: 'https://vino.org/enologia', score: 0.7 },
        { solo: 'campo roto' },
        { nombre: 'Club del vino', url: 'https://vino.org/club', relevancia: 0.5 }
      ] }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.convertidos, 2);
    assert.strictEqual(res.data.rechazados, 1, 'el item roto se descarta, no inventa');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja J2', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), ['nichos.fuente.convertir.request']);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, ['nichos.datos_homogeneos', 'nichos.fuente.convertir.failed'].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();
