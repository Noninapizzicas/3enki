/**
 * Tests unitarios — cupula-gcode (CUSTODIO del taller 3D, F4 TANDA 2).
 *
 * Sin bus real: instancia el reflejo con eventBus en memoria y llama a las proyecciones
 * directamente. Verifica la MONEDA real:
 *   - los 3 formatos conviven (STL origen + 3MF origen + GCODE listo) NUNCA solo .3mf
 *   - registrar un GCODE listo emite archivo.preparado
 *   - reconciliar no duplica (mismo modelo+formato+listo)
 *   - reserva no re-slicea lo ya preparado (cache: un archivo por modelo)
 *   - marcar_consumido lo retira de listos
 *   - listos solo con gcode listo y no consumido
 *   - get 200 / 404
 *
 * Ejecutar: node modules/cupula-gcode/tests/unit/cupula-gcode.test.js
 */

'use strict';

const assert = require('assert');

const Cupula = require('../../index.js');

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
  const m = new Cupula();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

const evNames = (published, name) => published.filter(p => p[0] === name).map(p => p[1]);

(async () => {
  // ── 1. los 3 formatos conviven (moneda real) ──
  {
    const { m, published } = await setup();
    // STL origen (no listo), 3MF origen (no listo), GCODE listo del MISMO modelo
    const stl = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_1', formato: 'STL', archivo: '/m/pieza.stl' });
    const thmf = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_1', formato: '3MF', archivo: '/m/pieza.3mf' });
    const gcode = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_1', formato: 'GCODE', archivo: '/m/pieza.gcode', perfil: '0.2', gramos_est: 12, tiempo_est: 4800 });
    assert.strictEqual(stl.status, 201);
    assert.strictEqual(thmf.status, 201);
    assert.strictEqual(gcode.status, 201, 'gcode registrado');
    assert.strictEqual(stl.data.archivo.listo, false, 'STL origen no listo');
    assert.strictEqual(gcode.data.archivo.listo, true, 'GCODE preparado listo');
    assert.strictEqual(gcode.data.archivo.archivo_gcode, '/m/pieza.gcode');
    assert.strictEqual(gcode.data.archivo.perfil, '0.2');
    // conviven 3 archivos distintos (uno por formato)
    const listos = await m._listosParaImprimir({ project_id: 'proj-3d' });
    assert.strictEqual(listos.data.total, 1, 'solo el GCODE listo para imprimir');
    assert.strictEqual(m.archivos.size, 3, 'los 3 formatos conviven en la cúpula');
  }
  console.log('✓ cupula-gcode: los 3 formatos conviven (STL/3MF origen + GCODE listo)');

  // ── 2. registrar GCODE emite archivo.preparado; STL no ──
  {
    const { m, published } = await setup();
    await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_a', formato: 'STL', archivo: '/a.stl' });
    await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_a', formato: 'GCODE', archivo: '/a.gcode' });
    assert.strictEqual(evNames(published, 'archivo.preparado').length, 1, 'solo el gcode emite archivo.preparado');
    const evt = evNames(published, 'archivo.preparado')[0];
    assert.strictEqual(evt.formato, 'GCODE');
    assert.ok(evt.archivo_id);
  }
  console.log('✓ cupula-gcode: GCODE emite archivo.preparado (alimenta cola/reserva)');

  // ── 3. reconciliar no duplica (mismo modelo+formato+listo) ──
  {
    const { m } = await setup();
    const a = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_x', formato: 'GCODE', archivo: '/x.gcode' });
    const b = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_x', formato: 'GCODE', archivo: '/x.gcode' });
    assert.strictEqual(b.status, 200, 'reconciliado');
    assert.strictEqual(b.data.reconciliado, true, 'no duplica');
    assert.strictEqual(m.archivos.size, 1, 'un solo archivo');
  }
  console.log('✓ cupula-gcode: reconciliar no duplica (cache)');

  // ── 4. reserva no re-slicea lo ya preparado ──
  {
    const { m } = await setup();
    const r1 = await m._reserva({ project_id: 'proj-3d' });
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.data.total, 0, 'sin listos aún');
    await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_1', formato: 'GCODE', archivo: '/1.gcode' });
    const r2 = await m._reserva({ project_id: 'proj-3d' });
    assert.strictEqual(r2.data.total, 1, 'reserva alimentada');
    // re-registrar el mismo (como haría un re-slice) NO crea duplicado en reserva
    const dup = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_1', formato: 'GCODE', archivo: '/1.gcode' });
    assert.strictEqual(dup.status, 200, 'reconciliado');
    const r3 = await m._reserva({ project_id: 'proj-3d' });
    assert.strictEqual(r3.data.total, 1, 'no re-slicea lo ya listo');
  }
  console.log('✓ cupula-gcode: reserva no re-slicea lo ya preparado (cache)');

  // ── 5. marcar_consumido lo retira de listos y de reserva ──
  {
    const { m, published } = await setup();
    const reg = await m._registrar({ project_id: 'proj-3d', modelo_id: 'mod_a', formato: 'GCODE', archivo: '/a.gcode' });
    const id = reg.data.archivo.id;
    const antes = await m._listosParaImprimir({ project_id: 'proj-3d' });
    assert.strictEqual(antes.data.total, 1);
    const c = await m._marcarConsumido({ project_id: 'proj-3d', archivo_id: id });
    assert.strictEqual(c.status, 200);
    assert.strictEqual(c.data.archivo.consumido, true);
    const despues = await m._listosParaImprimir({ project_id: 'proj-3d' });
    assert.strictEqual(despues.data.total, 0, 'consumido retirado de listos');
    const res = await m._reserva({ project_id: 'proj-3d' });
    assert.strictEqual(res.data.total, 0, 'retirado de reserva');
    assert.strictEqual(evNames(published, 'cupula-gcode.marcar_consumido.failed').length, 0, 'sin fallo en éxito');

    // marcar consumido de inexistente -> 404 + failed
    const nf = await m._marcarConsumido({ project_id: 'proj-3d', archivo_id: 'arc_nope' });
    assert.strictEqual(nf.status, 404, '404 si no existe');
    assert.strictEqual(evNames(published, 'cupula-gcode.marcar_consumido.failed').length, 1, 'emite par de fallo');
  }
  console.log('✓ cupula-gcode: marcar_consumido retira de listos/reserva + 404/failed');

  // ── 6. obtener 200 / 404 ──
  {
    const { m } = await setup();
    const reg = await m._registrar({ project_id: 'proj-3d', formato: 'GCODE', archivo: '/z.gcode' });
    const id = reg.data.archivo.id;
    const ok = await m._obtener({ project_id: 'proj-3d', archivo_id: id });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.data.archivo.id, id);
    const nf = await m._obtener({ project_id: 'proj-3d', archivo_id: 'arc_nx' });
    assert.strictEqual(nf.status, 404);
  }
  console.log('✓ cupula-gcode: obtener 200 / 404');

  // ── 7. validaciones ──
  {
    const { m, published } = await setup();
    const noArchivo = await m._registrar({ project_id: 'p' });
    assert.strictEqual(noArchivo.status, 400, 'exige archivo');
    const sinPid = await m._listosParaImprimir({});
    assert.strictEqual(sinPid.status, 400, 'exige project_id');
    // formato no soportado -> 422 + failed
    const bad = await m._registrar({ project_id: 'proj-3d', formato: 'PNG', archivo: '/x.png' });
    assert.strictEqual(bad.status, 422, 'formato no soportado');
    assert.strictEqual(evNames(published, 'cupula-gcode.registrar.failed').length, 1, 'emite registro.failed');
  }
  console.log('✓ cupula-gcode: validaciones + formato no soportado');

  console.log('\n✅ TODOS LOS TESTS DE CUPULA-GCODE PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
