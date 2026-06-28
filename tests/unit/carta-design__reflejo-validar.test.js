'use strict';

/**
 * carta-design — REFLEJO _validar / _save GATE (EL FRENO, skill blueprint-agentico).
 *
 * El LLM de página compone el HTML (lo fuzzy). Un diseño no se valida con JSON Schema
 * (es freeform): su contrato es REPRESENTAR la carta. El reflejo lo comprueba contra la
 * carta REAL (carta.get, la fuente) — no contra lo que el LLM afirme — y exige:
 *   1. HTML no trivial.
 *   2. COMPLETITUD/FIDELIDAD: cada producto de la carta aparece en el diseño.
 *   3. ALÉRGENOS: si hay productos con alérgenos, el diseño los declara (Reg. UE 1169/2011).
 *
 * Doble cara del freno: design.validar.request (el LLM lo llama en bucle) Y save RE-VALIDA
 * como gate inquebrantable (si no representa la carta → 422, NO persiste).
 *
 * Ejecutar: node tests/unit/carta-design__reflejo-validar.test.js
 */

const assert = require('assert');
const CartaDesign = require('../../modules/pizzepos/carta-design');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// carta de prueba: 3 productos, uno con alérgeno gluten
const CARTA = {
  meta: { nombre: 'Carta Nonina' },
  productos: [
    { id: 'margarita', nombre: 'Margarita', precio: 8, alergenos: ['gluten'] },
    { id: 'cumbia', nombre: 'Cumbia', precio: 10, alergenos: [] },
    { id: 'salmorejo', nombre: 'Salmorejo', precio: 5, alergenos: [] }
  ]
};

function nuevoReflejo({ cartaResp } = {}) {
  const m = new CartaDesign();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.writes = [];
  m.published = [];
  m.eventBus = { publish: (ev, p) => m.published.push([ev, p]) };
  m._rpc = async (ev, payload) => {
    if (ev === 'carta.get.request') return cartaResp !== undefined ? cartaResp : { status: 200, data: CARTA };
    if (ev === 'fs.write.request') { m.writes.push(payload); return {}; }   // éxito fs (shape real: sin status)
    return null;
  };
  return m;
}

const RELLENO = '<style>body{font-family:serif}.prod{margin:8px;padding:4px;border-bottom:1px solid #ccc}h1{text-align:center}</style>';
const htmlConProductos = (nombres, extra = '') =>
  `<html><head>${RELLENO}</head><body><h1>Carta Nonina</h1>${nombres.map(n => `<div class="prod">${n} — 8€ — descripción del producto</div>`).join('')}${extra}</body></html>`;

test('diseño completo (todos los productos + leyenda alérgenos) → valid:true', async () => {
  const m = nuevoReflejo();
  const html = htmlConProductos(['Margarita', 'Cumbia', 'Salmorejo'], '<footer>Alérgenos: 🌾 gluten</footer>');
  const r = await m._validar({ project_id: 'p', carta_id: 'c', html });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valid, true, JSON.stringify(r.data.errors));
  assert.strictEqual(r.data.productos_faltan, 0);
});

test('falta un producto → valid:false con PRODUCTOS_FALTAN y la lista faltan', async () => {
  const m = nuevoReflejo();
  const html = htmlConProductos(['Margarita', 'Cumbia'], '<footer>alérgenos: gluten</footer>'); // falta Salmorejo
  const r = await m._validar({ project_id: 'p', carta_id: 'c', html });
  assert.strictEqual(r.data.valid, false);
  const e = r.data.errors.find(x => x.code === 'PRODUCTOS_FALTAN');
  assert.ok(e, 'debe reportar PRODUCTOS_FALTAN');
  assert.deepStrictEqual(e.faltan, ['Salmorejo']);
  assert.strictEqual(r.data.productos_faltan, 1);
});

test('HTML trivial (apología/stub) → valid:false con HTML_TRIVIAL', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ project_id: 'p', carta_id: 'c', html: 'lo siento, no pude generar el diseño' });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(x => x.code === 'HTML_TRIVIAL'));
});

test('hay alérgenos en la carta pero el diseño no los declara → ALERGENOS_SIN_DECLARAR', async () => {
  const m = nuevoReflejo();
  const html = htmlConProductos(['Margarita', 'Cumbia', 'Salmorejo']); // sin leyenda ni emoji
  const r = await m._validar({ project_id: 'p', carta_id: 'c', html });
  assert.strictEqual(r.data.valid, false);
  assert.ok(r.data.errors.some(x => x.code === 'ALERGENOS_SIN_DECLARAR'));
});

test('alérgenos declarados por emoji (🌾) → cuenta como declarado', async () => {
  const m = nuevoReflejo();
  const html = htmlConProductos(['Margarita', 'Cumbia', 'Salmorejo'], '<p>🌾</p>');
  const r = await m._validar({ project_id: 'p', carta_id: 'c', html });
  assert.ok(!r.data.errors.some(x => x.code === 'ALERGENOS_SIN_DECLARAR'), 'el emoji del alérgeno cuenta como declaración');
});

test('save GATE: diseño que se deja un producto fuera → 422, NO escribe, NO emite', async () => {
  const m = nuevoReflejo();
  const html = htmlConProductos(['Margarita', 'Cumbia'], '<footer>alérgenos: gluten</footer>'); // falta Salmorejo
  const r = await m._save({ project_id: 'p', carta_id: 'c', html });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.error.code, 'UPSTREAM_INVALID_RESPONSE');
  assert.ok(r.error.details.errors.some(e => e.code === 'PRODUCTOS_FALTAN'));
  assert.strictEqual(m.writes.length, 0, 'NO debe escribir el HTML roto');
  assert.strictEqual(m.published.length, 0, 'NO debe emitir carta.html.generada');
});

test('save: diseño completo → 201, escribe HTML+meta y emite carta.html.generada', async () => {
  const m = nuevoReflejo();
  const html = htmlConProductos(['Margarita', 'Cumbia', 'Salmorejo'], '<footer>Alérgenos: gluten 🌾</footer>');
  const r = await m._save({ project_id: 'p', carta_id: 'c', html, generado_por: 'llm-pagina' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(m.writes.length, 2, 'escribe el .html y el .json companion');
  assert.ok(m.published.some(p => p[0] === 'carta.html.generada'));
});

test('validar sin html → INVALID_INPUT (400)', async () => {
  const m = nuevoReflejo();
  const r = await m._validar({ project_id: 'p', carta_id: 'c' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error.code, 'INVALID_INPUT');
});

test('carta-manager caído → 503 (no se puede validar, no se guarda)', async () => {
  const m = nuevoReflejo({ cartaResp: null });
  const html = htmlConProductos(['Margarita', 'Cumbia', 'Salmorejo']);
  const v = await m._validar({ project_id: 'p', carta_id: 'c', html });
  assert.strictEqual(v.status, 503);
  const s = await m._save({ project_id: 'p', carta_id: 'c', html });
  assert.strictEqual(s.status, 503);
  assert.strictEqual(m.writes.length, 0);
});

test('carta vacía (0 productos) → completitud trivial, valid si HTML no trivial', async () => {
  const m = nuevoReflejo({ cartaResp: { status: 200, data: { productos: [] } } });
  const r = await m._validar({ project_id: 'p', carta_id: 'c', html: htmlConProductos(['—']) });
  assert.strictEqual(r.data.valid, true);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[carta-design__reflejo-validar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[carta-design__reflejo-validar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
