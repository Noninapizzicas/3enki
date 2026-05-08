/**
 * Tests unitarios — bot-manager (POC2).
 *
 * Mocks BotRegistry + DownloadManager + AutoResponder para evitar filesystem
 * y Telegram. Foco en orquestador + helpers POC2.
 *
 * Ejecutar: node tests/unit/bot-manager.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

const REGISTRY_PATH = path.resolve(__dirname, '../../modules/bot-manager/services/bot-registry.js');
const DOWNLOAD_PATH = path.resolve(__dirname, '../../modules/bot-manager/services/download-manager.js');
const AUTORESPONDER_PATH = path.resolve(__dirname, '../../modules/bot-manager/services/auto-responder.js');

class MockBotRegistry {
  constructor() {
    this.bots = new Map();
  }
  async initialize() {}
  has(botName) { return this.bots.has(botName); }
  isEnabled(botName) { return this.bots.get(botName)?.enabled !== false; }
  getStoragePath(botName) { return `/tmp/bots/${botName}`; }
  get(botName) { return this.bots.get(botName); }
  getAll() { return Array.from(this.bots.values()); }
  async register(botName, config = {}) {
    const cfg = { botName, enabled: true, ...config };
    this.bots.set(botName, cfg);
    return cfg;
  }
  async unregister(botName) {
    return this.bots.delete(botName);
  }
  async update(botName, patch) {
    const cur = this.bots.get(botName);
    if (!cur) return null;
    Object.assign(cur, patch);
    return cur;
  }
}

class MockDownloadManager {
  constructor() {
    this.downloads = [];
    this._defaultResult = {
      success: true,
      path: '/tmp/bots/test/file.dat',
      originalName: 'file.dat',
      mimeType: 'application/octet-stream',
      size: 100
    };
  }
  setNextResult(result) { this._nextResult = result; }
  async downloadAndStore(botName, fileId, fileName, mimeType, storagePath) {
    this.downloads.push({ botName, fileId, fileName, mimeType, storagePath });
    const result = this._nextResult || this._defaultResult;
    this._nextResult = null;
    return result;
  }
}

class MockAutoResponder {
  constructor() { this.calls = []; }
  async handleFileReceived(...args) { this.calls.push(['file', ...args]); }
  async handleCommand(botName, chatId, command, autoResponses) {
    this.calls.push(['command', botName, chatId, command, autoResponses]);
    return autoResponses?.[command] != null;
  }
}

require.cache[REGISTRY_PATH] = { exports: MockBotRegistry, filename: REGISTRY_PATH, loaded: true, children: [] };
require.cache[DOWNLOAD_PATH] = { exports: MockDownloadManager, filename: DOWNLOAD_PATH, loaded: true, children: [] };
require.cache[AUTORESPONDER_PATH] = { exports: MockAutoResponder, filename: AUTORESPONDER_PATH, loaded: true, children: [] };

const BotManagerModule = require('../../modules/bot-manager/index.js');

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
  const eventBus = { publish: async (e, p) => { published.push([e, p]); } };
  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks) {
  const m = new BotManagerModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: {}
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string'
    && typeof r.error.message === 'string'
    && !('data' in r);
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  console.log('bot-manager — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa registry + downloadManager + autoResponder', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'bot-manager');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(m.registry);
    assert.ok(m.downloadManager);
    assert.ok(m.autoResponder);
    await m.onUnload();
  });

  await testAsync('onUnload libera servicios', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onUnload();
    assert.strictEqual(m.registry, null);
    assert.strictEqual(m.downloadManager, null);
    assert.strictEqual(m.autoResponder, null);
  });

  // Group 2: onFileReceived
  await testAsync('onFileReceived auto-registra bot y descarga + publica bot.file.stored', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onFileReceived({
      data: {
        botName: 'cocinabot',
        chatId: 123,
        fileId: 'file-1',
        fileName: 'menu.pdf',
        mimeType: 'application/pdf',
        from: { id: 999, username: 'jose' },
        project_id: 'proj-1',
        correlation_id: 'cid-file'
      }
    });
    assert.ok(m.registry.has('cocinabot'));
    assert.strictEqual(m.downloadManager.downloads.length, 1);
    const evs = publishedOf(mocks, 'bot.file.stored');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-file');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.strictEqual(evs[0].userId, 999);
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  await testAsync('onFileReceived con bot disabled NO descarga ni publica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registry.register('disabled-bot');
    await m.registry.update('disabled-bot', { enabled: false });
    await m.onFileReceived({
      data: { botName: 'disabled-bot', chatId: 1, fileId: 'f', from: {} }
    });
    assert.strictEqual(m.downloadManager.downloads.length, 0);
    assert.strictEqual(publishedOf(mocks, 'bot.file.stored').length, 0);
    await m.onUnload();
  });

  await testAsync('onFileReceived con download fallido NO publica + log error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.downloadManager.setNextResult({ success: false, error: 'network timeout' });
    await m.onFileReceived({
      data: { botName: 'b1', chatId: 1, fileId: 'f', from: {} }
    });
    assert.strictEqual(publishedOf(mocks, 'bot.file.stored').length, 0);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'bot-manager.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  // Group 3: onTextReceived + onCommandReceived
  await testAsync('onTextReceived publica bot.message.received con project_id + correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onTextReceived({
      data: {
        botName: 'b1', chatId: 5, text: 'hola',
        from: { id: 7, username: 'ana' },
        project_id: 'proj-2', correlation_id: 'cid-text'
      }
    });
    const evs = publishedOf(mocks, 'bot.message.received');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].text, 'hola');
    assert.strictEqual(evs[0].correlation_id, 'cid-text');
    assert.strictEqual(evs[0].project_id, 'proj-2');
    await m.onUnload();
  });

  await testAsync('onCommandReceived auto-responde + publica con autoResponded=true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registry.register('b1', { autoResponses: { '/start': 'Hola!' } });
    await m.onCommandReceived({
      data: { botName: 'b1', chatId: 1, command: 'start', args: [], from: {} }
    });
    const evs = publishedOf(mocks, 'bot.command.received');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].autoResponded, true);
    assert.strictEqual(evs[0].command, 'start');
    await m.onUnload();
  });

  await testAsync('onCommandReceived sin auto-respuesta autoResponded=false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registry.register('b2', { autoResponses: {} });
    await m.onCommandReceived({
      data: { botName: 'b2', chatId: 1, command: 'unknown', args: [], from: {} }
    });
    const evs = publishedOf(mocks, 'bot.command.received');
    assert.strictEqual(evs[0].autoResponded, false);
    await m.onUnload();
  });

  // Group 4: onCredentialSaved
  await testAsync('onCredentialSaved con TELEGRAM_API_KEY_BOT_* auto-registra bot', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCredentialSaved({
      data: {
        key: 'TELEGRAM_API_KEY_BOT_papabot',
        provider: 'TELEGRAM',
        level: 'BOT',
        project_id: 'proj-cred'
      }
    });
    assert.ok(m.registry.has('papabot'));
    const evs = publishedOf(mocks, 'bot.registered');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].botName, 'papabot');
    assert.strictEqual(evs[0].project_id, 'proj-cred');
    await m.onUnload();
  });

  await testAsync('onCredentialSaved con provider != TELEGRAM se ignora', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onCredentialSaved({
      data: { key: 'OPENAI_API_KEY_USER_x', provider: 'OPENAI', level: 'USER' }
    });
    assert.strictEqual(m.registry.getAll().length, 0);
    await m.onUnload();
  });

  await testAsync('onCredentialSaved con bot ya registrado NO duplica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registry.register('existente');
    await m.onCredentialSaved({
      data: {
        key: 'TELEGRAM_API_KEY_BOT_existente',
        provider: 'TELEGRAM', level: 'BOT'
      }
    });
    assert.strictEqual(publishedOf(mocks, 'bot.registered').length, 0);
    await m.onUnload();
  });

  // Group 5: API methods + UI handlers
  await testAsync('registerBot publica bot.registered', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registerBot('b1', { project_id: 'proj-x' });
    const evs = publishedOf(mocks, 'bot.registered');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'proj-x');
    assert.strictEqual(evs[0].platform, 'telegram');
    await m.onUnload();
  });

  await testAsync('unregisterBot publica bot.unregistered si existia', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registerBot('b1');
    mocks.published.length = 0;
    await m.unregisterBot('b1', { project_id: 'p1' });
    const evs = publishedOf(mocks, 'bot.unregistered');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('setEnabled(true) publica bot.enabled', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registerBot('b1');
    mocks.published.length = 0;
    await m.setEnabled('b1', true);
    assert.strictEqual(publishedOf(mocks, 'bot.enabled').length, 1);
    await m.onUnload();
  });

  await testAsync('setEnabled(false) publica bot.disabled', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registerBot('b1');
    mocks.published.length = 0;
    await m.setEnabled('b1', false);
    assert.strictEqual(publishedOf(mocks, 'bot.disabled').length, 1);
    await m.onUnload();
  });

  await testAsync('handleListBots devuelve lista canonical', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registerBot('a');
    await m.registerBot('b');
    const r = await m.handleListBots();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.bots.length, 2);
    await m.onUnload();
  });

  await testAsync('handleGetBot sin botName devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetBot({});
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleGetBot inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleGetBot({ botName: 'no-existe' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleSetEnabled sin enabled boolean devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.registerBot('b1');
    const r = await m.handleSetEnabled({ botName: 'b1' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleSetEnabled bot inexistente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSetEnabled({ botName: 'fantasma', enabled: true });
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '2.0.0');
    await m.onUnload();
  });

  // Group 6: Helpers POC2
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout')), { status: 504, code: 'TIMEOUT' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, project_id: 'p-z' }, { correlation_id: 'cid-z' });
    const ev = mocks.published[0][1];
    assert.strictEqual(ev.correlation_id, 'cid-z');
    assert.strictEqual(ev.project_id, 'p-z');
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric bot-manager.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'bot-manager.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
