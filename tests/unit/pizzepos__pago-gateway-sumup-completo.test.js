/**
 * Tests unitarios — PAGO-GATEWAY / integración SUMUP completa (v1.4).
 *
 * Lo que clavan estos tests (leídos de la spec OpenAPI oficial + 596 KB de doc, 2026-10):
 *   1. PREFLIGHT (pago.estado): merchant, país, moneda, métodos y webhook → `puedo_cobrar`.
 *      El fallo real del alta (scope de pagos online sin activar → sin método 'card') se ve
 *      ANTES de encender el botón, no cuando el cliente intenta pagar.
 *   2. RECIBO (pago.recibo): v1.1 receipts → total/IVA/propina normalizados a céntimos.
 *   3. REEMBOLSO con SumUp caído: NO se reintenta a ciegas; se RECONSULTA la transacción
 *      (v2.1 ?id=) y si el evento REFUND ya existe se da por devuelto. Sin esto, un timeout
 *      dejaba el dinero en el limbo hasta el siguiente tick de conciliación.
 *   4. REEMBOLSO sin rastro de REFUND: 504 ESTADO_INCIERTO con la verdad (no se ha aplicado).
 *   5. WEBHOOK a prueba de la familia nueva de eventos (`checkouts.paid`, …) y sordo a los
 *      que no son de checkout (`readers.created`), sin gastar una llamada a la API.
 *   6. LIBRO: guarda customer_id y payment_instrument_token (puerta a la tarjeta guardada).
 *
 * Ejecutar: node tests/unit/pizzepos__pago-gateway-sumup-completo.test.js
 */

'use strict';

const assert = require('assert');
const PagoGateway = require('../../modules/pago-gateway/index.js');

let ok = 0;
const check = (nombre, fn) => Promise.resolve().then(fn)
  .then(() => { ok++; console.log('  ok  ' + nombre); })
  .catch((e) => { console.error('  KO  ' + nombre + '\n      ' + e.message); process.exitCode = 1; throw e; });

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const metrics = { increment() {} };
const PROYECTO = { id: 'p-1', slug: 'the-pirate' };

function makeRes() {
  return { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
}

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const r = await handler(String(url), opts, calls);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})) };
  };
  return calls;
}

function makeBus({ disco = new Map() } = {}) {
  const subs = new Map();
  const bus = {
    published: [], disco,
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, new Set());
      subs.get(ev).add(fn);
      return () => subs.get(ev)?.delete(fn);
    },
    publish(ev, payload) {
      bus.published.push([ev, payload]);
      for (const fn of [...(subs.get(ev) || [])]) fn({ data: payload, ...payload });
      const responder = (nombre, cuerpo) => {
        if (ev !== nombre) return;
        setImmediate(() => { for (const fn of [...(subs.get(nombre.replace('.request', '.response')) || [])]) fn({ data: { request_id: payload.request_id, ...cuerpo } }); });
      };
      responder('credential.resolve.request', { success: true, api_key: 'sup_sk_test' });
      responder('project.list.request', { success: true, projects: [{ ...PROYECTO, name: 'the-pirate' }] });
      responder('fs.read.request', (() => {
        const c = disco.get(payload.path);
        return c === undefined ? { success: false, error: 'not found' } : { success: true, content: c };
      })());
      responder('fs.write.request', (() => { disco.set(payload.path, payload.content); return { success: true }; })());
    },
    libro() { const c = disco.get('/pago/checkouts.json'); return c ? JSON.parse(c) : null; },
    eventos(ev) { return bus.published.filter(([e]) => e === ev).map(([, p]) => p); }
  };
  return bus;
}

async function montar(pasarela, opts = {}) {
  const mod = new PagoGateway();
  const bus = makeBus(opts);
  await mod.onLoad({ logger, eventBus: bus, metrics, moduleConfig: { pasarela } });
  return { mod, bus };
}

const CFG = {
  kind: 'sumup-checkout', provider: 'SUMUP', moneda: 'eur',
  merchant_code: 'M1234567', ttl_minutos: 15,
  webhook_url: 'https://enki-ai.online/modules/pago-gateway/pago/webhook/the-pirate',
  return_url: 'https://enki-ai.online/a/shop/the-pirate/?pago=ok'
};

const MERCHANT_ES = { merchant_code: 'M1234567', country: 'ES', default_currency: 'EUR', business_type: 'sole_trader', merchant_name: 'La Nonina' };

const CO_PENDIENTE = {
  id: 'co-1', status: 'PENDING', amount: 23.4, currency: 'EUR', checkout_reference: 'PED-1',
  hosted_checkout_url: 'https://checkout.sumup.com/pay/abc', checkout_type: 'checkout',
  merchant_country: 'ES', purpose: 'CHECKOUT',
  valid_until: new Date(Date.now() + 15 * 60000).toISOString()
};

