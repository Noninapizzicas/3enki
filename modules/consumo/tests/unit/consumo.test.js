/**
 * Tests unitarios — consumo (REFLEJO del taller 3D, F4 TANDA 2).
 *
 * Sin bus real: instancia el reflejo con eventBus stub, acumula muestras vía
 * onImpresionRegistrada y verifica las proyecciones directamente:
 *   - promedio usa dato MEDIDO del historial
 *   - sin muestras -> NULO (CERO estimación, no conjetura)
 *   - pronóstico de tanda suma promedios; hueco sin dato -> total NULO
 *
 * Ejecutar: node modules/consumo/tests/unit/consumo.test.js
 */

'use strict';

const assert = require('assert');

const Consumo = require('../../index.js');

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
  const m = new Consumo();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

async function acumular(m, pid, modeloId, gramo, tiempo) {
  m.onImpresionRegistrada({ data: { project_id: pid, modelo_id: modeloId, gramos_reales: gramo, tiempo_real: tiempo } });
}

(async () => {
  // ── 1. promedio con dato MEDIDO ──
  {
    const { m } = await setup();
    await acumular(m, 'proj-3d', 'mod_a', 12, 3600);
    await acumular(m, 'proj-3d', 'mod_a', 16, 4200);
    const r = await m._consumoPromedio({ project_id: 'proj-3d', modelo_id: 'mod_a' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.gramos_promedio, 14, 'promedio de gramos 14');
    assert.strictEqual(r.data.tiempo_promedio_s, 3900, 'promedio de tiempo 3900');
    assert.strictEqual(r.data.muestras.gramos, 2);
    assert.strictEqual(r.data.estimacion, 'medida');
  }
  console.log('✓ consumo: promedio con dato MEDIDO del historial');

  // ── 2. sin muestras -> NULO (CERO estimación, no conjetura) ──
  {
    const { m } = await setup();
    const r = await m._consumoPromedio({ project_id: 'proj-3d', modelo_id: 'mod_desconocido' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.gramos_promedio, null, 'gramos NULO');
    assert.strictEqual(r.data.tiempo_promedio_s, null, 'tiempo NULO');
    assert.strictEqual(r.data.estimacion, 'NULO', 'marca NULO (CERO estimación)');
  }
  console.log('✓ consumo: sin muestras -> NULO (CERO estimación)');

  // ── 3. pronóstico de tanda: suma de promedios medidos ──
  {
    const { m } = await setup();
    await acumular(m, 'proj-3d', 'mod_a', 10, 3000);
    await acumular(m, 'proj-3d', 'mod_b', 20, 6000);
    const r = await m._pronosticoTanda({
      project_id: 'proj-3d',
      modelos: [{ modelo_id: 'mod_a', veces: 2 }, { modelo_id: 'mod_b', veces: 1 }]
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.completo, true, 'tanda completa');
    assert.strictEqual(r.data.detalle[0].gramos_estimados, 20, 'mod_a x2 = 20g');
    assert.strictEqual(r.data.detalle[1].gramos_estimados, 20, 'mod_b x1 = 20g');
    assert.strictEqual(r.data.total.gramos_estimados, 40, 'total 40g');
    assert.strictEqual(r.data.total.tiempo_estimado_s, 12000, 'total 12000s');
    assert.strictEqual(r.data.pendientes, 0);
  }
  console.log('✓ consumo: pronóstico de tanda (suma de promedios medidos)');

  // ── 4. pronóstico con hueco sin dato -> total NULO (ABIERTO al dueño) ──
  {
    const { m } = await setup();
    await acumular(m, 'proj-3d', 'mod_a', 10, 3000);
    const r = await m._pronosticoTanda({
      project_id: 'proj-3d',
      modelos: [{ modelo_id: 'mod_a' }, { modelo_id: 'mod_sin_dato' }]
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.completo, false, 'no completo');
    assert.strictEqual(r.data.total, null, 'total NULO (CERO estimación)');
    assert.strictEqual(r.data.pendientes, 1, '1 modelo sin dato');
    assert.strictEqual(r.data.muestras_ok, 1);
  }
  console.log('✓ consumo: pronóstico con hueco sin dato -> total NULO (ABIERTO)');

  // ── 5. validaciones ──
  {
    const { m } = await setup();
    const noPid = await m._consumoPromedio({ modelo_id: 'mod_a' });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noMod = await m._consumoPromedio({ project_id: 'p' });
    assert.strictEqual(noMod.status, 400, 'exige modelo_id');
    const noItems = await m._pronosticoTanda({ project_id: 'p', modelos: [] });
    assert.strictEqual(noItems.status, 400, 'exige modelos no vacío');
  }
  console.log('✓ consumo: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE CONSUMO PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
