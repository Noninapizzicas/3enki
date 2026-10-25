/**
 * Tests unitarios — PAGO-GATEWAY / adapter SUMUP (Hosted Checkout, link de pago).
 *
 * Cubre lo que se rompe en silencio si nadie lo mira:
 *   1. La RUTA del webhook está declarada donde el loader la lee (manifest.apis).
 *      Estuvo bajo "http" — clave que buildAPIsFromManifest NO lee → el webhook
 *      nunca existió y ningún pago se habría confirmado jamás.
 *   2. El checkout se crea con la forma que exige SumUp (amount decimal, hosted_checkout).
 *   3. El evento de SumUp NO prueba el pago: se reconsulta y solo PAID confirma.
 *   4. Idempotencia (SumUp reintenta 4 veces) y 5xx cuando no se puede verificar.
 *   5. El camino Stripe sigue vivo con su firma HMAC.
 *
 * Ejecutar: node tests/unit/pizzepos__pago-gateway-sumup.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

const PagoGateway = require('../../modules/pizzepos/pago-gateway/index.js');
const MANIFEST = require('../../modules/pizzepos/pago-gateway/module.json');

let ok = 0;
function check(nombre, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { ok++; console.log('  ok  ' + nombre); })
    .catch((e) => { console.error('  KO  ' + nombre + '\n      ' + e.message); process.exitCode = 1; throw e; });
}

// --------------------------------------------------
// Mocks
// --------------------------------------------------

function makeBus({ cred = { success: true, api_key: 'sup_sk_test' } } = {}) {
  const subs = new Map();
  const bus = {
    published: [],
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, new Set());
      subs.get(ev).add(fn);
      return () => subs.get(ev)?.delete(fn);
    },
    publish(ev, payload) {
      bus.published.push([ev, payload]);
      for (const fn of [...(subs.get(ev) || [])]) fn({ data: payload, ...payload });
      if (ev === 'credential.resolve.request') {
        setImmediate(() => {
          for (const fn of [...(subs.get('credential.resolve.response') || [])]) {
            fn({ data: { request_id: payload.request_id, ...cred } });
          }
        });
      }
    }
  };
  return bus;
}

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const metrics = { increment() {} };

function makeRes() {
  return {
    status: null, body: null,
    writeHead(s) { this.status = s; },
    end(b) { this.body = b; }
  };
}

// fetch falso: handler(url, opts, n) → { status, body }
function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const r = await handler(String(url), opts, calls.length);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}))
    };
  };
  return calls;
}

async function montar(pasarela, opts = {}) {
  const mod = new PagoGateway();
  const bus = makeBus(opts.busOpts);
  await mod.onLoad({ logger, eventBus: bus, metrics, moduleConfig: { pasarela } });
  return { mod, bus };
}

const SUMUP_CFG = {
  kind: 'sumup-checkout',
  provider: 'SUMUP',
  moneda: 'eur',
  merchant_code: 'MC123456',
  webhook_url: 'https://enki-ai.online/modules/pago-gateway/pago/webhook/the-pirate',
  return_url: 'https://enki-ai.online/a/shop/the-pirate/?pago=ok'
};

const CHECKOUT_OK = {
  id: '64553e20-3f0e-49e4-8af3-fd0eca86ce91',
  status: 'PENDING',
  amount: 23.4,
  currency: 'EUR',
  checkout_reference: 'PED-1',
  hosted_checkout: { enabled: true },
  hosted_checkout_url: 'https://checkout.sumup.com/pay/8f9316a3-cda9-42a9-9771-54d534315676'
};

// --------------------------------------------------
// 1. La ruta existe donde el loader mira
// --------------------------------------------------

async function test_manifest_ruta_visible_al_loader() {
  await check('manifest: la ruta del webhook está en "apis" (lo único que el loader lee)', () => {
    const apis = MANIFEST.apis || [];
    const ruta = apis.find((a) => a.path === '/pago/webhook/:project' && a.method === 'POST');
    assert.ok(ruta, 'falta POST /pago/webhook/:project en manifest.apis');
    assert.strictEqual(ruta.handler, 'handleWebhook');
    assert.ok(!MANIFEST.http, 'sobra la clave "http": ningún loader la lee (el webhook quedaría muerto)');
  });

  await check('manifest: el handler declarado existe de verdad en la instancia', () => {
    const mod = new PagoGateway();
    for (const a of MANIFEST.apis) {
      assert.strictEqual(typeof mod[a.handler], 'function', `handler ${a.handler} no existe`);
    }
  });
}

// --------------------------------------------------
// 2. Iniciar pago (crear link)
// --------------------------------------------------

async function test_sumup_iniciar() {
  await check('sumup: sin merchant_code → CONFIG_MISSING (no se finge un checkout)', async () => {
    const { mod } = await montar({ ...SUMUP_CFG, merchant_code: null });
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340 });
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.error.code, 'CONFIG_MISSING');
  });

  await check('sumup: sin webhook_url → CONFIG_MISSING (sin return_url SumUp no avisa)', async () => {
    const { mod } = await montar({ ...SUMUP_CFG, webhook_url: null });
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340 });
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.error.code, 'CONFIG_MISSING');
    assert.ok(/webhook_url/.test(r.error.message));
  });

  await check('sumup: crea el checkout con la forma correcta y devuelve el link', async () => {
    const calls = mockFetch(() => ({ status: 201, body: CHECKOUT_OK }));
    const { mod } = await montar(SUMUP_CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_slug: 'the-pirate' });

    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.checkout_url, CHECKOUT_OK.hosted_checkout_url);
    assert.strictEqual(r.data.session_id, CHECKOUT_OK.id);
    assert.strictEqual(r.data.pasarela, 'sumup-checkout');

    const c = calls[0];
    assert.strictEqual(c.method, 'POST');
    assert.ok(c.url.endsWith('/v0.1/checkouts'), c.url);
    assert.ok(/^Bearer sup_sk_test$/.test(c.headers.Authorization));
    const body = JSON.parse(c.body);
    assert.strictEqual(body.amount, 23.4, 'amount debe ir en DECIMAL, no en céntimos');
    assert.strictEqual(body.currency, 'EUR');
    assert.strictEqual(body.merchant_code, 'MC123456');
    assert.strictEqual(body.checkout_reference, 'PED-1', 'el pedido_id viaja en checkout_reference');
    assert.deepStrictEqual(body.hosted_checkout, { enabled: true });
    assert.strictEqual(body.return_url, SUMUP_CFG.webhook_url, 'return_url = NUESTRO webhook');
    assert.strictEqual(body.redirect_url, SUMUP_CFG.return_url, 'redirect_url = vuelta del cliente');
  });

  await check('sumup: 409 DUPLICATED_CHECKOUT → REUTILIZA el checkout vivo (dos links = dos cobros)', async () => {
    const VIVO = { ...CHECKOUT_OK, checkout_reference: 'PED-1' };
    const calls = mockFetch((url, opts) => (opts.method === 'POST'
      ? { status: 409, body: { message: 'checkout_reference already used' } }
      : { status: 200, body: [VIVO] }));
    const { mod } = await montar(SUMUP_CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 1000, project_id: 'p1' });

    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.checkout_url, VIVO.hosted_checkout_url, 'devuelve el link que YA existía');
    assert.strictEqual(r.data.reutilizado, true);
    assert.strictEqual(calls.filter(c => c.method === 'POST').length, 1, 'no se crea un segundo checkout');
    assert.ok(calls[1].url.includes('checkout_reference=PED-1'), calls[1].url);
  });

  await check('sumup: 409 con el anterior EXPIRADO → sí crea uno nuevo con sufijo #1', async () => {
    const calls = mockFetch((url, opts, n) => {
      if (opts.method === 'POST') {
        return n === 1
          ? { status: 409, body: { message: 'checkout_reference already used' } }
          : { status: 201, body: { ...CHECKOUT_OK, checkout_reference: 'PED-1#1' } };
      }
      return { status: 200, body: [{ ...CHECKOUT_OK, status: 'EXPIRED' }] };
    });
    const { mod } = await montar(SUMUP_CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 1000, project_id: 'p1' });

    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const refs = calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body).checkout_reference);
    assert.deepStrictEqual(refs, ['PED-1', 'PED-1#1']);
  });

  await check('sumup: 409 y NO se puede leer el existente → 503 sin crear un segundo link', async () => {
    const calls = mockFetch((url, opts) => (opts.method === 'POST'
      ? { status: 409, body: { message: 'checkout_reference already used' } }
      : { status: 500, body: { message: 'boom' } }));
    const { mod } = await montar(SUMUP_CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 1000, project_id: 'p1' });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'ESTADO_INCIERTO');
    assert.strictEqual(calls.filter(c => c.method === 'POST').length, 1, 'jamás un segundo checkout a ciegas');
  });

  await check('sumup: el link nace con valid_until (caduca con el pedido, no a los 30 min de SumUp)', async () => {
    const calls = mockFetch(() => ({ status: 201, body: CHECKOUT_OK }));
    const { mod } = await montar({ ...SUMUP_CFG, ttl_minutos: 15 });
    const antes = Date.now();
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 1000 });
    const body = JSON.parse(calls[0].body);
    assert.ok(body.valid_until, 'falta valid_until');
    const t = Date.parse(body.valid_until);
    assert.ok(t > antes + 14 * 60000 && t < antes + 16 * 60000, body.valid_until);
  });

  await check('sumup: 401 de SumUp → PERMISSION_DENIED con el mensaje de arriba', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'Invalid token' } }));
    const { mod } = await montar(SUMUP_CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 1000 });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    assert.ok(/Invalid token/.test(r.error.message));
  });

  await check('sumup: 201 sin hosted_checkout_url → UPSTREAM_INVALID_RESPONSE', async () => {
    mockFetch(() => ({ status: 201, body: { id: 'x', status: 'PENDING' } }));
    const { mod } = await montar(SUMUP_CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 1000 });
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.error.code, 'UPSTREAM_INVALID_RESPONSE');
  });

  await check('sumup: sin config de pasarela → NO_PASARELA (degradable)', async () => {
    const { mod } = await montar({});
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 1000 });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'NO_PASARELA');
  });
}

// --------------------------------------------------
// 3. Webhook: el evento no prueba el pago — se reconsulta
// --------------------------------------------------

const EVT = { event_type: 'CHECKOUT_STATUS_CHANGED', id: CHECKOUT_OK.id };

async function test_sumup_webhook() {
  await check('sumup webhook: status PAID → pago.confirmado con pedido_id y monto', async () => {
    mockFetch(() => ({ status: 200, body: { ...CHECKOUT_OK, status: 'PAID', transactions: [{ id: 'tx-99' }] } }));
    const { mod, bus } = await montar(SUMUP_CFG);
    const res = makeRes();
    await mod.handleWebhook({ body: EVT, params: { project: 'the-pirate' }, headers: {} }, res);

    assert.strictEqual(res.status, 200);
    const conf = bus.published.filter(([e]) => e === 'pago.confirmado');
    assert.strictEqual(conf.length, 1, 'debe emitir exactamente un pago.confirmado');
    const d = conf[0][1];
    assert.strictEqual(d.pedido_id, 'PED-1');
    assert.strictEqual(d.project_slug, 'the-pirate');
    assert.strictEqual(d.monto_centimos, 2340, 'amount 23.40 → 2340 céntimos');
    assert.strictEqual(d.pasarela, 'sumup-checkout');
    assert.strictEqual(d.transaction_id, 'tx-99');
  });

  await check('sumup webhook: status PENDING → NO confirma nada', async () => {
    mockFetch(() => ({ status: 200, body: { ...CHECKOUT_OK, status: 'PENDING' } }));
    const { mod, bus } = await montar(SUMUP_CFG);
    const res = makeRes();
    await mod.handleWebhook({ body: EVT, headers: {} }, res);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(bus.published.filter(([e]) => e === 'pago.confirmado').length, 0);
  });

  await check('sumup webhook: reintento del mismo evento → un solo pago.confirmado', async () => {
    mockFetch(() => ({ status: 200, body: { ...CHECKOUT_OK, status: 'PAID' } }));
    const { mod, bus } = await montar(SUMUP_CFG);
    for (let i = 0; i < 3; i++) await mod.handleWebhook({ body: EVT, headers: {} }, makeRes());
    assert.strictEqual(bus.published.filter(([e]) => e === 'pago.confirmado').length, 1);
  });

  await check('sumup webhook: checkout 404 → 200 sin emitir (no se puede arreglar reintentando)', async () => {
    mockFetch(() => ({ status: 404, body: { message: 'Not found' } }));
    const { mod, bus } = await montar(SUMUP_CFG);
    const res = makeRes();
    await mod.handleWebhook({ body: EVT, headers: {} }, res);
    assert.strictEqual(res.status, 200);
    assert.ok(/checkout_not_found/.test(res.body));
    assert.strictEqual(bus.published.filter(([e]) => e === 'pago.confirmado').length, 0);
  });

  await check('sumup webhook: no se puede verificar (red) → 503 para que SumUp reintente', async () => {
    global.fetch = async () => { throw new Error('ECONNRESET'); };
    const { mod, bus } = await montar(SUMUP_CFG);
    const res = makeRes();
    await mod.handleWebhook({ body: EVT, headers: {} }, res);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(bus.published.filter(([e]) => e === 'pago.confirmado').length, 0);
  });

  await check('sumup webhook: sin credencial → 503 (jamás 200: se perdería el aviso)', async () => {
    const { mod, bus } = await montar(SUMUP_CFG, { busOpts: { cred: { success: false, error: 'sin credencial para provider SUMUP' } } });
    const res = makeRes();
    await mod.handleWebhook({ body: EVT, headers: {} }, res);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(bus.published.filter(([e]) => e === 'pago.confirmado').length, 0);
  });

  await check('sumup webhook: evento desconocido → 200 ignorado (doc: ignorar lo que no conoces)', async () => {
    const { mod, bus } = await montar(SUMUP_CFG);
    const res = makeRes();
    await mod.handleWebhook({ body: { event_type: 'ALGO_NUEVO', id: 'x' }, headers: {} }, res);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(bus.published.filter(([e]) => e === 'pago.confirmado').length, 0);
  });

  await check('sumup webhook: checkout_reference con sufijo @ts → pedido_id limpio', async () => {
    mockFetch(() => ({ status: 200, body: { ...CHECKOUT_OK, status: 'PAID', checkout_reference: 'PED-7@1700000000000' } }));
    const { mod, bus } = await montar(SUMUP_CFG);
    await mod.handleWebhook({ body: EVT, headers: {} }, makeRes());
    const d = bus.published.find(([e]) => e === 'pago.confirmado')[1];
    assert.strictEqual(d.pedido_id, 'PED-7');
  });
}

// --------------------------------------------------
// 4. Regresión: Stripe sigue confirmando con su firma
// --------------------------------------------------

async function test_stripe_sigue_vivo() {
  await check('stripe: firma HMAC válida → pago.confirmado (no se rompió el camino viejo)', async () => {
    const secret = 'whsec_test';
    const { mod, bus } = await montar({ ...SUMUP_CFG, kind: 'stripe-checkout', provider: 'STRIPE', webhook_secret: secret });
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', payment_status: 'paid', amount_total: 2340, metadata: { pedido_id: 'PED-9', project_slug: 'the-pirate' } } }
    });
    const t = 1700000000;
    const v1 = crypto.createHmac('sha256', secret).update(t + '.' + payload, 'utf8').digest('hex');
    const res = makeRes();
    await mod.handleWebhook({ _rawBody: payload, headers: { 'stripe-signature': `t=${t},v1=${v1}` } }, res);

    assert.strictEqual(res.status, 200);
    const d = bus.published.find(([e]) => e === 'pago.confirmado')[1];
    assert.strictEqual(d.pedido_id, 'PED-9');
    assert.strictEqual(d.pasarela, 'stripe-checkout');
    assert.strictEqual(d.monto_centimos, 2340);
  });

  await check('stripe: firma inválida → 400 y no confirma', async () => {
    const { mod, bus } = await montar({ ...SUMUP_CFG, kind: 'stripe-checkout', provider: 'STRIPE', webhook_secret: 'whsec_test' });
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs', payment_status: 'paid', metadata: { pedido_id: 'PED-9' } } } });
    const res = makeRes();
    await mod.handleWebhook({ _rawBody: payload, headers: { 'stripe-signature': 't=1,v1=deadbeef' } }, res);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(bus.published.filter(([e]) => e === 'pago.confirmado').length, 0);
  });
}

// --------------------------------------------------

(async () => {
  console.log('\npago-gateway · sumup-checkout\n');
  await test_manifest_ruta_visible_al_loader();
  await test_sumup_iniciar();
  await test_sumup_webhook();
  await test_stripe_sigue_vivo();
  console.log(`\n${ok} ok${process.exitCode ? ' — CON FALLOS' : ''}\n`);
})().catch(() => {});
