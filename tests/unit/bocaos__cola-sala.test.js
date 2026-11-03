'use strict';

/**
 * bocaos/cola-sala — P01 · O03 · P02. La única cola de la sala.
 *
 * Lo que se vigila:
 *   1. Una sola cola; el tipo es forma cerrada y el caso entra con su traza.
 *   2. Prioridad por hechos (tiempo y pedidos), y vencer empuja sin cerrar.
 *   3. Un caso sale con un hecho que lo cierra, no se borra.
 *   4. La revisión es de esta plaza; la vista de una parte no muestra a la otra.
 *   5. Las dos puertas (aviso e incidencia) llevan a la MISMA fila.
 *   6. La cola no se vacía al reiniciar.
 *
 * Ejecutar: node tests/unit/bocaos__cola-sala.test.js
 */

const assert = require('assert');
const ColaSala = require('../../modules/bocaos/cola-sala/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PLAZA = 'plaza-malaga';
const TRAZA = { cargo_id: 'cg-1', espera_min: 11 };

function nuevo() {
  const publicados = [];
  const m = new ColaSala();
  m.eventBus = {
    publish(ev, p) { publicados.push({ ev, p: JSON.parse(JSON.stringify(p ?? {})) }); },
    subscribe() { return () => {}; }
  };
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._rpc = async () => null;
  return { m, eventos: (ev) => publicados.filter((x) => x.ev === ev) };
}

const encolar = (m, extra) => m.onEncolarRequest({
  request_id: 'e',
  data: { project_id: PLAZA, caso_id: 'dp-1', tipo: 'disputa', traza: TRAZA, pedido_id: 'ped-1', ...extra }
});

test('una sola cola: el caso entra con su traza y se ve en el bus', async () => {
  const { m, eventos } = nuevo();
  const r = await encolar(m);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.caso.caso_id, 'dp-1');
  assert.strictEqual(r.data.caso.estado, 'ABIERTO');
  assert.deepStrictEqual(r.data.caso.traza, TRAZA);
  assert.strictEqual(r.data.caso.prioridad, 2, 'un pedido afectado × 2');
  assert.strictEqual(r.data.caso.pedidos_afectados, 1);

  const h = eventos('bocaos.caso_encolado')[0].p;
  assert.strictEqual(h.tipo, 'disputa');
  assert.strictEqual(h.prioridad, 2);
  assert.deepStrictEqual(h.parte_afectada === undefined ? null : h.parte_afectada, null);
});

test('la forma es cerrada: un tipo que no está no entra, y sin traza tampoco', async () => {
  const { m, eventos } = nuevo();
  const tipo = await encolar(m, { tipo: 'lo_que_sea' });
  assert.strictEqual(tipo.status, 400);
  assert.strictEqual(tipo.error.code, 'TIPO_NO_DECLARADO');

  const sinTraza = await encolar(m, { traza: null });
  assert.strictEqual(sinTraza.status, 409);
  assert.strictEqual(sinTraza.error.code, 'SIN_TRAZA');
  assert.strictEqual(eventos('bocaos.caso_encolado').length, 0);
});

test('las dos puertas llevan a la misma fila: un caso, una entrada', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  const otra = await encolar(m);
  assert.strictEqual(otra.status, 200);
  assert.strictEqual(otra.data.idempotente, true);
  assert.strictEqual(eventos('bocaos.caso_encolado').length, 1);

  // Y el aviso anuncia el mismo caso: no aparece dos veces (I07).
  await m.onAvisoSalaCaso({ data: {
    project_id: PLAZA, plaza_id: PLAZA, caso_id: 'dp-1', tipo: 'disputa', traza: TRAZA, caso: { caso_id: 'dp-1', tipo: 'disputa' }
  } });
  assert.strictEqual(eventos('bocaos.caso_encolado').length, 1);
});

test('la incidencia entra por la misma cola, con su relato como traza (F06/P01)', async () => {
  const { m, eventos } = nuevo();
  await m.onIncidenciaAbierta({ data: {
    project_id: PLAZA, pedido_id: 'ped-7', relato: 'el portal no existía', autor: 'rider-ana', hora: '2026-11-04T20:00:00.000Z'
  } });
  const h = eventos('bocaos.caso_encolado')[0].p;
  assert.strictEqual(h.tipo, 'incidencia');
  assert.strictEqual(h.traza.relato, 'el portal no existía');
  assert.strictEqual(h.pedidos_afectados, 1);
});

