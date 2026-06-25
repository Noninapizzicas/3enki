/**
 * Tests unitarios — webhook de Glovo en cuentas-canales (v5.1.0).
 *
 * Cubre la pieza NUEVA y critica (seguridad + ruteo del push):
 *   - _checkGlovoToken: cerrado por defecto, timing-safe, raw y Bearer.
 *   - handleGlovoWebhook: 401 / 400 / 200 (incl. duplicado 409→200) / 502 / 500.
 *   - GlovoStrategy._normalizeWebhookBody: mapeo tolerante del cuerpo crudo.
 *
 * No carga el core ni cuentas: stubea strategies.glovo.handleWebhookEntrante.
 *
 * Ejecutar: node tests/unit/pizzepos__cuentas-canales-glovo-webhook.test.js
 */

'use strict';

const assert = require('assert');

const CuentasCanalesModule = require('../../modules/pizzepos/cuentas-canales');
const GlovoStrategy = require('../../modules/pizzepos/cuentas-canales/strategies/glovo');

let passed = 0;
let failed = 0;
async function test(nombre, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${nombre}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${nombre}`);
    console.log(`    ${err.message}`);
  }
}

// Modulo con dependencias minimas para probar el webhook sin core.
function makeModulo() {
  const m = new CuentasCanalesModule();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.config = { glovo: { webhook_token_header: 'authorization' } };
  return m;
}

const TOKEN = 'tok-secreto-glovo-123';

(async () => {
  console.log('\npizzepos__cuentas-canales-glovo-webhook\n');

  // ── _checkGlovoToken ─────────────────────────────────────────────
  await test('_checkGlovoToken rechaza si no hay token configurado (cerrado por defecto)', () => {
    delete process.env.GLOVO_WEBHOOK_TOKEN;
    delete process.env.GLOVO_WEBHOOK_TOKEN_GLOBAL;
    const m = makeModulo();
    assert.strictEqual(m._checkGlovoToken({ authorization: 'cualquier-cosa' }), false);
  });

  await test('_checkGlovoToken acepta el token exacto (cabecera authorization)', () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    assert.strictEqual(m._checkGlovoToken({ authorization: TOKEN }), true);
  });

  await test('_checkGlovoToken acepta formato Bearer', () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    assert.strictEqual(m._checkGlovoToken({ authorization: `Bearer ${TOKEN}` }), true);
  });

  await test('_checkGlovoToken acepta cabecera alternativa glovo-token', () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    assert.strictEqual(m._checkGlovoToken({ 'glovo-token': TOKEN }), true);
  });

  await test('_checkGlovoToken rechaza token incorrecto (misma longitud)', () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    const wrong = 'x'.repeat(TOKEN.length);
    assert.strictEqual(m._checkGlovoToken({ authorization: wrong }), false);
  });

  await test('_checkGlovoToken rechaza token de longitud distinta sin lanzar', () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    assert.strictEqual(m._checkGlovoToken({ authorization: 'corto' }), false);
  });

  await test('_checkGlovoToken resuelve el token POR PROYECTO y aísla entre tiendas', () => {
    delete process.env.GLOVO_WEBHOOK_TOKEN;
    delete process.env.GLOVO_WEBHOOK_TOKEN_GLOBAL;
    process.env.GLOVO_WEBHOOK_TOKEN_API_KEY_PROJECT_nonina = 'tok-nonina';
    process.env.GLOVO_WEBHOOK_TOKEN_API_KEY_PROJECT_otra = 'tok-otra';
    const m = makeModulo();
    assert.strictEqual(m._checkGlovoToken({ authorization: 'tok-nonina' }, 'nonina'), true);
    assert.strictEqual(m._checkGlovoToken({ authorization: 'tok-otra' }, 'otra'), true);
    // el token de una tienda NO vale para otra
    assert.strictEqual(m._checkGlovoToken({ authorization: 'tok-nonina' }, 'otra'), false);
    // proyecto sin token configurado → cerrado
    assert.strictEqual(m._checkGlovoToken({ authorization: 'tok-nonina' }, 'sin-config'), false);
    delete process.env.GLOVO_WEBHOOK_TOKEN_API_KEY_PROJECT_nonina;
    delete process.env.GLOVO_WEBHOOK_TOKEN_API_KEY_PROJECT_otra;
  });

  // ── handleGlovoWebhook ───────────────────────────────────────────
  await test('handleGlovoWebhook → 401 si el token es invalido (no llama a la strategy)', async () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    let llamada = false;
    m.strategies.glovo.handleWebhookEntrante = async () => { llamada = true; return { status: 201 }; };
    const r = await m.handleGlovoWebhook({ headers: { authorization: 'malo' }, params: { project: 'nonina' }, body: { order_id: 'G1' } });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(llamada, false);
  });

  await test('handleGlovoWebhook → 400 si falta order_id', async () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    m.strategies.glovo.handleWebhookEntrante = async () => { throw new Error('no deberia llamarse'); };
    const r = await m.handleGlovoWebhook({ headers: { authorization: TOKEN }, params: { project: 'nonina' }, body: {} });
    assert.strictEqual(r.status, 400);
  });

  await test('handleGlovoWebhook → 200 en alta correcta (delega con order_id + project)', async () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    let visto = null;
    m.strategies.glovo.handleWebhookEntrante = async (p) => { visto = p; return { status: 201, data: {} }; };
    const r = await m.handleGlovoWebhook({ headers: { authorization: TOKEN }, params: { project: 'nonina' }, body: { order_id: 'G42' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.received, true);
    assert.strictEqual(visto.glovo_order_id, 'G42');
    assert.strictEqual(visto.project_id, 'nonina');
  });

  await test('handleGlovoWebhook → 200 idempotente si la strategy devuelve 409 (duplicado)', async () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    m.strategies.glovo.handleWebhookEntrante = async () => ({ status: 409, error: { code: 'CONFLICT_STATE' } });
    const r = await m.handleGlovoWebhook({ headers: { authorization: TOKEN }, params: { project: 'nonina' }, body: { order_id: 'G42' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.duplicate, true);
  });

  await test('handleGlovoWebhook → 502 si la strategy falla (Glovo reintenta)', async () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    m.strategies.glovo.handleWebhookEntrante = async () => ({ status: 422, error: { code: 'INVALID_INPUT' } });
    const r = await m.handleGlovoWebhook({ headers: { authorization: TOKEN }, params: { project: 'nonina' }, body: { order_id: 'G1' } });
    assert.strictEqual(r.status, 502);
  });

  await test('handleGlovoWebhook → 500 si la strategy lanza', async () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    m.strategies.glovo.handleWebhookEntrante = async () => { throw new Error('boom'); };
    const r = await m.handleGlovoWebhook({ headers: { authorization: TOKEN }, params: { project: 'nonina' }, body: { order_id: 'G1' } });
    assert.strictEqual(r.status, 500);
  });

  await test('handleGlovoWebhook responde por res real si se proporciona', async () => {
    process.env.GLOVO_WEBHOOK_TOKEN = TOKEN;
    const m = makeModulo();
    m.strategies.glovo.handleWebhookEntrante = async () => ({ status: 201, data: {} });
    let capturado = null;
    const res = {
      headersSent: false,
      status(s) { this._s = s; return this; },
      json(b) { capturado = { status: this._s, body: b }; return this; }
    };
    await m.handleGlovoWebhook({ headers: { authorization: TOKEN }, params: { project: 'nonina' }, body: { order_id: 'G7' } }, res);
    assert.strictEqual(capturado.status, 200);
    assert.strictEqual(capturado.body.received, true);
  });

  // ── GlovoStrategy._normalizeWebhookBody ──────────────────────────
  await test('_normalizeWebhookBody mapea el cuerpo crudo de Glovo', () => {
    const s = new GlovoStrategy();
    const out = s._normalizeWebhookBody({
      order_id: 'G99',
      products: [{ name: 'Margarita', quantity: 2, price: 8.5, comments: 'sin albahaca' }],
      total_price: 17,
      customer: { name: 'Ana' },
      delivery_address: { label: 'Calle Mayor 1' },
      special_requirements: 'tocar timbre'
    }, null);
    assert.strictEqual(out.glovo_order_id, 'G99');
    assert.strictEqual(out.items.length, 1);
    assert.strictEqual(out.items[0].nombre, 'Margarita');
    assert.strictEqual(out.items[0].cantidad, 2);
    assert.strictEqual(out.items[0].precio, 8.5);
    assert.strictEqual(out.total, 17);
    assert.strictEqual(out.cliente_nombre, 'Ana');
    assert.strictEqual(out.direccion_entrega, 'Calle Mayor 1');
    assert.strictEqual(out.notas, 'tocar timbre');
  });

  await test('_normalizeWebhookBody usa fallbackId y tolera ausencias', () => {
    const s = new GlovoStrategy();
    const out = s._normalizeWebhookBody({ items: [] }, 'FALLBACK1');
    assert.strictEqual(out.glovo_order_id, 'FALLBACK1');
    assert.deepStrictEqual(out.items, []);
    assert.strictEqual(out.total, 0);
  });

  await test('_normalizeWebhookBody devuelve null ante basura', () => {
    const s = new GlovoStrategy();
    assert.strictEqual(s._normalizeWebhookBody(null, null), null);
    assert.strictEqual(s._normalizeWebhookBody({}, null), null);
  });

  // ── Resultado ────────────────────────────────────────────────────
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
