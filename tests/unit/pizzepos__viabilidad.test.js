/**
 * Tests unitarios — pizzepos__viabilidad (reflejo HIBRIDO, v2.0.0).
 *
 * El reflejo sirve 4 ops: evaluar (delega coste a escandallo.costear + reglas food cost
 * + caminos por regla + persiste), obtener, listar, descartar. El mock del bus responde
 * a escandallo.costear, recetas.obtener y fs (read/write/edit) con shapes REALES.
 *
 * Ejecutar: node tests/unit/pizzepos__viabilidad.test.js
 */

'use strict';

const assert = require('assert');
const ViabilidadReflejo = require('../../modules/pizzepos/viabilidad/index.js');

// Aplicador mínimo de JSON Patch (add /-, test, replace).
function applyPatch(obj, patches) {
  for (const p of patches) {
    const parts = p.path.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (p.op === 'test') {
      let o = obj; for (const k of parts) o = o?.[k];
      if (JSON.stringify(o) !== JSON.stringify(p.value)) throw new Error('test patch failed');
    } else if (p.op === 'add' && parts[parts.length - 1] === '-') {
      let o = obj; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o.push(p.value);
    } else if (p.op === 'replace' || p.op === 'add') {
      let o = obj; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = p.value;
    }
  }
  return obj;
}

// store: fs paths. costear: respuesta de escandallo.costear. receta: respuesta de recetas.obtener.
function makeBus(store, costear, receta) {
  const handlers = new Map();
  const published = [];
  const emit = (event, payload) => {
    const fns = handlers.get(event);
    if (fns) for (const fn of [...fns]) setImmediate(() => fn({ data: payload }));
  };
  return {
    published, store,
    subscribe(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event)?.delete(fn);
    },
    async publish(event, payload) {
      published.push([event, payload]);
      const rid = payload.request_id;
      if (event === 'escandallo.costear.request') {
        emit('escandallo.costear.response', costear
          ? { request_id: rid, status: 200, data: costear }
          : { request_id: rid, status: 404, error: { code: 'RESOURCE_NOT_FOUND' } });
      } else if (event === 'recetas.obtener.request') {
        emit('recetas.obtener.response', receta
          ? { request_id: rid, status: 200, data: { receta } }
          : { request_id: rid, status: 404, error: { code: 'RESOURCE_NOT_FOUND' } });
      } else if (event === 'fs.read.request') {
        const content = store[payload.path];
        emit('fs.read.response', content != null
          ? { request_id: rid, path: payload.path, content }
          : { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND' } });
      } else if (event === 'fs.write.request') {
        store[payload.path] = payload.content;
        emit('fs.write.response', { request_id: rid, path: payload.path });
      } else if (event === 'fs.edit.request') {
        if (store[payload.path] == null) { emit('fs.edit.response', { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND' } }); return; }
        try {
          store[payload.path] = JSON.stringify(applyPatch(JSON.parse(store[payload.path]), payload.patches), null, 2);
          emit('fs.edit.response', { request_id: rid, path: payload.path });
        } catch (e) { emit('fs.edit.response', { request_id: rid, error: { code: 'CONFLICT_STATE', message: e.message } }); }
      }
    }
  };
}

function makeReflejo(store = {}, costear = null, receta = null) {
  const m = new ViabilidadReflejo();
  const bus = makeBus(store, costear, receta);
  m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: bus, metrics: { increment(){} } });
  return { m, bus, store };
}

const base = { project_id: 'proj-1' };
const cost = (coste_unidad, sin_precio = []) => ({ coste_total: coste_unidad, coste_unidad, rinde: { cantidad: 1, unidad: 'ud' }, lineas_detalle: [{ nombre: 'x' }], lineas_sin_precio: sin_precio });

async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); process.exit(1); }
}

