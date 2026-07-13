'use strict';

/**
 * security-core — el cerebro de la puerta guardada.
 *
 * Verifica la traducción de los dos interruptores al peldaño (off/observe/enforce), el
 * cableado del verifier a certificate-authority (vía mqttRequest fake) y que mover un
 * interruptor mueve el modo del guard en caliente. Sin broker real: el guard es un doble
 * mínimo con setMode/setVerifier.
 *
 * Ejecutar: node tests/unit/security-core.test.js
 */

const assert = require('assert');
const SecurityCoreModule = require('../../modules/security-core');
const { _modoDe } = require('../../modules/security-core');

function test(desc, fn) {
  try { fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); process.exit(1); }
}
async function atest(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (err) { console.error(`✗ ${desc}\n  ${err.message}`); process.exit(1); }
}

// Doble mínimo del guard.
function fakeGuard() {
  return {
    _mode: 'off', verifier: null,
    setMode(m) { this._mode = m; },
    setVerifier(fn) { this.verifier = fn; },
    getStats() { return { mode: this._mode }; }
  };
}
// Core fake: eventBus que captura publishes y entrega subscribe, mqttRequest programable.
function fakeCore(overrides = {}) {
  const published = [];
  let interruptorHandler = null;
  return {
    published,
    triggerInterruptor: (d) => interruptorHandler && interruptorHandler(d),
    ctx: {
      eventBus: {
        publish: (ev, p) => { published.push({ ev, p }); },
        subscribe: (ev, fn) => { if (ev === 'interruptor.cambiado') interruptorHandler = fn; return () => {}; }
      },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      metrics: { increment() {} },
      moduleConfig: overrides.moduleConfig || {},
      busGuard: overrides.busGuard,
      mqttRequest: overrides.mqttRequest || null
    }
  };
}

console.log('security-core — el cerebro de la puerta guardada\n');

(async () => {
  // ── _modoDe: los dos interruptores → el peldaño ──
  test('_modoDe: bus-guard OFF → off (gana siempre)', () => {
    assert.strictEqual(_modoDe(false, false), 'off');
    assert.strictEqual(_modoDe(false, true), 'off');
  });
  test('_modoDe: ON + enforce OFF → observe', () => {
    assert.strictEqual(_modoDe(true, false), 'observe');
  });
  test('_modoDe: ON + enforce ON → enforce', () => {
    assert.strictEqual(_modoDe(true, true), 'enforce');
  });

  // ── onLoad: registra interruptores, cablea verifier, nace en off ──
  await atest('onLoad: registra los dos interruptores (OFF) y deja el guard en off', async () => {
    const guard = fakeGuard();
    const { ctx, published } = fakeCore({ busGuard: guard });
    const mod = new SecurityCoreModule();
    await mod.onLoad(ctx);
    const ids = published.filter(p => p.ev === 'interruptor.registrar').map(p => p.p.id);
    assert.deepStrictEqual(ids.sort(), ['bus-guard', 'bus-guard-enforce']);
    assert.strictEqual(guard._mode, 'off');
    assert.strictEqual(typeof guard.verifier, 'function', 'cableó el verifier');
  });

  // ── el peldaño reacciona al interruptor en caliente ──
  await atest('interruptor.cambiado(bus-guard ON) → guard sube a observe', async () => {
    const guard = fakeGuard();
    const core = fakeCore({ busGuard: guard });
    const mod = new SecurityCoreModule();
    await mod.onLoad(core.ctx);
    core.triggerInterruptor({ id: 'bus-guard', enabled: true });
    assert.strictEqual(guard._mode, 'observe');
    core.triggerInterruptor({ id: 'bus-guard-enforce', enabled: true });
    assert.strictEqual(guard._mode, 'enforce');
    core.triggerInterruptor({ id: 'bus-guard', enabled: false });
    assert.strictEqual(guard._mode, 'off', 'apagar el maestro apaga todo');
  });

  // ── el verifier puentea a certificate-authority.verify ──
  await atest('verifier: puentea a certificate-authority.verify y mapea la respuesta', async () => {
    const guard = fakeGuard();
    const calls = [];
    const mqttRequest = async (domain, action, payload) => {
      calls.push({ domain, action, payload });
      return { status: 200, data: { valid: true, type: 'client', identifier: 'roma' } };
    };
    const core = fakeCore({ busGuard: guard, mqttRequest });
    const mod = new SecurityCoreModule();
    await mod.onLoad(core.ctx);
    const res = await guard.verifier('PEM-X');
    assert.strictEqual(calls[0].domain, 'certificate-authority');
    assert.strictEqual(calls[0].action, 'verify');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.identifier, 'roma');
  });

  // ── sin guard (broker externo) → degradación honesta, no revienta ──
  await atest('onLoad sin busGuard (broker externo) → no revienta, registra igual', async () => {
    const core = fakeCore({ busGuard: undefined });
    const mod = new SecurityCoreModule();
    await mod.onLoad(core.ctx);
    const res = await mod.handleEstado();
    assert.strictEqual(res.data.guard_presente, false);
    assert.strictEqual(res.data.modo, 'sin-guard');
  });

  // ── handleEstado: refleja el peldaño ──
  await atest('handleEstado: refleja modo y escalera', async () => {
    const guard = fakeGuard();
    const core = fakeCore({ busGuard: guard, moduleConfig: { bus_guard: true } });
    const mod = new SecurityCoreModule();
    await mod.onLoad(core.ctx);
    const res = await mod.handleEstado();
    assert.strictEqual(res.data.modo, 'observe');
    assert.ok(/enforce/.test(res.data.escalera));
  });

  console.log('\n✓ security-core: los interruptores del dueño mandan el peldaño; el verifier puentea a certificate-authority');
})();
