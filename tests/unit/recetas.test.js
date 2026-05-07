'use strict';

const assert = require('assert');

const RecetasModule = require('../../modules/recetas/index.js');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks) {
  const m = new RecetasModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus, moduleConfig: {} });
  return { module: m };
}

// Instantiate with in-memory store — bypasses async event-bus I/O
async function instantiateWithStore(mocks) {
  const stores = new Map();
  const m = new RecetasModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus, moduleConfig: {} });

  m._slugForProject = async (pid) => {
    if (!pid) { const e = new Error('proyecto_id requerido'); e._code = 'INVALID_INPUT'; throw e; }
    return `slug-${pid}`;
  };
  m._loadStore = async (slug) => {
    const s = stores.get(slug);
    return s ? JSON.parse(JSON.stringify(s)) : m._emptyStore();
  };
  m._saveStore = async (slug, store) => { stores.set(slug, JSON.parse(JSON.stringify(store))); };

  return { module: m, stores };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  }
}

function isCanonicalError(result) {
  return result && typeof result.status === 'number'
    && result.error && typeof result.error === 'object'
    && typeof result.error.code === 'string'
    && typeof result.error.message === 'string'
    && !('data' in result);
}

function isCanonicalSuccess(result) {
  return result && typeof result.status === 'number'
    && result.data && typeof result.data === 'object'
    && !('error' in result);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('recetas — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa maps vacios y captura logger/metrics/eventBus', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.ok(m.pendingFs instanceof Map && m.pendingFs.size === 0);
    assert.ok(m.pendingProject instanceof Map && m.pendingProject.size === 0);
    assert.ok(m.writeQueues instanceof Map && m.writeQueues.size === 0);
    assert.ok(m.projectSlugs instanceof Map && m.projectSlugs.size === 0);
    assert.strictEqual(m.logger, mocks.logger);
    assert.strictEqual(m.metrics, mocks.metrics);
    await m.onUnload();
  });

  await testAsync('onUnload limpia todos los Maps y cancela timers sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);

    m.pendingFs.set('leak-1', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 60000) });
    m.pendingProject.set('leak-2', { resolve: () => {}, reject: () => {}, timer: setTimeout(() => {}, 60000) });
    m.projectSlugs.set('pid', 'slug');

    await m.onUnload();
    assert.strictEqual(m.pendingFs.size, 0);
    assert.strictEqual(m.pendingProject.size, 0);
    assert.strictEqual(m.writeQueues.size, 0);
    assert.strictEqual(m.projectSlugs.size, 0);
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  await testAsync('crear: proyecto_id faltante → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.crear({ nombre: 'Test' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('crear: nombre faltante → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m, stores } = await instantiateWithStore(mocks);
    const r = await m.crear({ proyecto_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('obtener: proyecto_id faltante → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.obtener({ receta_id: 'x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('actualizar: receta_id faltante → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);
    const r = await m.actualizar({ proyecto_id: 'p1', cambios: {} });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('revertir: target_version faltante → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);
    const r = await m.revertir({ proyecto_id: 'p1', receta_id: 'x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('actualizarPrecio: nombre faltante → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);
    const r = await m.actualizarPrecio({ proyecto_id: 'p1', precio_mercado: 1.0 });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('investigarReceta: nombre_receta faltante → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);
    const r = await m.investigarReceta({ proyecto_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: CRUD basico
  // ==========================================

  await testAsync('crear: crea receta con status 201 y publica receta.creada con correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const r = await m.crear({ proyecto_id: 'p1', nombre: 'Tortilla', ingredientes: ['huevos', 'patatas'], porciones: 4 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.id);
    assert.strictEqual(r.data.nombre, 'Tortilla');
    assert.strictEqual(r.data.version, 1);

    const ev = publishedOf(mocks, 'receta.creada');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].nombre, 'Tortilla');
    assert.ok(ev[0].correlation_id);
    assert.ok(ev[0].timestamp);
    await m.onUnload();
  });

  await testAsync('crear: nombre duplicado activo → 409 ALREADY_EXISTS', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'Gazpacho' });
    const r = await m.crear({ proyecto_id: 'p1', nombre: 'Gazpacho' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
    await m.onUnload();
  });

  await testAsync('crear: receta sin ingredientes/porciones/instrucciones marca incompleta=true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const r = await m.crear({ proyecto_id: 'p1', nombre: 'Solo nombre' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.incompleta, true);
    assert.ok(r.data.campos_pendientes.includes('ingredientes'));
    assert.ok(r.data.campos_pendientes.includes('porciones'));
    assert.ok(r.data.campos_pendientes.includes('instrucciones'));
    await m.onUnload();
  });

  await testAsync('listar: devuelve recetas activas paginadas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'Receta A' });
    await m.crear({ proyecto_id: 'p1', nombre: 'Receta B' });

    const r = await m.listar({ proyecto_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 2);
    assert.ok(Array.isArray(r.data.recetas));
    await m.onUnload();
  });

  await testAsync('listar: solo_incompletas filtra correctamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'Incompleta' });
    await m.crear({ proyecto_id: 'p1', nombre: 'Completa',
      ingredientes: [{ nombre: 'x', cantidad: 1, unidad: 'kg' }], porciones: 2,
      instrucciones: ['paso 1'] });

    const r = await m.listar({ proyecto_id: 'p1', solo_incompletas: true });
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.recetas[0].nombre, 'Incompleta');
    await m.onUnload();
  });

  await testAsync('obtener: encuentra receta por id → 200', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Paella' });
    const r = await m.obtener({ proyecto_id: 'p1', receta_id: created.data.id });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.nombre, 'Paella');
    assert.ok('versiones_anteriores' in r.data);
    await m.onUnload();
  });

  await testAsync('obtener: encuentra receta por nombre parcial', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'Caldo de pollo' });
    const r = await m.obtener({ proyecto_id: 'p1', nombre: 'caldo de pollo' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.nombre, 'Caldo de pollo');
    await m.onUnload();
  });

  await testAsync('obtener: no encontrada → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const r = await m.obtener({ proyecto_id: 'p1', receta_id: 'no-existe' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('eliminar: archiva receta y la excluye del listado por defecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Para eliminar' });
    const r = await m.eliminar({ proyecto_id: 'p1', receta_id: created.data.id });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'archivada');

    const ev = publishedOf(mocks, 'receta.eliminada');
    assert.strictEqual(ev.length, 1);
    assert.ok(ev[0].correlation_id);

    const lista = await m.listar({ proyecto_id: 'p1' });
    assert.strictEqual(lista.data.total, 0);

    const archivadas = await m.listar({ proyecto_id: 'p1', estado: 'archivada' });
    assert.strictEqual(archivadas.data.total, 1);
    await m.onUnload();
  });

  await testAsync('eliminar: ya archivada → 200 ya_estaba_archivada (idempotente)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Doble archivo' });
    await m.eliminar({ proyecto_id: 'p1', receta_id: created.data.id });
    const r = await m.eliminar({ proyecto_id: 'p1', receta_id: created.data.id });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.status, 'ya_estaba_archivada');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: actualizar, historial, revertir
  // ==========================================

  await testAsync('actualizar: modifica campos y sube version a 2, publica receta.actualizada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Antes' });
    const r = await m.actualizar({ proyecto_id: 'p1', receta_id: created.data.id,
      cambios: { nombre: 'Despues', porciones: 4 } });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.version, 2);
    assert.strictEqual(r.data.nombre, 'Despues');
    assert.ok(r.data.cambios_aplicados.nombre);
    assert.ok(r.data.cambios_aplicados.porciones);

    const ev = publishedOf(mocks, 'receta.actualizada');
    assert.strictEqual(ev.length, 1);
    assert.ok(ev[0].correlation_id);
    await m.onUnload();
  });

  await testAsync('actualizar: receta no encontrada → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const r = await m.actualizar({ proyecto_id: 'p1', receta_id: 'id-fantasma', cambios: { nombre: 'X' } });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('historial: devuelve versiones anteriores tras actualizaciones', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Con historia' });
    await m.actualizar({ proyecto_id: 'p1', receta_id: created.data.id, cambios: { porciones: 2 } });
    await m.actualizar({ proyecto_id: 'p1', receta_id: created.data.id, cambios: { porciones: 4 } });

    const r = await m.historial({ proyecto_id: 'p1', receta_id: created.data.id });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.version_actual, 3);
    assert.strictEqual(r.data.versiones_anteriores, 2);
    assert.strictEqual(r.data.historial.length, 2);
    await m.onUnload();
  });

  await testAsync('revertir: restaura nombre de version anterior y sube version', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Original' });
    await m.actualizar({ proyecto_id: 'p1', receta_id: created.data.id, cambios: { nombre: 'Modificado' } });

    const r = await m.revertir({ proyecto_id: 'p1', receta_id: created.data.id, target_version: 1 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.revertida_a_version, 1);
    assert.ok(r.data.version_actual >= 3);

    const obtenida = await m.obtener({ proyecto_id: 'p1', receta_id: created.data.id });
    assert.strictEqual(obtenida.data.nombre, 'Original');
    await m.onUnload();
  });

  await testAsync('revertir: version no existente → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Solo v1' });
    const r = await m.revertir({ proyecto_id: 'p1', receta_id: created.data.id, target_version: 99 });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // ==========================================
  // Group 5: estadisticas, buscar, ingredientes, analizar, investigarReceta
  // ==========================================

  await testAsync('estadisticas: cuenta recetas por estado e ingredientes del catalogo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'A' });
    await m.crear({ proyecto_id: 'p1', nombre: 'B' });
    const c = await m.crear({ proyecto_id: 'p1', nombre: 'C' });
    await m.eliminar({ proyecto_id: 'p1', receta_id: c.data.id });
    await m.actualizarPrecio({ proyecto_id: 'p1', nombre: 'Harina', precio_mercado: 1.2 });

    const r = await m.estadisticas({ proyecto_id: 'p1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total_recetas, 3);
    assert.strictEqual(r.data.por_estado.activa, 2);
    assert.strictEqual(r.data.por_estado.archivada, 1);
    assert.strictEqual(r.data.ingredientes_catalogo, 1);
    assert.strictEqual(r.data.ingredientes_con_precio, 1);
    await m.onUnload();
  });

  await testAsync('buscar: filtra por texto en nombre', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'Gazpacho Andaluz' });
    await m.crear({ proyecto_id: 'p1', nombre: 'Paella Valenciana' });

    const r = await m.buscar({ proyecto_id: 'p1', texto: 'gazpacho' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.recetas[0].nombre, 'Gazpacho Andaluz');
    await m.onUnload();
  });

  await testAsync('buscar: filtra por ingrediente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'Con Tomate',
      ingredientes: [{ nombre: 'tomate', cantidad: 2, unidad: 'ud' }] });
    await m.crear({ proyecto_id: 'p1', nombre: 'Sin Tomate',
      ingredientes: [{ nombre: 'lechuga', cantidad: 1, unidad: 'ud' }] });

    const r = await m.buscar({ proyecto_id: 'p1', ingrediente: 'tomate' });
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.recetas[0].nombre, 'Con Tomate');
    await m.onUnload();
  });

  await testAsync('ingredientes: lista catalogo y filtra por categoria', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.actualizarPrecio({ proyecto_id: 'p1', nombre: 'Harina', precio_mercado: 1.2, categoria: 'seco' });
    await m.actualizarPrecio({ proyecto_id: 'p1', nombre: 'Leche', precio_mercado: 0.9, categoria: 'lacteo' });

    const r = await m.ingredientes({ proyecto_id: 'p1' });
    assert.strictEqual(r.data.total, 2);

    const filtrado = await m.ingredientes({ proyecto_id: 'p1', categoria: 'seco' });
    assert.strictEqual(filtrado.data.total, 1);
    assert.strictEqual(filtrado.data.ingredientes[0].nombre, 'Harina');
    await m.onUnload();
  });

  await testAsync('actualizarPrecio: crea ingrediente nuevo y luego lo actualiza sin duplicar', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.actualizarPrecio({ proyecto_id: 'p1', nombre: 'Aceite', precio_mercado: 5.0 });
    const r = await m.actualizarPrecio({ proyecto_id: 'p1', nombre: 'Aceite', precio_mercado: 5.5 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.precio_mercado, 5.5);

    const lista = await m.ingredientes({ proyecto_id: 'p1' });
    assert.strictEqual(lista.data.total, 1);

    const ev = publishedOf(mocks, 'ingrediente.precio.actualizado');
    assert.strictEqual(ev.length, 2);
    assert.ok(ev[0].correlation_id);
    await m.onUnload();
  });

  await testAsync('analizar: calcula coste con ingredientes del catalogo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.actualizarPrecio({ proyecto_id: 'p1', nombre: 'leche', precio_mercado: 1.0, unidad: 'litro' });
    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Cafe con leche',
      ingredientes: [{ nombre: 'leche', cantidad: 0.2, unidad: 'litro' }],
      instrucciones: ['paso 1'], porciones: 1 });

    const r = await m.analizar({ proyecto_id: 'p1', receta_id: created.data.id });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.coste_es_real, true);
    assert.ok(r.data.coste_total != null);
    assert.ok(r.data.coste_por_porcion != null);
    await m.onUnload();
  });

  await testAsync('analizar: receta incompleta → 422 PRECONDITION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const created = await m.crear({ proyecto_id: 'p1', nombre: 'Incompleta' });
    const r = await m.analizar({ proyecto_id: 'p1', receta_id: created.data.id });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
    assert.ok(r.error.details.campos_pendientes.length > 0);
    await m.onUnload();
  });

  await testAsync('investigarReceta: devuelve receta existente con existe_en_proyecto=true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    await m.crear({ proyecto_id: 'p1', nombre: 'Tortilla' });
    const r = await m.investigarReceta({ proyecto_id: 'p1', nombre_receta: 'Tortilla' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.existe_en_proyecto, true);
    assert.ok(r.data.receta);
    await m.onUnload();
  });

  await testAsync('investigarReceta: receta inexistente → 200 con instruccion_para_llm', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiateWithStore(mocks);

    const r = await m.investigarReceta({ proyecto_id: 'p1', nombre_receta: 'Sushi' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.existe_en_proyecto, false);
    assert.ok(typeof r.data.instruccion_para_llm === 'string' && r.data.instruccion_para_llm.length > 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 6: _calcIncompleta
  // ==========================================

  await testAsync('_calcIncompleta: receta completa → incompleta=false, campos_pendientes=[]', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const receta = { ingredientes: [{ nombre: 'x' }], porciones: 2, instrucciones: ['paso 1'] };
    m._calcIncompleta(receta);
    assert.strictEqual(receta.incompleta, false);
    assert.deepStrictEqual(receta.campos_pendientes, []);
    await m.onUnload();
  });

  await testAsync('_calcIncompleta: todos los campos vacíos → incompleta=true con 3 pendientes', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const receta = { ingredientes: [], porciones: null, instrucciones: [] };
    m._calcIncompleta(receta);
    assert.strictEqual(receta.incompleta, true);
    assert.ok(receta.campos_pendientes.includes('ingredientes'));
    assert.ok(receta.campos_pendientes.includes('porciones'));
    assert.ok(receta.campos_pendientes.includes('instrucciones'));
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'UNKNOWN_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'UNKNOWN_ERROR', message: 'oops' } });
    assert.ok(!('details' in r2.error));
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea mensajes a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('no encontrado')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'UNKNOWN_ERROR');
    assert.strictEqual(m._classifyHandlerError(new Error('request timeout')), 'TIMEOUT');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const incremented = mocks.metricsCalls.filter(c => c[0] === 'increment' && c[1] === 'recetas.error');
    assert.ok(incremented.length > 0);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();
