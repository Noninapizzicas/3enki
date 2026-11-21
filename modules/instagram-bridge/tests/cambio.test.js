'use strict';

/**
 * instagram-bridge · M2 · CambioDesdeUltimaLectura (REFLEJO)
 *
 * La regla del bloque, fijada aqui:
 *
 *   **sin retrato anterior hay PRIMERA LECTURA, no "cambio"** (no se inventa
 *   un delta contra la nada).
 *
 * La prueba no se queda en `tipo: 'primera_lectura'`: comprueba que NO hay
 * delta, que `hay_delta` es false y que `sin_cambio` es false. Es la parte que
 * de verdad importa: un `0 cambios` contra la nada se lee como "todo igual".
 *
 * Y las otras tres cosas que no son un cambio: otra cuenta, un anterior sin
 * fecha y un anterior posterior. Ninguna produce delta.
 *
 * Ejecutar: node modules/instagram-bridge/tests/cambio.test.js
 */

const assert = require('assert');

const m2 = require('../core/cambio');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SELLO = { proyecto: 'proy-a', cuenta: 'taller_a', plataforma: 'instagram' };

function foto(tomado_en, datos, extra) {
  return Object.assign({ sello: SELLO, tomado_en, datos }, extra || {});
}

const ANTES = foto('2026-11-10T09:00:00Z', [
  { nombre: 'seguidores', valor: 100, leido_en: '2026-11-10T08:58:00Z' },
  { nombre: 'alcance', valor: 500, leido_en: '2026-11-10T08:58:00Z' }
]);

const AHORA = foto('2026-11-11T09:00:00Z', [
  { nombre: 'seguidores', valor: 112, leido_en: '2026-11-11T08:58:00Z' },
  { nombre: 'alcance', valor: 500, leido_en: '2026-11-11T08:58:00Z' }
]);

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('sin_retrato_anterior_hay_primera_lectura_no_cambio', () => {
  for (const nada of [null, undefined]) {
    const r = m2.comparar(AHORA, nada);

    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.tipo, 'primera_lectura');
    assert.strictEqual(r.motivo, 'sin_retrato_anterior');
    assert.strictEqual(r.hay_delta, false);
    assert.strictEqual(r.delta, null, 'no hay delta que ensenar');
    assert.deepStrictEqual(r.cambios, []);
    assert.deepStrictEqual(r.nuevos, []);
    assert.deepStrictEqual(r.desaparecidos, []);
    assert.strictEqual(r.sin_cambio, false, 'primera lectura NO es "sin cambios"');
    assert.strictEqual(r.desde, null);
    assert.strictEqual(r.intervalo_s, null);
  }

  // Y con anterior SI hay cambio: la primera lectura no es un modo degradado
  // que luego no compara nada.
  const conAnterior = m2.comparar(AHORA, ANTES);
  assert.strictEqual(conAnterior.tipo, 'cambio');
  assert.strictEqual(conAnterior.hay_delta, true);
  assert.strictEqual(conAnterior.cambios.length, 1);
  assert.strictEqual(conAnterior.cambios[0].nombre, 'seguidores');
  assert.strictEqual(conAnterior.cambios[0].diferencia, 12);
  assert.strictEqual(conAnterior.cambios[0].variacion_pct, 12);
  assert.strictEqual(conAnterior.delta.seguidores, 12);
  assert.strictEqual(conAnterior.sin_cambio, false);
  assert.strictEqual(conAnterior.intervalo_s, 86400);
});

// ---------------------------------------------------------------------------
// 2 · lo que tampoco es un cambio
// ---------------------------------------------------------------------------

test('un_retrato_de_otra_cuenta_es_primera_lectura', () => {
  const ajeno = foto('2026-11-10T09:00:00Z', [
    { nombre: 'seguidores', valor: 5, leido_en: '2026-11-10T08:58:00Z' }
  ], { sello: { proyecto: 'proy-a', cuenta: 'taller_b' } });

  const r = m2.comparar(AHORA, ajeno);
  assert.strictEqual(r.tipo, 'primera_lectura');
  assert.strictEqual(r.motivo, 'retrato_anterior_de_otra_cuenta');
  assert.strictEqual(r.delta, null);
  assert.deepStrictEqual(r.cambios, []);
});

test('un_retrato_anterior_sin_fecha_es_primera_lectura', () => {
  const sinFecha = foto(undefined, [
    { nombre: 'seguidores', valor: 100, leido_en: '2026-11-10T08:58:00Z' }
  ]);
  const r = m2.comparar(AHORA, sinFecha);
  assert.strictEqual(r.tipo, 'primera_lectura');
  assert.strictEqual(r.motivo, 'retrato_anterior_sin_fecha');
  assert.strictEqual(r.delta, null);
});

test('un_retrato_anterior_ilegible_es_primera_lectura', () => {
  const r = m2.comparar(AHORA, 'ayer habia 100');
  assert.strictEqual(r.tipo, 'primera_lectura');
  assert.strictEqual(r.motivo, 'retrato_anterior_invalido');
  assert.strictEqual(r.anterior_descartado, true);
  assert.strictEqual(r.delta, null);
});

