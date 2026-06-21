/**
 * Tests unitarios — notificador-pedidos.
 *
 * Ejecutar: node tests/unit/notificador-pedidos.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const NotificadorPedidos = require('../../modules/pizzepos/notificador-pedidos');

// ==========================================
// Test harness mínimo
// ==========================================

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

/**
 * Mock del eventBus con soporte para request/response correlacionado.
 *
 *   - publish(eventType, data) guarda en `published`.
 *   - subscribe(eventType, handler) registra handler y devuelve unsubscribe.
 *   - Si projectAutoResponse esta configurado y se publica project.get.request,
 *     auto-dispara los handlers de project.get.response con el request_id del
 *     request — simula la respuesta del project-manager.
 *   - Si projectAutoResponse es null, NO se dispara (simula proyecto no
 *     respondido / timeout).
 */
function makeMock(opts) {
  const options = opts || {};
  const published = [];
  const subscribers = new Map();
  const bus = {
    published,
    projectAutoResponse: options.projectAutoResponse !== undefined ? options.projectAutoResponse : { success: false, project: null },
    publish(eventType, data) {
      published.push({ eventType, data });
      if (eventType === 'project.get.request' && bus.projectAutoResponse !== null) {
        const responseData = { ...bus.projectAutoResponse, request_id: data.request_id };
        const handlers = subscribers.get('project.get.response') || [];
        // Microtask para emular bus async.
        setImmediate(() => {
          for (const h of handlers) { try { h({ data: responseData }); } catch (_) {} }
        });
      }
      return Promise.resolve();
    },
    subscribe(eventType, handler) {
      if (!subscribers.has(eventType)) subscribers.set(eventType, []);
      subscribers.get(eventType).push(handler);
      return Promise.resolve(() => {
        const arr = subscribers.get(eventType) || [];
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      });
    }
  };
  return {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    metrics: {
      _calls: [],
      increment(name, labels) { this._calls.push({ name, labels }); }
    },
    eventBus: bus,
    published,
    subscribers
  };
}

function makeContext(mock) {
  return {
    logger: mock.logger,
    metrics: mock.metrics,
    eventBus: mock.eventBus
  };
}

async function makeInstance(opts) {
  const mock = makeMock(opts);
  const m = new NotificadorPedidos();
  await m.onLoad(makeContext(mock));
  return { m, mock };
}

function setupProjectFs(slug, telegramCfg, canales) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-test-'));
  const basePath = path.join(tmpRoot, slug);
  fs.mkdirSync(path.join(basePath, 'config'), { recursive: true });
  const projectConfig = {
    name: 'Test Project',
    whatsapp: {},
    telegram: telegramCfg
  };
  if (canales) {
    projectConfig.notificaciones = { canales };
  }
  fs.writeFileSync(path.join(basePath, 'config', 'project.json'), JSON.stringify(projectConfig, null, 2));
  return { basePath, cleanup() { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {} } };
}

// ==========================================
// Tests: lifecycle
// ==========================================

test('onLoad asigna logger/metrics/eventBus desde context y se suscribe a project.get.response', async () => {
  const { m, mock } = await makeInstance();
  assert.strictEqual(m.logger, mock.logger);
  assert.strictEqual(m.metrics, mock.metrics);
  assert.strictEqual(m.eventBus, mock.eventBus);
  assert.ok((mock.subscribers.get('project.get.response') || []).length === 1, 'debe haber 1 suscriptor a project.get.response');
});

test('onUnload desuscribe project.get.response y limpia pendings', async () => {
  const { m, mock } = await makeInstance();
  // Inyectamos un pending sintetico para verificar que se limpia.
  m._pendingProjectResolves.set('fake', {
    resolve: () => {},
    reject: () => {},
    timeoutHandle: setTimeout(() => {}, 100000)
  });
  await m.onUnload();
  assert.strictEqual(m._pendingProjectResolves.size, 0);
  assert.strictEqual(m._unsubscribeProjectGetResponse, null);
  assert.strictEqual((mock.subscribers.get('project.get.response') || []).length, 0, 'el handler debe haberse desuscrito');
});

