'use strict';

/**
 * cosecha__fusion — BÚSQUEDA HÍBRIDA (RRF) del tool buscar_skill. Fusiona el rank por
 * palabras (_buscar, BM25-lite) + el rank por significado (cantera.buscar_semantica, stub)
 * con reciprocal-rank fusion + boost de tier semilla. Lección de gbrain (gstack): vector-solo
 * pierde; fusionar vector+palabra+source-tier boost gana. Verifica: fusión reordena, el que
 * aparece en AMBAS listas sube, el boost de tier desempata a favor de la semilla, y la
 * DEGRADACIÓN honesta (semántica caída/vacía → palabras). Además el auto-index best-effort.
 *
 * Ejecutar: node tests/unit/cosecha__fusion.test.js
 */

const assert = require('assert');
const Mod = require('../../modules/cosecha');

// cantera fija (sin tocar fs): pobla this._skills a mano, con tier.
function nuevo({ semantica = null, hibrida = true } = {}) {
  const m = new Mod();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {} };
  m.hibrida = hibrida;   // por defecto ON en los tests de fusión; el gate se prueba aparte
  m._skills = new Map([
    ['coste-crecido', { nombre: 'coste-crecido', descripcion: 'costear precio margen', fuente: 'agente', dominio: 'escandallo', tags: [], tier: 'crecido' }],
    ['coste-semilla', { nombre: 'coste-semilla', descripcion: 'coste alimentario food cost', fuente: 'enki', dominio: 'escandallo', tags: [], tier: 'semilla' }],
    ['diseno', { nombre: 'diseno', descripcion: 'diseñar la carta color visual', fuente: 'agente', dominio: 'diseño', tags: [], tier: 'crecido' }]
  ]);
  // stub del RPC a la cantera semántica: `semantica` = array de nombres (orden por significado) o null (degradada)
  m._rpc = async (evento) => {
    if (evento !== 'cantera.buscar_semantica.request') return null;
    if (semantica === null) return null;                                   // degradada
    return { status: 200, data: { resultados: semantica.map(n => ({ nombre: n, dominio: '', distancia: 0.1 })) } };
  };
  return m;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('con semántica → por:"fusion" y funde nombres de ambas mitades', async () => {
  const m = nuevo({ semantica: ['diseno', 'coste-crecido'] });   // semántica trae 'diseno' que la palabra 'coste' no daría
  const r = await m._buscarFusion({ query: 'coste' });
  assert.strictEqual(r.data.por, 'fusion');
  const nombres = r.data.skills.map(s => s.nombre);
  assert.ok(nombres.includes('coste-crecido') && nombres.includes('diseno'), 'aparecen los de palabra y los de significado: ' + nombres.join(','));
});

test('el que aparece en AMBAS listas sube sobre el que sale en una sola', async () => {
  // palabra 'coste' → [coste-crecido, coste-semilla]; semántica → [coste-crecido, diseno]
  // coste-crecido está en las dos → RRF lo pone primero.
  const m = nuevo({ semantica: ['coste-crecido', 'diseno'] });
  const r = await m._buscarFusion({ query: 'coste', limite: 3 });
  assert.strictEqual(r.data.skills[0].nombre, 'coste-crecido', 'el de ambas listas primero: ' + r.data.skills.map(s => s.nombre));
});

test('boost de tier semilla: empate de rank → gana la semilla', async () => {
  // que cada uno salga rank-0 en UNA sola lista (mismo RRF 1/60): semilla en palabra, crecido en semántica.
  // palabra 'alimentario' → solo coste-semilla (rank0). semántica → [coste-crecido] (rank0). Empate → tier boost desempata.
  const m = nuevo({ semantica: ['coste-crecido'] });
  const r = await m._buscarFusion({ query: 'alimentario', limite: 3 });
  const nombres = r.data.skills.map(s => s.nombre);
  assert.strictEqual(nombres[0], 'coste-semilla', 'la semilla sube por el boost de tier: ' + nombres.join(','));
});

