'use strict';
// Test unitario del reflejo orquestador_cola (PASO 3) — invariantes del ciclo.
// Se instancia la clase y se conducen las proyecciones directamente (payload
// plano, igual que hace _atender de la base). El reflejo compone cola_modelos +
// motor_propuesta por bus (_rpc), así que se inyecta un eventBus fake que replica
// el patrón real de _rpc: subscribe(responseEvent) + publish(requestEvent) y
// responde al .response con el request_id correlado.

const assert = require('assert');
const OrquestadorColaReflejo = require('../../modules/orquestador_cola/index.js');

const PID = 'pid-test';
const ok = (r, status) => { assert.strictEqual(r.status, status, JSON.stringify(r)); return r; };
const dataDe = (r) => r.data;

let fails = 0;
async function check(nombre, fn) {
  try { await fn(); console.log('  [OK]', nombre); }
  catch (e) { fails++; console.log('  [FALLA]', nombre, '—', e.message); }
}

// ── eventBus fake que replica el patrón real de _rpc ──
// _rpc hace: subscribe(responseEvent, fn) + publish(requestEvent, {request_id,...}).
// El fake guarda el handler por responseEvent y, al publicar el requestEvent,
// invoca el handler del .response con {request_id, ...respuesta}.
// `respuestas` mapea requestEvent → función(payload) → respuesta (objeto plano).
function makeBus(respuestas) {
  const publicados = [];
  const handlers = {}; // responseEvent → fn
  return {
    publicados,
    subscribe(ev, fn) { handlers[ev] = fn; return () => { delete handlers[ev]; }; },
    publish(ev, payload) {
      publicados.push({ ev, payload });
      // si es un request, responder al .response correlado
      if (ev.endsWith('.request')) {
        const respEv = ev.slice(0, -'.request'.length) + '.response';
        const fn = respuestas[ev];
        const h = handlers[respEv];
        if (fn && h) {
          const respuesta = fn(payload);
          // el envelope real del bus: el payload va DENTRO de event.data (con request_id)
          h({ data: { request_id: payload.request_id, ...respuesta } });
        }
      }
    }
  };
}

