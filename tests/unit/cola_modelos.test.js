'use strict';
// Test unitario del reflejo cola_modelos (PASO 1) — invariantes de la cripta.
// Se instancia la clase y se conducen las proyecciones directamente (payload
// plano, igual que hace _atender de la base) contra el estado en memoria.

const assert = require('assert');
const ColaModelosReflejo = require('../../modules/cola_modelos/index.js');

const PID = 'pid-test';
const ok = (r, status) => { assert.strictEqual(r.status, status, JSON.stringify(r)); return r; };
const dataDe = (r) => r.data;

let fails = 0;
async function check(nombre, fn) {
  try { await fn(); console.log('  [OK]', nombre); }
  catch (e) { fails++; console.log('  [FALLA]', nombre, '—', e.message); }
}

async function main() {
  const m = new ColaModelosReflejo();
  m.eventBus = { publish: async () => {} };
  m.logger = { info() {}, error() {} };
  m.metrics = { increment() {} };

  console.log('cola_modelos — invariantes');

  ok(await m._agregar({ project_id: PID, nombre: 'Shelf-izquierda', prioridad: 3 }), 201);
  ok(await m._agregar({ project_id: PID, nombre: 'Shelf-derecha', prioridad: 5 }), 201);

  await check('agregar deja estado PENDIENTE y lista ordena por prioridad', async () => {
    const lista = dataDe(await m._listar({ project_id: PID, estado: 'PENDIENTE' }));
    assert.ok(lista.modelos.some(x => x.nombre === 'Shelf-derecha' && x.estado === 'PENDIENTE'));
  });

  ok(await m._agregar({ project_id: PID, nombre: 'Dupe1', prioridad: 1, origen: 'www', ref: 'fichaA' }), 201);
  const dupe = await m._agregar({ project_id: PID, nombre: 'Dupe2', prioridad: 1, origen: 'www', ref: 'fichaA' });

  await check('dedupe (origen,ref) marca duplicado y no lo añade', () => {
    assert.strictEqual(dupe.data.añadidos.length, 0);
    assert.strictEqual(dupe.data.duplicados.length, 1);
    assert.strictEqual(dupe.data.duplicados[0].motivo, 'duplicado');
  });

  const prop = dataDe(await m._obtenerPorPrioridad({ project_id: PID }));
  await check('propuesta determinista elige el de mayor prioridad', () => {
    assert.strictEqual(prop.modelo.prioridad, 5);
  });

  const imprimiendo = await m._actualizarEstado({ project_id: PID, id: prop.modelo.id, estado: 'IMPRIMIENDO' });
  await check('PENDIENTE→IMPRIMIENDO es legal', () => {
    assert.strictEqual(imprimiendo.data.modelo.estado, 'IMPRIMIENDO');
  });

  const invalida = await m._actualizarEstado({ project_id: PID, id: prop.modelo.id, estado: 'PENDIENTE' });
  await check('transición inválida (IMPRIMIENDO→PENDIENTE) se rechaza 409', () => {
    assert.strictEqual(invalida.status, 409);
    assert.strictEqual(invalida.error.code, 'CONFLICT_STATE');
  });

  await check('la pieza IMPRIMIENDO ya no es candidata pendiente', async () => {
    const cand = await m._obtenerPorPrioridad({ project_id: PID });
    assert.notStrictEqual(cand.data.modelo.id, prop.modelo.id);
  });

  const otroPendiente = dataDe(await m._obtenerPorPrioridad({ project_id: PID }));
  const singleton = await m._actualizarEstado({ project_id: PID, id: otroPendiente.modelo.id, estado: 'IMPRIMIENDO' });
  await check('singleton imprimiendo: 2ª pieza a IMPRIMIENDO → 409', () => {
    assert.strictEqual(singleton.status, 409);
    assert.strictEqual(singleton.error.code, 'CONFLICT_STATE');
  });

  const impreso = await m._actualizarEstado({ project_id: PID, id: prop.modelo.id, estado: 'IMPRESO' });
  const vivos = dataDe(await m._listar({ project_id: PID }));
  await check('IMPRIMIENDO→IMPRESO mueve a histórico y sale de la cola viva', () => {
    assert.strictEqual(impreso.status, 200);
    assert.ok(!vivos.modelos.some(x => x.id === prop.modelo.id));
  });

  const vacia = await m._obtenerPorPrioridad({ project_id: 'pid-vacio' });
  await check('cola vacía → 404 RESOURCE_NOT_FOUND cola_vacia', () => {
    assert.strictEqual(vacia.status, 404);
    assert.strictEqual(vacia.error.code, 'RESOURCE_NOT_FOUND');
  });

  console.log(fails === 0 ? '\nTEST OK — todas las invariantes pasan.' : `\nTEST FALLA — ${fails} chequeo(s) fallido(s).`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('ERROR en test:', e); process.exit(1); });
