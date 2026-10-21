/**
 * Tests unitarios — pizzepos/ingredientes (POC2 reescritura).
 *
 * Aislamiento: tests con persistencia usan tmpdir como base_path.
 *
 * Ejecutar: node tests/unit/pizzepos__ingredientes.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const fsp    = require('fs').promises;
const os     = require('os');

const IngredientesModule = require('../../modules/pizzepos/ingredientes/index.js');

// --------------------------------------------------
// Mocks
// --------------------------------------------------

function makeMocks() {
  const logs         = [];
  const published    = [];
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

const tmpDirs = [];
function makeTmpProject() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredientes-test-'));
  tmpDirs.push(base);
  return base;
}
function cleanupTmp() {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}

async function instantiate(mocks, opts = {}) {
  const m = new IngredientesModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  if (opts.project) {
    await m.onProjectActivated({ data: { project_id: opts.project.id, base_path: opts.project.base }});
  }
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); cleanupTmp(); process.exit(1); }
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
  console.log('pizzepos/ingredientes — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa map vacio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'ingredientes');
    assert.strictEqual(m.version, '5.0.0');
    assert.strictEqual(m.ingredientes.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia ingredientes y storagePath', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.ingredientes.set('ing-1', { id: 'ing-1' });
    m.storagePath = '/x';
    await m.onUnload();
    assert.strictEqual(m.ingredientes.size, 0);
    assert.strictEqual(m.storagePath, null);
  });

  // ==========================================
  // Group 2: Validacion canonica
  // ==========================================

  await testAsync('handleGetIngrediente sin id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetIngrediente({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'id');
    await m.onUnload();
  });

  await testAsync('handleSearchIngredientes sin q → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSearchIngredientes({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.details.field, 'q');
    await m.onUnload();
  });

  await testAsync('handleUpdatePrecios sin precio_extra ni porcentaje → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUpdatePrecios({ tipo: 'queso' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Bus subscribes — sync desde carta + producto
  // ==========================================

  await testAsync('onProjectActivated carga ingredientes desde disco si existen', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();

    // Pre-crear archivo de ingredientes
    const dir = path.join(base, 'storage', 'pizzepos');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'ingredientes.json'), JSON.stringify({
      ingredientes: [
        { id: 'ing-tomate', nombre: 'Tomate', tipo: 'verdura', grupos: ['pizzas'], precio_extra: 0 }
      ]
    }));

    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    assert.strictEqual(m.ingredientes.size, 1);
    assert.strictEqual(m.ingredientes.get('ing-tomate').nombre, 'Tomate');
    await m.onUnload();
  });

  await testAsync('onCartaActualizada con ingredientes_catalogo crea nuevos + emite ingrediente.creado', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    mocks.published.length = 0;

    await m.onCartaActualizada({ data: {
      project_id:  'p1',
      correlation_id: 'cid-CA',
      ingredientes_catalogo: [
        { id: 'ing-q', nombre: 'Mozzarella', tipo: 'queso',  grupos: ['pizzas'] },
        { id: 'ing-c', nombre: 'Bacon',      tipo: 'carne',  grupos: ['pizzas'] }
      ]
    }});

    assert.strictEqual(m.ingredientes.size, 2);
    const evs = publishedOf(mocks, 'ingrediente.creado');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-CA');
    assert.strictEqual(evs[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('onCartaActualizada con productos extrae ingredientes_base y mergea grupos', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});

    await m.onCartaActualizada({ data: {
      project_id: 'p1',
      productos: [
        { id: 'p1', categoria: 'pizzas', ingredientes_base: [{ id: 'ing-tomate', nombre: 'Tomate' }] },
        { id: 'p2', categoria: 'bocadillos', ingredientes_base: [{ id: 'ing-tomate', nombre: 'Tomate' }] }
      ]
    }});

    const tomate = m.ingredientes.get('ing-tomate');
    assert.ok(tomate);
    assert.deepStrictEqual(tomate.grupos.sort(), ['bocadillos', 'pizzas']);
    await m.onUnload();
  });

  await testAsync('onProductoCreado registra ingredientes del producto en su grupo', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    mocks.published.length = 0;

    await m.onProductoCreado({ data: {
      project_id: 'p1',
      producto_id: 'prod-1',
      categoria: 'pizzas',
      ingredientes_base: [
        { id: 'ing-q', nombre: 'Mozzarella' },
        { id: 'ing-t', nombre: 'Tomate' }
      ]
    }});

    assert.strictEqual(m.ingredientes.size, 2);
    assert.deepStrictEqual(m.ingredientes.get('ing-q').grupos, ['pizzas']);
    assert.strictEqual(publishedOf(mocks, 'ingrediente.creado').length, 2);
    await m.onUnload();
  });

  await testAsync('onIngredienteActualizadoExterno loop-safe: NO aplica si valor identico', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});

    m.ingredientes.set('ing-x', { id: 'ing-x', nombre: 'Tomate', precio_extra: 5 });
    mocks.published.length = 0;

    // Mismo valor → no debe cambiar
    const beforeUpdated = m.ingredientes.get('ing-x').updated_at;
    await m.onIngredienteActualizadoExterno({ data: {
      ingrediente_id: 'ing-x',
      cambios: { precio_extra: 5 }
    }});
    assert.strictEqual(m.ingredientes.get('ing-x').updated_at, beforeUpdated, 'sin cambio si valor identico');

    // Valor distinto → SI aplica
    await m.onIngredienteActualizadoExterno({ data: {
      ingrediente_id: 'ing-x',
      cambios: { precio_extra: { nuevo: 10 } }
    }});
    assert.strictEqual(m.ingredientes.get('ing-x').precio_extra, 10);
    await m.onUnload();
  });

  // ==========================================
  // Group 4: UI handlers — list/search/update
  // ==========================================

  await testAsync('handleListIngredientes filtra por tipo, grupo, alergeno', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.ingredientes.set('q1', { id: 'q1', nombre: 'Mozzarella', tipo: 'queso', grupos: ['pizzas'], es_alergeno: true,  disponible: true });
    m.ingredientes.set('c1', { id: 'c1', nombre: 'Bacon',      tipo: 'carne', grupos: ['pizzas'], es_alergeno: false, disponible: true });
    m.ingredientes.set('v1', { id: 'v1', nombre: 'Tomate',     tipo: 'verdura', grupos: ['ensaladas'], es_alergeno: false, disponible: true });

    const all  = await m.handleListIngredientes({});
    assert.strictEqual(all.data.total, 3);

    const queso = await m.handleListIngredientes({ tipo: 'queso' });
    assert.strictEqual(queso.data.total, 1);

    const pizzas = await m.handleListIngredientes({ grupo: 'pizzas' });
    assert.strictEqual(pizzas.data.total, 2);

    const aler = await m.handleListIngredientes({ alergeno: true });
    assert.strictEqual(aler.data.total, 1);
    assert.strictEqual(aler.data.ingredientes[0].id, 'q1');
    await m.onUnload();
  });

  await testAsync('handleSearchIngredientes busca case-insensitive en nombre', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.ingredientes.set('q1', { id: 'q1', nombre: 'Mozzarella', tipo: 'queso', grupos: ['pizzas'] });
    m.ingredientes.set('q2', { id: 'q2', nombre: 'Parmesano',  tipo: 'queso', grupos: ['pizzas'] });

    const r = await m.handleSearchIngredientes({ q: 'mozza' });
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.resultados[0].id, 'q1');
    await m.onUnload();
  });

  await testAsync('handleGetPrecio devuelve precio_extra y disponibilidad', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.ingredientes.set('q1', { id: 'q1', precio_extra: 1.5, disponible: true });
    const r = await m.handleGetPrecio({ ingrediente_id: 'q1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.precio_extra, 1.5);
    assert.strictEqual(r.data.disponible, true);
    await m.onUnload();
  });

  await testAsync('handleListAlergenos agrupa por tipo de alergeno', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.ingredientes.set('q1', { id: 'q1', nombre: 'Queso', es_alergeno: true,  alergenos: ['lacteos'] });
    m.ingredientes.set('p1', { id: 'p1', nombre: 'Pasta', es_alergeno: true,  alergenos: ['gluten', 'huevo'] });
    m.ingredientes.set('v1', { id: 'v1', nombre: 'Tomate', es_alergeno: false });

    const r = await m.handleListAlergenos();
    assert.strictEqual(r.data.total, 2);
    assert.strictEqual(r.data.por_tipo.lacteos.length, 1);
    assert.strictEqual(r.data.por_tipo.gluten.length, 1);
    await m.onUnload();
  });

  await testAsync('handleUpdateIngrediente modifica + emite ingrediente.actualizado con diff', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    m.ingredientes.set('q1', { id: 'q1', nombre: 'Mozzarella', precio_extra: 0 });
    mocks.published.length = 0;

    const r = await m.handleUpdateIngrediente({ id: 'q1', precio_extra: 1.5 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.precio_extra, 1.5);

    const evs = publishedOf(mocks, 'ingrediente.actualizado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].cambios.precio_extra.nuevo, 1.5);
    await m.onUnload();
  });

  await testAsync('handleUpdatePrecios por tipo aplica a todos los matched', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    m.ingredientes.set('q1', { id: 'q1', nombre: 'Mozzarella', tipo: 'queso', grupos: ['pizzas'], precio_extra: 0 });
    m.ingredientes.set('q2', { id: 'q2', nombre: 'Parmesano',  tipo: 'queso', grupos: ['pizzas'], precio_extra: 0 });
    m.ingredientes.set('c1', { id: 'c1', nombre: 'Bacon',      tipo: 'carne', grupos: ['pizzas'], precio_extra: 0 });
    mocks.published.length = 0;

    const r = await m.handleUpdatePrecios({ tipo: 'queso', precio_extra: 1.5 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    assert.strictEqual(m.ingredientes.get('q1').precio_extra, 1.5);
    assert.strictEqual(m.ingredientes.get('q2').precio_extra, 1.5);
    assert.strictEqual(m.ingredientes.get('c1').precio_extra, 0); // no afectado

    const evs = publishedOf(mocks, 'ingrediente.actualizado');
    assert.strictEqual(evs.length, 2);
    await m.onUnload();
  });

  await testAsync('handleUpdatePrecios con porcentaje aplica subida proporcional', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});
    m.ingredientes.set('q1', { id: 'q1', nombre: 'X', tipo: 'queso', grupos: ['pizzas'], precio_extra: 1.0 });

    const r = await m.handleUpdatePrecios({ tipo: 'queso', porcentaje: 50 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(m.ingredientes.get('q1').precio_extra, 1.5);
    await m.onUnload();
  });

  await testAsync('handleUpdatePrecios sin match → 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleUpdatePrecios({ tipo: 'fantasma', precio_extra: 1 });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Persistencia atomica
  // ==========================================

  await testAsync('_atomicWriteFile escribe via .tmp + rename', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const dir = makeTmpProject();
    const target = path.join(dir, 'a.json');
    await m._atomicWriteFile(target, '{"x":1}');
    assert.strictEqual(await fsp.readFile(target, 'utf-8'), '{"x":1}');
    const tmpExists = await fsp.access(target + '.tmp').then(() => true).catch(() => false);
    assert.strictEqual(tmpExists, false);
    await m.onUnload();
  });

  await testAsync('saveToDisk + loadFromDisk roundtrip', async () => {
    const mocks = makeMocks();
    const base  = makeTmpProject();
    const { module: m } = await instantiate(mocks, { project: { id: 'p1', base }});

    m.ingredientes.set('q1', { id: 'q1', nombre: 'Mozzarella', tipo: 'queso', grupos: ['pizzas'], precio_extra: 1.5 });
    await m._saveToDisk();

    // Verificar archivo
    const file = path.join(base, 'storage', 'pizzepos', 'ingredientes.json');
    const content = JSON.parse(await fsp.readFile(file, 'utf-8'));
    assert.strictEqual(content.ingredientes.length, 1);
    assert.strictEqual(content.ingredientes[0].nombre, 'Mozzarella');

    // Reload con nueva instancia
    await m.onUnload();
    const mocks2 = makeMocks();
    const { module: m2 } = await instantiate(mocks2, { project: { id: 'p1', base }});
    assert.strictEqual(m2.ingredientes.size, 1);
    assert.strictEqual(m2.ingredientes.get('q1').precio_extra, 1.5);
    await m2.onUnload();
  });

  // ==========================================
  // Group 6: Helpers internos
  // ==========================================

  await testAsync('_clasificarIngrediente clasifica por nombre correcto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._clasificarIngrediente('Mozzarella'), 'queso');
    assert.strictEqual(m._clasificarIngrediente('Bacon'), 'carne');
    assert.strictEqual(m._clasificarIngrediente('Tomate'), 'verdura');
    assert.strictEqual(m._clasificarIngrediente('Salsa Pesto'), 'salsa');
    assert.strictEqual(m._clasificarIngrediente('Gambas'), 'marisco');
    assert.strictEqual(m._clasificarIngrediente('Masa fina'), 'masa');
    assert.strictEqual(m._clasificarIngrediente('No clasificable'), 'otro');
    await m.onUnload();
  });

  await testAsync('_slugify normaliza acentos y espacios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._slugify('Mozzarella di Bufala'), 'mozzarella_di_bufala');
    assert.strictEqual(m._slugify('Café Bañado'), 'cafe_banado');
    assert.strictEqual(m._slugify(''), 'sin_nombre');
    await m.onUnload();
  });

  await testAsync('_countByType y _countByGroup agregan correctamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.ingredientes.set('q1', { id: 'q1', tipo: 'queso',   grupos: ['pizzas'] });
    m.ingredientes.set('q2', { id: 'q2', tipo: 'queso',   grupos: ['pizzas', 'bocadillos'] });
    m.ingredientes.set('c1', { id: 'c1', tipo: 'carne',   grupos: ['pizzas'] });

    const t = m._countByType();
    assert.strictEqual(t.queso, 2);
    assert.strictEqual(t.carne, 1);

    const g = m._countByGroup();
    assert.strictEqual(g.pizzas, 3);
    assert.strictEqual(g.bocadillos, 1);
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2
  // ==========================================

  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { field: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea ENOENT/required/E*', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'EIO' })), 'UNKNOWN_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id, defaultea project_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { x: 1 }, { correlation_id: 'cid-X', project_id: 'p-X' });
    await m._publicarEvento('test.event', { y: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs[0].correlation_id, 'cid-X');
    assert.strictEqual(evs[0].project_id, 'p-X');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-X');
    assert.strictEqual(evs[1].project_id, 'default');
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status y registra metric ingredientes.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.metricsCalls.length = 0;
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND' });
    const r = m._handleHandlerError('t.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    const metric = mocks.metricsCalls.find(c => c[1] === 'ingredientes.errors');
    assert.ok(metric);
    await m.onUnload();
  });

  cleanupTmp();
  console.log('\nTodos los tests pasaron.');
  process.exit(0);
})();
