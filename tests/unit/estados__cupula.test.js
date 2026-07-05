'use strict';

/**
 * estados__cupula — la cúpula de estados (reflejo custodio de listas ordenadas).
 * Un primitivo, muchas caras. Freno entre pasos en orden estricto. Instanciar
 * desde plantilla de proceso (PRISMA hereda). fs en memoria (stub de _rpc).
 *
 * Ejecutar: node tests/unit/estados__cupula.test.js
 */

const assert = require('assert');
const EstadosReflejo = require('../../modules/estados');

// ── arnés: instancia con fs en memoria ──
function nuevo() {
  const r = new EstadosReflejo();
  const fs = new Map(); // `${project_id}::${path}` → content string
  r.logger = { info() {}, warn() {}, error() {}, debug() {} };
  r.metrics = { increment() {} };
  r.eventBus = { publish() {} };
  r._rpc = async (evento, payload) => {
    const key = `${payload.project_id}::${payload.path}`;
    if (evento === 'fs.read.request') {
      return fs.has(key) ? { status: 200, content: fs.get(key) } : { status: 404 };
    }
    if (evento === 'fs.write.request') { fs.set(key, payload.content); return { status: 200 }; }
    return null;
  };
  return r;
}

const PID = 'proj-test';
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('crear lista libre → 201 y estado la muestra con pasos pendientes', async () => {
  const r = nuevo();
  const c = await r._crear({ project_id: PID, nombre: 'Compras', tipo: 'compras', pasos: ['leche', 'pan', 'huevos'] });
  assert.strictEqual(c.status, 201);
  assert.strictEqual(c.data.orden, 'libre');
  assert.strictEqual(c.data.total_pasos, 3);
  const e = await r._estado({ project_id: PID, lista_id: 'compras' });
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.data.lista.pasos.length, 3);
  assert.ok(e.data.lista.pasos.every(p => p.estado === 'pendiente'));
});

test('crear duplicado → 409', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Tareas' });
  const dup = await r._crear({ project_id: PID, nombre: 'Tareas' });
  assert.strictEqual(dup.status, 409);
});

test('orden estricto: avanzar sin el campo del freno → atascado + faltan; con el campo → avanza', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Envio', orden: 'estricto', pasos: [
    { clave: 'recoge', texto: 'Recoge' },
    { clave: 'realiza', texto: 'Realiza', freno: { requiere: ['hecho'] } },
    { clave: 'entrega', texto: 'Entrega' }
  ] });
  // paso 0 (recoge) sin freno → avanza directo
  const a0 = await r._avanzar({ project_id: PID, lista_id: 'envio' });
  assert.strictEqual(a0.data.avanzado, true);
  // paso 1 (realiza) con freno requiere:['hecho'] → sin entrega → atascado
  const a1 = await r._avanzar({ project_id: PID, lista_id: 'envio' });
  assert.strictEqual(a1.data.avanzado, false);
  assert.strictEqual(a1.data.atascado, true);
  assert.deepStrictEqual(a1.data.faltan, ['hecho']);
  // ahora con la entrega válida → avanza, siguiente recoge
  const a1b = await r._avanzar({ project_id: PID, lista_id: 'envio', entrega: { hecho: true } });
  assert.strictEqual(a1b.data.avanzado, true);
  assert.ok(a1b.data.siguiente);
  // paso 2 (entrega) sin freno → avanza y completa
  const a2 = await r._avanzar({ project_id: PID, lista_id: 'envio' });
  assert.strictEqual(a2.data.completa, true);
});

test('avanzar en lista LIBRE → 409 (avanzar es de orden estricto)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Notas', pasos: ['idea'] });
  const a = await r._avanzar({ project_id: PID, lista_id: 'notas' });
  assert.strictEqual(a.status, 409);
});

test('marcar en libre: tachar un paso; todos cerrados → lista completa', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Compra', pasos: ['leche', 'pan'] });
  let e = await r._estado({ project_id: PID, lista_id: 'compra' });
  const [p0, p1] = e.data.lista.pasos;
  await r._marcar({ project_id: PID, lista_id: 'compra', paso_id: p0.id, estado: 'hecho' });
  const m = await r._marcar({ project_id: PID, lista_id: 'compra', paso_id: p1.id, estado: 'hecho' });
  assert.strictEqual(m.status, 200);
  e = await r._estado({ project_id: PID, lista_id: 'compra' });
  assert.strictEqual(e.data.lista.estado, 'completa');
});

test('instanciar servicio → proceso de 4 pasos, orden estricto, frenos en realiza y cobra', async () => {
  const r = nuevo();
  const i = await r._instanciar({ project_id: PID, arquetipo: 'servicio', nombre: 'Corte de pelo' });
  assert.strictEqual(i.status, 201);
  assert.strictEqual(i.data.arquetipo, 'servicio');
  assert.strictEqual(i.data.orden, 'estricto');
  assert.strictEqual(i.data.total_pasos, 4);
  const e = await r._estado({ project_id: PID, lista_id: 'corte_de_pelo' });
  const frenados = e.data.lista.pasos.filter(p => p.freno).map(p => p.freno.requiere.join(','));
  assert.deepStrictEqual(frenados, ['hecho', 'pagado']);
});

test('instanciar arquetipo desconocido → 404', async () => {
  const r = nuevo();
  const i = await r._instanciar({ project_id: PID, arquetipo: 'no_existe' });
  assert.strictEqual(i.status, 404);
});

test('instanciar uso_temporal → proceso alquiler con freno en devuelve (estado_ok)', async () => {
  const r = nuevo();
  await r._instanciar({ project_id: PID, arquetipo: 'uso_temporal', nombre: 'Alquiler bici' });
  const e = await r._estado({ project_id: PID, lista_id: 'alquiler_bici' });
  const devuelve = e.data.lista.pasos.find(p => p.id.includes('devuelve'));
  assert.ok(devuelve && devuelve.freno);
  assert.deepStrictEqual(devuelve.freno.requiere, ['estado_ok']);
});

test('añadir un paso a una lista existente → total crece', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Pendientes', pasos: ['a'] });
  const add = await r._anadir({ project_id: PID, lista_id: 'pendientes', texto: 'b' });
  assert.strictEqual(add.status, 200);
  assert.strictEqual(add.data.total_pasos, 2);
});

test('activar + estado sin lista_id devuelve la ACTIVA (lo que lee el nervio)', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Uno', pasos: ['x'] });
  await r._crear({ project_id: PID, nombre: 'Dos', pasos: ['y'] });
  await r._activar({ project_id: PID, lista_id: 'dos' });
  const e = await r._estado({ project_id: PID }); // sin lista_id → activa
  assert.strictEqual(e.data.lista.id, 'dos');
  assert.strictEqual(e.data.activa, true);
});

test('estado sin activa ni lista_id → { activa:null, lista:null } (el nervio no inyecta nada)', async () => {
  const r = nuevo();
  const e = await r._estado({ project_id: PID });
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.data.lista, null);
});

test('borrar una lista → desaparece y limpia la activa', async () => {
  const r = nuevo();
  await r._crear({ project_id: PID, nombre: 'Temp', pasos: ['z'], activar: true });
  const b = await r._borrar({ project_id: PID, lista_id: 'temp' });
  assert.strictEqual(b.status, 200);
  const l = await r._listar({ project_id: PID });
  assert.strictEqual(l.data.total, 0);
  assert.strictEqual(l.data.activa, null);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[estados__cupula] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[estados__cupula] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();
