/**
 * Tests unitarios — bienvenida-tienda.
 *
 * Ejecutar: node tests/unit/bienvenida-tienda.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BienvenidaTienda = require('../../modules/pizzepos/bienvenida-tienda');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function makeMock() {
  const published = [];
  return {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    metrics: { _calls: [], increment(name, labels) { this._calls.push({ name, labels }); } },
    eventBus: {
      published,
      publish(eventType, data) { published.push({ eventType, data }); return Promise.resolve(); }
    },
    published
  };
}

function makeContext(mock) {
  return { logger: mock.logger, metrics: mock.metrics, eventBus: mock.eventBus };
}

function makeInstance() {
  const mock = makeMock();
  const m = new BienvenidaTienda();
  return { m, mock };
}

function setupProjectFs(slug, telegramCfg, extras) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bienv-test-'));
  const basePath = path.join(tmpRoot, slug);
  fs.mkdirSync(path.join(basePath, 'config'), { recursive: true });
  const projectConfig = Object.assign({
    name: slug,
    telegram: telegramCfg
  }, extras || {});
  fs.writeFileSync(path.join(basePath, 'config', 'project.json'), JSON.stringify(projectConfig, null, 2));
  return { basePath, cleanup() { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {} } };
}

// ==========================================
// Lifecycle
// ==========================================

test('onLoad asigna context', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  assert.strictEqual(m.logger, mock.logger);
  assert.strictEqual(m.eventBus, mock.eventBus);
});

test('onUnload limpia mapas internos', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  m.botsConfig.set('b', { x: 1 });
  m.projectToBotName.set('p', 'b');
  await m.onUnload();
  assert.strictEqual(m.botsConfig.size, 0);
  assert.strictEqual(m.projectToBotName.size, 0);
});

// ==========================================
// onProjectActivated
// ==========================================

test('onProjectActivated registra bot con botName y staff_chat_id', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { botName: 'vapers_local_bot', chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p-1', project_slug: 'vapers', base_path: fix.basePath } });
    const cfg = m.botsConfig.get('vapers_local_bot');
    assert.ok(cfg);
    assert.strictEqual(cfg.staff_chat_id, 555);
    assert.strictEqual(cfg.pwa_url, 'https://enki-ai.online/a/vapers/');
    assert.ok(cfg.mensaje_bienvenida.includes('https://enki-ai.online/a/vapers/'));
    assert.strictEqual(m.projectToBotName.get('p-1'), 'vapers_local_bot');
  } finally { fix.cleanup(); }
});

test('onProjectActivated con botName=<PENDIENTE> NO registra', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { botName: '<PENDIENTE>', chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p-1', project_slug: 'vapers', base_path: fix.basePath } });
    assert.strictEqual(m.botsConfig.size, 0);
  } finally { fix.cleanup(); }
});

test('onProjectActivated respeta override mensaje_bienvenida del project.json', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { botName: 'bot1', chatId: 99 }, {
    tienda: { mensaje_bienvenida: 'Mensaje custom!', pwa_url: 'https://custom.example.com/x/' }
  });
  try {
    await m.onProjectActivated({ data: { project_id: 'p', project_slug: 'vapers', base_path: fix.basePath } });
    const cfg = m.botsConfig.get('bot1');
    assert.strictEqual(cfg.mensaje_bienvenida, 'Mensaje custom!');
    assert.strictEqual(cfg.pwa_url, 'https://custom.example.com/x/');
  } finally { fix.cleanup(); }
});

test('onProjectActivated tolera chatId=<PENDIENTE> (staff_chat_id queda null)', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { botName: 'bot1', chatId: '<PENDIENTE>' });
  try {
    await m.onProjectActivated({ data: { project_id: 'p', project_slug: 'vapers', base_path: fix.basePath } });
    assert.strictEqual(m.botsConfig.get('bot1').staff_chat_id, null);
  } finally { fix.cleanup(); }
});

// ==========================================
// onTelegramTextReceived
// ==========================================

test('text.received de cliente desconocido → publica bienvenida con link PWA', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { botName: 'bot1', chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p', project_slug: 'vapers', base_path: fix.basePath } });
    await m.onTelegramTextReceived({ data: { botName: 'bot1', chatId: 999, text: 'hola' } });
    assert.strictEqual(mock.published.length, 1);
    const pub = mock.published[0];
    assert.strictEqual(pub.eventType, 'telegram.send_message.request');
    assert.strictEqual(pub.data.botName, 'bot1');
    assert.strictEqual(pub.data.chatId, 999);
    assert.ok(pub.data.text.includes('https://enki-ai.online/a/vapers/'));
    assert.ok(pub.data.text.toLowerCase().includes('bienvenido'));
  } finally { fix.cleanup(); }
});

test('text.received del chat del STAFF NO responde (filtra)', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { botName: 'bot1', chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p', project_slug: 'vapers', base_path: fix.basePath } });
    await m.onTelegramTextReceived({ data: { botName: 'bot1', chatId: 555, text: 'hola desde el staff' } });
    assert.strictEqual(mock.published.length, 0, 'no debe responder al staff');
    const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'chat_es_staff');
    assert.ok(desc, 'metric chat_es_staff emitida');
  } finally { fix.cleanup(); }
});

test('text.received de bot no registrado → descarta + metric', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  await m.onTelegramTextReceived({ data: { botName: 'bot_desconocido', chatId: 1, text: 'x' } });
  assert.strictEqual(mock.published.length, 0);
  const desc = mock.metrics._calls.find(c => c.labels && c.labels.razon === 'bot_no_registrado');
  assert.ok(desc);
});

test('command.received /start → publica bienvenida con trigger=command_start', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  const fix = setupProjectFs('vapers', { botName: 'bot1', chatId: 555 });
  try {
    await m.onProjectActivated({ data: { project_id: 'p', project_slug: 'vapers', base_path: fix.basePath } });
    await m.onTelegramCommandReceived({ data: { botName: 'bot1', chatId: 200, command: '/start', text: '/start' } });
    assert.strictEqual(mock.published.length, 1);
    const trigger = mock.metrics._calls.find(c => c.name === 'bienvenida.respondido.total');
    assert.strictEqual(trigger.labels.trigger, 'command_start');
  } finally { fix.cleanup(); }
});

test('payload sin botName o sin chatId NO publica', async () => {
  const { m, mock } = makeInstance();
  await m.onLoad(makeContext(mock));
  await m.onTelegramTextReceived({ data: { chatId: 1 } });
  await m.onTelegramTextReceived({ data: { botName: 'b' } });
  assert.strictEqual(mock.published.length, 0);
});

// ==========================================
// Helpers
// ==========================================

test('_resolvePwaUrl: tienda.pwa_url > pwa_url > default', () => {
  const { m } = makeInstance();
  assert.strictEqual(m._resolvePwaUrl({ tienda: { pwa_url: 'x' } }, 'vapers'), 'x');
  assert.strictEqual(m._resolvePwaUrl({ pwa_url: 'y' }, 'vapers'), 'y');
  assert.strictEqual(m._resolvePwaUrl({}, 'vapers'), 'https://enki-ai.online/a/vapers/');
});

test('_numericOrNull: maneja PENDIENTE y strings numericos', () => {
  const { m } = makeInstance();
  assert.strictEqual(m._numericOrNull('123'), 123);
  assert.strictEqual(m._numericOrNull(-100), -100);
  assert.strictEqual(m._numericOrNull(null), null);
  assert.strictEqual(m._numericOrNull('<PENDIENTE>'), null);
  assert.strictEqual(m._numericOrNull('abc'), null);
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
  if (failed > 0) process.exit(1);
})();
