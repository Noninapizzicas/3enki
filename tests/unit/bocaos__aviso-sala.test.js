'use strict';

/**
 * bocaos/aviso-sala — I07. El aviso a la sala, con traza, y el caso que no se pierde.
 *
 * Lo que se vigila:
 *   1. Sin traza no hay aviso (la sala sólo podría improvisar).
 *   2. El caso entra en la cola SIEMPRE, salga el aviso o no.
 *   3. El aviso no cierra el caso.
 *   4. Si el plazo venció, sigue vivo y sube de prioridad.
 *
 * Ejecutar: node tests/unit/bocaos__aviso-sala.test.js
 */

const assert = require('assert');
const AvisoSala = require('../../modules/bocaos/aviso-sala/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const CASO = { caso_id: 'dp-1111', tipo: 'disputa', titulo: 'disputa del cargo cg-1', partes: ['rider-ana', 'tienda-paco'] };
const TRAZA = { cargo_id: 'cg-1', espera_min: 11, evidencia: [{ hecho: 'espera_n1' }] };

function nuevo({ transporte = { enviar: async () => ({ ok: true, mensaje_id: 'msg-9' }) } } = {}) {
  const publicados = [];
  const m = new AvisoSala();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  m.transporte = transporte;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const avisar = (m, extra) => m.onCasoRequest({
  request_id: 'a', data: { project_id: PLAZA, plaza_id: PLAZA, caso: CASO, tipo: 'disputa', traza: TRAZA, destinatario: 'chat-sala', ...extra }
});

test('avisa con la traza y deja el caso en la cola', async () => {
  const enviados = [];
  const { m, eventos } = nuevo({ transporte: { enviar: async (msg) => { enviados.push(msg); return { ok: true, mensaje_id: 'msg-9' }; } } });
  const r = await avisar(m);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.avisado, true);
  assert.strictEqual(r.data.en_cola, true);
  assert.strictEqual(enviados.length, 1);
  assert.ok(enviados[0].texto.includes('traza:'), 'la traza va en el mensaje');
  assert.ok(enviados[0].texto.includes('espera_min: 11'), 'con sus números, no resumida');
  assert.ok(enviados[0].texto.includes('cg-1'));

  assert.strictEqual(eventos('cola-sala.encolar.request').length, 1, 'el caso entra en la cola');
  assert.strictEqual(eventos('cola-sala.encolar.request')[0].p.caso_id, 'dp-1111');
  assert.deepStrictEqual(eventos('cola-sala.encolar.request')[0].p.traza, TRAZA);
  const hecho = eventos('aviso-sala.enviado')[0].p;
  assert.strictEqual(hecho.cierra_caso, false, 'el aviso no cierra el caso');
  assert.strictEqual(hecho.mensaje_id, 'msg-9');
});

test('sin traza no hay aviso: la sala no puede mirar qué se intentó', async () => {
  const { m, eventos } = nuevo();
  const r = await avisar(m, { traza: null });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'SIN_TRAZA');
  assert.strictEqual(eventos('telegram.send_message.request').length, 0);
  assert.strictEqual(eventos('aviso-sala.caso.failed').length, 1);
});

test('sin destinatario el aviso no sale, pero el caso NO se pierde (Q40)', async () => {
  const { m, eventos } = nuevo();
  const r = await avisar(m, { destinatario: null });
  assert.strictEqual(r.status, 202);
  assert.strictEqual(r.data.avisado, false);
  assert.strictEqual(r.data.en_cola, true);
  assert.strictEqual(eventos('cola-sala.encolar.request').length, 1, 'el caso queda vivo y visible');
  const f = eventos('aviso-sala.fallido')[0].p;
  assert.strictEqual(f.hueco, 'sin destinatario');
  assert.ok(/Q40/.test(f.motivo));
});

test('el transporte que falla no esconde el caso: hecho de fallo y sigue en la cola', async () => {
  const { m, eventos } = nuevo({ transporte: { enviar: async () => ({ ok: false, motivo: 'bot caído' }) } });
  const r = await avisar(m);
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.data.en_cola, true);
  const f = eventos('aviso-sala.fallido')[0].p;
  assert.strictEqual(f.hueco, 'transporte');
  assert.strictEqual(f.en_cola, true);
  assert.strictEqual(eventos('aviso-sala.enviado').length, 0);
  assert.strictEqual(eventos('cola-sala.encolar.request').length, 1);
});

test('por defecto habla con telegram-service, y sin respuesta no afirma que se entregó', async () => {
  const publicados = [];
  const m = new AvisoSala();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.transporte = null;
  const r = await avisar(m, { destinatario: 'chat-sala' });
  assert.strictEqual(r.status, 502, 'sin respuesta del transporte no se da por entregado');
  assert.strictEqual(publicados.filter((x) => x.ev === 'telegram.send_message.request').length, 1);
  assert.ok(/no confirmó/.test(r.data.motivo));
});

test('si el plazo venció, el caso sigue vivo y sube de prioridad', async () => {
  const { m, eventos } = nuevo();
  const ayer = new Date(Date.now() - 86400000).toISOString();
  const r = await avisar(m, { plazo: ayer });
  assert.strictEqual(r.data.vencido, true);
  const enCola = eventos('cola-sala.encolar.request')[0].p;
  assert.strictEqual(enCola.vencido, true);
  assert.strictEqual(enCola.prioridad_extra, 1, 'vence → sube de prioridad, no se cierra');
  assert.strictEqual(eventos('aviso-sala.enviado')[0].p.cierra_caso, false);
});

test('el plazo que no consta se dice, no se inventa', async () => {
  const enviados = [];
  const { m } = nuevo({ transporte: { enviar: async (msg) => { enviados.push(msg); return { ok: true, mensaje_id: 'm' }; } } });
  await avisar(m);
  assert.ok(/plazo: no consta/.test(enviados[0].texto));
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
