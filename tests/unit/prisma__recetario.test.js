/**
 * Tests de prisma/recetario — el DUEÑO del órgano recetario: el puente
 * escandallo.coste.calculado → coste.aplicar que recorre producto↔receta.
 * _decidir es puro; onCosteCalculado se prueba con _rpc/eventBus mockeados.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaRecetarioReflejo = require('../../modules/prisma/recetario/index.js');

// ── núcleo PURO ──
test('_decidir — producto sin precio → aplicar (pvp sugerido por food-cost)', () => {
  const R = new PrismaRecetarioReflejo();
  const { accion, pvp_sugerido } = R._decidir({ id: 'p1' }, 600, 0.30);
  assert.equal(accion, 'aplicar');
  assert.equal(pvp_sugerido, 2000);                       // 6€ / 0.30 = 20€
});

test('_decidir — precio manual firme (coste respondido) → testigo, NO pisa', () => {
  const R = new PrismaRecetarioReflejo();
  const prod = { id: 'p1', precio_base_centimos: 1800, preguntas_abiertas: [{ campo: 'coste', respondida: true }] };
  assert.equal(R._decidir(prod, 600, 0.30).accion, 'testigo');
});

test('_decidir — con precio pero pregunta de coste ABIERTA → aplicar (aún no es firme)', () => {
  const R = new PrismaRecetarioReflejo();
  const prod = { id: 'p1', precio_base_centimos: 1800, preguntas_abiertas: [{ campo: 'coste', respondida: false }] };
  assert.equal(R._decidir(prod, 600, 0.30).accion, 'aplicar');
});

// ── el puente (IO mockeado) ──
function montar(catalogos) {
  const R = new PrismaRecetarioReflejo();
  const llamadas = [];
  const publicados = [];
  R.eventBus = { publish: (ev, data) => publicados.push({ ev, data }) };
  R.metrics = { increment() {} };
  R._rpc = async (topic, payload) => {
    llamadas.push({ topic, payload });
    if (topic === 'catalogo.list.request') return { status: 200, data: catalogos.map(c => ({ id: c.meta.id, estado: c.meta.estado })) };
    if (topic === 'catalogo.get.request') { const c = catalogos.find(x => x.meta.id === payload.catalogo_id); return c ? { status: 200, data: c } : { status: 404 }; }
    if (topic === 'coste.aplicar.request') return { status: 200, data: { producto_id: payload.producto_id } };
    return { status: 200 };
  };
  return { R, llamadas, publicados };
}

test('puente — resuelve el producto por receta_ref y llama coste.aplicar', async () => {
  const cat = { meta: { id: 'cat_g', estado: 'en_servicio' }, productos: [{ id: 'pizzas_bachata', receta_ref: 'bachata' }] };
  const { R, llamadas } = montar([cat]);
  await R.onCosteCalculado({ data: { project_id: 'p1', receta_id: 'bachata', coste_unidad: 2.29 } });
  const aplicar = llamadas.find(l => l.topic === 'coste.aplicar.request');
  assert.ok(aplicar, 'llamó coste.aplicar');
  assert.equal(aplicar.payload.producto_id, 'pizzas_bachata');
  assert.equal(aplicar.payload.catalogo_id, 'cat_g');
  assert.equal(aplicar.payload.componentes[0].coste_centimos, 229);   // 2.29€ → 229 céntimos
  assert.equal(aplicar.payload.food_cost_objetivo, 0.30);
});

test('puente — GATE: ninguna referencia a la receta → no hace nada (sub-recetas no son productos)', async () => {
  const cat = { meta: { id: 'cat_g', estado: 'en_servicio' }, productos: [{ id: 'otro', receta_ref: 'otra' }] };
  const { R, llamadas, publicados } = montar([cat]);
  await R.onCosteCalculado({ data: { project_id: 'p1', receta_id: 'masa', coste_unidad: 0.20 } });
  assert.ok(!llamadas.some(l => l.topic === 'coste.aplicar.request'));
  assert.equal(publicados.length, 0);
});

test('puente — precio manual firme → testigo recetario.coste_actualizado, NO llama coste.aplicar', async () => {
  const cat = { meta: { id: 'cat_g', estado: 'en_servicio' }, productos: [
    { id: 'pizzas_bachata', receta_ref: 'bachata', precio_base_centimos: 1800, preguntas_abiertas: [{ campo: 'coste', respondida: true }] }
  ] };
  const { R, llamadas, publicados } = montar([cat]);
  await R.onCosteCalculado({ data: { project_id: 'p1', receta_id: 'bachata', coste_unidad: 2.29 } });
  assert.ok(!llamadas.some(l => l.topic === 'coste.aplicar.request'), 'no pisa el precio manual');
  const t = publicados.find(p => p.ev === 'recetario.coste_actualizado');
  assert.ok(t, 'cantó la deriva');
  assert.equal(t.data.precio_actual_centimos, 1800);
  assert.equal(t.data.pvp_sugerido, 763);                 // 229 / 0.30 ≈ 763
});

test('puente — sin coste real (0) → no actúa', async () => {
  const cat = { meta: { id: 'cat_g', estado: 'en_servicio' }, productos: [{ id: 'x', receta_ref: 'r' }] };
  const { R, llamadas } = montar([cat]);
  await R.onCosteCalculado({ data: { project_id: 'p1', receta_id: 'r', coste_unidad: 0 } });
  assert.equal(llamadas.length, 0);
});
