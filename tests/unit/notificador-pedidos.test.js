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

const NotificadorPedidos = require('../../modules/notificador-pedidos');

// ==========================================
// Test harness mínimo
// ==========================================

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function makeMock() {
  const published = [];
  return {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    metrics: {
      _calls: [],
      increment(name, labels) { this._calls.push({ name, labels }); }
    },
    eventBus: {
      published,
      publish(eventType, data) {
        published.push({ eventType, data });
        return Promise.resolve();
      }
    },
    published
  };
}

function makeContext(mock) {
  return {
    logger: mock.logger,
    metrics: mock.metrics,
    eventBus: mock.eventBus
  };
}

function makeInstance() {
  const mock = makeMock();
  const m = new NotificadorPedidos();
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

test('onLoad asigna logger/metrics/eventBus desde context', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  assert.strictEqual(m.logger, mock.logger);
  assert.strictEqual(m.metrics, mock.metrics);
  assert.strictEqual(m.eventBus, mock.eventBus);
});

test('onUnload limpia projectsConfig', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  m.projectsConfig.set('p1', { x: 1 });
  await m.onUnload();
  assert.strictEqual(m.projectsConfig.size, 0);
});

// ==========================================
// Tests: onProjectActivated
// ==========================================

test('onProjectActivated cachea config telegram del proyecto', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { chatId: 12345, botName: 'vapers_bot' });
  try {
    await m.onProjectActivated({
      data: { project_id: 'p-uuid', project_slug: 'vapers', base_path: fix.basePath }
    });
    const cached = m.projectsConfig.get('p-uuid');
    assert.ok(cached, 'config debe estar cacheada');
    assert.strictEqual(cached.telegram.chatId, 12345);
    assert.strictEqual(cached.telegram.botName, 'vapers_bot');
    assert.deepStrictEqual(cached.canales, ['telegram'], 'default canales = [telegram]');
  } finally { fix.cleanup(); }
});

test('onProjectActivated respeta notificaciones.canales custom', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { chatId: 12345 }, ['telegram', 'discord']);
  try {
    await m.onProjectActivated({ data: { project_id: 'p', project_slug: 'vapers', base_path: fix.basePath } });
    assert.deepStrictEqual(m.projectsConfig.get('p').canales, ['telegram', 'discord']);
  } finally { fix.cleanup(); }
});

test('onProjectActivated ignora payload sin project_id o base_path', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  await m.onProjectActivated({ data: { project_id: 'p' } });
  await m.onProjectActivated({ data: { base_path: '/tmp' } });
  assert.strictEqual(m.projectsConfig.size, 0);
});

test('onProjectActivated tolera config.json malformado sin throw', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-bad-'));
  fs.mkdirSync(path.join(tmpRoot, 'config'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'config', 'project.json'), 'NOT JSON {{{');
  try {
    await m.onProjectActivated({ data: { project_id: 'p', base_path: tmpRoot } });
    assert.strictEqual(m.projectsConfig.size, 0, 'no se cachea si lectura falla');
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
});

// ==========================================
// Tests: onPedidoCreado
// ==========================================

test('onPedidoCreado con canal_origen=web publica telegram.send_message.request', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { chatId: 555, botName: 'vapers_bot' });
  try {
    await m.onProjectActivated({ data: { project_id: 'p-1', project_slug: 'vapers', base_path: fix.basePath } });
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
    assert.strictEqual(mock.published.length, 1);
    const pub = mock.published[0];
    assert.strictEqual(pub.eventType, 'telegram.send_message.request');
    assert.strictEqual(pub.data.chatId, 555);
    assert.strictEqual(pub.data.botName, 'vapers_bot');
    assert.ok(pub.data.text.includes('VAPERS'));
    assert.ok(pub.data.text.includes('ABC123'));
    assert.ok(pub.data.text.includes('Mayor 18: confirmado en PWA'));
    assert.ok(pub.data.text.includes('2 x Vape Menta'));
    assert.ok(pub.data.text.includes('Total: 29.80'));
    assert.ok(pub.data.text.includes('2026-05-29'));
  } finally { fix.cleanup(); }
});

test('onPedidoCreado anti-fraude: NO incluye palabra_clave en el mensaje al staff', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p-1', project_slug: 'vapers', base_path: fix.basePath } });
    await m.onPedidoCreado({
      data: {
        pedido_id: 'ped-1', project_id: 'p-1', canal_origen: 'web',
        codigo_recogida: 'XYZ', items: [], total_centimos: 0,
        palabra_clave: 'sec'
      }
    });
    const pub = mock.published[0];
    assert.ok(!pub.data.text.includes('sec'), 'palabra_clave NO debe estar en el texto');
    assert.ok(!pub.data.text.toLowerCase().includes('palabra'), 'la palabra "palabra" no debe aparecer');
  } finally { fix.cleanup(); }
});

test('onPedidoCreado con canal_origen distinto a web descarta (no publica)', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p-1', project_slug: 'vapers', base_path: fix.basePath } });
    await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'mesa' } });
    assert.strictEqual(mock.published.length, 0);
    const desc = mock.metrics._calls.find(c => c.name === 'notificador.pedido.descartado.total');
    assert.ok(desc);
    assert.strictEqual(desc.labels.razon, 'canal_origen_no_web');
  } finally { fix.cleanup(); }
});

test('onPedidoCreado sin chatId persistido descarta + emite metric', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { chatId: '<PENDIENTE>' });
  try {
    await m.onProjectActivated({ data: { project_id: 'p-1', project_slug: 'vapers', base_path: fix.basePath } });
    await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'web', items: [], total_centimos: 0 } });
    assert.strictEqual(mock.published.length, 0);
    const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'proyecto_sin_chatid');
    assert.ok(desc, 'metric proyecto_sin_chatid emitida');
  } finally { fix.cleanup(); }
});

test('onPedidoCreado proyecto no cacheado descarta + warn', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  await m.onPedidoCreado({ data: { pedido_id: 'p', project_id: 'desconocido', canal_origen: 'web' } });
  assert.strictEqual(mock.published.length, 0);
  const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'proyecto_sin_config');
  assert.ok(desc);
});

test('onPedidoCreado propaga correlation_id del source event al telegram.send_message.request', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p-1', project_slug: 'vapers', base_path: fix.basePath } });
    await m.onPedidoCreado({
      data: { pedido_id: 'p', project_id: 'p-1', canal_origen: 'web', codigo_recogida: 'X', items: [], total_centimos: 0 },
      metadata: { correlation_id: 'corr-abc-123' }
    });
    assert.strictEqual(mock.published[0].data.correlation_id, 'corr-abc-123');
  } finally { fix.cleanup(); }
});

// ==========================================
// Tests: formateo
// ==========================================

test('_centimosToEur convierte enteros correctamente', () => {
  const { m } = makeInstance();
  assert.strictEqual(m._centimosToEur(1490), '14.90');
  assert.strictEqual(m._centimosToEur(0), '0.00');
  assert.strictEqual(m._centimosToEur(null), null);
});

test('_formatPedidoMessage con items vacios muestra "(pedido sin items)"', () => {
  const { m } = makeInstance();
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
