'use strict';

/**
 * bocaos/censo-parte — I01 · I02 · M02 · M03 · P04. El censo de la plaza.
 *
 * Lo que se vigila:
 *   1. UN RIDER A MEDIAS NO ENTRA: el alta devuelve INCOMPLETA con la lista exacta de lo que falta,
 *      no aparece en `vigentes` y no abre estado.
 *   2. La lista se DERIVA (P04) y se puede preguntar antes de dar el alta, sin guardar nada.
 *   3. SIN EXCLUSIVIDAD (M03): exclusividad, permanencia, turno, cuota mínima, antigüedad o
 *      disponibilidad mínima semana → 409 nombrando el campo, y no se escribe ni una línea.
 *   4. LAS ZONAS LAS DECLARA ÉL (M02) y las cambia él; la sala no le asigna zona.
 *   5. LA CADENA CERRADA: alta completa → hecho → `estado-parte` abre la parte. Sin alta no hay
 *      estado. Y sin términos aceptados el alta no se completa (I08 → I02), todo por el bus.
 *   6. La tienda pide su proyecto al `project-manager` y casa la confirmación por correlation_id.
 *
 * Ejecutar: node tests/unit/bocaos__censo-parte.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CensoParte = require('../../modules/bocaos/censo-parte/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const RIDER = 'rid-1';
const TIENDA = 'tienda-paco';
const T0 = Date.parse('2026-11-03T09:00:00.000Z');
const T = (min) => new Date(T0 + min * 60000).toISOString();

// Q34: lo que acredita un rider. Sin `seguro` no hay alta completa.
const DOCS = {
  identidad: 'dni-12345678Z',
  autonomo: { ref: 'alta-reta-2026', verificado: true, verificado_por: 'gestoria' },
  seguro: 'poliza-rc-889',
  vehiculo: 'permiso-b-778',
  documento_sistema: 'doc-sistema-v1-firmado',
  terminos: 'terminos-v1'
};

// ─── isla sola ───
function nuevo() {
  const publicados = [];
  const m = new CensoParte();
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

const alta = (m, extra) => m.onAltaRequest({ request_id: 'a', data: { project_id: PLAZA, ...extra } });
const de = (m, extra) => m.onDeRequest({ request_id: 'd', data: { project_id: PLAZA, ...extra } });
const vigentes = (m, extra) => m.onVigentesRequest({ request_id: 'v', data: { project_id: PLAZA, ...extra } });
const checklist = (m, extra) => m.onChecklistRequest({ request_id: 'c', data: { project_id: PLAZA, ...extra } });
const zona = (m, extra) => m.onZonaRequest({ request_id: 'z', data: { project_id: PLAZA, ...extra } });

test('alta de rider completa: entra, sale el hecho y aparece en vigentes con sus zonas', async () => {
  const { m, eventos } = nuevo();
  const r = await alta(m, {
    tipo: 'rider', rider_id: RIDER, nombre: 'Rafa', vehiculo: 'moto', zonas: ['centro'],
    chat_id: 5551234, documentos: DOCS, hora: T(0)
  });

  assert.strictEqual(r.status, 201, JSON.stringify(r.error || {}));
  assert.strictEqual(r.data.estado_alta, 'COMPLETA');
  assert.deepStrictEqual(r.data.parte.faltantes, []);
  assert.deepStrictEqual(r.data.parte.acreditados.sort(), Object.keys(DOCS).sort());
  assert.deepStrictEqual(r.data.parte.sin_verificar, ['identidad', 'seguro', 'vehiculo', 'documento_sistema', 'terminos'],
    'Q34 abierta: se dice lo que está presentado sin verificar, no se finge verificado');

  const h = eventos('bocaos.parte_censada');
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].p.parte_id, RIDER);
  assert.strictEqual(h[0].p.tipo, 'rider');
  assert.strictEqual(h[0].p.estado_alta, 'COMPLETA');
  assert.deepStrictEqual(h[0].p.zonas, ['centro']);
  assert.strictEqual(h[0].p.chat_id, '5551234');

  const v = await vigentes(m, {});
  assert.strictEqual(v.status, 200);
  assert.strictEqual(v.data.n, 1);
  assert.deepStrictEqual(v.data.criterios, ['alta completa'], 'la elegibilidad se dice, no se supone');
  assert.strictEqual(v.data.riders[0].parte_id, RIDER);
});

test('un rider a medias NO entra: INCOMPLETA con lo que falta, fuera de vigentes y sin estado', async () => {
  const { m, eventos } = nuevo();
  const { seguro, ...sinSeguro } = DOCS;
  const r = await alta(m, { tipo: 'rider', rider_id: RIDER, vehiculo: 'moto', zonas: ['centro'], documentos: sinSeguro });

  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.estado_alta, 'INCOMPLETA');
  assert.deepStrictEqual(r.data.parte.faltantes, ['seguro']);
  assert.strictEqual(eventos('bocaos.parte_censada').length, 0, 'a medias no se publica como parte');

  const inc = eventos('bocaos.censo_incompleto');
  assert.strictEqual(inc.length, 1);
  assert.deepStrictEqual(inc[0].p.faltantes, ['seguro']);

  const v = await vigentes(m, {});
  assert.strictEqual(v.data.n, 0);
  assert.deepStrictEqual(v.data.excluidas.map((x) => x.motivo), ['alta incompleta'], 'y se dice por qué no está');

  // Un alta a medias no es un callejón: se reintenta y se completa (200, no un 409 que la encierre).
  const dos = await alta(m, { tipo: 'rider', rider_id: RIDER, documentos: { seguro: 'poliza-rc-889' } });
  assert.strictEqual(dos.status, 200, JSON.stringify(dos.error || {}));
  assert.strictEqual(dos.data.estado_alta, 'COMPLETA');
  assert.strictEqual(eventos('bocaos.parte_censada').length, 1, 'ahora sí: la parte entra');

  const otra = await alta(m, { tipo: 'rider', rider_id: RIDER, documentos: DOCS });
  assert.strictEqual(otra.status, 409);
  assert.strictEqual(otra.error.code, 'YA_EN_CENSO');
});

test('P04: la lista de lo que falta se puede preguntar antes del alta, y no se guarda nada', async () => {
  const { m } = nuevo();
  const antes = await checklist(m, { tipo: 'rider', documentos: { identidad: 'dni-1' } });
  assert.strictEqual(antes.status, 200);
  assert.strictEqual(antes.data.parte_id, null);
  assert.deepStrictEqual(antes.data.acreditados, ['identidad']);
  assert.deepStrictEqual(antes.data.faltantes, ['autonomo', 'seguro', 'vehiculo', 'documento_sistema', 'terminos']);

  const tienda = await checklist(m, { tipo: 'tienda', documentos: { identidad_fiscal: 'B29000000' } });
  assert.deepStrictEqual(tienda.data.faltantes, [], 'la tienda sólo acredita su identidad fiscal (I01)');

  const nada = await checklist(m, {});
  assert.strictEqual(nada.status, 404);
  assert.strictEqual(nada.error.code, 'PARTE_NO_CONSTA');

  // Y tras el alta, la misma pregunta da la misma lista: no hay dos verdades.
  await alta(m, { tipo: 'rider', rider_id: RIDER, documentos: DOCS, vehiculo: 'moto', zonas: ['centro'] });
  const despues = await checklist(m, { parte_id: RIDER });
  assert.deepStrictEqual(despues.data.faltantes, []);
  assert.strictEqual(despues.data.estado_alta, 'COMPLETA');
});

test('M03: exclusividad, permanencia, turno, cuota o antigüedad no entran — y no se escribe nada', async () => {
  const casos = [
    { exclusividad: true },
    { permanencia_meses: 12 },
    { turnos: ['noche'] },
    { cuota_minima: 50 },
    { antiguedad_minima_meses: 6 },
    { condiciones: ['disponibilidad mínima semanal de 20 h'] },
    { condiciones: [{ prioridad: 'quien sólo trabaja con nosotros' }] }
  ];

  for (const extra of casos) {
    const { m, eventos } = nuevo();
    const r = await alta(m, { tipo: 'rider', rider_id: RIDER, documentos: DOCS, ...extra });
    assert.strictEqual(r.status, 409, `debía rechazarse: ${JSON.stringify(extra)}`);
    assert.strictEqual(r.error.code, 'SIN_EXCLUSIVIDAD', JSON.stringify(extra));
    assert.ok(r.error.details.field, 'el campo se nombra: no hay rechazo mudo');
    assert.strictEqual(eventos('bocaos.parte_censada').length + eventos('bocaos.censo_incompleto').length, 0, 'nada se escribe');
    assert.strictEqual((await de(m, { parte_id: RIDER })).status, 404, 'ni siquiera queda un alta a medias');
  }
});

test('M02: las zonas las declara él y las cambia él; la sala no le asigna zona', async () => {
  const { m, eventos } = nuevo();
  await alta(m, { tipo: 'rider', rider_id: RIDER, documentos: DOCS, vehiculo: 'moto', zonas: ['centro'] });

  const sala = await zona(m, { rider_id: RIDER, zonas: ['playa'], rol: 'sala' });
  assert.strictEqual(sala.status, 403);
  assert.strictEqual(sala.error.code, 'ZONA_NO_ES_SUYA');

  const el = await zona(m, { rider_id: RIDER, zonas: ['playa', 'centro', 'centro'], rol: 'rider' });
  assert.strictEqual(el.status, 200, JSON.stringify(el.error || {}));
  assert.deepStrictEqual(el.data.parte.zonas, ['playa', 'centro'], 'sin duplicados y como él quiere');

  const hecho = eventos('bocaos.censo_actualizado').slice(-1)[0];
  assert.deepStrictEqual(hecho.p.zonas, ['playa', 'centro']);
  assert.deepStrictEqual(hecho.p.antes, ['centro']);
  assert.strictEqual(hecho.p.motivo, 'zonas_declaradas');

  const vacia = await zona(m, { rider_id: RIDER, zonas: [], rol: 'rider' });
  assert.strictEqual(vacia.status, 400, 'una lista vacía significaría «todas»: para no recibir está la pausa');

  const tienda = await alta(m, { tipo: 'tienda', tienda_id: TIENDA, nombre: 'Casa Paco', documentos: { identidad_fiscal: 'B29000000' } });
  assert.strictEqual(tienda.status, 201);
  const zonaTienda = await zona(m, { parte_id: TIENDA, zonas: ['centro'], rol: 'tienda' });
  assert.strictEqual(zonaTienda.status, 409);
  assert.strictEqual(zonaTienda.error.code, 'ZONA_NO_APLICA');
});

test('I01: la tienda pide su proyecto al bus y casa la confirmación por correlation_id', async () => {
  const { m, eventos } = nuevo();
  const r = await alta(m, { tipo: 'tienda', tienda_id: TIENDA, nombre: 'Casa Paco', documentos: { identidad_fiscal: 'B29000000' } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.parte.proyecto.correlation_id, TIENDA);
  assert.strictEqual(r.data.parte.proyecto.project_id, null, 'todavía no consta: no se lo inventa');
  assert.strictEqual(eventos('project.create').length, 1, 'dar de alta la tienda ES crear su proyecto');
  assert.strictEqual(eventos('project.create')[0].p.name, 'Casa Paco');

  await m.onProjectCreado({ data: { project_id: 'uuid-999', correlation_id: TIENDA, name: 'Casa Paco' } });
  const ficha = await de(m, { parte_id: TIENDA });
  assert.strictEqual(ficha.data.parte.proyecto.project_id, 'uuid-999');
});

// ─────────────────────────────────────────────────────────────────────────────
// LA CADENA: censo → estado, y términos → censo. Todo por el bus.
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
      // Holgado: un custodio puede PREGUNTAR a otro (estado-parte pregunta a config-mercado).
      const timer = setTimeout(() => { unsub(); resolve({ status: 504, error: { code: 'SIN_RESPUESTA', message: ev } }); }, 3000);
      const unsub = bus.subscribe(respuesta, (e) => {
        if (e.data?.request_id !== request_id) return;
        clearTimeout(timer); unsub(); resolve(e.data);
      });
      bus.publish(ev, { request_id, ...payload });
    });
  };
}

function montar() {
  const EstadoParte = require('../../modules/bocaos/estado-parte/index.js');
  const TerminosParte = require('../../modules/bocaos/terminos-parte/index.js');
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

  const modulos = {
    'censo-parte': new CensoParte(),
    'estado-parte': new EstadoParte(),
    'terminos-parte': new TerminosParte(),
    // Se monta porque `estado-parte` le PREGUNTA el coste del rider (Q57): sin él, el test
    // mediría el timeout, no la cadena.
    'config-mercado': new ConfigMercado()
  };
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

test('sin alta no hay estado; con el alta completa, estado-parte abre la parte — y los términos completan el alta', async () => {
  const { bus, rpc } = montar();
  await bus.drenar();

  // Todavía sin censo: estado-parte no inventa partes.
  const antes = await rpc('estado-parte.de.request', { project_id: PLAZA, parte_id: RIDER });
  assert.strictEqual(antes.status, 404, 'sin alta no hay estado');

  // Alta con todo menos los términos aceptados: INCOMPLETA, y el estado sigue cerrado.
  const { terminos, ...sinTerminos } = DOCS;
  const alta1 = await rpc('censo-parte.alta.request', {
    project_id: PLAZA, plaza_id: PLAZA, tipo: 'rider', rider_id: RIDER, vehiculo: 'moto',
    zonas: ['centro'], chat_id: 5551234, documentos: sinTerminos, hora: T(0)
  });
  assert.strictEqual(alta1.status, 201, JSON.stringify(alta1.error || {}));
  assert.strictEqual(alta1.data.estado_alta, 'INCOMPLETA');
  assert.deepStrictEqual(alta1.data.parte.faltantes, ['terminos']);
  await bus.drenar();
  assert.strictEqual((await rpc('estado-parte.de.request', { project_id: PLAZA, parte_id: RIDER })).status, 404,
    'un alta a medias no abre estado');

  // La parte acepta los términos (terminos-parte es su único dueño) → hecho → el censo acredita.
  const acep = await rpc('terminos-parte.aceptar.request', {
    project_id: PLAZA, plaza_id: PLAZA, parte_id: RIDER, tipo: 'rider', version: '1',
    clausulas: ['comisión 0,90 €', 'pausa libre'], hora: T(1)
  });
  assert.strictEqual(acep.status, 201, JSON.stringify(acep.error || {}));
  assert.strictEqual(acep.data.aceptacion.censo_verificado, true, 'el censo contestó: la parte consta');
  await bus.drenar();

  // El censo se completó y lo publicó; estado-parte abrió la parte.
  const ficha = await rpc('censo-parte.de.request', { project_id: PLAZA, parte_id: RIDER });
  assert.strictEqual(ficha.data.parte.estado_alta, 'COMPLETA');
  assert.strictEqual(bus.eventos('bocaos.parte_censada').length, 1, 'el alta completa es un hecho');

  const estado = await rpc('estado-parte.de.request', { project_id: PLAZA, parte_id: RIDER });
  assert.strictEqual(estado.status, 200, 'la plaza escribe su censo Y su estado');
  assert.strictEqual(estado.data.parte.estado, 'disponible');
  assert.deepStrictEqual(estado.data.parte.zonas, ['centro'], 'las zonas viajan en el hecho, no se copian a mano');
  assert.strictEqual(estado.data.parte.chat_id, '5551234');

  // M02 en el censo → se proyecta en el estado (misma zona, un solo dueño).
  const z = await rpc('censo-parte.zona.request', {
    project_id: PLAZA, rider_id: RIDER, zonas: ['playa'], rol: 'rider'
  });
  assert.strictEqual(z.status, 200, JSON.stringify(z.error || {}));
  await bus.drenar();
  const despues = await rpc('estado-parte.de.request', { project_id: PLAZA, parte_id: RIDER });
  assert.deepStrictEqual(despues.data.parte.zonas, ['playa'], 'el rider cambió sus zonas y el estado lo sabe');

  // Y el estado sigue siendo del estado: el censo no le pone la pausa ni el ocupado.
  assert.strictEqual(despues.data.parte.estado, 'disponible');
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
