/**
 * Tests unitarios — PAGO-GATEWAY / CLIENTE DE SIEMPRE, TARJETA GUARDADA, RECURRENCIA y QR.
 *
 * Lo que clavan (leído de la spec OpenAPI oficial + doc de tokenización, 2026-10):
 *   1. CLIENTE: alta IDEMPOTENTE (409 → se lee el que ya existe), tarjetas normalizadas con su
 *      mandato (`cobrable_sin_cliente`), baja de tarjeta por DELETE (204).
 *   2. CONSENTIMIENTO: checkout `SETUP_RECURRING_PAYMENT` + customer_id, y la página del Payment
 *      Widget la sirve el PROPIO módulo → ningún proyecto escribe frontend.
 *   3. TOKENIZACIÓN ≠ COBRO: el desenlace de ese checkout es `pago.tokenizado`, NUNCA
 *      `pago.confirmado` (la autorización se devuelve al instante; no hay dinero que confirmar).
 *   4. RECURRENCIA REAL: `PUT /v0.1/checkouts/{id}` con {payment_type:'card', token, customer_id}
 *      cobra sin cliente delante. Idempotente por referencia; si el banco pide SCA se devuelve
 *      requiere_accion y NO se reintenta (sería un segundo cargo).
 *   5. QR: se pinta la URL del checkout (dinámico, con importe) o cualquier URL dada, sin gastar
 *      una llamada a la API. PNG válido y SVG vectorial.
 *   6. REFERENCIA GENÉRICA: el contrato acepta `referencia` y sigue aceptando `pedido_id` como
 *      alias; los eventos emiten los dos para no romper a los consumidores.
 *
 * Ejecutar: node tests/unit/pago-gateway-clientes-qr.test.js
 */

'use strict';

const assert = require('assert');
const PagoGateway = require('../../modules/pago-gateway/index.js');
const QR = require('../../modules/pago-gateway/qr.js');

let ok = 0;
const check = (nombre, fn) => Promise.resolve().then(fn)
  .then(() => { ok++; console.log('  ok  ' + nombre); })
  .catch((e) => { console.error('  KO  ' + nombre + '\n      ' + e.message); process.exitCode = 1; throw e; });

const logger = { info() {}, warn() {}, error() {} };
const metrics = { increment() {} };
const PROYECTO = { id: 'p-1', slug: 'the-pirate' };

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
    registro() { const c = disco.get('/pago/clientes.json'); return c ? JSON.parse(c) : null; },
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
  webhook_token: 'tk-secreto'
};

const cuerpo = (c) => (c.body ? JSON.parse(c.body) : null);
const llamadas = (calls, frag, method = null) => calls.filter(c => c.url.includes(frag) && (!method || c.method === method));

const CO_PENDIENTE = {
  id: 'co-1', status: 'PENDING', amount: 23.4, currency: 'EUR', checkout_reference: 'PED-1',
  hosted_checkout_url: 'https://checkout.sumup.com/pay/abc', valid_until: new Date(Date.now() + 15 * 60000).toISOString()
};

