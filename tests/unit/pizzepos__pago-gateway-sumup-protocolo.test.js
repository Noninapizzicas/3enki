/**
 * Tests unitarios — PAGO-GATEWAY / protocolo SUMUP completo (v1.2).
 *
 * Lo que estos tests clavan (cada punto costó leer la doc oficial, 596 KB):
 *   1. LIBRO de cobros durable en /pago/checkouts.json (sin él no hay barrido).
 *   2. pago.confirmado sale con los datos RICOS del transaction (código, entry_mode, propina, IVA, auth).
 *   3. El transaction bueno no es transactions[0]: se busca el SUCCESSFUL.
 *   4. FAILED → pago.rechazado (el cliente se entera, no se queda mirando la pantalla).
 *   5. BARRIO: webhook perdido → el checkout PAID se confirma igual; PENDING vencido → DELETE.
 *   6. CANCELAR: DELETE mata el link; si ya se pagó, confirma en vez de cancelar.
 *   7. REEMBOLSAR v1.0 con tope por libro y SIN reintento automático (estado incierto).
 *   8. Token del webhook (SumUp no firma: sin token, cualquiera quema la cuota).
 *   9. project_id se resuelve por el :project del path (project.list), no por config global.
 *
 * Ejecutar: node tests/unit/pizzepos__pago-gateway-sumup-protocolo.test.js
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
    const r = await handler(String(url), opts, calls.length);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})) };
  };
  return calls;
}

// Bus falso con bus de eventos + fs de proyecto en memoria.
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
    disco() { return disco.get('/pago/checkouts.json'); },
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

const CO_PENDIENTE = {
  id: 'co-1', status: 'PENDING', amount: 23.4, currency: 'EUR',
  checkout_reference: 'PED-1', hosted_checkout_url: 'https://checkout.sumup.com/pay/abc',
  valid_until: new Date(Date.now() + 15 * 60000).toISOString()
};

const CO_PAGADO = {
  ...CO_PENDIENTE, status: 'PAID',
  checkout_reference: 'PED-1',
  transactions: [
    { id: 'tx-fallida', transaction_code: 'FAILEDTX', status: 'FAILED', amount: 23.4 },
    {
      id: 'tx-buena', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL', amount: 23.4,
      payment_type: 'ECOM', entry_mode: 'CUSTOMER_ENTRY', auth_code: '053201', tip_amount: 1.5, vat_amount: 2.03
    }
  ]
};

const webhook = (mod, { id = 'co-1', query = {}, project = 'the-pirate', evento = 'CHECKOUT_STATUS_CHANGED' } = {}) => {
  const res = makeRes();
  const req = { params: { project }, query, _rawBody: JSON.stringify({ event_type: evento, id }) };
  return mod.handleWebhook(req, res).then(r => ({ r, res }));
};

// ─────────────────────────────────────────────────────────────
async function test_libro() {
  await check('libro: el checkout queda escrito en storage/pago/checkouts.json', async () => {
    mockFetch(() => ({ status: 201, body: CO_PENDIENTE }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    assert.strictEqual(r.status, 200, JSON.stringify(r));

    const libro = bus.libro();
    assert.ok(libro, 'no se escribió el libro');
    const e = libro.checkouts['co-1'];
    assert.ok(e, 'falta la entrada del checkout');
    assert.strictEqual(e.estado, 'pendiente');
    assert.strictEqual(e.pedido_id, 'PED-1');
    assert.strictEqual(e.monto_centimos, 2340);
    assert.strictEqual(e.project_slug, 'the-pirate');
    assert.ok(Date.parse(e.valid_until) > Date.now(), 'valid_until debe estar en el futuro');
  });
}

async function test_confirmar() {
  await check('webhook PAID: pago.confirmado con transaction BUENA (no transactions[0]) y datos ricos', async () => {
    mockFetch(() => ({ status: 200, body: CO_PAGADO }));
    const { mod, bus } = await montar(CFG);
    const { res } = await webhook(mod, { id: 'co-1' });

    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const evs = bus.eventos('pago.confirmado');
    assert.strictEqual(evs.length, 1);
    const p = evs[0];
    assert.strictEqual(p.pedido_id, 'PED-1');
    assert.strictEqual(p.project_id, PROYECTO.id, 'project_id resuelto por el :project del path');
    assert.strictEqual(p.project_slug, 'the-pirate');
    assert.strictEqual(p.transaction_id, 'tx-buena');
    assert.strictEqual(p.transaction_code, 'TEENSK4W2K');
    assert.strictEqual(p.entry_mode, 'CUSTOMER_ENTRY');
    assert.strictEqual(p.auth_code, '053201');
    assert.strictEqual(p.propina_centimos, 150);
    assert.strictEqual(p.iva_centimos, 203);
    assert.strictEqual(p.monto_centimos, 2340);
    assert.strictEqual(p.origen, 'webhook');
  });

  await check('webhook PAID repetido: no reemite (idempotencia duradera en el libro)', async () => {
    mockFetch(() => ({ status: 200, body: CO_PAGADO }));
    const { mod, bus } = await montar(CFG);
    await webhook(mod, { id: 'co-1' });
    await webhook(mod, { id: 'co-1' });
    await webhook(mod, { id: 'co-1' });
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1);
  });

  await check('webhook FAILED → pago.rechazado (una vez) y el pedido se puede reintentar', async () => {
    const co = { ...CO_PENDIENTE, status: 'FAILED', transactions: [{ id: 'tx-1', status: 'FAILED' }] };
    mockFetch(() => ({ status: 200, body: co }));
    const { mod, bus } = await montar(CFG);
    await webhook(mod, { id: 'co-1' });
    await webhook(mod, { id: 'co-1' });
    const evs = bus.eventos('pago.rechazado');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].pedido_id, 'PED-1');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
  });

  await check('webhook: SumUp caído → 503 (para que reintente), nunca 200', async () => {
    global.fetch = async () => { const e = new Error('ECONNRESET'); throw e; };
    const { mod, bus } = await montar(CFG);
    const { res } = await webhook(mod, { id: 'co-1' });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
  });

  await check('webhook: evento desconocido → 200 ignorado (doc: silently ignore)', async () => {
    let llamadas = 0;
    mockFetch(() => { llamadas++; return { status: 200, body: CO_PAGADO }; });
    const { mod } = await montar(CFG);
    const { res } = await webhook(mod, { evento: 'ALGO_NUEVO' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(llamadas, 0, 'un evento desconocido no gasta API');
  });

  await check('webhook: token configurado y ausente → 401 sin llamar a SumUp', async () => {
    let llamadas = 0;
    mockFetch(() => { llamadas++; return { status: 200, body: CO_PAGADO }; });
    const { mod } = await montar({ ...CFG, webhook_token: 's3cr3t' });
    const { res } = await webhook(mod, { id: 'co-1' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(llamadas, 0);
    const { res: ok2 } = await webhook(mod, { id: 'co-1', query: { t: 's3cr3t' } });
    assert.strictEqual(ok2.status, 200);
  });
}

async function test_barrido() {
  await check('barrido: webhook perdido → el checkout PAID se confirma igual (origen barrido)', async () => {
    const disco = new Map([['/pago/checkouts.json', JSON.stringify({
      version: 1, checkouts: { 'co-1': { checkout_id: 'co-1', ...CO_PENDIENTE, estado: 'pendiente', pedido_id: 'PED-1', monto_centimos: 2340, project_slug: 'the-pirate', creado: new Date().toISOString(), valid_until: CO_PENDIENTE.valid_until } }
    })]]);
    mockFetch(() => ({ status: 200, body: CO_PAGADO }));
    const { mod, bus } = await montar(CFG, { disco });
    await mod._barrer();

    const evs = bus.eventos('pago.confirmado');
    assert.strictEqual(evs.length, 1, 'el barrido no confirmó el pago perdido');
    assert.strictEqual(evs[0].pedido_id, 'PED-1');
    assert.strictEqual(evs[0].origen, 'barrido');
    assert.strictEqual(bus.libro().checkouts['co-1'].estado, 'confirmado');
  });

  await check('barrido: PENDING vencido → DELETE del link y estado expirado', async () => {
    const vencido = { ...CO_PENDIENTE, valid_until: new Date(Date.now() - 60000).toISOString() };
    const disco = new Map([['/pago/checkouts.json', JSON.stringify({
      version: 1, checkouts: { 'co-1': { checkout_id: 'co-1', ...vencido, estado: 'pendiente', pedido_id: 'PED-1', monto_centimos: 2340, creado: new Date().toISOString() } }
    })]]);
    const calls = mockFetch((url, opts) => (opts.method === 'DELETE' ? { status: 200, body: vencido } : { status: 200, body: vencido }));
    const { mod, bus } = await montar(CFG, { disco });
    await mod._barrer();
    assert.ok(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/v0.1/checkouts/co-1')), 'no se mató el link vencido');
    assert.strictEqual(bus.libro().checkouts['co-1'].estado, 'expirado');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
  });
}

async function test_cancelar() {
  await check('cancelar: DELETE mata el link y emite pago.cancelado', async () => {
    const calls = mockFetch(() => ({ status: 200, body: CO_PENDIENTE }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoCancelar({ session_id: 'co-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.ok(calls.some(c => c.method === 'DELETE'));
    assert.strictEqual(bus.eventos('pago.cancelado').length, 1);
  });

  await check('cancelar: si ya estaba pagado (409) → confirma, NO cancela', async () => {
    mockFetch((url, opts) => (opts.method === 'DELETE' ? { status: 409, body: { error_code: 'CHECKOUT_PROCESSED' } } : { status: 200, body: CO_PAGADO }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoCancelar({ session_id: 'co-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CHECKOUT_YA_PAGADO');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1);
    assert.strictEqual(bus.eventos('pago.cancelado').length, 0);
  });
}

async function test_reembolsar() {
  const conCobro = () => new Map([['/pago/checkouts.json', JSON.stringify({
    version: 1, checkouts: { 'co-1': { ...CO_PAGADO, estado: 'confirmado', pedido_id: 'PED-1', monto_centimos: 2340, transaction_id: 'tx-buena', reembolsos: [] } }
  })]]);

  await check('reembolsar: completo sin body contra /v1.0 merchants/{mc}/payments/{tx}/refunds', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    const { mod, bus } = await montar(CFG, { disco: conCobro() });
    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const c = calls[0];
    assert.ok(c.url.includes('/v1.0/merchants/M1234567/payments/tx-buena/refunds'), c.url);
    assert.strictEqual(c.method, 'POST');
    assert.strictEqual(c.body, undefined, 'reembolso completo = sin body');
    const ev = bus.eventos('pago.reembolsado')[0];
    assert.strictEqual(ev.monto_centimos, 2340);
    assert.strictEqual(ev.completo, true);
  });

  await check('reembolsar: parcial manda amount en decimal', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    const { mod } = await montar(CFG, { disco: conCobro() });
    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', monto_centimos: 500, project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.deepStrictEqual(JSON.parse(calls[0].body), { amount: 5 });
  });

  await check('reembolsar: por encima de lo cobrado → 400 sin llamar a SumUp', async () => {
    let llamadas = 0;
    mockFetch(() => { llamadas++; return { status: 200, body: {} }; });
    const { mod } = await montar(CFG, { disco: conCobro() });
    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', monto_centimos: 9999, project_id: PROYECTO.id });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(llamadas, 0);
  });

  await check('reembolsar: timeout = ESTADO_INCIERTO y NO se reintenta (no se devuelve dos veces)', async () => {
    const llamadas = [];
    global.fetch = async (url, opts = {}) => {
      llamadas.push({ url: String(url), method: opts.method || 'GET' });
      const e = new Error('timeout'); e.name = 'AbortError'; throw e;
    };
    const { mod, bus } = await montar(CFG, { disco: conCobro() });
    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 504);
    assert.strictEqual(r.error.code, 'ESTADO_INCIERTO');
    // Lo que NO puede pasar: repetir el POST del reembolso a ciegas.
    assert.strictEqual(llamadas.filter(c => /\/refunds$/.test(c.url)).length, 1, 'un reembolso no se repite a ciegas');
    // Lo que SÍ hace ahora (v1.4): preguntarle a la transacción si el dinero salió.
    assert.ok(llamadas.some(c => /transactions\?id=/.test(c.url)), 'tras el timeout debe reconsultar la transacción');
    assert.ok(/desconocido/.test(r.error.message), r.error.message);
    assert.strictEqual(bus.eventos('pago.reembolsado').length, 0, 'sin verificación no se canta un reembolso');
  });
}

async function test_metodos() {
  await check('métodos: lee los de la cuenta y marca bizum=false (SumUp no lo ofrece)', async () => {
    mockFetch(() => ({ status: 200, body: [{ id: 'card', name: 'Card' }, { id: 'apple_pay' }, { id: 'google_pay' }] }));
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoMetodos({});
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.deepStrictEqual(r.data.metodos, ['card', 'apple_pay', 'google_pay']);
    assert.strictEqual(r.data.tarjeta, true);
    assert.strictEqual(r.data.google_pay, true);
    assert.strictEqual(r.data.bizum, false);
  });
}

(async () => {
  console.log('pago-gateway · protocolo sumup (v1.2)\n');
  await test_libro();
  await test_confirmar();
  await test_barrido();
  await test_cancelar();
  await test_reembolsar();
  await test_metodos();
  console.log('\n' + ok + ' checks ok');
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
})().catch(() => { setTimeout(() => process.exit(1), 50).unref(); });