async function main() {
  const m = new OrquestadorColaReflejo();
  m.logger = { info() {}, error() {} };
  m.metrics = { increment() {} };

  console.log('orquestador_cola — invariantes del ciclo');

  // ── Caso 1: cola vacía → ociosa explícita + evento cola.ociosa (n.º 1) ──
  await check('cola vacía → ociosa() con causa + evento cola.ociosa', async () => {
    const bus = makeBus({
      'motor_propuesta.proponer_siguiente.request': () => ({ status: 200, data: { propuesta: null, causa: 'cola_vacia' } })
    });
    m.eventBus = bus;
    const r = await m._alLiberarse({ project_id: PID });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ocupacion, 'ociosa');
    assert.strictEqual(r.data.causa, 'cola_vacia');
    assert.ok(bus.publicados.some(p => p.ev === 'cola.ociosa'), 'debe emitir cola.ociosa');
  });

  // ── Caso 2: hay candidato → pasa a IMPRIMIENDO (n.º 11: ciclo cerrado) ──
  await check('candidato pendiente → ocupacion imprimiendo + evento propuesta', async () => {
    const modelo = { id: 'mod_1', nombre: 'Shelf', prioridad: 5, estado: 'PENDIENTE' };
    const bus = makeBus({
      'motor_propuesta.proponer_siguiente.request': () => ({ status: 200, data: { propuesta: modelo, causa: 'ok' } }),
      'cola_modelos.actualizar_estado.request': () => ({ status: 200, data: { modelo: { ...modelo, estado: 'IMPRIMIENDO' } } })
    });
    m.eventBus = bus;
    const r = await m._alLiberarse({ project_id: PID });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ocupacion, 'imprimiendo');
    assert.strictEqual(r.data.modelo.id, 'mod_1');
    assert.ok(bus.publicados.some(p => p.ev === 'cola.propuesta.siguiente'));
  });

  // ── Caso 3: el custodio rechaza (singleton ocupado) → reintenta con el siguiente (n.º 5/6) ──
  await check('rechazo del custodio → reintenta con el siguiente candidato', async () => {
    const modeloA = { id: 'mod_a', nombre: 'A', prioridad: 5, estado: 'PENDIENTE' };
    const modeloB = { id: 'mod_b', nombre: 'B', prioridad: 3, estado: 'PENDIENTE' };
    let llamadas = 0;
    const bus = makeBus({
      'motor_propuesta.proponer_siguiente.request': () => {
        llamadas++;
        return { status: 200, data: { propuesta: llamadas === 1 ? modeloA : modeloB, causa: 'ok' } };
      },
      'cola_modelos.actualizar_estado.request': (p) => {
        if (p.id === 'mod_a') return { status: 409, error: { code: 'CONFLICT_STATE', message: 'ya_hay_una_pieza_imprimiendo' } };
        return { status: 200, data: { modelo: { ...modeloB, estado: 'IMPRIMIENDO' } } };
      }
    });
    m.eventBus = bus;
    const r = await m._alLiberarse({ project_id: PID });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ocupacion, 'imprimiendo');
    assert.strictEqual(r.data.modelo.id, 'mod_b');
    assert.ok(bus.publicados.some(p => p.ev === 'cola.propuesta.rechazada'), 'debe emitir cola.propuesta.rechazada');
  });

  // ── Caso 4: al_terminar_impresion → IMPRESO + encadena al_liberarse (n.º 11) ──
  await check('al_terminar_impresion marca IMPRESO y encadena el siguiente', async () => {
    const modelo = { id: 'mod_1', nombre: 'Shelf', prioridad: 5, estado: 'IMPRIMIENDO' };
    const bus = makeBus({
      'cola_modelos.actualizar_estado.request': (p) => {
        if (p.estado === 'IMPRESO') return { status: 200, data: { modelo: { ...modelo, estado: 'IMPRESO' } } };
        return { status: 200, data: { modelo: { ...modelo, estado: 'IMPRIMIENDO' } } };
      },
      'motor_propuesta.proponer_siguiente.request': () => ({ status: 200, data: { propuesta: null, causa: 'cola_vacia' } })
    });
    m.eventBus = bus;
    const r = await m._alTerminarImpresion({ project_id: PID, id: 'mod_1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ocupacion, 'ociosa');
    assert.strictEqual(r.data.causa, 'sin_candidatos_pendientes');
  });

  // ── Caso 5: al_terminar_impresion con más pendientes → sigue imprimiendo (n.º 11) ──
  await check('al_terminar_impresion con más pendientes → sigue imprimiendo', async () => {
    const modelo = { id: 'mod_1', nombre: 'Shelf', prioridad: 5, estado: 'IMPRIMIENDO' };
    const siguiente = { id: 'mod_2', nombre: 'Shelf2', prioridad: 4, estado: 'PENDIENTE' };
    const bus = makeBus({
      'cola_modelos.actualizar_estado.request': (p) => {
        if (p.estado === 'IMPRESO') return { status: 200, data: { modelo: { ...modelo, estado: 'IMPRESO' } } };
        return { status: 200, data: { modelo: { ...siguiente, estado: 'IMPRIMIENDO' } } };
      },
      'motor_propuesta.proponer_siguiente.request': () => ({ status: 200, data: { propuesta: siguiente, causa: 'ok' } })
    });
    m.eventBus = bus;
    const r = await m._alTerminarImpresion({ project_id: PID, id: 'mod_1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.ocupacion, 'imprimiendo');
    assert.strictEqual(r.data.modelo.id, 'mod_2');
  });

  // ── Caso 6: fallo al arrancar (motor no responde) → UPSTREAM_UNREACHABLE, no silencio ──
  await check('motor no responde → UPSTREAM_UNREACHABLE (nunca silencio)', async () => {
    const bus = makeBus({}); // sin handlers → _rpc resuelve null
    m.eventBus = bus;
    const r = await m._alLiberarse({ project_id: PID });
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
  });

  // ── Caso 7: sin project_id → INVALID_INPUT ──
  await check('sin project_id → INVALID_INPUT', async () => {
    const r = await m._alLiberarse({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
  });

  console.log(fails === 0 ? '\nTEST OK — todas las invariantes pasan.' : `\nTEST FALLA — ${fails} chequeo(s) fallido(s).`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('ERROR en test:', e); process.exit(1); });
