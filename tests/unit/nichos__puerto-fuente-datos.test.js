/**
 * Test unitario — nichos/puerto-fuente-datos (J1, puente stateless)
 *
 * Cubre: carga real del loader, RPC consultar (éxito con fuente conectada), fallo con su
 * par determinista nichos.fuente.consultar.failed, conectar → nichos.fuente.conectada,
 * reemplazar → nichos.fuente.reemplazada, y que el manifest coincide con la hoja J1.
 *
 * Ejecutar: node tests/unit/nichos__puerto-fuente-datos.test.js
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
  console.log('nichos/puerto-fuente-datos — puente stateless (J1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'puerto-fuente-datos');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._consultar, 'function', 'proyección _consultar presente');

  await testAsync('conectar fuente + publica nichos.fuente.conectada', async () => {
    const res = await instance.onConectarRequest({ data: { fuente: 'buscador', config: { tipo: 'search-engine' }, request_id: 'C1' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.conectada === true);
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.conectada'), 'publica nichos.fuente.conectada');
  });

  // Stub del RPC a crawl4rs (SearXNG) para el test determinista (sin red real).
  instance._rpc = async (evento) => {
    if (evento === 'crawl4rs.buscar.request') {
      return { status: 200, data: { resultados: [{ titulo: 'salsa picante', url: 'https://x', resumen: 'demanda' }] } };
    }
    return null;
  };

  await testAsync('RPC consultar (buscador) → enruta a crawl4rs y devuelve dataset REAL', async () => {
    const res = await instance.onConsultarRequest({ data: { nicho: 'salsa picante', request_id: 'S1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.fuente, 'buscador', 'enruta hacia la fuente conectada');
    assert.ok(Array.isArray(res.data.dataset.items) && res.data.dataset.items.length === 1, 'dataset con items reales de SearXNG');
    assert.strictEqual(res.data.dataset.items[0].titulo, 'salsa picante', 'el resultado real viaja en el dataset');
    assert.strictEqual(res.data.dataset_bruto.semilla, 'salsa picante', 'DatasetBruto con la semilla del nicho');
    assert.ok(typeof res.data.rate.por_minuto === 'number', 'rate presente');
    assert.ok(typeof res.data.coste.creditos === 'number', 'coste presente');
    const respEvt = bus.published.find(([n, v]) => n === 'nichos.fuente.consultar.response' && v.request_id === 'S1');
    assert.ok(respEvt, 'publica .response correlado con request_id');
    assert.ok(!bus.published.some(([n]) => n === 'nichos.fuente.consultar.failed'), 'éxito NO dispara el par de fallo');
  });

  await testAsync('consultar con crawl4rs caído (buscador) → par de fallo honesto', async () => {
    instance._rpc = async () => null;   // simulamos SearXNG/crawl4rs inalcanzable
    const res = await instance.onConsultarRequest({ data: { nicho: 'cerveza', request_id: 'S5' } });
    assert.strictEqual(res.status, 502);
    assert.strictEqual(res.error.code, 'UPSTREAM_UNREACHABLE');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.consultar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('consultar fuente no conectada → nichos.fuente.consultar.failed', async () => {
    // 'scraping' esta en la whitelist (autorizable) pero NO se auto-conecta en onLoad
    // ('buscador'/'api'/'comunidad' si). Es la fuente genuinamente no-conectada.
    const res = await instance.onConsultarRequest({ data: { nicho: 'cerveza artesanal', fuente: 'scraping', request_id: 'S2' } });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.consultar.failed'), 'cierra el círculo con el par de fallo');
  });

  await testAsync('consultar sin ninguna fuente conectada → par de fallo', async () => {
    const PuertoFuenteDatos = require('../../modules/nichos/puerto-fuente-datos/index.js');
    const solo = new PuertoFuenteDatos();
    solo.logger = LOG; solo.metrics = METRICS; solo.eventBus = bus;
    const res = await solo.onConsultarRequest({ data: { nicho: 'n', request_id: 'S3' } });
    assert.strictEqual(res.status, 404);
    assert.ok(res.error.code === 'RESOURCE_NOT_FOUND', 'código canónico');
  });

  await testAsync('reemplazar fuente conectada → nichos.fuente.reemplazada', async () => {
    const res = await instance.onReemplazarRequest({ data: { fuente: 'buscador', por: 'api', request_id: 'R1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.de, 'buscador');
    assert.strictEqual(res.data.a, 'api');
    assert.ok(bus.published.some(([n]) => n === 'nichos.fuente.reemplazada'), 'publica nichos.fuente.reemplazada');
    // 'api' ahora SÍ tiene proveedor cableado (APIs públicas sin key: autocompletado
    // + Wikipedia). Con red real devuelve datos; en el test (sin red) degrada honesto.
    const q = await instance.onConsultarRequest({ data: { nicho: 'salsa', request_id: 'S4' } });
    assert.ok([200, 502].includes(q.status), 'api cableada: 200 con datos o 502 si el upstream cae');
    assert.ok(!(q.status === 501 && q.error && q.error.code === 'PROVEEDOR_NO_CABLEADO'),
      'api ya NO degrada por PROVEEDOR_NO_CABLEADO');
  });

  await testAsync('consultar fuente api → enruta a APIs publicas y devuelve dataset REAL', async () => {
    instance._getJson = async (url) => {
      if (url.includes('suggestqueries.google')) return ['q', ['mantenimiento de piscinas', 'mantenimiento de piscinas precio']];
      if (url.includes('bing.com/osjson')) return ['q', ['mantenimiento de piscinas madrid']];
      if (url.includes('duckduckgo.com/ac')) return [{ phrase: 'mantenimiento de piscinas valencia' }];
      if (url.includes('wikipedia.org')) return { query: { search: [{ title: 'Piscina', snippet: '<b>Piscina</b> es...' }] } };
      return null;
    };
    await instance.onConectarRequest({ data: { fuente: 'api', config: { tipo: 'api-publica' }, request_id: 'CA' } });
    const res = await instance.onConsultarRequest({ data: { fuente: 'api', nicho: 'mantenimiento de piscinas', request_id: 'CA2' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.dataset.items.length >= 5, 'junta sugerencias de varias fuentes');
    assert.ok(res.data.fuentes_con_datos.includes('suggest_google'), 'usa autocompletado google');
    assert.ok(res.data.fuentes_con_datos.includes('wikipedia'), 'usa wikipedia');
    assert.strictEqual(res.data.coste.creditos, 0, 'APIs publicas: coste cero');
  });

  await testAsync('consultar fuente comunidad → enruta a comunidades abiertas', async () => {
    instance._getJson = async (url) => {
      if (url.includes('hn.algolia')) return { hits: [{ title: 'Hilo sobre piscinas', url: 'https://x' }] };
      if (url.includes('lemmy')) return { posts: [{ post: { name: 'Post piscinas', url: 'https://y' } }] };
      if (url.includes('mastodon')) return { accounts: [{ display_name: 'Cuenta piscinas', url: 'https://z' }] };
      return null;
    };
    await instance.onConectarRequest({ data: { fuente: 'comunidad', config: { tipo: 'comunidad' }, request_id: 'CC' } });
    const res = await instance.onConsultarRequest({ data: { fuente: 'comunidad', nicho: 'piscinas', request_id: 'CC2' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.dataset.items.length >= 3, 'junta las 3 comunidades');
    assert.strictEqual(res.data.coste.creditos, 0);
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja J1', () => {
    const subs = d.manifest.subscribes || [];
    assert.deepStrictEqual(subs.map(s => s.event), [
      'nichos.fuente.consultar.request',
      'nichos.fuente.conectar.request',
      'nichos.fuente.reemplazar.request'
    ]);
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.fuente.consultar.failed',
      'nichos.fuente.conectada',
      'nichos.fuente.reemplazada'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();
