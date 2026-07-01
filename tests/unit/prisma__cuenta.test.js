/**
 * Tests de prisma/cuenta — el ticket/cuenta. Ciclo abierta→cobrada→cerrada. En memoria.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaCuentaReflejo = require('../../modules/prisma/cuenta/index.js');

test('crear abre una cuenta con ref_display y estado abierta', () => {
  const C = new PrismaCuentaReflejo();
  const r = C._crear({ cuenta_id: 'c1', project_id: 'p' });
  assert.equal(r.status, 201);
  assert.equal(r.data.estado, 'abierta');
  assert.ok(r.data.ref_display);
});

test('crear es idempotente por cuenta_id', () => {
  const C = new PrismaCuentaReflejo();
  C._crear({ cuenta_id: 'c1' });
  const r = C._crear({ cuenta_id: 'c1' });
  assert.equal(r.status, 200);   // devuelve la existente, no duplica
});

test('cerrar → estado cerrada', () => {
  const C = new PrismaCuentaReflejo();
  C._crear({ cuenta_id: 'c1' });
  const r = C._cerrar({ cuenta_id: 'c1' });
  assert.equal(r.data.estado, 'cerrada');
});

test('cobro.procesado marca la cuenta pagada + total + estado cobrada', () => {
  const C = new PrismaCuentaReflejo();
  C._crear({ cuenta_id: 'c1' });
  C.onCobroProcesado({ data: { cuenta_id: 'c1', monto_total_centimos: 1800 } });
  const g = C._get({ cuenta_id: 'c1' });
  assert.equal(g.data.pagada, true);
  assert.equal(g.data.total_centimos, 1800);
  assert.equal(g.data.estado, 'cobrada');
});

test('cobro de una cuenta desconocida → no-op (no revienta)', () => {
  const C = new PrismaCuentaReflejo();
  assert.doesNotThrow(() => C.onCobroProcesado({ data: { cuenta_id: 'ajena', monto_total_centimos: 500 } }));
});

test('persistencia: snapshot por proyecto (+seq) y hidratar restaura la cuenta', () => {
  const A = new PrismaCuentaReflejo();
  A._crear({ cuenta_id: 'c1', project_id: 'p1' });
  A._crear({ cuenta_id: 'c2', project_id: 'p2' });
  const snap = A._persist._snapshot('p1');
  assert.equal(snap.cuentas.length, 1);
  assert.equal(snap.cuentas[0].id, 'c1');
  const B = new PrismaCuentaReflejo();
  B._persist._hidratar('p1', snap);
  assert.equal(B._get({ cuenta_id: 'c1' }).data.estado, 'abierta');
  assert.equal(B._get({ cuenta_id: 'c2' }).status, 404);   // p2 no viaja
  A._persist.detener(); B._persist.detener();
});

console.log('prisma__cuenta: asserts definidos');
