/**
 * Tests unitarios — catalogo (CUSTODIO del taller 3D, F4 TANDA 1).
 *
 * Sin bus real: instancia el reflejo con un eventBus en memoria que captura
 * publicaciones, y llama a las proyecciones/op directamente. Verifica:
 *   - moneda real STL/3MF/GCODE conviven como archivos distintos (NUNCA solo .3mf)
 *   - reconciliar ANTES de crear: nombre canónico + fuente + origenUrl → NO duplica
 *   - formato_dispon derivado de los archivos presentes
 *   - por_id / listar / actualizar (merge, no re-crea)
 *   - emite modelo.registrado al registrar
 *
 * Ejecutar: node modules/catalogo/tests/unit/catalogo.test.js
 */

'use strict';

const assert = require('assert');

const Catalogo = require('../../index.js');

function makeMocks() {
  const published = [];
  const logger = {
    debug: () => {}, info: () => {}, warn: () => {}, error: () => {}
  };
  const metrics = { increment: () => {} };
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  return { published, logger, metrics, eventBus };
}

async function setup() {
  const mocks = makeMocks();
  const m = new Catalogo();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

// _registrar directamente (proyección)
async function registrar(m, input, pid = 'proj-3d') {
  return m._registrar({ ...input, project_id: pid });
}

(async () => {
  // ── 1. registrar: los 3 formatos conviven ──
  {
    const { m } = await setup();
    const r = await registrar(m, {
      nombre: 'Conector 16mm', uso: 'une ejes', filamento_sug: 'PETG', fuente: 'DISEÑADO',
      archivo_stl: '/modelos/conector.stl', archivo_3mf: '/modelos/conector.3mf', archivo_gcode: '/modelos/conector.gcode'
    });
    assert.strictEqual(r.status, 201, 'crea nuevo');
    const mod = r.data.modelo;
    assert.ok(mod.id, 'genera id');
    assert.strictEqual(mod.archivo_stl, '/modelos/conector.stl');
    assert.strictEqual(mod.archivo_3mf, '/modelos/conector.3mf');
    assert.strictEqual(mod.archivo_gcode, '/modelos/conector.gcode');
    assert.deepStrictEqual([...mod.formato_dispon].sort(), ['3MF', 'GCODE', 'STL'], 'los 3 formatos derivados');
  }
  console.log('✓ catalogo: STL/3MF/GCODE conviven como archivos distintos');

  // ── 2. reconciliar: mismo nombre canónico + fuente + origenUrl → NO duplica ──
  {
    const { m, published } = await setup();
    await registrar(m, { nombre: '  Conector 16MM  ', fuente: 'REPOSITORIO', origenUrl: 'https://printables.com/x', archivo_3mf: '/a.3mf' });
    const r2 = await registrar(m, { nombre: 'conector 16mm', fuente: 'REPOSITORIO', origenUrl: 'https://printables.com/x', archivo_gcode: '/a.gcode' });
    assert.strictEqual(r2.status, 200, 'reconciliado (200)');
    assert.strictEqual(r2.data.duplicado, true, 'no duplica');
    assert.strictEqual(r2.data.reconciliado, true, 'marca reconciliado');

    const list = await m._listar({ project_id: 'proj-3d' });
    assert.strictEqual(list.data.modelos.length, 1, 'una sola ficha');
    const fich = list.data.modelos[0];
    assert.deepStrictEqual([...fich.formato_dispon].sort(), ['3MF', 'GCODE'], 'se mergeó el archivo_gcode aportado');

    const evts = published.map(p => p[0]);
    assert.ok(evts.includes('modelo.registrado'), 'emite modelo.registrado');
    const evt = published.filter(p => p[0] === 'modelo.registrado').pop()[1];
    assert.strictEqual(evt.reconciliado, true, 'evento con reconciliado');
    assert.strictEqual(evt.formato_dispon, undefined, 'el evento usa la clave formatos');
    assert.strictEqual(evt.formatos.length, 2, 'evento con los 2 formatos finales');
  }
  console.log('✓ catalogo: reconciliar antes de crear (NO duplica)');

  // ── 3. por_id — existe y no existe ──
  {
    const { m } = await setup();
    const r = await registrar(m, { nombre: 'Soporte x', archivo_3mf: '/sx.3mf' });
    const mod = r.data.modelo;
    const ok = await m._porId({ project_id: 'proj-3d', modelo_id: mod.id });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.data.modelo.id, mod.id);
    const nf = await m._porId({ project_id: 'proj-3d', modelo_id: 'mod_never' });
    assert.strictEqual(nf.status, 404, '404 si no existe');
  }
  console.log('✓ catalogo: por_id (200 / 404)');

  // ── 4. actualizar — merge, no re-crea ──
  {
    const { m } = await setup();
    const r = await registrar(m, { nombre: 'Caja 20', archivo_3mf: '/caja.3mf' });
    const mod = r.data.modelo;
    const up = await m._actualizar({ project_id: 'proj-3d', modelo_id: mod.id, uso: 'almacén', archivo_gcode: '/caja.gcode' });
    assert.strictEqual(up.status, 200);
    assert.strictEqual(up.data.modelo.uso, 'almacén');
    assert.strictEqual(up.data.modelo.archivo_3mf, '/caja.3mf', 'mantiene el 3mf');
    assert.deepStrictEqual([...up.data.modelo.formato_dispon].sort(), ['3MF', 'GCODE'], 'añade gcode al formato');
    const list = await m._listar({ project_id: 'proj-3d' });
    assert.strictEqual(list.data.modelos.length, 1, 'no crea duplicado');
  }
  console.log('✓ catalogo: actualizar (merge, no re-crea)');

  // ── 5. aislamiento por proyecto ──
  {
    const { m } = await setup();
    await registrar(m, { nombre: 'A' }, 'proj-3d');
    await registrar(m, { nombre: 'B' }, 'proj-otro');
    const listA = await m._listar({ project_id: 'proj-3d' });
    const listB = await m._listar({ project_id: 'proj-otro' });
    assert.strictEqual(listA.data.modelos.length, 1);
    assert.strictEqual(listB.data.modelos.length, 1);
    assert.strictEqual(listA.data.modelos[0].nombre, 'a', 'nombre canónico en minúsculas');
  }
  console.log('✓ catalogo: aislamiento por proyecto + canonización');

  // ── 6. validaciones ──
  {
    const { m } = await setup();
    const noPid = await m._registrar({ nombre: 'X' });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
    const noNombre = await m._registrar({ project_id: 'p' });
    assert.strictEqual(noNombre.status, 400, 'exige nombre');
  }
  console.log('✓ catalogo: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE CATALOGO PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