// ── 1. Clientes ──────────────────────────────────────────────
async function test_cliente_alta_idempotente() {
  await check('cliente: 409 → se LEE el que ya existe en vez de fallar (alta idempotente)', async () => {
    const calls = mockFetch((url, opts) => {
      if (url.includes('/v0.1/customers') && (opts.method || 'GET') === 'POST') return { status: 409, body: { error_code: 'CONFLICT' } };
      if (url.includes('/v0.1/customers/cust-1')) return { status: 200, body: { customer_id: 'cust-1', personal_details: { first_name: 'Ana' } } };
      return { status: 404, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoClienteAlta({ project_id: PROYECTO.id, customer_id: 'cust-1', alias: 'Ana del barrio' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.creado, false);
    assert.strictEqual(r.data.ya_existia, true);
    assert.strictEqual(llamadas(calls, '/v0.1/customers', 'POST').length, 1);
    // El registro del proyecto guarda el alias aunque SumUp no lo conozca.
    assert.strictEqual(bus.registro().clientes['cust-1'].alias, 'Ana del barrio');
  });
}

async function test_tarjetas_normalizadas() {
  await check('tarjetas: normaliza token/last4/mandato y marca si se puede cobrar sin el cliente', async () => {
    mockFetch(() => ({
      status: 200,
      body: [
        { token: 'tok-a', active: true, type: 'card', card: { last_4_digits: '3456', type: 'VISA' }, mandate: { type: 'recurrent', status: 'active', merchant_code: 'M1234567' }, created_at: '2026-01-01T00:00:00Z' },
        { token: 'tok-b', active: true, type: 'card', card: { last_4_digits: '9999', type: 'MASTERCARD' }, mandate: { type: 'recurrent', status: 'inactive' } },
        { token: 'tok-c', active: false, type: 'card', card: { last_4_digits: '1111', type: 'VISA' }, mandate: { type: 'recurrent', status: 'active' } }
      ]
    }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoClienteTarjetas({ project_id: PROYECTO.id, customer_id: 'cust-1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.total, 3);
    assert.strictEqual(r.data.cobrables, 1, 'solo la que está activa Y con mandato activo');
    const a = r.data.tarjetas.find(t => t.token === 'tok-a');
    assert.strictEqual(a.ultimos4, '3456');
    assert.strictEqual(a.marca, 'VISA');
    assert.strictEqual(a.mandato.estado, 'active');
    assert.strictEqual(r.data.tarjetas.find(t => t.token === 'tok-b').cobrable_sin_cliente, false);
    assert.strictEqual(r.data.tarjetas.find(t => t.token === 'tok-c').cobrable_sin_cliente, false);
    // El registro del proyecto queda con las tres (para reconocerlas sin llamar a SumUp).
    assert.strictEqual(Object.keys(bus.registro().clientes['cust-1'].tarjetas).length, 3);
  });
}

async function test_baja_tarjeta() {
  await check('tarjeta.baja: DELETE 204 → desactivada y marcada en el registro del proyecto', async () => {
    const calls = mockFetch(() => ({ status: 204, body: '' }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoClienteBajaTarjeta({ project_id: PROYECTO.id, customer_id: 'cust-1', token: 'tok-a' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.desactivada, true);
    const c = llamadas(calls, '/customers/cust-1/payment-instruments/tok-a', 'DELETE')[0];
    assert.ok(c, 'debe llamar al DELETE de la spec');
    assert.strictEqual(bus.registro().clientes['cust-1'].tarjetas['tok-a'].activa, false);
  });
}

// ── 2. Consentimiento (tokenización) ─────────────────────────
async function test_tokenizar() {
  await check('tokenizar: checkout SETUP_RECURRING_PAYMENT + customer_id y página del widget servida por el módulo', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/v0.1/customers') ) return { status: 201, body: { customer_id: 'cust-7' } };
      if (url.includes('/v0.1/checkouts')) return { status: 201, body: { ...CO_PENDIENTE, id: 'co-tok', purpose: 'SETUP_RECURRING_PAYMENT', customer_id: 'cust-7' } };
      return { status: 404, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoTokenizar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug, customer_id: 'cust-7' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const b = cuerpo(llamadas(calls, '/v0.1/checkouts', 'POST')[0]);
    assert.strictEqual(b.purpose, 'SETUP_RECURRING_PAYMENT');
    assert.strictEqual(b.customer_id, 'cust-7');
    assert.strictEqual(b.amount, 1, 'autorización mínima: se devuelve al instante');
    assert.ok(/^https:\/\/enki-ai\.online\/modules\/pago-gateway\/pago\/widget\/the-pirate\/co-tok\?t=tk-secreto$/.test(r.data.widget_url), r.data.widget_url);
    const e = bus.libro().checkouts['co-tok'];
    assert.strictEqual(e.canal, 'tokenizacion');
    assert.strictEqual(e.customer_id, 'cust-7');
  });
}

async function test_webhook_tokenizacion_no_es_cobro() {
  await check('webhook: PAID de un checkout de tokenización → pago.tokenizado (NO pago.confirmado) y guarda el token', async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        ...CO_PENDIENTE, id: 'co-tok', status: 'PAID', purpose: 'SETUP_RECURRING_PAYMENT', customer_id: 'cust-7',
        amount: 1, payment_instrument: { token: 'tok-guardada-1' },
        transactions: [{ id: 'tx-tok', status: 'SUCCESSFUL', amount: 1 }]
      }
    }));
    const { mod, bus } = await montar(CFG);
    // El consentimiento se abrió antes: el libro ya tiene el checkout como tokenización.
    await mod._ledgerPut(PROYECTO.id, {
      checkout_id: 'co-tok', referencia: 'cust-7', pedido_id: 'cust-7', canal: 'tokenizacion',
      customer_id: 'cust-7', monto_centimos: 100, moneda: 'EUR', estado: 'pendiente',
      purpose: 'SETUP_RECURRING_PAYMENT', creado: new Date().toISOString()
    });
    const res = { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    await mod.handleWebhook({ params: { project: 'the-pirate' }, query: { t: 'tk-secreto' }, _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'co-tok' }) }, res);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(bus.eventos('pago.tokenizado').length, 1, 'el consentimiento tiene su propio evento');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0, 'la autorización NO es un cobro');
    const ev = bus.eventos('pago.tokenizado')[0];
    assert.strictEqual(ev.customer_id, 'cust-7');
    assert.strictEqual(ev.payment_instrument_token, 'tok-guardada-1');
    assert.strictEqual(ev.autorizacion_devuelta, true);
    assert.strictEqual(bus.registro().clientes['cust-7'].tarjetas['tok-guardada-1'].mandato.estado, 'active');
    assert.strictEqual(bus.libro().checkouts['co-tok'].estado, 'tokenizado');
  });
}

// ── 3. Recurrencia real: cobrar con la guardada ──────────────
function fetchRecurrente({ estado = 'PAID', next = null } = {}) {
  return mockFetch((url, opts) => {
    const method = opts.method || 'GET';
    if (url.includes('/v0.1/checkouts') && method === 'POST') {
      return { status: 201, body: { id: 'co-g1', status: 'PENDING', amount: 23.4, currency: 'EUR', checkout_reference: 'SUS-1', customer_id: 'cust-1' } };
    }
    if (url.includes('/v0.1/checkouts/co-g1') && method === 'PUT') {
      return {
        status: 200,
        body: {
          id: 'co-g1', status: estado, currency: 'EUR', customer_id: 'cust-1',
          ...(next ? { next_step: next } : {}),
          ...(estado === 'PAID' ? { transactions: [{ id: 'tx-g1', status: 'SUCCESSFUL', amount: 23.4 }] } : {})
        }
      };
    }
    if (url.includes('/v0.1/checkouts/co-g1') && method === 'GET') {
      return { status: 200, body: { id: 'co-g1', status: 'PAID', amount: 23.4, currency: 'EUR', transactions: [{ id: 'tx-g1', status: 'SUCCESSFUL', amount: 23.4 }] } };
    }
    return { status: 404, body: {} };
  });
}

async function test_cobrar_guardada() {
  await check('cobrar_guardada: POST checkout + PUT {payment_type card, token, customer_id} → pago.confirmado canal guardada', async () => {
    const calls = fetchRecurrente();
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoCobrarGuardada({
      project_id: PROYECTO.id, project_slug: PROYECTO.slug,
      referencia: 'SUS-1', customer_id: 'cust-1', token: 'tok-a', monto_centimos: 2340
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.estado, 'confirmado');
    const put = llamadas(calls, '/v0.1/checkouts/co-g1', 'PUT')[0];
    assert.ok(put, 'el cobro con token va por PUT /v0.1/checkouts/{id} (ProcessCheckout)');
    assert.deepStrictEqual(cuerpo(put), { payment_type: 'card', token: 'tok-a', customer_id: 'cust-1' });
    const post = cuerpo(llamadas(calls, '/v0.1/checkouts', 'POST')[0]);
    assert.strictEqual(post.customer_id, 'cust-1');
    assert.strictEqual(post.checkout_reference, 'SUS-1');
    const ev = bus.eventos('pago.confirmado');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].canal, 'guardada');
    assert.strictEqual(ev[0].referencia, 'SUS-1');
    assert.strictEqual(bus.libro().checkouts['co-g1'].estado, 'confirmado');
  });
}

async function test_cobrar_guardada_idempotente() {
  await check('cobrar_guardada: si esa referencia YA está cobrada → 409 sin tocar la API (no hay segundo cargo)', async () => {
    const calls = fetchRecurrente();
    const { mod } = await montar(CFG);
    const d = { project_id: PROYECTO.id, referencia: 'SUS-1', customer_id: 'cust-1', token: 'tok-a', monto_centimos: 2340 };
    const a = await mod.handlePagoCobrarGuardada(d);
    assert.strictEqual(a.status, 200);
    const n = calls.length;
    const b = await mod.handlePagoCobrarGuardada(d);
    assert.strictEqual(b.status, 409);
    assert.strictEqual(b.error.code, 'YA_PAGADO');
    assert.strictEqual(calls.length, n, 'no se llama a SumUp para un cobro ya hecho');
  });
}

async function test_cobrar_guardada_sca() {
  await check('cobrar_guardada: si el banco pide SCA → requiere_accion y el reintento se BLOQUEA', async () => {
    const calls = fetchRecurrente({ estado: 'PENDING', next: { type: 'THREE_DS', url: 'https://3ds.sumup.test/challenge' } });
    const { mod, bus } = await montar(CFG);
    const d = { project_id: PROYECTO.id, referencia: 'SUS-2', customer_id: 'cust-1', token: 'tok-a', monto_centimos: 5000 };
    const a = await mod.handlePagoCobrarGuardada(d);
    assert.strictEqual(a.status, 200, JSON.stringify(a));
    assert.strictEqual(a.data.estado, 'requiere_accion');
    assert.strictEqual(a.data.requiere_accion.url, 'https://3ds.sumup.test/challenge');
    assert.strictEqual(bus.libro().checkouts['co-g1'].estado, 'requiere_accion');
    const n = calls.length;
    const b = await mod.handlePagoCobrarGuardada(d);
    assert.strictEqual(b.status, 409);
    assert.strictEqual(b.error.code, 'REQUIERE_ACCION');
    assert.strictEqual(calls.length, n, 'reintentar aquí sería el segundo cargo');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
  });
}

// ── 4. QR ────────────────────────────────────────────────────
async function test_qr_con_importe() {
  await check('qr: crea (o reusa) el checkout del hecho y devuelve PNG + SVG de SU url', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { ...CO_PENDIENTE, id: 'co-qr', checkout_reference: 'PED-QR', hosted_checkout_url: 'https://checkout.sumup.com/pay/qr-uuid' } }));
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoQr({ project_id: PROYECTO.id, referencia: 'PED-QR', monto_centimos: 1990, formato: 'ambos' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.url, 'https://checkout.sumup.com/pay/qr-uuid');
    assert.strictEqual(r.data.checkout_id, 'co-qr');
    assert.ok(r.data.qr.png_base64 && r.data.qr.svg && r.data.qr.svg_data_uri);
    assert.ok(/^data:image\/png;base64,/.test(r.data.qr.png_data_uri));
    // PNG de verdad: firma + IHDR con el tamaño que toca.
    const png = Buffer.from(r.data.qr.png_base64, 'base64');
    assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const dim = (r.data.qr.modulos + 8) * 8;
    assert.strictEqual(png.readUInt32BE(16), dim);
    assert.strictEqual(png.readUInt32BE(20), dim);
    assert.strictEqual(llamadas(calls, '/v0.1/checkouts', 'POST').length, 1, 'un solo checkout para el QR');
  });
}

