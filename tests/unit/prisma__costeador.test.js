'use strict';
/**
 * prisma__costeador — el motor: cuesta un compuesto RECETA A RECETA (Σ ref×cantidad),
 * emite compuesto.coste.calculado, y si falta un precio NO inventa → compuesto.coste.incompleto.
 * Ejecutar: node tests/unit/prisma__costeador.test.js
 */
const assert = require('assert');
const Mod = require('../../modules/prisma/costeador/index.js');

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('_sumar PURO: Σ precio×cantidad', () => {
  const m = new Mod();
  const precioDe = (ref) => ({ masa: 0.2, tomate: 0.1 })[ref];   // céntimos por gramo
  const r = m._sumar([{ ref: 'masa', cantidad: 315 }, { ref: 'tomate', cantidad: 60 }], precioDe);
  assert.strictEqual(r.coste_centimos, 69, '0.2*315 + 0.1*60 = 69');
  assert.deepStrictEqual(r.faltantes, []);
});

test('_sumar: precio ausente → faltante, NO inventa', () => {
  const m = new Mod();
  const r = m._sumar([{ ref: 'masa', cantidad: 315 }, { ref: 'albahaca', cantidad: 2 }], (ref) => ({ masa: 0.2 })[ref] ?? null);
  assert.strictEqual(r.coste_centimos, 63, 'solo suma lo que tiene precio');
  assert.deepStrictEqual(r.faltantes, ['albahaca']);
});

function gateway(compuesto, precios) {
  const m = new Mod();
  m.logger = { info(){}, warn(){}, error(){}, debug(){} };
  m._publicados = [];
  m.eventBus = { publish: (ev, p) => m._publicados.push({ ev, p }) };
  m.metrics = { increment(){} };
  m._rpc = async (evento, payload) => {
    if (evento === 'compuestos.get.request') return { status: 200, data: { compuesto } };
    if (evento === 'insumos.get.request') {
      const p = precios[payload.insumo_id];
      return (p == null) ? { status: 404 } : { status: 200, data: { insumo: { id: payload.insumo_id, naturalezas: { coste_centimos_por_unidad: p } } } };
    }
    return { status: 404 };
  };
  return m;
}

test('_costear completo → emite compuesto.coste.calculado', async () => {
  const m = gateway(
    { id: 'pizza_samba', componentes: [{ ref: 'masa', cantidad: 315 }, { ref: 'tomate', cantidad: 60 }] },
    { masa: 0.2, tomate: 0.1 });
  const r = await m._costear({ project_id: 'p', compuesto_id: 'pizza_samba' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.coste_centimos, 69);
  const ev = m._publicados.find(x => x.ev === 'compuesto.coste.calculado');
  assert.ok(ev, 'emitió el evento PRISMA (no escandallo)');
  assert.strictEqual(ev.p.coste_unidad, 0.69);
});

test('_costear con precio faltante → compuesto.coste.incompleto (avisa, no inventa)', async () => {
  const m = gateway(
    { id: 'pizza_samba', componentes: [{ ref: 'masa', cantidad: 315 }, { ref: 'albahaca', cantidad: 2 }] },
    { masa: 0.2 });   // albahaca sin precio
  await m._costear({ project_id: 'p', compuesto_id: 'pizza_samba' });
  const ev = m._publicados.find(x => x.ev === 'compuesto.coste.incompleto');
  assert.ok(ev, 'avisó de lo incompleto');
  assert.deepStrictEqual(ev.p.faltantes, ['albahaca']);
  assert.ok(!m._publicados.find(x => x.ev === 'compuesto.coste.calculado'), 'NO emite calculado si falta un precio');
});

test('_costear compuesto inexistente → 404', async () => {
  const m = new Mod(); m._rpc = async () => ({ status: 404 });
  assert.strictEqual((await m._costear({ project_id: 'p', compuesto_id: 'no' })).status, 404);
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); console.log('  ✓ ' + n); ok++; }
    catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); }
  }
  console.log(`[prisma__costeador] ${ok === tests.length ? 'OK' : 'FAIL'} ${ok}/${tests.length}`);
  process.exit(ok === tests.length ? 0 : 1);
})();
