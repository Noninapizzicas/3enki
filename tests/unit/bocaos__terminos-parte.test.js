'use strict';

/**
 * bocaos/terminos-parte — I08. Lo que cada parte aceptó, con versión y hora.
 *
 * Lo que se vigila:
 *   1. Sin términos vigentes no hay propuesta NI devengo: la puerta se devuelve resuelta y, cuando
 *      no hay nada, la respuesta es 404 NO_CONSTA con el hueco — no una v0 inventada.
 *   2. UN CAMBIO NO ES RETROACTIVO: quien no acepta la v2 sigue con la v1, y preguntar por un
 *      instante pasado devuelve lo que había ENTONCES.
 *   3. Una versión es un TEXTO: v3 con dos juegos de cláusulas es 409, y lo aceptado por una parte
 *      no se reescribe bajo la misma versión.
 *   4. La acepta la parte: una firma ajena es 403.
 *   5. Sin alta en el censo no hay términos; si el censo no contesta, se acepta y se dice
 *      `censo_verificado: false` (no se inventa ni el alta ni el bloqueo).
 *
 * Ejecutar: node tests/unit/bocaos__terminos-parte.test.js
 */

const assert = require('assert');
const TerminosParte = require('../../modules/bocaos/terminos-parte/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const RIDER = 'rid-1';
const T0 = Date.parse('2026-11-03T09:00:00.000Z');
const T = (min) => new Date(T0 + min * 60000).toISOString();

const V1 = ['comisión 0,90 € por entrega', 'la propuesta caduca en 20 s', 'pausa libre, sin penalización'];
const V2 = ['comisión 0,95 € por entrega', 'la propuesta caduca en 20 s', 'pausa libre, sin penalización'];

function nuevo({ censo = null } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new TerminosParte();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'fs.read.request') return null;
    if (ev === 'censo-parte.de.request') return censo;
    return null;
  };
  m.plaza_id = PLAZA;
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const aceptar = (m, extra) => m.onAceptarRequest({ request_id: 'a', data: { project_id: PLAZA, ...extra } });
const vigentes = (m, extra) => m.onVigentesRequest({ request_id: 'v', data: { project_id: PLAZA, ...extra } });
const de = (m, extra) => m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, ...extra } });

test('aceptar v1: el hecho sale con versión, hora y cláusulas, y la puerta queda abierta', async () => {
  const { m, eventos } = nuevo();
  const r = await aceptar(m, { parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1, hora: T(0) });

  assert.strictEqual(r.status, 201, JSON.stringify(r.error || {}));
  assert.strictEqual(r.data.aceptacion.version, '1');
  assert.strictEqual(r.data.aceptacion.hora, T(0));
  assert.strictEqual(r.data.aceptacion.sustituye_a, null);
  assert.deepStrictEqual(r.data.terminos.clausulas, V1);
  assert.deepStrictEqual(r.data.puerta, { propuesta: true, devengo: true });

  const h = eventos('bocaos.terminos_aceptados');
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].p.parte_id, RIDER);
  assert.strictEqual(h[0].p.version, '1');
  assert.ok(h[0].p.huella, 'la huella del texto viaja con el hecho');
});

test('sin términos no hay propuesta ni devengo: 404 con el hueco y la puerta cerrada', async () => {
  const { m } = nuevo();
  const r = await vigentes(m, { parte_id: RIDER });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'TERMINOS_NO_CONSTAN');
  assert.deepStrictEqual(r.error.details.puerta, { propuesta: false, devengo: false });
  assert.strictEqual(r.error.details.hueco, 'sin términos aceptados');

  const d = await de(m, { parte_id: RIDER });
  assert.strictEqual(d.status, 404);
  assert.strictEqual(d.error.code, 'TERMINOS_NO_CONSTAN');
});

test('un cambio NO es retroactivo: la v2 no reescribe la v1 y cada instante ve lo suyo', async () => {
  const { m } = nuevo();
  await aceptar(m, { parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1, hora: T(0) });
  const r2 = await aceptar(m, { parte_id: RIDER, tipo: 'rider', version: '2', clausulas: V2, hora: T(60) });
  assert.strictEqual(r2.status, 201);
  assert.strictEqual(r2.data.aceptacion.sustituye_a, '1');

  // Antes de aceptar la v2, esta parte estaba en la v1 — y eso no se puede reescribir.
  const antes = await vigentes(m, { parte_id: RIDER, instante: T(30) });
  assert.strictEqual(antes.status, 200);
  assert.strictEqual(antes.data.terminos.version, '1');
  assert.deepStrictEqual(antes.data.terminos.clausulas, V1, 'las cláusulas de entonces, no las de hoy');

  const despues = await vigentes(m, { parte_id: RIDER, instante: T(90) });
  assert.strictEqual(despues.data.terminos.version, '2');
  assert.deepStrictEqual(despues.data.terminos.clausulas, V2);

  // Y la v1 sigue en el histórico: no se ha reescrito.
  const hist = await de(m, { parte_id: RIDER });
  assert.strictEqual(hist.data.n, 2);
  assert.deepStrictEqual(hist.data.aceptaciones.map((a) => a.version), ['1', '2']);
});

