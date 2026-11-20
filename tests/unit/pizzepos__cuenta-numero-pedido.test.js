'use strict';

/**
 * cuentas — IDENTIDAD OPERATIVA: número de pedido + nombre del cliente.
 *
 * No existe número de mesa. El prefijo del número de pedido dice el tipo de servicio:
 *   M 123 → se sirve en mesa (el 123 es el pedido, NO una mesa)
 *   L 391 → para llevar
 *   T 12  → teléfono
 *
 * Dos campos y nada más:
 *   numero_pedido   (<prefijo> <turno>)
 *   cliente_nombre  (opcional; etiquetas automáticas como "Mesa 40" no son un cliente)
 *
 * `nombre` y `ref_display` se mantienen como compatibilidad mientras migran los
 * consumidores (cocina, impresión, frontend).
 *
 * Ejecutar: node tests/unit/pizzepos__cuenta-numero-pedido.test.js
 */

const assert = require('assert');
const Cuentas = require('../../modules/pizzepos/cuentas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function nuevo() {
  const m = new Cuentas();
  m.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  m.metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  m.eventBus = { publish: async () => {} };
  m._publicarEvento = async () => {};
  m._gestionarAlerta = () => {};
  m._saveTurnoDebounced = () => {};
  m._slugProyecto = async (p) => p;
  return m;
}

const crear = (m, data) => m.handleCreateCuenta({ project_id: 'the-pirate', ...data });

test('llevar con nombre de persona: L 001 + cliente', async () => {
  const m = nuevo();
  const r = await crear(m, { tipo: 'llevar', nombre: 'Mijael' });
  assert.strictEqual(r.status, 201);
  assert.ok(/^L \d{3}$/.test(r.data.numero_pedido), r.data.numero_pedido);
  assert.strictEqual(r.data.cliente_nombre, 'Mijael');
});

test('mesa: el número es del PEDIDO, no de una mesa; "Mesa 40" no es un cliente', async () => {
  const m = nuevo();
  const r = await crear(m, { tipo: 'mesa', nombre: 'Mesa 40' });
  assert.ok(/^M \d{3}$/.test(r.data.numero_pedido), r.data.numero_pedido);
  assert.strictEqual(r.data.cliente_nombre, null, 'la etiqueta Mesa 40 no es un nombre de cliente');
});

test('mesa con nombre real: el cliente sí se guarda', async () => {
  const m = nuevo();
  const r = await crear(m, { tipo: 'mesa', nombre: 'Mijael' });
  assert.strictEqual(r.data.cliente_nombre, 'Mijael');
});

test('cliente_nombre explícito manda sobre el nombre de la cuenta', async () => {
  const m = nuevo();
  const r = await crear(m, { tipo: 'mesa', nombre: 'Mesa 40', cliente_nombre: 'Mijael' });
  assert.strictEqual(r.data.cliente_nombre, 'Mijael');
});

test('teléfono: prefijo T', async () => {
  const m = nuevo();
  const r = await crear(m, { tipo: 'telefono', nombre: 'Ana' });
  assert.ok(/^T \d{3}$/.test(r.data.numero_pedido), r.data.numero_pedido);
  assert.strictEqual(r.data.cliente_nombre, 'Ana');
});

test('rename a persona actualiza cliente_nombre; rename a etiqueta NO lo borra', async () => {
  const m = nuevo();
  const c = await crear(m, { tipo: 'mesa', nombre: 'Mesa 40' });
  const id = c.data.id;
  assert.strictEqual(c.data.cliente_nombre, null);

  const r1 = await m.handleRenameCuenta({ id, nombre: 'Mijael' });
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(m.cuentas.get(id).cliente_nombre, 'Mijael');

  await m.handleRenameCuenta({ id, nombre: 'Mesa 41' });
  assert.strictEqual(m.cuentas.get(id).cliente_nombre, 'Mijael', 'una etiqueta no debe borrar al cliente');
});

test('el número de pedido es único dentro del turno (no se repite)', async () => {
  const m = nuevo();
  const a = await crear(m, { tipo: 'mesa', nombre: 'Mesa 1' });
  const b = await crear(m, { tipo: 'llevar', nombre: 'Ana' });
  assert.notStrictEqual(a.data.numero_pedido, b.data.numero_pedido);
});

test('cuenta.creada publica numero_pedido y cliente_nombre (aditivo, sin quitar ref_display)', async () => {
  const m = nuevo();
  const publicados = [];
  m._publicarEvento = async (ev, payload) => { publicados.push([ev, payload]); };

  const r = await crear(m, { tipo: 'llevar', nombre: 'Mijael' });
  const ev = publicados.find(([e]) => e === 'cuenta.creada');
  assert.ok(ev, 'no se publicó cuenta.creada');
  assert.strictEqual(ev[1].numero_pedido, r.data.numero_pedido);
  assert.strictEqual(ev[1].cliente_nombre, 'Mijael');
  assert.ok(ev[1].ref_display, 'ref_display debe seguir viajando para los consumidores viejos');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cuenta-numero-pedido] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cuenta-numero-pedido] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
