/**
 * Tests de prisma/cierre — el cuadre de caja. _cuadre es puro; acumula por
 * cobro.procesado; cerrar_caja resetea.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaCierreReflejo = require('../../modules/prisma/cierre/index.js');

test('_cuadre — total + desglose por método', () => {
  const C = new PrismaCierreReflejo();
  const cuadre = C._cuadre([
    { monto_total_centimos: 1000, metodo: 'efectivo' },
    { monto_total_centimos: 2000, metodo: 'tarjeta' },
    { monto_total_centimos: 500, metodo: 'efectivo' }
  ]);
  assert.equal(cuadre.total_centimos, 3500);
  assert.deepEqual(cuadre.por_metodo, { efectivo: 1500, tarjeta: 2000 });
  assert.equal(cuadre.num_ventas, 3);
});

test('acumula por cobro.procesado y estado refleja el acumulado', () => {
  const C = new PrismaCierreReflejo();
  C.onCobroProcesado({ data: { cobro_id: 'k1', monto_total_centimos: 1000, metodo_pago: 'efectivo' } });
  C.onCobroProcesado({ data: { cobro_id: 'k2', monto_total_centimos: 700, metodo_pago: 'bizum' } });
  const e = C._estado();
  assert.equal(e.data.total_centimos, 1700);
  assert.equal(e.data.num_ventas, 2);
});

test('cerrar_caja devuelve el cuadre y resetea', () => {
  const C = new PrismaCierreReflejo();
  C.onCobroProcesado({ data: { cobro_id: 'k1', monto_total_centimos: 1000, metodo_pago: 'tarjeta' } });
  const r = C._cerrarCaja({ project_id: 'p' });
  assert.equal(r.data.total_centimos, 1000);
  assert.equal(r.data.ventas.length, 1);
  // tras cerrar, el día arranca a cero
  assert.equal(C._estado().data.total_centimos, 0);
});

test('persistencia: snapshot por proyecto y hidratar dedup por cobro_id', () => {
  const A = new PrismaCierreReflejo();
  A.onCobroProcesado({ data: { cobro_id: 'k1', monto_total_centimos: 1000, metodo_pago: 'efectivo', project_id: 'p1' } });
  A.onCobroProcesado({ data: { cobro_id: 'k2', monto_total_centimos: 500, metodo_pago: 'tarjeta', project_id: 'p2' } });
  const snap = A._persist._snapshot('p1');
  assert.equal(snap.ventas.length, 1);
  assert.equal(snap.ventas[0].cobro_id, 'k1');
  const B = new PrismaCierreReflejo();
  B._persist._hidratar('p1', snap);
  B._persist._hidratar('p1', snap);   // idempotente: no duplica
  assert.equal(B._estado().data.num_ventas, 1);
  assert.equal(B._estado().data.total_centimos, 1000);
  A._persist.detener(); B._persist.detener();
});

console.log('prisma__cierre: asserts definidos');
