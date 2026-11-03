'use strict';

/**
 * canal-rider · Q42 + A15 — el último tramo, con un transporte de MENTIRA y sin token.
 *
 * Lo que se demuestra y no se puede demostrar con un stub del módulo entero:
 *
 *   1. la propuesta sale al chat que dice el CENSO (estado-parte, por el bus), no a uno inventado;
 *   2. se entrega UNA vez: republicar el hecho no vuelve a sonar el móvil;
 *   3. sin chat_id no hay entrega, y se dice el hueco — el canal no decide, no caduca, no cierra;
 *   4. si el transporte dice que no o revienta, hay `no_entregada` con su motivo;
 *   5. la frase del micro-agente manda; si no llega a tiempo, sale la de la propuesta (Q42);
 *   6. el acuse, el sí y el no del móvil se reenvían como propuesta.<op>.request, y los hechos
 *      del custodio (origen 'propuesta') NO se reenvían: no hay bucle ni doble sí.
 *
 * Ejecutar: node tests/unit/bocaos__canal-rider.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CanalRider = require('../../modules/bocaos/canal-rider/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const RIDER = 'rid-1';
const CHAT = '5551234';
const PROP = 'prop-abc123';
const FRASE_PROPIETA = 'Te lo propongo porque pasas a 312 m del local, esperarías 2 min y ganarías 450 céntimos.';

function crearBus() {
  const subs = new Map();
  const publicados = [];
  let pendientes = [];
  return {
    publicados,
    eventos: (ev) => publicados.filter((x) => x.ev === ev),
    subscribe(ev, fn) {
      const a = subs.get(ev) || [];
      a.push(fn);
      subs.set(ev, a);
      return () => subs.set(ev, (subs.get(ev) || []).filter((f) => f !== fn));
    },
    publish(ev, payload) {
      const copia = JSON.parse(JSON.stringify(payload ?? {}));
      publicados.push({ ev, p: copia });
      for (const fn of subs.get(ev) || []) {
        try {
          const r = fn({ data: copia });
          if (r && typeof r.then === 'function') pendientes.push(r);
        } catch (err) { pendientes.push(Promise.reject(err)); }
      }
    },
    async drenar() {
      for (let vueltas = 0; vueltas < 200 && pendientes.length > 0; vueltas += 1) {
        const lote = pendientes;
        pendientes = [];
        await Promise.all(lote);
      }
      if (pendientes.length > 0) throw new Error('el bus no se vacía: ¿un bucle de eventos?');
    }
  };
}

function crearRpc(bus, respuestas = {}) {
  let n = 0;
  return function rpc(ev, payload = {}, opts = {}) {
    const request_id = `rpc-${++n}`;
    const respuesta = ev.endsWith('.request') ? `${ev.slice(0, -8)}.response` : `${ev}.response`;
    bus.publicados.push({ ev: `→ ${ev}`, p: { ...payload, timeout_ms: opts.timeout_ms ?? null } });
    return new Promise((resolve) => {
      const fn = typeof respuestas[ev] === 'function' ? respuestas[ev] : null;
      const timer = setTimeout(() => { unsub(); resolve({ status: 504, error: { code: 'SIN_RESPUESTA', message: ev } }); }, 60);
      const unsub = bus.subscribe(respuesta, (e) => {
        if (e.data?.request_id !== request_id) return;
        clearTimeout(timer);
        unsub();
        resolve(e.data);
      });
      bus.publish(ev, { request_id, ...payload });
      if (fn) {
        Promise.resolve().then(() => fn({ request_id, ...payload })).then((r) => {
          if (r !== undefined) bus.publish(respuesta, { request_id, ...r });
        });
      }
    });
  };
}

const RAIZ = path.join(__dirname, '../../modules/bocaos');

function montar({ chat = CHAT, transporte = { enviar: async () => ({ ok: true, mensaje_id: 7 }) } } = {}) {
  const bus = crearBus();
  const rpc = crearRpc(bus, {
    'estado-parte.de.request': () => chat
      ? { status: 200, data: { parte: { parte_id: RIDER, rider_id: RIDER, chat_id: chat } } }
      : { status: 404, error: { code: 'PARTE_NO_CONSTA' } },
    'propuesta.acuse.request': () => ({ status: 200, data: { propuesta: {} } }),
    'propuesta.aceptar.request': () => ({ status: 200, data: { propuesta: {} } }),
    'propuesta.rechazar.request': () => ({ status: 200, data: { propuesta: {} } })
  });

  const canal = new CanalRider();
  canal.name = 'canal-rider';
  canal.eventBus = bus;
  canal.logger = { info() {}, warn() {}, error() {} };
  canal.metrics = { increment() {} };
  canal._rpc = rpc;
  canal.plaza_id = PLAZA;
  canal.transporte = transporte;
  canal.espera_redaccion_ms = 0;

  const man = JSON.parse(fs.readFileSync(path.join(RAIZ, 'canal-rider', 'module.json'), 'utf8'));
  for (const sub of man.subscribes) {
    const fn = canal[sub.handler];
    if (typeof fn !== 'function') throw new Error(`canal-rider: el handler ${sub.handler} no existe`);
    bus.subscribe(sub.event, fn.bind(canal));
  }

  return { bus, canal, rpc };
}

function emitida(extra = {}) {
  return {
    plaza_id: PLAZA,
    propuesta_id: PROP,
    pedido_id: 'ped-1',
    rider_id: RIDER,
    medidas: { desvio_m: 312, espera_min: 2, retraso_min: 0, cobra_cents: 450 },
    ventana_s: 20,
    expira_en: new Date(Date.now() + 20000).toISOString(),
    vista: { frase: FRASE_PROPIETA },
    ...extra
  };
}

test('la propuesta sale al chat del censo, una sola vez, con su frase', async () => {
  const enviados = [];
  const { bus } = montar({ transporte: { enviar: async (m) => { enviados.push(m); return { ok: true, mensaje_id: 77 }; } } });

  bus.publish('bocaos.propuesta_emitida', emitida());
  await bus.drenar();

  assert.strictEqual(enviados.length, 1, 'un solo envío');
  assert.strictEqual(enviados[0].chat_id, CHAT, 'el chat sale del censo, no del evento');
  assert.strictEqual(enviados[0].texto, FRASE_PROPIETA);
  assert.strictEqual(enviados[0].propuesta_id, PROP);
  assert.deepStrictEqual(enviados[0].teclado.map((b) => b.accion), ['aceptar', 'rechazar']);

  const entregadas = bus.eventos('bocaos.propuesta_entregada');
  assert.strictEqual(entregadas.length, 1);
  assert.strictEqual(entregadas[0].p.chat_id, CHAT);
  assert.strictEqual(entregadas[0].p.mensaje_id, 77);
  assert.strictEqual(entregadas[0].p.canal, 'rider');

  // Republicar el hecho no vuelve a sonar el móvil.
  bus.publish('bocaos.propuesta_emitida', emitida());
  await bus.drenar();
  assert.strictEqual(enviados.length, 1, 'idempotente: no hay doble entrega');
  assert.strictEqual(bus.eventos('bocaos.propuesta_entregada').length, 1);
});

test('sin chat_id en el censo no hay entrega: se nombra el hueco y no se llama al transporte', async () => {
  let llamadas = 0;
  const { bus } = montar({ chat: null, transporte: { enviar: async () => { llamadas += 1; return { ok: true }; } } });

  bus.publish('bocaos.propuesta_emitida', emitida({ vista: undefined }));
  await bus.drenar();

  assert.strictEqual(llamadas, 0);
  assert.strictEqual(bus.eventos('bocaos.propuesta_entregada').length, 0);
  const no = bus.eventos('bocaos.propuesta_no_entregada');
  assert.strictEqual(no.length, 1);
  assert.strictEqual(no[0].p.hueco, 'sin chat_id');
  assert.ok(no[0].p.motivo.includes('chat_id'));
  // El canal NO decide: no caduca ni cierra la propuesta.
  assert.strictEqual(bus.eventos('bocaos.propuesta_caducada_sin_acuse').length, 0);
});

test('si el transporte dice que no o revienta, hay no_entregada con su motivo', async () => {
  const { bus } = montar({ transporte: { enviar: async () => ({ ok: false, motivo: 'telegram 403' }) } });
  bus.publish('bocaos.propuesta_emitida', emitida());
  await bus.drenar();
  const no = bus.eventos('bocaos.propuesta_no_entregada');
  assert.strictEqual(no.length, 1);
  assert.strictEqual(no[0].p.motivo, 'telegram 403');

  const segundo = montar({ transporte: { enviar: async () => { throw new Error('sin red'); } } });
  segundo.bus.publish('bocaos.propuesta_emitida', emitida());
  await segundo.bus.drenar();
  const no2 = segundo.bus.eventos('bocaos.propuesta_no_entregada');
  assert.strictEqual(no2.length, 1);
  assert.strictEqual(no2[0].p.motivo, 'sin red');
  assert.strictEqual(segundo.bus.eventos('bocaos.propuesta_entregada').length, 0);
});

test('Q42: la frase del micro-agente manda; si no llega a tiempo, sale la de la propuesta', async () => {
  // 1 · la redacción ya estaba (llegó antes que la resolución del chat).
  const enviados = [];
  const a = montar({ transporte: { enviar: async (m) => { enviados.push(m); return { ok: true }; } } });
  a.canal.espera_redaccion_ms = 5000;
  a.bus.publish('bocaos.propuesta_redactada', { plaza_id: PLAZA, propuesta_id: PROP, frase: 'Recoge en el local, 312 m de más. Ganas 4,50 € netos. Tienes 10 s.' });
  await a.bus.drenar();
  a.bus.publish('bocaos.propuesta_emitida', emitida());
  await a.bus.drenar();
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].texto, 'Recoge en el local, 312 m de más. Ganas 4,50 € netos. Tienes 10 s.');

  // 2 · la redacción no llega: no se espera más de la cuenta, sale el suelo de la propuesta.
  const enviados2 = [];
  const b = montar({ transporte: { enviar: async (m) => { enviados2.push(m); return { ok: true }; } } });
  b.canal.espera_redaccion_ms = 40;
  b.bus.publish('bocaos.propuesta_emitida', emitida());
  await new Promise((r) => setTimeout(r, 90));
  assert.strictEqual(enviados2.length, 1, 'se entrega aunque la redacción no llegue');
  assert.strictEqual(enviados2[0].texto, FRASE_PROPIETA);
  assert.strictEqual(b.bus.eventos('bocaos.propuesta_entregada').length, 1);
});

test('la puerta del transporte: el acuse entra por RPC, queda en el bus y se aplica UNA vez', async () => {
  const { bus, rpc } = montar();
  const HORA = '2026-11-03T08:00:00.000Z';

  const r = await rpc('canal-rider.recibir.request', { project_id: PLAZA, plaza_id: PLAZA, propuesta_id: PROP, rider_id: RIDER, accion: 'acuse', hora: HORA });
  await bus.drenar();

  assert.strictEqual(r.status, 200, JSON.stringify(r));
  const voz = bus.eventos('bocaos.propuesta_acuse');
  assert.strictEqual(voz.length, 1, 'el acuse queda en el bus: es la voz del móvil');
  assert.strictEqual(voz[0].p.via, 'movil');
  assert.strictEqual(voz[0].p.propuesta_id, PROP);

  // Y se le pide UNA vez al custodio (el hecho que el canal acaba de publicar no lo reenvía otra vez).
  assert.strictEqual(bus.publicados.filter((x) => x.ev === '→ propuesta.acuse.request').length, 1);

  // El mismo acuse otra vez (reintento del móvil) no reabre el reloj.
  const r2 = await rpc('canal-rider.recibir.request', { project_id: PLAZA, plaza_id: PLAZA, propuesta_id: PROP, rider_id: RIDER, accion: 'acuse', hora: HORA });
  await bus.drenar();
  assert.strictEqual(r2.data.idempotente, true);
  assert.strictEqual(bus.eventos('bocaos.propuesta_acuse').length, 1);
  assert.strictEqual(bus.publicados.filter((x) => x.ev === '→ propuesta.acuse.request').length, 1);

  // Una acción que no existe no se traga: se dice.
  const mal = await rpc('canal-rider.recibir.request', { project_id: PLAZA, propuesta_id: PROP, accion: 'bailar' });
  await bus.drenar();
  assert.strictEqual(mal.status, 400);
  assert.strictEqual(bus.eventos('canal-rider.recibir.failed').length, 1, 'el rechazo también está en el bus');
});

test('la vuelta: acuse, sí y no se reenvían al bus; los hechos del custodio se ignoran', async () => {
  const { bus } = montar();

  bus.publish('bocaos.propuesta_acuse', { plaza_id: PLAZA, propuesta_id: PROP, rider_id: RIDER, hora: new Date().toISOString(), origen: 'movil' });
  bus.publish('bocaos.propuesta_aceptada', { plaza_id: PLAZA, propuesta_id: PROP, rider_id: RIDER, hora: new Date().toISOString(), origen: 'movil' });
  bus.publish('bocaos.propuesta_rechazada', { plaza_id: PLAZA, propuesta_id: PROP, rider_id: RIDER, motivo: 'lejos', origen: 'movil' });
  await bus.drenar();

  const llamadas = bus.publicados.filter((x) => x.ev.startsWith('→ propuesta.'));
  assert.deepStrictEqual(llamadas.map((x) => x.ev), [
    '→ propuesta.acuse.request',
    '→ propuesta.aceptar.request',
    '→ propuesta.rechazar.request'
  ]);
  assert.strictEqual(llamadas[0].p.propuesta_id, PROP);
  assert.strictEqual(llamadas[0].p.rider_id, RIDER);
  // El reenvío lleva hora: sin hora, el custodio no puede medir el reloj de decisión.
  assert.ok(llamadas[0].p.hora, 'el acuse viaja con hora');
  assert.strictEqual(llamadas[2].p.motivo, 'lejos');

  // El hecho del custodio (origen 'propuesta') NO se reenvía: sería un bucle y un doble sí.
  const antes = bus.publicados.filter((x) => x.ev.startsWith('→ propuesta.')).length;
  bus.publish('bocaos.propuesta_aceptada', { plaza_id: PLAZA, propuesta_id: PROP, rider_id: RIDER, origen: 'propuesta', medidas: { cobra_cents: 450 } });
  await bus.drenar();
  assert.strictEqual(bus.publicados.filter((x) => x.ev.startsWith('→ propuesta.')).length, antes);
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