(async () => {
  console.log('pizzepos__viabilidad — reflejo híbrido v2.0.0\n');

  await testAsync('evaluar propuesta con PVP → veredicto por food cost + persiste + emite', async () => {
    const { m, bus, store } = makeReflejo({}, cost(3));   // coste 3 / pvp 10 = 30% → viable_con_advertencias
    const r = await m._evaluar({ ...base, nombre: 'Pizza X', ingredientes: [{ nombre: 'masa', cantidad: 1, unidad: 'ud' }], porciones: 1, pvp_objetivo: 10 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.veredicto, 'viable_con_advertencias');
    assert.strictEqual(r.data.food_cost_pct, 30);
    assert.ok(store['/pizzepos/viabilidad.json'], 'persiste en el path canónico');
    assert.ok(bus.published.some(([e]) => e === 'viabilidad.evaluacion.completada'), 'emite evento');
  });

  await testAsync('evaluar: umbrales food cost (20→viable, 40→alerta, 50→no_viable)', async () => {
    const r1 = await makeReflejo({}, cost(2)).m._evaluar({ ...base, nombre: 'A', ingredientes: [{ nombre: 'x' }], porciones: 1, pvp_objetivo: 10 });
    assert.strictEqual(r1.data.veredicto, 'viable');
    const r2 = await makeReflejo({}, cost(4)).m._evaluar({ ...base, nombre: 'B', ingredientes: [{ nombre: 'x' }], porciones: 1, pvp_objetivo: 10 });
    assert.strictEqual(r2.data.veredicto, 'viable_con_advertencias');
    assert.ok(r2.data.advertencias.some(a => a.startsWith('alerta_margen_critico')));
    const r3 = await makeReflejo({}, cost(5)).m._evaluar({ ...base, nombre: 'C', ingredientes: [{ nombre: 'x' }], porciones: 1, pvp_objetivo: 10 });
    assert.strictEqual(r3.data.veredicto, 'no_viable_economicamente');
  });

  await testAsync('evaluar sin PVP → sin_pvp_objetivo + pvp_sugerido (30%)', async () => {
    const { m } = makeReflejo({}, cost(3));
    const r = await m._evaluar({ ...base, nombre: 'D', ingredientes: [{ nombre: 'x' }], porciones: 1 });
    assert.strictEqual(r.data.veredicto, 'sin_pvp_objetivo');
    assert.strictEqual(r.data.pvp_sugerido, 10);   // 3 / 0.30
  });

  await testAsync('evaluar por receta_id sin nombre → resuelve nombre por recetas.obtener (no inventa)', async () => {
    const { m } = makeReflejo({}, cost(2), { nombre: 'Bachata' });
    const r = await m._evaluar({ ...base, receta_id: 'rec-1', pvp_objetivo: 10 });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.input.nombre, 'Bachata');
  });

  await testAsync('evaluar: caminos deterministas (ingredientes_sin_precio → camino completar)', async () => {
    const { m } = makeReflejo({}, cost(3, ['Trufa']));
    const r = await m._evaluar({ ...base, nombre: 'E', ingredientes: [{ nombre: 'x' }], porciones: 1, pvp_objetivo: 10 });
    assert.ok(r.data.caminos.some(c => c.titulo === 'Completar precios'), 'propone camino de precios');
    assert.ok(r.data.caminos.length <= 3);
  });

  await testAsync('evaluar inválido (ni receta_id ni propuesta) → 400', async () => {
    const { m } = makeReflejo({}, cost(2));
    const r = await m._evaluar({ ...base, pvp_objetivo: 10 });
    assert.strictEqual(r.status, 400);
  });

  // REGRESIÓN del engranaje: la response sale correlada al request_id EXTERNO (vía _atender).
  await testAsync('evaluar: response correlada al request_id externo (no al de escandallo/fs)', async () => {
    const { m, bus } = makeReflejo({}, cost(2));
    await m.onEvaluarRequest({ data: { request_id: 'OUT-1', project_id: 'proj-1', nombre: 'F', ingredientes: [{ nombre: 'x' }], porciones: 1, pvp_objetivo: 10 } });
    const resp = bus.published.find(([e]) => e === 'viabilidad.evaluar.response');
    assert.ok(resp, 'publica response');
    assert.strictEqual(resp[1].request_id, 'OUT-1');
    assert.strictEqual(resp[1].status, 201);
  });

  await testAsync('listar: default activo + orden por fecha desc', async () => {
    const store = { '/pizzepos/viabilidad.json': JSON.stringify({ _version: '1.0', expedientes: [
      { id: 'a', estado: 'activo', fecha_evaluacion: '2026-06-14T10:00:00Z', input: {} },
      { id: 'b', estado: 'descartado', fecha_evaluacion: '2026-06-14T11:00:00Z', input: {} },
      { id: 'c', estado: 'activo', fecha_evaluacion: '2026-06-14T12:00:00Z', input: {} }
    ] }) };
    const { m } = makeReflejo(store);
    const r = await m._listar({ ...base });
    assert.strictEqual(r.data.length, 2, 'solo activos');
    assert.strictEqual(r.data[0].id, 'c', 'más reciente primero');
    const todos = await m._listar({ ...base, estado: 'todos' });
    assert.strictEqual(todos.data.length, 3);
  });

  await testAsync('listar sin archivo → []', async () => {
    const { m } = makeReflejo({});
    const r = await m._listar({ ...base });
    assert.deepStrictEqual(r.data, []);
  });

  await testAsync('obtener: por id; 404 si no existe', async () => {
    const store = { '/pizzepos/viabilidad.json': JSON.stringify({ expedientes: [{ id: 'a', estado: 'activo', input: {} }] }) };
    const { m } = makeReflejo(store);
    assert.strictEqual((await m._obtener({ ...base, expediente_id: 'a' })).status, 200);
    assert.strictEqual((await m._obtener({ ...base, expediente_id: 'zzz' })).status, 404);
  });

  await testAsync('descartar: soft-delete + 409 doble descarte', async () => {
    const store = { '/pizzepos/viabilidad.json': JSON.stringify({ _version: '1.0', _updated_at: 'x', expedientes: [
      { id: 'a', estado: 'activo', motivo_descarte: null, fecha_descarte: null, input: { nombre: 'X' }, veredicto: 'viable' }
    ] }) };
    const { m, bus } = makeReflejo(store);
    const r = await m._descartar({ ...base, expediente_id: 'a', motivo: 'no rentable' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.estado, 'descartado');
    assert.strictEqual(JSON.parse(store['/pizzepos/viabilidad.json']).expedientes[0].estado, 'descartado');
    assert.ok(bus.published.some(([e]) => e === 'viabilidad.evaluacion.descartada'));
    const r2 = await m._descartar({ ...base, expediente_id: 'a' });
    assert.strictEqual(r2.status, 409, 'doble descarte → CONFLICT_STATE');
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
