/**
 * Tests unitarios — modules/pizzepos/recetas-api/index.js
 *
 * Bridge lecto-puro: lee /recetas.json via fs.read.request al bus y devuelve
 * slices ordenados. Tests cubren:
 *   1. lifecycle (onLoad/onUnload)
 *   2. handlers: validacion de inputs, fs.read.request publicado correctamente,
 *      shape canonico { status, data | error } en cada path
 *   3. fs 404 → store vacio canonico (no error)
 *   4. fs error → error canonico {code, message}
 *   5. parse error → UPSTREAM_INVALID_RESPONSE
 *
 * Ejecutar: node tests/unit/recetas-api.test.js
 */

'use strict';

const assert = require('assert');
const RecetasApiModule = require('../../modules/pizzepos/recetas-api');

// ============================================================
// Mocks
// ============================================================

function makeMiniBus() {
  const subs = new Map();
  const published = [];
  return {
    published,
    subscribe(name, handler) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(handler);
      return () => subs.get(name)?.delete(handler);
    },
    async publish(name, data) {
      published.push([name, data]);
      const set = subs.get(name);
      if (!set) return;
      for (const h of [...set]) {
        try { await h(data); } catch (_) {}
      }
    },
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}

function makeFsBackend(bus, fsContent) {
  // Auto-responde fs.read.request: si fsContent es un fn(req) la invoca;
  // si es un objeto plano, hace match exacto por path; si es null, simula 404.
  bus.subscribe('fs.read.request', async (req) => {
    setImmediate(() => {
      const response = typeof fsContent === 'function'
        ? fsContent(req)
        : fsContent === null
          ? { request_id: req.request_id, error: { code: 'RESOURCE_NOT_FOUND', kind: 'enoent', message: 'file not found' } }
          : { request_id: req.request_id, content: JSON.stringify(fsContent) };
      bus.publish('fs.read.response', response);
    });
  });
}

function makeModule(bus) {
  const m = new RecetasApiModule();
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  bus.subscribe('fs.read.response', (data) => m.onFsReadResponse(data));
  return { m, logger };
}

async function load(m, bus, logger) {
  await m.onLoad({
    eventBus: bus,
    logger,
    metrics: null,
    moduleConfig: { fs_request_timeout_ms: 2000, default_list_limit: 100 }
  });
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (err) {
    console.error(`✗ ${description}`); console.error(`  ${err.message}`);
    if (process.env.STACK) console.error(err.stack);
    process.exit(1);
  }
}

const sampleStore = {
  _version: '1.0',
  _updated_at: '2026-05-20T10:00:00Z',
  recetas: [
    {
      id: 'r1', nombre: 'Margarita', porciones: 4, dificultad: 'baja',
      estado_operativo: 'en_servicio', incompleta: false, version: 1,
      updated_at: '2026-05-19T18:00:00Z',
      ingredientes: [
        { nombre: 'masa', cantidad: 250 },
        { nombre: 'tomate', cantidad: 80 },
        { nombre: 'mozzarella', cantidad: 100 }
      ]
    },
    {
      id: 'r2', nombre: 'Cuatro Quesos', porciones: 2, dificultad: 'media',
      estado_operativo: 'borrador', incompleta: true,
      campos_pendientes: ['precio_mozzarella'], version: 0,
      updated_at: '2026-05-20T09:00:00Z',
      ingredientes: [{ nombre: 'masa', cantidad: 250 }]
    },
    {
      id: 'r3', nombre: 'Diavola', porciones: 4, dificultad: 'baja',
      estado_operativo: 'archivada', incompleta: false, version: 2,
      updated_at: '2026-04-01T12:00:00Z',
      ingredientes: []
    }
  ],
  ingredientes_catalogo: [
    { nombre: 'tomate', unidad: 'g', precio_mercado: 0.002 },
    { nombre: 'masa', unidad: 'g', precio_mercado: 0.003 },
    { nombre: 'mozzarella', unidad: 'g' }
  ]
};

// ============================================================
// Tests
// ============================================================

