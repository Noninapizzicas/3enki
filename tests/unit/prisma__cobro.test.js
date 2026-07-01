/**
 * Tests de prisma/cobro — el pago universal. Céntimos. Con monto_centimos inline no
 * toca el bus (el flujo se prueba puro; tomar el total del carrito por RPC es en vivo).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaCobroReflejo = require('../../modules/prisma/cobro/index.js');

test('efectivo — calcula el cambio', async () => {
  const K = new PrismaCobroReflejo();
  const r = await K._crear({ cuenta_id: 'c1', metodo_pago: 'efectivo', monto_centimos: 1800, monto_recibido_centimos: 2000 });
  assert.equal(r.status, 201);
  assert.equal(r.data.cambio_centimos, 200);
  assert.equal(r.data.estado, 'pendiente');
});

test('efectivo insuficiente → error', async () => {
  const K = new PrismaCobroReflejo();
  const r = await K._crear({ cuenta_id: 'c1', metodo_pago: 'efectivo', monto_centimos: 1800, monto_recibido_centimos: 1500 });
  assert.equal(r.status, 400);
  assert.equal(r.error.details.faltan_centimos, 300);
});

test('ciclo pendiente → completado → reembolsado', async () => {
  const K = new PrismaCobroReflejo();
  const c = await K._crear({ cuenta_id: 'c1', metodo_pago: 'tarjeta', monto_centimos: 1000 });
  const conf = await K._confirmar({ id: c.data.id });
  assert.equal(conf.data.estado, 'completado');
  assert.ok(conf.data.referencia_pago);
  const reem = await K._reembolsar({ id: c.data.id, motivo: 'cliente' });
  assert.equal(reem.data.estado, 'reembolsado');
});

test('no se puede reembolsar un cobro no completado', async () => {
  const K = new PrismaCobroReflejo();
  const c = await K._crear({ cuenta_id: 'c1', metodo_pago: 'tarjeta', monto_centimos: 1000 });
  const r = await K._reembolsar({ id: c.data.id });
  assert.equal(r.status, 409);
});

test('mixto — el desglose debe cuadrar el total', async () => {
  const K = new PrismaCobroReflejo();
  const ok = await K._crear({ cuenta_id: 'c1', metodo_pago: 'mixto', monto_centimos: 2000, desglose: [{ metodo: 'efectivo', monto_centimos: 1200 }, { metodo: 'tarjeta', monto_centimos: 800 }] });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.desglose.length, 2);
  const K2 = new PrismaCobroReflejo();
  const bad = await K2._crear({ cuenta_id: 'c1', metodo_pago: 'mixto', monto_centimos: 2000, desglose: [{ metodo: 'efectivo', monto_centimos: 1000 }] });
  assert.equal(bad.status, 400);
});

test('idempotencia — un cobro activo por cuenta', async () => {
  const K = new PrismaCobroReflejo();
  await K._crear({ cuenta_id: 'c1', metodo_pago: 'tarjeta', monto_centimos: 500 });
  const dup = await K._crear({ cuenta_id: 'c1', metodo_pago: 'tarjeta', monto_centimos: 500 });
  assert.equal(dup.status, 409);
});

test('método no soportado → error', async () => {
  const K = new PrismaCobroReflejo();
  const r = await K._crear({ cuenta_id: 'c1', metodo_pago: 'cripto', monto_centimos: 500 });
  assert.equal(r.status, 400);
});

test('persistencia: snapshot por proyecto y hidratar restaura el cobro', async () => {
  const A = new PrismaCobroReflejo();
  const c1 = await A._crear({ cuenta_id: 'c1', metodo_pago: 'tarjeta', monto_centimos: 1000, project_id: 'p1' });
  await A._crear({ cuenta_id: 'c2', metodo_pago: 'efectivo', monto_centimos: 500, project_id: 'p2' });
  const snap = A._persist._snapshot('p1');
  assert.equal(snap.cobros.length, 1);
  assert.equal(snap.cobros[0].project_id, 'p1');
  const B = new PrismaCobroReflejo();
  B._persist._hidratar('p1', snap);
  assert.equal(B._get({ id: c1.data.id }).data.monto_total_centimos, 1000);
  A._persist.detener(); B._persist.detener();
});

console.log('prisma__cobro: asserts definidos');
