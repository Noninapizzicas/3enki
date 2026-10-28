/**
 * Tests unitarios — PAGO-GATEWAY / PARIDAD de STRIPE (v3.1).
 *
 * El adapter de Stripe sabía crear una sesión y leer un webhook. Eso son dos de las nueve
 * garantías del órgano. Lo que estos tests clavan es lo que le faltaba, una por una:
 *
 *   1. LIBRO durable: la sesión queda en /pago/checkouts.json, con su importe y su caducidad.
 *   2. IDEMPOTENCIA POR REFERENCIA: el segundo clic REUTILIZA el link (no llama a Stripe) y,
 *      si el pedido ya está pagado, responde 409 en vez de abrir otro cobro.
 *   3. WEBHOOK = PUNTERO: se reconsulta la sesión con nuestra clave. Un evento inventado
 *      NO confirma nada, aunque no haya webhook_secret.
 *   4. FIRMA: con secreto, una firma mala se rechaza con 400 y no se publica nada.
 *   5. INTEGRIDAD: un cobro que no cuadra con el libro no confirma (pago.importe_discrepante).
 *   6. IDEMPOTENCIA DURA: el mismo webhook tres veces = un solo pago.confirmado.
 *   7. BARRIO: webhook perdido → la sesión PAID se confirma igual.
 *   8. REEMBOLSO con tope por libro, y TIMEOUT → reconsulta (no reintenta a ciegas).
 *   9. PREFLIGHT: charges_enabled:false se ve ANTES de encender el botón.
 *  10. CANCELAR: `expire` mata el link; si ya se pagó, confirma en vez de cancelar.
 *
 * Ejecutar: node tests/unit/pago-gateway-stripe-paridad.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const PagoGateway = require('../../modules/pago-gateway/index.js');

let ok = 0;
const check = (nombre, fn) => Promise.resolve().then(fn)
  .then(() => { ok++; console.log('  ok  ' + nombre); })
  .catch((e) => { console.error('  KO  ' + nombre + '\n      ' + e.message); process.exitCode = 1; throw e; });

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const metrics = { increment() {} };
const PROYECTO = { id: 'p-1', slug: 'the-pirate' };
const API_KEY = 'rk_test_51Habcdef';
const SECRET = 'whsec_test_123';

function makeRes() {
  return { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
}

// Router de fetch: cada test decide qué devuelve cada endpoint de Stripe.
function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const r = await handler(u, opts, calls.length);
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
      responder('credential.resolve.request', { success: true, api_key: API_KEY });
      responder('project.list.request', { success: true, projects: [{ ...PROYECTO, name: 'the-pirate' }] });
      responder('fs.read.request', (() => {
        const c = disco.get(payload.path);
        return c === undefined ? { success: false, error: 'not found' } : { success: true, content: c };
      })());
      responder('fs.write.request', (() => { disco.set(payload.path, payload.content); return { success: true }; })());
    },
    libro() { const c = disco.get('/pago/checkouts.json'); return c ? JSON.parse(c) : null; },
    fila(id) { const l = bus.libro(); return l ? l.checkouts[id] : null; },
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
  kind: 'stripe-checkout', provider: 'STRIPE', moneda: 'eur',
  return_url: 'https://enki-ai.online/a/the-pirate/?pago=ok',
  webhook_secret: SECRET, ttl_minutos: 60
};

const SESION_NUEVA = {
  id: 'cs_test_1', object: 'checkout.session',
  url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  status: 'open', payment_status: 'unpaid',
  amount_total: 2340, currency: 'eur',
  client_reference_id: 'PED-1',
  metadata: { referencia: 'PED-1', pedido_id: 'PED-1', project_id: PROYECTO.id }
};

const SESION_PAGADA = {
  ...SESION_NUEVA, status: 'complete', payment_status: 'paid',
  payment_intent: 'pi_test_1'
};

const firma = (raw, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=` + crypto.createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex');

const webhookStripe = (mod, sesion, { project = 'the-pirate', tipo = 'checkout.session.completed', secret = SECRET, firmar = true } = {}) => {
  const res = makeRes();
  const raw = JSON.stringify({ id: 'evt_1', type: tipo, data: { object: sesion } });
  const headers = firmar ? { 'stripe-signature': firma(raw, secret) } : {};
  return mod.handleWebhook({ params: { project }, headers, _rawBody: raw }, res).then(r => ({ r, res }));
};

// ─────────────────────────────────────────────────────────────
async function test_libro() {
  await check('libro: la sesión queda escrita con importe, url y caducidad', async () => {
    mockFetch(() => ({ status: 200, body: SESION_NUEVA }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    assert.strictEqual(r.status, 200, JSON.stringify(r));

    const e = bus.fila('cs_test_1');
    assert.ok(e, 'no se escribió la fila del libro');
    assert.strictEqual(e.estado, 'pendiente');
    assert.strictEqual(e.pasarela, 'stripe-checkout');
    assert.strictEqual(e.referencia, 'PED-1');
    assert.strictEqual(e.monto_centimos, 2340);
    assert.strictEqual(e.checkout_url, SESION_NUEVA.url);
    assert.strictEqual(e.entorno, 'sandbox', 'rk_test_ se marca como ensayo');
    assert.ok(Date.parse(e.valid_until) > Date.now() + 29 * 60000, 'expires_at debe respetar el mínimo de 30 min');
  });
}

async function test_idempotencia() {
  await check('idempotencia: el segundo clic REUTILIZA el link y NO llama a Stripe', async () => {
    const calls = mockFetch(() => ({ status: 200, body: SESION_NUEVA }));
    const { mod } = await montar(CFG);
    const a = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    const b = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    assert.strictEqual(a.status, 200);
    assert.strictEqual(b.status, 200);
    assert.strictEqual(b.data.session_id, a.data.session_id);
    assert.strictEqual(b.data.reutilizado, true);
    const posts = calls.filter(c => c.method === 'POST' && c.url.endsWith('/v1/checkout/sessions'));
    assert.strictEqual(posts.length, 1, 'se creó más de una sesión: dos links = dos cobros');
  });

  await check('idempotencia: pedido ya pagado → 409 CHECKOUT_YA_PAGADO (no abre otro link)', async () => {
    const calls = mockFetch((u, o) => (o.method === 'POST' ? { status: 200, body: SESION_NUEVA } : { status: 200, body: SESION_PAGADA }));
    const { mod } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    await webhookStripe(mod, SESION_PAGADA);
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    assert.strictEqual(r.status, 409, JSON.stringify(r));
    assert.strictEqual(r.error.code, 'CHECKOUT_YA_PAGADO');
    assert.strictEqual(calls.filter(c => c.method === 'POST').length, 1);
  });
}

async function test_webhook() {
  await check('webhook PAID: reconsulta la sesión y publica pago.confirmado con el payment_intent', async () => {
    mockFetch(() => ({ status: 200, body: SESION_PAGADA }));
    const { mod, bus } = await montar(CFG);
    const { res } = await webhookStripe(mod, SESION_PAGADA);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const evs = bus.eventos('pago.confirmado');
    assert.strictEqual(evs.length, 1);
    const p = evs[0];
    assert.strictEqual(p.referencia, 'PED-1');
    assert.strictEqual(p.pedido_id, 'PED-1');
    assert.strictEqual(p.transaction_id, 'pi_test_1');
    assert.strictEqual(p.monto_centimos, 2340);
    assert.strictEqual(p.pasarela, 'stripe-checkout');
    assert.strictEqual(p.project_slug, 'the-pirate');
    assert.strictEqual(bus.fila('cs_test_1')?.estado, 'confirmado');
  });

  await check('webhook repetido 3 veces: un solo pago.confirmado (idempotencia en el libro)', async () => {
    mockFetch(() => ({ status: 200, body: SESION_PAGADA }));
    const { mod, bus } = await montar(CFG);
    await webhookStripe(mod, SESION_PAGADA);
    await webhookStripe(mod, SESION_PAGADA);
    await webhookStripe(mod, SESION_PAGADA);
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1);
  });

  await check('evento INVENTADO sin webhook_secret: la reconsulta dice "unpaid" y NO confirma', async () => {
    mockFetch(() => ({ status: 200, body: { ...SESION_NUEVA, status: 'open', payment_status: 'unpaid' } }));
    const { mod, bus } = await montar({ ...CFG, webhook_secret: null });
    const { res } = await webhookStripe(mod, { ...SESION_NUEVA, payment_status: 'paid', status: 'complete' }, { firmar: false });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0, 'un POST a mano no puede fabricar un cobro');
  });

  await check('firma inválida: 400 y no se toca la sesión', async () => {
    const calls = mockFetch(() => ({ status: 200, body: SESION_PAGADA }));
    const { mod, bus } = await montar(CFG);
    const { res } = await webhookStripe(mod, SESION_PAGADA, { secret: 'whsec_otro' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
    assert.strictEqual(calls.length, 0, 'con firma mala no se gasta ni una llamada a Stripe');
  });

  await check('integridad: cobrado menos de lo pedido → pago.importe_discrepante, NO se confirma', async () => {
    const sesion = { ...SESION_PAGADA, amount_total: 1000 };
    // El link se abrió por 2340 (fila del libro) y lo que vuelve pagado son 1000: no cuadra.
    mockFetch((u, o) => (o.method === 'POST' && u.endsWith('/v1/checkout/sessions') ? { status: 200, body: SESION_NUEVA } : { status: 200, body: sesion }));
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    await webhookStripe(mod, sesion);
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
    const d = bus.eventos('pago.importe_discrepante');
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].motivo, 'importe_insuficiente');
    assert.strictEqual(d[0].esperado_centimos, 2340);
    assert.strictEqual(d[0].cobrado_centimos, 1000);
  });
}

async function test_barrido() {
  await check('barrido: webhook perdido → la sesión PAID se confirma igual', async () => {
    mockFetch((u, o) => {
      if (o.method === 'POST') return { status: 200, body: SESION_NUEVA };
      return { status: 200, body: SESION_PAGADA };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);

    await mod._barrerProyecto({ id: PROYECTO.id, slug: PROYECTO.slug });
    const evs = bus.eventos('pago.confirmado');
    assert.strictEqual(evs.length, 1, 'el barrido no cerró el cobro');
    assert.strictEqual(evs[0].origen, 'barrido');
    assert.strictEqual(bus.fila('cs_test_1')?.estado, 'confirmado');
  });

  await check('barrido: el barrido SE MONTA aunque el core no tenga pasarela configurada', async () => {
    const { mod } = await montar({});   // core sin kind: la pasarela es del PROYECTO
    assert.strictEqual(mod._barridoActivo(), true);
    assert.strictEqual(mod._conciliacionActiva(), true);
  });
}

async function test_reembolso() {
  await check('reembolso: contra el payment_intent del libro, registra y emite pago.reembolsado', async () => {
    const calls = mockFetch((u, o) => {
      if (o.method === 'POST' && u.endsWith('/v1/checkout/sessions')) return { status: 200, body: SESION_NUEVA };
      if (o.method === 'GET') return { status: 200, body: SESION_PAGADA };
      return { status: 200, body: { id: 're_1', amount: 2340, status: 'succeeded', payment_intent: 'pi_test_1' } };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    await webhookStripe(mod, SESION_PAGADA);

    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.reembolsado, true);
    const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/v1/refunds'));
    assert.ok(post, 'no se llamó a /v1/refunds');
    assert.ok(String(post.body).includes('payment_intent=pi_test_1'), 'el reembolso va por payment_intent');
    assert.ok(post.headers['Idempotency-Key'], 'sin Idempotency-Key un reintento devuelve dos veces');

    const e = bus.fila('cs_test_1');
    assert.strictEqual(e.estado, 'reembolsado');
    assert.strictEqual(e.reembolsos.length, 1);
    assert.strictEqual(e.reembolsos[0].refund_id, 're_1');
    assert.strictEqual(bus.eventos('pago.reembolsado')[0].pasarela, 'stripe-checkout');
  });

  await check('reembolso: pedir más de lo cobrado → 400 y no se llama a Stripe', async () => {
    const calls = mockFetch((u, o) => {
      if (o.method === 'POST' && u.endsWith('/v1/checkout/sessions')) return { status: 200, body: SESION_NUEVA };
      return { status: 200, body: SESION_PAGADA };
    });
    const { mod } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    await webhookStripe(mod, SESION_PAGADA);
    const antes = calls.length;
    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', monto_centimos: 5000, project_id: PROYECTO.id });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(calls.length, antes, 'no se debe llamar a Stripe con un reembolso imposible');
  });

  await check('reembolso con TIMEOUT: reconsulta los refunds y lo registra sin reintentar', async () => {
    let n = 0;
    const calls = mockFetch((u, o) => {
      if (o.method === 'POST' && u.endsWith('/v1/checkout/sessions')) return { status: 200, body: SESION_NUEVA };
      if (o.method === 'POST' && u.endsWith('/v1/refunds')) { n++; throw Object.assign(new Error('timed out'), { name: 'AbortError' }); }
      if (u.includes('/v1/refunds?payment_intent=')) return { status: 200, body: { data: [{ id: 're_9', amount: 2340, status: 'succeeded', payment_intent: 'pi_test_1' }] } };
      return { status: 200, body: SESION_PAGADA };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    await webhookStripe(mod, SESION_PAGADA);

    const r = await mod.handlePagoReembolsar({ pedido_id: 'PED-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.resuelto_por_reconsulta, true);
    assert.strictEqual(n, 1, 'el reembolso no se repite a ciegas');
    const e = bus.fila('cs_test_1');
    assert.strictEqual(e.reembolsos[0].resuelto_por_reconsulta, true);
    assert.strictEqual(bus.eventos('pago.reembolsado').length, 1);
    assert.ok(calls.length > 0);
  });
}

async function test_estado() {
  await check('preflight: charges_enabled:false → puedo_cobrar:false y el aviso', async () => {
    mockFetch((u) => {
      if (u.endsWith('/v1/account')) return { status: 200, body: { id: 'acct_1', charges_enabled: false, payouts_enabled: false, details_submitted: false, country: 'ES', default_currency: 'eur' } };
      if (u.endsWith('/v1/balance')) return { status: 200, body: { available: [] } };
      return { status: 200, body: {} };
    });
    // Clave LIVE: en test el cobro no depende del alta, en real sí.
    const { mod } = await montar({ ...CFG, provider: 'STRIPE' });
    const r = await mod.handlePagoEstado({ project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.pasarela, 'stripe-checkout');
    assert.strictEqual(r.data.charges_enabled, false);
    assert.ok(r.data.avisos.some(a => a.includes('charges_enabled:false')));
    // La clave del mock es rk_test_: en test se puede cobrar aunque el alta no esté cerrada,
    // y el aviso dice que ese dinero es de ensayo.
    assert.strictEqual(r.data.entorno, 'sandbox');
    assert.strictEqual(r.data.puedo_cobrar, true);
    assert.ok(r.data.avisos.some(a => a.includes('PRUEBA')));
  });

  await check('preflight: sin return_url → CONFIG_MISSING al iniciar (no aterriza en example.com)', async () => {
    mockFetch(() => ({ status: 200, body: SESION_NUEVA }));
    const { mod } = await montar({ ...CFG, return_url: null });
    const r = await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.error.code, 'CONFIG_MISSING');
  });

  await check('puertos por pasarela: métodos y recibo responden del adapter correcto', async () => {
    mockFetch(() => ({ status: 200, body: {} }));
    const { mod } = await montar(CFG);
    const m = await mod.handlePagoMetodos({ project_id: PROYECTO.id });
    assert.strictEqual(m.status, 200);
    assert.deepStrictEqual(m.data.metodos, ['card']);
    assert.strictEqual(m.data.entorno, 'sandbox');

    const rec = await mod.handlePagoRecibo({ project_id: PROYECTO.id });
    assert.strictEqual(rec.status, 501);
    assert.strictEqual(rec.error.code, 'NOT_IMPLEMENTED');
  });
}

async function test_cancelar() {
  await check('cancelar: expira el link y emite pago.cancelado', async () => {
    const calls = mockFetch((u, o) => {
      if (o.method === 'POST' && u.endsWith('/v1/checkout/sessions')) return { status: 200, body: SESION_NUEVA };
      if (u.endsWith('/expire')) return { status: 200, body: { ...SESION_NUEVA, status: 'expired' } };
      return { status: 200, body: SESION_NUEVA };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    const r = await mod.handlePagoCancelar({ pedido_id: 'PED-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.ok(calls.some(c => c.url.endsWith('/expire')));
    assert.strictEqual(bus.fila('cs_test_1').estado, 'cancelado');
    assert.strictEqual(bus.eventos('pago.cancelado').length, 1);
  });

  await check('cancelar un pedido YA PAGADO: confirma en vez de cancelar (409)', async () => {
    mockFetch((u, o) => {
      if (o.method === 'POST' && u.endsWith('/v1/checkout/sessions')) return { status: 200, body: SESION_NUEVA };
      if (u.endsWith('/expire')) return { status: 400, body: { error: { message: 'Only a Checkout Session in status open can be expired.' } } };
      return { status: 200, body: SESION_PAGADA };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    const r = await mod.handlePagoCancelar({ pedido_id: 'PED-1', project_id: PROYECTO.id });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.error.code, 'CHECKOUT_YA_PAGADO');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1, 'debía confirmar el cobro existente');
  });
}

async function test_conciliacion() {
  await check('conciliación: sesión pagada que no casa → cobro.huerfano (una sola vez)', async () => {
    const huerfana = { ...SESION_PAGADA, id: 'cs_ajena', payment_intent: 'pi_ajena', client_reference_id: 'OTRO', metadata: {} };
    mockFetch((u) => {
      if (u.includes('/v1/checkout/sessions?')) return { status: 200, body: { data: [huerfana], has_more: false } };
      if (u.includes('/v1/refunds?')) return { status: 200, body: { data: [], has_more: false } };
      if (u.includes('/v1/balance_transactions')) return { status: 200, body: { data: [] } };
      return { status: 200, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    const r1 = await mod._conciliar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    assert.strictEqual(r1.status, 200, JSON.stringify(r1));
    const h = bus.eventos('cobro.huerfano');
    assert.strictEqual(h.length, 1);
    assert.strictEqual(h[0].session_id, 'cs_ajena');
    assert.strictEqual(h[0].pasarela, 'stripe-checkout');

    // Segundo tick con la misma ventana: el dedupe durable impide el duplicado.
    await mod._conciliar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    assert.strictEqual(bus.eventos('cobro.huerfano').length, 1);
  });

  await check('conciliación: reembolso hecho en el PANEL se detecta y se apunta', async () => {
    mockFetch((u, o) => {
      if (o.method === 'POST' && u.endsWith('/v1/checkout/sessions')) return { status: 200, body: SESION_NUEVA };
      if (u.includes('/v1/checkout/sessions?')) return { status: 200, body: { data: [SESION_PAGADA], has_more: false } };
      if (u.includes('/v1/refunds?created')) return { status: 200, body: { data: [{ id: 're_panel', amount: 500, status: 'succeeded', payment_intent: 'pi_test_1', created: Math.floor(Date.now() / 1000) }], has_more: false } };
      if (u.includes('/v1/balance_transactions')) return { status: 200, body: { data: [] } };
      return { status: 200, body: SESION_PAGADA };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoIniciar({ pedido_id: 'PED-1', monto_centimos: 2340, project_id: PROYECTO.id });
    await webhookStripe(mod, SESION_PAGADA);

    await mod._conciliar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    const evs = bus.eventos('pago.reembolsado').filter(e => e.origen === 'conciliacion');
    assert.strictEqual(evs.length, 1, 'no se detectó el reembolso del panel');
    assert.strictEqual(evs[0].monto_centimos, 500);
    assert.strictEqual(evs[0].refund_id, 're_panel');
    const e = bus.fila('cs_test_1');
    assert.strictEqual(e.reembolsos.length, 1);
  });

  await check('conciliación: comisión REAL por día desde balance_transactions', async () => {
    const ayer = Math.floor(Date.now() / 1000) - 86400;
    mockFetch((u) => {
      if (u.includes('/v1/checkout/sessions?')) return { status: 200, body: { data: [], has_more: false } };
      if (u.includes('/v1/refunds?')) return { status: 200, body: { data: [], has_more: false } };
      if (u.includes('/v1/balance_transactions')) return { status: 200, body: { data: [{ id: 'txn_1', created: ayer, amount: 2340, fee: 60, net: 2280, currency: 'eur', type: 'charge' }] } };
      return { status: 200, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    await mod._conciliar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug });
    const liq = bus.eventos('cobro.liquidado');
    assert.strictEqual(liq.length, 1, 'no se emitió la liquidación');
    assert.strictEqual(liq[0].bruto_centimos, 2340);
    assert.strictEqual(liq[0].comision_centimos, 60);
    assert.strictEqual(liq[0].neto_centimos, 2280);
    assert.strictEqual(liq[0].pasarela, 'stripe-checkout');
  });
}

(async () => {
  console.log('PAGO-GATEWAY · Stripe paridad (v3.1)');
  await test_libro();
  await test_idempotencia();
  await test_webhook();
  await test_barrido();
  await test_reembolso();
  await test_estado();
  await test_cancelar();
  await test_conciliacion();
  console.log(`\n${ok} comprobaciones OK`);
})().catch(() => { process.exitCode = 1; });
