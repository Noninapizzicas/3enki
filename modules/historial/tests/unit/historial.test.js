/**
 * Tests unitarios — historial (REFLEJO append-only del taller 3D, F4 TANDA 1).
 *
 * Sin bus real: instancia con eventBus en memoria y llama a las proyecciones. Verifica:
 *   - append-only: registrar añade, nunca reescribe; count crece
 *   - emite impresion.registrada siempre, pieza.imprimida SOLO con resultado OK
 *   - dato MEDIDO obligatorio (gramos_reales, tiempo_real): CERO estimación
 *   - por_modelo / recientes ordenados
 *   - borrar asiento: único permitido = erróneo; asiento OK se corrige (CANCELADA)
 *
 * Ejecutar: node modules/historial/tests/unit/historial.test.js
 */

'use strict';

const assert = require('assert');

const Historial = require('../../index.js');

function makeMocks() {
  const published = [];
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const metrics = { increment: () => {} };
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  return { published, logger, metrics, eventBus };
}

async function setup() {
  const mocks = makeMocks();
  const m = new Historial();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

const ok = { modelo_id: 'mod_a', resultado: 'OK', gramos_reales: 12.5, tiempo_real: 95, formato_origen: 'GCODE', filamento: 'PETG' };
const fallida = { modelo_id: 'mod_a', resultado: 'FALLIDA', gramos_reales: 8, tiempo_real: 40, formato_origen: 'GCODE' };

(async () => {
  // ── 1. append-only: añade, nunca reescribe ──
  {
    const { m, published } = await setup();
    const r1 = await m._registrar({ project_id: 'proj-3d', ...ok });
    assert.strictEqual(r1.status, 201);
    const r2 = await m._registrar({ project_id: 'proj-3d', ...fallida });
    assert.strictEqual(r2.status, 201);
    const list = await m._recientes({ project_id: 'proj-3d', n: 10 });
    assert.strictEqual(list.data.registros.length, 2, 'dos asientos, append-only');
    assert.notStrictEqual(r1.data.registro.id, r2.data.registro.id, 'ids distintos');

    const evtNames = published.map(p => p[0]);
    assert.strictEqual(evtNames.filter(e => e === 'impresion.registrada').length, 2, 'impresion.registrada x2');
    assert.strictEqual(evtNames.filter(e => e === 'pieza.imprimida').length, 1, 'pieza.imprimida solo el OK');
  }
  console.log('✓ historial: append-only + pieza.imprimida solo con OK');

  // ── 2. dato MEDIDO obligatorio (CERO estimación) ──
  {
    const { m } = await setup();
    const sinGramos = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_a', resultado: 'OK', tiempo_real: 95 });
    assert.strictEqual(sinGramos.status, 400, 'sin gramos_reales → rechaza');
    const sinTiempo = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_a', resultado: 'OK', gramos_reales: 10 });
    assert.strictEqual(sinTiempo.status, 400, 'sin tiempo_real → rechaza');
    const mal = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_a', resultado: 'RARO', gramos_reales: 10, tiempo_real: 5 });
    assert.strictEqual(mal.status, 400, 'resultado inválido → rechaza');
  }
  console.log('✓ historial: dato MEDIDO obligatorio (CERO estimación)');

  // ── 3. por_modelo ordenado (reciente primero) ──
  {
    const { m } = await setup();
    await m._registrar({ project_id: 'p', modelo_id: 'A', resultado: 'OK', gramos_reales: 1, tiempo_real: 2, fecha: '2026-01-01T00:00:00Z' });
    await m._registrar({ project_id: 'p', modelo_id: 'A', resultado: 'CANCELADA', gramos_reales: 1, tiempo_real: 2, fecha: '2026-01-02T00:00:00Z' });
    await m._registrar({ project_id: 'p', modelo_id: 'B', resultado: 'OK', gramos_reales: 3, tiempo_real: 4, fecha: '2026-01-03T00:00:00Z' });
    const deA = await m._porModelo({ project_id: 'p', modelo_id: 'A' });
    assert.strictEqual(deA.data.registros.length, 2);
    assert.strictEqual(deA.data.registros[0].fecha, '2026-01-02T00:00:00Z', 'reciente primero');
  }
  console.log('✓ historial: por_modelo + recientes');

  // ── 4. borrar asiento: solo erróneo permitido; OK se corrige (CANCELADA) ──
  {
    const { m } = await setup();
    const okR = await m._registrar({ project_id: 'p', modelo_id: 'A', resultado: 'OK', gramos_reales: 1, tiempo_real: 2 });
    const okId = okR.data.registro.id;
    const fallR = await m._registrar({ project_id: 'p', modelo_id: 'B', resultado: 'FALLIDA', gramos_reales: 1, tiempo_real: 2 });
    const fallId = fallR.data.registro.id;

    const delErr = await m._borrarAsiento({ project_id: 'p', registro_id: fallId });
    assert.strictEqual(delErr.data.eliminado, true, 'borra asiento no-OK');

    const delOK = await m._borrarAsiento({ project_id: 'p', registro_id: okId });
    assert.strictEqual(delOK.data.corregido, true, 'asiento OK se corrige, no se borra (encadenamiento ya emitido)');
    assert.strictEqual(delOK.data.registro.resultado, 'CANCELADA', 'queda como CANCELADA');

    const delNf = await m._borrarAsiento({ project_id: 'p', registro_id: 'reg_x' });
    assert.strictEqual(delNf.status, 404, '404 si no existe');
  }
  console.log('✓ historial: borrar solo asiento erróneo');

  // ── 5. aislamiento por proyecto ──
  {
    const { m } = await setup();
    await m._registrar({ project_id: 'p1', modelo_id: 'A', resultado: 'OK', gramos_reales: 1, tiempo_real: 2 });
    await m._registrar({ project_id: 'p2', modelo_id: 'A', resultado: 'OK', gramos_reales: 9, tiempo_real: 2 });
    const deB1 = await m._porModelo({ project_id: 'p1', modelo_id: 'A' });
    const deB2 = await m._porModelo({ project_id: 'p2', modelo_id: 'A' });
    assert.strictEqual(deB1.data.registros[0].gramos_reales, 1);
    assert.strictEqual(deB2.data.registros[0].gramos_reales, 9, 'proyectos aislados');
  }
  console.log('✓ historial: aislamiento por proyecto');

  // ── 6. validaciones de forma ──
  {
    const { m } = await setup();
    const noPid = await m._registrar({ modelo_id: 'A', resultado: 'OK', gramos_reales: 1, tiempo_real: 2 });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noMod = await m._registrar({ project_id: 'p', resultado: 'OK', gramos_reales: 1, tiempo_real: 2 });
    assert.strictEqual(noMod.status, 400, 'exige modelo_id');
  }
  console.log('✓ historial: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE HISTORIAL PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
