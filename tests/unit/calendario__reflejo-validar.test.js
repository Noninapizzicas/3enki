'use strict';

/**
 * calendario — REFLEJO _validar (la confluencia oferta/demanda de la panadería).
 *
 * Dado un calendario de producto (dias_salida + margen_antelacion_h), _validar
 * confirma si una fecha pedida encaja: día de salida Y margen de antelación cumplido.
 * Si no cuadra, propone el día válido más cercano (semilla de H2 motor de validación).
 *
 * La lógica es pura (dada una config), pero _validar lee la config vía _custodio,
 * así que el test stubea _custodio.leer. Ejecutar: node tests/unit/calendario__reflejo-validar.test.js
 */

const assert = require('assert');
const Calendario = require('../../modules/calendario/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// pan: sale lunes(1)/miércoles(3), margen 24h.
const CONFIG = {
  esquema: 'calendario-v1',
  productos: {
    pan: { dias_salida: [1, 3], margen_antelacion_h: 24 }
  }
};

function nuevo() {
  const m = new Calendario();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m._custodio = { leer: async () => ({ config: CONFIG }) };
  return m;
}

// 2026-08-24 = lunes(1) · 2026-08-23 = domingo(7) · 2026-08-30 = domingo(7)
const LUNES = '2026-08-24';
const DOMINGO = '2026-08-23';

test('día de salida + margen cumplido → valido:true', async () => {
  const m = nuevo();
  const r = await m._validar({ producto_id: 'pan', fecha_deseada: LUNES, ahora: '2026-08-22T10:00:00Z' }); // 48h
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.valido, true, JSON.stringify(r.data));
  assert.strictEqual(r.data.dia_semana, 'lunes');
  assert.strictEqual(r.data.motivo, null);
});

test('día que no sale + margen no cumplido → valido:false, propone el próximo día', async () => {
  const m = nuevo();
  const r = await m._validar({ producto_id: 'pan', fecha_deseada: DOMINGO, ahora: '2026-08-23T08:00:00Z' }); // domingo, 0h
  assert.strictEqual(r.data.valido, false);
  assert.ok(/no sale en domingo/.test(r.data.motivo));
  assert.ok(/margen/.test(r.data.motivo));
  assert.strictEqual(r.data.propuesta.dia, 'lunes'); // próximo día de salida
});

test('día que no sale pero margen sí → valido:false solo por día, propone', async () => {
  const m = nuevo();
  const r = await m._validar({ producto_id: 'pan', fecha_deseada: '2026-08-30', ahora: '2026-08-28T10:00:00Z' }); // domingo, 48h
  assert.strictEqual(r.data.valido, false);
  assert.strictEqual(r.data.motivo, 'no sale en domingo'); // el margen no aparece: está cumplido
  assert.strictEqual(r.data.propuesta.dia, 'lunes');
});

test('margen no cumplido aunque el día salga → valido:false', async () => {
  const m = nuevo();
  const r = await m._validar({ producto_id: 'pan', fecha_deseada: LUNES, ahora: '2026-08-23T12:00:00Z' }); // lunes pero solo 12h < 24h
  assert.strictEqual(r.data.valido, false);
  assert.ok(/margen/.test(r.data.motivo));
});

test('sin calendario para el producto → 404 RESOURCE_NOT_FOUND', async () => {
  const m = nuevo();
  const r = await m._validar({ producto_id: 'inexistente', fecha_deseada: LUNES });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.error, 'RESOURCE_NOT_FOUND');
});

test('sin producto_id → INVALID_INPUT (400)', async () => {
  const m = nuevo();
  const r = await m._validar({ fecha_deseada: LUNES });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.error, 'INVALID_INPUT');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[calendario__reflejo-validar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[calendario__reflejo-validar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
