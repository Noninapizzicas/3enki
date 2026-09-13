/**
 * Tests unitarios — cola (CUSTODIO del taller 3D, F4 TANDA 3).
 *
 * Sin bus real: instancia el reflejo con eventBus stub (PosPersistencia degrada
 * sin fs real), y verifica las proyecciones del corazón:
 *   - encolar FIFO: orden por encolada_en
 *   - urgencia: urgente pasa al frente
 *   - siguiente solo con gcode_listo y una sola impresora (nunca dos IMPRIMIENDO)
 *   - reordenar EXIGE propuesta aprobada (CERO juicio: no reordena por su cuenta)
 *   - estados: ENCOLADA → IMPRIMIENDO → TERMINADA | CANCELADA
 *
 * Ejecutar: node modules/cola/tests/unit/cola.test.js
 */

'use strict';

const assert = require('assert');

const Cola = require('../../index.js');

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
  const m = new Cola();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

const PID = '3d';

(async () => {
  // ── 1. encolar FIFO por orden ──
  {
    const { m } = await setup();
    await m._encolar({ project_id: PID, modelo_id: 'mod_a', archivo_id: 'arc_1', gcode_listo: true });
    await m._encolar({ project_id: PID, modelo_id: 'mod_b', archivo_id: 'arc_2', gcode_listo: true });
    const r = await m._siguienteAImprimir({ project_id: PID });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.siguiente.modelo_id, 'mod_a', 'FIFO: primera encolada es la siguiente');
    assert.strictEqual(r.data.razon, 'listo');
  }
  console.log('✓ cola: encolar + siguiente en orden FIFO');

  // ── 2. urgencia pasa al frente ──
  {
    const { m } = await setup();
    await m._encolar({ project_id: PID, modelo_id: 'mod_a', archivo_id: 'arc_1', gcode_listo: true });
    await m._encolar({ project_id: PID, modelo_id: 'mod_b', archivo_id: 'arc_2', urgente: true, gcode_listo: true });
    const r = await m._siguienteAImprimir({ project_id: PID });
    assert.strictEqual(r.data.siguiente.modelo_id, 'mod_b', 'urgente al frente aunque entró después');
  }
  console.log('✓ cola: urgente pasa al frente');

  // ── 3. siguiente excluye lo que NO tiene gcode listo (MONEDA REAL) ──
  {
    const { m } = await setup();
    await m._encolar({ project_id: PID, modelo_id: 'mod_a', archivo_id: 'arc_1', gcode_listo: true });
    await m._encolar({ project_id: PID, modelo_id: 'mod_b', archivo_id: 'arc_2', gcode_listo: false });
    const r = await m._siguienteAImprimir({ project_id: PID });
    assert.strictEqual(r.data.siguiente.modelo_id, 'mod_a', 'solo la lista encadena; la no preparada no');
  }
  console.log('✓ cola: siguiente excluye piezas sin gcode listo');

  // ── 4. una sola impresora: nunca dos IMPRIMIENDO ──
  {
    const { m } = await setup();
    const e1 = await m._encolar({ project_id: PID, modelo_id: 'mod_a', archivo_id: 'arc_1', gcode_listo: true });
    const e2 = await m._encolar({ project_id: PID, modelo_id: 'mod_b', archivo_id: 'arc_2', gcode_listo: true });
    const id1 = e1.data.tarea.id;
    const id2 = e2.data.tarea.id;
    await m._marcarImprimiendo({ project_id: PID, id: id1 });
    // segunda intenta entrar
    const r2 = await m._marcarImprimiendo({ project_id: PID, id: id2 });
    assert.strictEqual(r2.status, 409, 'impresora ocupada: segunda rechazada');
    // siguiente con impresora ocupada -> NULO
    const sig = await m._siguienteAImprimir({ project_id: PID });
    assert.strictEqual(sig.data.siguiente, null, 'no hay siguiente con impresora ocupada');
  }
  console.log('✓ cola: una sola impresora (nunca dos IMPRIMIENDO)');

  // ── 5. reordenar EXIGE propuesta aprobada (CERO juicio) ──
  {
    const { m } = await setup();
    const a1 = await m._encolar({ project_id: PID, modelo_id: 'mod_a', archivo_id: 'arc_1', gcode_listo: true }); // tarea_1
    const a2 = await m._encolar({ project_id: PID, modelo_id: 'mod_b', archivo_id: 'arc_2', gcode_listo: true }); // tarea_2
    const id1 = a1.data.tarea.id, id2 = a2.data.tarea.id;
    // sin aprobación -> rechazado
    const sinAprobar = await m._reordenar({ project_id: PID, orden: [{ id: id2 }, { id: id1 }] });
    assert.strictEqual(sinAprobar.status, 409, 'sin propuesta aprobada no reordena');
    // aprobada por el dueño -> aplica
    const aprobada = await m._reordenar({ project_id: PID, aprobada_by: 'dueno', orden: [{ id: id2 }, { id: id1 }] });
    assert.strictEqual(aprobada.status, 200, 'orden aprobada se aplica');
    const sig = await m._siguienteAImprimir({ project_id: PID });
    assert.strictEqual(sig.data.siguiente.modelo_id, 'mod_b', 'orden aprobada respetada');
  }
  console.log('✓ cola: reordenar exige propuesta aprobada (CERO juicio)');

  // ── 6. ciclo de estados ENCOLADA → IMPRIMIENDO → TERMINADA ──
  {
    const { m } = await setup();
    const a1 = await m._encolar({ project_id: PID, modelo_id: 'mod_a', archivo_id: 'arc_1', gcode_listo: true }); // tarea_1
    const id1 = a1.data.tarea.id;
    await m._marcarImprimiendo({ project_id: PID, id: id1 });
    let t = m.tareas.get(`3d:${id1}`);
    assert.strictEqual(t.estado, 'IMPRIMIENDO');
    const r = await m._marcarTerminada({ project_id: PID, id: id1 });
    assert.strictEqual(r.status, 200);
    t = m.tareas.get(`3d:${id1}`);
    assert.strictEqual(t.estado, 'TERMINADA');
    // impresora liberada -> vuelve a haber siguiente si quedan
    await m._encolar({ project_id: PID, modelo_id: 'mod_b', archivo_id: 'arc_2', gcode_listo: true }); // tarea_2
    const sig = await m._siguienteAImprimir({ project_id: PID });
    assert.strictEqual(sig.data.siguiente.modelo_id, 'mod_b', 'impresora liberada tras terminar');
  }
  console.log('✓ cola: ciclo de estados y liberación de impresora');

  // ── 7. cancelar rechaza en IMPRIMIENDO, permite en ENCOLADA ──
  {
    const { m } = await setup();
    const c1 = await m._encolar({ project_id: PID, modelo_id: 'mod_a', archivo_id: 'arc_1', gcode_listo: true }); // tarea_1
    const c2 = await m._encolar({ project_id: PID, modelo_id: 'mod_b', archivo_id: 'arc_2', gcode_listo: true }); // tarea_2
    const id1 = c1.data.tarea.id, id2 = c2.data.tarea.id;
    await m._marcarImprimiendo({ project_id: PID, id: id1 });
    const r1 = await m._cancelar({ project_id: PID, id: id1 });
    assert.strictEqual(r1.status, 409, 'no cancela en IMPRIMIENDO');
    const r2 = await m._cancelar({ project_id: PID, id: id2 });
    assert.strictEqual(r2.status, 200, 'cancela encolada');
    assert.strictEqual(m.tareas.get(`3d:${id2}`).estado, 'CANCELADA');
  }
  console.log('✓ cola: cancelar (no en IMPRIMIENDO)');

  // ── 8. validaciones ──
  {
    const { m } = await setup();
    const noPid = await m._encolar({ modelo_id: 'm', archivo_id: 'a' });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noMod = await m._encolar({ project_id: PID, archivo_id: 'a' });
    assert.strictEqual(noMod.status, 400, 'exige modelo_id');
    const noOrden = await m._reordenar({ project_id: PID, aprobada_by: 'x', orden: [] });
    assert.strictEqual(noOrden.status, 400, 'exige orden no vacío');
  }
  console.log('✓ cola: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE COLA PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
