/**
 * Tests unitarios — pizzepos/confirmacion-pedido.
 *
 * Lo que se prueba aquí es la CONVERSACIÓN y el CONTRATO, no el transporte:
 *  · a un cliente nuevo se le PIDE confirmación y a un habitual se le saluda;
 *  · su respuesta llega por el BUS (whatsapp.mensaje.recibido) — no hay fichero,
 *    ni offset, ni setInterval — y sale como pedido.confirmacion_respondida /
 *    pedido.confirmacion_rechazada (nunca como llamada en proceso a `pedidos`);
 *  · el mismo message_id dos veces NO responde dos veces (el puente repite);
 *  · los 10 minutos sin respuesta publican pedido.sin_confirmar.
 *
 * El mini-bus de abajo imita al EventBus real: publica → despacha a los handlers
 * declarados en module.json (lo mismo que hace el loader en producción), así que el
 * test cubre el cableado emisor→receptor, no solo el método suelto.
 *
 * Ejecutar: node tests/unit/pizzepos__confirmacion-pedido.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Modulo = require('../../modules/pizzepos/confirmacion-pedido/index.js');
const MANIFEST = require('../../modules/pizzepos/confirmacion-pedido/module.json');
const PEDIDOS_MANIFEST = require('../../modules/pizzepos/pedidos/module.json');
const NOTIFICADOR_MANIFEST = require('../../modules/pizzepos/notificador-pedidos/module.json');

let TMP;

function base(extra = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'proj-'));
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config', 'config.json'), JSON.stringify({
    whatsapp_qr: { url: 'http://127.0.0.1:9999/send', slug: 'the-pirate' },
    confirmacion_pedidos: { activo: true, pedidos_habitual: 3, espera_segundos: 0, ...extra }
  }));
  return dir;
}

// Mini-bus: mismo contrato que core/events/bus.js (publish → emitLocal a los
// suscriptores, con el payload dentro de `event.data`).
function makeBus() {
  const subs = new Map();
  const published = [];
  return {
    published,
    subscribe(evento, handler) {
      if (!subs.has(evento)) subs.set(evento, []);
      subs.get(evento).push(handler);
      return () => {
        const arr = subs.get(evento) || [];
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    async publish(evento, data, options = {}) {
      published.push({ evento, data, options });
      const envelope = {
        event_type: evento,
        data,
        metadata: { correlation_id: options.correlation_id || null },
        source: { module_id: 'test' }
      };
      for (const h of subs.get(evento) || []) await h(envelope);
    }
  };
}

// Este es exactamente el cableado que hace core/modules/loader.js con module.json.
function wireManifest(instancia, bus, manifest) {
  const subs = manifest.subscribes || manifest.events?.subscribes || [];
  for (const s of subs) {
    const fn = instancia[s.handler];
    assert.strictEqual(typeof fn, 'function', `module.json declara ${s.event} → ${s.handler}, que no existe`);
    bus.subscribe(s.event, fn.bind(instancia));
  }
}

async function instanciar(dir, { pedidos = null } = {}) {
  const enviados = [];
  global.fetch = async (url, opts) => {
    enviados.push(JSON.parse(opts.body));
    return { status: 200, json: async () => ({ ok: true, id: 'msg1' }) };
  };
  const bus = makeBus();
  const m = new Modulo();
  await m.onLoad({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    metrics: { increment() {} },
    eventBus: bus,
    moduleRegistry: {
      get: (n) => {
        if (n === 'project-manager') return { instance: { handleGetProject: async () => ({ status: 200, data: { project: { id: 'the-pirate', base_path: dir } } }) } };
        if (n === 'pedidos') return { instance: pedidos };
        if (n === 'cuentas') return { instance: { handleGetCuenta: async () => ({ status: 200, data: { ref_display: 'Paco L 395' } }) } };
        return null;
      }
    }
  });
  wireManifest(m, bus, MANIFEST);
  return { m, enviados, bus };
}

// Un evento entrante de WhatsApp tal y como lo publica whatsapp-bot (12 campos).
function mensaje(extra = {}) {
  return {
    project_slug: 'the-pirate',
    phone_number_id: '123456789',
    from: '666@lid',
    message_type: 'text',
    message_id: 'wamid.1',
    has_text: true,
    text: '',
    timestamp: '1760000000',
    contact_name: 'Ana',
    interaction: null,
    media: null,
    location: null,
    ...extra
  };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const publicadosDe = (bus, nombre) => bus.published.filter(p => p.evento === nombre).map(p => p.data);

// module.json puede declarar subscribes en raíz o anidado en events (el loader acepta
// las dos formas; raíz tiene prioridad).
const subsDe = (manifest) => (manifest.subscribes || manifest.events?.subscribes || []);

(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmacion-'));

  // ── El contrato: qué escucha y qué publica este módulo ──────────────────────

  {
    const escucha = subsDe(MANIFEST).map(s => `${s.event}:${s.handler}`);
    assert.ok(escucha.includes('whatsapp.mensaje.recibido:onWhatsappMensajeRecibido'),
      'la respuesta del cliente se escucha por el bus, no leyendo un fichero');
    assert.deepStrictEqual(
      (MANIFEST.publishes || []).slice().sort(),
      ['pedido.confirmacion_rechazada', 'pedido.confirmacion_respondida', 'pedido.sin_confirmar'],
      'los eventos publicados son los del contrato'
    );
    // El evento que publica nadie más tiene que quedar cableado en su consumidor.
    const pedidosEscucha = subsDe(PEDIDOS_MANIFEST).map(s => s.event);
    assert.ok(pedidosEscucha.includes('pedido.confirmacion_respondida'), 'pedidos consume el SÍ');
    assert.ok(pedidosEscucha.includes('pedido.confirmacion_rechazada'), 'pedidos consume el NO');
    assert.ok(subsDe(NOTIFICADOR_MANIFEST).some(s => s.event === 'pedido.sin_confirmar'),
      'pedido.sin_confirmar ya NO es un evento huérfano: lo consume notificador-pedidos');

    // Y la costura vieja no vuelve por la puerta de atrás. Se mira el CÓDIGO (sin
    // comentarios): el docblock sí puede nombrar el handler del dueño del pedido.
    const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'pizzepos', 'confirmacion-pedido', 'index.js'), 'utf8');
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(codigo, /setInterval/, 'nada de sondeo por reloj: el módulo es 100% evento');
    assert.doesNotMatch(codigo, /_llamarPedidos|handleConfirmarPedido|handleRechazarPedido/,
      'nada de llamadas cruzadas a pedidos en proceso');
    assert.doesNotMatch(codigo, /readFile\(.*eventos\.jsonl|offsets\./,
      'nada de leer el fichero del puente ni comparar offsets');
  }

  // ── Clasificación de la respuesta ───────────────────────────────────────────

  {
    const { m } = await instanciar(base());
    for (const [texto, esperado] of [
      ['SÍ', 'si'], ['sí', 'si'], ['Si!', 'si'], ['vale', 'si'], ['OK', 'si'],
      ['adelante', 'si'], ['sí, adelante', 'si'], ['confirmo', 'si'],
      ['no', 'no'], ['No.', 'no'], ['mejor no', 'no'], ['cancela', 'no']
    ]) {
      assert.strictEqual(m._clasificar(texto), esperado, `"${texto}" debería ser ${esperado}`);
    }
    for (const texto of ['no sé qué tal', 'hola buenas', 'cuánto tarda la pizza', 'sí pero sin cebolla por favor']) {
      assert.strictEqual(m._clasificar(texto), null, `"${texto}" no es una respuesta de confirmación`);
    }
    await m.onUnload();
  }

  // ── Cliente nuevo: se le pide confirmación ──────────────────────────────────

  {
    const dir = base();
    const { m, enviados } = await instanciar(dir);
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p1', project_slug: 'the-pirate', project_id: 'the-pirate',
      cuenta_id: 'c1', cliente_jid: '444@lid', cliente_nombre: 'Francisco Sánchez'
    } });
    await esperar(80);
    assert.strictEqual(enviados.length, 1);
    assert.strictEqual(enviados[0].slug, 'the-pirate');
    assert.strictEqual(enviados[0].to, '444@lid');
    assert.match(enviados[0].text, /Francisco/, 'saluda por su nombre de pila');
    assert.match(enviados[0].text, /SÍ/, 'dice exactamente qué tiene que responder');
    assert.match(enviados[0].text, /L 395/, 'lleva el número de pedido que dirá en la barra');
    assert.match(enviados[0].text, /preferimos preguntarte/, 'cordial y empática: explica por qué se pregunta');
    assert.match(enviados[0].text, /Sin tu SÍ no lo ponemos en marcha/, 'firme: el pedido no arranca sin su sí');
    assert.doesNotMatch(enviados[0].text, /van \d|\d+ pedidos|esta es la \d/,
      'a un cliente nuevo no se le cuenta nada de su historial');
    await m.onUnload();
  }

  // ── Cliente habitual: no se le pide nada, se le saluda ──────────────────────

  {
    const dir = base();
    const { m, enviados } = await instanciar(dir);
    await m.onPedidoClienteHabitual({ data: {
      pedido_id: 'p2', project_slug: 'the-pirate', cliente_jid: '555@lid',
      cliente_nombre: 'Paco Ros', pedidos_entregados: 3
    } });
    assert.strictEqual(enviados.length, 1);
    assert.match(enviados[0].text, /Paco/);
    assert.match(enviados[0].text, /alegría/, 'trato cordial, de casa');
    assert.doesNotMatch(enviados[0].text, /Responde SÍ/, 'a un habitual no se le pide confirmación');
    assert.doesNotMatch(enviados[0].text, /\bvan \d|\d+ pedidos|esta es la \d/,
      'nada de contar pedidos: solo cordialidad, no un marcador');
    await m.onUnload();
  }

  // ── El "sí" llega por el bus y sale como evento (no como llamada a pedidos) ──

  {
    const llamadas = [];
    const pedidos = {
      handleConfirmarPedido: async (a) => { llamadas.push(['confirmar', a.pedido_id]); return { status: 200, data: {} }; },
      handleRechazarPedido: async (a) => { llamadas.push(['rechazar', a.pedido_id]); return { status: 200, data: {} }; }
    };
    const { m, bus } = await instanciar(base(), { pedidos });
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p3', project_slug: 'the-pirate', project_id: 'the-pirate',
      cuenta_id: 'c3', cliente_jid: '666@lid', cliente_nombre: 'Ana'
    } });
    await esperar(80);

    // El cliente contesta: lo publica whatsapp-bot, lo recibe este módulo por el bus.
    await bus.publish('whatsapp.mensaje.recibido', mensaje({ text: 'sí', message_id: 'wamid.si-1' }));

    const eventos = publicadosDe(bus, 'pedido.confirmacion_respondida');
    assert.strictEqual(eventos.length, 1, 'un "sí" publica UN pedido.confirmacion_respondida');
    assert.deepStrictEqual(
      { pedido_id: eventos[0].pedido_id, jid: eventos[0].jid, respuesta: eventos[0].respuesta },
      { pedido_id: 'p3', jid: '666@lid', respuesta: 'si' },
      'el payload lleva pedido_id, jid y respuesta'
    );
    assert.strictEqual(eventos[0].cuenta_id, 'c3');
    assert.strictEqual(eventos[0].whatsapp_message_id, 'wamid.si-1');
    assert.strictEqual(m.pendientes.size, 0, 'el pendiente se cierra al responder');
    assert.deepStrictEqual(llamadas, [], 'NO se llama a pedidos en proceso: la respuesta viaja por el bus');
    await m.onUnload();
  }

  // ── El "no" publica pedido.confirmacion_rechazada ───────────────────────────

  {
    const { m, bus } = await instanciar(base());
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p4', project_slug: 'the-pirate', cliente_jid: '777@lid', cliente_nombre: 'Luis'
    } });
    await esperar(80);
    await bus.publish('whatsapp.mensaje.recibido', mensaje({ from: '777@lid', text: 'no', message_id: 'wamid.no-1' }));

    const eventos = publicadosDe(bus, 'pedido.confirmacion_rechazada');
    assert.strictEqual(eventos.length, 1);
    assert.strictEqual(eventos[0].pedido_id, 'p4');
    assert.strictEqual(eventos[0].respuesta, 'no');
    assert.strictEqual(eventos[0].motivo, 'cliente_dijo_no');
    assert.strictEqual(m.pendientes.size, 0);
    await m.onUnload();
  }

  // ── Idempotencia: el puente repite el MISMO mensaje ─────────────────────────

  {
    const { m, bus } = await instanciar(base());
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p5', project_slug: 'the-pirate', cliente_jid: '888@lid', cliente_nombre: 'Eva'
    } });
    await esperar(80);
    const msg = mensaje({ from: '888@lid', text: 'sí', message_id: 'wamid.dup-1' });
    await bus.publish('whatsapp.mensaje.recibido', msg);
    await bus.publish('whatsapp.mensaje.recibido', msg);   // reintento del puente

    assert.strictEqual(publicadosDe(bus, 'pedido.confirmacion_respondida').length, 1,
      'el mismo message_id no responde dos veces');
    await m.onUnload();
  }

  // ── Ruido que NO debe confirmar nada ────────────────────────────────────────

  {
    const { m, bus } = await instanciar(base());
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p6', project_slug: 'the-pirate', cliente_jid: '999@lid', cliente_nombre: 'Eva'
    } });
    await esperar(80);
    const ruido = [
      mensaje({ from: '999@lid', text: 'sí', message_id: 'r1', project_slug: 'otro-negocio' }), // otro proyecto
      mensaje({ from: '123@lid', text: 'sí', message_id: 'r2' }),                                // otro cliente
      mensaje({ from: '999@g.us', text: 'sí', message_id: 'r3' }),                               // grupo
      mensaje({ from: '999@lid', text: 'Pedido recibido, Eva.', message_id: 'r4' }),             // eco del bot
      mensaje({ from: '999@lid', text: 'cuánto tarda la pizza', message_id: 'r5' }),             // otra cosa
      mensaje({ from: '999@lid', text: 'sí pero sin cebolla y con extra de queso por favor', message_id: 'r6' }), // párrafo
      mensaje({ from: '999@lid', text: '', message_id: 'r7' })                                   // sin texto
    ];
    for (const msg of ruido) await bus.publish('whatsapp.mensaje.recibido', msg);

    assert.strictEqual(publicadosDe(bus, 'pedido.confirmacion_respondida').length, 0, 'ni un ruido confirma');
    assert.strictEqual(publicadosDe(bus, 'pedido.confirmacion_rechazada').length, 0, 'ni un ruido rechaza');
    assert.strictEqual(m.pendientes.size, 1, 'el pedido sigue esperando su respuesta de verdad');
    await m.onUnload();
  }

  // ── Dos pedidos parados: contesta el más antiguo ────────────────────────────

  {
    const { m, bus } = await instanciar(base());
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'viejo', project_slug: 'the-pirate', cliente_jid: '321@lid', cliente_nombre: 'Uno'
    } });
    await esperar(5);
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'nuevo', project_slug: 'the-pirate', cliente_jid: '321@lid', cliente_nombre: 'Uno'
    } });
    await esperar(80);
    await bus.publish('whatsapp.mensaje.recibido', mensaje({ from: '321@lid', text: 'ok', message_id: 'ord-1' }));
    const eventos = publicadosDe(bus, 'pedido.confirmacion_respondida');
    assert.strictEqual(eventos.length, 1);
    assert.strictEqual(eventos[0].pedido_id, 'viejo', 'se responde al que lleva más tiempo esperando');
    assert.ok(m.pendientes.has('nuevo'), 'el otro sigue pendiente: no se adivina');
    await m.onUnload();
  }

  // ── 10 minutos sin respuesta → pedido.sin_confirmar (y la barra se entera) ───

  {
    const dir = base();
    const { m, bus } = await instanciar(dir);
    m.esperaRespuestaMs = 20;   // el reloj real son 10 min; aquí se acorta el disparador
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p7', project_slug: 'the-pirate', project_id: 'the-pirate',
      cuenta_id: 'c7', cliente_jid: '111@lid', cliente_nombre: 'Sin Respuesta'
    } });
    await esperar(120);
    const avisos = publicadosDe(bus, 'pedido.sin_confirmar');
    assert.strictEqual(avisos.length, 1, 'a los 10 min se avisa: un pedido no se queda colgado');
    assert.strictEqual(avisos[0].pedido_id, 'p7');
    assert.strictEqual(avisos[0].project_id, 'the-pirate');
    assert.strictEqual(avisos[0].cliente_nombre, 'Sin Respuesta');
    assert.ok(avisos[0].esperando_desde, 'dice desde cuándo espera');
    await m.onUnload();
  }

  // ── Sin puente configurado no se manda y no se rompe ────────────────────────

  {
    const dir = fs.mkdtempSync(path.join(TMP, 'vacio-'));
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config', 'config.json'), JSON.stringify({}));
    const { m, enviados } = await instanciar(dir);
    await m.onPedidoConfirmacionPendiente({ data: {
      pedido_id: 'p8', project_slug: 'the-pirate', cliente_jid: '000@lid', cliente_nombre: 'Sin Puente'
    } });
    await esperar(80);
    assert.strictEqual(enviados.length, 0, 'sin puente no hay mensaje');
    await m.onUnload();
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\nTodos los tests pasaron.');
})().catch((e) => { console.error(e); process.exit(1); });
