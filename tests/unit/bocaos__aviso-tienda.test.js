'use strict';

/**
 * bocaos/aviso-tienda — C03 (AvisoTienda) · K01 (ReclamaciónPorLaTienda).
 *
 * Lo que se vigila:
 *   1. Avisa a la tienda por SU canal (el mismo telegram.send_message de reporte-caja).
 *   2. AVISA, NO DECIDE: si el aviso trae una orden (aceptar, arrancar cocina, hora), 409.
 *   3. Sin chat en el censo o con el transporte caído: aviso-tienda.fallido y el pedido sigue vivo.
 *   4. K01: la reclamación del cliente final se DEVUELVE a la tienda con su hora, no se atiende.
 *   5. Es un puente sin estado: no escribe nada.
 *
 * Ejecutar: node tests/unit/bocaos__aviso-tienda.test.js
 */

const assert = require('assert');
const AvisoTienda = require('../../modules/bocaos/aviso-tienda/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const PEDIDO = 'ped-1001';
const CHAT = '777888999';

function nuevo({ chat = CHAT, envio = null } = {}) {
  const publicados = [];
  const pedidas = [];
  const enviados = [];
  const m = new AvisoTienda();
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'censo-parte.de.request') {
      if (!chat) return { status: 404, error: { code: 'PARTE_NO_CONSTA' } };
      return { status: 200, data: { parte: { parte_id: TIENDA, chat_id: chat } } };
    }
    return null;
  };
  m.transporte = {
    enviar: async (msg) => {
      enviados.push(msg);
      if (envio) return envio;
      return { ok: true, mensaje_id: 42 };
    }
  };
  return { m, pedidas, enviados, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const creado = (m, extra) => m.onPedidoCreado({ data: { project_id: PLAZA, plaza_id: PLAZA, tienda_id: TIENDA, pedido_id: PEDIDO, zona: 'centro', ...extra } });
const devolver = (m, extra) => m.onDevolverRequest({ request_id: 'v', data: { project_id: PLAZA, plaza_id: PLAZA, tienda_id: TIENDA, pedido_id: PEDIDO, reclamacion_id: 'rec-1', hora: '2026-11-03T10:00:00.000Z', ...extra } });

test('C03: el pedido recibido se avisa al chat de la tienda, que se pide al censo', async () => {
  const { m, pedidas, enviados, eventos } = nuevo();
  await creado(m);
  const censo = pedidas.find((p) => p.ev === 'censo-parte.de.request');
  assert.ok(censo, 'el chat NO se guarda aquí: se pregunta al censo');
  assert.strictEqual(censo.payload.parte_id, TIENDA);

  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].chatId, Number(CHAT));
  assert.strictEqual(enviados[0].botName, 'bocaos');
  assert.ok(enviados[0].text.includes(PEDIDO), enviados[0].text);

  const enviado = eventos('aviso-tienda.enviado');
  assert.strictEqual(enviado.length, 1);
  assert.strictEqual(enviado[0].p.ordena, false, 'el aviso no mueve nada');
  assert.strictEqual(enviado[0].p.mensaje_id, 42);
});

test('C03: el texto del aviso no da órdenes — ni aceptar, ni cocina, ni hora', async () => {
  const { m, enviados } = nuevo();
  await creado(m);
  await m.onContratoCreado({ data: { project_id: PLAZA, plaza_id: PLAZA, tienda_id: TIENDA, pedido_id: PEDIDO } });
  await m.onHuecoNombrado({ data: { project_id: PLAZA, plaza_id: PLAZA, tienda_id: TIENDA, pedido_id: PEDIDO, motivo: 'sin candidatos' } });

  assert.strictEqual(enviados.length, 3);
  for (const e of enviados) {
    const t = e.text.toLowerCase();
    for (const orden of ['acepta', 'arranca', 'empieza', 'a las ']) {
      assert.ok(!t.includes(orden), `el aviso no puede ordenar: «${e.text}»`);
    }
  }
  assert.ok(enviados[1].text.includes('Rider asignado'));
  assert.ok(enviados[2].text.includes('sin candidatos'), 'el hueco se nombra, no se tapa');
});

test('C03: sin chat en el censo, aviso-tienda.fallido — y el pedido sigue vivo', async () => {
  const { m, enviados, eventos } = nuevo({ chat: null });
  await creado(m);
  assert.strictEqual(enviados.length, 0);
  const fallidos = eventos('aviso-tienda.fallido');
  assert.strictEqual(fallidos.length, 1);
  assert.strictEqual(fallidos[0].p.hueco, 'sin canal');
  assert.strictEqual(eventos('aviso-tienda.enviado').length, 0);
});

test('C03: si el transporte falla, el fallo es visible y no se finge el envío', async () => {
  const { m, eventos } = nuevo({ envio: { ok: false, motivo: 'bot sin token' } });
  await creado(m);
  assert.strictEqual(eventos('aviso-tienda.enviado').length, 0);
  const f = eventos('aviso-tienda.fallido');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].p.motivo, 'bot sin token');
});

test('C03: el mismo hecho no abre dos avisos', async () => {
  const { m, enviados } = nuevo();
  await creado(m);
  await creado(m);
  assert.strictEqual(enviados.length, 1);
});

test('K01: una reclamación del cliente final se DEVUELVE a la tienda con su hora', async () => {
  const { m, enviados, eventos } = nuevo();
  const r = await devolver(m, { texto: 'El cliente dice que faltaba una pizza.' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.error || {}));
  assert.strictEqual(r.data.devuelta_a, TIENDA);
  assert.strictEqual(r.data.hora, '2026-11-03T10:00:00.000Z');

  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].canal, 'tienda');

  const devuelta = eventos('bocaos.reclamacion_devuelta');
  assert.strictEqual(devuelta.length, 1);
  assert.strictEqual(devuelta[0].p.reclamacion_id, 'rec-1');
  assert.strictEqual(devuelta[0].p.entregada, true);
  assert.ok(devuelta[0].p.motivo.includes('no atiende al cliente final'), devuelta[0].p.motivo);
});

test('C03: el aviso no acepta por la tienda — si le piden que ordene, 409', async () => {
  const { m, enviados, eventos } = nuevo();
  for (const orden of [{ aceptar: true }, { arrancar_cocina: true }, { hora_comprometida: '2026-11-03T21:30:00Z' }, { estado_pedido: 'ACEPTADO' }]) {
    const r = await devolver(m, orden);
    assert.strictEqual(r.status, 409, JSON.stringify(orden));
    assert.strictEqual(r.error.code, 'AVISO_NO_ORDENA');
  }
  assert.strictEqual(enviados.length, 0);
  assert.strictEqual(eventos('bocaos.reclamacion_devuelta').length, 0, 'si no se pudo devolver, no se inventa la devolución');
});

test('es un puente sin estado: no escribe nada', async () => {
  const { m } = nuevo();
  assert.strictEqual(m._path, null);
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok — ${t.name}`); }
    catch (err) { fallos += 1; console.error(`FALLO — ${t.name}\n  ${err.message}`); }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();
