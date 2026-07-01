/**
 * Tests de prisma/coste — calculadora coste → margen → pvp (cara comerciante).
 * En céntimos. Los componentes los pone el comerciante; coste no inventa.
 * _costear es puro (no toca el bus).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaCosteReflejo = require('../../modules/prisma/coste/index.js');

const C = new PrismaCosteReflejo();

test('coste_total = Σ componentes (coste × cantidad) + extra', () => {
  const r = C._costear({ componentes: [{ coste_centimos: 200, cantidad: 2 }, { coste_centimos: 150 }], coste_extra_centimos: 50 });
  assert.equal(r.data.coste_total_centimos, 400 + 150 + 50);   // 600
  assert.equal(r.data.coste_total_eur, 6);
});

test('food cost objetivo → pvp sugerido (6€ coste al 30% → 20€)', () => {
  const r = C._costear({ componentes: [{ coste_centimos: 600 }], food_cost_objetivo: 0.30 });
  assert.equal(r.data.pvp_sugerido_centimos, 2000);
  assert.equal(r.data.pvp_sugerido_eur, 20);
});

test('pvp dado → food cost real + margen', () => {
  const r = C._costear({ componentes: [{ coste_centimos: 600 }], pvp_centimos: 2000 });
  assert.equal(r.data.food_cost_real, 0.30);
  assert.equal(r.data.margen, 0.70);
  assert.equal(r.data.margen_centimos, 1400);
});

test('coste 0 (comerciante aún no lo dio) → pvp sugerido 0, no inventa precio', () => {
  const r = C._costear({ componentes: [], food_cost_objetivo: 0.30 });
  assert.equal(r.data.coste_total_centimos, 0);
  assert.equal(r.data.pvp_sugerido_centimos, 0);
});

test('sin objetivo ni pvp → solo el coste total', () => {
  const r = C._costear({ componentes: [{ coste_centimos: 1234 }] });
  assert.equal(r.data.coste_total_centimos, 1234);
  assert.equal(r.data.pvp_sugerido_centimos, undefined);
  assert.equal(r.data.margen, undefined);
});

// ── aplicar: escribe el pvp en el producto + cierra la pregunta de coste ──

test('_planAplicar: marca la pregunta de coste respondida y sube madurez a listo', () => {
  const prod = { id: 'p1', madurez: 'necesita_aclaracion_comerciante', preguntas_abiertas: [{ campo: 'coste', respondida: false }] };
  const { campos, resumen } = C._planAplicar(prod, 600, 2000);
  assert.equal(campos.precio_base_centimos, 2000);
  assert.equal(campos.preguntas_abiertas[0].respondida, true);
  assert.equal(campos.madurez, 'listo');          // no faltaba ninguna otra
  assert.equal(resumen.margen, 0.70);
  assert.equal(resumen.todas_respondidas, true);
});

test('_planAplicar: si queda otra pregunta abierta, la madurez NO sube a listo', () => {
  const prod = { id: 'p1', madurez: 'necesita_aclaracion_comerciante', preguntas_abiertas: [{ campo: 'coste', respondida: false }, { campo: 'stock', respondida: false }] };
  const { campos, resumen } = C._planAplicar(prod, 600, 2000);
  assert.equal(campos.preguntas_abiertas[0].respondida, true);
  assert.equal(campos.preguntas_abiertas[1].respondida, false);   // stock sigue abierta
  assert.equal(campos.madurez, undefined);        // no toca la madurez
  assert.equal(resumen.todas_respondidas, false);
});

test('_aplicar (e2e con bus falso): LEE el producto, escribe precio y cierra la pregunta', async () => {
  const productos = [{ id: 'p1', madurez: 'necesita_aclaracion_comerciante', preguntas_abiertas: [{ campo: 'coste', respondida: false }] }];
  const bus = fakeCatalogoBus(productos);
  const K = new PrismaCosteReflejo();
  K.eventBus = bus;
  const r = await K._aplicar({ project_id: 'pr', catalogo_id: 'cat', producto_id: 'p1', componentes: [{ coste_centimos: 600 }], food_cost_objetivo: 0.30 });
  assert.equal(r.status, 200);
  assert.equal(r.data.pvp_centimos, 2000);          // 6€ al 30% → 20€
  assert.equal(productos[0].precio_base_centimos, 2000);      // escrito en el producto
  assert.equal(productos[0].preguntas_abiertas[0].respondida, true);
  assert.equal(productos[0].madurez, 'listo');
  assert.ok(bus.published.some(x => x.ev === 'coste.aplicado'));
});

test('_aplicar sin pvp ni food_cost → no inventa precio (400)', async () => {
  const K = new PrismaCosteReflejo();
  K.eventBus = fakeCatalogoBus([{ id: 'p1', preguntas_abiertas: [] }]);
  const r = await K._aplicar({ project_id: 'pr', catalogo_id: 'cat', producto_id: 'p1', componentes: [{ coste_centimos: 600 }] });
  assert.equal(r.status, 400);
});

// bus falso que responde a catalogo.get.request y catalogo.update_product.request.
// El EventBus real entrega al handler un envelope { data: <payload> }; lo replicamos.
function fakeCatalogoBus(productos) {
  const handlers = {};
  const bus = {
    published: [],
    subscribe(ev, h) { (handlers[ev] = handlers[ev] || []).push(h); return () => { handlers[ev] = (handlers[ev] || []).filter(x => x !== h); }; },
    publish(ev, data) {
      bus.published.push({ ev, data });
      const emit = (rev, payload) => setImmediate(() => (handlers[rev] || []).forEach(h => h({ data: payload })));
      if (ev === 'catalogo.get.request') {
        emit('catalogo.get.response', { request_id: data.request_id, status: 200, data: { productos } });
      } else if (ev === 'catalogo.update_product.request') {
        const p = productos.find(x => x.id === data.producto_id);
        if (p) Object.assign(p, data.campos);
        emit('catalogo.update_product.response', { request_id: data.request_id, status: 200, data: { producto: p } });
      }
    }
  };
  return bus;
}

console.log('prisma__coste: asserts definidos');
