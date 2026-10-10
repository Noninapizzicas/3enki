/**
 * Tests unitarios para nichos/clasificador-intencion — EL CABLE DE LA OREJA.
 *
 * Regresión del fallo que cortaba el bot de la vertical: onLoad suscribía
 * 'llm.complete.response' ANTES de super.onLoad, y en ese punto this.eventBus
 * aún es undefined (lo asigna la base) → el optional-chaining tragaba la
 * suscripción EN SILENCIO. El módulo pedía al LLM, la respuesta llegaba, y
 * jamás se resolvía el pendiente: timeout de 30 s y
 * nichos.intencion.clasificada.failed. La cadena reflectiva nunca arrancaba.
 *
 * Ejecutar con: node tests/unit/nichos__clasificador-intencion.test.js
 */

const assert = require('assert');
const ClasificadorIntencion = require('../../modules/nichos/clasificador-intencion');

const fallos = [];
async function test(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}\n  ${error.message}`); fallos.push(description); }
}

// ── Bus de mentira: registra handlers y publicaciones, y reparte los eventos
//    envueltos como { data } (que es como los leen los módulos). ──────────────
function busFalso() {
  const handlers = new Map();
  const publicados = [];
  return {
    handlers, publicados,
    subscribe(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); return () => {}; },
    publish(ev, payload) {
      publicados.push({ ev, payload });
      for (const fn of handlers.get(ev) || []) fn({ data: payload });
    },
    emitir(ev, payload) { for (const fn of handlers.get(ev) || []) fn({ data: payload }); },
    ultimo(ev) { return [...publicados].reverse().find(p => p.ev === ev); }
  };
}

async function main() {
  console.log('\n🧪 Running clasificador-intencion Tests\n');

  // ── EL TEST DE REGRESIÓN ──────────────────────────────────────────────────
  // Antes del fix: onLoad no dejaba ningún handler en 'llm.complete.response'.
  let mod, bus;
  const arrancar = async () => {
    bus = busFalso();
    mod = new ClasificadorIntencion();
    await mod.onLoad({ logger: { info() {}, warn() {}, error() {} }, eventBus: bus, metrics: null });
    // El loader cablea los handlers declarados en module.json.subscribes
    // (auto-wire declarativo) — aquí lo imitamos para el único que nos toca.
    bus.subscribe('nichos.canal.mensaje.recibido', (e) => mod.onMensajeRecibido(e));
  };
  await arrancar();

  await test('onLoad deja suscrito llm.complete.response (el fix: super.onLoad ANTES del subscribe)', () => {
    const hs = bus.handlers.get('llm.complete.response');
    assert.ok(hs && hs.length === 1, 'nadie escucha llm.complete.response → la respuesta del LLM se pierde');
  });

  await test('mensaje del canal → pide clasificación al LLM con el project_id del bot', () => {
    bus.emitir('nichos.canal.mensaje.recibido', {
      project_id: 'e4bcbab9-654a-41e2-9bbd-bde6c2744379',
      mensaje_entrante: 'quiero montar un taller de bicis eléctricas en Lorca'
    });
    const req = bus.ultimo('llm.complete.request');
    assert.ok(req, 'no pidió clasificación');
    assert.strictEqual(req.payload.project_id, 'e4bcbab9-654a-41e2-9bbd-bde6c2744379');
    assert.ok(req.payload.request_id, 'sin request_id no hay correlación posible');
  });

  await test('la respuesta del LLM RESUELVE el pendiente (antes: timeout 30s → .failed)', async () => {
    bus.publicados.length = 0;
    const pendiente = bus.handlers.get('nichos.canal.mensaje.recibido')[0]({ data: {
      project_id: 'e4bcbab9-654a-41e2-9bbd-bde6c2744379', mensaje_entrante: 'otra idea' } });
    const reqId = bus.ultimo('llm.complete.request').payload.request_id;
    bus.emitir('llm.complete.response', { request_id: reqId, content: '{"tipo":"SEMILLA","confianza":0.9}' });
    await pendiente;

    const clasif = bus.ultimo('nichos.intencion.clasificada');
    assert.ok(clasif, 'la intención no llegó al bus (el pendiente se quedó colgado)');
    assert.strictEqual(clasif.payload.tipo, 'SEMILLA');
    assert.strictEqual(clasif.payload.confianza, 0.9);
    assert.ok(!bus.ultimo('nichos.intencion.clasificada.failed'), 'saltó el .failed: la correlación no funciona');
  });

  await test('intención SEMILLA → ARRANCA la vertical (semilla.capturar.request)', () => {
    const cap = bus.ultimo('nichos.semilla.capturar.request');
    assert.ok(cap, 'el cable SEMILLA → capturar no existe: la intención moriría en el bus');
    assert.strictEqual(cap.payload.origen, 'telegram');
    assert.strictEqual(cap.payload.project_id, 'e4bcbab9-654a-41e2-9bbd-bde6c2744379');
  });

  await test('intención que NO es SEMILLA → clasifica pero no arranca la vertical', async () => {
    bus.publicados.length = 0;
    const pendiente = bus.handlers.get('nichos.canal.mensaje.recibido')[0]({ data: {
      project_id: 'p1', mensaje_entrante: '¿cómo va todo?' } });
    const reqId = bus.ultimo('llm.complete.request').payload.request_id;
    bus.emitir('llm.complete.response', { request_id: reqId, content: '{"tipo":"CONSULTA","confianza":0.8}' });
    await pendiente;

    assert.strictEqual(bus.ultimo('nichos.intencion.clasificada').payload.tipo, 'CONSULTA');
    assert.ok(!bus.ultimo('nichos.semilla.capturar.request'), 'no debe arrancar la vertical con una consulta');
  });

  await test('respuesta no-JSON → degradación honesta (DESCONOCIDO), no excepción', async () => {
    const pendiente = bus.handlers.get('nichos.canal.mensaje.recibido')[0]({ data: {
      project_id: 'p1', mensaje_entrante: 'bla' } });
    bus.emitir('llm.complete.response', { request_id: bus.ultimo('llm.complete.request').payload.request_id, content: 'vete a saber' });
    await pendiente;
    assert.strictEqual(bus.ultimo('nichos.intencion.clasificada').payload.tipo, 'DESCONOCIDO');
  });

  await test('mensaje sin texto → no molesta al LLM', () => {
    bus.publicados.length = 0;
    bus.emitir('nichos.canal.mensaje.recibido', { project_id: 'p1' });
    assert.ok(!bus.ultimo('llm.complete.request'), 'pidió clasificar la nada');
  });

  console.log(fallos.length ? `\n❌ ${fallos.length} test(s) fallaron` : '\n✅ Todos los tests del clasificador-intencion pasaron');
  process.exit(fallos.length ? 1 : 0);
}

main();
