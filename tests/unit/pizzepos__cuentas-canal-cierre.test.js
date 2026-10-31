/**
 * CUENTAS — el canal con dueño y el cierre que llega al libro de ventas.
 *
 * Dos fallos vistos en vivo (the-pirate, 2026-10-30):
 *   1) La PWA manda modo_consumo:'recoger' y la cuenta nacía con tipo 'recoger':
 *      un tipo que NO es canal (prefijo sin strategy), así que nadie la cerraba
 *      nunca — sin mesa, sin ticket, sin dueño.
 *   2) Al cobrarla, cuentas la pasaba a 'cobrado' pero no emitía `cuenta.cerrada`.
 *      persistencia-comandero apunta UNA venta por `cuenta.cerrada`: el dinero
 *      quedó en el registro de cobros y NO en el libro (caja 92,50 vs cajón 95,50).
 *
 * Lo que se fija aquí: la cuenta nace del CANAL canónico (recoger→llevar) y una
 * cuenta que se cierra al cobrar emite su `cuenta.cerrada`.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CuentasModule = require('../../modules/pizzepos/cuentas/index.js');

function makeMocks() {
  const published = [];
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const metrics = { increment() {}, gauge() {}, timing() {} };
  const eventBus = { publish: async (event, payload) => { published.push([event, payload]); } };
  return { published, logger, metrics, eventBus };
}

/** Instancia aislada: sin tocar data/ del repo ni el contador global real. */
async function instantiate(mocks) {
  const m = new CuentasModule();
  const turnoFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cuentas-canal-')), 'contador.json');
  const onLoad = m.onLoad.bind(m);
  m.onLoad = async (core) => {
    m._restaurarDesdeArchivo = async () => {};
    m._loadTurno = async function () { this._turnoFile = turnoFile; this._turno = 0; };
    return onLoad(core);
  };
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  if (m._metricsInterval) { clearInterval(m._metricsInterval); m._metricsInterval = null; }
  return m;
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

test('cuenta con tipo recoger → nace como canal llevar (con su prefijo y su símbolo)', async () => {
  const mocks = makeMocks();
  const m = await instantiate(mocks);
  const r = await m.handleCreateCuenta({
    project_id: 'p1', tipo: 'recoger', nombre: 'Juan',
    metadata: { modo_consumo: 'recoger', hora_recogida: '20:30' }
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.tipo, 'llevar', 'recoger no es canal: el canal operativo es llevar');
  assert.ok(r.data.id.startsWith('llevar_'), `id con prefijo con dueño, llegó ${r.data.id}`);
  assert.match(r.data.ref_display, /L \d{3}$/, 'símbolo del canal llevar, no el de mesa');
  assert.equal(r.data.metadata.modo_consumo, 'recoger', 'el modo del cliente no se pierde');
  assert.equal(r.data.metadata.hora_recogida, '20:30');
  await m.onUnload();
});

test('cuenta con tipo mesa sigue siendo mesa; sin tipo cae a local', async () => {
  const mocks = makeMocks();
  const m = await instantiate(mocks);
  const mesa = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'mesa' });
  assert.equal(mesa.data.tipo, 'mesa');
  assert.ok(mesa.data.id.startsWith('mesa_'));
  const sinTipo = await m.handleCreateCuenta({ project_id: 'p1' });
  assert.equal(sinTipo.data.tipo, 'local', 'comportamiento previo intacto');
  await m.onUnload();
});

test('cobrar una cuenta de recogida emite cuenta.cerrada → la venta llega al libro', async () => {
  const mocks = makeMocks();
  const m = await instantiate(mocks);
  const c = await m.handleCreateCuenta({
    project_id: 'p1', tipo: 'recoger',
    metadata: { modo_consumo: 'recoger', cerrar_al_cobrar: true }
  });
  const cuenta_id = c.data.id;
  await m.onComanderoItemAgregado({ payload: { cuenta_id, precio_total: 3, cantidad: 1 } });
  mocks.published.length = 0;

  await m.onCobroProcesado({ payload: { cuenta_id, monto_total: 3, metodo_pago: 'efectivo' } });

  assert.equal(m.cuentas.get(cuenta_id).estado, 'cobrado');
  const cerradas = publishedOf(mocks, 'cuenta.cerrada');
  assert.equal(cerradas.length, 1, 'una sola venta por cuenta');
  assert.equal(cerradas[0].cuenta_id, cuenta_id);
  assert.equal(cerradas[0].tipo, 'llevar');
  assert.equal(cerradas[0].total, 3);
  await m.onUnload();
});

test('cuenta de mesa la cierra su canal: cuentas no emite cuenta.cerrada (sin duplicar)', async () => {
  const mocks = makeMocks();
  const m = await instantiate(mocks);
  const c = await m.handleCreateCuenta({ project_id: 'p1', tipo: 'mesa' });
  const cuenta_id = c.data.id;
  await m.onComanderoItemAgregado({ payload: { cuenta_id, precio_total: 34, cantidad: 1 } });
  mocks.published.length = 0;

  await m.onCobroProcesado({ payload: { cuenta_id, monto_total: 34, metodo_pago: 'efectivo' } });

  assert.equal(m.cuentas.get(cuenta_id).estado, 'cobrado');
  assert.equal(publishedOf(mocks, 'cuenta.cerrada').length, 0, 'la publica la strategy del canal');
  await m.onUnload();
});
