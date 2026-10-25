/**
 * Tests unitarios — PAGO-GATEWAY / DATÁFONO (SumUp Reader · Terminal API).
 *
 * Lo que clavan (leído de la spec OpenAPI oficial, 2026-10):
 *   1. El importe viaja en UNIDADES MENORES ({currency, minor_unit, value}), no en decimal:
 *      confundirlo cobra 23,50 € como 0,23 € o como 2.350 €.
 *   2. IDEMPOTENCIA POR REFERENCIA: si hay un cobro vivo en ese datáfono se DEVUELVE EL MISMO.
 *      Dos checkouts vivos en el mismo lector = dos cobros posibles.
 *   3. La referencia viaja en affiliate.foreign_transaction_id: sin eso, un cobro presencial no
 *      se puede casar con su hecho si el aviso se pierde.
 *   4. La verdad es el checkout del lector: successful → pago.confirmado (canal terminal),
 *      failed → pago.rechazado, cancelled → pago.cancelado. Nunca se supone.
 *   5. La guarda de INTEGRIDAD también en el mostrador: si se cobró menos de lo pedido, no se
 *      confirma (pago.importe_discrepante).
 *   6. terminate es asíncrono y SIN confirmación (202): se dice, no se finge.
 *   7. SumUp Go tiene idempotencia documentada por client_transaction_id → se usa la referencia.
 *   8. El barrido reconcilia los cobros de datáfono con el LECTOR (no con /v0.1/checkouts, 404).
 *
 * Ejecutar: node tests/unit/pago-gateway-terminal.test.js
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
  webhook_url: 'https://enki-ai.online/modules/pago-gateway/pago/webhook/the-pirate'
};

const LECTOR = { id: 'r-1', name: 'Mostrador', status: 'paired', device: { model: 'solo', identifier: 'U1DT3NA00-CN' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

const cuerpo = (c) => (c.body ? JSON.parse(c.body) : null);
const llamadas = (calls, frag, method = null) => calls.filter(c => c.url.includes(frag) && (!method || c.method === method));

// ── 1. Emparejar ─────────────────────────────────────────────
async function test_parear_valida() {
  await check('parear: el código de emparejamiento debe ser 8-9 caracteres (el que muestra el datáfono)', async () => {
    const calls = mockFetch(() => ({ status: 201, body: LECTOR }));
    const { mod } = await montar(CFG);
    const corto = await mod.handlePagoReaderParear({ project_id: PROYECTO.id, pairing_code: 'ABC', name: 'Mostrador' });
    assert.strictEqual(corto.status, 400);
    const sinNombre = await mod.handlePagoReaderParear({ project_id: PROYECTO.id, pairing_code: '4WLFDSBF' });
    assert.strictEqual(sinNombre.status, 400);
    assert.strictEqual(calls.length, 0, 'no se llama a la API con datos inválidos');
  });
}

async function test_parear_ok() {
  await check('parear: manda pairing_code + name y avisa de que el datáfono debe confirmar', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { ...LECTOR, status: 'processing' } }));
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoReaderParear({ project_id: PROYECTO.id, pairing_code: '4WLFDSBF', name: ' Mostrador ' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const c = llamadas(calls, '/readers', 'POST')[0];
    assert.strictEqual(c.url, 'https://api.sumup.com/v0.1/merchants/M1234567/readers');
    assert.deepStrictEqual(cuerpo(c), { pairing_code: '4WLFDSBF', name: 'Mostrador' });
    assert.strictEqual(r.data.reader_id, 'r-1');
    assert.ok(/confirmar en pantalla/.test(r.data.aviso), 'debe avisar del paso pendiente en el device');
  });
}

// ── 2. Estado (¿puede cobrar AHORA?) ─────────────────────────
async function test_estado_lector() {
  await check('estado: ONLINE + batería + firmware → puede_cobrar; OFFLINE → false con el dato', async () => {
    let online = true;
    mockFetch(() => ({
      status: 200,
      body: { data: { status: online ? 'ONLINE' : 'OFFLINE', state: 'IDLE', battery_level: 84, firmware_version: '3.3.3.21', connection_type: 'Wi-Fi', last_activity: '2026-10-25T10:00:00Z' } }
    }));
    const { mod } = await montar(CFG);
    const a = await mod.handlePagoReaderEstado({ project_id: PROYECTO.id, reader_id: 'r-1' });
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.data.puede_cobrar, true);
    assert.strictEqual(a.data.bateria, 84);
    online = false;
    const b = await mod.handlePagoReaderEstado({ project_id: PROYECTO.id, reader_id: 'r-1' });
    assert.strictEqual(b.data.puede_cobrar, false);
    assert.strictEqual(b.data.conexion, 'OFFLINE');
  });
}

// ── 3. Cobrar: unidades menores + referencia en affiliate ────
async function test_cobrar_unidades_menores() {
  await check('cobrar: importe en UNIDADES MENORES (2350 → value 2350, minor_unit 2) + referencia en affiliate', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/checkout')) return { status: 201, body: { data: { checkout_id: 'rc-1', client_transaction_id: 'rc-1' } } };
      return { status: 200, body: {} };
    });
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoReaderCobrar({
      project_id: PROYECTO.id, project_slug: PROYECTO.slug,
      reader_id: 'r-1', referencia: 'PED-77', monto_centimos: 2350, concepto: 'Pizza familiar',
      tip_rates: [0.05, 0.1], tip_timeout: 45
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const c = llamadas(calls, '/readers/r-1/checkout', 'POST')[0];
    const b = cuerpo(c);
    assert.deepStrictEqual(b.total_amount, { currency: 'EUR', minor_unit: 2, value: 2350 });
    assert.strictEqual(b.affiliate.foreign_transaction_id, 'PED-77');
    assert.strictEqual(b.description, 'Pizza familiar');
    assert.deepStrictEqual(b.tip_rates, [0.05, 0.1]);
    assert.strictEqual(b.tip_timeout, 45);
    assert.strictEqual(b.return_url, CFG.webhook_url, 'sin return_url SumUp no avisa del resultado');
    // El libro guarda el canal y el lector: sin eso, el barrido no sabría a quién preguntar.
    const e = (await mod._ledgerLoad(PROYECTO.id)).checkouts['rc-1'];
    assert.strictEqual(e.canal, 'terminal');
    assert.strictEqual(e.reader_id, 'r-1');
    assert.strictEqual(e.referencia, 'PED-77');
    assert.strictEqual(e.estado, 'pendiente');
  });
}

// ── 4. Idempotencia: dos checkouts vivos = dos cobros ────────
async function test_cobrar_idempotente() {
  await check('cobrar: si ya hay un cobro VIVO para esa referencia, devuelve el mismo (no manda otro)', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/readers/r-1/checkout/rc-1')) {
        return { status: 200, body: { data: { status: 'pending', total_amount: { currency: 'EUR', minor_unit: 2, value: 1000 }, client_transaction_id: 'rc-1' } } };
      }
      if (url.includes('/readers/r-1/checkout')) return { status: 201, body: { data: { checkout_id: 'rc-1', client_transaction_id: 'rc-1' } } };
      return { status: 200, body: {} };
    });
    const { mod } = await montar(CFG);
    const d = { project_id: PROYECTO.id, project_slug: PROYECTO.slug, reader_id: 'r-1', referencia: 'PED-88', monto_centimos: 1000 };
    const a = await mod.handlePagoReaderCobrar(d);
    assert.strictEqual(a.status, 200);
    const b = await mod.handlePagoReaderCobrar(d);
    assert.strictEqual(b.status, 200);
    assert.strictEqual(b.data.reutilizado, true);
    assert.strictEqual(b.data.checkout_id, 'rc-1');
    assert.strictEqual(llamadas(calls, '/readers/r-1/checkout', 'POST').length, 1, 'un solo checkout creado');
  });
}

async function test_cobrar_ya_pagado() {
  await check('cobrar: si el cobro de esa referencia ya se completó → 409 YA_PAGADO sin mandar otro', async () => {
    const calls = mockFetch(() => ({ status: 201, body: { data: { checkout_id: 'rc-9', client_transaction_id: 'rc-9' } } }));
    const { mod } = await montar(CFG);
    const d = { project_id: PROYECTO.id, reader_id: 'r-1', referencia: 'PED-99', monto_centimos: 1000 };
    await mod.handlePagoReaderCobrar(d);
    await mod._ledgerMark(PROYECTO.id, 'rc-9', { estado: 'confirmado', transaction_id: 'tx-9' });
    const b = await mod.handlePagoReaderCobrar(d);
    assert.strictEqual(b.status, 409);
    assert.strictEqual(b.error.code, 'YA_PAGADO');
    assert.strictEqual(llamadas(calls, '/readers/r-1/checkout', 'POST').length, 1);
  });
}

// ── 5. La verdad del cobro: consultar ────────────────────────
async function test_consultar_confirmado() {
  await check('consultar: successful → pago.confirmado con canal terminal y libro confirmado', async () => {
    mockFetch((url) => {
      if (url.includes('/readers/r-1/checkout/rc-1')) {
        return { status: 200, body: { data: { status: 'successful', payment_status: 'successful', total_amount: { currency: 'EUR', minor_unit: 2, value: 2350 }, card_type: 'debit', client_transaction_id: 'rc-1', reader_serial_number: 'U1DT3NA00-CN' } } };
      }
      if (url.includes('/readers/r-1/checkout')) return { status: 201, body: { data: { checkout_id: 'rc-1', client_transaction_id: 'rc-1' } } };
      return { status: 200, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoReaderCobrar({ project_id: PROYECTO.id, project_slug: PROYECTO.slug, reader_id: 'r-1', referencia: 'PED-100', monto_centimos: 2350 });
    const r = await mod.handlePagoReaderConsultar({ project_id: PROYECTO.id, reader_id: 'r-1', checkout_id: 'rc-1' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.strictEqual(r.data.estado_organo, 'confirmado');
    const ev = bus.eventos('pago.confirmado');
    assert.strictEqual(ev.length, 1);
    assert.strictEqual(ev[0].canal, 'terminal');
    assert.strictEqual(ev[0].referencia, 'PED-100');
    assert.strictEqual(ev[0].pedido_id, 'PED-100', 'el alias se sigue emitiendo');
    assert.strictEqual(ev[0].monto_centimos, 2350);
    assert.strictEqual(ev[0].entry_mode, 'TERMINAL');
    assert.strictEqual(bus.libro().checkouts['rc-1'].estado, 'confirmado');
    // Idempotencia: consultar dos veces no duplica el evento.
    await mod.handlePagoReaderConsultar({ project_id: PROYECTO.id, reader_id: 'r-1', checkout_id: 'rc-1' });
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1);
  });
}

async function test_consultar_rechazado_y_cancelado() {
  await check('consultar: failed → pago.rechazado; cancelled → pago.cancelado (canal terminal)', async () => {
    for (const [estado, evento] of [['failed', 'pago.rechazado'], ['cancelled', 'pago.cancelado']]) {
      mockFetch((url) => {
        if (url.includes('/readers/r-1/checkout/rc-2')) {
          return { status: 200, body: { data: { status: estado, payment_failure_reason: 'INSUFFICIENT_FUNDS', total_amount: { currency: 'EUR', minor_unit: 2, value: 1000 } } } };
        }
        if (url.includes('/readers/r-1/checkout')) return { status: 201, body: { data: { checkout_id: 'rc-2', client_transaction_id: 'rc-2' } } };
        return { status: 200, body: {} };
      });
      const { mod, bus } = await montar(CFG);
      await mod.handlePagoReaderCobrar({ project_id: PROYECTO.id, reader_id: 'r-1', referencia: 'PED-200', monto_centimos: 1000 });
      const r = await mod.handlePagoReaderConsultar({ project_id: PROYECTO.id, reader_id: 'r-1', checkout_id: 'rc-2' });
      assert.strictEqual(r.data.estado_organo, estado === 'failed' ? 'rechazado' : 'cancelado');
      assert.strictEqual(bus.eventos(evento).length, 1, 'debe emitir ' + evento);
      assert.strictEqual(bus.eventos(evento)[0].canal, 'terminal');
      assert.strictEqual(bus.eventos('pago.confirmado').length, 0, 'un fallo no confirma nada');
    }
  });
}

async function test_consultar_discrepante() {
  await check('integrity: el datáfono cobró MENOS de lo pedido → pago.importe_discrepante y NO confirma', async () => {
    mockFetch((url) => {
      if (url.includes('/readers/r-1/checkout/rc-3')) {
        return { status: 200, body: { data: { status: 'successful', total_amount: { currency: 'EUR', minor_unit: 2, value: 500 } } } };
      }
      if (url.includes('/readers/r-1/checkout')) return { status: 201, body: { data: { checkout_id: 'rc-3', client_transaction_id: 'rc-3' } } };
      return { status: 200, body: {} };
    });
    const { mod, bus } = await montar(CFG);
    await mod.handlePagoReaderCobrar({ project_id: PROYECTO.id, reader_id: 'r-1', referencia: 'PED-300', monto_centimos: 2350 });
    await mod.handlePagoReaderConsultar({ project_id: PROYECTO.id, reader_id: 'r-1', checkout_id: 'rc-3' });
    assert.strictEqual(bus.eventos('pago.confirmado').length, 0);
    const d = bus.eventos('pago.importe_discrepante');
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].motivo, 'importe_insuficiente');
    assert.strictEqual(d[0].esperado_centimos, 2350);
    assert.strictEqual(d[0].cobrado_centimos, 500);
    assert.strictEqual(bus.libro().checkouts['rc-3'].estado, 'discrepante');
  });
}

// ── 6. terminate es asíncrono ────────────────────────────────
async function test_terminar() {
  await check('terminar: 202 se devuelve como aceptado y se dice que NO hay confirmación', async () => {
    mockFetch(() => ({ status: 202, body: {} }));
    const { mod } = await montar(CFG);
    const r = await mod.handlePagoReaderTerminar({ project_id: PROYECTO.id, reader_id: 'r-1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.terminado, 'aceptado');
    assert.ok(/asíncrona/.test(r.data.aviso), 'no se puede fingir una cancelación confirmada');
  });
}

// ── 7. SumUp Go (idempotencia documentada) ───────────────────
async function test_cobrar_go() {
  await check('cobrar_go: client_transaction_id = referencia (la idempotencia que documenta SumUp)', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { data: { status: 'successful', transaction_id: 'tx-go' } } }));
    const { mod, bus } = await montar(CFG);
    const r = await mod.handlePagoReaderCobrarGo({ project_id: PROYECTO.id, reader_id: 'r-1', referencia: 'PED-400', monto_centimos: 2000, propina_centimos: 200 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const c = llamadas(calls, '/go-checkout', 'POST')[0];
    assert.ok(/^https:\/\/api\.sumup\.com\/v0\/merchants\/M1234567\/readers\/r-1\/go-checkout$/.test(c.url), c.url);
    const b = cuerpo(c);
    assert.strictEqual(b.client_transaction_id, 'PED-400');
    assert.deepStrictEqual(b.total_amount, { currency: 'EUR', minor_unit: 2, value: 2200 }, 'la propina va DENTRO del total');
    assert.strictEqual(b.tip_amount, 200);
    // Si el pago ya viene confirmado, el órgano emite el evento sin esperar al barrido.
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1);
  });
}

// ── 8. Monedas sin decimales ─────────────────────────────────
async function test_moneda_sin_decimales() {
  await check('unidades menores: CLP no tiene decimales (minor_unit 0 y value en unidades)', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/checkout')) return { status: 201, body: { data: { checkout_id: 'rc-cl', client_transaction_id: 'rc-cl' } } };
      return { status: 200, body: {} };
    });
    const { mod } = await montar({ ...CFG, moneda: 'clp' });
    const r = await mod.handlePagoReaderCobrar({ project_id: PROYECTO.id, reader_id: 'r-1', referencia: 'PED-CL', monto_centimos: 1000 });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const b = cuerpo(llamadas(calls, '/readers/r-1/checkout', 'POST')[0]);
    assert.deepStrictEqual(b.total_amount, { currency: 'CLP', minor_unit: 0, value: 10 });
  });
}

// ── 9. Barrido del cobro presencial ──────────────────────────
async function test_barrido_terminal() {
  await check('barrido: reconcilia el cobro del datáfono con el LECTOR (no con /v0.1/checkouts)', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/readers/r-1/checkout/rc-b')) {
        return { status: 200, body: { data: { status: 'successful', total_amount: { currency: 'EUR', minor_unit: 2, value: 1500 } } } };
      }
      return { status: 200, body: {} };
    });
    const disco = new Map();
    const { mod, bus } = await montar(CFG, { disco });
    await mod._ledgerPut(PROYECTO.id, {
      checkout_id: 'rc-b', referencia: 'PED-B', pedido_id: 'PED-B', canal: 'terminal',
      reader_id: 'r-1', monto_centimos: 1500, moneda: 'EUR', estado: 'pendiente', creado: new Date().toISOString()
    });
    await mod._barrerProyecto({ id: PROYECTO.id, slug: PROYECTO.slug });
    assert.strictEqual(llamadas(calls, '/v0.1/checkouts').length, 0, 'el checkout del lector no vive en /v0.1/checkouts');
    assert.strictEqual(bus.eventos('pago.confirmado').length, 1);
    assert.strictEqual(bus.eventos('pago.confirmado')[0].canal, 'terminal');
  });
}

// ── 10. Bus: los puertos del datáfono responden por evento ───
async function test_puertos_bus() {
  await check('bus: pago.reader.listar.request responde con pago.reader.listar.response', async () => {
    mockFetch(() => ({ status: 200, body: { items: [LECTOR] } }));
    const { bus } = await montar(CFG);
    bus.publish('pago.reader.listar.request', { request_id: 'rq-1', project_id: PROYECTO.id });
    await new Promise(r => setTimeout(r, 120));
    const resp = bus.eventos('pago.reader.listar.response').find(x => x.request_id === 'rq-1');
    assert.ok(resp, 'el puerto debe responder por el bus');
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.lectores[0].reader_id, 'r-1');
  });
}

// ─────────────────────────────────────────────────────────────
(async () => {
  await test_parear_valida();
  await test_parear_ok();
  await test_estado_lector();
  await test_cobrar_unidades_menores();
  await test_cobrar_idempotente();
  await test_cobrar_ya_pagado();
  await test_consultar_confirmado();
  await test_consultar_rechazado_y_cancelado();
  await test_consultar_discrepante();
  await test_terminar();
  await test_cobrar_go();
  await test_moneda_sin_decimales();
  await test_barrido_terminal();
  await test_puertos_bus();
  console.log(`\n${ok} checks ok`);
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
})();