// ==========================================
// Tests: onPedidoCreado — flujo completo (con auto-response del bus)
// ==========================================

test('onPedidoCreado con canal_origen=web resuelve proyecto via bus y publica telegram.send_message.request', async () => {
  const fix = setupProjectFs('vapers', { chatId: 555, botName: 'vapers_bot' });
  try {
    const { m, mock } = await makeInstance({
      projectAutoResponse: { success: true, project: { id: 'p-1', slug: 'vapers', name: 'vapers', base_path: fix.basePath } }
    });
    await m.onPedidoCreado({
      data: {
        pedido_id: 'ped-1',
        project_id: 'p-1',
        project_slug: 'vapers',
        canal_origen: 'web',
        codigo_recogida: 'ABC123',
        items: [{ cantidad: 2, descripcion: 'Vape Menta', precio_total_centimos: 2980 }],
        total_centimos: 2980,
        mayor_edad_confirmado: true,
        expira_at: '2026-05-29T20:00:00Z'
      }
    });
    // Debe haber publicado 2 eventos: project.get.request + telegram.send_message.request.
    const sendMsg = mock.published.find(p => p.eventType === 'telegram.send_message.request');
    assert.ok(sendMsg, 'debe publicar telegram.send_message.request');
    assert.strictEqual(sendMsg.data.chatId, 555);
    assert.strictEqual(sendMsg.data.botName, 'vapers_bot');
    assert.ok(sendMsg.data.text.includes('VAPERS'));
    assert.ok(sendMsg.data.text.includes('ABC123'));
    assert.ok(sendMsg.data.text.includes('Mayor 18: confirmado en PWA'));
    assert.ok(sendMsg.data.text.includes('2 x Vape Menta'));
    assert.ok(sendMsg.data.text.includes('Total: 29.80'));
    assert.ok(sendMsg.data.text.includes('2026-05-29'));
  } finally { fix.cleanup(); }
});

test('onPedidoCreado con canal_origen distinto a web descarta sin tocar el bus', async () => {
  const { m, mock } = await makeInstance();
  await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'mesa' } });
  assert.strictEqual(mock.published.length, 0, 'no publica nada (ni siquiera project.get.request)');
  const desc = mock.metrics._calls.find(c => c.name === 'notificador.pedido.descartado.total');
  assert.ok(desc);
  assert.strictEqual(desc.labels.razon, 'canal_origen_no_web');
});

test('onPedidoCreado sin project_id descarta + emite metric', async () => {
  const { m, mock } = await makeInstance();
  await m.onPedidoCreado({ data: { pedido_id: 'p', canal_origen: 'web' } });
  assert.strictEqual(mock.published.length, 0);
  const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'sin_project_id');
  assert.ok(desc);
});

test('onPedidoCreado con proyecto no encontrado en project-manager descarta', async () => {
  const { m, mock } = await makeInstance({
    projectAutoResponse: { success: false, project: null }
  });
  await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'desconocido', canal_origen: 'web' } });
  const sendMsg = mock.published.find(p => p.eventType === 'telegram.send_message.request');
  assert.ok(!sendMsg, 'no debe publicar telegram.send_message.request');
  const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'project_no_encontrado');
  assert.ok(desc, 'metric project_no_encontrado emitida');
});

test('onPedidoCreado con timeout del project.get.request descarta', async () => {
  const { m, mock } = await makeInstance({ projectAutoResponse: null });
  m._projectResolveTimeoutMs = 50; // acortado para test rapido
  await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'web' } });
  const sendMsg = mock.published.find(p => p.eventType === 'telegram.send_message.request');
  assert.ok(!sendMsg, 'no debe publicar telegram.send_message.request');
  const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'project_resolve_failed');
  assert.ok(desc, 'metric project_resolve_failed emitida');
});

