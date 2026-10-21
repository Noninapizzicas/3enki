/**
 * Tests unitarios — importacion (CONVERSOR del taller 3D, F4 TANDA 2).
 *
 * Sin bus real: instancia el reflejo con un eventBus en memoria que enruta los
 * `.request` a un stub y captura los fire-and-forget. Verifica:
 *   - entrada de los 3 formatos (STL/3MF/GCODE) con metadatos por lector inyectable
 *   - GCODE preparado -> cupula-gcode (destino cupula, NO duplica catálogo)
 *   - STL/3MF fuente -> catalogo.registrar (RPC a catalogo)
 *   - formato no soportado -> 422 + par de fallo importacion.importar.failed
 *   - leer_metadatos con huecos 'desconocido' (CERO inventado) y reuso adaptador-slicing para .3mf
 *
 * Ejecutar: node modules/importacion/tests/unit/importacion.test.js
 */

'use strict';

const assert = require('assert');

const Importacion = require('../../index.js');

// Bus stub: subscribe + publish. Los `.request` a destinos conocidos se responden con
// éxito (o con bus.responses[event] si se fija); todo request se registra en bus.pedidos;
// los fire-and-forget se capturan en bus.emitidos.
function makeBus() {
  const handlers = new Map();
  const emitidos = [];
  const pedidos = [];
  const responses = new Map();
  const bus = {
    emitidos, pedidos, responses,
    subscribe: (event, handler) => { handlers.set(event, handler); return () => handlers.delete(event); },
    publish: async (event, payload) => {
      if (event.endsWith('.request')) {
        pedidos.push([event, payload]);
        const resp = responses.has(event) ? responses.get(event)
          : (event.includes('cupula-gcode') ? { status: 201, data: { archivo_id: 'gcode_x' } }
            : (event.includes('catalogo') ? { status: 201, data: { modelo: { id: 'mod_1' }, reconciliado: false } } : null));
        if (resp) {
          const handler = handlers.get(event.replace(/\.request$/, '.response'));
          if (handler) handler({ data: { ...resp, request_id: payload.request_id } });
        }
        return;
      }
      emitidos.push([event, payload]);
    }
  };
  return bus;
}

async function setup(bus) {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const metrics = { increment: () => {} };
  const m = new Importacion();
  await m.onLoad({ logger, metrics, eventBus: bus });
  return m;
}

