'use strict';
/**
 * pedido-telegram — la vía SIN CÓDIGO: el cliente comparte el PEDIDO con el bot.
 *
 * Lo que se prueba (con el mensaje REAL que llegó por Telegram el 4-nov-2026):
 *   mensaje compartido (`PEDIDO slug-NONCE` + líneas + `Nombre:` + `#P1`)
 *   → re-tasado contra la CARTA del servidor → pedido.crear-tienda → confirmación.
 *
 * Los invariantes que importan:
 *   · el total que se cobra es el de la carta, no el que escribió el navegador;
 *   · sin `#P1` no hay pedido (sin ids no hay re-tasado → precio del cliente);
 *   · el negocio lo decide el BOT que recibe, no el slug escrito en el texto.
 */
const assert = require('assert');
const Module = require('../../modules/pizzepos/pedido-telegram/index.js');

// La carta viva del negocio. Precios DEL SERVIDOR (5,95) — distintos a propósito
// del texto de abajo en el segundo caso, para demostrar que manda la carta.
const CARTA = {
  productos: [
    { id: 'elfbar600-watermelon', nombre: 'Elf Bar 600 Watermelon', precio: 5.95, categoria: 'elfbar600' },
    { id: 'elfbar600-blueberry-sour-raspberry', nombre: 'Elf Bar 600 Blueberry Sour Raspberry', precio: 5.95, categoria: 'elfbar600' }
  ],
  ingredientes: []
};

// El mensaje TAL CUAL lo recibió el bot (pegado del móvil, 4-nov-2026).
const MENSAJE_REAL = `PEDIDO rapitvapers-PQDZ
- 1 x Elf Bar 600 Watermelon (5,95 EUR)
- 1 x Elf Bar 600 Blueberry Sour Raspberry (5,95 EUR)
Total: 11,90 EUR
Nombre: Prueba
#P1 eyJ2IjoxLCJpdGVtcyI6W3siY2FudGlkYWQiOjEsInByb2R1Y3RvX2lkIjoiZWxmYmFyNjAwLXdhdGVybWVsb24iLCJ0aXBvIjoibm9ybWFsIn0seyJjYW50aWRhZCI6MSwicHJvZHVjdG9faWQiOiJlbGZiYXI2MDAtYmx1ZWJlcnJ5LXNvdXItcmFzcGJlcnJ5IiwidGlwbyI6Im5vcm1hbCJ9XSwibW9kb19jb25zdW1vIjoicmVjb2dlciIsIm1ldG9kb19wYWdvIjoiZWZlY3Rpdm8ifQ`;

function montarBus() {
  const subs = new Map();
  const publicados = [];
  const bus = {
    publish(ev, payload) {
      publicados.push({ ev, payload });
      for (const h of (subs.get(ev) || [])) h({ data: payload });
      if (ev === 'pedido.crear-tienda') {
        const h = (subs.get('pedido.crear-tienda.response') || [])[0];
        if (h) setTimeout(() => h({ data: { request_id: payload.request_id, success: true, result: { pedido_id: 'P-77' } } }), 0);
      }
    },
    subscribe(ev, h) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(h);
      return () => {};
    }
  };
  return { bus, publicados };
}

function montarCore(bus, carta = CARTA) {
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
          return { instance: { handleCartaCompleta: async () => ({ status: 200, data: { productos: carta.productos, ingredientes: [] } }) } };
        }
        return undefined;
      }
    }
  };
}

async function montar(carta) {
  const { bus, publicados } = montarBus();
  const mod = new Module();
  await mod.onLoad(montarCore(bus, carta));
  // El registro del bridge lo tiende el runtime; aquí se simula el vínculo bot↔proyecto.
  // (El nombre de la costura cambió al extraer el corazón compartido: era `_proyectoPorBot`,
  //  que se llamaba con el botName; ahora es `_vinculoDelProyecto` y se llama con el project_id,
  //  porque el bot se resuelve por proyecto y no por el nombre que venga en el texto.)
  mod._vinculoDelProyecto = async (project_id) => (project_id === 'pid-1'
    ? { botName: 'Rapitvapers_bot', project_id: 'pid-1' } : null);
  const enviados = [];
  mod._responder = async (botName, chatId, texto) => { enviados.push({ botName, chatId, texto }); };
  return { mod, publicados, enviados };
}