test('onPedidoCreado con chatId pendiente descarta + emite metric', async () => {
  const fix = setupProjectFs('vapers', { chatId: '<PENDIENTE>' });
  try {
    const { m, mock } = await makeInstance({
      projectAutoResponse: { success: true, project: { id: 'p-1', slug: 'vapers', base_path: fix.basePath } }
    });
    await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'web', items: [], total_centimos: 0 } });
    const sendMsg = mock.published.find(p => p.eventType === 'telegram.send_message.request');
    assert.ok(!sendMsg);
    const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'proyecto_sin_chatid');
    assert.ok(desc, 'metric proyecto_sin_chatid emitida');
  } finally { fix.cleanup(); }
});

test('onPedidoCreado con config.json malformado descarta + metric config_read_failed', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-bad-'));
  fs.mkdirSync(path.join(tmpRoot, 'config'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'config', 'project.json'), 'NOT JSON {{{');
  try {
    const { m, mock } = await makeInstance({
      projectAutoResponse: { success: true, project: { id: 'p-1', base_path: tmpRoot } }
    });
    await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'web' } });
    const sendMsg = mock.published.find(p => p.eventType === 'telegram.send_message.request');
    assert.ok(!sendMsg);
    const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'config_read_failed');
    assert.ok(desc, 'metric config_read_failed emitida');
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
});

test('onPedidoCreado propaga correlation_id del source event al telegram.send_message.request', async () => {
  const fix = setupProjectFs('vapers', { chatId: 555 });
  try {
    const { m, mock } = await makeInstance({
      projectAutoResponse: { success: true, project: { id: 'p-1', slug: 'vapers', base_path: fix.basePath } }
    });
    await m.onPedidoCreado({
      data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'web', codigo_recogida: 'X', items: [], total_centimos: 0 },
      metadata: { correlation_id: 'corr-abc-123' }
    });
    const sendMsg = mock.published.find(p => p.eventType === 'telegram.send_message.request');
    assert.ok(sendMsg);
    assert.strictEqual(sendMsg.data.correlation_id, 'corr-abc-123');
  } finally { fix.cleanup(); }
});

test('onPedidoCreado respeta notificaciones.canales custom del project.json', async () => {
  const fix = setupProjectFs('vapers', { chatId: 555 }, ['telegram', 'discord']);
  try {
    const { m, mock } = await makeInstance({
      projectAutoResponse: { success: true, project: { id: 'p-1', slug: 'vapers', base_path: fix.basePath } }
    });
    await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'web', codigo_recogida: 'X', items: [], total_centimos: 0 } });
    // En v1 solo se publica telegram (discord queda para v2).
    const sendMsgs = mock.published.filter(p => p.eventType === 'telegram.send_message.request');
    assert.strictEqual(sendMsgs.length, 1, 'solo telegram en v1');
  } finally { fix.cleanup(); }
});

// ==========================================
// Tests: formateo
// ==========================================

test('_centimosToEur convierte enteros correctamente', () => {
  const m = new NotificadorPedidos();
  assert.strictEqual(m._centimosToEur(1490), '14.90');
  assert.strictEqual(m._centimosToEur(0), '0.00');
  assert.strictEqual(m._centimosToEur(null), null);
});

test('_formatPedidoMessage con items vacios muestra "(pedido sin items)"', () => {
  const m = new NotificadorPedidos();
  const text = m._formatPedidoMessage(
    { project_slug: 'vapers' },
    { codigo_recogida: 'X', items: [], total_centimos: 0 }
  );
  assert.ok(text.includes('(pedido sin items)'));
});

// ==========================================
// Runner
// ==========================================

(async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log('✓', name);
      passed++;
    } catch (err) {
      console.error('✗', name);
      console.error(' ', err.message);
      if (process.env.STACK) console.error(err.stack);
      failures.push({ name, err });
      failed++;
    }
  }
  console.log(`\n${passed}/${tests.length} passed`);
  if (failed > 0) {
    console.error(`${failed} test(s) failed`);
    process.exit(1);
  }
})();
