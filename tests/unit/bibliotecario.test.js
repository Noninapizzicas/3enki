/**
 * Tests unitarios — bibliotecario (puente a la biblioteca externa, repo Conocimiento).
 * Ejecutar: node tests/unit/bibliotecario.test.js
 *
 * No toca red: seedea una bóveda de prueba en un mirror temporal. Como el vault
 * existe, onLoad NO clona (el clone solo entra si falta el mirror). El caso de
 * degradación usa un repo_url file:// inexistente → git falla rápido y offline.
 */

'use strict';

const assert = require('assert');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

const BibliotecarioModule = require('../../modules/bibliotecario/index.js');

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

// Seedea una bóveda mínima que imita el formato del acumulador-sectorial.
function seedVault(root) {
  const boveda = path.join(root, 'boveda');
  fs.mkdirSync(path.join(boveda, 'trading', 'opciones'), { recursive: true });
  fs.mkdirSync(path.join(boveda, 'comercio'), { recursive: true });
  fs.writeFileSync(path.join(boveda, 'README.md'), '---\ntipo: vault-root\n---\n# Bóveda\n');
  fs.writeFileSync(path.join(boveda, 'trading', '00 - Trading (MOC).md'),
    '---\ntipo: moc\nsector: trading\ncosechado: 2026-07-14\n---\n# Trading\nMapa. [[Las griegas]]\n');
  fs.writeFileSync(path.join(boveda, 'trading', 'opciones', 'Las griegas.md'),
    '---\ntipo: nota\nsector: trading\ncosechado: 2026-07-14\n---\n# Las griegas\nDelta, gamma, theta, vega. Cobertura con iron condor.\n');
  fs.writeFileSync(path.join(boveda, 'comercio', 'Margenes.md'),
    '---\ntipo: nota\nsector: comercio\ncosechado: 2026-07-14\n---\n# Márgenes y rotación\n⚠️ Dato a verificar: margen medio 22%.\n');
  return boveda;
}

async function instantiate(mocks, opts = {}) {
  const m = new BibliotecarioModule();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibliotecario-test-'));
  const mirror = path.join(tmpDir, 'mirror');
  fs.mkdirSync(mirror, { recursive: true });
  if (opts.seed !== false) seedVault(mirror);

  await m.onLoad({
    logger:   mocks.logger,
    metrics:  mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: { biblioteca: {
      repo_url:     opts.repo_url || 'file:///bibliotecario-test-inexistente.git',
      ref:          'main',
      vault_subdir: 'boveda',
      mirror_path:  mirror
    } }
  });
  return { module: m, tmpDir, mirror };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('bibliotecario — puente a la biblioteca externa\n');

  // ---- Lifecycle + catálogo ----

  await testAsync('onLoad indexa el vault seedeado y no queda stale', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'bibliotecario');
    assert.strictEqual(m.version, '0.1.0');
    assert.strictEqual(m._stale, false);
    assert.strictEqual(m._catalogoCache.size, 2);   // trading + comercio (README.md no es sector)
    assert.strictEqual(m._libros, 3);
    await m.onUnload();
  });

  await testAsync('catálogo: título del MOC, recuento de notas y de dudosos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { data } = m._catalogo();
    assert.strictEqual(data.total, 2);
    assert.strictEqual(data.stale, false);
    const trading = data.sectores.find(s => s.sector === 'trading');
    const comercio = data.sectores.find(s => s.sector === 'comercio');
    assert.strictEqual(trading.titulo, 'Trading');   // del H1 del MOC
    assert.strictEqual(trading.notas, 2);
    assert.strictEqual(trading.dudosos, 0);
    assert.strictEqual(comercio.titulo, 'comercio'); // sin MOC → fallback al slug
    assert.strictEqual(comercio.dudosos, 1);         // la nota con ⚠️ a verificar
    await m.onUnload();
  });

  // ---- Préstamo por_referencia ----

  await testAsync('préstamo por_referencia: sector trae sus notas (recursivo)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { status, data } = m._prestar({ sector: 'trading' });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.por, 'referencia');
    assert.strictEqual(data.libros.length, 2);       // MOC + nota del sub-sector
    const griegas = data.libros.find(l => l.titulo === 'Las griegas');
    assert.strictEqual(griegas.cosechado, '2026-07-14');
    assert.strictEqual(griegas.sector, 'trading');
    await m.onUnload();
  });

  await testAsync('préstamo por_referencia: sub-sector acota', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { data } = m._prestar({ sector: 'trading/opciones' });
    assert.strictEqual(data.libros.length, 1);
    assert.strictEqual(data.libros[0].titulo, 'Las griegas');
    await m.onUnload();
  });

  await testAsync('préstamo: sector inexistente → 404 canónico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._prestar({ sector: 'no-existe' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.ok(!('data' in r));
    await m.onUnload();
  });

  await testAsync('guard path-traversal: sector con ../ no escapa del vault', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._prestar({ sector: '../../../etc' });
    assert.strictEqual(r.status, 404);   // _notasDeSector devuelve [] → sin libros
    await m.onUnload();
  });

  // ---- Préstamo por_significado (degrada a palabras) ----

  await testAsync('préstamo por_significado: rankea por palabras y lo declara honesto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { data } = m._prestar({ consulta: 'iron condor cobertura', topK: 3 });
    assert.strictEqual(data.por, 'palabras');        // honesto: no hay índice semántico aún
    assert.ok(data.libros.length >= 1);
    assert.strictEqual(data.libros[0].titulo, 'Las griegas');
    await m.onUnload();
  });

  await testAsync('dudoso: la nota con ⚠️ a verificar viaja dudoso:true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { data } = m._prestar({ sector: 'comercio' });
    assert.strictEqual(data.libros[0].dudoso, true);
    await m.onUnload();
  });

  // ---- Tools del LLM ----

  await testAsync('handleConsultarTool sin sector ni consulta → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleConsultarTool({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleCatalogoTool devuelve el catálogo', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleCatalogoTool();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 2);
    await m.onUnload();
  });

  // ---- Sincronizar + evento ----

  await testAsync('sincronizar sin mirror clonable degrada honesto (no cuelga, no miente)', async () => {
    const mocks = makeMocks();
    // sin seed + repo_url inexistente: _ensureMirror intentará clonar y fallará
    const { module: m } = await instantiate(mocks, { seed: false });
    const r = await m._sincronizar();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.sincronizado, false);
    assert.strictEqual(r.data.stale, true);
    assert.ok(typeof r.data.motivo === 'string' && r.data.motivo.length > 0);
    await m.onUnload();
  });

  await testAsync('degradación en arranque: sin vault y sin repo → stale, catálogo vacío', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { seed: false });
    assert.strictEqual(m._stale, true);
    assert.strictEqual(m._catalogoCache.size, 0);
    const { data } = m._catalogo();
    assert.strictEqual(data.total, 0);
    assert.strictEqual(data.stale, true);
    assert.ok(data.motivo);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();