test('vencer NO resuelve: el caso sigue vivo y con más prioridad', async () => {
  const { m } = nuevo();
  await encolar(m, { plazo: '2026-01-01T00:00:00.000Z' });
  const lista = await m.onListarRequest({ request_id: 'l', data: { project_id: PLAZA } });
  assert.strictEqual(lista.status, 200);
  assert.strictEqual(lista.data.casos.length, 1, 'sigue en la cola');
  const c = lista.data.casos[0];
  assert.strictEqual(c.vencido, true);
  assert.strictEqual(c.prioridad, 7, '2 por el pedido + 5 por vencido');
  assert.strictEqual(c.estado, 'ABIERTO');
});

test('la prioridad es por hechos: tiempo esperando y pedidos afectados', async () => {
  const { m } = nuevo();
  await encolar(m, { caso_id: 'a', pedido_id: 'p1', pedidos_afectados: 0, traza: { x: 1 } });
  await encolar(m, { caso_id: 'b', pedido_id: 'p2', pedidos_afectados: 3, traza: { x: 2 } });
  // El caso 'a' lleva esperando desde hace 10 horas; el 'b' acaba de entrar.
  const est = await m.estado(PLAZA);
  est.casos.a.encolado_en = new Date(Date.now() - 10 * 3600000).toISOString();
  const lista = await m.onListarRequest({ request_id: 'l', data: { project_id: PLAZA } });
  assert.deepStrictEqual(lista.data.casos.map((c) => c.caso_id), ['a', 'b'], '10 h pesan más que 3 pedidos');
  assert.ok(lista.data.casos[0].horas_esperando >= 9.9);
  assert.strictEqual(lista.data.formula.includes('pedidos afectados'), true, 'la fórmula se dice');
});

test('un caso sale con un hecho que lo cierra, no se borra', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  const sinHecho = await m.onCerrarRequest({ request_id: 'c', data: { project_id: PLAZA, caso_id: 'dp-1', por: 'duena', por_que: 'ya está' } });
  assert.strictEqual(sinHecho.status, 409);
  assert.strictEqual(sinHecho.error.code, 'SIN_HECHO_DE_CIERRE');

  const inventado = await m.onCerrarRequest({ request_id: 'c2', data: { project_id: PLAZA, caso_id: 'dp-1', por: 'duena', por_que: 'x', hecho_cierre: 'lo_borro' } });
  assert.strictEqual(inventado.status, 409);

  const bien = await m.onCerrarRequest({ request_id: 'c3', data: {
    project_id: PLAZA, caso_id: 'dp-1', por: 'duena', por_que: 'el dictamen compensa al rider', hecho_cierre: 'dictamen', dictamen_id: 'dt-1'
  } });
  assert.strictEqual(bien.status, 200);
  assert.strictEqual(bien.data.caso.estado, 'CERRADO');
  assert.strictEqual(bien.data.caso.hecho_cierre, 'dictamen');
  assert.strictEqual(eventos('bocaos.caso_cerrado')[0].p.hecho_cierre, 'dictamen');

  const otraVez = await encolar(m);
  assert.strictEqual(otraVez.status, 409, 'un caso cerrado no se reabre');
  assert.strictEqual(otraVez.error.code, 'CASO_CERRADO');
});

test('un dictamen firmado cierra el caso que nombra', async () => {
  const { m, eventos } = nuevo();
  await encolar(m);
  await m.onDictamenFirmado({ data: {
    project_id: PLAZA, caso_id: 'dp-1', dictamen_id: 'dt-9', motivo: 'se compensa', firmante: { id: 'duena' }
  } });
  const h = eventos('bocaos.caso_cerrado')[0].p;
  assert.strictEqual(h.caso_id, 'dp-1');
  assert.strictEqual(h.hecho_cierre, 'dictamen');
  assert.strictEqual(h.cerrado_por, 'duena');
});

