'use strict';

/**
 * bocaos/disputa-fallo — G05. El caso de la parte que no está de acuerdo.
 *
 * Lo que se vigila:
 *   1. No decide: pone el caso delante de un humano (aviso-sala) y se aparta.
 *   2. La deuda NO se borra: el hecho dice `deuda_sigue` y `cobrable: false`.
 *   3. El cargo se lee del bus; si no consta, no hay caso (no se inventa la deuda).
 *   4. Sólo una parte del cargo puede disputarlo.
 *   5. No se abre dos veces el mismo caso sin un hecho nuevo.
 *
 * Ejecutar: node tests/unit/bocaos__disputa-fallo.test.js
 */

const assert = require('assert');
const DisputaFallo = require('../../modules/bocaos/disputa-fallo/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const CARGO = {
  cargo_id: 'cg-1111',
  pedido_id: 'ped-9',
  plaza_id: PLAZA,
  deudor: { rol: 'rider', parte_id: 'rider-ana' },
  acreedor: { rol: 'tienda', parte_id: 'tienda-paco' },
  importe_centimos: null,
  importe_estado: 'NO_CONSTA',
  evidencia: [{ hecho: 'espera_n1', minutos: 11, hora: '2026-11-02T20:00:00.000Z' }],
  estado: 'ANOTADO'
};

function nuevo({ cargo = CARGO } = {}) {
  const publicados = [];
  const pedidas = [];
  const m = new DisputaFallo();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async (ev, payload) => {
    pedidas.push({ ev, payload });
    if (ev === 'cargo-fallo.de.request') {
      if (!cargo || payload.cargo_id !== cargo.cargo_id) return { status: 404, error: { code: 'NO_CONSTA' } };
      return { status: 200, data: { cargo } };
    }
    return null;
  };
  return { m, pedidas, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const abrir = (m, extra) => m.onAbrirRequest({
  request_id: 'r1',
  data: { project_id: PLAZA, plaza_id: PLAZA, cargo_id: 'cg-1111', parte_id: 'rider-ana', motivo: 'la espera no fue mía', ...extra }
});

test('abre el caso, deja la deuda intacta y lo pone delante de la sala', async () => {
  const { m, eventos } = nuevo();
  const r = await abrir(m);

  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.disputa.cobrable, false);
  assert.strictEqual(r.data.disputa.deuda_sigue, true);
  assert.strictEqual(r.data.disputa.cargo_id, 'cg-1111');

  const hechos = eventos('bocaos.disputa_abierta');
  assert.strictEqual(hechos.length, 1);
  assert.strictEqual(hechos[0].p.cobrable, false);
  assert.strictEqual(hechos[0].p.deuda_sigue, true);
  assert.strictEqual(hechos[0].p.partes.length, 2);
  assert.strictEqual(hechos[0].p.traza.evidencia.length, 1, 'la evidencia del cargo viaja con la disputa');
  assert.strictEqual(hechos[0].p.traza.importe_estado, 'NO_CONSTA', 'el importe no se rellena');

  const avisos = eventos('aviso-sala.caso.request');
  assert.strictEqual(avisos.length, 1);
  assert.strictEqual(avisos[0].p.tipo, 'disputa');
  assert.strictEqual(avisos[0].p.caso.cargo_id, 'cg-1111');
  assert.ok(avisos[0].p.traza, 'sin traza la sala sólo puede improvisar (I07)');
});

test('no decide: no hay culpable ni importe en el hecho, y la decisión se declara abierta', async () => {
  const { m, eventos } = nuevo();
  await abrir(m);
  const h = eventos('bocaos.disputa_abierta')[0].p;
  assert.strictEqual(h.culpable, undefined, 'el puente no adjudica');
  assert.strictEqual(h.importe_centimos, undefined);
  assert.ok(/Q24/.test(h.traza.como_se_hace_efectivo) === false);
  const d = (await abrir(m, { motivo: 'otra cosa' })).data.disputa;
  assert.ok(/Q24 \[ABIERTO\]/.test(d.decide), 'quién decide es Q24: se dice, no se elige');
});

test('cargo inexistente: 404 y ninguna disputa abierta', async () => {
  const { m, eventos } = nuevo({ cargo: null });
  const r = await abrir(m, { cargo_id: 'cg-nope' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error.code, 'NO_CONSTA');
  assert.strictEqual(eventos('bocaos.disputa_abierta').length, 0);
  assert.strictEqual(eventos('aviso-sala.caso.request').length, 0);
  assert.strictEqual(eventos('disputa-fallo.abrir.failed').length, 1, 'el par honesto: el fallo se ve en el bus');
});

test('sólo una parte del cargo puede disputarlo', async () => {
  const { m, eventos } = nuevo();
  const r = await abrir(m, { parte_id: 'rider-otro' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.error.code, 'NO_ES_PARTE');
  assert.strictEqual(eventos('bocaos.disputa_abierta').length, 0);
});

test('un cargo anulado no se disputa (G04 ya lo anuló)', async () => {
  const { m, eventos } = nuevo({ cargo: { ...CARGO, estado: 'ANULADO' } });
  const r = await abrir(m);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CARGO_ANULADO');
  assert.strictEqual(eventos('bocaos.disputa_abierta').length, 0);
});

test('sin motivo no hay disputa: 400', async () => {
  const { m, eventos } = nuevo();
  const r = await abrir(m, { motivo: '   ' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
  assert.strictEqual(eventos('bocaos.disputa_abierta').length, 0);
});

test('no se reabre sin un hecho nuevo: la segunda es idempotente', async () => {
  const { m, eventos } = nuevo();
  const a = await abrir(m);
  const b = await abrir(m);
  assert.strictEqual(a.status, 201);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.data.idempotente, true);
  assert.strictEqual(eventos('bocaos.disputa_abierta').length, 1, 'un caso, un hecho');
  assert.strictEqual(eventos('aviso-sala.caso.request').length, 1);

  const c = await abrir(m, { hecho_nuevo: true, motivo: 'apareció la foto de la entrega' });
  assert.strictEqual(c.status, 201);
  assert.strictEqual(eventos('bocaos.disputa_abierta').length, 2, 'un hecho nuevo sí abre otro caso');
});

test('el cargo que acaba de pasar por el bus se usa sin preguntar (y no abre nada solo)', async () => {
  const { m, pedidas, eventos } = nuevo();
  await m.onCargoAnotado({ data: { ...CARGO } });
  assert.strictEqual(eventos('bocaos.disputa_abierta').length, 0, 'que exista una deuda no abre una disputa');

  const r = await abrir(m);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(pedidas.filter((p) => p.ev === 'cargo-fallo.de.request').length, 0, 'ya lo tenía en caliente');
});

test('el plazo: si se declara viaja; si no, se dice que no consta', async () => {
  const { m, eventos } = nuevo();
  const conPlazo = await abrir(m, { plazo: '2026-11-05T18:00:00.000Z' });
  assert.strictEqual(conPlazo.data.disputa.plazo_estado, 'DECLARADO');
  assert.strictEqual(eventos('bocaos.disputa_abierta')[0].p.plazo, '2026-11-05T18:00:00.000Z');

  const { m: m2, eventos: ev2 } = nuevo();
  const sinPlazo = await abrir(m2);
  assert.strictEqual(sinPlazo.data.disputa.plazo_estado, 'NO_CONSTA');
  assert.strictEqual(ev2('bocaos.disputa_abierta')[0].p.plazo, null);
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
