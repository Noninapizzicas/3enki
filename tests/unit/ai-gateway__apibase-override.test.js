'use strict';

/**
 * ai-gateway__apibase-override — el base-URL del proveedor admite override por env
 * (para meter un proxy tipo Headroom en despliegue sin editar config ni código).
 * Default = config.api_base; env AIGATEWAY_API_BASE__<NOMBRE> gana; quitar la env revierte.
 *
 * Ejecutar: node tests/unit/ai-gateway__apibase-override.test.js
 */

const assert = require('assert');
const BaseProvider = require('../../modules/conversacion/ai-gateway/providers/base-provider.js');
const hr = require('../../modules/conversacion/ai-gateway/providers/headroom-switch.js');

function prov(name, api_base, extra = {}) {
  const p = new BaseProvider({ api_base, ...extra }, { info() {}, warn() {}, error() {}, debug() {} });
  p.name = name;
  return p;
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('sin env → usa config.api_base', () => {
  delete process.env.AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC;
  const p = prov('deepseek-anthropic', 'https://api.deepseek.com');
  assert.strictEqual(p._apiBase(), 'https://api.deepseek.com');
});

test('env override gana (guiones → _, mayúsculas)', () => {
  process.env.AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC = 'http://localhost:8787';
  const p = prov('deepseek-anthropic', 'https://api.deepseek.com');
  assert.strictEqual(p._apiBase(), 'http://localhost:8787');
  delete process.env.AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC;
});

test('override es POR proveedor (no afecta a otro)', () => {
  process.env.AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC = 'http://localhost:8787';
  const dsk = prov('deepseek-anthropic', 'https://api.deepseek.com');
  const anth = prov('anthropic', 'https://api.anthropic.com');
  assert.strictEqual(dsk._apiBase(), 'http://localhost:8787');
  assert.strictEqual(anth._apiBase(), 'https://api.anthropic.com', 'anthropic no tiene override');
  delete process.env.AIGATEWAY_API_BASE__DEEPSEEK_ANTHROPIC;
});

test('env vacía/espacios → cae al default (reversible)', () => {
  process.env.AIGATEWAY_API_BASE__ANTHROPIC = '   ';
  const p = prov('anthropic', 'https://api.anthropic.com');
  assert.strictEqual(p._apiBase(), 'https://api.anthropic.com');
  delete process.env.AIGATEWAY_API_BASE__ANTHROPIC;
});

test('interruptor headroom ON + proxy + config.headroom → por el proxy', () => {
  process.env.HEADROOM_PROXY_URL = 'http://localhost:8787';
  hr.setOn(true);
  const p = prov('deepseek-anthropic', 'https://api.deepseek.com', { headroom: true });
  assert.strictEqual(p._apiBase(), 'http://localhost:8787');
  hr.setOn(false); delete process.env.HEADROOM_PROXY_URL;
});

test('interruptor headroom OFF → proveedor directo (aunque haya proxy)', () => {
  process.env.HEADROOM_PROXY_URL = 'http://localhost:8787';
  hr.setOn(false);
  const p = prov('deepseek-anthropic', 'https://api.deepseek.com', { headroom: true });
  assert.strictEqual(p._apiBase(), 'https://api.deepseek.com');
  delete process.env.HEADROOM_PROXY_URL;
});

test('headroom ON pero sin HEADROOM_PROXY_URL → cae a directo (fallback seguro)', () => {
  delete process.env.HEADROOM_PROXY_URL;
  hr.setOn(true);
  const p = prov('anthropic', 'https://api.anthropic.com', { headroom: true });
  assert.strictEqual(p._apiBase(), 'https://api.anthropic.com');
  hr.setOn(false);
});

test('provider SIN config.headroom no lo toca el switch', () => {
  process.env.HEADROOM_PROXY_URL = 'http://localhost:8787';
  hr.setOn(true);
  const p = prov('openai', 'https://api.openai.com/v1'); // sin headroom:true
  assert.strictEqual(p._apiBase(), 'https://api.openai.com/v1');
  hr.setOn(false); delete process.env.HEADROOM_PROXY_URL;
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`\n[ai-gateway__apibase-override] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__apibase-override] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}\n    ${e.message}`);
  process.exit(1);
})();
