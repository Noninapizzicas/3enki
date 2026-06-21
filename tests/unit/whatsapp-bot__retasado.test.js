/**
 * Test del re-tasado server-side en el bot (autoservicio Fase 1, rebanada B.2).
 * Bloquea la SEGURIDAD: el total/precio que manda el cliente se IGNORA; manda el snapshot
 * de la carta. Y que la estructura (mitades/variaciones) viaja hacia cocina.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const WhatsappBotModule = require('../../modules/whatsapp-bot/index.js');

const SNAP = {
  productos: [
    { id: 'bachata', nombre: 'Bachata', precio: 9.5 },
    { id: 'tropical', nombre: 'Tropical', precio: 11 }
  ],
  ingredientes_catalogo: [{ id: 'i_ajo', nombre: 'Ajo', precio_extra: 0.8 }]
};

function makeBot() {
  const bot = new WhatsappBotModule();
  bot.logger = { info() {}, warn() {}, error() {}, debug() {} };
  bot.metrics = { increment() {} };
  const published = [];
  bot.eventBus = { publish: async (event, data) => { published.push({ event, data }); } };
  const sent = [];
  bot._enviarMensajeSeguro = async (slug, to, text) => { sent.push({ slug, to, text }); };
  bot.config = {};
  // siembra el puente + snapshot (lo que normalmente hidratan project.activated / catalogo.actualizado)
  bot.cartaSnap.set('pid-1', SNAP);
  bot.pidPorSlug.set('nonina', 'pid-1');
  return { bot, published, sent };
}

function cleanup(bot) {
  for (const p of bot.pendingPedidos.values()) if (p.timeoutHandle) clearTimeout(p.timeoutHandle);
  bot.pendingPedidos.clear();
}

test('B.2 — RE-TASA: el total del cliente (1c) se ignora, manda el servidor (950c)', async () => {
  const { bot, published } = makeBot();
  const parsed = {
    ok: true, cliente_nombre: 'Juan', total_centimos: 1,   // ← cliente intenta colar 1 céntimo
    estructura: { items: [{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }] }
  };
  await bot._registrarPedidoSeguro('nonina', { from: '34600000000', message_id: 'm1' }, parsed);
  const ev = published.find(p => p.event === 'pedido.crear-tienda');
  assert.ok(ev, 'debe publicar pedido.crear-tienda');
  assert.equal(ev.data.total_centimos, 950, 'el total es el del SERVIDOR, no el del cliente');
  assert.equal(ev.data.items[0].precio_unitario_centimos, 950);
  assert.equal(ev.data.canal_origen, 'whatsapp');
  assert.equal(ev.data.cliente_telefono, '34600000000');
  cleanup(bot);
});

test('B.2 — la estructura de la mitad (max+extras) viaja a cocina', async () => {
  const { bot, published } = makeBot();
  const parsed = {
    ok: true, cliente_nombre: 'Eva', total_centimos: 5,
    estructura: { items: [{
      cantidad: 1, tipo: 'mitad_mitad',
      pizza_izquierda: { id: 'bachata', quitar: ['Anchoas'], anadir: [] },
      pizza_derecha: { id: 'tropical', quitar: [], anadir: ['i_ajo'] }
    }] }
  };
  await bot._registrarPedidoSeguro('nonina', { from: '34600000000', message_id: 'm2' }, parsed);
  const ev = published.find(p => p.event === 'pedido.crear-tienda');
  const item = ev.data.items[0];
  assert.equal(ev.data.total_centimos, 1180, 'max(950,1100)+ajo(80)=1180');
  assert.equal(item.tipo, 'mitad_mitad');
  assert.equal(item.pizza_izquierda.id, 'bachata');
  assert.equal(item.pizza_derecha.anadir[0], 'Ajo');
  cleanup(bot);
});

test('B.2 — producto desconocido → NO publica pedido, pide reenviar (no_silent_failures)', async () => {
  const { bot, published, sent } = makeBot();
  const parsed = {
    ok: true, cliente_nombre: 'Ana', total_centimos: 100,
    estructura: { items: [{ producto_id: 'no_existe', cantidad: 1, tipo: 'normal' }] }
  };
  await bot._registrarPedidoSeguro('nonina', { from: '34600000000', message_id: 'm3' }, parsed);
  assert.equal(published.find(p => p.event === 'pedido.crear-tienda'), undefined, 'no debe crear el pedido');
  assert.equal(sent.length, 1, 'avisa al cliente');
  cleanup(bot);
});

test('B.2 — cold-start sin snapshot ni pid → pide reintentar, no crea pedido', async () => {
  const { bot, published, sent } = makeBot();
  bot.cartaSnap.clear(); bot.pidPorSlug.clear();   // sin puente ni snapshot
  const parsed = {
    ok: true, cliente_nombre: 'Leo', total_centimos: 100,
    estructura: { items: [{ producto_id: 'bachata', cantidad: 1, tipo: 'normal' }] }
  };
  await bot._registrarPedidoSeguro('desconocido', { from: '34600000000', message_id: 'm4' }, parsed);
  assert.equal(published.find(p => p.event === 'pedido.crear-tienda'), undefined);
  assert.equal(sent.length, 1, 'pide reintentar');
  cleanup(bot);
});
