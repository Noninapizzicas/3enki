'use strict';

/**
 * escalada-enlace · Q43 — los tres peldaños sin sala humana.
 *
 * Lo que se demuestra:
 *
 *   1. el primer agotado abre a TODOS (30 s), no sube dinero y pide al enlace que vuelva a medir;
 *   2. los siguientes suben la oferta en escalones, sin pasar NUNCA del tope autorizado (bocaos.tarifa);
 *   3. sin tope autorizado no se sube ni un céntimo: se agota y se dice por qué;
 *   4. llegar al tope también agota: no se paga con dinero que nadie autorizó;
 *   5. al agotarse hay `escalada_agotada` + `pedido_sin_reparto` UNA vez, y se pide la cancelación
 *      explícita al custodio del pedido;
 *   6. con contrato creado, la escalada de ese pedido se limpia (no sigue subiendo por detrás).
 *
 * Ejecutar: node tests/unit/bocaos__escalada-enlace.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const EscaladaEnlace = require('../../modules/bocaos/escalada-enlace/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const PEDIDO = 'ped-1';

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
    bus.publicados.push({ ev: `→ ${ev}`, p: { ...payload } });
    return new Promise((resolve) => {
      const fn = respuestas[ev];
      const timer = setTimeout(() => { unsub(); resolve({ status: 504, error: { code: 'SIN_RESPUESTA', message: ev } }); }, 80);
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

function montar({ oferta = 450, zona = 'centro' } = {}) {
  const bus = crearBus();
  const disco = new Map();
  bus.subscribe('fs.read.request', (e) => {
    const k = `${e.data.project_id}|${e.data.path}`;
    if (!disco.has(k)) return bus.publish('fs.read.response', { request_id: e.data.request_id, status: 404 });
    bus.publish('fs.read.response', { request_id: e.data.request_id, status: 200, content: disco.get(k) });
  });
  bus.subscribe('fs.write.request', (e) => {
    disco.set(`${e.data.project_id}|${e.data.path}`, e.data.content);
    bus.publish('fs.write.response', { request_id: e.data.request_id, status: 200 });
  });

  const rpc = crearRpc(bus, {
    'pedido.de.request': () => ({
      status: 200,
      data: { pedido: { pedido_id: PEDIDO, plaza_id: PLAZA, tienda_id: 'tienda-paco', zona, oferta_reparto_cents: oferta } }
    }),
    'pedido.cancelar.request': () => ({ status: 200, data: { pedido_id: PEDIDO, estado: 'CANCELADO' } })
  });

  const m = new EscaladaEnlace();
  m.name = 'escalada-enlace';
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = rpc;
  m.plaza_id = PLAZA;

  const man = JSON.parse(fs.readFileSync(path.join(RAIZ, 'escalada-enlace', 'module.json'), 'utf8'));
  for (const sub of man.subscribes) {
    const fn = m[sub.handler];
    if (typeof fn !== 'function') throw new Error(`escalada-enlace: el handler ${sub.handler} no existe`);
    bus.subscribe(sub.event, fn.bind(m));
  }

  bus.publish('project.activated', { project_id: PLAZA });
  return { bus, m, rpc, disco };
}

async function agotado(bus) {
  bus.publish('bocaos.enlace_agotado', {
    plaza_id: PLAZA,
    pedido_id: PEDIDO,
    razones: [{ rider_id: 'rid-1', razon: 'no pasa:cobra' }, { rider_id: 'rid-2', razon: 'no pasa:desvio' }],
    huecos: [],
    horizonte_s: 20
  });
  await bus.drenar();
}

test('el primer agotado abre a todos, con la misma oferta, y pide reintento', async () => {
  const { bus } = montar();
  await agotado(bus);

  const p = bus.eventos('bocaos.escalada_peldano');
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].p.peldano, 1);
  assert.strictEqual(p[0].p.segundos, 30, 'Q43: 30 s para los activos de la zona');
  assert.strictEqual(p[0].p.nuevo_tope, null, 'el peldaño 1 no sube dinero');
  assert.strictEqual(p[0].p.oferta_cents, 450);
  assert.strictEqual(p[0].p.zona, 'centro');

  const r = bus.eventos('bocaos.escalada_reintentar');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].p.pedido_id, PEDIDO);
  assert.strictEqual(r[0].p.oferta_cents, 450);
  assert.deepStrictEqual(r[0].p.excluir, [], 'abrir a todos es no excluir a nadie');
  assert.strictEqual(r[0].p.todos, true);
});

test('los siguientes peldaños suben la oferta por escalones, sin pasar del tope autorizado', async () => {
  const { bus } = montar();
  bus.publish('bocaos.tarifa', { plaza_id: PLAZA, pedido_id: PEDIDO, tope_cents: 600, escalon_cents: 50, autor: 'cliente' });
  await bus.drenar();

  await agotado(bus);   // peldaño 1
  await agotado(bus);   // 500
  await agotado(bus);   // 550
  await agotado(bus);   // 600
  await agotado(bus);   // tope → agotada

  const p = bus.eventos('bocaos.escalada_peldano');
  assert.deepStrictEqual(p.map((x) => x.p.peldano), [1, 2, 3, 4]);
  assert.deepStrictEqual(p.map((x) => x.p.nuevo_tope), [null, 500, 550, 600]);
  assert.deepStrictEqual(p.map((x) => x.p.oferta_cents), [450, 450, 500, 550]);

  const reintentos = bus.eventos('bocaos.escalada_reintentar');
  assert.deepStrictEqual(reintentos.map((x) => x.p.oferta_cents), [450, 500, 550, 600]);

  const agotada = bus.eventos('bocaos.escalada_agotada');
  assert.strictEqual(agotada.length, 1);
  assert.ok(agotada[0].p.motivo.includes('tope'), agotada[0].p.motivo);

  const sinReparto = bus.eventos('bocaos.pedido_sin_reparto');
  assert.strictEqual(sinReparto.length, 1, 'cancelación explícita, una vez');
  assert.strictEqual(sinReparto[0].p.pedido_id, PEDIDO);
  assert.strictEqual(sinReparto[0].p.tope_cents, 600);
  assert.strictEqual(sinReparto[0].p.peldano, 5);

  // Y se PIDE la cancelación al custodio del pedido (la escalada no escribe su registro).
  const cancel = bus.publicados.filter((x) => x.ev === '→ pedido.cancelar.request');
  assert.strictEqual(cancel.length, 1);
  assert.strictEqual(cancel[0].p.rol, 'plaza');
  assert.ok(cancel[0].p.motivo.includes('sin reparto'));
});

test('sin tope autorizado no se sube ni un céntimo: se agota y se dice por qué', async () => {
  const { bus } = montar();
  await agotado(bus);
  await agotado(bus);

  const p = bus.eventos('bocaos.escalada_peldano');
  assert.strictEqual(p.length, 1, 'sólo el peldaño 1: sin permiso no hay peldaño de dinero');
  const agotada = bus.eventos('bocaos.escalada_agotada');
  assert.strictEqual(agotada.length, 1);
  assert.ok(agotada[0].p.motivo.includes('tope autorizado'));
  assert.strictEqual(bus.eventos('bocaos.pedido_sin_reparto').length, 1);

  // Repetir el agotado no vuelve a cancelar: el hecho ya está.
  await agotado(bus);
  assert.strictEqual(bus.eventos('bocaos.pedido_sin_reparto').length, 1);
  assert.strictEqual(bus.eventos('bocaos.escalada_agotada').length, 1);
});

test('si el tope ya es la oferta, no hay peldaño de dinero', async () => {
  const { bus } = montar();
  bus.publish('bocaos.tarifa', { plaza_id: PLAZA, pedido_id: PEDIDO, tope_cents: 450 });
  await bus.drenar();
  await agotado(bus);
  await agotado(bus);

  const p = bus.eventos('bocaos.escalada_peldano');
  assert.strictEqual(p.length, 1);
  assert.ok(bus.eventos('bocaos.escalada_agotada')[0].p.motivo.includes('tope'));
});

test('con contrato creado la escalada se limpia y el siguiente pedido empieza por el peldaño 1', async () => {
  const { bus } = montar();
  bus.publish('bocaos.tarifa', { plaza_id: PLAZA, pedido_id: PEDIDO, tope_cents: 600, escalon_cents: 50 });
  await bus.drenar();
  await agotado(bus);
  await agotado(bus);
  assert.strictEqual(bus.eventos('bocaos.escalada_peldano').length, 2);

  bus.publish('bocaos.contrato_creado', { plaza_id: PLAZA, pedido_id: PEDIDO, rider_id: 'rid-3', contrato_id: 'ct-1' });
  await bus.drenar();

  // Otro pedido del mismo proyecto no hereda el peldaño del anterior.
  bus.publish('bocaos.enlace_agotado', {
    plaza_id: PLAZA, pedido_id: 'ped-2', razones: [], huecos: [], horizonte_s: 20
  });
  await bus.drenar();
  const p = bus.eventos('bocaos.escalada_peldano');
  assert.strictEqual(p[p.length - 1].p.pedido_id, 'ped-2');
  assert.strictEqual(p[p.length - 1].p.peldano, 1, 'cada pedido empieza por el principio');
  assert.strictEqual(bus.eventos('bocaos.escalada_agotada').length, 0);
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
