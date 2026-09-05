'use strict';
// Test unitario de buscador_www — verifica extractores por fuente, dedup por url
// y degradación limpia (una fuente caída no tumba la búsqueda). Sin red real:
// fetch se mockea. Convención: tests/unit/<modulo>.test.js.

const assert = require('assert');
const BuscadorWwwReflejo = require('../../modules/buscador_www/index.js');

const HTMLS = {
  cults3d: '<a href="/en/3d-model/connector-90"><h3>Conector 90 grados</h3></a><a href="/en/3d-model/connector-t"><h3>Conector T</h3></a>',
  printables: '<a href="/model/123"><span class="name">Soporte cable</span></a>',
  thingiverse: '<a href="/thing:456"><span class="card-title">Clip</span></a>',
  makerworld: '<a href="/en/models/789"><span class="model-name">Brida</span></a>'
};

function mockFetch(htmls, falla = []) {
  global.fetch = async (url) => {
    const key = url.includes('cults3d') ? 'cults3d'
      : url.includes('printables') ? 'printables'
      : url.includes('thingiverse') ? 'thingiverse'
      : url.includes('makerworld') ? 'makerworld' : null;
    if (!key || falla.includes(key)) return { ok: false };
    return { ok: true, text: async () => htmls[key] };
  };
}

async function run() {
  const m = new BuscadorWwwReflejo();

  // 1) Todas las fuentes OK → 5 resultados, dedup por url, por_fuente ok.
  mockFetch(HTMLS);
  let r = await m._buscar({ query: 'conector', fuentes: ['cults3d', 'printables', 'thingiverse', 'makerworld'] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.total, 5, 'debe haber 5 resultados únicos');
  assert.strictEqual(r.data.resultados.length, 5);
  assert.strictEqual(r.data.por_fuente.cults3d.n, 2);
  assert.strictEqual(r.data.por_fuente.printables.n, 1);
  assert.strictEqual(r.data.por_fuente.thingiverse.n, 1);
  assert.strictEqual(r.data.por_fuente.makerworld.n, 1);
  assert.ok(r.data.por_fuente.cults3d.ok);
  console.log('PASS 1: 4 fuentes OK, 5 resultados únicos, dedup por url');

  // 2) Dedup: misma url en dos fuentes → se cuenta una vez.
  mockFetch({ cults3d: HTMLS.cults3d, printables: HTMLS.cults3d }); // printables devuelve html de cults3d (misma url)
  r = await m._buscar({ query: 'x', fuentes: ['cults3d', 'printables'] });
  assert.strictEqual(r.data.total, 2, 'dedup por url: 2 únicos aunque 4 crudos');
  console.log('PASS 2: dedup por url (2 únicos de 4 crudos)');

  // 3) Degradación limpia: una fuente caída no tumba la búsqueda.
  mockFetch(HTMLS, ['cults3d']);
  r = await m._buscar({ query: 'conector', fuentes: ['cults3d', 'printables', 'thingiverse', 'makerworld'] });
  assert.strictEqual(r.status, 200, 'status 200 aunque cults3d falle');
  assert.strictEqual(r.data.por_fuente.cults3d.ok, false);
  assert.strictEqual(r.data.por_fuente.cults3d.n, 0);
  assert.strictEqual(r.data.total, 3, 'las otras 3 fuentes siguen dando resultados');
  console.log('PASS 3: degradación limpia (cults3d caída, 3 fuentes OK)');

  // 4) Sin query → 400 INVALID_INPUT.
  r = await m._buscar({ fuentes: ['cults3d'] });
  assert.strictEqual(r.status, 400);
  console.log('PASS 4: sin query → 400 INVALID_INPUT');

  // 5) Fuente desconocida se ignora; sin fuentes → default (printables, makerworld,
  //    cults3d — thingiverse fuera por regla del dueño).
  mockFetch(HTMLS);
  r = await m._buscar({ query: 'conector', fuentes: ['cults3d', 'noexiste'] });
  assert.strictEqual(r.data.por_fuente.cults3d.ok, true);
  assert.strictEqual(r.data.por_fuente.noexiste, undefined, 'fuente desconocida se ignora');
  r = await m._buscar({ query: 'conector' });
  assert.strictEqual(r.data.total, 4, 'sin fuentes → default (printables+makerworld+cults3d), thingiverse fuera');
  assert.strictEqual(r.data.por_fuente.thingiverse, undefined, 'thingiverse no se consulta por defecto');
  console.log('PASS 5: fuente desconocida ignorada; sin fuentes → default (thingiverse fuera)');

  console.log('\nALL PASS (5/5)');
}

run().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
