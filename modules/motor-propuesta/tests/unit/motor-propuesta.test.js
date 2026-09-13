/**
 * Tests unitarios — motor-propuesta (REFLEJO del taller 3D, F4 TANDA 3).
 *
 * Sin bus real: instancia el reflejo con eventBus stub y verifica la proyección
 * _proponerOrden directamente (PROPONE, no muta; CERO juicio):
 *   - FIFO por antigüedad de encolado
 *   - urgencia pasa al frente
 *   - preferencia a piezas YA preparadas (gcode_listo) frente a no preparadas
 *   - devuelve SOLO propuesta (no toca el store de la cola, no marca nada)
 *
 * Ejecutar: node modules/motor-propuesta/tests/unit/motor-propuesta.test.js
 */

'use strict';

const assert = require('assert');

const MotorPropuesta = require('../../index.js');

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
  const m = new MotorPropuesta();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

const PID = '3d';

(async () => {
  // ── 1. FIFO por antigüedad ──
  {
    const { m } = await setup();
    const r = await m._proponerOrden({
      project_id: PID,
      tareas: [
        { id: 't1', encolada_en: '2026-09-13T10:00:00Z', gcode_listo: true },
        { id: 't2', encolada_en: '2026-09-13T11:00:00Z', gcode_listo: true }
      ]
    });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.orden.map(o => o.id), ['t1', 't2'], 'FIFO por antigüedad');
    assert.strictEqual(r.data.propuesta, true, 'es una propuesta');
  }
  console.log('✓ motor-propuesta: FIFO por antigüedad');

  // ── 2. urgencia pasa al frente ──
  {
    const { m } = await setup();
    const r = await m._proponerOrden({
      project_id: PID,
      tareas: [
        { id: 't_antigua', encolada_en: '2026-09-13T10:00:00Z', gcode_listo: true },
        { id: 't_urge', encolada_en: '2026-09-13T12:00:00Z', urgente: true, gcode_listo: true }
      ]
    });
    assert.deepStrictEqual(r.data.orden.map(o => o.id), ['t_urge', 't_antigua'], 'urgente primero');
  }
  console.log('✓ motor-propuesta: urgencia al frente');

  // ── 3. preferencia a preparadas (gcode_listo) ──
  {
    const { m } = await setup();
    const r = await m._proponerOrden({
      project_id: PID,
      tareas: [
        { id: 't_lista', encolada_en: '2026-09-13T12:00:00Z', gcode_listo: true },
        { id: 't_vieja_no_lista', encolada_en: '2026-09-13T10:00:00Z', gcode_listo: false }
      ]
    });
    // la lista (aunque es más reciente) va delante de la no preparada (vieja)
    assert.deepStrictEqual(r.data.orden.map(o => o.id), ['t_lista', 't_vieja_no_lista'], 'preferencia a preparadas');
  }
  console.log('✓ motor-propuesta: preferencia a piezas preparadas');

  // ── 4. CERO juicio: solo produce la orden, no muta ni marca estados ──
  {
    const { m, published } = await setup();
    const r = await m._proponerOrden({
      project_id: PID,
      tareas: [{ id: 't1', gcode_listo: true }, { id: 't2', gcode_listo: true }]
    });
    assert.strictEqual(r.status, 200);
    // no debe emitir cola.actualizada ni ninguna mutación de la cola
    const eventos = published.map(p => p[0]);
    assert.ok(!eventos.includes('cola.actualizada'), 'no muta la cola');
    assert.ok(!eventos.some(e => e.startsWith('cola.')), 'la propuesta no publica eventos de cola');
  }
  console.log('✓ motor-propuesta: CERO juicio (no muta, solo propone)');

  // ── 5. validaciones ──
  {
    const { m } = await setup();
    const noPid = await m._proponerOrden({ tareas: [] });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noTareas = await m._proponerOrden({ project_id: PID, tareas: 'nope' });
    assert.strictEqual(noTareas.status, 400, 'exige tareas array');
  }
  console.log('✓ motor-propuesta: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE MOTOR-PROPUESTA PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