// ── 1. PREFLIGHT ─────────────────────────────────────────────
async function test_estado_sano() {
  await check('estado: cuenta sana (ES/EUR/card/webhook) → puedo_cobrar true y sin avisos', async () => {
    mockFetch((url) => {
      if (/\/v1\/merchants\//.test(url)) return { status: 200, body: MERCHANT_ES };
      if (/payment-methods/.test(url)) return { status: 200, body: [{ id: 'card' }, { id: 'apple_pay' }, { id: 'google_pay' }] };
      return { status: 404, body: {} };
    });
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoEstado({});
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.puedo_cobrar, true, JSON.stringify(r.data));
    assert.deepStrictEqual(r.data.avisos, [], JSON.stringify(r.data.avisos));
    assert.strictEqual(r.data.merchant_pais, 'ES');
    assert.strictEqual(r.data.merchant_moneda, 'EUR');
    assert.strictEqual(r.data.tarjeta, true);
    assert.strictEqual(r.data.apple_pay, true);
    assert.strictEqual(r.data.bizum, false);
  });
}

async function test_estado_sin_scope_online() {
  await check('estado: sin método card → puedo_cobrar false y lo dice (sin culpar a la clave)', async () => {
    mockFetch((url) => {
      if (/\/v1\/merchants\//.test(url)) return { status: 200, body: MERCHANT_ES };
      if (/payment-methods/.test(url)) return { status: 200, body: [] };
      return { status: 404, body: {} };
    });
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoEstado({});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.puedo_cobrar, false);
    assert.ok(r.data.avisos.some(a => /eCom/.test(a)), JSON.stringify(r.data.avisos));
  });
}

async function test_estado_avisos_moneda_y_pais() {
  await check('estado: cuenta de otro país/moneda → avisos, no silencio', async () => {
    mockFetch((url) => {
      if (/\/v1\/merchants\//.test(url)) return { status: 200, body: { ...MERCHANT_ES, country: 'DE', default_currency: 'GBP' } };
      if (/payment-methods/.test(url)) return { status: 200, body: [{ id: 'card' }] };
      return { status: 404, body: {} };
    });
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoEstado({});
    assert.strictEqual(r.data.puedo_cobrar, true, 'la cuenta cobra, pero con avisos');
    assert.ok(r.data.avisos.some(a => /no de España/.test(a)), JSON.stringify(r.data.avisos));
    assert.ok(r.data.avisos.some(a => /GBP/.test(a)), JSON.stringify(r.data.avisos));
  });
}

async function test_estado_por_bus() {
  await check('estado: por bus responde pago.estado.response con el request_id', async () => {
    mockFetch((url) => {
      if (/\/v1\/merchants\//.test(url)) return { status: 200, body: MERCHANT_ES };
      if (/payment-methods/.test(url)) return { status: 200, body: [{ id: 'card' }] };
      return { status: 404, body: {} };
    });
    const { bus } = await montar(CFG);
    bus.publish('pago.estado.request', { request_id: 'req-9', project_id: null });
    await new Promise(r => setTimeout(r, 80));
    const resp = bus.eventos('pago.estado.response').find(x => x.request_id === 'req-9');
    assert.ok(resp, 'no respondió al puerto pago.estado');
    assert.strictEqual(resp.status, 200);
  });
}

// ── 2. RECIBO ────────────────────────────────────────────────
async function test_recibo() {
  await check('recibo: v1.1 normaliza total/IVA/propina a céntimos y lo publica', async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        transaction_data: {
          transaction_code: 'TEENSK4W2K', timestamp: '2026-10-24T20:31:00Z',
          amount: '23.40', vat_amount: '2.03', tip_amount: '1.50', currency: 'EUR', payment_type: 'ECOM'
        },
        merchant_data: { merchant_name: 'La Nonina' },
        acquirer_data: { authorization_code: '053201' }
      }
    }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoRecibo({ transaction_id: 'tx-buena', pedido_id: 'PED-1' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.total_centimos, 2340);
    assert.strictEqual(r.data.iva_centimos, 203);
    assert.strictEqual(r.data.propina_centimos, 150);
    assert.strictEqual(r.data.autorizacion, '053201');
    assert.strictEqual(r.data.comercio, 'La Nonina');
    assert.strictEqual(bus.eventos('pago.recibo.obtenido').length, 1);
  });
}

