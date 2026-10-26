/**
 * Tests unitarios — PAGO-GATEWAY / CONCILIACIÓN con la cuenta de SumUp (v1.3).
 *
 * Lo que clavan estos tests, y por qué cada uno costó dinero:
 *   1. COBRO HUÉRFANO — entra dinero en la cuenta que no casa con ningún pedido. Sin este
 *      aviso, el negocio no se entera nunca.
 *   2. REEMBOLSO EXTERNO — devuelven el dinero desde el panel de SumUp: el libro lo detecta
 *      por `refunded_amount` y emite SOLO la diferencia (nunca el total: se duplicaría).
 *   3. CONTRACARGO — `type: CHARGE_BACK` del historial → pago.contracargo y el libro marcado.
 *   4. CURSOR — el tick avanza `changes_since` y `vistos` impide re-emitir al releer la ventana.
 *   5. FALLO DE RED — si el historial falla, el cursor NO avanza (se re-lee, no se pierde).
 *   6. LIQUIDACIÓN — `cobro.liquidado` con bruto, comisión REAL, deducciones y neto del día.
 *   7. AL DÍA — un día ya conciliado no se vuelve a pedir.
 *   8. INTEGRIDAD — un PAID por menos de lo pedido NO confirma: pago.importe_discrepante.
 *   9. INTEGRIDAD — si el exceso lo explica la propina del cliente, sí confirma.
 *  10. WEBHOOK RÁPIDO — un solo intento con timeout corto: SumUp da por fallida la notificación
 *      que tarda (doc literal), así que se prefiere 503 en 4 s a un 200 tardío.
 *  11. FUTURO CABLEADO — `purpose` y `customer_id` viajan al checkout (tarjeta guardada mañana).
 *
 * Ejecutar: node tests/unit/pizzepos__pago-gateway-sumup-conciliacion.test.js
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
const LIBRO = '/pago/checkouts.json';
const CONCILIACION = '/pago/conciliacion.json';

function makeRes() {
  return { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
}

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const r = await handler(String(url), opts, calls.length);
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
    libro() { const c = disco.get(LIBRO); return c ? JSON.parse(c) : null; },
    conci() { const c = disco.get(CONCILIACION); return c ? JSON.parse(c) : null; },
    eventos(ev) { return bus.published.filter(([e]) => e === ev).map(([, p]) => p); }
  };
  return bus;
}

const CFG = {
  kind: 'sumup-checkout', provider: 'SUMUP', moneda: 'eur',
  merchant_code: 'M1234567', ttl_minutos: 15,
  webhook_url: 'https://enki-ai.online/modules/pago-gateway/pago/webhook/the-pirate',
  return_url: 'https://enki-ai.online/a/shop/the-pirate/?pago=ok'
};

async function montar(pasarela, opts = {}) {
  const mod = new PagoGateway();
  const bus = makeBus(opts);
  await mod.onLoad({ logger, eventBus: bus, metrics, moduleConfig: { pasarela } });
  return { mod, bus };
}

const entry = (extra = {}) => ({
  checkout_id: 'co-1', estado: 'confirmado', pedido_id: 'PED-1', project_slug: 'the-pirate',
  monto_centimos: 2340, moneda: 'EUR', transaction_id: 'tx-buena', transaction_code: 'TEENSK4W2K',
  creado: new Date().toISOString(), reembolsos: [], ...extra
});

const discoCon = (entries) => new Map([[LIBRO, JSON.stringify({ version: 1, checkouts: entries })]]);

// Historial: router por URL (history vs payouts), con items configurables.
function routerSumup({ history = { items: [], links: [] }, payouts = [], historyStatus = 200, payoutsStatus = 200, onPost = null }) {
  return mockFetch((url, opts) => {
    if (url.includes('/transactions/history')) return { status: historyStatus, body: history };
    if (url.includes('/payouts')) return { status: payoutsStatus, body: payouts };
    if (opts.method === 'POST' && url.endsWith('/v0.1/checkouts')) return { status: 201, body: onPost || CO_PENDIENTE };
    return { status: 200, body: {} };
  });
}

const ITEM_PAGO = {
  transaction_id: 'tx-buena', transaction_code: 'TEENSK4W2K', amount: 23.4, currency: 'EUR',
  timestamp: '2026-10-25T10:00:00.000Z', status: 'SUCCESSFUL', payment_type: 'ECOM',
  type: 'PAYMENT', refunded_amount: 0, payout_date: '2026-10-26'
};

const CO_PENDIENTE = {
  id: 'co-1', status: 'PENDING', amount: 23.4, currency: 'EUR',
  checkout_reference: 'PED-1', hosted_checkout_url: 'https://checkout.sumup.com/pay/abc',
  valid_until: new Date(Date.now() + 15 * 60000).toISOString()
};

const CO_PAGADO = {
  ...CO_PENDIENTE, status: 'PAID',
  transactions: [{ id: 'tx-buena', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL', amount: 23.4, payment_type: 'ECOM', entry_mode: 'CUSTOMER_ENTRY' }]
};

// ─────────────────────────────────────────────────────────────
async function test_historial() {
  await check('conciliación: cobro que no casa con ningún pedido → cobro.huerfano', async () => {
    routerSumup({ history: { items: [{ ...ITEM_PAGO, transaction_id: 'tx-x', transaction_code: 'HUERF1' }], links: [] } });
    const { mod, bus } = await montar(CFG, { disco: discoCon({}) });
    const r = await mod.handlePagoConciliar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const ev = bus.eventos('cobro.huerfano');
    assert.strictEqual(ev.length, 1, 'no avisó del dinero sin pedido');
    assert.strictEqual(ev[0].transaction_code, 'HUERF1');
    assert.strictEqual(ev[0].monto_centimos, 2340);
    assert.strictEqual(ev[0].origen, 'conciliacion');
  });

  await check('conciliación: reembolso hecho en el panel → emite SOLO la diferencia', async () => {
    routerSumup({
      history: { items: [{ ...ITEM_PAGO, refunded_amount: 5 }], links: [] },
      payouts: []
    });
    const { mod, bus } = await montar(CFG, { disco: discoCon({ 'co-1': entry() }) });
    await mod.handlePagoConciliar({ project_id: PROYECTO.id });
    const ev = bus.eventos('pago.reembolsado');
    assert.strictEqual(ev.length, 1, 'no detectó el reembolso externo');
    assert.strictEqual(ev[0].monto_centimos, 500);
    assert.strictEqual(ev[0].total_reembolsado_centimos, 500);
    assert.strictEqual(ev[0].origen, 'conciliacion');
    assert.strictEqual(ev[0].completo, false);
    const e = bus.libro().checkouts['co-1'];
    assert.strictEqual(e.reembolsos.length, 1, 'el libro no apuntó el reembolso');
    assert.strictEqual(e.reembolsos[0].origen, 'conciliacion');
  });

  await check('conciliación: contracargo → pago.contracargo', async () => {
    routerSumup({
      history: { items: [{ transaction_id: 'tx-cb', transaction_code: 'CBK1', type: 'CHARGE_BACK', amount: 23.4, currency: 'EUR', status: 'SUCCESSFUL', timestamp: '2026-10-25T11:00:00.000Z' }], links: [] },
      payouts: []
    });
    const { mod, bus } = await montar(CFG, { disco: discoCon({}) });
    await mod.handlePagoConciliar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    const ev = bus.eventos('pago.contracargo');
    assert.strictEqual(ev.length, 1, 'no avisó del contracargo');
    assert.strictEqual(ev[0].transaction_code, 'CBK1');
    assert.strictEqual(ev[0].monto_centimos, 2340);
    assert.strictEqual(ev[0].project_slug, 'the-pirate');
  });

  await check('conciliación: el cursor avanza y releer la ventana NO re-emite', async () => {
    routerSumup({ history: { items: [ITEM_PAGO], links: [] }, payouts: [] });
    const { mod, bus } = await montar(CFG, { disco: discoCon({ 'co-1': entry({ estado: 'confirmado', reembolsos: [{ monto_centimos: 500, at: '2026-10-25T10:00:00Z' }] }) }) });
    await mod.handlePagoConciliar({ project_id: PROYECTO.id });
    const est1 = bus.conci();
    assert.ok(est1.history_cursor, 'no se guardó el cursor');
    assert.strictEqual(est1.vistos.length, 1);
    await mod.handlePagoConciliar({ project_id: PROYECTO.id });
    assert.strictEqual(bus.conci().vistos.length, 1, 'el segundo tick no deduplicó');
    assert.strictEqual(bus.eventos('pago.reembolsado').length, 0, 're-emitió lo ya visto');
    assert.strictEqual(bus.eventos('cobro.huerfano').length, 0, 're-emitió un huérfano ya visto');
  });

  await check('conciliación: si el historial falla, el cursor NO avanza y queda el error', async () => {
    routerSumup({ historyStatus: 500, history: { items: [] } });
    const { mod, bus } = await montar(CFG, { disco: discoCon({}) });
    const r = await mod.handlePagoConciliar({ project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200);
    const est = bus.conci();
    assert.strictEqual(est.history_cursor, null, 'avanzó el cursor sin haber leído');
    assert.ok(/history 500/.test(est.ultimo_error || ''), 'no dejó constancia del fallo: ' + est.ultimo_error);
  });
}

async function test_payouts() {
  await check('liquidación: cobro.liquidado con bruto, comisión REAL, deducciones y neto', async () => {
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    routerSumup({
      history: { items: [], links: [] },
      payouts: [
        { id: 1, type: 'PAYOUT', amount: 100, date: ayer, currency: 'EUR', fee: 1.95, status: 'SUCCESSFUL', reference: 'p1', transaction_code: 'A' },
        { id: 2, type: 'PAYOUT', amount: 23.4, date: ayer, currency: 'EUR', fee: 0.46, status: 'SUCCESSFUL', reference: 'p2', transaction_code: 'B' },
        { id: 3, type: 'REFUND_DEDUCTION', amount: 5, date: ayer, currency: 'EUR', fee: 0, status: 'SUCCESSFUL', reference: 'r1', transaction_code: 'B' }
      ]
    });
    const { mod, bus } = await montar(CFG, { disco: discoCon({}) });
    await mod.handlePagoConciliar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    const ev = bus.eventos('cobro.liquidado');
    assert.strictEqual(ev.length, 1, 'no emitió la liquidación del día');
    assert.strictEqual(ev[0].fecha, ayer);
    assert.strictEqual(ev[0].bruto_centimos, 12340);
    assert.strictEqual(ev[0].comision_centimos, 241, 'la comisión real son 1,95 + 0,46');
    assert.strictEqual(ev[0].deducciones_centimos, 500);
    assert.strictEqual(ev[0].neto_centimos, 11840);
  });

  await check('liquidación: un día ya conciliado no se vuelve a pedir (al_dia)', async () => {
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const calls = routerSumup({
      history: { items: [], links: [] },
      payouts: [{ id: 1, type: 'PAYOUT', amount: 10, date: ayer, currency: 'EUR', fee: 0.2, status: 'SUCCESSFUL', reference: 'p', transaction_code: 'A' }]
    });
    const { mod, bus } = await montar(CFG, { disco: discoCon({}) });
    await mod.handlePagoConciliar({ project_id: PROYECTO.id });
    const n1 = calls.filter(c => c.url.includes('/payouts')).length;
    await mod.handlePagoConciliar({ project_id: PROYECTO.id });
    const n2 = calls.filter(c => c.url.includes('/payouts')).length;
    assert.strictEqual(n1, 1);
    assert.strictEqual(n2, 1, 'volvió a pedir un rango ya conciliado');
    assert.strictEqual(bus.eventos('cobro.liquidado').length, 1, 'duplicó la liquidación');
  });
}

async function test_integridad() {
  const webhook = (mod, id = 'co-1') => {
    const res = makeRes();
    return mod.handleWebhook({ params: { project: 'the-pirate' }, query: {}, _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id }) }, res).then(r => ({ r, res }));
  };

  await check('integridad: PAID por MENOS de lo pedido → importe_discrepante y NO confirma', async () => {
    const co = { ...CO_PAGADO, amount: 10, transactions: [{ id: 'tx-buena', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL', amount: 10 }] };
    mockFetch(() => ({ status: 200, body: co }));
    const { mod, bus } = await montar(CFG, { disco: discoCon({ 'co-1': entry({ estado: 'pendiente', transaction_id: null }) }) });
    const { res } = await webhook(mod);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0, 'confirmó un pedido cobrado de menos');
    const d = bus.eventos('pago.importe_discrepante');
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].motivo, 'importe_insuficiente');
    assert.strictEqual(d[0].esperado_centimos, 2340);
    assert.strictEqual(d[0].cobrado_centimos, 1000);
    assert.strictEqual(bus.libro().checkouts['co-1'].estado, 'discrepante');
  });

  await check('integridad: el exceso lo explica la propina del cliente → sí confirma', async () => {
    const co = {
      ...CO_PAGADO, amount: 24.9,
      transactions: [{ id: 'tx-buena', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL', amount: 24.9, tip_amount: 1.5 }]
    };
    mockFetch(() => ({ status: 200, body: co }));
    const { mod, bus } = await montar(CFG, { disco: discoCon({ 'co-1': entry({ estado: 'pendiente', transaction_id: null }) }) });
    await webhook(mod);
    assert.strictEqual(bus.eventos('pago.importe_discrepante').length, 0, 'confundió una propina con un fraude');
    const ev = bus.eventos('pago.confirmado');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].propina_centimos, 150);
    assert.strictEqual(ev[0].monto_centimos, 2490);
  });
}

async function test_webhook_rapido() {
  await check('webhook: un solo intento (no se reintenta la verificación: SumUp ya reintenta)', async () => {
    const calls = mockFetch(() => ({ status: 500, body: { message: 'boom' } }));
    const { mod } = await montar(CFG, { disco: discoCon({}) });
    const res = makeRes();
    await mod.handleWebhook({ params: { project: 'the-pirate' }, query: {}, _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'co-1' }) }, res);
    assert.strictEqual(res.status, 503);
    const verificaciones = calls.filter(c => c.url.includes('/v0.1/checkouts/'));
    assert.strictEqual(verificaciones.length, 1, 'reintentó la verificación dentro del webhook (SumUp lo daría por fallido)');
  });
}

async function test_futuro() {
  await check('futuro: purpose y customer_id viajan al checkout (tarjeta guardada)', async () => {
    const calls = routerSumup({});
    const { mod } = await montar(CFG, { disco: discoCon({}) });
    const r = await mod.handlePagoIniciar({
      pedido_id: 'PED-9', monto_centimos: 2340, project_id: PROYECTO.id,
      purpose: 'SETUP_RECURRING_PAYMENT', customer_id: 'cust-1'
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/v0.1/checkouts'));
    const body = JSON.parse(post.body);
    assert.strictEqual(body.purpose, 'SETUP_RECURRING_PAYMENT');
    assert.strictEqual(body.customer_id, 'cust-1');
  });

  await check('futuro: sin purpose explícito NO se manda (el default de SumUp es CHECKOUT)', async () => {
    const calls = routerSumup({});
    const { mod } = await montar(CFG, { disco: discoCon({}) });
    await mod.handlePagoIniciar({ pedido_id: 'PED-8', monto_centimos: 2340, project_id: PROYECTO.id });
    const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/v0.1/checkouts'));
    const body = JSON.parse(post.body);
    assert.strictEqual(body.purpose, undefined);
    assert.strictEqual(body.customer_id, undefined);
  });
}

(async () => {
  console.log('pago-gateway · conciliación + integridad (v1.3)\n');
  await test_historial();
  await test_payouts();
  await test_integridad();
  await test_webhook_rapido();
  await test_futuro();
  console.log('\n' + ok + ' checks ok');
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
})().catch(() => { setTimeout(() => process.exit(1), 50).unref(); });