(async () => {
  // ── 1. importar GCODE -> cupula (directo, no catálogo) ──
  {
    const bus = makeBus();
    const m = await setup(bus);
    m.registrarLector('GCODE', async () => ({ nombre: 'Torre', perfil: '0.2', gramos_est: 12, tiempo_est: 4800 }));
    const r = await m._importar({ project_id: 'proj-3d', archivo: '/modelos/torre.gcode' });
    assert.strictEqual(r.status, 201, 'GCODE importado');
    assert.strictEqual(r.data.destino, 'cupula', 'GCODE va a la cúpula');
    assert.ok(r.data.archivo_id, 'devuelve archivo_id de cúpula');
    assert.ok(!bus.emitidos.some(p => p[0] === 'importacion.importar.failed'), 'no emite fallo en éxito');
    assert.ok(!bus.pedidos.some(([e]) => e === 'catalogo.registrar.request'), 'NO llama a catalogo para GCODE');
    const cp = bus.pedidos.find(([e]) => e === 'cupula-gcode.registrar.request');
    assert.ok(cp, 'sí llama a cupula-gcode.registrar');
    assert.strictEqual(cp[1].listo, true, 'marca listo en cúpula');
    assert.strictEqual(cp[1].formato, 'GCODE', 'formato GCODE');
  }
  console.log('✓ importacion: GCODE preparado -> cupula (no duplica catálogo)');

  // ── 2. importar STL fuente -> catalogo.registrar (RPC) ──
  {
    const bus = makeBus();
    const m = await setup(bus);
    m.registrarLector('STL', async () => ({ nombre: 'Soporte', material: 'PETG' }));
    const r = await m._importar({ project_id: 'proj-3d', archivo: '/modelos/soporte.stl' });
    assert.strictEqual(r.status, 201, 'STL importado');
    assert.strictEqual(r.data.destino, 'catalogo', 'STL fuente va al catálogo');
    const pedidosCat = bus.pedidos.filter(([e]) => e === 'catalogo.registrar.request');
    assert.strictEqual(pedidosCat.length, 1, 'llama catalogo.registrar una vez');
    assert.strictEqual(pedidosCat[0][1].archivo_stl, '/modelos/soporte.stl', 'envía archivo_stl');
    assert.strictEqual(pedidosCat[0][1].filamento_sug, 'PETG', 'material sugerido del lector');
    assert.ok(!bus.emitidos.some(p => p[0] === 'importacion.importar.failed'), 'sin fallo en éxito');
    assert.ok(!bus.pedidos.some(([e]) => e === 'cupula-gcode.registrar.request'), 'STL no va a cúpula');
  }
  console.log('✓ importacion: STL fuente -> catalogo.registrar (RPC)');

  // ── 3. leer_metadatos: los 3 formatos + huecos desconocido ──
  {
    const bus = makeBus();
    const m = await setup(bus);
    m.registrarLector('3MF', async () => ({ nombre: 'Caja', unidades: 'mm', material: 'PETG', dimensiones: '50x30x20' }));
    const g = await m._leerMetadatos({ archivo: '/x/caja.3mf', formato: '3MF' });
    assert.strictEqual(g.status, 200);
    assert.strictEqual(g.data.metadatos.nombre, 'Caja');
    assert.strictEqual(g.data.metadatos.unidades, 'mm');
    assert.strictEqual(g.data.metadatos.material, 'PETG');
    assert.deepStrictEqual(g.data.metadatos.formatos, ['3MF']);

    // .3mf sin lector propio -> reuso adaptador-slicing.leer_3mf
    const bus2 = makeBus();
    bus2.responses.set('adaptador-slicing.leer_3mf.request', { status: 200, data: { metadatos: { nombre: 'Tapa', material: 'PETG' } } });
    const m2 = await setup(bus2);
    const g2 = await m2._leerMetadatos({ project_id: 'proj-3d', archivo: '/x/tapa.3mf', formato: '3MF' });
    assert.strictEqual(g2.status, 200);
    assert.strictEqual(g2.data.metadatos.nombre, 'Tapa', 'delega en adaptador-slicing.leer_3mf');

    // GCODE sin nombre -> derivado de la ruta, material null (CERO inventado)
    const m3 = await setup(makeBus());
    m3.registrarLector('GCODE', async () => ({ autor: 'yo' }));
    const g3 = await m3._leerMetadatos({ archivo: '/x/pieza.gcode', formato: 'GCODE' });
    assert.strictEqual(g3.status, 200);
    assert.strictEqual(g3.data.metadatos.nombre, 'pieza', 'nombre derivado de la ruta');
    assert.strictEqual(g3.data.metadatos.material, null, 'material ausente -> null (no inventa)');
    assert.strictEqual(g3.data.metadatos.unidades, null, 'unidades ausentes -> null');
  }
  console.log('✓ importacion: leer_metadatos 3 formatos + reuso adaptador-slicing + huecos');

  // ── 4. formato no soportado -> 422 + par de fallo ──
  {
    const bus = makeBus();
    const m = await setup(bus);
    const r = await m._importar({ project_id: 'proj-3d', archivo: '/x/foto.png' });
    assert.strictEqual(r.status, 422, 'formato no soportado');
    assert.ok(r.error, 'responde error');
    const failed = bus.emitidos.find(p => p[0] === 'importacion.importar.failed');
    assert.ok(failed, 'emite par de fallo');
    assert.strictEqual(failed[1].motivo, 'formato_no_soportado');
  }
  console.log('✓ importacion: formato no soportado -> 422 + failed');

  // ── 5. validaciones ──
  {
    const m = await setup(makeBus());
    const noArchivo = await m._importar({ project_id: 'p' });
    assert.strictEqual(noArchivo.status, 400, 'exige archivo');
    const noPid = await m._importar({ archivo: '/x/a.stl' });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
  }
  console.log('✓ importacion: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE IMPORTACION PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
