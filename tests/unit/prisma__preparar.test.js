/**
 * Tests unitarios — prisma/preparar v0.2.0 (órgano PREPARAR+ENTREGAR universal).
 *
 * Foco:
 *  - Estados BASE desnombrados: pendiente → preparando → listo → entregado/recogido/enviado.
 *  - Freno: transiciones inválidas → CONFLICT_STATE; cancelado transversal; terminal inmutable.
 *  - Estado agregado: pedido listo ⟺ TODOS los ítems listo.
 *  - PUERTA ABIERTA: estados custom declarados en config.json (BASE ∪ CUSTOM).
 *  - Persistencia por proyecto (fs real en tmpdir).
 *
 * Ejecutar: node tests/unit/prisma__preparar.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PrepararModule = require('../../modules/prisma/preparar/index.js');

function makeMocks() {
  const logs = [];
  const published = [];
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info: (e, p) => logs.push(['info', e, p]),
    warn: (e, p) => logs.push(['warn', e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = { increment: (n, l) => {}, gauge: () => {}, timing: () => {} };
  const eventBus = { publish: async (event, payload) => { published.push([event, payload]); } };
  return { logs, published, logger, metrics, eventBus };
}

function makeTmpDir() {
  const tmpDir = path.join(os.tmpdir(), `preparar-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fsSync.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

async function instantiate(mocks) {
  const tmpDir = makeTmpDir();
  const m = new PrepararModule();
  m.basePath = tmpDir;
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { module: m, tmpDir };
}

async function cleanup(p) {
  try { await fs.rm(p, { recursive: true, force: true }); } catch {}
}

// Mini runner
const tests = [];
function testAsync(name, fn) { tests.push({ name, fn }); }

let passed = 0, failed = 0;
async function run() {
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`✓ ${t.name}`); }
    catch (e) { failed++; console.log(`✗ ${t.name}\n    ${e.message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

// ── TESTS ───────────────────────────────────────────────────────────────────

testAsync('crear pedido → estado inicial pendiente, ítems pendiente', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  m.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });

  const r = await m.handleCrear({
    project_id: pid,
    items: [{ nombre: 'Tarta', cantidad: 1 }, { nombre: 'Pan', cantidad: 3 }],
    entrega_at: '2026-08-01T10:00:00Z',
    forma_entrega: 'recogida'
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.data.pedido.estado, 'pendiente');
  assert.strictEqual(r.data.pedido.estado_agregado, 'pendiente');
  assert.strictEqual(r.data.pedido.items.length, 2);
  assert.ok(r.data.pedido.items.every((i) => i.estado === 'pendiente'));
  assert.strictEqual(r.data.pedido.forma_entrega, 'recogida');
  await cleanup(tmpDir);
});

testAsync('transición pendiente → preparando → listo → entregado (agregada)', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  m.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });
  const created = await m.handleCrear({ project_id: pid, items: [{ nombre: 'X' }] });
  const pedido_id = created.data.pedido_id;

  const p1 = await m.handleEstado({ project_id: pid, pedido_id, estado: 'preparando' });
  assert.strictEqual(p1.status, 200);
  assert.strictEqual(p1.data.pedido.estado_agregado, 'preparando');

  const p2 = await m.handleEstado({ project_id: pid, pedido_id, estado: 'listo' });
  assert.strictEqual(p2.status, 200);
  assert.strictEqual(p2.data.pedido.estado_agregado, 'listo');

  const p3 = await m.handleEstado({ project_id: pid, pedido_id, estado: 'entregado' });
  assert.strictEqual(p3.status, 200);
  assert.strictEqual(p3.data.pedido.estado_agregado, 'entregado');
  await cleanup(tmpDir);
});

testAsync('freno: transición inválida listo → preparando → CONFLICT_STATE', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  m.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });
  const created = await m.handleCrear({ project_id: pid, items: [{ nombre: 'X' }] });
  const pedido_id = created.data.pedido_id;
  await m.handleEstado({ project_id: pid, pedido_id, estado: 'listo' });
  const r = await m.handleEstado({ project_id: pid, pedido_id, estado: 'preparando' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CONFLICT_STATE');
  await cleanup(tmpDir);
});

testAsync('estado agregado: pedido listo solo cuando TODOS los ítems listo', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  m.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });
  const created = await m.handleCrear({ project_id: pid, items: [{ nombre: 'A' }, { nombre: 'B' }] });
  const pedido_id = created.data.pedido_id;
  const itemA = created.data.pedido.items[0].id;
  const itemB = created.data.pedido.items[1].id;

  // Solo A listo → el pedido NO está listo
  const r1 = await m.handleEstado({ project_id: pid, pedido_id, item_id: itemA, estado: 'listo' });
  assert.notStrictEqual(r1.data.pedido.estado_agregado, 'listo');

  // B listo → pedido listo
  const r2 = await m.handleEstado({ project_id: pid, pedido_id, item_id: itemB, estado: 'listo' });
  assert.strictEqual(r2.data.pedido.estado_agregado, 'listo');
  await cleanup(tmpDir);
});

testAsync('cancelar: transversal desde pendiente, terminal después', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  m.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });
  const created = await m.handleCrear({ project_id: pid, items: [{ nombre: 'X' }] });
  const pedido_id = created.data.pedido_id;

  const r = await m.handleCancelar({ project_id: pid, pedido_id, motivo: 'cliente no vino' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.pedido.estado, 'cancelado');

  // Cancelado es terminal: no admite más transiciones
  const r2 = await m.handleEstado({ project_id: pid, pedido_id, estado: 'preparando' });
  assert.strictEqual(r2.status, 409);
  await cleanup(tmpDir);
});

testAsync('PUERTA ABIERTA: estado custom declarado en config.json se valida', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  const projDir = path.join(tmpDir, 'proj');
  m.onProjectActivated({ data: { project_id: pid, base_path: projDir } });

  // Declarar estado custom 'enfriando' desde 'listo'
  const dir = path.join(projDir, 'storage', 'prisma', 'preparar');
  fsSync.mkdirSync(dir, { recursive: true });
  fsSync.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    estados: [{ id: 'enfriando', desde: ['listo'] }]
  }));
  await m._cargarEstadosCustom(pid);

  const created = await m.handleCrear({ project_id: pid, items: [{ nombre: 'Tarta' }] });
  const pedido_id = created.data.pedido_id;
  await m.handleEstado({ project_id: pid, pedido_id, estado: 'listo' });

  // 'enfriando' es válido (custom declarado)
  const r = await m.handleEstado({ project_id: pid, pedido_id, estado: 'enfriando' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.pedido.estado_agregado, 'enfriando');
  await cleanup(tmpDir);
});

testAsync('estado NO declarado → CONFLICT_STATE con lista de válidos', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  m.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });
  const created = await m.handleCrear({ project_id: pid, items: [{ nombre: 'X' }] });
  const pedido_id = created.data.pedido_id;
  const r = await m.handleEstado({ project_id: pid, pedido_id, estado: 'vaporizando' });
  assert.strictEqual(r.status, 409);
  assert.ok(r.error.message.includes('estado desconocido'));
  await cleanup(tmpDir);
});

testAsync('persistencia: el pedido sobrevive a releer del disco', async () => {
  const mocks = makeMocks();
  const { module: m, tmpDir } = await instantiate(mocks);
  const pid = '11111111-1111-4111-8111-111111111111';
  m.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });
  const created = await m.handleCrear({ project_id: pid, items: [{ nombre: 'Pan' }] });
  const pedido_id = created.data.pedido_id;
  await m.handleEstado({ project_id: pid, pedido_id, estado: 'listo' });

  // Nueva instancia (simula reinicio) → lee del disco
  const m2 = new PrepararModule();
  m2.basePath = tmpDir;
  await m2.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  m2.onProjectActivated({ data: { project_id: pid, base_path: path.join(tmpDir, 'proj') } });
  const r = await m2.handleGet({ project_id: pid, pedido_id });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.pedido.estado_agregado, 'listo');
  await cleanup(tmpDir);
});

run();
