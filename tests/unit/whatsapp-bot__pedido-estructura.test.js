/**
 * Tests del payload autoritativo #P1 (pedido codificado por ids) del parser de WhatsApp.
 * Es lo que el bot decodifica para RE-TASAR (seguridad) en vez de creerse el texto editable.
 *
 * NOTA: tests/unit/whatsapp-bot.test.js está OBSOLETO (espera 'palabra_clave', el parser ya
 * usa 'Nombre:'/'cliente_nombre'); falla desde antes de esta tanda. Este archivo es nuevo y
 * acotado al contrato #P1.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parsearPedido, _decodificarEstructura } = require('../../modules/whatsapp-bot/services/pedido-parser');

function p1Line(payload) {
  const b64url = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return '#P1 ' + b64url;
}

const ITEMS = [
  { producto_id: 'bachata', cantidad: 1, tipo: 'normal', anadir: ['i_bacon'] },
  {
    cantidad: 1, tipo: 'mitad_mitad',
    pizza_izquierda: { id: 'bachata', quitar: ['Anchoas'], anadir: [] },
    pizza_derecha: { id: 'tropical', quitar: [], anadir: ['i_ajo'] }
  }
];

function mensajeConP1(items) {
  return [
    'PEDIDO vapers-A3F2',
    '- 1 x Bachata (+ Bacon)',
    '- 1 x ½ Bachata (sin Anchoas) + ½ Tropical (+ Ajo)',
    'Total: 23,30 EUR',
    'Nombre: Juan',
    p1Line({ v: 1, items })
  ].join('\n');
}

test('#P1 — parsearPedido decodifica la estructura autoritativa por ids', () => {
  const r = parsearPedido(mensajeConP1(ITEMS));
  assert.equal(r.ok, true);
  assert.equal(r.cliente_nombre, 'Juan');
  assert.ok(r.estructura, 'debe traer estructura');
  assert.equal(r.estructura.items.length, 2);
  assert.equal(r.estructura.items[0].producto_id, 'bachata');
  assert.equal(r.estructura.items[1].tipo, 'mitad_mitad');
  assert.equal(r.estructura.items[1].pizza_derecha.anadir[0], 'i_ajo');
});

test('#P1 ausente (pedido legacy solo-texto) → estructura null', () => {
  const txt = ['PEDIDO vapers-A3F2', '- 1 x cosa', 'Total: 5,00 EUR', 'Nombre: Ana'].join('\n');
  const r = parsearPedido(txt);
  assert.equal(r.ok, true);
  assert.equal(r.estructura, null);
});

test('#P1 corrupto → estructura null (el bot caerá al texto o pedirá reenviar)', () => {
  assert.equal(_decodificarEstructura('#P1 esto-no-es-base64-valido!!!'), null);
  // base64 válido pero JSON sin la forma esperada
  const malo = Buffer.from('{"v":2,"items":[]}', 'utf8').toString('base64');
  assert.equal(_decodificarEstructura('#P1 ' + malo), null);
});

test('#P1 — la línea puede ir en cualquier posición del mensaje', () => {
  const txt = [p1Line({ v: 1, items: [{ producto_id: 'margarita', cantidad: 2, tipo: 'normal' }] }),
    'PEDIDO vapers-A3F2', '- 2 x Margarita', 'Total: 16,00 EUR', 'Nombre: Eva'].join('\n');
  const est = _decodificarEstructura(txt);
  assert.equal(est.items[0].producto_id, 'margarita');
  assert.equal(est.items[0].cantidad, 2);
});
