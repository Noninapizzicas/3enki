'use strict';

/**
 * publicador__publicar — el reflejo que publica HTML en la web del proyecto (/<ns>/<slug>/<dir>/).
 * Alineado al modelo www (PR #600): asegura la feature www (RPC, stub aquí) + escribe en
 * storage/www/<dir>/. Verifica escritura + url_path + guards. NO crea symlinks (los hace
 * project-manager vía la feature www).
 *
 * Ejecutar: node tests/unit/publicador__publicar.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Publicador = require('../../modules/publicador/index.js');

function nuevo() {
  const m = new Publicador();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  m.eventBus = { publish() {}, subscribe() { return () => {}; } };
  m.freno = false;                          // sin verificador-visual en unit
  m._rpc = async () => ({ status: 200, data: {} });   // stub ensure-feature (no cuelga)
  return m;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('publica: escribe en storage/www/<dir>/ + url_path /<ns>/<slug>/<dir>/', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-base-'));
  const m = nuevo();
  m.activos.set('p1', { slug: 'regalos', base_path: base });
  m.ultimoActivo = 'p1';

  const html = '<!doctype html><title>Catálogo</title><h1>hola</h1>';
  const r = await m._publicar({ dir: 'catalogo', html });

  assert.strictEqual(r.status, 200, 'status 200');
  assert.strictEqual(r.data.url_path, '/a/regalos/catalogo/', 'url_path proyecto-primero');
  assert.strictEqual(r.data.archivo, 'index.html');

  const wwwFile = path.join(base, 'storage', 'www', 'catalogo', 'index.html');
  assert.ok(fs.existsSync(wwwFile), 'HTML escrito en storage/www/<dir>/');
  assert.strictEqual(fs.readFileSync(wwwFile, 'utf-8'), html);

  fs.rmSync(base, { recursive: true, force: true });
});

test('asegura la feature www (llama project.ensure-feature.request)', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-base-'));
  const m = nuevo();
  const llamadas = [];
  m._rpc = async (ev, payload) => { llamadas.push({ ev, payload }); return { status: 200, data: {} }; };
  m.activos.set('p1', { slug: 'regalos', base_path: base });
  m.ultimoActivo = 'p1';

  await m._publicar({ dir: 'x', html: '<h1>x</h1>' });
  const ef = llamadas.find(c => c.ev === 'project.ensure-feature.request');
  assert.ok(ef, 'llamó a ensure-feature');
  assert.deepStrictEqual(ef.payload.features, ['www']);
  assert.strictEqual(ef.payload.id, 'p1');

  fs.rmSync(base, { recursive: true, force: true });
});

test('nombre custom → <nombre>.html + url_path lo incluye', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-base-'));
  const m = nuevo();
  m.activos.set('p1', { slug: 'regalos', base_path: base });
  m.ultimoActivo = 'p1';

  const r = await m._publicar({ dir: 'informes', html: '<h1>x</h1>', nombre: 'q1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.archivo, 'q1.html');
  assert.strictEqual(r.data.url_path, '/a/regalos/informes/q1.html');
  assert.ok(fs.existsSync(path.join(base, 'storage', 'www', 'informes', 'q1.html')));

  fs.rmSync(base, { recursive: true, force: true });
});

test('re-publicar el mismo dir → reemplaza el contenido (idempotente)', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-base-'));
  const m = nuevo();
  m.activos.set('p1', { slug: 'regalos', base_path: base });
  m.ultimoActivo = 'p1';

  await m._publicar({ dir: 'landing', html: '<h1>v1</h1>' });
  const r2 = await m._publicar({ dir: 'landing', html: '<h1>v2</h1>' });
  assert.strictEqual(r2.status, 200);
  const file = path.join(base, 'storage', 'www', 'landing', 'index.html');
  assert.strictEqual(fs.readFileSync(file, 'utf-8'), '<h1>v2</h1>', 'contenido actualizado');

  fs.rmSync(base, { recursive: true, force: true });
});

test('guard: dir inválido → 400', async () => {
  const m = nuevo();
  m.activos.set('p1', { slug: 'r', base_path: '/tmp/x' });
  m.ultimoActivo = 'p1';
  assert.strictEqual((await m._publicar({ dir: 'con espacios', html: '<h1>x</h1>' })).status, 400);
  assert.strictEqual((await m._publicar({ dir: '../escape', html: '<h1>x</h1>' })).status, 400);
});

test('guard: html vacío → 400', async () => {
  const m = nuevo();
  m.activos.set('p1', { slug: 'r', base_path: '/tmp/x' });
  m.ultimoActivo = 'p1';
  assert.strictEqual((await m._publicar({ dir: 'ok', html: '' })).status, 400);
});

test('guard: sin proyecto activo → 409', async () => {
  const m = nuevo();
  m.ultimoActivo = null;
  assert.strictEqual((await m._publicar({ dir: 'ok', html: '<h1>x</h1>' })).status, 409);
});

test('guard: project_id != activo → 412', async () => {
  const m = nuevo();
  m.activos.set('p1', { slug: 'r', base_path: '/tmp/x' });
  m.ultimoActivo = 'p1';
  assert.strictEqual((await m._publicar({ project_id: 'otro', dir: 'ok', html: '<h1>x</h1>' })).status, 412);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[publicador__publicar] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[publicador__publicar] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();
