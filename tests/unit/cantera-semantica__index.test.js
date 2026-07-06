'use strict';

/**
 * cantera-semantica — ÍNDICE SEMÁNTICO de la cantera sobre TURSO. Prueba el flujo REAL
 * de Turso (in-memory) con un embedder STUB determinista (el embedding es la dependencia
 * inyectable; el reflejo custodia el índice). Verifica: indexar→buscar rankea por
 * SIGNIFICADO, filtro por dominio, reindexar desde cosecha, y la DEGRADACIÓN honesta
 * (sin Turso / interruptor OFF → 503, el caller cae a keyword).
 *
 * Ejecutar: node tests/unit/cantera-semantica__index.test.js
 */

const assert = require('assert');
let turso = null;
try { turso = require('@tursodatabase/database'); } catch (_) { turso = null; }
const Mod = require('../../modules/cantera-semantica');

// embedder determinista: 3 ejes de significado (coste · diseño · copy).
function fakeEmbed(texto) {
  const t = String(texto).toLowerCase();
  const sc = (ws) => ws.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
  let v = [
    sc(['coste', 'costear', 'escandallo', 'precio', 'margen', 'cuesta']),
    sc(['diseño', 'disenar', 'carta', 'visual', 'color', 'maqueta']),
    sc(['copy', 'texto', 'marketing', 'redacta', 'voz', 'eslogan'])
  ];
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map(x => x / n + 0.001);
}

function nuevo({ activo = true, conTurso = true } = {}) {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {} };
  m._turso = conTurso ? turso : null;
  m._dbPath = ':memory:';
  m.activo = activo;
  m._embed = async (texto) => fakeEmbed(texto);   // inyecta el embedder stub
  return m;
}

async function sembrar(m) {
  await m._indexar({ nombre: 'costear-receta', dominio: 'escandallo', texto: 'costear una receta: precio, margen y food cost' });
  await m._indexar({ nombre: 'disenar-carta', dominio: 'diseño', texto: 'diseñar la carta: color, visual y maqueta' });
  await m._indexar({ nombre: 'redactar-copy', dominio: 'copy', texto: 'redactar copy de marketing: la voz y el eslogan' });
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('indexar → buscar por SIGNIFICADO rankea el pertinente primero', async () => {
  const m = nuevo();
  await sembrar(m);
  const r = await m._buscar({ query: '¿cuánto cuesta hacer una pizza? el coste' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.resultados.length >= 1);
  assert.strictEqual(r.data.resultados[0].nombre, 'costear-receta', 'la de coste primero: ' + JSON.stringify(r.data.resultados.map(x => x.nombre)));
  assert.strictEqual(r.data.por, 'significado');
});

test('la distancia crece con la disimilitud (coste vs copy)', async () => {
  const m = nuevo();
  await sembrar(m);
  const r = await m._buscar({ query: 'el coste y el margen' });
  const d = Object.fromEntries(r.data.resultados.map(x => [x.nombre, x.distancia]));
  assert.ok(d['costear-receta'] < d['redactar-copy'], 'coste más cerca que copy');
});

test('filtro por dominio: solo trae ese dominio', async () => {
  const m = nuevo();
  await sembrar(m);
  const r = await m._buscar({ query: 'la voz de marca', dominio: 'copy' });
  assert.ok(r.data.resultados.every(x => x.dominio === 'copy'), 'todos copy');
  assert.ok(r.data.resultados.some(x => x.nombre === 'redactar-copy'));
});

test('upsert: reindexar la misma skill no duplica', async () => {
  const m = nuevo();
  await m._indexar({ nombre: 'costear-receta', dominio: 'escandallo', texto: 'coste v1' });
  await m._indexar({ nombre: 'costear-receta', dominio: 'escandallo', texto: 'coste v2 precio margen' });
  const e = await m._estado();
  assert.strictEqual(e.data.total_indexadas, 1, 'una sola fila tras el upsert');
});

test('buscar con índice vacío → 200 vacío (no error)', async () => {
  const m = nuevo();
  const r = await m._buscar({ query: 'lo que sea' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.total, 0);
});

test('reindexar trae las skills de cosecha (via _rpc stub) y las indexa', async () => {
  const m = nuevo();
  m._rpc = async (evento) => {
    if (evento === 'cosecha.listar.request') return { data: { skills: [
      { nombre: 'a', dominio: 'escandallo', descripcion: 'costear precio margen' },
      { nombre: 'b', dominio: 'diseño', descripcion: 'diseñar carta color' }
    ] } };
    return null;
  };
  const r = await m._reindexar({});
  assert.strictEqual(r.data.indexadas, 2);
  const e = await m._estado();
  assert.strictEqual(e.data.total_indexadas, 2);
});

test('DEGRADA honesto: interruptor OFF → 503 {degradado, motivo:apagado}', async () => {
  const m = nuevo({ activo: false });
  const r = await m._buscar({ query: 'x' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.degradado, true);
  assert.strictEqual(r.error.details.motivo, 'apagado');
});

test('DEGRADA honesto: sin Turso → 503 {motivo:turso_no_disponible}', async () => {
  const m = nuevo({ conTurso: false });
  const r = await m._buscar({ query: 'x' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'turso_no_disponible');
});

test('DEGRADA honesto: embeddings caídos → 503 {motivo:embeddings_no_disponibles}', async () => {
  const m = nuevo();
  m._embed = async () => null;   // el ai-gateway no responde
  const r = await m._indexar({ nombre: 'x', dominio: 'd', texto: 't' });
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.error.details.motivo, 'embeddings_no_disponibles');
});

test('estado reporta turso_disponible y total', async () => {
  const m = nuevo();
  await sembrar(m);
  const e = await m._estado();
  assert.strictEqual(e.data.turso_disponible, true);
  assert.strictEqual(e.data.total_indexadas, 3);
  assert.strictEqual(e.data.activo, true);
});

(async () => {
  if (!turso) { console.log('\n[cantera-semantica] SKIP — @tursodatabase/database no instalado'); process.exit(0); }
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[cantera-semantica] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[cantera-semantica] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();
