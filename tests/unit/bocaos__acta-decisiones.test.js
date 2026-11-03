'use strict';

/**
 * bocaos/acta-decisiones — O02. El acta de la plaza: ningún cambio sin acta, y el acta no se corrige.
 *
 * Lo que se vigila:
 *   1. Un acta dice qué cambió, por qué, quién y desde cuándo — o no es acta.
 *   2. EL ACTA NO SE CORRIGE: el mismo id con otro texto es 409 y el texto asentado sigue intacto;
 *      la corrección entra como OTRA acta que nombra a la anterior en `sustituye_a`.
 *   3. La firma lleva ámbito y no se cruza: la plaza no firma por una tienda, ni una tienda por otra.
 *   4. Un dictamen firmado se asienta con el MISMO id que config-mercado usará como acta — por eso
 *      su referencia apunta a un acta que existe.
 *   5. `listar` dice qué regía en un instante, no sólo qué hay hoy.
 *
 * Ejecutar: node tests/unit/bocaos__acta-decisiones.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ActaDecisiones = require('../../modules/bocaos/acta-decisiones/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';
const T0 = Date.parse('2026-11-03T09:00:00.000Z');
const T = (min) => new Date(T0 + min * 60000).toISOString();

// ─── isla sola: bus de mentira, fs que no contesta ───
function nuevo() {
  const publicados = [];
  const m = new ActaDecisiones();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  m.plaza_id = PLAZA;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const asentar = (m, extra) => m.onAsentarRequest({ request_id: 'a', data: { project_id: PLAZA, ...extra } });
const listar = (m, extra) => m.onListarRequest({ request_id: 'l', data: { project_id: PLAZA, ...extra } });

const CAMBIO = { desvio_m: 900 };

test('asienta el acta con qué, por qué, quién, desde y ámbito: y el hecho sale con hora', async () => {
  const { m, eventos } = nuevo();
  const r = await asentar(m, {
    autor: 'duena-de-la-plaza',
    motivo: 'el barrio creció hacia el norte',
    asunto: 'desvío máximo',
    clase: 'J01',
    cambio: CAMBIO,
    desde: T(0),
    esperaba: 'menos propuestas rechazadas por desvío'
  });

  assert.strictEqual(r.status, 201, JSON.stringify(r.error || {}));
  assert.strictEqual(r.data.acta.ambito, 'plaza');
  assert.strictEqual(r.data.acta.autor, 'duena-de-la-plaza');
  assert.strictEqual(r.data.acta.desde, T(0));
  assert.deepStrictEqual(r.data.acta.cambio, CAMBIO);
  assert.deepStrictEqual(r.data.acta.faltantes, [], 'trae lo que un acta tiene que traer');

  const h = eventos('bocaos.acta_asentada');
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].p.acta_id, r.data.acta.acta_id);
  assert.strictEqual(h[0].p.ambito, 'plaza');
  assert.ok(h[0].p.publicado_en, 'un hecho sin hora es una impresión');
});

test('sin motivo no hay acta (400); con dictamen firmado sí, y el hueco del motivo se nombra', async () => {
  const { m } = nuevo();

  const sinMotivo = await asentar(m, { autor: 'duena', cambio: CAMBIO });
  assert.strictEqual(sinMotivo.status, 400);
  assert.strictEqual(sinMotivo.error.code, 'INVALID_INPUT');
  assert.strictEqual(sinMotivo.error.details.field, 'motivo');

  const sinCambio = await asentar(m, { autor: 'duena', motivo: 'porque sí' });
  assert.strictEqual(sinCambio.status, 400);
  assert.strictEqual(sinCambio.error.details.field, 'cambio');

  const sinFirma = await asentar(m, { motivo: 'porque sí', cambio: CAMBIO });
  assert.strictEqual(sinFirma.status, 400);
  assert.strictEqual(sinFirma.error.details.field, 'autor');

  // O04: un dictamen firmado ES la autorización. La firma suple el motivo; el hueco se dice.
  const conDictamen = await m.onAsentarRequest({ request_id: 'd', data: {
    project_id: PLAZA, autor: 'sala', cambio: CAMBIO, dictamen_id: 'dic-1', desde: T(1)
  } });
  assert.strictEqual(conDictamen.status, 201, JSON.stringify(conDictamen.error || {}));
  assert.deepStrictEqual(conDictamen.data.acta.faltantes, ['motivo', 'esperaba']);
  assert.strictEqual(conDictamen.data.acta.dictamen_id, 'dic-1');
});

test('el acta NO se corrige: otro texto con el mismo id es 409 y lo asentado sigue intacto', async () => {
  const { m, eventos } = nuevo();
  const base = { autor: 'duena', motivo: 'el barrio creció', cambio: CAMBIO, desde: T(0), acta_id: 'acta-desvio' };

  const uno = await asentar(m, base);
  assert.strictEqual(uno.status, 201);

  // Mismo contenido, mismo id: idempotente (reenviar no es corregir).
  const dos = await asentar(m, base);
  assert.strictEqual(dos.status, 200);
  assert.strictEqual(dos.data.idempotente, true);
  assert.strictEqual(eventos('bocaos.acta_asentada').length, 1, 'un acta, un hecho');

  // Otro motivo con el mismo id: eso es corregir.
  const corregir = await asentar(m, { ...base, motivo: 'me equivoqué de motivo' });
  assert.strictEqual(corregir.status, 409);
  assert.strictEqual(corregir.error.code, 'ACTA_NO_SE_CORRIGE');

  const lista = await listar(m, { acta_id: 'acta-desvio' });
  assert.strictEqual(lista.status, 200);
  assert.strictEqual(lista.data.acta.motivo, 'el barrio creció', 'el texto asentado no se toca');
});

test('se corrige con otra acta que la sustituye: la vieja conserva su texto y se deriva quién la sustituyó', async () => {
  const { m } = nuevo();
  await asentar(m, { autor: 'duena', motivo: 'motivo falso', cambio: CAMBIO, desde: T(0), acta_id: 'acta-1' });
  await asentar(m, {
    autor: 'duena', motivo: 'el motivo de la acta-1 era falso', cambio: CAMBIO, desde: T(5),
    acta_id: 'acta-2', sustituye_a: 'acta-1'
  });

  const lista = await listar(m, {});
  assert.deepStrictEqual(lista.data.actas.map((a) => a.acta_id), ['acta-1', 'acta-2']);
  assert.deepStrictEqual(lista.data.vigentes.map((a) => a.acta_id), ['acta-2'], 'la sustituida no rige');
  const vieja = lista.data.actas.find((a) => a.acta_id === 'acta-1');
  assert.strictEqual(vieja.motivo, 'motivo falso', 'append-only: el texto viejo se conserva');
  assert.strictEqual(vieja.sustituida_por, 'acta-2', 'quién la sustituye se DERIVA');
  assert.strictEqual(lista.data.actas.find((a) => a.acta_id === 'acta-2').sustituye_a, 'acta-1');

  const fantasma = await asentar(m, { autor: 'duena', motivo: 'x', cambio: CAMBIO, sustituye_a: 'acta-que-no-existe' });
  assert.strictEqual(fantasma.status, 404);
  assert.strictEqual(fantasma.error.code, 'ACTA_NO_CONSTA');
});

test('la firma lleva ámbito y no se cruza: la plaza no firma por una tienda, ni una tienda por otra', async () => {
  const { m } = nuevo();

  const plazaPorTienda = await asentar(m, {
    autor: 'duena-de-la-plaza', motivo: 'x', cambio: CAMBIO, ambito: 'plaza', tienda_id: TIENDA
  });
  assert.strictEqual(plazaPorTienda.status, 409);
  assert.strictEqual(plazaPorTienda.error.code, 'AMBITO_NO_SE_CRUZA');

  const otraFirma = await asentar(m, {
    autor: { id: 'tienda-otra', rol: 'tienda' }, motivo: 'x', cambio: CAMBIO, ambito: 'tienda', tienda_id: TIENDA
  });
  assert.strictEqual(otraFirma.status, 403);
  assert.strictEqual(otraFirma.error.code, 'AMBITO_NO_SE_CRUZA');

  const salaFirma = await asentar(m, {
    autor: { id: 'sala', rol: 'sala' }, motivo: 'x', cambio: CAMBIO, ambito: 'tienda', tienda_id: TIENDA
  });
  assert.strictEqual(salaFirma.status, 403, 'la sala no firma el acta de una tienda');

  const suya = await asentar(m, {
    autor: { id: TIENDA, rol: 'tienda' }, motivo: 'su carta cambió', cambio: CAMBIO, ambito: 'tienda', tienda_id: TIENDA
  });
  assert.strictEqual(suya.status, 201, JSON.stringify(suya.error || {}));
  assert.strictEqual(suya.data.acta.ambito, 'tienda');
  assert.strictEqual(suya.data.acta.tienda_id, TIENDA);
});

test('listar dice qué regía en un instante: se explica la decisión vieja con el texto que se firmó', async () => {
  const { m } = nuevo();
  await asentar(m, { autor: 'duena', motivo: 'primera', cambio: { desvio_m: 800 }, desde: T(0), acta_id: 'a1' });
  await asentar(m, { autor: 'duena', motivo: 'segunda', cambio: { desvio_m: 900 }, desde: T(60), acta_id: 'a2' });

  const antes = await listar(m, { instante: T(30) });
  assert.strictEqual(antes.data.de_instante.vigente.acta_id, 'a1');
  assert.deepStrictEqual(antes.data.de_instante.vigente.cambio, { desvio_m: 800 });

  const despues = await listar(m, { instante: T(90) });
  assert.strictEqual(despues.data.de_instante.vigente.acta_id, 'a2');
  assert.strictEqual(despues.data.de_instante.sustituida_despues.length, 1, 'y lo que quedó atrás se dice');

  const antesDeTodo = await listar(m, { instante: T(-30) });
  assert.strictEqual(antesDeTodo.data.de_instante.vigente, null);
  assert.ok(antesDeTodo.data.de_instante.faltantes.length === 1, 'un hueco nombrado, no un acta vacía');
});

test('de responde por la cosa: un acta por id, o la que hoy rige para un asunto con su cadena', async () => {
  const { m } = nuevo();
  const de = (extra) => m.onDeRequest({ request_id: 'q', data: { project_id: PLAZA, ...extra } });
  await asentar(m, { autor: 'duena', motivo: 'primera', asunto: 'desvío máximo', cambio: { desvio_m: 800 }, desde: T(0), acta_id: 'a1' });
  await asentar(m, { autor: 'duena', motivo: 'el primero se quedó corto', asunto: 'desvío máximo', cambio: { desvio_m: 900 }, desde: T(5), acta_id: 'a2', sustituye_a: 'a1' });
  await asentar(m, { autor: 'duena', motivo: 'otra cosa', asunto: 'ventana', cambio: { ventana: { validez_s: 25 } }, acta_id: 'b1' });

  const porId = await de({ acta_id: 'a1' });
  assert.strictEqual(porId.status, 200);
  assert.strictEqual(porId.data.acta.sustituida_por, 'a2');

  const porAsunto = await de({ asunto: 'desvío máximo' });
  assert.strictEqual(porAsunto.status, 200);
  assert.strictEqual(porAsunto.data.vigente.acta_id, 'a2');
  assert.deepStrictEqual(porAsunto.data.cadena.map((c) => c.acta_id), ['a1', 'a2']);
  assert.strictEqual(porAsunto.data.n, 2);

  assert.strictEqual((await de({ asunto: 'nadie ha decidido esto' })).status, 404);
  assert.strictEqual((await de({})).status, 400, 'hay que decir de qué acta se habla');
});

// ─────────────────────────────────────────────────────────────────────────────
// El encaje con config-mercado, que ya existía y NO se toca: bus real, fs de mentira.
// ─────────────────────────────────────────────────────────────────────────────
function crearBus() {
  const subs = new Map();
  const publicados = [];
  let pend = [];
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
          if (r && typeof r.then === 'function') pend.push(r);
        } catch (err) { pend.push(Promise.reject(err)); }
      }
    },
    async drenar() {
      for (let v = 0; v < 300 && pend.length > 0; v += 1) {
        const lote = pend; pend = [];
        await Promise.all(lote);
      }
      if (pend.length > 0) throw new Error('el bus no se vacía: ¿un bucle de eventos?');
    }
  };
}

function crearRpc(bus) {
  let n = 0;
  return function rpc(ev, payload = {}) {
    const request_id = `rpc-${++n}`;
    const respuesta = ev.endsWith('.request') ? `${ev.slice(0, -8)}.response` : `${ev}.response`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { unsub(); resolve({ status: 504, error: { code: 'SIN_RESPUESTA', message: ev } }); }, 800);
      const unsub = bus.subscribe(respuesta, (e) => {
        if (e.data?.request_id !== request_id) return;
        clearTimeout(timer); unsub(); resolve(e.data);
      });
      bus.publish(ev, { request_id, ...payload });
    });
  };
}

function montar() {
  const ConfigMercado = require('../../modules/bocaos/config-mercado/index.js');
  const bus = crearBus();
  const rpc = crearRpc(bus);
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

  const modulos = { 'acta-decisiones': new ActaDecisiones(), 'config-mercado': new ConfigMercado() };
  const RAIZ = path.join(__dirname, '../../modules/bocaos');
  for (const [nombre, m] of Object.entries(modulos)) {
    m.eventBus = bus;
    m.logger = { info() {}, warn() {}, error() {} };
    m.metrics = { increment() {} };
    m._rpc = rpc;
    const man = JSON.parse(fs.readFileSync(path.join(RAIZ, nombre, 'module.json'), 'utf8'));
    for (const sub of man.subscribes) {
      const fn = m[sub.handler];
      if (typeof fn !== 'function') throw new Error(`${nombre}: handler ${sub.handler} inexistente`);
      bus.subscribe(sub.event, fn.bind(m));
    }
  }
  bus.publish('project.activated', { project_id: PLAZA });
  return { bus, rpc };
}

test('encaje con config-mercado: el acta que asienta esta isla es el acta que la política guarda', async () => {
  const { bus, rpc } = montar();
  await bus.drenar();

  // 1 · Sin acta, config-mercado ya dice 409 SIN_ACTA (no se toca esa isla).
  const sinActa = await rpc('config-mercado.declarar.request', {
    project_id: PLAZA, ambito: 'plaza', autor: 'duena',
    umbrales: { desvio_m: 900 }, desde: T(0)
  });
  assert.strictEqual(sinActa.status, 409);
  assert.strictEqual(sinActa.error.code, 'SIN_ACTA');

  // 2 · Se asienta el acta del cambio.
  const acta = await rpc('acta-decisiones.asentar.request', {
    project_id: PLAZA, autor: 'duena', motivo: 'el barrio creció hacia el norte',
    clase: 'J01', cambio: { desvio_m: 900 }, desde: T(0), acta_id: 'acta-desvio-900'
  });
  assert.strictEqual(acta.status, 201, JSON.stringify(acta.error || {}));
  await bus.drenar();

  // 3 · Con ESA acta, la política se escribe y la guarda con el mismo id.
  const decl = await rpc('config-mercado.declarar.request', {
    project_id: PLAZA, ambito: 'plaza', autor: 'duena', acta: 'acta-desvio-900',
    umbrales: { desvio_m: 900 }, desde: T(1)
  });
  assert.strictEqual(decl.status, 201, JSON.stringify(decl.error || {}));
  assert.strictEqual(decl.data.politica.acta, 'acta-desvio-900');

  const lista = await rpc('acta-decisiones.listar.request', { project_id: PLAZA, acta_id: 'acta-desvio-900' });
  assert.strictEqual(lista.status, 200, 'la referencia de la política apunta a un acta que existe');
  assert.strictEqual(lista.data.acta.motivo, 'el barrio creció hacia el norte');
});

test('un dictamen firmado se asienta con el MISMO id que config-mercado usará como acta', async () => {
  const { bus, rpc } = montar();
  await bus.drenar();

  bus.publish('bocaos.dictamen_firmado', {
    plaza_id: PLAZA, dictamen_id: 'dic-77', firmado_por: 'sala',
    motivo: 'el desvío de 800 dejaba fuera media zona',
    clase: 'J01', valores: { desvio_m: 950 }, desde: T(2)
  });
  await bus.drenar();

  const asentada = bus.eventos('bocaos.acta_asentada');
  assert.strictEqual(asentada.length, 1, 'el dictamen deja acta');
  assert.strictEqual(asentada[0].p.acta_id, 'dic-77', 'el id es el que config-mercado sella');
  assert.strictEqual(asentada[0].p.ambito, 'plaza');

  // config-mercado, por su lado, ya declaró con ese mismo id.
  const pol = await rpc('config-mercado.politica.request', { project_id: PLAZA, instante: T(3) });
  assert.strictEqual(pol.data.politica.acta, 'dic-77');
  assert.strictEqual(pol.data.politica.umbrales.desvio_m, 950);
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
