#!/usr/bin/env node
'use strict';
/**
 * crawl4rs__sugerencias — regresión de la costura EL ALTO (v0.6.0).
 *
 * Lo que se fija:
 *   1. RPC crawl4rs.sugerencias.request {query} → {sugerencias:[], fuente}.
 *   2. Escalera honesta: SearXNG autocompleter primero; si viene vacío, Google
 *      directo (una llamada exterior más); si ambos vacíos → 200 con []
 *      (el vacío es DATO, no error).
 *   3. backend:'searxng' fija la escalera a un peldaño.
 *   4. Guard de egress: interruptor OFF → degradación honesta (apagado), sin
 *      llamada exterior.
 *   5. Sin query → 400.
 *
 * Sin core ni MQTT: bus de mentira + fetch sobrescrito.
 * Ejecutar con: node tests/unit/crawl4rs__sugerencias.test.js
 */

const assert = require('assert');
const path = require('path');
const N = process.env.ENKI_MODULES || path.resolve(__dirname, '../../modules');
const Crawl4rs = require(`${N}/crawl4rs/index.js`);

let fallos = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fallos++; console.error(`✗ ${desc}\n  ${e.message}`); }
}

/** Monta el módulo con fetch de mentira: mapa (url) → {json|status}. */
function montar({ activo = true, fetchMap = {}, llamadas = [] } = {}) {
  const c = new Crawl4rs();
  c.activo = activo;
  c._searxng = 'http://searx-test:8080';
  c.logger = { info() {}, error() {}, warn() {} };
  const fakeFetch = async (u, _opts) => {
    llamadas.push(String(u));
    const r = fetchMap[u] || fetchMap.__default__;
    if (!r) throw new Error('no mock para ' + u);
    return {
      status: r.status || 200,
      json: async () => r.json
    };
  };
  const realFetch = global.fetch;
  global.fetch = fakeFetch;
  return { c, llamadas, restaurar: () => { global.fetch = realFetch; } };
}

const U_SEARX = (q) => `http://searx-test:8080/autocompleter?q=${encodeURIComponent(q)}`;
const U_GOOGLE = (q) => 'https://suggestqueries.google.com/complete/search?' +
  new URLSearchParams({ client: 'firefox', hl: 'es', gl: 'es', q }).toString();

(async () => {
  console.log('\n🧪 crawl4rs — la costura EL ALTO (sugerencias)\n');

  await test('escucha crawl4rs.sugerencias.request y responde con sugerencias + fuente', async () => {
    const { c, restaurar } = montar({
      fetchMap: {
        [U_SEARX('trabajo en lorca')]: { json: ['trabajo en lorca', []] },
        [U_GOOGLE('trabajo en lorca')]: { json: ['trabajo en lorca', ['trabajo camarero lorca', 'trabajo sin experiencia lorca']] }
      }
    });
    try {
      const r = await c._sugerencias({ query: 'trabajo en lorca' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.fuente, 'google');
      assert.deepStrictEqual(r.data.sugerencias, ['trabajo camarero lorca', 'trabajo sin experiencia lorca']);
    } finally { restaurar(); }
  });

  await test('SearXNG autocompleter con datos: no sale fuera (una sola llamada)', async () => {
    const { c, llamadas, restaurar } = montar({
      fetchMap: { [U_SEARX('que hacer en murcia')]: { json: ['que hacer en murcia', ['que hacer en murcia con niños']] } }
    });
    try {
      const r = await c._sugerencias({ query: 'que hacer en murcia' });
      assert.strictEqual(r.data.fuente, 'searxng');
      assert.deepStrictEqual(r.data.sugerencias, ['que hacer en murcia con niños']);
      assert.strictEqual(llamadas.length, 1, 'una llamada: la local basta');
    } finally { restaurar(); }
  });

  await test('escalera: SearXNG vacío → sube a Google; ambos vacíos → 200 con [] (el vacío es dato)', async () => {
    const { c, llamadas, restaurar } = montar({
      fetchMap: { __default__: { json: ['x', []] } }
    });
    try {
      const r = await c._sugerencias({ query: 'algo sin eco' });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.data.sugerencias, []);
      assert.ok(r.data.fuente === 'ninguno' || r.data.fuente === 'google');
      assert.ok(llamadas.length >= 1, 'al menos se tiró el dado local');
    } finally { restaurar(); }
  });

  await test('backend:searxng fija la escalera a un peldaño (nunca llama Google)', async () => {
    const { c, llamadas, restaurar } = montar({
      fetchMap: { [U_SEARX('cafe')]: { json: ['cafe', ['cafeteria abierta ahora']] } }
    });
    try {
      const r = await c._sugerencias({ query: 'cafe', backend: 'searxng' });
      assert.strictEqual(r.data.fuente, 'searxng');
      assert.ok(llamadas.every((u) => !u.includes('google')), 'con backend fijo no sale fuera');
    } finally { restaurar(); }
  });

  await test('interruptor OFF: degradación honesta, ninguna llamada exterior', async () => {
    const { c, llamadas, restaurar } = montar({ activo: false });
    try {
      const r = await c._sugerencias({ query: 'trabajo en lorca' });
      assert.strictEqual(r.status, 503);
      assert.strictEqual(r.error.details.motivo, 'apagado', 'degradación con motivo nombrado');
      assert.ok(/enciéndelo/.test(r.error.message), 'la prescripción dice cómo se enciende');
      assert.strictEqual(llamadas.length, 0, 'el egress respetado incluso para el alto');
    } finally { restaurar(); }
  });

  await test('sin query: 400 INVALID_INPUT', async () => {
    const { c, restaurar } = montar({});
    try {
      const r = await c._sugerencias({});
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.error.code, 'INVALID_INPUT');
    } finally { restaurar(); }
  });

  // el guard OFF devuelve _degradado: verificar el shape real del módulo
  await test('la degradación apagado lleva prescripción (no silencio)', async () => {
    const { c, restaurar } = montar({ activo: false });
    try {
      const r = await c._sugerencias({ query: 'x' });
      assert.ok(r.error && (r.error.detalle || r.error.prescripcion || r.error.message),
        'la respuesta dice QUÉ pasa y cómo se enciende');
    } finally { restaurar(); }
  });

  if (fallos) { console.error(`\n❌ ${fallos} test(s) fallaron`); process.exit(1); }
  console.log('\n✅ crawl4rs SUGERENCIAS OK');
})().catch((e) => { console.error('✗ FALLO:', e.message); process.exit(1); });