test('boost de tier OFICIAL: una skill de equipo oficial sube igual que la semilla', async () => {
  // dos skills que salen rank-0 en UNA lista cada una (mismo RRF): oficial en palabra, crecido en semántica.
  const m = nuevo({ semantica: ['c-comunidad'] });
  m._skills = new Map([
    ['b-oficial', { nombre: 'b-oficial', descripcion: 'backend oficial vercel', fuente: 'vercel', dominio: 'dev', tags: [], tier: 'oficial' }],
    ['c-comunidad', { nombre: 'c-comunidad', descripcion: 'backend comunidad', fuente: 'agente', dominio: 'dev', tags: [], tier: 'crecido' }]
  ]);
  const r = await m._buscarFusion({ query: 'oficial', limite: 3 });
  assert.strictEqual(r.data.skills[0].nombre, 'b-oficial', 'la oficial sube por el source-tier boost: ' + r.data.skills.map(s => s.nombre));
});

test('DEGRADA honesto: semántica caída (_rpc null) → por:"palabras", solo palabra', async () => {
  const m = nuevo({ semantica: null });
  const r = await m._buscarFusion({ query: 'coste' });
  assert.strictEqual(r.data.por, 'palabras');
  assert.ok(r.data.skills.every(s => s.dominio === 'escandallo'), 'solo los que matchea la palabra coste');
});

test('DEGRADA honesto: índice vacío (resultados []) → por:"palabras"', async () => {
  const m = nuevo({ semantica: [] });
  const r = await m._buscarFusion({ query: 'coste' });
  assert.strictEqual(r.data.por, 'palabras');
});

test('handleBuscarTool con híbrida ON → enruta a la fusión', async () => {
  const m = nuevo({ semantica: ['coste-crecido'], hibrida: true });
  const r = await m.handleBuscarTool({ query: 'coste' });
  assert.strictEqual(r.data.por, 'fusion');
});

test('GATE: híbrida OFF (default) → palabras puras, sin tocar la semántica', async () => {
  let semLlamada = false;
  const m = nuevo({ semantica: ['coste-crecido'], hibrida: false });
  const rpcOrig = m._rpc;
  m._rpc = async (ev, p, o) => { if (ev === 'cantera.buscar_semantica.request') semLlamada = true; return rpcOrig(ev, p, o); };
  const r = await m.handleBuscarTool({ query: 'coste' });
  assert.strictEqual(r.data.por, undefined, 'sin fusión: no marca por');
  assert.strictEqual(semLlamada, false, 'OFF no llama a la cantera semántica (cero RPC)');
  assert.ok(r.data.skills.length >= 1, 'sigue devolviendo resultados por palabras');
});

test('onInterruptorCambiado enciende/apaga en caliente', () => {
  const m = nuevo({ hibrida: false });
  m.onInterruptorCambiado({ data: { id: 'busqueda-hibrida', enabled: true } });
  assert.strictEqual(m.hibrida, true);
  m.onInterruptorCambiado({ data: { id: 'busqueda-hibrida', enabled: false } });
  assert.strictEqual(m.hibrida, false);
  m.onInterruptorCambiado({ data: { id: 'otro', enabled: true } });   // otro id no afecta
  assert.strictEqual(m.hibrida, false);
});

test('cosecha.buscar (RPC del conserje) NO fusiona: se queda en palabras (sin `por`)', () => {
  const m = nuevo({ semantica: ['coste-crecido'] });
  const r = m._buscar({ query: 'coste' });   // el reflejo puro, síncrono
  assert.strictEqual(r.data.por, undefined, 'buscar puro no marca `por` ni fusiona');
});

test('auto-index: lote pequeño → publica cantera.indexar por cada skill', () => {
  const m = nuevo();
  const pub = [];
  m.eventBus = { publish: (ev, p) => pub.push({ ev, p }) };
  m._autoIndexar([{ nombre: 'coste-crecido' }, { nombre: 'diseno' }], 2);
  assert.strictEqual(pub.length, 2);
  assert.ok(pub.every(x => x.ev === 'cantera.indexar.request'));
  assert.ok(pub[0].p.nombre && pub[0].p.texto, 'lleva nombre + texto a embeber');
});

test('auto-index: lote grande (>20) → NO publica (usa reindexar)', () => {
  const m = nuevo();
  const pub = [];
  m.eventBus = { publish: (ev, p) => pub.push({ ev, p }) };
  m._autoIndexar(Array.from({ length: 21 }, (_, i) => ({ nombre: 'x' + i })), 21);
  assert.strictEqual(pub.length, 0);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[cosecha__fusion] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[cosecha__fusion] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();
