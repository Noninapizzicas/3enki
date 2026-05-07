/**
 * Tests unitarios — telegram-service (POC2 reescritura).
 * Ejecutar: node tests/unit/telegram-service.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const TelegramServiceModule = require('../../modules/telegram-service/index.js');

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

async function instantiate(mocks, opts = {}) {
  const m = new TelegramServiceModule();
  // Temporarily override process.env scan to avoid real bot startup
  const origEnv = process.env;
  process.env = {};
  try {
    await m.onLoad({
      logger: mocks.logger,
      metrics: mocks.metrics,
      eventBus: mocks.eventBus
    });
  } finally {
    process.env = origEnv;
  }
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
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

// Make a fake bot client
function makeClient(overrides = {}) {
  return Object.assign({
    stopPolling:         () => {},
    sendMessage:         async (chatId, text, opts) => ({ message_id: 42 }),
    sendPhoto:           async (chatId, photo, opts) => ({ message_id: 43 }),
    sendDocument:        async (chatId, doc, opts) => ({ message_id: 44 }),
    sendVideo:           async (chatId, vid, opts) => ({ message_id: 45 }),
    sendLocation:        async (chatId, lat, lon) => ({ message_id: 46 }),
    editMessageText:     async (chatId, msgId, text) => ({}),
    deleteMessage:       async (chatId, msgId) => ({}),
    answerCallbackQuery: async (callbackId, opts) => ({}),
    getFile:             async (fileId) => ({ file_id: fileId, file_path: 'path/f.jpg', file_size: 100 }),
    getFileUrl:          (fp) => `https://api.telegram.org/file/bot123/${fp}`,
    downloadFile:        async (fileId, dest) => {},
    getChat:             async (chatId) => ({ id: chatId, type: 'private', title: null, username: 'user', first_name: 'Test', last_name: 'User' }),
    setMyCommands:       async (cmds) => ({}),
    isPolling:           () => true,
    getQueueSize:        () => 0
  }, overrides);
}

// ==================================================
// Tests
// ==================================================

(async () => {
  console.log('telegram-service — reescritura canonica (POC2)\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio sin bots', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.bots.size, 0);
    assert.strictEqual(m.name, 'telegram-service');
    assert.ok(m.version.startsWith('3.'));
    await m.onUnload();
  });

  await testAsync('onUnload para bots activos y limpia el Map', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let stopped = false;
    m.bots.set('test-bot', { stopPolling: () => { stopped = true; } });
    await m.onUnload();
    assert.strictEqual(m.bots.size, 0);
    assert.ok(stopped);
  });

  // ==========================================
  // Group 2: Tool handlers — shape canonico
  // ==========================================

  await testAsync('handleToolSendMessage — success devuelve { status:200, data: { messageId } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot1', makeClient());
    mocks.published.length = 0;
    const r = await m.handleToolSendMessage({ botName: 'bot1', chatId: 100, text: 'hola' });
    assert.ok(isCanonicalSuccess(r), `shape: ${JSON.stringify(r)}`);
    assert.strictEqual(r.data.messageId, 42);
    assert.ok(publishedOf(mocks, 'telegram.message.sent').length === 1);
    await m.onUnload();
  });

  await testAsync('handleToolSendMessage — bot no encontrado devuelve { status:404, error: { code: RESOURCE_NOT_FOUND } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m.handleToolSendMessage({ botName: 'noexiste', chatId: 1, text: 'x' });
    assert.ok(isCanonicalError(r), `shape: ${JSON.stringify(r)}`);
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleToolSendPhoto — success devuelve { status:200, data: { messageId } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot1', makeClient());
    const r = await m.handleToolSendPhoto({ botName: 'bot1', chatId: 1, photo: 'url' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.messageId, 43);
    await m.onUnload();
  });

  await testAsync('handleToolGetFile — success devuelve { status:200, data: { fileId, filePath, ... } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot1', makeClient());
    const r = await m.handleToolGetFile({ botName: 'bot1', fileId: 'fid1' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.fileId, 'fid1');
    assert.ok(r.data.downloadUrl.includes('fid1') || r.data.downloadUrl.includes('path'));
    await m.onUnload();
  });

  await testAsync('handleToolGetChat — success devuelve { status:200, data: { chat: {...} } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot1', makeClient());
    const r = await m.handleToolGetChat({ botName: 'bot1', chatId: 999 });
    assert.ok(isCanonicalSuccess(r));
    assert.ok(r.data.chat && r.data.chat.id === 999);
    await m.onUnload();
  });

  await testAsync('handleToolListBots — sin bots devuelve { status:200, data: { bots:[], total:0 } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolListBots();
    assert.ok(isCanonicalSuccess(r));
    assert.deepStrictEqual(r.data.bots, []);
    assert.strictEqual(r.data.total, 0);
    await m.onUnload();
  });

  await testAsync('handleToolListBots — con bots activos devuelve total correcto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot-a', makeClient());
    m.bots.set('bot-b', makeClient());
    const r = await m.handleToolListBots();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.total, 2);
    assert.strictEqual(r.data.bots.length, 2);
    await m.onUnload();
  });

  await testAsync('handleToolEditMessage — bot no encontrado devuelve 404 canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleToolEditMessage({ botName: 'nope', chatId: 1, messageId: 1, text: 'x' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    await m.onUnload();
  });

  await testAsync('handleToolDeleteMessage — success devuelve { status:200, data: { messageId } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot1', makeClient());
    const r = await m.handleToolDeleteMessage({ botName: 'bot1', chatId: 1, messageId: 77 });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.messageId, 77);
    await m.onUnload();
  });

  // ==========================================
  // Group 3: Request handlers — correlation_id propagado
  // ==========================================

  await testAsync('onSendMessageRequest — propaga correlation_id al publish de response', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot1', makeClient());
    mocks.published.length = 0;
    await m.onSendMessageRequest({ request_id: 'req-1', botName: 'bot1', chatId: 1, text: 'hi', correlation_id: 'cid-abc' });
    const responses = publishedOf(mocks, 'telegram.send_message.response');
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].correlation_id, 'cid-abc');
    assert.strictEqual(responses[0].request_id, 'req-1');
    assert.ok(responses[0].timestamp);
    await m.onUnload();
  });

  await testAsync('onSendMessageRequest — genera correlation_id si no viene en request', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot1', makeClient());
    mocks.published.length = 0;
    await m.onSendMessageRequest({ request_id: 'req-2', botName: 'bot1', chatId: 1, text: 'hi' });
    const responses = publishedOf(mocks, 'telegram.send_message.response');
    assert.strictEqual(responses.length, 1);
    assert.ok(typeof responses[0].correlation_id === 'string' && responses[0].correlation_id.length > 0);
    await m.onUnload();
  });

  await testAsync('onListBotsRequest — propaga correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.onListBotsRequest({ request_id: 'req-3', correlation_id: 'cid-xyz' });
    const responses = publishedOf(mocks, 'telegram.list_bots.response');
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].correlation_id, 'cid-xyz');
    await m.onUnload();
  });

  // ==========================================
  // Group 4: Credential handlers
  // ==========================================

  await testAsync('onCredentialDeleted — ignora credenciales que no son de Telegram', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('mybot', makeClient());
    await m.onCredentialDeleted({ key: 'SOME_OTHER_KEY_mybot' });
    assert.strictEqual(m.bots.size, 1); // unchanged
    await m.onUnload();
  });

  await testAsync('onCredentialDeleted — detiene bot con key TELEGRAM_API_KEY_BOT_mybot', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let stopped = false;
    m.bots.set('mybot', { stopPolling: () => { stopped = true; } });
    mocks.published.length = 0;
    await m.onCredentialDeleted({ key: 'TELEGRAM_API_KEY_BOT_mybot' });
    assert.strictEqual(m.bots.size, 0);
    assert.ok(stopped);
    const botStopped = publishedOf(mocks, 'telegram.bot.stopped');
    assert.strictEqual(botStopped.length, 1);
    assert.strictEqual(botStopped[0].botName, 'mybot');
    await m.onUnload();
  });

  await testAsync('onCredentialSaved — ignora provider no TELEGRAM', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const sizeBefore = m.bots.size;
    await m.onCredentialSaved({ key: 'TELEGRAM_API_KEY_BOT_bot1', provider: 'OPENAI', level: 'BOT' });
    assert.strictEqual(m.bots.size, sizeBefore);
    await m.onUnload();
  });

  // ==========================================
  // Group 5: Bot management events
  // ==========================================

  await testAsync('stopBot — emite telegram.bot.stopped con correlation_id y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.bots.set('bot-x', { stopPolling: () => {} });
    mocks.published.length = 0;
    await m.stopBot('bot-x');
    const stopped = publishedOf(mocks, 'telegram.bot.stopped');
    assert.strictEqual(stopped.length, 1);
    assert.strictEqual(stopped[0].botName, 'bot-x');
    assert.ok(typeof stopped[0].correlation_id === 'string');
    assert.ok(stopped[0].timestamp);
    await m.onUnload();
  });

  await testAsync('stopBot — no hace nada si bot no existe', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m.stopBot('inexistente');
    assert.strictEqual(mocks.published.length, 0);
    await m.onUnload();
  });

  // ==========================================
  // Group 7: Helpers POC2
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'VALIDATION_FAILED', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'VALIDATION_FAILED', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'INTERNAL_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'INTERNAL_ERROR', message: 'oops' } });
    assert.ok(!('details' in r2.error));
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('Bot not found: foo')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'INVALID_INPUT');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'EXTERNAL_API_FAILED');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('telegram.errors.total', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    const metric = mocks.metricsCalls.find(c => c[0] === 'increment' && c[1] === 'telegram.errors.total');
    assert.ok(metric, 'metric increment esperado');
    await m.onUnload();
  });

  await testAsync('_getBotOrThrow lanza con _code RESOURCE_NOT_FOUND si bot no existe', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    let threw = false;
    try { m._getBotOrThrow('missing'); } catch (e) {
      threw = true;
      assert.strictEqual(e._code, 'RESOURCE_NOT_FOUND');
    }
    assert.ok(threw);
    await m.onUnload();
  });

  await testAsync('_getBotOrThrow devuelve cliente si bot existe', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const client = makeClient();
    m.bots.set('mybot', client);
    assert.strictEqual(m._getBotOrThrow('mybot'), client);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})();