test('comparar_contra_el_futuro_se_rechaza_no_se_le_da_la_vuelta', () => {
  const futuro = foto('2026-11-12T09:00:00Z', [
    { nombre: 'seguidores', valor: 200, leido_en: '2026-11-12T08:58:00Z' }
  ]);
  const r = m2.comparar(AHORA, futuro);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.tipo, 'no_comparable');
  assert.strictEqual(r.motivo, 'retrato_anterior_no_es_anterior');
  assert.strictEqual(r.delta, null);

  const mismo = m2.comparar(AHORA, Object.assign({}, AHORA));
  assert.strictEqual(mismo.ok, false);
  assert.strictEqual(mismo.motivo, 'mismo_momento');
});

// ---------------------------------------------------------------------------
// 3 · los datos sin fecha no entran en el delta
// ---------------------------------------------------------------------------

test('un_dato_sin_fecha_se_omite_y_se_nombra', () => {
  const actual = foto('2026-11-11T09:00:00Z', [
    { nombre: 'seguidores', valor: 112, leido_en: '2026-11-11T08:58:00Z' },
    { nombre: 'alcance', valor: 900 }
  ]);
  const r = m2.comparar(actual, ANTES);
  assert.strictEqual(r.tipo, 'cambio');
  assert.strictEqual(r.cambios.length, 1);
  assert.strictEqual(r.cambios[0].nombre, 'seguidores');
  assert.deepStrictEqual(r.omitidos, [{ nombre: 'alcance', motivo: 'dato_sin_fecha' }]);
  assert.strictEqual(r.delta.alcance, undefined, 'no se compara una opinion');

  // Si TODOS los datos vienen sin fecha, no hay nada comparable.
  const todoSinFecha = foto('2026-11-11T09:00:00Z', [{ nombre: 'seguidores', valor: 1 }]);
  const r2 = m2.comparar(todoSinFecha, ANTES);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.tipo, 'no_comparable');
  assert.strictEqual(r2.motivo, 'dato_sin_fecha');
});

test('un_dato_que_desaparece_se_declara', () => {
  const actual = foto('2026-11-11T09:00:00Z', [
    { nombre: 'seguidores', valor: 100, leido_en: '2026-11-11T08:58:00Z' }
  ]);
  const r = m2.comparar(actual, ANTES);
  assert.strictEqual(r.desaparecidos.length, 1);
  assert.strictEqual(r.desaparecidos[0].nombre, 'alcance');
  assert.strictEqual(r.sin_cambio, false);
  assert.ok(r.resumen.includes('ya no aparece'));
});

test('sin_tocar_nada_el_resultado_es_sin_cambio', () => {
  const igual = foto('2026-11-11T09:00:00Z', [
    { nombre: 'seguidores', valor: 100, leido_en: '2026-11-11T08:58:00Z' },
    { nombre: 'alcance', valor: 500, leido_en: '2026-11-11T08:58:00Z' }
  ]);
  const r = m2.comparar(igual, ANTES);
  assert.strictEqual(r.tipo, 'cambio', 'hay dos lecturas: eso ya es comparable');
  assert.strictEqual(r.hay_delta, true);
  assert.strictEqual(r.sin_cambio, true);
  assert.deepStrictEqual(r.cambios, []);
  assert.deepStrictEqual(r.delta, {});
  assert.strictEqual(r.iguales, 2);
});

test('la_tolerancia_evita_ruido_de_medida', () => {
  const actual = foto('2026-11-11T09:00:00Z', [
    { nombre: 'seguidores', valor: 100.4, leido_en: '2026-11-11T08:58:00Z' },
    { nombre: 'alcance', valor: 500, leido_en: '2026-11-11T08:58:00Z' }
  ]);
  assert.strictEqual(m2.comparar(actual, ANTES).cambios.length, 1);
  assert.strictEqual(m2.comparar(actual, ANTES, { tolerancia: 1 }).cambios.length, 0);
});

// ---------------------------------------------------------------------------
// 4 · historial
// ---------------------------------------------------------------------------

test('se_compara_contra_la_lectura_inmediatamente_anterior', () => {
  const vieja = foto('2026-11-01T09:00:00Z', [
    { nombre: 'seguidores', valor: 1, leido_en: '2026-11-01T08:58:00Z' }
  ]);
  const media = foto('2026-11-10T09:00:00Z', [
    { nombre: 'seguidores', valor: 100, leido_en: '2026-11-10T08:58:00Z' }
  ]);
  const actual = foto('2026-11-11T09:00:00Z', [
    { nombre: 'seguidores', valor: 112, leido_en: '2026-11-11T08:58:00Z' }
  ]);

  // Desordenado a proposito: el historial no promete orden.
  const r = m2.comparar_con_historial(actual, [media, vieja, actual]);
  assert.strictEqual(r.tipo, 'cambio');
  assert.strictEqual(r.cambios[0].antes, 100, 'no se compara contra la mas vieja');
  assert.strictEqual(r.anteriores_del_mismo_sello, 2);

  // Sin ninguna anterior: primera lectura, no delta contra la nada.
  const sola = m2.comparar_con_historial(vieja, [media, actual]);
  assert.strictEqual(sola.tipo, 'primera_lectura');
  assert.strictEqual(sola.motivo, 'sin_retrato_anterior');
  assert.strictEqual(sola.delta, null);
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__cambio] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__cambio] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
