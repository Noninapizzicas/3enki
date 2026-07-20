'use strict';
/**
 * prisma__formulador — los micro-agentes fuzzy (perspectiva-c, forma prisma).
 * _parse y _validar* son PUROS. Los 3 handlers se prueban con _fuzzy/_rpc mockeados (sin LLM real).
 * Ejecutar: node tests/unit/prisma__formulador.test.js
 */
const assert = require('assert');
const Mod = require('../../modules/prisma/formulador/index.js');

const tests = [];
const test = (n, f) => tests.push({ n, f });
function fresh() {
  const m = new Mod();
  m.logger = { info(){}, warn(){}, error(){}, debug(){} };
  m._publicados = [];
  m.eventBus = { publish: (ev, p) => m._publicados.push({ ev, p }) };
  return m;
}

test('_parse: fenced ```json · texto alrededor · objeto · basura', () => {
  const m = fresh();
  assert.deepStrictEqual(m._parse({ data: { content: '```json\n{"a":1}\n```' } }), { a: 1 });
  assert.deepStrictEqual(m._parse({ content: 'claro: {"a":2} fin' }), { a: 2 });
  assert.deepStrictEqual(m._parse({ data: { content: { a: 3 } } }), { a: 3 });
  assert.strictEqual(m._parse({ content: 'sin json' }), null);
});

test('_validarReconciliar: NO inventa ids fuera de candidatos', () => {
  const m = fresh();
  const cand = [{ id: 'tomate' }];
  assert.strictEqual(m._validarReconciliar({ accion: 'usar', insumo_id: 'tomate', motivo: 'x' }, cand).insumo_id, 'tomate');
  assert.strictEqual(m._validarReconciliar({ accion: 'usar', insumo_id: 'inventado' }, cand), null, 'id no en candidatos → rechaza');
  assert.strictEqual(m._validarReconciliar({ accion: 'crear' }, cand).accion, 'crear');
  assert.strictEqual(m._validarReconciliar({ accion: 'otra' }, cand), null);
});

test('_validarModelar: cantidad ausente → null (no inventa)', () => {
  const m = fresh();
  const r = m._validarModelar({ nombre: 'Samba', componentes: [
    { nombre_crudo: 'masa', cantidad: 315, unidad: 'g' },
    { nombre_crudo: 'albahaca', unidad: 'hoja' } ] });
  assert.strictEqual(r.componentes[0].cantidad, 315);
  assert.strictEqual(r.componentes[1].cantidad, null, 'ausente → null');
  assert.strictEqual(m._validarModelar({ nombre: 'x', componentes: [] }), null);
});

test('_reconciliar (fuzzy stub) → decisión válida', async () => {
  const m = fresh();
  m._fuzzy = async () => ({ accion: 'usar', insumo_id: 'mozzarella', motivo: 'typo' });
  const r = await m._reconciliar({ project_id: 'p', nombre_crudo: 'mozarella', candidatos: [{ id: 'mozzarella', nombre: 'Mozzarella' }] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.accion, 'usar');
  assert.strictEqual(r.data.insumo_id, 'mozzarella');
});

test('_reconciliar: fuzzy inventa un id → 502 (no pasa)', async () => {
  const m = fresh();
  m._fuzzy = async () => ({ accion: 'usar', insumo_id: 'fantasma' });
  const r = await m._reconciliar({ project_id: 'p', nombre_crudo: 'x', candidatos: [{ id: 'real' }] });
  assert.strictEqual(r.status, 502, 'id inventado → contrato inválido');
});

test('_modelar: estructura, reconcilia, persiste; cantidad null → pregunta_abierta', async () => {
  const m = fresh();
  m._fuzzy = async (system) => system.includes('MODELADOR')
    ? { nombre: 'Pizza Samba', componentes: [
        { nombre_crudo: 'masa', cantidad: 315, unidad: 'g' },
        { nombre_crudo: 'albahaca', cantidad: null, unidad: 'hoja' } ] }
    : null;
  // reconciliar: masa→usar, albahaca→crear
  m._reconciliar = async ({ nombre_crudo }) => ({ status: 200, data: { accion: 'usar', insumo_id: nombre_crudo } });
  const crear = [];
  m._rpc = async (ev, p) => {
    if (ev === 'insumos.crear.request') return { status: 201, data: { insumo: { id: p.nombre } } };
    if (ev === 'compuestos.crear.request') { crear.push(p); return { status: 201, data: { compuesto: { id: 'pizza_samba' } } }; }
    return { status: 404 };
  };
  const r = await m._modelar({ project_id: 'p', crudo: 'pizza samba masa 315g albahaca 2 hojas' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.compuesto_id, 'pizza_samba', 'persistió el compuesto');
  assert.ok(r.data.preguntas_abiertas.some(a => a.campo === 'cantidad' && a.valor === 'albahaca'), 'albahaca sin cantidad → abierta');
  assert.strictEqual(crear[0].componentes.length, 1, 'solo persiste el componente listo (masa); albahaca queda abierta');
  assert.ok(m._publicados.some(x => x.ev === 'formulador.faltan_datos'), 'avisó de lo que falta');
});

test('_clasificar (fuzzy stub) → clasificación válida', async () => {
  const m = fresh();
  m._fuzzy = async () => ({ familia: 'quesos', subfamilia: 'frescos', grupo: null, propuesta_nueva: false });
  const r = await m._clasificar({ project_id: 'p', item_nombre: 'Mozzarella', eje: 'compra', taxonomia: [] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.familia, 'quesos');
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); console.log('  ✓ ' + n); ok++; }
    catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); }
  }
  console.log(`[prisma__formulador] ${ok === tests.length ? 'OK' : 'FAIL'} ${ok}/${tests.length}`);
  process.exit(ok === tests.length ? 0 : 1);
})();