test('uno solo lo tiene: dos personas sobre un caso es una que se queda sin él', async () => {
  const { m } = nuevo();
  await encolar(m);
  const a = await m.onTomarRequest({ request_id: 't', data: { project_id: PLAZA, caso_id: 'dp-1', por: 'sala-1' } });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.data.caso.dueno, 'sala-1');
  const b = await m.onTomarRequest({ request_id: 't2', data: { project_id: PLAZA, caso_id: 'dp-1', por: 'sala-2' } });
  assert.strictEqual(b.status, 409);
  assert.strictEqual(b.error.code, 'YA_TOMADO');
});

test('la revisión es de ESTA plaza: no entra un caso ajeno ni uno del nacional (O03)', async () => {
  const { m, eventos } = nuevo();
  const ajeno = await encolar(m, { plaza_id: 'plaza-bilbao' });
  assert.strictEqual(ajeno.status, 409);
  assert.strictEqual(ajeno.error.code, 'CRUZA_DE_PLAZA');

  const nacional = await encolar(m, { ambito: 'nacional' });
  assert.strictEqual(nacional.status, 409);
  assert.strictEqual(nacional.error.code, 'NO_ES_DE_ESTA_PLAZA');
  assert.strictEqual(eventos('bocaos.caso_encolado').length, 0);
});

test('la vista de una parte no muestra a la otra (P02)', async () => {
  const { m } = nuevo();
  await encolar(m, {
    caso_id: 'dp-2', tipo: 'disputa',
    partes: ['rider-ana', 'tienda-paco'], parte_id: 'rider-ana',
    traza: { cargo_id: 'cg-1', deudor: 'rider-ana', acreedor: 'tienda-paco', espera_min: 11 }
  });
  const r = await m.onListarRequest({ request_id: 'l', data: { project_id: PLAZA, parte_id: 'rider-ana' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.casos.length, 1);
  const c = r.data.casos[0];
  assert.strictEqual(c.hay_otra_parte, true);
  assert.strictEqual(c.traza.acreedor, undefined, 'el nombre de la otra parte no cruza');
  assert.strictEqual(c.traza.deudor, undefined);
  assert.strictEqual(c.traza.cargo_id, 'cg-1', 'su traza sí');
  assert.ok(/no_visible/.test(Object.keys(c).join(',')));

  const ajeno = await m.onListarRequest({ request_id: 'l2', data: { project_id: PLAZA, parte_id: 'tienda-otra' } });
  assert.strictEqual(ajeno.data.casos.length, 0, 'la vista no muestra casos de otras partes');
});

test('el hueco se pega a la traza del caso de ese pedido, y no crea casos', async () => {
  const { m, eventos } = nuevo();
  await encolar(m, { pedido_id: 'ped-1' });
  const antes = eventos('bocaos.caso_encolado').length;
  await m.onHuecoNombrado({ data: { project_id: PLAZA, pedido_id: 'ped-1', hueco: 'sin posición fresca', motivo: 'el rider no declaró posición' } });
  assert.strictEqual(eventos('bocaos.caso_encolado').length, antes, 'un hueco no es un caso');

  const lista = await m.onListarRequest({ request_id: 'l', data: { project_id: PLAZA } });
  const c = lista.data.casos[0];
  assert.strictEqual(c.huecos.length, 1);
  assert.strictEqual(c.traza.huecos[0].hueco, 'sin posición fresca');
});

test('la cola no se vacía al reiniciar: el estado es del proyecto', async () => {
  const { m } = nuevo();
  await encolar(m);
  const guardado = await m.estado(PLAZA);
  assert.ok(guardado.casos['dp-1'], 'la cola vive en el store del proyecto');

  // Un módulo nuevo que lee el mismo store (simulado con el estado ya hidratado) ve el caso.
  const m2 = new ColaSala();
  m2.eventBus = { publish() {}, subscribe() { return () => {}; } };
  m2.logger = { info() {}, warn() {}, error() {} };
  m2.metrics = { increment() {} };
  m2._mem.set(PLAZA, JSON.parse(JSON.stringify(guardado)));
  const lista = await m2.onListarRequest({ request_id: 'l', data: { project_id: PLAZA } });
  assert.strictEqual(lista.data.casos.length, 1);
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
