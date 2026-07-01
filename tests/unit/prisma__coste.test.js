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

console.log('prisma__coste: asserts definidos');
