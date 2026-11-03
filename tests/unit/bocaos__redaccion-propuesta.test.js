'use strict';

/**
 * redaccion-propuesta · A18 — la frase del rider: plantilla determinista y adorno que se descarta.
 *
 * Lo que se demuestra:
 *
 *   1. sin LLM, la frase sale de la plantilla con los números del EVENTO (ni uno inventado);
 *   2. el nombre del local se PIDE al bus (hecho-listo); si no contesta, se dice «el local»;
 *   3. un LLM que sólo usa cifras del evento se acepta y se firma fuente 'llm';
 *   4. un LLM que INVENTA una cifra se descarta, se dice por qué y sale la plantilla: siempre hay frase;
 *   5. un LLM que falla o se cuelga tampoco deja al rider sin frase (timeout).
 *
 * Ejecutar: node tests/unit/bocaos__redaccion-propuesta.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RedaccionPropuesta = require('../../modules/bocaos/redaccion-propuesta/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const PROP = 'prop-abc123';

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
    return new Promise((resolve) => {
      const fn = respuestas[ev];
      const timer = setTimeout(() => { unsub(); resolve({ status: 504, error: { code: 'SIN_RESPUESTA', message: ev } }); }, Math.min(opts.timeout_ms ?? 400, 400));
      const unsub = bus.subscribe(respuesta, (e) => {
        if (e.data?.request_id !== request_id) return;
        clearTimeout(timer);
        unsub();
        resolve(e.data);
      });
      bus.publish(ev, { request_id, ...payload });
      if (typeof fn === 'function') {
        Promise.resolve().then(() => fn({ request_id, ...payload })).then((r) => {
          if (r !== undefined) bus.publish(respuesta, { request_id, ...r });
        });
      }
    });
  };
}

const RAIZ = path.join(__dirname, '../../modules/bocaos');

function montar({ local = null, llm = null, llm_timeout_ms = 200 } = {}) {
  const bus = crearBus();
  const rpc = crearRpc(bus, {
    'hecho-listo.de.request': () => local
      ? { status: 200, data: { hecho: { pedido_id: 'ped-1', local, zona: 'centro' } } }
      : { status: 404, error: { code: 'NO_CONSTA' } }
  });

  const m = new RedaccionPropuesta();
  m.name = 'redaccion-propuesta';
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = rpc;
  m.plaza_id = PLAZA;
  m.llm = llm;
  m.llm_timeout_ms = llm_timeout_ms;

  const man = JSON.parse(fs.readFileSync(path.join(RAIZ, 'redaccion-propuesta', 'module.json'), 'utf8'));
  for (const sub of man.subscribes) {
    const fn = m[sub.handler];
    if (typeof fn !== 'function') throw new Error(`redaccion-propuesta: el handler ${sub.handler} no existe`);
    bus.subscribe(sub.event, fn.bind(m));
  }
  return { bus, m, rpc };
}

function emitida(extra = {}) {
  return {
    plaza_id: PLAZA,
    propuesta_id: PROP,
    pedido_id: 'ped-1',
    rider_id: 'rid-1',
    medidas: { desvio_m: 312, espera_min: 2, retraso_min: 0, cobra_cents: 450 },
    ventana_s: 20,
    expira_en: new Date(Date.now() + 20000).toISOString(),
    ...extra
  };
}

const PLANTILLA = 'Recoge en el local, 312 m de más. Ganas 4,50 € netos. Tienes 10 s.';

test('sin LLM la frase es la plantilla con los números del evento', async () => {
  const { bus } = montar();
  bus.publish('bocaos.propuesta_emitida', emitida());
  await bus.drenar();

  const r = bus.eventos('bocaos.propuesta_redactada');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].p.frase, PLANTILLA);
  assert.strictEqual(r[0].p.fuente, 'plantilla');
  assert.strictEqual(r[0].p.propuesta_id, PROP);
  assert.strictEqual(r[0].p.cifras.desvio_m, 312);
  assert.strictEqual(r[0].p.cifras.margen_cents, 450);
  assert.strictEqual(r[0].p.validador.ok, true, 'la plantilla no inventa nada');
  assert.strictEqual(bus.eventos('bocaos.propuesta_redaccion_descartada').length, 0);
});

test('el local se pregunta al bus y, si no contesta, se dice «el local»', async () => {
  const conLocal = montar({ local: 'Pizzería Paco' });
  conLocal.bus.publish('bocaos.propuesta_emitida', emitida());
  await conLocal.bus.drenar();
  assert.strictEqual(conLocal.bus.eventos('bocaos.propuesta_redactada')[0].p.frase,
    'Recoge en Pizzería Paco, 312 m de más. Ganas 4,50 € netos. Tienes 10 s.');

  const sinLocal = montar();
  sinLocal.bus.publish('bocaos.propuesta_emitida', emitida());
  await sinLocal.bus.drenar();
  assert.ok(sinLocal.bus.eventos('bocaos.propuesta_redactada')[0].p.frase.startsWith('Recoge en el local'));
  // No inventa un nombre ni un precio: los números son los del evento.
  assert.strictEqual(sinLocal.bus.eventos('bocaos.propuesta_redactada')[0].p.tienda, 'el local');
});

test('el margen es el NETO si el evento lo trae', async () => {
  const { bus } = montar();
  bus.publish('bocaos.propuesta_emitida', emitida({
    medidas: { desvio_m: 312, espera_min: 2, retraso_min: 0, cobra_cents: 450, neto_cents: 380 }
  }));
  await bus.drenar();
  assert.strictEqual(bus.eventos('bocaos.propuesta_redactada')[0].p.frase,
    'Recoge en el local, 312 m de más. Ganas 3,80 € netos. Tienes 10 s.');
});

test('un adorno que sólo usa cifras del evento se acepta', async () => {
  const llm = async ({ plantilla }) => `${plantilla} Sin prisa, pero sin pausa.`;
  const { bus } = montar({ llm });
  bus.publish('bocaos.propuesta_emitida', emitida());
  await bus.drenar();

  const r = bus.eventos('bocaos.propuesta_redactada');
  assert.strictEqual(r[0].p.fuente, 'llm');
  assert.ok(r[0].p.frase.startsWith(PLANTILLA));
  assert.strictEqual(r[0].p.validador.ok, true);
  assert.strictEqual(bus.eventos('bocaos.propuesta_redaccion_descartada').length, 0);
});

test('un adorno que INVENTA una cifra se descarta y sale la plantilla: siempre hay frase', async () => {
  const llm = async () => 'Recoge en el local, 312 m de más. Ganas 9,90 € netos en 7 minutos. Corriendo.';
  const { bus } = montar({ llm });
  bus.publish('bocaos.propuesta_emitida', emitida());
  await bus.drenar();

  const r = bus.eventos('bocaos.propuesta_redactada');
  assert.strictEqual(r.length, 1, 'hay UNA frase, pase lo que pase');
  assert.strictEqual(r[0].p.frase, PLANTILLA);
  assert.strictEqual(r[0].p.fuente, 'plantilla');

  const d = bus.eventos('bocaos.propuesta_redaccion_descartada');
  assert.strictEqual(d.length, 1);
  assert.ok(d[0].p.motivo.includes('inventa'));
  assert.deepStrictEqual(d[0].p.cifras_inventadas, [9.9, 7]);
});

test('un adorno que falla o se cuelga no deja al rider sin frase', async () => {
  const falla = montar({ llm: async () => { throw new Error('sin cuota'); } });
  falla.bus.publish('bocaos.propuesta_emitida', emitida());
  await falla.bus.drenar();
  assert.strictEqual(falla.bus.eventos('bocaos.propuesta_redactada')[0].p.frase, PLANTILLA);
  assert.ok(falla.bus.eventos('bocaos.propuesta_redaccion_descartada')[0].p.motivo.includes('sin cuota'));

  const cuelga = montar({ llm: () => new Promise(() => {}), llm_timeout_ms: 30 });
  cuelga.bus.publish('bocaos.propuesta_emitida', emitida());
  await cuelga.bus.drenar();
  assert.strictEqual(cuelga.bus.eventos('bocaos.propuesta_redactada')[0].p.frase, PLANTILLA);
  assert.strictEqual(cuelga.bus.eventos('bocaos.propuesta_redactada')[0].p.fuente, 'plantilla');
  assert.ok(cuelga.bus.eventos('bocaos.propuesta_redaccion_descartada')[0].p.motivo.includes('tardó'));
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