test('quien no acepta la nueva sigue en la vieja, y se dice que está desfasado', async () => {
  const { m } = nuevo();
  await aceptar(m, { parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1, hora: T(0) });
  await aceptar(m, { parte_id: 'rid-2', tipo: 'rider', version: '1', clausulas: V1, hora: T(1) });
  await aceptar(m, { parte_id: 'rid-2', tipo: 'rider', version: '2', clausulas: V2, hora: T(60) });

  const rid1 = await vigentes(m, { parte_id: RIDER, instante: T(90) });
  assert.strictEqual(rid1.data.terminos.version, '1', 'sigue con la vieja: se va sin penalización si no le vale');
  assert.strictEqual(rid1.data.al_dia, false, 'y no se finge que está al día');
  assert.strictEqual(rid1.data.version_ultima, '2');
  assert.deepStrictEqual(rid1.data.puerta, { propuesta: true, devengo: true }, 'la vieja sigue abriendo la puerta');

  const todo = await de(m, {});
  assert.strictEqual(todo.data.versiones.length, 2);
  assert.deepStrictEqual(todo.data.desfasadas.map((x) => x.parte_id), [RIDER]);
});

test('una versión es un TEXTO: v3 con dos juegos de cláusulas es 409, y lo aceptado no se reescribe', async () => {
  const { m } = nuevo();
  const uno = await aceptar(m, { parte_id: RIDER, tipo: 'rider', version: '3', clausulas: V1, hora: T(0) });
  assert.strictEqual(uno.status, 201);

  // Otra parte con la MISMA versión y otro texto: el número ha dejado de significar una cosa.
  const otra = await aceptar(m, { parte_id: 'rid-2', tipo: 'rider', version: '3', clausulas: V2, hora: T(1) });
  assert.strictEqual(otra.status, 409);
  assert.strictEqual(otra.error.code, 'VERSION_CONTRADICHA');

  // La misma parte, misma versión, otro texto: reescribir lo aceptado.
  const reescribe = await aceptar(m, { parte_id: RIDER, tipo: 'rider', version: '3', clausulas: V2, hora: T(2) });
  assert.strictEqual(reescribe.status, 409);
  assert.strictEqual(reescribe.error.code, 'TERMINOS_NO_SE_REESCRIBEN');

  // Y la misma entrada otra vez sí es idempotente.
  const igual = await aceptar(m, { parte_id: RIDER, tipo: 'rider', version: '3', clausulas: V1, hora: T(0) });
  assert.strictEqual(igual.status, 200);
  assert.strictEqual(igual.data.idempotente, true);
});

test('la acepta la parte, no la sala ni el vecino: firma ajena es 403', async () => {
  const { m } = nuevo();
  const vecino = await aceptar(m, {
    parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1, autor: { id: 'rid-2', rol: 'rider' }
  });
  assert.strictEqual(vecino.status, 403);
  assert.strictEqual(vecino.error.code, 'TERMINOS_NO_ES_SUYO');

  const sala = await aceptar(m, {
    parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1, autor: { id: 'sala', rol: 'sala' }
  });
  assert.strictEqual(sala.status, 403, 'la sala no acepta en nombre de nadie');

  const suya = await aceptar(m, {
    parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1, autor: { id: RIDER, rol: 'rider' }
  });
  assert.strictEqual(suya.status, 201);
  assert.strictEqual(suya.data.aceptacion.autor, RIDER);
});

test('sin alta no hay términos; si el censo no contesta, se acepta y se dice que no se pudo verificar', async () => {
  const conCenso = nuevo({ censo: { status: 404, error: { code: 'PARTE_NO_CONSTA' } } });
  const sinAlta = await aceptar(conCenso.m, { parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1 });
  assert.strictEqual(sinAlta.status, 409);
  assert.strictEqual(sinAlta.error.code, 'PARTE_NO_CENSADA');
  assert.strictEqual(conCenso.eventos('bocaos.terminos_aceptados').length, 0, 'y no se escribe nada');

  const conParte = nuevo({ censo: { status: 200, data: { parte: { parte_id: RIDER, tipo: 'rider', estado_alta: 'COMPLETA' } } } });
  const ok = await aceptar(conParte.m, { parte_id: RIDER, version: '1', clausulas: V1 });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.data.aceptacion.censo_verificado, true);
  assert.strictEqual(ok.data.aceptacion.tipo, 'rider', 'el tipo se toma del censo, no se inventa');
  assert.ok(conParte.pedidas.some((p) => p.ev === 'censo-parte.de.request'), 'se PREGUNTA al bus, no se importa');

  const sinCenso = nuevo();   // el bus no contesta
  const solo = await aceptar(sinCenso.m, { parte_id: RIDER, tipo: 'rider', version: '1', clausulas: V1 });
  assert.strictEqual(solo.status, 201, 'un consentimiento no se bloquea porque el censo calle');
  assert.strictEqual(solo.data.aceptacion.censo_verificado, false, 'pero se dice que no se verificó');
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
