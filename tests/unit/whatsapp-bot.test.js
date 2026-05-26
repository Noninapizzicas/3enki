/**
 * Tests unitarios — whatsapp-bot (POC2).
 *
 * Ejecutar: node tests/unit/whatsapp-bot.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WhatsappBotModule = require('../../modules/whatsapp-bot/index.js');
const { parsearPedido } = require('../../modules/whatsapp-bot/services/pedido-parser');
const { parseWebhookEvent } = require('../../modules/whatsapp-bot/services/meta-cloud-client');

let TMP_ROOT, ORIG_CWD, ORIG_ENV_TOKEN, ORIG_ENV_VERIFY;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-test-'));
  process.chdir(TMP_ROOT);
  // Crear estructura de proyecto vapers con whatsapp_config completo
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP_ROOT, 'data', 'projects', 'vapers', 'config', 'project.json'),
    JSON.stringify({
      name: 'Vapers test',
      whatsapp: {
        waba_id: 'waba-test',
        phone_number_id: 'phone-vapers-123',
        display_number: '+34600000000',
        webhook_path: '/whatsapp/webhook/vapers',
        pwa_url: 'https://tienda.example/vapers'
      },
      telegram: { botName: 'staffbot', chatId: '12345' }
    })
  );
  // Proyecto pending: solo con placeholders
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'projects', 'panaderia', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP_ROOT, 'data', 'projects', 'panaderia', 'config', 'project.json'),
    JSON.stringify({
      name: 'Panaderia test',
      whatsapp: {
        phone_number_id: '<PENDIENTE>',
        display_number: '<PENDIENTE>'
      }
    })
  );
  // Proyecto _ejemplo (debe ser ignorado por el guard del _)
  fs.mkdirSync(path.join(TMP_ROOT, 'data', 'projects', '_ejemplo', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP_ROOT, 'data', 'projects', '_ejemplo', 'config', 'project.json'),
    JSON.stringify({ whatsapp: { phone_number_id: 'phone-ejemplo' } })
  );
  ORIG_ENV_TOKEN = process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
  ORIG_ENV_VERIFY = process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers;
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  }
  if (ORIG_ENV_TOKEN === undefined) delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
  else process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = ORIG_ENV_TOKEN;
  if (ORIG_ENV_VERIFY === undefined) delete process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers;
  else process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers = ORIG_ENV_VERIFY;
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

async function instantiate(mocks, opts = {}) {
  const m = new WhatsappBotModule();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  if (opts.fakeMetaClient !== undefined) m.metaClient = opts.fakeMetaClient;
  return { module: m };
}

function makeFakeMetaClient(behavior = 'ok') {
  const calls = [];
  const client = {
    calls,
    sendText: async (args) => {
      calls.push(args);
      if (behavior === 'rate_limited') {
        const err = new Error('rate'); err._code = 'RATE_LIMITED'; throw err;
      }
      if (behavior === 'auth_fail') {
        const err = new Error('bad token'); err._code = 'AUTHENTICATION_REQUIRED'; throw err;
      }
      if (behavior === 'timeout') {
        const err = new Error('timeout'); err._code = 'UPSTREAM_TIMEOUT'; throw err;
      }
      return { messageId: 'wamid.MOCK_' + (calls.length) };
    }
  };
  return client;
}

function makeRes() {
  const state = { status: null, body: null, type: null };
  const res = {
    status(s) { state.status = s; return res; },
    json(b)   { state.body = b; return res; },
    type(t)   { state.type = t; return res; },
    send(b)   { state.body = b; return res; }
  };
  return { res, state };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string' && typeof r.error.message === 'string' && !('data' in r);
}
function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}
function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  setupTmpCwd();
  console.log('whatsapp-bot — POC2\n');

  // ===========================================================
  // Group 1: Lifecycle
  // ===========================================================

  await testAsync('onLoad hidrata mapping desde data/projects (skip _ejemplo)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'whatsapp-bot');
    assert.strictEqual(m.version, '1.0.0');
    assert.ok(m.projectsByMeta.has('vapers'));
    assert.ok(m.projectsByMeta.has('panaderia'));
    assert.ok(!m.projectsByMeta.has('_ejemplo'), 'proyectos _ deben ignorarse');
    assert.strictEqual(m.projectByPhoneId.get('phone-vapers-123'), 'vapers');
    assert.ok(!m.projectByPhoneId.has('<PENDIENTE>'), 'placeholders no se indexan');
    await m.onUnload();
  });

  await testAsync('onUnload limpia mapas + cancela pending pedidos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.pendingPedidos.set('p1', { timeoutHandle: setTimeout(() => {}, 1000) });
    await m.onUnload();
    assert.strictEqual(m.pendingPedidos.size, 0);
    assert.strictEqual(m.projectsByMeta.size, 0);
    assert.strictEqual(m.projectByPhoneId.size, 0);
    assert.strictEqual(m.metaClient, null);
  });

  await testAsync('proyecto operativo requiere phone_number_id no PENDIENTE + env token', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    assert.strictEqual(m._proyectoOperativo('vapers'), false, 'sin token = no operativo');
    assert.strictEqual(m._proyectoOperativo('panaderia'), false, 'PENDIENTE = no operativo');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    assert.strictEqual(m._proyectoOperativo('vapers'), true);
    assert.strictEqual(m._proyectoOperativo('inexistente'), false);
    await m.onUnload();
  });

  // ===========================================================
  // Group 2: Webhook verify (GET /whatsapp/webhook/:project)
  // ===========================================================

  await testAsync('webhook.verify success devuelve challenge en texto plano', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers = 'secret-verify';
    const { res, state } = makeRes();
    await m.handleWebhookVerify({
      params: { project: 'vapers' },
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'secret-verify', 'hub.challenge': '12345' }
    }, res);
    assert.strictEqual(state.status, 200);
    assert.strictEqual(state.type, 'text/plain');
    assert.strictEqual(state.body, '12345');
    delete process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('webhook.verify sin credencial devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    delete process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers;
    const { res, state } = makeRes();
    await m.handleWebhookVerify({
      params: { project: 'vapers' },
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'cualquiera', 'hub.challenge': 'x' }
    }, res);
    assert.strictEqual(state.status, 404);
    assert.strictEqual(state.body.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('webhook.verify con verify_token incorrecto devuelve 403 PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers = 'el-bueno';
    const { res, state } = makeRes();
    await m.handleWebhookVerify({
      params: { project: 'vapers' },
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'el-malo', 'hub.challenge': 'x' }
    }, res);
    assert.strictEqual(state.status, 403);
    assert.strictEqual(state.body.error.code, 'PERMISSION_DENIED');
    delete process.env.META_WHATSAPP_VERIFY_TOKEN_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('webhook.verify con hub.mode != subscribe devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const { res, state } = makeRes();
    await m.handleWebhookVerify({
      params: { project: 'vapers' },
      query: { 'hub.mode': 'unsubscribe', 'hub.verify_token': 'x', 'hub.challenge': 'x' }
    }, res);
    assert.strictEqual(state.status, 400);
    assert.strictEqual(state.body.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // ===========================================================
  // Group 3: Webhook event (POST /whatsapp/webhook/:project)
  // ===========================================================

  function makeMetaPayload({ phoneId = 'phone-vapers-123', from = '34699999999', text = 'hola', messageId = 'wamid.abc' } = {}) {
    return {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'waba-test',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: phoneId, display_phone_number: '+34600000000' },
            contacts: [{ wa_id: from, profile: { name: 'Cliente' } }],
            messages: [{ from, id: messageId, timestamp: '1700000000', type: 'text', text: { body: text } }]
          },
          field: 'messages'
        }]
      }]
    };
  }

  await testAsync('webhook.event acka inmediatamente con EVENT_RECEIVED', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const { res, state } = makeRes();
    await m.handleWebhookEvent({ params: { project: 'vapers' }, body: makeMetaPayload() }, res);
    assert.strictEqual(state.status, 200);
    assert.strictEqual(state.body, 'EVENT_RECEIVED');
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('webhook.event publica whatsapp.mensaje.recibido + dispara saludo', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const { res } = makeRes();
    await m.handleWebhookEvent({ params: { project: 'vapers' }, body: makeMetaPayload({ text: 'hola buenas' }) }, res);
    // Da tiempo a procesar asincrono
    await new Promise(r => setImmediate(r));
    const recibidos = publishedOf(mocks, 'whatsapp.mensaje.recibido');
    assert.strictEqual(recibidos.length, 1);
    assert.strictEqual(recibidos[0].project_slug, 'vapers');
    assert.strictEqual(recibidos[0].from, '34699999999');
    assert.strictEqual(recibidos[0].has_text, true);
    // Saludo respondido (no es pedido bien formado)
    assert.strictEqual(fakeClient.calls.length, 1);
    assert.ok(fakeClient.calls[0].text.includes('catalogo'));
    assert.strictEqual(fakeClient.calls[0].to, '34699999999');
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('webhook.event con phone_number_id de otro proyecto se ignora', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    // Forzar otro proyecto en el mapping
    m.projectByPhoneId.set('phone-otro-555', 'panaderia');
    const { res } = makeRes();
    await m.handleWebhookEvent({
      params: { project: 'vapers' },
      body: makeMetaPayload({ phoneId: 'phone-otro-555' })
    }, res);
    await new Promise(r => setImmediate(r));
    assert.strictEqual(publishedOf(mocks, 'whatsapp.mensaje.recibido').length, 0);
    assert.strictEqual(fakeClient.calls.length, 0);
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  // ===========================================================
  // Group 4: Maquina de estados (despacho saludo vs pedido)
  // ===========================================================

  const PEDIDO_VALIDO = [
    'PEDIDO vapers-A3F2',
    '- 2 x Cloud Nine 50ml Menta',
    '- 1 x Vampire Vape 30ml Tabaco',
    'Total: 38,00 EUR',
    'Palabra clave: roj'
  ].join('\n');

  await testAsync('despacho · pedido valido publica whatsapp.pedido.detectado + pedido.crear-tienda', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    await m._despacharEntrante('vapers', { from: '34699999999', message_id: 'wamid.1', text: PEDIDO_VALIDO });

    const det = publishedOf(mocks, 'whatsapp.pedido.detectado');
    assert.strictEqual(det.length, 1);
    assert.strictEqual(det[0].project_slug, 'vapers');
    assert.strictEqual(det[0].total_centimos, 3800);

    const reqs = publishedOf(mocks, 'pedido.crear-tienda');
    assert.strictEqual(reqs.length, 1);
    assert.strictEqual(reqs[0].project_slug, 'vapers');
    assert.strictEqual(reqs[0].canal_origen, 'whatsapp');
    assert.strictEqual(reqs[0].cliente_telefono, '34699999999');
    assert.strictEqual(reqs[0].palabra_clave, 'roj');
    assert.strictEqual(reqs[0].total_centimos, 3800);
    assert.strictEqual(reqs[0].items.length, 2);
    assert.ok(reqs[0].request_id);
    assert.strictEqual(reqs[0].correlation_id, reqs[0].request_id);

    // Pending registrado
    assert.strictEqual(m.pendingPedidos.size, 1);
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('despacho · texto no parseable responde con link de la PWA', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    await m._despacharEntrante('vapers', { from: '34699999999', message_id: 'wamid.1', text: 'que tal estas' });
    assert.strictEqual(publishedOf(mocks, 'whatsapp.pedido.detectado').length, 0);
    assert.strictEqual(publishedOf(mocks, 'pedido.crear-tienda').length, 0);
    assert.strictEqual(fakeClient.calls.length, 1);
    assert.ok(fakeClient.calls[0].text.includes('catalogo'));
    assert.ok(fakeClient.calls[0].text.includes('tienda.example/vapers'));
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('despacho · pedido de project_slug ajeno avisa al cliente y no publica', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const pedidoOtro = PEDIDO_VALIDO.replace('vapers-A3F2', 'panaderia-A3F2');
    await m._despacharEntrante('vapers', { from: '34699999999', message_id: 'wamid.1', text: pedidoOtro });
    assert.strictEqual(publishedOf(mocks, 'pedido.crear-tienda').length, 0);
    assert.strictEqual(fakeClient.calls.length, 1);
    assert.ok(fakeClient.calls[0].text.toLowerCase().includes('otro negocio'));
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  // ===========================================================
  // Group 5: Correlacion pedido.creado <-> pending
  // ===========================================================

  async function disparaPedidoYObtenRequestId(m) {
    await m._despacharEntrante('vapers', { from: '34699999999', message_id: 'wamid.1', text: PEDIDO_VALIDO });
    const [request_id] = [...m.pendingPedidos.keys()];
    return request_id;
  }

  await testAsync('onPedidoCreado correlacionado confirma cliente + notifica staff', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const request_id = await disparaPedidoYObtenRequestId(m);
    mocks.published.length = 0;
    fakeClient.calls.length = 0;

    await m.onPedidoCreado({
      data: {
        tipo: 'tienda',
        correlation_id: request_id,
        pedido_id: 'ped-xyz',
        codigo_recogida: 'A3F2K9',
        expira_at: '2026-05-28T00:00:00.000Z'
      }
    });

    // Confirmacion al cliente
    assert.strictEqual(fakeClient.calls.length, 1);
    assert.strictEqual(fakeClient.calls[0].to, '34699999999');
    assert.ok(fakeClient.calls[0].text.includes('A3F2K9'));
    assert.ok(fakeClient.calls[0].text.toLowerCase().includes('palabra clave'),
      'mensaje al cliente debe avisar de que le preguntaran palabra clave');

    // Notificacion al staff via telegram-service
    const tg = publishedOf(mocks, 'telegram.send_message.request');
    assert.strictEqual(tg.length, 1);
    assert.strictEqual(tg[0].botName, 'staffbot');
    assert.strictEqual(tg[0].chatId, 12345);
    assert.ok(tg[0].text.includes('A3F2K9'));
    assert.ok(!tg[0].text.includes('roj'), 'NO debe incluir palabra_clave (anti-fraude)');
    assert.ok(!tg[0].text.includes('34699999999'), 'NO debe incluir el numero completo (PII)');

    // Pending consumido
    assert.strictEqual(m.pendingPedidos.size, 0);
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('onPedidoCreado sin correlation_id matching es ignorado', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    await disparaPedidoYObtenRequestId(m);
    fakeClient.calls.length = 0;
    mocks.published.length = 0;
    await m.onPedidoCreado({ data: { tipo: 'tienda', correlation_id: 'random-id', pedido_id: 'p' } });
    assert.strictEqual(fakeClient.calls.length, 0);
    assert.strictEqual(publishedOf(mocks, 'telegram.send_message.request').length, 0);
    assert.strictEqual(m.pendingPedidos.size, 1, 'pending no consumido');
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('onPedidoCreado con tipo!=tienda es ignorado (no es nuestro flujo)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { fakeMetaClient: makeFakeMetaClient('ok') });
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const request_id = await disparaPedidoYObtenRequestId(m);
    mocks.published.length = 0;
    await m.onPedidoCreado({ data: { tipo: 'pos', correlation_id: request_id, pedido_id: 'p' } });
    assert.strictEqual(publishedOf(mocks, 'telegram.send_message.request').length, 0);
    assert.strictEqual(m.pendingPedidos.size, 1, 'pending no consumido — no era nuestro shape');
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('onPedidoCrearTiendaResponse error path avisa al cliente + libera pending', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const request_id = await disparaPedidoYObtenRequestId(m);
    fakeClient.calls.length = 0;
    await m.onPedidoCrearTiendaResponse({ data: { request_id, error: { code: 'INVALID_INPUT', message: 'x' } } });
    assert.strictEqual(fakeClient.calls.length, 1);
    assert.ok(fakeClient.calls[0].text.toLowerCase().includes('no hemos podido procesar'));
    assert.strictEqual(m.pendingPedidos.size, 0);
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('onPedidoCrearTiendaResponse success path es ignorado (lo lleva onPedidoCreado)', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const request_id = await disparaPedidoYObtenRequestId(m);
    fakeClient.calls.length = 0;
    // Response auto-wire success: { request_id, result } sin error
    await m.onPedidoCrearTiendaResponse({ data: { request_id, result: { pedido_id: 'p', codigo_recogida: 'X' } } });
    assert.strictEqual(fakeClient.calls.length, 0, 'no debe enviar nada — success lo trata onPedidoCreado');
    assert.strictEqual(m.pendingPedidos.size, 1, 'pending sigue vivo para onPedidoCreado');
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  // ===========================================================
  // Group 6: Tool whatsapp.enviar
  // ===========================================================

  await testAsync('tool.enviar · success devuelve message_id + publica mensaje.enviado', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('ok');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const r = await m.handleToolEnviar({ project_slug: 'vapers', to: '34611111111', text: 'hola' });
    assert.ok(isCanonicalSuccess(r), JSON.stringify(r));
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.message_id);
    const evs = publishedOf(mocks, 'whatsapp.mensaje.enviado');
    assert.strictEqual(evs.length, 1);
    assert.ok(evs[0].to.includes('***'), 'evento debe enmascarar el numero');
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('tool.enviar · sin project_slug devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { fakeMetaClient: makeFakeMetaClient('ok') });
    const r = await m.handleToolEnviar({ to: '34611111111', text: 'hola' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('tool.enviar · proyecto pendiente devuelve 404', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { fakeMetaClient: makeFakeMetaClient('ok') });
    const r = await m.handleToolEnviar({ project_slug: 'panaderia', to: '34611111111', text: 'hola' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('tool.enviar · sin credencial env devuelve 401', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { fakeMetaClient: makeFakeMetaClient('ok') });
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    const r = await m.handleToolEnviar({ project_slug: 'vapers', to: '34611111111', text: 'hola' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.error.code, 'AUTHENTICATION_REQUIRED');
    await m.onUnload();
  });

  await testAsync('tool.enviar · upstream rate_limited propaga 429 + publica envio.fallido', async () => {
    const mocks = makeMocks();
    const fakeClient = makeFakeMetaClient('rate_limited');
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const { module: m } = await instantiate(mocks, { fakeMetaClient: fakeClient });
    const r = await m.handleToolEnviar({ project_slug: 'vapers', to: '34611111111', text: 'hola' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.error.code, 'RATE_LIMITED');
    assert.strictEqual(publishedOf(mocks, 'whatsapp.envio.fallido').length, 1);
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  await testAsync('tool.enviar · text > max devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { fakeMetaClient: makeFakeMetaClient('ok') });
    const longText = 'x'.repeat(5000);
    const r = await m.handleToolEnviar({ project_slug: 'vapers', to: '34611111111', text: longText });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'text');
    await m.onUnload();
  });

  // ===========================================================
  // Group 7: Health check
  // ===========================================================

  await testAsync('healthCheck devuelve mapping + operativos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    process.env.META_WHATSAPP_API_KEY_PROJECT_vapers = 'tok-test';
    const r = await m.handleHealthCheck();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.projects_mapped, 2);
    assert.strictEqual(r.data.projects_operativos.length, 1);
    assert.strictEqual(r.data.projects_operativos[0].project_slug, 'vapers');
    delete process.env.META_WHATSAPP_API_KEY_PROJECT_vapers;
    await m.onUnload();
  });

  // ===========================================================
  // Group 8: Parser de pedido (servicio puro)
  // ===========================================================

  await testAsync('parser · pedido valido devuelve ok=true con items y palabra_clave', async () => {
    const r = parsearPedido(PEDIDO_VALIDO);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.project_slug, 'vapers');
    assert.strictEqual(r.nonce, 'A3F2');
    assert.strictEqual(r.items.length, 2);
    assert.strictEqual(r.items[0].cantidad, 2);
    assert.strictEqual(r.total_centimos, 3800);
    assert.strictEqual(r.palabra_clave, 'roj');
  });

  await testAsync('parser · sin header PEDIDO no es pedido (ok=false, kind=no_es_pedido)', async () => {
    const r = parsearPedido('hola que tal\n- 2 x algo\nTotal: 5,00 EUR');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.kind, 'no_es_pedido');
  });

  await testAsync('parser · linea de palabra clave ausente devuelve kind=falta_palabra_clave', async () => {
    const txt = ['PEDIDO vapers-A3F2', '- 1 x cosa', 'Total: 5,00 EUR', 'otra cosa que no es palabra clave'].join('\n');
    const r = parsearPedido(txt);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.kind, 'falta_palabra_clave');
  });

  await testAsync('parser · pedido demasiado corto (3 lineas) devuelve no_es_pedido', async () => {
    const r = parsearPedido('PEDIDO vapers-A3F2\n- 1 x x\nTotal: 5,00 EUR');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.kind, 'no_es_pedido');
  });

  await testAsync('parser · total con punto decimal tambien valido', async () => {
    const txt = ['PEDIDO vapers-A3F2', '- 1 x cosa', 'Total: 5.50 EUR', 'Palabra clave: abc'].join('\n');
    const r = parsearPedido(txt);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.total_centimos, 550);
  });

  await testAsync('parser · nonce con caracteres ambiguos rechazado', async () => {
    const txt = ['PEDIDO vapers-O0I1', '- 1 x cosa', 'Total: 5,00 EUR', 'Palabra clave: abc'].join('\n');
    const r = parsearPedido(txt);
    assert.strictEqual(r.ok, false);
  });

  // ===========================================================
  // Group 9: parseWebhookEvent (servicio puro)
  // ===========================================================

  await testAsync('parseWebhookEvent · extrae mensajes de texto', async () => {
    const payload = makeMetaPayload({ text: 'hola' });
    const msgs = parseWebhookEvent(payload);
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].text, 'hola');
    assert.strictEqual(msgs[0].from, '34699999999');
    assert.strictEqual(msgs[0].phone_number_id, 'phone-vapers-123');
    assert.strictEqual(msgs[0].message_type, 'text');
  });

  await testAsync('parseWebhookEvent · payload sin entry devuelve []', async () => {
    assert.deepStrictEqual(parseWebhookEvent({ object: 'whatsapp_business_account' }), []);
    assert.deepStrictEqual(parseWebhookEvent(null), []);
    assert.deepStrictEqual(parseWebhookEvent({}), []);
  });

  teardownTmpCwd();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmpCwd();
  console.error(e);
  process.exit(1);
});
