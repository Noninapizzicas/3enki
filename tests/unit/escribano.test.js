/**
 * Tests unitarios — escribano (puerta de escritura de la biblioteca).
 * Ejecutar: node tests/unit/escribano.test.js
 *
 * No toca red: la obra se prepara como un git init local con boveda/ ya presente,
 * así _ensureObra no clona. Prueba escribir (create-only, anti-wipe, sobrescribir,
 * guards) y pendientes (git status de la copia de trabajo).
 */

'use strict';

const assert = require('assert');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');
const { execFileSync } = require('child_process');

const EscribanoModule = require('../../modules/escribano/index.js');

function makeMocks() {
  const published = [];
  const noop = () => {};
  return {
    published,
    logger:  { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { increment: noop, gauge: noop, timing: noop },
    eventBus:{ publish: async (event, payload) => { published.push([event, payload]); } }
  };
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

async function instantiate(mocks) {
  const m = new EscribanoModule();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'escribano-test-'));
  const obra = path.join(tmp, 'obra');
  fs.mkdirSync(path.join(obra, 'boveda'), { recursive: true });
  // git init para que pendientes (status --porcelain) funcione, sin red
  execFileSync('git', ['init', '-q', obra]);
  execFileSync('git', ['-C', obra, 'config', 'user.email', 't@t.t']);
  execFileSync('git', ['-C', obra, 'config', 'user.name', 't']);

  await m.onLoad({
    logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus,
    moduleConfig: { biblioteca: {
      repo_url: 'file:///escribano-test-inexistente.git',
      ref: 'main', vault_subdir: 'boveda', obra_path: obra
    } }
  });
  return { module: m, obra };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('escribano — puerta de escritura de la biblioteca\n');

  await testAsync('escribe una nota nueva y emite escribano.nota.escrita', async () => {
    const mocks = makeMocks();
    const { module: m, obra } = await instantiate(mocks);
    const r = await m._escribir({ sector: 'trading', nombre: 'Las griegas', contenido: '# Las griegas\nDelta.\n' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.escrita, true);
    assert.strictEqual(r.data.sobrescrita, false);
    assert.strictEqual(r.data.ruta, path.join('boveda', 'trading', 'Las griegas.md'));
    assert.ok(fs.existsSync(path.join(obra, 'boveda', 'trading', 'Las griegas.md')));
    const evs = publishedOf(mocks, 'escribano.nota.escrita');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].ruta, path.join('boveda', 'trading', 'Las griegas.md'));
    await m.onUnload();
  });

  await testAsync('sub-sector crea subcarpetas (trading/opciones)', async () => {
    const mocks = makeMocks();
    const { module: m, obra } = await instantiate(mocks);
    const r = await m._escribir({ sector: 'trading/opciones', nombre: 'IV', contenido: '# IV\n' });
    assert.strictEqual(r.status, 200);
    assert.ok(fs.existsSync(path.join(obra, 'boveda', 'trading', 'opciones', 'IV.md')));
    await m.onUnload();
  });

  await testAsync('añade .md si falta; no lo duplica si viene', async () => {
    const mocks = makeMocks();
    const { module: m, obra } = await instantiate(mocks);
    await m._escribir({ sector: 'x', nombre: 'sin-ext', contenido: 'a' });
    await m._escribir({ sector: 'x', nombre: 'con-ext.md', contenido: 'b' });
    assert.ok(fs.existsSync(path.join(obra, 'boveda', 'x', 'sin-ext.md')));
    assert.ok(fs.existsSync(path.join(obra, 'boveda', 'x', 'con-ext.md')));
    assert.ok(!fs.existsSync(path.join(obra, 'boveda', 'x', 'con-ext.md.md')));
    await m.onUnload();
  });

  await testAsync('create-only: reescribir sin sobrescribir → 409 anti-wipe', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m._escribir({ sector: 'trading', nombre: 'nota', contenido: 'v1' });
    const r = await m._escribir({ sector: 'trading', nombre: 'nota', contenido: 'v2' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'ALREADY_EXISTS');
    await m.onUnload();
  });

  await testAsync('sobrescribir=true reemplaza el contenido', async () => {
    const mocks = makeMocks();
    const { module: m, obra } = await instantiate(mocks);
    await m._escribir({ sector: 'trading', nombre: 'nota', contenido: 'v1' });
    const r = await m._escribir({ sector: 'trading', nombre: 'nota', contenido: 'v2', sobrescribir: true });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.sobrescrita, true);
    assert.strictEqual(fs.readFileSync(path.join(obra, 'boveda', 'trading', 'nota.md'), 'utf-8'), 'v2');
    await m.onUnload();
  });

  await testAsync('validación: falta sector/nombre/contenido → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual((await m._escribir({ nombre: 'n', contenido: 'c' })).status, 400);
    assert.strictEqual((await m._escribir({ sector: 's', contenido: 'c' })).status, 400);
    assert.strictEqual((await m._escribir({ sector: 's', nombre: 'n', contenido: '  ' })).status, 400);
    await m.onUnload();
  });

  await testAsync("nombre con '/' → 400 (usa el sector para subcarpetas)", async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m._escribir({ sector: 'trading', nombre: 'a/b', contenido: 'c' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('guard traversal: sector con ../ → 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m._escribir({ sector: '../../etc', nombre: 'passwd', contenido: 'x' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('pendientes lista las notas escritas sin commitear', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m._escribir({ sector: 'trading', nombre: 'a', contenido: '1' });
    await m._escribir({ sector: 'comercio', nombre: 'b', contenido: '2' });
    const r = await m._pendientes();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 2);
    const rutas = r.data.pendientes.map(p => p.ruta).sort();
    assert.ok(rutas.some(x => x.includes('trading/a.md')));
    assert.ok(rutas.some(x => x.includes('comercio/b.md')));
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();