async function test_recibo_sin_ids() {
  await check('recibo: sin transaction_id ni pedido en el libro → 400 INVALID_INPUT', async () => {
    mockFetch(() => ({ status: 200, body: {} }));
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoRecibo({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
  });
}

// ── 3 y 4. REEMBOLSO: estado incierto resuelto por reconsulta ─
async function test_reembolso_resuelto() {
  await check('reembolso: SumUp 500 → reconsulta la transacción, ve REFUND y lo da por devuelto', async () => {
    const calls = mockFetch((url) => {
      if (/\/refunds$/.test(url)) return { status: 500, body: { message: 'boom' } };
      if (/transactions\?id=/.test(url)) {
        return {
          status: 200,
          body: {
            id: 'tx-buena', status: 'REFUNDED', amount: 23.4, currency: 'EUR',
            events: [
              { id: 'ev-1', event_type: 'REFUND', status: 'REFUNDED', amount: 5 },
              { id: 'ev-2', event_type: 'PAYOUT', status: 'PAID_OUT', amount: 18.4 }
            ]
          }
        };
      }
      return { status: 404, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', transaction_id: 'tx-buena', monto_centimos: 500 });

    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.reembolsado, true);
    assert.strictEqual(r.data.resuelto_por_reconsulta, true);
    assert.strictEqual(r.data.monto_centimos, 500);
    // NO se reintentó el POST del reembolso: un segundo refund devolvería el dinero dos veces.
    assert.strictEqual(calls.filter(c => /\/refunds$/.test(c.url)).length, 1, 'se reintentó el reembolso');
    assert.strictEqual(bus.eventos('pago.reembolsado').length, 1);
  });
}

async function test_reembolso_sin_rastro() {
  await check('reembolso: SumUp 500 y la transacción sin REFUND → 504 ESTADO_INCIERTO (no se aplicó)', async () => {
    mockFetch((url) => {
      if (/\/refunds$/.test(url)) return { status: 500, body: { message: 'boom' } };
      if (/transactions\?id=/.test(url)) return { status: 200, body: { id: 'tx-buena', status: 'SUCCESSFUL', events: [] } };
      return { status: 404, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', transaction_id: 'tx-buena', monto_centimos: 500 });

    assert.strictEqual(r.status, 504, JSON.stringify(r));
    assert.strictEqual(r.error.code, 'ESTADO_INCIERTO');
    assert.ok(/no se ha aplicado/.test(r.error.message), r.error.message);
    assert.strictEqual(bus.eventos('pago.reembolsado').length, 0, 'no se puede cantar un reembolso que no consta');
  });
}

// ── 5. WEBHOOK tolerante a eventos nuevos ────────────────────
async function test_webhook_evento_nuevo() {
  await check('webhook: checkouts.paid (formato nuevo) confirma el cobro igual', async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        ...CO_PENDIENTE, status: 'PAID',
        transactions: [{ id: 'tx-buena', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL', amount: 23.4, payment_type: 'ECOM', entry_mode: 'CUSTOMER_ENTRY' }]
      }
    }));
    const { mod, bus } = await montar(CFG);
    const res = makeRes();
    await mod.handleWebhook({ params: { project: 'the-pirate' }, query: {}, _rawBody: JSON.stringify({ event_type: 'checkouts.paid', id: 'co-1' }) }, res);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1);
  });
}

async function test_webhook_evento_ajeno() {
  await check('webhook: readers.created se ignora con 200 y sin gastar llamada a la API', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    const { mod, bus } = await montar(CFG);
    const res = makeRes();
    await mod.handleWebhook({ params: { project: 'the-pirate' }, query: {}, _rawBody: JSON.stringify({ event_type: 'readers.created', id: 'r-1' }) }, res);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 0, 'no se debe reconsultar un evento que no es de checkout');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
  });
}

// ── 6. LIBRO enriquecido (tarjeta guardada) ──────────────────
async function test_libro_token() {
  await check('libro: guarda customer_id y payment_instrument_token del checkout', async () => {
    mockFetch(() => ({
      status: 201,
      body: { ...CO_PENDIENTE, customer_id: 'cust-1', payment_instrument: { token: 'tok-abc' } }
    }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoIniciar({
      pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id, project_slug: PROYECTO.slug,
      customer_id: 'cust-1'
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const e = bus.libro().checkouts['co-1'];
    assert.strictEqual(e.customer_id, 'cust-1');
    assert.strictEqual(e.payment_instrument_token, 'tok-abc');
    assert.strictEqual(e.merchant_country, 'ES');
  });
}

// ─────────────────────────────────────────────────────────────
(async () => {
  await test_estado_sano();
  await test_estado_sin_scope_online();
  await test_estado_avisos_moneda_y_pais();
  await test_estado_por_bus();
  await test_recibo();
  await test_recibo_sin_ids();
  await test_reembolso_resuelto();
  await test_reembolso_sin_rastro();
  await test_webhook_evento_nuevo();
  await test_webhook_evento_ajeno();
  await test_libro_token();
  console.log(`\n${ok} checks OK`);
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
})().catch(() => { setTimeout(() => process.exit(1), 50).unref(); });
