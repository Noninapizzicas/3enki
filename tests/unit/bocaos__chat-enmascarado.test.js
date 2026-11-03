'use strict';

/**
 * bocaos/chat-enmascarado — F04.
 *
 * Lo que se vigila:
 *   1. EL NÚMERO NO CRUZA: el mensaje que llega al otro lado no lleva el teléfono, lleva el alias.
 *   2. EL ALIAS ES DEL CONTRATO: el mismo rider en otro contrato tiene otro alias, y no se puede
 *      deducir de la persona.
 *   3. AL CERRAR EL CONTRATO EL ALIAS MUERE: contrato cerrado → mensaje rechazado, no «por si acaso».
 *   4. CERO AGREGADOS: el hecho no lleva el texto ni su longitud; no hay histórico que nadie pueda leer.
 *   5. Sin destino no se inventa un móvil: se rechaza con el hueco nombrado.
 *
 * Ejecutar: node tests/unit/bocaos__chat-enmascarado.test.js
 */

const assert = require('assert');
const ChatEnmascarado = require('../../modules/bocaos/chat-enmascarado/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const PEDIDO = 'ped-1';
const CONTRATO = 'ct-1';
const RIDER = 'rd-1';
const CHAT = '424242';

function nuevo({ contrato = { contrato_id: CONTRATO, pedido_id: PEDIDO, rider_id: RIDER, plaza_id: PLAZA, estado: 'VIVO' },
               chat_id = CHAT, pedido = { pedido_id: PEDIDO, project_slug: 'tienda-paco', cliente_telefono: '+34 600 11 22 33' } } = {}) {
  const publicados = [];
  const pedidas = [];
  const enviados = [];
  const m = new ChatEnmascarado();
  m.name = 'chat-enmascarado';
  m.plaza_id = PLAZA;
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.transporte = { enviar: async (msg) => { enviados.push(msg); return { ok: true, mensaje_id: `m-${enviados.length}` }; } };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'contrato-puntual.de.request') {
      if (!contrato) return { status: 404, error: { code: 'NO_CONSTA' } };
      return { status: 200, data: { contrato } };
    }
    if (ev === 'estado-parte.de.request') {
      return { status: 200, data: { parte: { parte_id: RIDER, chat_id } } };
    }
    if (ev === 'pedido.get.request') {
      if (!pedido) return { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
      return { status: 200, data: { pedido } };
    }
    return null;
  };
  return { m, pedidas, enviados, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const entregar = (m, extra = {}) => m.onEntregarRequest({ request_id: 'q', data: {
  project_id: PLAZA, plaza_id: PLAZA, contrato_id: CONTRATO, de: 'rider', texto: 'Estoy en el portal', ...extra
} });

test('el mensaje cruza: sale con el alias y NO con el número', async () => {
  const { m, enviados, eventos } = nuevo();
  const r = await entregar(m, { texto: 'Llamadme al 600 11 22 33 que bajo' });

  assert.strictEqual(r.status, 200, JSON.stringify(r));
  assert.strictEqual(enviados.length, 1);
  const msg = enviados[0];
  assert.strictEqual(msg.a, 'cliente');
  assert.ok(!/600\s?11\s?22\s?33/.test(msg.texto), `el número no cruza: ${msg.texto}`);
  assert.ok(msg.texto.includes('[número oculto]'), msg.texto);
  assert.ok(msg.texto.startsWith(msg.alias_de + ':'), 'el que habla se identifica con su alias');
  assert.strictEqual(msg.to, '+34 600 11 22 33', 'el DESTINO sí se resuelve: lo que no cruza es el número en el texto');

  const hechos = eventos('bocaos.mensaje_entregado');
  assert.strictEqual(hechos.length, 1);
  assert.strictEqual(hechos[0].p.contrato_id, CONTRATO);
  assert.strictEqual(hechos[0].p.de, 'rider');
  assert.strictEqual(hechos[0].p.a, 'cliente');
  assert.strictEqual(hechos[0].p.cuerpo_guardado, false);
  // F04 · cero agregados: ni el texto ni su tamaño en el hecho.
  const serializado = JSON.stringify(hechos[0].p);
  assert.ok(!serializado.includes('Llamadme'), 'el texto no se guarda');
  assert.strictEqual(hechos[0].p.longitud, undefined);
  assert.strictEqual(hechos[0].p.texto, undefined);
});

test('del cliente al rider: llega al móvil del rider por el censo, no por el pedido', async () => {
  const { m, enviados, pedidas } = nuevo();
  const r = await entregar(m, { de: 'cliente', texto: 'Bajo en dos minutos' });
  assert.strictEqual(r.status, 200, JSON.stringify(r));
  assert.strictEqual(enviados[0].a, 'rider');
  assert.strictEqual(enviados[0].chat_id, CHAT);
  assert.strictEqual(enviados[0].texto.startsWith('c-'), true, 'el cliente también habla con alias');
  assert.ok(pedidas.some((x) => x.ev === 'estado-parte.de.request'));
});

test('el alias es del CONTRATO, no de la persona: otro contrato, otro alias', async () => {
  const { m } = nuevo();
  const a = m._alias('ct-1', 'rider');
  const b = m._alias('ct-2', 'rider');
  const mismoCliente = m._alias('ct-1', 'cliente');
  assert.notStrictEqual(a, b, 'el mismo rider en otro contrato no arrastra su alias');
  assert.notStrictEqual(a, mismoCliente, 'cada lado tiene el suyo');
  assert.ok(/^r-[0-9a-f]{6}$/.test(a), a);
  assert.strictEqual(m._alias('ct-1', 'rider'), a, 'el alias es estable para el mismo contrato');
});

test('contrato cerrado: el alias murió y el mensaje no sale', async () => {
  const { m, enviados, eventos } = nuevo({ contrato: {
    contrato_id: CONTRATO, pedido_id: PEDIDO, rider_id: RIDER, plaza_id: PLAZA, estado: 'CERRADO'
  } });
  const r = await entregar(m);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(enviados.length, 0, 'con el contrato cerrado no se entrega nada');
  const no = eventos('bocaos.mensaje_rechazado');
  assert.strictEqual(no.length, 1);
  assert.strictEqual(no[0].p.hueco, 'alias muerto');
  assert.ok(no[0].p.motivo.includes('CERRADO'));
  assert.strictEqual(eventos('bocaos.mensaje_entregado').length, 0);
});

test('sin contrato no hay canal: no hay alias que valga', async () => {
  const { m, enviados, eventos } = nuevo({ contrato: null });
  const r = await entregar(m);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(enviados.length, 0);
  assert.strictEqual(eventos('bocaos.mensaje_rechazado')[0].p.hueco, 'sin contrato');
});

test('un mensaje que sólo era un teléfono no se entrega: sin número no queda mensaje', async () => {
  const { m, enviados, eventos } = nuevo();
  const r = await entregar(m, { texto: '600 11 22 33' });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(enviados.length, 0);
  assert.strictEqual(eventos('bocaos.mensaje_rechazado')[0].p.hueco, 'mensaje vacío tras enmascarar');
});

test('sin teléfono del cliente no se inventa un móvil: se rechaza y se dice el hueco', async () => {
  const { m, enviados, eventos } = nuevo({ pedido: { pedido_id: PEDIDO, project_slug: 'tienda-paco' } });
  const r = await entregar(m, { de: 'rider', texto: 'Hola' });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(enviados.length, 0);
  assert.strictEqual(eventos('bocaos.mensaje_rechazado')[0].p.hueco, 'sin teléfono del cliente');
});

test('la plaza no chatea: `de` sólo puede ser rider o cliente', async () => {
  const { m, enviados } = nuevo();
  const r = await entregar(m, { de: 'plaza' });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'LADO_INVALIDO');
  assert.strictEqual(enviados.length, 0);
});

test('el canal no guarda estado: no hay histórico que nadie pueda leer', () => {
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
