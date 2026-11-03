'use strict';

/**
 * bocaos/aviso-cliente — C05 · C06 · K02.
 *
 * Lo que se vigila:
 *   1. El cliente ve CUATRO estados. Un estado interno («en cola», «sin rider», «esperando
 *      propuesta») no llega a componerse: 400 ESTADO_NO_VISIBLE.
 *   2. Dos hechos que caen en el mismo estado NO producen dos mensajes (contrato_creado sigue
 *      siendo «en cocina»).
 *   3. Ninguna marca de Bocaos ni de la plaza sale al cliente: el aviso se rechaza y NO se envía.
 *   4. El transporte es el de la tienda: si falla, el fallo es visible (whatsapp.envio.fallido) y
 *      el pedido sigue existiendo.
 *   5. Sin teléfono no se inventa un destino.
 *
 * Ejecutar: node tests/unit/bocaos__aviso-cliente.test.js
 */

const assert = require('assert');
const AvisoCliente = require('../../modules/bocaos/aviso-cliente/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const TIENDA = 'tienda-paco';
const PEDIDO = 'ped-1001';
const TEL = '34600111222';

function nuevo({ envio = { status: 200, data: { message_id: 'wamid-1' } }, telefono = TEL } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new AvisoCliente();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'whatsapp.enviar.request') return envio;
    if (ev === 'pedido.get.request') return { status: 200, data: { pedido: { pedido_id: payload.pedido_id, cliente_telefono: telefono } } };
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const componer = (m, extra) => m.onComponerRequest({ request_id: 'c', data: { project_id: TIENDA, tienda_id: TIENDA, pedido_id: PEDIDO, estado: 'recibido', ...extra } });

test('C05/C06: el aviso de «recibido» sale por el WhatsApp de la tienda y queda como hecho', async () => {
  const { m, pedidas, eventos } = nuevo();
  const r = await componer(m);
  assert.strictEqual(r.status, 200, JSON.stringify(r.error || {}));
  assert.strictEqual(r.data.enviado, true);
  assert.strictEqual(r.data.to, TEL);

  const envio = pedidas.find((p) => p.ev === 'whatsapp.enviar.request');
  assert.strictEqual(envio.payload.project_slug, TIENDA, 'el canal es el de la tienda');
  assert.strictEqual(envio.payload.to, TEL);

  assert.strictEqual(eventos('whatsapp.mensaje.enviado').length, 1);
  const avisado = eventos('bocaos.cliente_avisado');
  assert.strictEqual(avisado.length, 1);
  assert.strictEqual(avisado[0].p.estado, 'recibido');
  assert.ok(avisado[0].p.texto.includes('recibido'), avisado[0].p.texto);
});

test('C05: el cliente sólo ve cuatro estados; uno interno no se compone', async () => {
  const { m, eventos } = nuevo();
  for (const estado of ['en_cola', 'sin_rider', 'esperando_propuesta', 'RECIBIDO_INTERNO']) {
    const r = await componer(m, { estado });
    assert.strictEqual(r.status, 400, estado);
    assert.strictEqual(r.error.code, 'ESTADO_NO_VISIBLE');
  }
  assert.strictEqual(eventos('bocaos.cliente_avisado').length, 0);
});

test('C05: dos hechos que caen en el mismo estado no producen dos mensajes', async () => {
  const { m, eventos } = nuevo();
  await m.onPedidoAceptado({ data: { project_id: TIENDA, tienda_id: TIENDA, pedido_id: PEDIDO, telefono: TEL } });
  assert.strictEqual(eventos('bocaos.cliente_avisado').length, 1);

  // «listo» y «contrato_creado» son los dos «en cocina» para el cliente: no se repite.
  await m.onPedidoListo({ data: { project_id: TIENDA, tienda_id: TIENDA, pedido_id: PEDIDO, telefono: TEL } });
  await m.onContratoCreado({ data: { project_id: TIENDA, tienda_id: TIENDA, pedido_id: PEDIDO, telefono: TEL } });
  assert.strictEqual(eventos('bocaos.cliente_avisado').length, 1, 'un cliente no recibe tres veces «en cocina»');

  // Y el cambio de estado sí avisa.
  await m.onHechoRepartoAnotado({ data: { project_id: TIENDA, tienda_id: TIENDA, pedido_id: PEDIDO, telefono: TEL, tipo: 'recogida' } });
  const avisos = eventos('bocaos.cliente_avisado');
  assert.strictEqual(avisos.length, 2);
  assert.strictEqual(avisos[1].p.estado, 'en_camino');
});

test('K02: «Bocaos», la marca de la plaza o un enlace → el aviso NO sale', async () => {
  const { m, pedidas, eventos } = nuevo();
  for (const texto of ['Tu pedido va en camino · powered by Bocaos', 'Bocaos te avisa', 'Pedido de Plaza Centro']) {
    const r = await componer(m, { estado: 'en_camino', texto, plaza_nombre: 'Plaza Centro' });
    assert.strictEqual(r.status, 409, texto);
    assert.strictEqual(r.error.code, 'MARCA_AJENA');
    assert.strictEqual(r.error.details.enviado, false);
  }
  assert.strictEqual(pedidas.filter((p) => p.ev === 'whatsapp.enviar.request').length, 0, 'no se envió nada');
  const rechazados = eventos('bocaos.aviso_rechazado');
  assert.strictEqual(rechazados.length, 3);
  assert.strictEqual(rechazados[0].p.marca_encontrada, 'bocaos');
  assert.strictEqual(rechazados[2].p.marca_encontrada, 'plaza centro');
});

test('el fallo del transporte es visible y el pedido existe igual', async () => {
  const { m, eventos } = nuevo({ envio: { status: 503, error: { code: 'UPSTREAM_UNREACHABLE', message: 'Meta no contesta' } } });
  const r = await componer(m);
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.error.code, 'ENVIO_FALLIDO');
  const fallidos = eventos('whatsapp.envio.fallido');
  assert.strictEqual(fallidos.length, 1);
  assert.strictEqual(fallidos[0].p.error_code, 'UPSTREAM_UNREACHABLE');
  assert.strictEqual(eventos('bocaos.cliente_avisado').length, 0, 'no se avisó: no se finge');

  // El mismo aviso se puede reintentar: el estado no quedó marcado como avisado.
  const { m: m2, eventos: ev2 } = nuevo();
  await m2.onComponerRequest({ request_id: 'x', data: { project_id: TIENDA, tienda_id: TIENDA, pedido_id: PEDIDO, estado: 'recibido' } });
  assert.strictEqual(ev2('bocaos.cliente_avisado').length, 1);
});

test('sin teléfono no se inventa un destino: SIN_DESTINO y el fallo visible', async () => {
  const { m, pedidas, eventos } = nuevo({ telefono: null });
  const r = await componer(m);
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'SIN_DESTINO');
  assert.strictEqual(pedidas.filter((p) => p.ev === 'whatsapp.enviar.request').length, 0);
  assert.strictEqual(eventos('whatsapp.envio.fallido')[0].p.error_code, 'SIN_DESTINO');
});

test('el teléfono se PIDE al pedido de la tienda si no viaja en el evento', async () => {
  const { m, pedidas } = nuevo();
  await m.onPedidoCreado({ data: { project_id: TIENDA, tienda_id: TIENDA, pedido_id: PEDIDO } });
  const pedidoGet = pedidas.find((p) => p.ev === 'pedido.get.request');
  assert.ok(pedidoGet, 'sin teléfono en el evento, se pregunta por el pedido: no se guarda aquí (D05)');
  assert.strictEqual(pedidoGet.payload.pedido_id, PEDIDO);
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