(async () => {
  // 1 · el mensaje real compartido desde la carta crea el pedido, re-tasado por el servidor
  {
    const { mod, publicados, enviados } = await montar();
    await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 1934798567, text: MENSAJE_REAL } });

    const crear = publicados.find(p => p.ev === 'pedido.crear-tienda');
    assert.ok(crear, 'el pedido compartido debe emitir pedido.crear-tienda');
    assert.strictEqual(crear.payload.total_centimos, 1190, 'total de la CARTA (2 × 5,95)');
    assert.strictEqual(crear.payload.items.length, 2, 'las dos líneas por id');
    assert.strictEqual(crear.payload.items[0].producto_id, 'elfbar600-watermelon');
    assert.strictEqual(crear.payload.items[0].precio_unitario_centimos, 595, 'precio de la carta');
    assert.strictEqual(crear.payload.canal_origen, 'telegram');
    assert.strictEqual(crear.payload.cliente_telegram, '1934798567', 'el chat ata el pedido al cliente');
    assert.strictEqual(crear.payload.cliente_nombre, 'Prueba');
    assert.strictEqual(crear.payload.modo_consumo, 'recoger', 'modo leído del #P1, no del texto');
    assert.strictEqual(crear.payload.metodo_pago, 'efectivo');
    assert.strictEqual(mod.pendientes.size, 1, 'queda en vuelo esperando la respuesta de pedidos');

    await mod.onPedidoCreado({ data: { request_id: crear.payload.request_id, result: { pedido_id: 'P-77' } } });
    assert.ok(enviados.some(e => /Pedido confirmado/.test(e.texto)), 'el cliente recibe confirmación en su chat');
    assert.ok(enviados.some(e => /P-77/.test(e.texto)), 'con su número de pedido');
  }

  // 2 · el precio del navegador NO manda: si la carta subió, se cobra la carta
  {
    const cartaCara = { productos: CARTA.productos.map(p => ({ ...p, precio: 6.5 })), ingredientes: [] };
    const { mod, publicados } = await montar(cartaCara);
    await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 42, text: MENSAJE_REAL } });
    const crear = publicados.find(p => p.ev === 'pedido.crear-tienda');
    assert.strictEqual(crear.payload.total_centimos, 1300, 'manda la carta (2 × 6,50), no los 11,90 del texto');
  }

  // 3 · sin #P1 no hay pedido: no se puede re-tasar → no se cobra a ciegas. Y el cliente
  //     recibe un aviso (callar aquí lo dejaría creyendo que su pedido entró).
  {
    const { mod, publicados, enviados } = await montar();
    const sinIds = MENSAJE_REAL.split('\n').filter(l => !l.startsWith('#P1')).join('\n');
    await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 42, text: sinIds } });
    assert.strictEqual(publicados.filter(p => p.ev === 'pedido.crear-tienda').length, 0, 'sin ids no hay pedido');
    if (enviados.length > 0) {
      assert.ok(/No he podido leer el pedido/.test(enviados[0].texto),
        'si contesta, contesta pidiendo que lo recomponga desde la carta');
    }
  }

  // 4 · un producto que ya no está en la carta: se rechaza y NO se cobra
  {
    const cartaSinUno = { productos: [CARTA.productos[0]], ingredientes: [] };
    const { mod, publicados, enviados } = await montar(cartaSinUno);
    await mod.onTelegramText({ data: { botName: 'Rapitvapers_bot', chatId: 42, text: MENSAJE_REAL } });
    assert.strictEqual(publicados.filter(p => p.ev === 'pedido.crear-tienda').length, 0, 'no se crea pedido');
    assert.ok(enviados.some(e => /ya no está en la carta/.test(e.texto)), 'se le explica al cliente');
  }

  // 5 · un bot sin proyecto vinculado no crea pedidos en el negocio de otro
  {
    const { mod, publicados, enviados } = await montar();
    await mod.onTelegramText({ data: { botName: 'Otro_bot', chatId: 42, text: MENSAJE_REAL } });
    assert.strictEqual(publicados.filter(p => p.ev === 'pedido.crear-tienda').length, 0, 'no hay pedido');
    assert.ok(enviados.some(e => /no es de este negocio/.test(e.texto)), 'se le dice claro');
  }

  // 6 · la vía del código sigue viva (no la rompimos al extraer el corazón)
  {
    const { mod, publicados } = await montar();
    mod._vinculoDelProyecto = async () => ({ botName: 'Rapitvapers_bot' });
    const r = await mod.handleBorradorPost({
      params: { project: 'rapitvapers' },
      body: {
        items: [{ producto_id: 'elfbar600-watermelon', cantidad: 1, tipo: 'normal' }],
        nombre_cliente: 'Paco',
        modo_consumo: 'recoger',
        mayor_edad_confirmado: true
      }
    });
    assert.strictEqual(r.status, 201);
    await mod.onTelegramCommand({ data: { botName: 'Rapitvapers_bot', chatId: 9, text: '/start p_' + r.data.codigo } });
    const crear = publicados.find(p => p.ev === 'pedido.crear-tienda');
    assert.ok(crear, 'el código sigue creando pedido');
    assert.strictEqual(crear.payload.total_centimos, 595);
    assert.strictEqual(mod.borradores.size, 0, 'un código = un pedido');
  }

  console.log('pedido-telegram compartido: 6/6 OK (mensaje → re-tasado → pedido → confirmación)');
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
