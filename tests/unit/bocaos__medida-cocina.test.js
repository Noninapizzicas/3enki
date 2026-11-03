'use strict';

/**
 * bocaos/medida-cocina — L03 · la puntualidad declarada de una cocina.
 *
 * Lo que se vigila:
 *   1. Es una DISTRIBUCIÓN: cubos, n, p50 y p90. NUNCA una nota (ni estrellas, ni «3 sobre 5»).
 *   2. Sin datos suficientes → NO_CONSTA, y NO se enseña la distribución de dos casos (Q51).
 *   3. La muestra sin hora prometida NO se mide: no se imputa una promesa que nadie declaró.
 *   4. La hora de listo que falta se PIDE a hecho-listo, que es su dueño.
 *   5. Una tienda no mide la cocina de otra: 403. La plaza sí puede (es la lectura de A02).
 *   6. No escribe nada: no hay copia del histórico que pueda quedarse vieja.
 *
 * Ejecutar: node tests/unit/bocaos__medida-cocina.test.js
 */

const assert = require('assert');
const MedidaCocina = require('../../modules/bocaos/medida-cocina/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TIENDA = 'tienda-paco';

// Prometido a las 13:00; el listo, x minutos después.
const promesa = (h) => `2026-11-03T${String(h).padStart(2, '0')}:00:00.000Z`;
const listo = (h, min) => `2026-11-03T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`;

function serie(desvios, hora = 13) {
  // desvios en minutos; se construye la hora de listo sumando a la prometida
  return desvios.map((m, i) => {
    const base = Date.parse(promesa(hora)) + m * 60000;
    return { pedido_id: `ped-${i}`, hora_prometida: promesa(hora), hora_listo: new Date(base).toISOString() };
  });
}

function nuevo({ horaDeListo = '2026-11-03T13:04:00.000Z' } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new MedidaCocina();
  m.name = 'medida-cocina';
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'hecho-listo.de.request') {
      if (!horaDeListo) return { status: 404, error: { code: 'NO_CONSTA' } };
      return { status: 200, data: { hecho: { pedido_id: payload.pedido_id, hora_listo: horaDeListo } } };
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const medir = (m, extra = {}) => m.onMedirRequest({ request_id: 'm1', data: {
  project_id: TIENDA, tienda_id: TIENDA, plaza_id: PLAZA, hechos: serie([0, 1, 2, 3, 4, 6]), ...extra
} });

test('con historia suficiente da la DISTRIBUCIÓN, con n, p50 y p90', async () => {
  const { m } = nuevo();
  const r = await medir(m);
  assert.strictEqual(r.status, 200, JSON.stringify(r));
  const d = r.data.medida;

  assert.strictEqual(d.estado, 'MEDIDA');
  assert.strictEqual(d.tipo, 'distribucion');
  assert.strictEqual(d.n, 6);
  assert.strictEqual(d.n_minimo, 5);
  assert.strictEqual(d.min_min, 0);
  assert.strictEqual(d.max_min, 6);
  assert.strictEqual(typeof d.p50_min, 'number');
  assert.strictEqual(typeof d.p90_min, 'number');

  const cubos = Object.fromEntries(d.distribucion.map((c) => [c.clave, c.cuenta]));
  assert.deepStrictEqual(cubos, { a_tiempo: 1, hasta_2: 2, hasta_5: 2, hasta_10: 1, mas_de_10: 0 });
  assert.strictEqual(d.distribucion.reduce((s, c) => s + c.cuenta, 0), 6, 'los cubos suman n');
  assert.strictEqual(d.a_tiempo_pct, 16.7);
});

test('NUNCA una nota: ni estrellas, ni «3 sobre 5», ni un veredicto', async () => {
  const { m } = nuevo();
  const d = (await medir(m)).data.medida;
  assert.strictEqual(d.nota, null);
  assert.strictEqual(d.estrellas, null);
  assert.strictEqual(d.tipo, 'distribucion');
  assert.strictEqual(d.puntuacion, undefined);
  // La lectura es aritmética sobre los mismos números, no un juicio.
  assert.ok(d.lectura.includes('la mitad de las veces se pasa'), d.lectura);
});

test('sin datos suficientes: NO_CONSTA y el rider ve «sin histórico», no una media de dos', async () => {
  const { m } = nuevo();
  const d = (await medir(m, { hechos: serie([1, 2]) })).data.medida;
  assert.strictEqual(d.estado, 'NO_CONSTA');
  assert.strictEqual(d.n, 2);
  assert.strictEqual(d.hueco, 'sin histórico');
  assert.strictEqual(d.distribucion, null, 'no se enseña la distribución de dos casos');
  assert.strictEqual(d.p50_min, null);
  assert.ok(d.motivo.includes('mínimo declarado'));
});

test('la tienda nueva (sin serie) responde NO_CONSTA, no 0', async () => {
  const { m } = nuevo();
  const d = (await medir(m, { hechos: [] })).data.medida;
  assert.strictEqual(d.estado, 'NO_CONSTA');
  assert.strictEqual(d.n, 0);
  assert.strictEqual(d.distribucion, null);
});

test('la muestra sin hora prometida NO se mide: se cuenta aparte, no se imputa', async () => {
  const { m } = nuevo();
  const hechos = serie([0, 1, 2, 3, 4, 6, 0]);
  delete hechos[6].hora_prometida;
  const d = (await medir(m, { hechos })).data.medida;
  assert.strictEqual(d.n, 6, 'la muestra sin promesa no entra en n');
  assert.strictEqual(d.sin_promesa, 1, 'pero no desaparece en silencio');
});

test('la hora de listo que falta se PIDE al custodio del hecho, no se adivina', async () => {
  const { m, pedidas } = nuevo({ horaDeListo: listo(13, 3) });
  const hechos = [{ pedido_id: 'ped-9', hora_prometida: promesa(13) }];
  await medir(m, { hechos, minimo_n: 1 });
  assert.strictEqual(pedidas[0].ev, 'hecho-listo.de.request');
  assert.strictEqual(pedidas[0].payload.pedido_id, 'ped-9');
  assert.strictEqual(pedidas[0].payload.project_id, PLAZA, 'el hecho vive en la plaza');
});

test('por franja: se mide la franja que se pide, y las horas se juzgan contra su promesa', async () => {
  const { m } = nuevo();
  const manana = serie([0, 1, 2, 3, 4], 10);
  const tarde = serie([5, 6, 7, 8, 9], 20).map((x) => ({ ...x, pedido_id: `t-${x.pedido_id}` }));
  const d = (await medir(m, { hechos: [...manana, ...tarde], franja: { desde_hora: 9, hasta_hora: 11 } })).data.medida;
  assert.strictEqual(d.n, 5, 'sólo la franja de la mañana');
  assert.deepStrictEqual(d.franja, { desde_hora: 9, hasta_hora: 11 });
  assert.strictEqual(d.max_min, 4);
});

test('una tienda no mide la cocina de otra: 403 y se dice por qué', async () => {
  const { m, eventos } = nuevo();
  const r = await m.onMedirRequest({ request_id: 'x', data: {
    project_id: 'tienda-otra', tienda_id: TIENDA, plaza_id: PLAZA, hechos: serie([0, 1, 2, 3, 4])
  } });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error.code, 'TIENDA_AJENA');
  assert.strictEqual(eventos('medida-cocina.medir.failed').length, 1);
});

test('la plaza SÍ puede leerla: es la lectura que el diseño permite (A02)', async () => {
  const { m } = nuevo();
  const r = await m.onMedirRequest({ request_id: 'p', data: {
    project_id: PLAZA, tienda_id: TIENDA, plaza_id: PLAZA, hechos: serie([0, 1, 2, 3, 4])
  } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.medida.estado, 'MEDIDA');
});

test('sin serie no hay pregunta que contestar: se dice el campo que falta', async () => {
  const { m } = nuevo();
  const r = await m.onMedirRequest({ request_id: 'z', data: { project_id: TIENDA } });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.details.field, 'hechos');
});

test('historial: franja a franja, con su n y sus límites dichos', async () => {
  const { m } = nuevo();
  const hechos = [...serie([0, 1, 2, 3, 4, 5], 13), ...serie([1, 1, 1], 20).map((x) => ({ ...x, pedido_id: `n-${x.pedido_id}` }))];
  const r = await m.onHistorialRequest({ request_id: 'h', data: { project_id: TIENDA, tienda_id: TIENDA, plaza_id: PLAZA, hechos } });
  assert.strictEqual(r.status, 200, JSON.stringify(r));
  const h = r.data.historial;
  assert.strictEqual(h.n_total, 9);
  assert.strictEqual(h.franjas.length, 2);
  assert.strictEqual(h.franjas[0].hora, 13);
  assert.strictEqual(h.franjas[0].estado, 'MEDIDA');
  assert.strictEqual(h.franjas[1].estado, 'NO_CONSTA', 'tres muestras no son un historial');
  assert.strictEqual(h.nota, null);
  assert.ok(h.limites.length >= 3, 'el historial dice lo que NO dice');
});

test('no escribe: sin store y sin PosPersistencia', () => {
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
