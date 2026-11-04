'use strict';
/**
 * pedido-telegram — el canal Telegram de pedidos.
 *
 * Lo que se prueba (la cadena entera, sin core):
 *   borrador HTTP (items por ids) → /start p_<codigo> → RE-TASADO contra la carta
 *   → pedido.crear-tienda (canal_origen telegram) → response → confirmación al cliente.
 *
 * Los dos invariantes que importan:
 *   · el precio que se cobra es el de la CARTA, no el que mandó el navegador;
 *   · un código sirve UNA vez (dos /start del mismo enlace no crean dos pedidos).
 */
const assert = require('assert');
const Module = require('../../modules/pizzepos/pedido-telegram/index.js');

const CARTA = {
  productos: [
    { id: 'p1', nombre: 'Elf Bar 600 Sandía', precio: 5.95, categoria: 'c600' },
    { id: 'p2', nombre: 'Vozol Neon 1000', precio: 8.0, categoria: 'c1000' }
  ],
  ingredientes: []
};

function montarBus() {
  const subs = new Map();
  const publicados = [];
  const bus = {
    publish(ev, payload) {
      publicados.push({ ev, payload });
      for (const h of (subs.get(ev) || [])) h({ data: payload });
    },
    subscribe(ev, h) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(h);
      return () => {};
    }
  };
  return { bus, publicados };
}

function montarCore(bus) {
  return {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    metrics: { increment() {}, timing() {} },
    eventBus: bus,
    moduleRegistry: {
      get(clave) {
        if (clave === 'project-manager') {
          return { instance: { projects: new Map([['pid-1', { id: 'pid-1', name: 'Rapitvapers', base_path: '/tmp/nope' }]]) } };
        }
        if (clave === 'productos') {
          return { instance: { handleCartaCompleta: async () => ({ status: 200, data: { productos: CARTA.productos, ingredientes: [] } }) } };
        }
        return undefined;
      }
    }
  };
}

