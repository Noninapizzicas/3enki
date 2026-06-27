'use strict';

/**
 * ai-gateway · nervio propioceptivo — composición de la sección inyectada.
 *
 * El nervio pide limite:10. Si entre dos turnos pasaron MÁS de 10 eventos en el
 * proyecto, handleLeer devuelve los 10 más nuevos (slice) pero reporta el total
 * real. Esta suite fija que la sección NO finge lista completa: declara cuántos
 * eventos viejos quedaron fuera (honra "no silent caps: log what was dropped").
 *
 * Ejecutar: node tests/unit/ai-gateway__propiocepcion-nervio.test.js
 */

const assert = require('assert');
const AiGateway = require('../../modules/conversacion/ai-gateway');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function ev(modulo, resumen, tipo = 'reflejo') {
  return { modulo, resumen, tipo };
}

test('sin elisión (total == mostrados): no añade la nota', () => {
  const m = new AiGateway();
  const eventos = [ev('escandallo', 'costeo masa -> 1.45€/ud'), ev('recetas', 'creo receta "Margarita"', 'consciente')];
  const s = m._composePropiocepcionSection(eventos, 2);
  assert.ok(/# LO QUE PASO EN TU MUNDO/.test(s));
  assert.ok(s.includes('costeo masa'));
  assert.ok(!/no mostrado/.test(s), 'no debería declarar elididos cuando no los hay');
});

test('con elisión (total > mostrados): declara cuántos quedaron fuera', () => {
  const m = new AiGateway();
  const eventos = Array.from({ length: 10 }, (_, i) => ev('escandallo', `costeo r${i}`));
  const s = m._composePropiocepcionSection(eventos, 17); // 17 nuevos, 10 mostrados
  assert.ok(/\+7 evento/.test(s), `debe declarar +7 elididos: ${s}`);
  assert.ok(/propiocepcion\.leer/.test(s), 'debe apuntar a la tool para el resto');
});

test('total ausente/no finito: degrada sin romper (no añade nota)', () => {
  const m = new AiGateway();
  const eventos = [ev('recetas', 'creo receta "X"', 'consciente')];
  const s = m._composePropiocepcionSection(eventos, undefined);
  assert.ok(s.includes('creo receta'));
  assert.ok(!/no mostrado/.test(s));
});

test('la sección manda usarla en SILENCIO (memoria de fondo)', () => {
  const m = new AiGateway();
  const s = m._composePropiocepcionSection([ev('recetas', 'creo receta "X"')], 1);
  assert.ok(/SILENCIO/.test(s));
  assert.ok(/NO lo recites/.test(s));
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[ai-gateway__propiocepcion-nervio] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[ai-gateway__propiocepcion-nervio] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