async function test_qr_con_url() {
  await check('qr: con url dada NO gasta ninguna llamada a la API (pintar no cobra)', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoQr({ url: 'https://enki-ai.online/a/carta/the-pirate/', formato: 'svg', escala: 6, borde: 2 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(calls.length, 0);
    assert.ok(/^<svg /.test(r.data.qr.svg));
    const dim = (r.data.qr.modulos + 4) * 6;
    assert.ok(r.data.qr.svg.includes(`viewBox="0 0 ${dim} ${dim}"`), 'la escala y el margen se respetan');
  });
}

async function test_qr_roundtrip() {
  await check('qr: el codificador nativo aguanta URLs largas y UTF-8 (versión y módulos coherentes)', async () => {
    const largo = 'https://checkout.sumup.com/pay/4e425463-3e1b-431d-83fa-1e51c2925e99?ref=' + 'X'.repeat(60);
    const q1 = QR.encode(largo, { ecl: 'M' });
    assert.ok(q1.version >= 5 && q1.version <= 20, 'versión ' + q1.version);
    assert.strictEqual(q1.size, q1.version * 4 + 17);
    // El módulo (0,0) es el finder: oscuro. Y hay tres finders en las esquinas.
    assert.strictEqual(q1.modules[0][0], true);
    assert.strictEqual(q1.modules[0][q1.size - 1], true);
    assert.strictEqual(q1.modules[q1.size - 1][0], true);
    // Determinista: el mismo texto da la misma matriz.
    assert.deepStrictEqual(QR.encode(largo, { ecl: 'M' }).modules, q1.modules);
    const q2 = QR.encode('ñandú € 25,90 — pedido', { ecl: 'M' });
    assert.ok(q2.size >= 21);
  });
}

// ── 5. Referencia genérica ───────────────────────────────────
async function test_referencia_generica() {
  await check('contrato: pago.iniciar acepta `referencia` (sin pedido_id) y el libro guarda los dos nombres', async () => {
    mockFetch(() => ({ status: 201, body: { ...CO_PENDIENTE, id: 'co-ref', checkout_reference: 'PRES-2026-7' } }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoIniciar({ project_id: PROYECTO.id, referencia: 'PRES-2026-7', monto_centimos: 12000, concepto: 'Presupuesto taller' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const e = bus.libro().checkouts['co-ref'];
    assert.strictEqual(e.referencia, 'PRES-2026-7');
    assert.strictEqual(e.pedido_id, 'PRES-2026-7', 'el alias se rellena solo');
    assert.strictEqual(e.canal, 'online');
  });
}

async function test_alias_pedido_id_sigue_vivo() {
  await check('compat: pedido_id sigue funcionando y pago.confirmado emite referencia + pedido_id', async () => {
    mockFetch((url) => {
      if (url.includes('/v0.1/checkouts?checkout_reference=')) return { status: 200, body: [{ ...CO_PENDIENTE, id: 'co-old', checkout_reference: 'PED-OLD' }] };
      return { status: 201, body: { ...CO_PENDIENTE, id: 'co-old', checkout_reference: 'PED-OLD' } };
    });
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoIniciar({ project_id: PROYECTO.id, pedido_id: 'PED-OLD', monto_centimos: 2340 });
    assert.strictEqual(r.status, 200, JSON.stringify(r), 'los consumidores viejos no se rompen');
    // Y la confirmación trae los dos nombres.
    mockFetch(() => ({ status: 200, body: { id: 'co-old', status: 'PAID', amount: 23.4, currency: 'EUR', checkout_reference: 'PED-OLD', transactions: [{ id: 'tx-1', status: 'SUCCESSFUL', amount: 23.4 }] } }));
    const res = { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    await mod.handleWebhook({ params: { project: 'the-pirate' }, query: { t: 'tk-secreto' }, _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'co-old' }) }, res);
    const ev = bus.eventos('pago.confirmado')[0];
    assert.ok(ev, 'debe confirmar');
    assert.strictEqual(ev.referencia, 'PED-OLD');
    assert.strictEqual(ev.pedido_id, 'PED-OLD');
    assert.strictEqual(ev.canal, 'online');
  });
}

// ─────────────────────────────────────────────────────────────
(async () => {
  await test_cliente_alta_idempotente();
  await test_tarjetas_normalizadas();
  await test_baja_tarjeta();
  await test_tokenizar();
  await test_webhook_tokenizacion_no_es_cobro();
  await test_cobrar_guardada();
  await test_cobrar_guardada_idempotente();
  await test_cobrar_guardada_sca();
  await test_qr_con_importe();
  await test_qr_con_url();
  await test_qr_roundtrip();
  await test_referencia_generica();
  await test_alias_pedido_id_sigue_vivo();
  console.log(`\n${ok} checks ok`);
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
})();