(async () => {
  const { bus, publicados } = montarBus();
  const mod = new Module();
  await mod.onLoad(montarCore(bus));
  mod._vinculoDelProyecto = async (pid) => (pid === 'pid-1' ? { botName: 'Rapitvapers_bot', project_id: 'pid-1' } : null);

  // 1 · la carta pide el borrador (por ids, sin precio)
  const r = await mod.handleBorradorPost({
    params: { project: 'rapitvapers' },
    body: {
      items: [{ producto_id: 'p1', cantidad: 2, tipo: 'normal' }],
      nombre_cliente: 'Paco',
      modo_consumo: 'recoger',
      metodo_pago: 'efectivo',
      mayor_edad_confirmado: true
    }
  });
  assert.strictEqual(r.status, 201, 'el borrador debe crearse');
  assert.ok(r.data.url.startsWith('https://t.me/Rapitvapers_bot?start=p_'), 'url del bot con el código');
  const codigo = r.data.codigo;

  // 2 · el cliente abre el enlace: Telegram manda /start p_<codigo>
  await mod.onTelegramCommand({ data: { botName: 'Rapitvapers_bot', chatId: 1934798567, text: '/start p_' + codigo } });

  const pedido = publicados.find(x => x.ev === 'pedido.crear-tienda');
  assert.ok(pedido, 'debe emitirse pedido.crear-tienda');
  const p = pedido.payload;
  assert.strictEqual(p.total_centimos, 1190, 'precio de la CARTA (5,95 × 2), no del navegador');
  assert.strictEqual(p.canal_origen, 'telegram');
  assert.strictEqual(p.cliente_telegram, '1934798567', 'el chat es la identidad del cliente');
  assert.strictEqual(p.items[0].precio_unitario_centimos, 595);

  // 3 · el mismo código NO se puede reutilizar (un enlace = un pedido)
  const antes = publicados.filter(x => x.ev === 'pedido.crear-tienda').length;
  await mod.onTelegramCommand({ data: { botName: 'Rapitvapers_bot', chatId: 1934798567, text: '/start p_' + codigo } });
  assert.strictEqual(publicados.filter(x => x.ev === 'pedido.crear-tienda').length, antes, 'código reutilizable');

  // 4 · pedidos responde → confirmación en el chat del cliente
  await mod.onPedidoCreado({ data: { request_id: p.request_id, result: { pedido_id: 'L369', cliente_nombre: 'Paco' } } });
  const msg = publicados.filter(x => x.ev === 'telegram.send_message.request').pop();
  assert.ok(msg && msg.payload.text.includes('Pedido confirmado'), 'sin confirmación');
  assert.strictEqual(msg.payload.chatId, 1934798567);

  // 5 · un código inventado no crea nada y el cliente recibe el aviso
  await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 1, text: 'p_ZZZZZZ' } });
  assert.ok(publicados.filter(x => x.ev === 'telegram.send_message.request').pop().payload.text.includes('No encuentro'));

  // 6 · una palabra corta NO es un código (no se come la conversación del chat)
  const antes6 = publicados.length;
  await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 1, text: 'HOLA' } });
  assert.strictEqual(publicados.length, antes6, '«HOLA» no debe tratarse como código');

  // ── VÍA 2 · el cliente COMPARTE el pedido desde la bandeja del móvil ─────────────
  // El mensaje es el canónico de la carta (el mismo de WhatsApp): líneas humanas + #P1
  // con los IDS. Aquí los precios del texto están INFLADOS a propósito: si el módulo
  // los usara, el total saldría 99,00 € en vez de los 11,90 € de la carta.
  const p1 = Buffer.from(JSON.stringify({
    v: 1,
    items: [{ producto_id: 'p1', cantidad: 2, tipo: 'normal' }],
    modo_consumo: 'recoger',
    metodo_pago: 'efectivo'
  })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const msgCompartido = [
    'PEDIDO rapitvapers-QDZ9',
    '- 2 x Elf Bar 600 Sandía (99,00 EUR)',
    'Total: 99,00 EUR',
    'Nombre: Prueba',
    '#P1 ' + p1
  ].join('\n');

  const antesCompartido = publicados.filter(x => x.ev === 'pedido.crear-tienda').length;
  await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 424242, text: msgCompartido } });

  const compartido = publicados.filter(x => x.ev === 'pedido.crear-tienda').pop();
  assert.ok(compartido, 'el pedido compartido debe emitir pedido.crear-tienda');
  assert.strictEqual(publicados.filter(x => x.ev === 'pedido.crear-tienda').length, antesCompartido + 1);
  assert.strictEqual(compartido.payload.total_centimos, 1190, 'manda la CARTA, no el 99,00 del texto');
  assert.strictEqual(compartido.payload.items[0].precio_unitario_centimos, 595);
  assert.strictEqual(compartido.payload.items[0].producto_id, 'p1', 'viaja el id de la carta');
  assert.strictEqual(compartido.payload.canal_origen, 'telegram');
  assert.strictEqual(compartido.payload.cliente_telegram, '424242', 'el chat sigue siendo el ancla');
  assert.strictEqual(compartido.payload.modo_consumo, 'recoger', 'el modo lo dice la #P1');
  assert.strictEqual(compartido.payload.codigo, undefined, 'sin código: no hay borrador');

  // 7 · reenviar el MISMO mensaje (doble pulsación en la bandeja) no duplica el pedido
  const antesDuplicado = publicados.filter(x => x.ev === 'pedido.crear-tienda').length;
  await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 424242, text: msgCompartido } });
  assert.strictEqual(publicados.filter(x => x.ev === 'pedido.crear-tienda').length, antesDuplicado,
    'el mismo nonce no crea dos pedidos');
  assert.ok(publicados.filter(x => x.ev === 'telegram.send_message.request').pop()
    .payload.text.includes('Ya tengo tu pedido'), 'aviso de duplicado');

  // 8 · el bot que recibe manda: un pedido de este negocio en OTRO bot se rechaza
  const antesAjeno = publicados.filter(x => x.ev === 'pedido.crear-tienda').length;
  await mod.onTelegramText({
    data: { botName: 'OtroNegocio_bot', chatId: 777, text: msgCompartido.replace('QDZ9', 'ZXCV') }
  });
  assert.strictEqual(publicados.filter(x => x.ev === 'pedido.crear-tienda').length, antesAjeno,
    'otro bot no puede crear el pedido de este negocio');
  assert.ok(publicados.filter(x => x.ev === 'telegram.send_message.request').pop()
    .payload.text.includes('no es de este negocio'));

  // 9 · un pedido SIN #P1 no se acepta: no hay ids, no hay re-tasado (nunca precio del texto)
  const antesSinIds = publicados.filter(x => x.ev === 'pedido.crear-tienda').length;
  await mod.onTelegramText({
    data: { botName: 'Rapitvapers_bot', chatId: 999, text: 'PEDIDO rapitvapers-AAAA\n- 1 x Elf Bar (1,00 EUR)\nTotal: 1,00 EUR\nNombre: Prueba' }
  });
  assert.strictEqual(publicados.filter(x => x.ev === 'pedido.crear-tienda').length, antesSinIds,
    'sin #P1 no se crea pedido (evita cobrar el precio que teclea el cliente)');

  await mod.onUnload();
  console.log('pedido-telegram: 16/16 OK (borrador → /start + mensaje compartido → re-tasado → pedido → confirmación)');
})().catch(err => {
  console.error('pedido-telegram FALLO:', err.message);
  process.exit(1);
});
