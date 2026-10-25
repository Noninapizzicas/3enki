/**
 * Tests unitarios — pago-gateway como ÓRGANO DE PLATAFORMA (v2.0, multi-proyecto).
 *
 * La tesis que estos tests clavan: el MISMO módulo cobra para negocios distintos
 * sin tocar una línea de código — solo config (pago.config.escribir) + credencial
 * por proyecto. Y sin fugas entre negocios:
 *
 *   1. Cada proyecto tiene su merchant_code y su clave (SUMUP_API_KEY_PROJECT_<id>).
 *   2. Cada proyecto tiene su libro de cobros (/pago/checkouts.json en SU storage).
 *   3. Un proyecto SIN config propia NO hereda la cuenta de otro (NO_PASARELA).
 *   4. El webhook del proyecto B rechaza el token del proyecto A y verifica con SU clave.
 *   5. pago.config.leer no devuelve secretos (la api_key vive en credential-manager).
 *   6. La config se puede cambiar en caliente: pago.config.actualizada invalida la caché.
 *
 * Ejecutar: node tests/unit/pago-gateway-multiproyecto.test.js
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

const A = { id: 'p-uno', slug: 'the-pirate' };
const B = { id: 'p-dos', slug: 'despacho-pan' };
const C = { id: 'p-tres', slug: 'sin-config' };
const CLAVES = { 'p-uno': 'sup_key_uno', 'p-dos': 'sup_key_dos' };

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const h = opts.headers || {};
    calls.push({ url: String(url), method: opts.method || 'GET', headers: h, body: opts.body });
    const r = await handler(String(url), opts, calls.length);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})) };
  };
  return calls;
}

// Bus falso: fs POR PROYECTO (discos separados) y credencial POR PROYECTO.
function makeBus() {
  const subs = new Map();
  const discos = new Map();   // project_id → Map(path → contenido)
  const discoDe = (pid) => { if (!discos.has(pid)) discos.set(pid, new Map()); return discos.get(pid); };

  const responder = (nombre, cuerpoFn) => {
    for (const fn of [...(subs.get(nombre) || [])]) fn({ data: cuerpoFn() });
  };

  const bus = {
    published: [],
    discos,
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, new Set());
      subs.get(ev).add(fn);
      return () => subs.get(ev)?.delete(fn);
    },
    publish(ev, payload) {
      bus.published.push([ev, payload]);
      for (const fn of [...(subs.get(ev) || [])]) fn({ data: payload, ...payload });

      if (ev === 'credential.resolve.request') {
        const clave = CLAVES[payload.project_id] || null;
        setImmediate(() => responder('credential.resolve.response', () => ({
          request_id: payload.request_id,
          success: !!clave, api_key: clave, resolved_from: clave ? 'PROJECT' : null,
          ...(clave ? {} : { error: `sin credencial para provider '${payload.provider}' en ${payload.project_id}` })
        })));
        return;
      }
      if (ev === 'project.list.request') {
        setImmediate(() => responder('project.list.response', () => ({ request_id: payload.request_id, success: true, projects: [A, B, C] })));
        return;
      }
      if (ev === 'fs.read.request') {
        const c = discoDe(payload.project_id || '_').get(payload.path);
        setImmediate(() => responder('fs.read.response', () => ({
          request_id: payload.request_id,
          ...(c === undefined ? { success: false, error: 'not found' } : { success: true, content: c })
        })));
        return;
      }
      if (ev === 'fs.write.request') {
        discoDe(payload.project_id || '_').set(payload.path, payload.content);
        setImmediate(() => responder('fs.write.response', () => ({ request_id: payload.request_id, success: true })));
        return;
      }
    },
    fs(pid, path) { return discoDe(pid).get(path); },
    libro(pid) { const c = discoDe(pid).get('/pago/checkouts.json'); return c ? JSON.parse(c) : null; },
    eventos(ev) { return bus.published.filter(([e]) => e === ev).map(([, p]) => p); }
  };
  return bus;
}

async function montar() {
  const mod = new PagoGateway();
  const bus = makeBus();
  // El core NO tiene cuenta: solo defaults de comportamiento. Cada negocio trae la suya.
  await mod.onLoad({ logger, eventBus: bus, metrics, moduleConfig: { pasarela: { moneda: 'eur', ttl_minutos: 15, min_centimos: 100 } } });
  return { mod, bus };
}

const CO = (ref) => ({
  id: 'co-' + ref, status: 'PENDING', amount: 20, currency: 'EUR', checkout_reference: ref,
  hosted_checkout_url: 'https://checkout.sumup.com/pay/' + ref,
  valid_until: new Date(Date.now() + 15 * 60000).toISOString()
});

const sumupOk = () => mockFetch((url, opts) => {
  if (opts.method === 'POST') {
    const b = JSON.parse(opts.body || '{}');
    return { status: 201, body: CO(b.checkout_reference || 'x') };
  }
  return { status: 200, body: CO('x') };
});

async function main() {
  console.log('\npago-gateway · multi-proyecto (v2.0)\n');

  const { mod, bus } = await montar();

  await check('config: cada negocio escribe SU cuenta (dos merchant, dos webhooks)', async () => {
    const ra = await mod.handlePagoConfigEscribir({
      project_id: A.id,
      pasarela: { kind: 'sumup-checkout', provider: 'SUMUP', merchant_code: 'M111UNO', webhook_token: 'tok-uno', webhook_url: 'https://x/modules/pago-gateway/pago/webhook/the-pirate' }
    });
    const rb = await mod.handlePagoConfigEscribir({
      project_id: B.id,
      pasarela: { kind: 'sumup-checkout', provider: 'SUMUP', merchant_code: 'M222DOS', webhook_token: 'tok-dos', webhook_url: 'https://x/modules/pago-gateway/pago/webhook/despacho-pan' }
    });
    assert.strictEqual(ra.status, 200, JSON.stringify(ra));
    assert.strictEqual(rb.status, 200, JSON.stringify(rb));
    const cfgA = JSON.parse(bus.fs(A.id, '/pago/config.json'));
    const cfgB = JSON.parse(bus.fs(B.id, '/pago/config.json'));
    assert.strictEqual(cfgA.pasarela.merchant_code, 'M111UNO');
    assert.strictEqual(cfgB.pasarela.merchant_code, 'M222DOS');
    assert.strictEqual(bus.eventos('pago.config.actualizada').length, 2);
  });

  await check('config: kind inventado → 400 (no se escribe basura)', async () => {
    const r = await mod.handlePagoConfigEscribir({ project_id: A.id, pasarela: { kind: 'paypal-magic' } });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
  });

  await check('config: leer no devuelve la api_key ni el token en claro', async () => {
    const r = await mod.handlePagoConfigLeer({ project_id: B.id });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.pasarela.merchant_code, 'M222DOS');
    assert.strictEqual(r.data.pasarela.tiene_webhook_token, true);
    assert.ok(!('webhook_token' in r.data.pasarela), 'el token no se publica');
    assert.ok(!('api_key' in r.data.pasarela), 'la clave nunca está aquí');
    assert.strictEqual(r.data.fuente, 'proyecto');
  });

  await check('cobro: el proyecto A cobra con SU merchant y SU clave', async () => {
    const calls = sumupOk();
    const r = await mod.handlePagoIniciar({ project_id: A.id, pedido_id: 'PED-A', monto_centimos: 2000 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const post = calls.find(c => c.method === 'POST');
    assert.strictEqual(post.headers.Authorization, 'Bearer sup_key_uno');
    assert.ok(String(post.body).includes('M111UNO'), 'merchant de A: ' + post.body);
  });

  await check('cobro: el proyecto B cobra con SU merchant y SU clave (mismo módulo)', async () => {
    const calls = sumupOk();
    const r = await mod.handlePagoIniciar({ project_id: B.id, pedido_id: 'PED-B', monto_centimos: 2000 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const post = calls.find(c => c.method === 'POST');
    assert.strictEqual(post.headers.Authorization, 'Bearer sup_key_dos');
    assert.ok(String(post.body).includes('M222DOS'), 'merchant de B: ' + post.body);
  });

  await check('libro: dos negocios, dos libros (sin mezclar cobros)', async () => {
    const la = bus.libro(A.id), lb = bus.libro(B.id);
    assert.ok(la && lb, 'cada proyecto tiene su libro');
    const refsA = Object.values(la.checkouts).map(e => e.pedido_id);
    const refsB = Object.values(lb.checkouts).map(e => e.pedido_id);
    assert.deepStrictEqual(refsA, ['PED-A']);
    assert.deepStrictEqual(refsB, ['PED-B']);
  });

  await check('aislamiento: un proyecto sin config NO hereda la cuenta de otro', async () => {
    const r = await mod.handlePagoIniciar({ project_id: C.id, pedido_id: 'PED-C', monto_centimos: 2000 });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.error.code, 'NO_PASARELA');
  });

  await check('webhook: el token del proyecto A NO vale en el del proyecto B', async () => {
    mockFetch(() => ({ status: 200, body: CO('WEB') }));
    const res = { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    const req = { params: { project: B.slug }, query: { t: 'tok-uno' }, _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'co-1' }) };
    const r = await mod.handleWebhook(req, res);
    assert.strictEqual(r.status, 401, 'el token de A no abre el webhook de B');
  });

  await check('webhook: verifica con la clave del proyecto del path y confirma', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { ...CO('PED-B'), status: 'PAID', checkout_reference: 'PED-B' } }));
    const res = { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    const req = { params: { project: B.slug }, query: { t: 'tok-dos' }, _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'co-PED-B' }) };
    const r = await mod.handleWebhook(req, res);
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer sup_key_dos');
    const conf = bus.eventos('pago.confirmado');
    assert.ok(conf.some(p => p.project_id === B.id), 'pago.confirmado lleva el project_id de B');
  });

  await check('config en caliente: cambiar el merchant de A se usa en el siguiente cobro', async () => {
    await mod.handlePagoConfigEscribir({ project_id: A.id, pasarela: { merchant_code: 'M999NUEVO' } });
    const calls = sumupOk();
    const r = await mod.handlePagoIniciar({ project_id: A.id, pedido_id: 'PED-A2', monto_centimos: 2000 });
    assert.strictEqual(r.status, 200);
    const post = calls.find(c => c.method === 'POST');
    assert.ok(String(post.body).includes('M999NUEVO'), 'merchant nuevo: ' + post.body);
  });

  await check('barrido: reconcilia cada proyecto con SU cuenta', async () => {
    // Un pendiente VIVO en cada negocio (el de B se confirmó por webhook, ya no toca barrerlo).
    sumupOk();
    await mod.handlePagoIniciar({ project_id: A.id, pedido_id: 'PED-A3', monto_centimos: 2000 });
    await mod.handlePagoIniciar({ project_id: B.id, pedido_id: 'PED-B3', monto_centimos: 2000 });
    const calls = mockFetch(() => ({ status: 200, body: { ...CO('x'), status: 'PENDING' } }));
    await mod._barrer();
    const auths = calls.map(c => c.headers.Authorization);
    assert.ok(auths.includes('Bearer sup_key_uno'), 'usa la clave de A');
    assert.ok(auths.includes('Bearer sup_key_dos'), 'usa la clave de B');
  });

  await check('modo estricto: con exigir_config_proyecto, el que no declaró cuenta NO cobra', async () => {
    const estricto = new PagoGateway();
    const busE = makeBus();
    await estricto.onLoad({ logger, eventBus: busE, metrics, moduleConfig: { pasarela: { moneda: 'eur', exigir_config_proyecto: true, kind: 'sumup-checkout', merchant_code: 'MCORE', provider: 'SUMUP' } } });
    await estricto.handlePagoConfigEscribir({ project_id: A.id, pasarela: { kind: 'sumup-checkout', provider: 'SUMUP', merchant_code: 'M111UNO', webhook_url: 'https://x/modules/pago-gateway/pago/webhook/the-pirate' } });
    const okA = await estricto.handlePagoIniciar({ project_id: A.id, pedido_id: 'PED-E1', monto_centimos: 2000 });
    assert.strictEqual(okA.status, 200, 'el que declaró su cuenta cobra');
    const noC = await estricto.handlePagoIniciar({ project_id: C.id, pedido_id: 'PED-E2', monto_centimos: 2000 });
    assert.strictEqual(noC.status, 503, 'el que no declaró nada no hereda la cuenta del core');
    assert.strictEqual(noC.error.code, 'NO_PASARELA');
  });

  console.log('\n' + ok + ' checks ok\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
