'use strict';

/**
 * cosecha__traer — EL TRAYECTO como OP DETERMINISTA (buscar → elegir → instalar → VERIFICAR).
 *
 * La lección: el falso éxito no se cura pidiéndole honestidad al LLM; se cura sacando el
 * OUTCOME de sus manos. cosecha.traer computa el veredicto {ok, traidas|motivo} en el reflejo.
 * El FRENO es verificar contra el store propio: no devuelve ok:true si la skill no acabó en
 * la cantera — aunque feeder diga que instaló algo.
 *
 * Ejecutar: node tests/unit/cosecha__traer.test.js
 */

const assert = require('assert');
const Cosecha = require('../../modules/cosecha/index.js');

function make() {
  const m = new Cosecha();
  m.logger = { debug(){}, info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m._skills = new Map();            // store vacío controlado
  m._descubrir = () => {};          // no re-escanea disco en el test
  return m;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── camino feliz: busca, elige la más instalada, instala, VERIFICA → ok:true ──
test('query → elige top installs, instala, verifica en store → ok:true', async () => {
  const m = make();
  m._rpc = async (ev, payload) => {
    if (ev === 'feeder.buscar.request')
      return { status: 200, data: { candidatos: [
        { id: 'a/b@bueno', installs: 400000 }, { id: 'c/d@menos', installs: 100000 } ] } };
    if (ev === 'feeder.instalar.request') {
      assert.strictEqual(payload.paquete, 'a/b@bueno', 'elige la más instalada');
      m._skills.set('bueno', { nombre: 'bueno' });   // simula que aterrizó en la cantera
      return { status: 200, data: { ingeridas: ['bueno'] } };
    }
    return null;
  };
  const r = await m._traer({ query: 'diseño' });
  assert.strictEqual(r.data.ok, true);
  assert.deepStrictEqual(r.data.traidas, ['bueno']);
});

// ── EL FRENO: feeder dice que instaló, pero NO está en el store → ok:false ──
test('feeder devuelve ingeridas pero la skill NO está en la cantera → ok:false (freno)', async () => {
  const m = make();
  m._rpc = async (ev) => {
    if (ev === 'feeder.buscar.request') return { status: 200, data: { candidatos: [{ id: 'x/y@z', installs: 90000 }] } };
    if (ev === 'feeder.instalar.request') return { status: 200, data: { ingeridas: ['fantasma'] } };  // NO se añade al store
    return null;
  };
  const r = await m._traer({ query: 'algo' });
  assert.strictEqual(r.data.ok, false, 'no miente ok:true si no está en el store');
  assert.match(r.data.motivo, /no dejó ninguna skill legible/);
});

// ── instalar falla (404) → ok:false con el motivo real ──
test('feeder.instalar 404 → ok:false con motivo', async () => {
  const m = make();
  m._rpc = async (ev) => {
    if (ev === 'feeder.buscar.request') return { status: 200, data: { candidatos: [{ id: 'x/y@z', installs: 90000 }] } };
    if (ev === 'feeder.instalar.request') return { status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'npx skills add no dejó ningún SKILL.md legible' } };
    return null;
  };
  const r = await m._traer({ query: 'algo' });
  assert.strictEqual(r.data.ok, false);
  assert.match(r.data.motivo, /SKILL\.md legible/);
});

// ── sin resultados en skills.sh → ok:false, no instala ──
test('búsqueda sin candidatos → ok:false, no intenta instalar', async () => {
  const m = make();
  let instaló = false;
  m._rpc = async (ev) => {
    if (ev === 'feeder.buscar.request') return { status: 200, data: { candidatos: [] } };
    if (ev === 'feeder.instalar.request') { instaló = true; return { status: 200, data: { ingeridas: [] } }; }
    return null;
  };
  const r = await m._traer({ query: 'inexistente' });
  assert.strictEqual(r.data.ok, false);
  assert.ok(!instaló, 'no instala si no hay candidatos');
});

// ── el LLM ya eligió: pasa `paquete`, se salta la búsqueda ──
test('paquete dado → no busca, instala y verifica directo', async () => {
  const m = make();
  let buscó = false;
  m._rpc = async (ev, payload) => {
    if (ev === 'feeder.buscar.request') { buscó = true; return { status: 200, data: { candidatos: [] } }; }
    if (ev === 'feeder.instalar.request') {
      assert.strictEqual(payload.paquete, 'owner/repo@elegida');
      m._skills.set('elegida', { nombre: 'elegida' });
      return { status: 200, data: { ingeridas: ['elegida'] } };
    }
    return null;
  };
  const r = await m._traer({ paquete: 'owner/repo@elegida' });
  assert.ok(!buscó, 'con paquete dado no busca');
  assert.strictEqual(r.data.ok, true);
});

// ── ni query ni paquete → inválido ──
test('sin query ni paquete → INVALID_INPUT', async () => {
  const m = make();
  m._rpc = async () => null;
  const r = await m._traer({});
  assert.strictEqual(r.status, 400);
});

// ── feeder no responde (timeout) → 504, no ok:true ──
test('feeder.buscar timeout → 504', async () => {
  const m = make();
  m._rpc = async () => null;   // simula timeout del bus
  const r = await m._traer({ query: 'algo' });
  assert.strictEqual(r.status, 504);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cosecha__traer] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cosecha__traer] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
