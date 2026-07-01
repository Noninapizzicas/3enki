/**
 * Tests de prisma/ticket — el recibo. _formatearTicket es puro (no toca el bus).
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const PrismaTicketReflejo = require('../../modules/prisma/ticket/index.js');

const T = new PrismaTicketReflejo();
const ITEMS = [
  { nombre: 'Bachata', cantidad: 1, subtotal_centimos: 1400 },
  { nombre: 'Agua', cantidad: 2, subtotal_centimos: 400 }
];

test('_formatearTicket — pinta ítems, subtotales en € y el TOTAL', () => {
  const txt = T._formatearTicket(ITEMS, 1800, { comercio: 'Mi Tienda', ref_display: 'T-001' });
  assert.ok(txt.includes('Bachata'));
  assert.ok(txt.includes('Agua'));
  assert.ok(txt.includes('14.00'));
  assert.ok(txt.includes('TOTAL'));
  assert.ok(txt.includes('18.00'));
  assert.ok(txt.includes('Mi Tienda'));
});

test('formatear — deriva el total si no se da, emite texto', () => {
  const r = T._formatear({ items: ITEMS });
  assert.equal(r.status, 200);
  assert.equal(r.data.total_centimos, 1800);
  assert.ok(r.data.texto.includes('TOTAL'));
});

test('formatear sin ítems → inválido', () => {
  const r = T._formatear({ items: [] });
  assert.equal(r.status, 400);
});

console.log('prisma__ticket: asserts definidos');
