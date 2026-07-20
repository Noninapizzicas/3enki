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

test('_sumar PURO: Σ precio_por_base × cantidad', () => {
  const m = new Mod();
  const resolver = (ref) => ({ masa: { coste_por_base: 0.2 }, tomate: { coste_por_base: 0.1 } })[ref];
  const r = m._sumar([{ ref: 'masa', cantidad: 315 }, { ref: 'tomate', cantidad: 60 }], resolver);
  assert.strictEqual(r.coste_centimos, 69, '0.2*315 + 0.1*60 = 69');
  assert.deepStrictEqual(r.faltantes, []);
});

test('_sumar: precio ausente → faltante, NO inventa', () => {
  const m = new Mod();
  const r = m._sumar([{ ref: 'masa', cantidad: 315 }, { ref: 'albahaca', cantidad: 2 }], (ref) => ({ masa: { coste_por_base: 0.2 } })[ref] ?? null);
  assert.strictEqual(r.coste_centimos, 63, 'solo suma lo que tiene precio');
  assert.deepStrictEqual(r.faltantes, ['albahaca']);
});

test('_sumar CONVIERTE: componente en kg, precio en c/g → normaliza antes de multiplicar', () => {
  const m = new Mod();
  const resolver = () => ({ coste_por_base: 0.2, unidad_base: 'g' });   // 0.2 c/g
  const r = m._sumar([{ ref: 'masa', cantidad: 0.315, unidad: 'kg' }], resolver);   // 0.315 kg = 315 g
  assert.strictEqual(r.coste_centimos, 63, '0.2 c/g * 315 g = 63');
});

test('_sumar líquido→peso con densidad: 1 L, precio c/g, densidad 1.03', () => {
  const m = new Mod();
  const resolver = () => ({ coste_por_base: 0.1, unidad_base: 'g', densidad_g_ml: 1.03 });
  const r = m._sumar([{ ref: 'leche', cantidad: 1, unidad: 'l' }], resolver);   // 1 L → 1030 g
  assert.strictEqual(r.coste_centimos, 103, '0.1 c/g * 1030 g = 103');
});

test('_sumar unidades irreconciliables (ml→g sin densidad) → faltante, NO inventa', () => {
  const m = new Mod();
  const resolver = () => ({ coste_por_base: 0.1, unidad_base: 'g' });   // sin densidad
  const r = m._sumar([{ ref: 'agua', cantidad: 100, unidad: 'ml' }], resolver);
  assert.strictEqual(r.coste_centimos, 0);
  assert.deepStrictEqual(r.faltantes, ['agua']);
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

test('_costear INTEGRA conversor: insumo en c/g + componente en kg → coste correcto', async () => {
  const m = new Mod();
  m.logger = { info(){}, warn(){}, error(){}, debug(){} };
  m._publicados = []; m.eventBus = { publish: (ev, p) => m._publicados.push({ ev, p }) }; m.metrics = { increment(){} };
  m._rpc = async (ev, p) => {
    if (ev === 'compuestos.get.request') return { status: 200, data: { compuesto: { id: 'x', componentes: [{ ref: 'harina', cantidad: 2, unidad: 'kg' }] } } };
    if (ev === 'insumos.get.request') return { status: 200, data: { insumo: { id: 'harina', naturalezas: { coste_centimos_por_unidad: 0.05, unidad_base: 'g' } } } };
    return { status: 404 };
  };
  const r = await m._costear({ project_id: 'p', compuesto_id: 'x' });
  assert.strictEqual(r.data.coste_centimos, 100, '0.05 c/g * 2000 g = 100');
  assert.deepStrictEqual(r.data.faltantes, []);
});

test('_resolverRef sub-compuesto con RENDIMIENTO: coste del lote / lo que rinde → coste por gramo', async () => {
  const m = new Mod();
  m.logger = { info(){}, warn(){}, error(){}, debug(){} };
  m._publicados = []; m.eventBus = { publish(){} }; m.metrics = { increment(){} };
  const compuestos = {
    pizza: { id: 'pizza', componentes: [{ ref: 'masa', cantidad: 315, unidad: 'g' }] },
    masa: { id: 'masa', componentes: [{ ref: 'flour_ins', cantidad: 1000, unidad: 'g' }], rendimiento: { cantidad: 1000, unidad: 'g' } },
  };
  m._rpc = async (ev, p) => {
    if (ev === 'compuestos.get.request') return { status: 200, data: { compuesto: compuestos[p.compuesto_id] } };
    if (ev === 'insumos.get.request') return (p.insumo_id === 'flour_ins')
      ? { status: 200, data: { insumo: { naturalezas: { coste_centimos_por_unidad: 0.2, unidad_base: 'g' } } } }
      : { status: 404 };   // 'masa' NO es insumo → cae a sub-compuesto
    return { status: 404 };
  };
  const r = await m._costear({ project_id: 'p', compuesto_id: 'pizza' });
  assert.strictEqual(r.data.coste_centimos, 63, 'masa: 200c/1000g = 0.2 c/g; pizza usa 315 g → 63');
  assert.deepStrictEqual(r.data.faltantes, []);
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

test('_costearTodos EL LOOP: recorre la cola de a una → {total, calculados, incompletos}', async () => {
  const m = new Mod();
  m.logger = { info(){}, warn(){}, error(){}, debug(){} };
  m._publicados = []; m.eventBus = { publish: (ev, p) => m._publicados.push({ ev, p }) }; m.metrics = { increment(){} };
  const catalogo = {
    a: { id: 'a', componentes: [{ ref: 'masa', cantidad: 100 }] },              // completa
    b: { id: 'b', componentes: [{ ref: 'raro', cantidad: 50 }] },               // faltante
  };
  m._rpc = async (ev, p) => {
    if (ev === 'compuestos.pendientes.request') return { status: 200, data: { pendientes: ['a', 'b'] } };
    if (ev === 'compuestos.get.request') return { status: 200, data: { compuesto: catalogo[p.compuesto_id] } };
    if (ev === 'insumos.get.request') return (p.insumo_id === 'masa') ? { status: 200, data: { insumo: { naturalezas: { coste_centimos_por_unidad: 0.2 } } } } : { status: 404 };
    return { status: 404 };
  };
  const r = await m._costearTodos({ project_id: 'p' });
  assert.strictEqual(r.data.total, 2);
  assert.strictEqual(r.data.calculados, 1, 'a completa');
  assert.strictEqual(r.data.incompletos, 1, 'b faltante');
  assert.ok(m._publicados.some(x => x.ev === 'compuesto.coste.calculado'), 'emitió por la completa');
  assert.ok(m._publicados.some(x => x.ev === 'compuesto.coste.incompleto'), 'avisó por la faltante');
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
