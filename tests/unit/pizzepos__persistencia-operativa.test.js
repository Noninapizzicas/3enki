'use strict';

/**
 * persistencia-comandero — LA CUENTA PERSISTIDA LLEVA LA IDENTIDAD OPERATIVA.
 *
 * El comandero NO carga las cuentas por `cuenta.list`: carga por
 * `persistencia.cuentas_activas`. Si la persistencia no guarda `numero_pedido` y
 * `cliente_nombre`, la tarjeta cae al `nombre` viejo ("Mesa 40") aunque el backend
 * ya tenga los campos. Eso fue exactamente lo que pasó en producción.
 *
 * Las cuentas abiertas ANTES del contrato no los tienen: la proyección los deriva de
 * `tipo` + `turno` (datos que la cuenta siempre tuvo). Solo lectura, no reescribe.
 *
 * Ejecutar: node tests/unit/pizzepos__persistencia-operativa.test.js
 */

const assert = require('assert');
const Persistencia = require('../../modules/pizzepos/persistencia-comandero');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const m = new Persistencia();
  m.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  m.metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  m.eventBus = { publish: async () => {} };
  m.onEvento = async () => {};
  m._guardarCuentasActivas = async () => {};
  return m;
}

test('cuenta.creada guarda numero_pedido y cliente_nombre', async () => {
  const m = nuevo();
  await m.onCuentaCreada({ data: {
    cuenta_id: 'M_1', project_id: 'the-pirate', turno: 521, tipo: 'mesa',
    nombre: 'Paco', ref_display: 'Paco M 521',
    numero_pedido: 'M 521', cliente_nombre: 'Paco'
  } });
  const c = m.cuentasActivasCache.get('M_1');
  assert.strictEqual(c.numero_pedido, 'M 521');
  assert.strictEqual(c.cliente_nombre, 'Paco');
  assert.strictEqual(c.ref_display, 'Paco M 521', 'el display sigue guardándose');
});

test('cuenta.actualizada refresca los dos campos', async () => {
  const m = nuevo();
  await m.onCuentaCreada({ data: {
    cuenta_id: 'M_1', project_id: 'p', turno: 521, tipo: 'mesa', nombre: 'Paco',
    ref_display: 'Paco M 521', numero_pedido: 'M 521', cliente_nombre: null
  } });
  await m.onCuentaActualizada({ data: { cuenta_id: 'M_1', cambios: { cliente_nombre: 'Mijael' } } });
  assert.strictEqual(m.cuentasActivasCache.get('M_1').cliente_nombre, 'Mijael');
});

test('cuenta vieja: la proyección deriva M 515 de tipo + turno (sin reescribir)', () => {
  const m = nuevo();
  const p = m._proyectarCuenta({ cuenta_id: 'x', tipo: 'mesa', turno: 515, nombre: 'Mesa 40', ref_display: 'M 515' });
  assert.strictEqual(p.numero_pedido, 'M 515');
  assert.strictEqual(p.cliente_nombre, null);
});

test('proyección: llevar deriva L y toma el cliente de datos_especificos', () => {
  const m = nuevo();
  const p = m._proyectarCuenta({
    cuenta_id: 'y', tipo: 'llevar', turno: 520, nombre: 'Cliente 5',
    datos_especificos: { cliente_nombre: 'Cliente 5' }
  });
  assert.strictEqual(p.numero_pedido, 'L 520');
  assert.strictEqual(p.cliente_nombre, 'Cliente 5');
});

test('proyección: si ya trae numero_pedido, no se recalcula', () => {
  const m = nuevo();
  const p = m._proyectarCuenta({ cuenta_id: 'z', tipo: 'mesa', turno: 2, numero_pedido: 'M 999' });
  assert.strictEqual(p.numero_pedido, 'M 999');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[persistencia-operativa] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[persistencia-operativa] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
