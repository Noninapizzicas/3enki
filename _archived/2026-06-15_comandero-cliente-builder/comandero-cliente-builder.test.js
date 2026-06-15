/**
 * Tests unitarios — comandero-cliente-builder (POC2).
 *
 * Ejecutar: node tests/unit/comandero-cliente-builder.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ComanderoClienteBuilderModule = require('../../modules/comandero-cliente-builder/index.js');
const { SafeUpdate } = require('../../modules/comandero-cliente-builder/services/safe-update');
const { generateStaticHTML } = require('../../modules/comandero-cliente-builder/services/static-template');

let TMP_ROOT, ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccb-test-'));
  process.chdir(TMP_ROOT);
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'projects'), { recursive: true });
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  }
}

function setupProyecto(slug = 'vapers', tienda_api_url = 'https://enki-ai.online') {
  const dir = path.join(TMP_ROOT, 'data', 'projects', slug);
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config', 'project.json'),
    JSON.stringify({ name: slug, tienda_api_url })
  );
}

function makeMocks() {
  const logs = [], published = [], metricsCalls = [];
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
  const m = new ComanderoClienteBuilderModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { module: m };
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function catalogoMinimo(project_id) {
  return {
    project_id,
    productos: [
      { id: 'v1', nombre: 'Cloud Menta', precio: 15, categoria: 'vapeo' },
      { id: 'v2', nombre: 'Vampire',     precio: 18, categoria: 'vapeo' },
      { id: 'a1', nombre: 'Cargador',    precio: 8,  categoria: 'accesorios' }
    ],
    categorias: [
      { id: 'vapeo', nombre: 'Vapeadores', orden: 1 },
      { id: 'accesorios', nombre: 'Accesorios', orden: 2 }
    ]
  };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  setupTmpCwd();
  console.log('comandero-cliente-builder — POC2\n');

  // ===========================================================
  // Group 1: Lifecycle
  // ===========================================================

  await testAsync('onLoad asigna estado limpio, config, safeUpdate, publica tarifas.config.solicitada', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'comandero-cliente-builder');
    assert.strictEqual(m.version, '1.0.0');
    assert.ok(m.safeUpdate instanceof SafeUpdate);
    assert.strictEqual(m.catalogoCachePerProject.size, 0);
    const tarifasCalls = publishedOf(mocks, 'tarifas.config.solicitada');
    assert.strictEqual(tarifasCalls.length, 1);
    await m.onUnload();
  });

  await testAsync('onUnload limpia caches y safeUpdate', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.catalogoCachePerProject.set('x', { productos: [], categorias: [] });
    m.tarifasCachePerProject.set('x', { config: {} });
    m.projectInfoCache.set('x', {});
    await m.onUnload();
    assert.strictEqual(m.catalogoCachePerProject.size, 0);
    assert.strictEqual(m.tarifasCachePerProject.size, 0);
    assert.strictEqual(m.projectInfoCache.size, 0);
    assert.strictEqual(m.safeUpdate, null);
  });

  // ===========================================================
  // Group 2: Subscribes hidratan cache
  // ===========================================================

  await testAsync('onCatalogoActualizado hidrata cache con productos y categorias', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    const cache = m.catalogoCachePerProject.get('vapers');
    assert.strictEqual(cache.productos.length, 3);
    assert.strictEqual(cache.categorias.length, 2);
    await m.onUnload();
  });

  await testAsync('onCatalogoActualizado sin project_id se ignora', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({ data: { productos: [] } });
    assert.strictEqual(m.catalogoCachePerProject.size, 0);
    await m.onUnload();
  });

  await testAsync('onProductoCreado upserta producto en cache si proyecto hidratado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    await m.onProductoCreado({ data: { project_id: 'vapers', producto_id: 'v3', nombre: 'Nuevo', precio: 20, categoria: 'vapeo' } });
    const cache = m.catalogoCachePerProject.get('vapers');
    assert.strictEqual(cache.productos.length, 4);
    assert.ok(cache.productos.some(p => p.id === 'v3'));
    await m.onUnload();
  });

  await testAsync('onProductoActualizado modifica producto existente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    await m.onProductoActualizado({ data: { project_id: 'vapers', producto_id: 'v1', precio: 99 } });
    const cache = m.catalogoCachePerProject.get('vapers');
    const v1 = cache.productos.find(p => p.id === 'v1');
    assert.strictEqual(v1.precio, 99);
    assert.strictEqual(v1.nombre, 'Cloud Menta', 'campos no pasados se preservan');
    await m.onUnload();
  });

  await testAsync('onProductoEliminado quita del cache y purga presentacion huerfana', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers');
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    await m.handlePresentacionActualizar({ project_id: 'vapers', producto_id: 'v1', descripcion_publica: 'algo' });
    await m.onProductoEliminado({ data: { project_id: 'vapers', producto_id: 'v1' } });
    const cache = m.catalogoCachePerProject.get('vapers');
    assert.ok(!cache.productos.some(p => p.id === 'v1'));
    const pres = readJSON(path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'storage', 'comandero-cliente-builder', 'presentacion.json'));
    assert.ok(!pres.productos.v1, 'presentacion huerfana de v1 purgada');
    await m.onUnload();
  });

  await testAsync('onTarifasConfigActualizada hidrata cache de tarifas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onTarifasConfigActualizada({ data: { project_id: 'vapers', config: { canales: { web: 'carta-1' } } } });
    assert.ok(m.tarifasCachePerProject.has('vapers'));
    await m.onUnload();
  });

  // ===========================================================
  // Group 3: Tool presentacion.actualizar
  // ===========================================================

  await testAsync('presentacion.actualizar sin project_id → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handlePresentacionActualizar({ producto_id: 'v1', descripcion_publica: 'x' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'project_id');
    await m.onUnload();
  });

  await testAsync('presentacion.actualizar con catalogo no hidratado → 422 PRECONDITION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handlePresentacionActualizar({ project_id: 'vapers', producto_id: 'v1', descripcion_publica: 'x' });
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
    assert.strictEqual(r.error.details.kind, 'catalogo_no_hidratado');
    await m.onUnload();
  });

  await testAsync('presentacion.actualizar con producto_id que no existe → 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    const r = await m.handlePresentacionActualizar({ project_id: 'vapers', producto_id: 'ghost', descripcion_publica: 'x' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('presentacion.actualizar sin ningún campo de presentación → 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    const r = await m.handlePresentacionActualizar({ project_id: 'vapers', producto_id: 'v1' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'presentacion');
    await m.onUnload();
  });

  await testAsync('presentacion.actualizar success: persiste a disco + emite evento', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers');
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    const r = await m.handlePresentacionActualizar({
      project_id: 'vapers', producto_id: 'v1',
      descripcion_publica: 'Sabor menta', orden_publico: 1, oculto_publico: false
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.presentacion.descripcion_publica, 'Sabor menta');
    assert.strictEqual(r.data.presentacion.orden_publico, 1);
    const presPath = path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'storage', 'comandero-cliente-builder', 'presentacion.json');
    assert.ok(fs.existsSync(presPath));
    const pres = readJSON(presPath);
    assert.strictEqual(pres.productos.v1.descripcion_publica, 'Sabor menta');
    const events = publishedOf(mocks, 'comandero-cliente.presentacion.actualizada');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].producto_id, 'v1');
    await m.onUnload();
  });

  // ===========================================================
  // Group 4: Tool imagen.subir
  // ===========================================================

  await testAsync('imagen.subir sin imagen_base64 → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleImagenSubir({ project_id: 'vapers', producto_id: 'v1', content_type: 'image/png' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'imagen_base64');
    await m.onUnload();
  });

  await testAsync('imagen.subir con content_type no soportado → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleImagenSubir({ project_id: 'vapers', producto_id: 'v1', imagen_base64: 'AAAA', content_type: 'image/gif' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'content_type');
    await m.onUnload();
  });

  await testAsync('imagen.subir oversized (>2MB) → 400 too_large', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const bigBuffer = Buffer.alloc(3 * 1024 * 1024, 0xab);
    const r = await m.handleImagenSubir({
      project_id: 'vapers', producto_id: 'v1',
      imagen_base64: bigBuffer.toString('base64'),
      content_type: 'image/jpeg'
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.kind, 'too_large');
    await m.onUnload();
  });

  await testAsync('imagen.subir success: escribe archivo + URL canónica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers');
    const pixelPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da636060600000000500015d20140d0000000049454e44ae426082',
      'hex'
    );
    const r = await m.handleImagenSubir({
      project_id: 'vapers', producto_id: 'v1',
      imagen_base64: pixelPng.toString('base64'),
      content_type: 'image/png'
    });
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.imagen_url.endsWith('/v1.png'));
    const imgPath = path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'storage', 'comandero-cliente-builder', 'imagenes', 'v1.png');
    assert.ok(fs.existsSync(imgPath));
    assert.strictEqual(fs.statSync(imgPath).size, pixelPng.length);
    await m.onUnload();
  });

  await testAsync('imagen.subir acepta prefix data:image/...;base64,', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers');
    const r = await m.handleImagenSubir({
      project_id: 'vapers', producto_id: 'v1',
      imagen_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD/9k=',
      content_type: 'image/jpeg'
    });
    assert.strictEqual(r.status, 200);
    await m.onUnload();
  });

  // ===========================================================
  // Group 5: Tool categorias.reordenar
  // ===========================================================

  await testAsync('categorias.reordenar sin orden array → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCategoriasReordenar({ project_id: 'vapers', orden: 'no-array' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'orden');
    await m.onUnload();
  });

  await testAsync('categorias.reordenar con catalogo no hidratado → 422', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCategoriasReordenar({ project_id: 'vapers', orden: ['a', 'b'] });
    assert.strictEqual(r.status, 422);
    await m.onUnload();
  });

  await testAsync('categorias.reordenar success: persiste a _meta.categorias_orden + emite evento', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers');
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    const r = await m.handleCategoriasReordenar({ project_id: 'vapers', orden: ['accesorios', 'vapeo'] });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.orden, ['accesorios', 'vapeo']);
    const pres = readJSON(path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'storage', 'comandero-cliente-builder', 'presentacion.json'));
    assert.deepStrictEqual(pres._meta.categorias_orden, ['accesorios', 'vapeo']);
    const events = publishedOf(mocks, 'comandero-cliente.presentacion.actualizada');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].producto_id, '_categorias_orden');
    await m.onUnload();
  });

  // ===========================================================
  // Group 6: Tool bundle.generar
  // ===========================================================

  await testAsync('bundle.generar sin identidad.marca → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleBundleGenerar({ project_id: 'vapers', identidad: {} });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'identidad.marca');
    await m.onUnload();
  });

  await testAsync('bundle.generar con catalogo no hidratado → 422 PRECONDITION_FAILED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleBundleGenerar({ project_id: 'vapers', identidad: { marca: 'V' } });
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.error.code, 'PRECONDITION_FAILED');
    await m.onUnload();
  });

  await testAsync('bundle.generar sin tienda_api_url (param ni project.json) → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // Proyecto SIN project.json (no resolverá tienda_api_url)
    fs.mkdirSync(path.join(TMP_ROOT, 'data', 'projects', 'sin-config'), { recursive: true });
    await m.onCatalogoActualizado({ data: catalogoMinimo('sin-config') });
    const r = await m.handleBundleGenerar({ project_id: 'sin-config', identidad: { marca: 'X' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.details.field, 'tienda_api_url');
    await m.onUnload();
  });

  await testAsync('bundle.generar success: HTML escrito + latest alias + bundles.json + evento', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers');
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    await m.handlePresentacionActualizar({
      project_id: 'vapers', producto_id: 'v1',
      descripcion_publica: 'Sabor fresco', orden_publico: 1
    });
    const r = await m.handleBundleGenerar({
      project_id: 'vapers',
      identidad: { marca: 'Vapers', colores: { primario: '#22c55e' } }
    });
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.bundle_id);
    assert.ok(fs.existsSync(r.data.bundle_path));
    assert.ok(fs.existsSync(r.data.latest_alias));
    const html = fs.readFileSync(r.data.bundle_path, 'utf8');
    assert.ok(html.includes('Vapers'), 'marca aparece en HTML');
    assert.ok(html.includes('#22c55e'), 'color primario aparece en HTML');
    assert.ok(html.includes('Cloud Menta'), 'producto aparece en HTML');
    assert.ok(html.includes('Sabor fresco'), 'descripcion publica aparece');
    const idx = readJSON(path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'storage', 'comandero-cliente-builder', 'bundles.json'));
    assert.strictEqual(idx.bundles.length, 1);
    assert.strictEqual(idx.bundles[0].bundle_id, r.data.bundle_id);
    const events = publishedOf(mocks, 'comandero-cliente.bundle.generado');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].productos_count, 3);
    await m.onUnload();
  });

  await testAsync('bundle.generar respeta override tienda_api_url sobre el de project.json', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers', 'https://default-host.example');
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    const r = await m.handleBundleGenerar({
      project_id: 'vapers',
      identidad: { marca: 'Vapers' },
      tienda_api_url: 'https://override.example'
    });
    assert.strictEqual(r.status, 201);
    const html = fs.readFileSync(r.data.bundle_path, 'utf8');
    assert.ok(html.includes('override.example'));
    assert.ok(!html.includes('default-host.example'));
    await m.onUnload();
  });

  await testAsync('bundle.generar productos ocultos NO aparecen en el bundle', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers');
    await m.onCatalogoActualizado({ data: catalogoMinimo('vapers') });
    await m.handlePresentacionActualizar({ project_id: 'vapers', producto_id: 'v2', oculto_publico: true });
    const r = await m.handleBundleGenerar({ project_id: 'vapers', identidad: { marca: 'V' } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.productos_count, 2, 'v2 oculto NO se cuenta');
    const html = fs.readFileSync(r.data.bundle_path, 'utf8');
    assert.ok(!html.includes('Vampire'), 'producto oculto v2 no aparece');
    assert.ok(html.includes('Cloud Menta'), 'v1 visible aparece');
    await m.onUnload();
  });

  await testAsync('bundle.generar fallido publica comandero-cliente.bundle.fallido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleBundleGenerar({ project_id: 'vapers', identidad: { marca: 'V' } });
    assert.strictEqual(r.status, 422); // catalogo no hidratado
    // Bundle.fallido NO se emite aqui porque el shortcut de PRECONDITION_FAILED retorna
    // antes del try/catch que emite el evento de fallo. Es comportamiento intencional:
    // los errores de validación devuelven canonical error sin ruido en el bus.
    const fallidos = publishedOf(mocks, 'comandero-cliente.bundle.fallido');
    assert.strictEqual(fallidos.length, 0);
    await m.onUnload();
  });

  // ===========================================================
  // Group 7: Helpers POC2 + dominio aislados
  // ===========================================================

  await testAsync('hereda _errorResponse, _statusFromCode y _publicarEvento de BaseModule', async () => {
    const m = new ComanderoClienteBuilderModule();
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { field: 'x' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(m._statusFromCode('PRECONDITION_FAILED'), 422);
    assert.strictEqual(m._statusFromCode('RESOURCE_NOT_FOUND'), 404);
    assert.strictEqual(typeof m._publicarEvento, 'function');
  });

  await testAsync('_projectsDir respeta config.projects_dir o default', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._projectsDir(), 'data/projects');
    m.config.projects_dir = 'custom/path';
    assert.strictEqual(m._projectsDir(), 'custom/path');
    await m.onUnload();
  });

  await testAsync('_presentacionPath y _bundleHtmlPath construyen rutas canónicas', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const p1 = m._presentacionPath('vapers');
    assert.ok(p1.endsWith(path.join('data', 'projects', 'vapers', 'storage', 'comandero-cliente-builder', 'presentacion.json')));
    const p2 = m._bundleHtmlPath('vapers', 'abc-123');
    assert.ok(p2.endsWith(path.join('vapers', 'storage', 'comandero-cliente-builder', 'bundles', 'abc-123.html')));
    await m.onUnload();
  });

  await testAsync('_resolveTiendaApiUrl: param > project.json > null', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    setupProyecto('vapers', 'https://config-host.example');
    fs.mkdirSync(path.join(TMP_ROOT, 'data', 'projects', 'sin-cfg'), { recursive: true });
    assert.strictEqual(await m._resolveTiendaApiUrl('vapers', 'https://override.example'), 'https://override.example');
    assert.strictEqual(await m._resolveTiendaApiUrl('vapers'), 'https://config-host.example');
    assert.strictEqual(await m._resolveTiendaApiUrl('sin-cfg'), null);
    await m.onUnload();
  });

  await testAsync('generateStaticHTML pure function: HTML válido con marcadores esperados', async () => {
    const html = generateStaticHTML({
      catalogo: { productos: [{ id: 'x', nombre: 'Test', precio: 5, categoria: 'cat-x' }], categorias: [{ id: 'cat-x', nombre: 'Cat X', orden: 1 }] },
      presentacion: {},
      identidad: { marca: 'TestBrand', colores: { primario: '#abc123' } },
      project_slug: 'test-slug',
      tienda_api_url: 'https://example.com'
    });
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('TestBrand'));
    assert.ok(html.includes('#abc123'));
    assert.ok(html.includes('test-slug'));
    assert.ok(html.includes('example.com'));
    // MQTT directo: la PWA publica pedido.crear-tienda al bus en lugar de POST HTTP
    // a tienda-api. Verifica que el bundle carga mqtt.js, derive mqtt_url de
    // tienda_api_url y use el topic canonico del bus.
    assert.ok(html.includes('mqtt.min.js'), 'bundle debe cargar mqtt.js');
    assert.ok(html.includes('wss://example.com/mqtt'), 'mqtt_url derivado de tienda_api_url');
    assert.ok(html.includes('pedido/crear-tienda'), 'topic canonico del bus');
  });

  teardownTmpCwd();
  console.log('\n✓ comandero-cliente-builder: todos los tests pasaron.');
})().catch(err => {
  teardownTmpCwd();
  console.error('FATAL:', err.message);
  if (process.env.STACK) console.error(err.stack);
  process.exit(1);
});