(async () => {
  console.log('modules/pizzepos/recetas-api — bridge lecto-puro de recetas.json\n');

  // ---------- Group 1: lifecycle ----------

  await testAsync('onLoad configura logger/bus/config; onUnload limpia pendingFs', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    await load(m, bus, logger);
    assert.ok(m.eventBus === bus);
    assert.strictEqual(m.config.default_list_limit, 100);
    await m.onUnload();
    assert.strictEqual(m.pendingFs.size, 0);
  });

  // ---------- Group 2: handleListar ----------

  await testAsync('listar sin project_id → INVALID_INPUT', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    await load(m, bus, logger);
    const r = await m.handleListar({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'project_id');
  });

  await testAsync('listar con estado_operativo invalido → INVALID_INPUT', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1', estado_operativo: 'inventado' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'estado_operativo');
  });

  await testAsync('listar con fs 404 → 200 con store vacio', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, null);
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data, { total: 0, recetas: [] });
  });

  await testAsync('listar devuelve recetas ordenadas por updated_at desc', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 3);
    // Orden: r2 (2026-05-20) → r1 (2026-05-19) → r3 (2026-04-01)
    assert.deepStrictEqual(r.data.recetas.map(r => r.id), ['r2', 'r1', 'r3']);
  });

  await testAsync('listar resumen incluye solo campos canonicos + ingredientes_count', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1' });
    const r1 = r.data.recetas.find(x => x.id === 'r1');
    assert.deepStrictEqual(Object.keys(r1).sort(), [
      'campos_pendientes', 'dificultad', 'estado_operativo', 'id',
      'incompleta', 'ingredientes_count', 'nombre', 'porciones',
      'updated_at', 'version'
    ]);
    assert.strictEqual(r1.ingredientes_count, 3, 'derivado de ingredientes.length');
  });

  await testAsync('listar filtra por estado_operativo', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1', estado_operativo: 'borrador' });
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.recetas[0].id, 'r2');
  });

  await testAsync('listar respeta limit', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1', limit: 2 });
    assert.strictEqual(r.data.total, 3, 'total cuenta ANTES del limit');
    assert.strictEqual(r.data.recetas.length, 2);
  });

  // ---------- Group 3: handleObtener ----------

  await testAsync('obtener sin id o project_id → INVALID_INPUT', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    await load(m, bus, logger);
    const r1 = await m.handleObtener({ project_id: 'p1' });
    assert.strictEqual(r1.error.code, 'INVALID_INPUT');
    const r2 = await m.handleObtener({ id: 'r1' });
    assert.strictEqual(r2.error.code, 'INVALID_INPUT');
  });

  await testAsync('obtener con fs 404 → RESOURCE_NOT_FOUND (entity recipe_store)', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, null);
    await load(m, bus, logger);
    const r = await m.handleObtener({ id: 'r1', project_id: 'p1' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'recipe_store');
  });

  await testAsync('obtener id inexistente → RESOURCE_NOT_FOUND (entity recipe)', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleObtener({ id: 'no-existe', project_id: 'p1' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(r.error.details.entity_type, 'recipe');
  });

  await testAsync('obtener devuelve receta completa + ingredientes_count', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleObtener({ id: 'r1', project_id: 'p1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.id, 'r1');
    assert.strictEqual(r.data.nombre, 'Margarita');
    assert.strictEqual(r.data.ingredientes_count, 3);
    assert.ok(Array.isArray(r.data.ingredientes), 'mantiene array completo');
  });

  // ---------- Group 4: handleIngredientes ----------

  await testAsync('ingredientes ordena alfabeticamente', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleIngredientes({ project_id: 'p1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 3);
    assert.deepStrictEqual(r.data.ingredientes.map(i => i.nombre), ['masa', 'mozzarella', 'tomate']);
  });

  await testAsync('ingredientes con fs 404 → 200 vacio', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, null);
    await load(m, bus, logger);
    const r = await m.handleIngredientes({ project_id: 'p1' });
    assert.deepStrictEqual(r.data, { total: 0, ingredientes: [] });
  });

  // ---------- Group 5: handleEstadisticas ----------

  await testAsync('estadisticas agrega correctamente del sample', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, sampleStore);
    await load(m, bus, logger);
    const r = await m.handleEstadisticas({ project_id: 'p1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total_recetas, 3);
    assert.deepStrictEqual(r.data.por_estado, { borrador: 1, en_servicio: 1, archivada: 1 });
    assert.strictEqual(r.data.incompletas, 1);
    assert.strictEqual(r.data.ingredientes_catalogo, 3);
    // r1 usa 3 ingredientes, r2 usa 1 (masa que ya estaba), r3 usa 0 → 3 unicos
    assert.strictEqual(r.data.ingredientes_usados_unicos, 3);
  });

  await testAsync('estadisticas con fs 404 → contadores a 0', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    makeFsBackend(bus, null);
    await load(m, bus, logger);
    const r = await m.handleEstadisticas({ project_id: 'p1' });
    assert.strictEqual(r.data.total_recetas, 0);
    assert.strictEqual(r.data.ingredientes_usados_unicos, 0);
  });

  // ---------- Group 6: error paths ----------

  await testAsync('fs error (no enoent) → propaga code canonico', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    bus.subscribe('fs.read.request', async (req) => {
      setImmediate(() => bus.publish('fs.read.response', {
        request_id: req.request_id,
        error: { code: 'PERMISSION_DENIED', message: 'denied' }
      }));
    });
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1' });
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
  });

  await testAsync('fs content no parseable como JSON → UPSTREAM_INVALID_RESPONSE', async () => {
    const bus = makeMiniBus();
    const { m, logger } = makeModule(bus);
    bus.subscribe('fs.read.request', async (req) => {
      setImmediate(() => bus.publish('fs.read.response', {
        request_id: req.request_id,
        content: '{ this is broken JSON'
      }));
    });
    await load(m, bus, logger);
    const r = await m.handleListar({ project_id: 'p1' });
    assert.strictEqual(r.error.code, 'UPSTREAM_INVALID_RESPONSE');
  });

  await testAsync('sin eventBus disponible → UPSTREAM_UNREACHABLE', async () => {
    const m = new RecetasApiModule();
    m.logger = { debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{} };
    m.config = { fs_request_timeout_ms: 100, default_list_limit: 100 };
    m.eventBus = null;
    const r = await m.handleListar({ project_id: 'p1' });
    assert.strictEqual(r.error.code, 'UPSTREAM_UNREACHABLE');
  });

  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})().catch(err => { console.error('FATAL', err); process.exit(1); });
