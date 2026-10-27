/**
 * Tests unitarios — pago-gateway: IDENTIDAD DEL PROYECTO y ENTORNO (real/sandbox).
 *
 * Lo que clavan estos tests (los dos fallos que costaron dinero y soporte el 26-oct-2026):
 *
 *   1. IDENTIDAD EN UN SOLO CAMINO. El bus admite el UUID y el slug del mismo proyecto y cada
 *      llamante llegaba con el suyo (tienda-api manda slug, project-manager devuelve UUID, el
 *      barrido itera UUIDs). La credencial se guarda como SUMUP_API_KEY_PROJECT_<slug> y el
 *      storage se indexa por llave: con el UUID la clave "no existía" (webhook 503 con el dinero
 *      ya cobrado) y el libro de cobros se partía en dos carpetas. Se resuelve en el borde.
 *
 *   2. MÉTODOS DE PAGO. SumUp responde { available_payment_methods: [{id:'card'}] }. Leer esa
 *      forma mal daba lista vacía y el aviso FALSO "pide el alta del scope online a SumUp" (dos
 *      correos a soporte con la cuenta operativa).
 *
 *   3. ENTORNO. Con una clave de sandbox, un ensayo entra en el libro igual que un cobro real.
 *      GET /v0.1/me lo publica en `extdev`: se marca en el libro y en el preflight.
 *
 * Ejecutar: node tests/unit/pago-gateway-identidad-slug.test.js
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

const UUID = '5d09cb49-35a0-409f-9e09-c57da93b84a8';
const SLUG = 'the-pirate';
const MERCHANT = 'MR9F8WJH';
const CLAVE = 'sup_sk_de_prueba';

// El proyecto, tal y como lo publica project-manager: id UUID + slug del directorio.
const PROYECTO = { id: UUID, slug: SLUG, name: 'The Pirate', base_path: '/opt/enki/data/projects/' + SLUG };

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const h = opts.headers || {};
    calls.push({ url: String(url), method: opts.method || 'GET', headers: h, body: opts.body });
    const r = await handler(String(url), opts, calls.length);
    return {
      ok: r.status >= 200 && r.status < 300, status: r.status,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}))
    };
  };
  return calls;
}

// Bus falso con la doctrina REAL: el disco está indexado por la llave que llega (así se ve el
// split en dos carpetas) y la credencial solo existe bajo el SLUG.
function makeBus() {
  const subs = new Map();
  const discos = new Map();
  const discoDe = (pid) => { if (!discos.has(pid)) discos.set(pid, new Map()); return discos.get(pid); };
  const responder = (nombre, cuerpoFn) => { for (const fn of [...(subs.get(nombre) || [])]) fn({ data: cuerpoFn() }); };

  const bus = {
    published: [],
    discos,
    credencialesPedidas: [],
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, new Set());
      subs.get(ev).add(fn);
      return () => subs.get(ev)?.delete(fn);
    },
    publish(ev, payload) {
      bus.published.push([ev, payload]);
      for (const fn of [...(subs.get(ev) || [])]) fn({ data: payload, ...payload });

      if (ev === 'credential.resolve.request') {
        bus.credencialesPedidas.push(payload.project_id);
        // La clave vive SOLO bajo el slug: con el UUID no hay credencial (como en producción).
        const tiene = payload.project_id === SLUG;
        setImmediate(() => responder('credential.resolve.response', () => ({
          request_id: payload.request_id,
          ...(tiene
            ? { success: true, api_key: CLAVE, resolved_from: 'PROJECT', identifier: SLUG }
            : { success: false, error: `No credentials found for provider "${payload.provider}"` })
        })));
        return;
      }
      if (ev === 'project.list.request') {
        setImmediate(() => responder('project.list.response', () => ({
          request_id: payload.request_id, success: true, projects: [PROYECTO]
        })));
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
  await mod.onLoad({
    logger, eventBus: bus, metrics,
    moduleConfig: { pasarela: { moneda: 'eur', ttl_minutos: 15, min_centimos: 100 } }
  });
  // Se espera a que el resolutor caliente el mapa (uuid → slug) en segundo plano.
  await new Promise(r => setTimeout(r, 20));
  return { mod, bus };
}

const CO = (ref) => ({
  id: 'co-' + ref, status: 'PENDING', amount: 20, currency: 'EUR', checkout_reference: ref,
  hosted_checkout_url: 'https://checkout.sumup.com/pay/' + ref,
  valid_until: new Date(Date.now() + 15 * 60000).toISOString()
});

// SumUp falso: create, /me (real), y payment-methods con la forma REAL del API.
const sumup = ({ sandbox = false, metodos = { available_payment_methods: [{ id: 'card' }, { id: 'apple_pay' }] }, caidoMe = false } = {}) =>
  mockFetch((url, opts) => {
    if (url.endsWith('/v0.1/me')) {
      if (caidoMe) return { status: 500, body: { message: 'boom' } };
      // Forma REAL del API (verificada 26-oct-2026): extdev vive dentro de merchant_profile.
      return {
        status: 200,
        body: {
          account: { type: 'normal', username: 'noninapizzicas@gmail.com' },
          details_submitted: !sandbox,
          merchant_profile: {
            extdev: sandbox, complete: !sandbox, merchant_code: MERCHANT,
            company_name: 'The Pirate', country: 'ES', default_currency: 'EUR'
          }
        }
      };
    }
    if (url.includes('/payment-methods')) return { status: 200, body: metodos };
    if (url.includes('/v1/merchants/')) return { status: 200, body: { merchant_code: MERCHANT, country: 'ES', default_currency: 'EUR', merchant_name: 'The Pirate' } };
    if (opts.method === 'POST' && url.endsWith('/v0.1/checkouts')) {
      const b = JSON.parse(opts.body || '{}');
      return { status: 201, body: CO(b.checkout_reference || 'x') };
    }
    return { status: 200, body: CO('x') };
  });

const escribirConfig = (mod, project_id, extra = {}) => mod.handlePagoConfigEscribir({
  project_id,
  pasarela: {
    kind: 'sumup-checkout', provider: 'SUMUP', merchant_code: MERCHANT,
    webhook_url: 'https://x/modules/pago-gateway/pago/webhook/' + SLUG, ...extra
  }
});

async function main() {
  console.log('\npago-gateway · identidad (slug) y entorno (sandbox)\n');

  const { mod, bus } = await montar();

  await check('identidad: el cobro lanzado con el UUID resuelve la clave del SLUG', async () => {
    await escribirConfig(mod, UUID);
    const calls = sumup();
    const r = await mod.handlePagoIniciar({ project_id: UUID, pedido_id: 'PED-1', monto_centimos: 2000 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(bus.credencialesPedidas.pop(), SLUG, 'a credential-manager se le pregunta por el slug');
    const post = calls.find(c => c.method === 'POST');
    assert.strictEqual(post.headers.Authorization, 'Bearer ' + CLAVE);
  });

  await check('identidad: el libro se escribe UNA vez, en la carpeta del slug (no se parte en dos)', async () => {
    assert.ok(bus.libro(SLUG), 'el libro está bajo el slug');
    assert.strictEqual(bus.libro(UUID), null, 'no hay un segundo libro bajo el UUID');
    const filas = Object.values(bus.libro(SLUG).checkouts);
    assert.strictEqual(filas.length, 1);
    assert.strictEqual(filas[0].pedido_id, 'PED-1');
  });

  await check('identidad: el barrido (que itera UUIDs) lee el MISMO libro', async () => {
    sumup(() => ({ status: 200, body: { ...CO('PED-1'), status: 'PENDING' } }));
    await mod._barrer();
    assert.strictEqual(bus.libro(UUID), null, 'el barrido no creó una carpeta nueva');
  });

  await check('identidad: por bus (pago.iniciar.request) el project_id sale ya canónico', async () => {
    const calls = sumup();
    bus.publish('pago.iniciar.request', { request_id: 'req-1', project_id: UUID, pedido_id: 'PED-2', monto_centimos: 1500 });
    await new Promise(r => setTimeout(r, 120));
    const resp = bus.eventos('pago.iniciar.response').pop();
    assert.ok(resp && resp.status === 200, JSON.stringify(resp));
    assert.ok(calls.some(c => c.method === 'POST'), 'se creó el checkout');
  });

  await check('métodos: available_payment_methods → tarjeta y apple_pay (no lista vacía)', async () => {
    sumup();
    const r = await mod.handlePagoMetodos({ project_id: UUID });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.deepStrictEqual(r.data.metodos, ['card', 'apple_pay']);
    assert.strictEqual(r.data.tarjeta, true);
    assert.strictEqual(r.data.entorno, 'real');
  });

  await check('estado: con tarjeta disponible NO inventa el aviso del alta online', async () => {
    sumup();
    const r = await mod.handlePagoEstado({ project_id: UUID });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.tarjeta, true);
    assert.strictEqual(r.data.entorno, 'real');
    assert.ok(!r.data.avisos.some(a => /alta|scope/i.test(a)), 'avisos: ' + JSON.stringify(r.data.avisos));
  });

  await check('estado: clave de sandbox → entorno sandbox y aviso de que no entra dinero', async () => {
    mod._entorno.clear();          // caché por credencial: se vacía al cambiar de cuenta
    sumup({ sandbox: true });
    const r = await mod.handlePagoEstado({ project_id: UUID });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.entorno, 'sandbox');
    assert.ok(r.data.avisos.some(a => /SANDBOX/.test(a)), 'avisos: ' + JSON.stringify(r.data.avisos));
  });

  await check('libro: la fila del cobro dice que fue un ENSAYO (entorno sandbox)', async () => {
    sumup({ sandbox: true });
    const r = await mod.handlePagoIniciar({ project_id: UUID, pedido_id: 'PED-2B', monto_centimos: 1200 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.entorno, 'sandbox');
    const fila = Object.values(bus.libro(SLUG).checkouts).find(e => e.pedido_id === 'PED-2B');
    assert.ok(fila, 'la fila existe');
    assert.strictEqual(fila.entorno, 'sandbox');
  });

  await check('/me caído → entorno desconocido (null) y el cobro NO se bloquea', async () => {
    const mod2 = new PagoGateway();
    const bus2 = makeBus();
    await mod2.onLoad({ logger, eventBus: bus2, metrics, moduleConfig: { pasarela: { moneda: 'eur', ttl_minutos: 15, min_centimos: 100 } } });
    await new Promise(r => setTimeout(r, 20));
    await escribirConfig(mod2, UUID);
    sumup({ caidoMe: true });
    const r = await mod2.handlePagoIniciar({ project_id: UUID, pedido_id: 'PED-3', monto_centimos: 2000 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.entorno, null);
    const fila = Object.values(bus2.libro(SLUG).checkouts)[0];
    assert.strictEqual(fila.entorno, null);
  });

  await check('webhook: el path (slug) confirma con la clave del proyecto, sin 503 por identidad', async () => {
    // Un checkout pendiente del libro + evento de SumUp en el path del proyecto.
    const calls = mockFetch((url) => ({ status: 200, body: { ...CO('PED-1'), status: 'PAID', amount: 20 } }));
    const res = { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    const req = {
      params: { project: SLUG }, query: {},
      _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'co-PED-1' })
    };
    const r = await mod.handleWebhook(req, res);
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const get = calls.find(c => c.url.includes('/v0.1/checkouts/'));
    assert.strictEqual(get.headers.Authorization, 'Bearer ' + CLAVE);
    assert.ok(bus.eventos('pago.confirmado').length >= 1, 'se emitió pago.confirmado');
    // La fila confirmada hereda el entorno ya averiguado (el sandbox de los checks anteriores):
    // una confirmación no se queda sin decir si fue ensayo o dinero real.
    const fila = Object.values(bus.libro(SLUG).checkouts).find(e => e.checkout_id === 'co-PED-1');
    assert.ok(fila, 'la fila del libro existe');
    assert.strictEqual(fila.estado, 'confirmado');
    assert.strictEqual(fila.entorno, 'sandbox');
  });

  await check('webhook: el path con UUID resuelve la MISMA config del proyecto (no cae al core)', async () => {
    // Un cobro nuevo, pendiente, para que la confirmación no sea "duplicado".
    sumup();
    const ini = await mod.handlePagoIniciar({ project_id: UUID, pedido_id: 'PED-UUID-WH', monto_centimos: 700 });
    assert.strictEqual(ini.status, 200, JSON.stringify(ini));
    bus.credencialesPedidas.length = 0;
    const calls = mockFetch((url) => ({ status: 200, body: { ...CO('PED-UUID-WH'), status: 'PAID', amount: 7 } }));
    const res = { status: null, body: null, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
    const req = {
      params: { project: UUID }, query: {},
      _rawBody: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'co-PED-UUID-WH' })
    };
    const r = await mod.handleWebhook(req, res);
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.deepStrictEqual(bus.credencialesPedidas, [SLUG], 'la credencial se pide por el slug');
    const get = calls.find(c => c.url.includes('/v0.1/checkouts/'));
    assert.ok(get, 'se reconsultó el checkout');
    assert.strictEqual(get.headers.Authorization, 'Bearer ' + CLAVE);
  });

  await check('estado: `pasarela` es la del PROYECTO, no el default del core', async () => {
    const mod3 = new PagoGateway();
    const bus3 = makeBus();
    await mod3.onLoad({
      logger, eventBus: bus3, metrics,
      moduleConfig: { pasarela: { kind: 'stripe-checkout', moneda: 'eur', ttl_minutos: 15, min_centimos: 100 } }
    });
    await new Promise(r => setTimeout(r, 20));
    await escribirConfig(mod3, SLUG);
    sumup();
    const r = await mod3.handlePagoEstado({ project_id: SLUG });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.pasarela, 'sumup-checkout');
  });

  console.log('\n' + ok + ' checks ok\n');
}

main().catch(() => {});
