'use strict';

/**
 * instagram-bridge · bloque 9 · Q4 · VentanaDeArrepentimiento (REFLEJO)
 *
 * La ventana es el unico consuelo de lo irreversible. Lo que esta suite no deja
 * pasar:
 *   - **cancelar es una cancelacion, no un fallo**: se registra con
 *     `resultado: 'cancelacion'` y `es_fallo: false`, y un historial que las
 *     contara como fallos acabaria pidiendo permisos por miedo;
 *   - **el momento se inyecta**: dos llamadas con el mismo momento dan la misma
 *     ventana, y cerrar "antes de tiempo" no vale;
 *   - **no se acorta por peticion**: se puede pedir mas rato, nunca menos, y hay
 *     un tope duro.
 *
 * Ejecutar: node modules/instagram-bridge/tests/ventana.test.js
 */

const assert = require('assert');

const ventana = require('../autonomia/ventana');
const casillas = require('../core/casillas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const T0 = '2026-11-11T12:00:00Z';
const T1 = '2026-11-11T12:01:00Z';   // 60 s: dentro de publicar (120 s)
const T2 = '2026-11-11T12:02:00Z';   // 120 s: justo el borde
const T3 = '2026-11-11T12:05:00Z';   // fuera

function abrir(extra = {}) {
  const r = ventana.abrir(Object.assign({ accion: 'publicar', momento: T0, operacion_id: 'op-1' }, extra));
  assert.strictEqual(r.ok, true, r.motivo);
  return r;
}

// ---------------------------------------------------------------------------
// 1 · cancelar no es fallar
// ---------------------------------------------------------------------------

test('cancelacion_se_registra_como_cancelacion_no_como_fallo', () => {
  const v = abrir();
  assert.strictEqual(v.ventana.estado, 'abierta');
  assert.strictEqual(v.ventana.exigida, true, 'publicar es irreversible: la ventana es obligatoria');
  assert.strictEqual(v.ventana.cierra_en, '2026-11-11T12:02:00Z');
  assert.strictEqual(v.ventana.segundos, 120);

  const c = ventana.cancelar(v.ventana, { momento: T1, quien: 'dueno', motivo: 'no me convence el texto' });

  // Lo que devuelve: cancelacion, con la persona y el motivo.
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.resultado, 'cancelacion');
  assert.strictEqual(c.es_fallo, false, 'arrepentirse a tiempo no es un fallo');
  assert.strictEqual(c.ventana.estado, 'cancelada');
  assert.strictEqual(c.ventana.cancelada_en, T1);
  assert.strictEqual(c.ventana.cancelacion.quien, 'dueno');
  assert.strictEqual(c.ventana.cancelacion.motivo, 'no me convence el texto');

  // Y el veredicto que se apunta en el historial dice lo mismo.
  const r = ventana.resultado_de(c.ventana, T1);
  assert.strictEqual(r.resultado, 'cancelacion');
  assert.strictEqual(r.es_fallo, false);
  assert.strictEqual(ventana.es_fallo(c.ventana, T1), false);

  // Que es lo contrario de "no se pudo": una ventana que se cierra sola no es
  // un fallo, y una cancelacion tardia tampoco (aunque no cancele nada).
  const tarde = ventana.cancelar(v.ventana, { momento: T3, quien: 'dueno', motivo: 'se me paso' });
  assert.strictEqual(tarde.ok, false);
  assert.strictEqual(tarde.motivo, ventana.MOTIVOS.VENTANA_CERRADA);
  assert.strictEqual(tarde.es_fallo, false, 'llegar tarde tampoco es un fallo');
});

test('cancelar_dos_veces_no_reescribe_la_primera', () => {
  const v = abrir();
  const primera = ventana.cancelar(v.ventana, { momento: T1, quien: 'dueno', motivo: 'no' });
  const segunda = ventana.cancelar(primera.ventana, { momento: '2026-11-11T12:01:30Z', quien: 'agente', motivo: 'otra cosa' });

  assert.strictEqual(segunda.ok, false);
  assert.strictEqual(segunda.motivo, ventana.MOTIVOS.YA_CANCELADA);
  assert.strictEqual(segunda.es_fallo, false);
  assert.strictEqual(segunda.ventana.cancelacion.quien, 'dueno', 'la primera palabra es la que queda');
  assert.strictEqual(segunda.resultado, 'cancelacion');
});

test('cancelar_exige_motivo_y_quien', () => {
  const v = abrir();
  assert.strictEqual(ventana.cancelar(v.ventana, { momento: T1, quien: 'dueno' }).motivo, ventana.MOTIVOS.SIN_MOTIVO);
  assert.strictEqual(ventana.cancelar(v.ventana, { momento: T1, motivo: 'x' }).motivo, ventana.MOTIVOS.SIN_QUIEN);
  assert.strictEqual(ventana.cancelar(v.ventana, { quien: 'dueno', motivo: 'x' }).motivo, ventana.MOTIVOS.SIN_MOMENTO);
});

// ---------------------------------------------------------------------------
// 2 · el reloj se inyecta
// ---------------------------------------------------------------------------

test('la_ventana_usa_el_momento_inyectado_y_no_el_reloj', () => {
  // Dos aperturas con el mismo momento son la misma ventana, aunque las separe
  // el tiempo real. Y con otro momento, otra ventana.
  const a = abrir();
  const b = abrir();
  assert.strictEqual(a.ventana.cierra_en, b.ventana.cierra_en);
  assert.strictEqual(a.ventana.ventana_id, b.ventana.ventana_id);

  const otro = abrir({ momento: '2026-11-11T18:00:00Z' });
  assert.notStrictEqual(otro.ventana.ventana_id, a.ventana.ventana_id);
  assert.strictEqual(otro.ventana.cierra_en, '2026-11-11T18:02:00Z');

  // El estado se calcula contra el momento que le dan, no contra "ahora".
  assert.strictEqual(ventana.estado(a.ventana, '2026-11-11T11:00:00Z'), 'abierta');
  assert.strictEqual(ventana.estado(a.ventana, T1), 'abierta');
  assert.strictEqual(ventana.estado(a.ventana, T2), 'consumada', 'en el borde ya cerro');
  assert.strictEqual(ventana.restante(a.ventana, T0), 120);
  assert.strictEqual(ventana.restante(a.ventana, T1), 60);
  assert.strictEqual(ventana.restante(a.ventana, T3), 0);

  // Sin momento no se inventa nada.
  assert.strictEqual(ventana.abrir({ accion: 'publicar' }).ok, false);
  assert.strictEqual(ventana.estado(a.ventana, undefined), 'desconocida');
});

test('no_se_acorta_por_peticion_se_alarga', () => {
  // Pedir 5 segundos para publicar no vale: manda lo declarado (120).
  const corta = abrir({ segundos: 5 });
  assert.strictEqual(corta.ventana.segundos, 120);
  assert.strictEqual(corta.ventana.alargada, false);
  assert.strictEqual(corta.porque.regla, 'nunca menos de lo declarado');

  // Pedir mas si vale (y se anota que se alargo).
  const larga = abrir({ segundos: 300 });
  assert.strictEqual(larga.ventana.segundos, 300);
  assert.strictEqual(larga.ventana.alargada, true);

  // Pero no infinito: tope duro.
  const infinita = abrir({ segundos: 999999 });
  assert.strictEqual(infinita.ventana.segundos, ventana.VENTANA_MAXIMA_SEGUNDOS);
  assert.strictEqual(infinita.ventana.segundos, 600);
});

test('cerrar_antes_de_tiempo_no_vale', () => {
  const v = abrir();

  // Consumar en mitad de la ventana seria ejecutar sin dar tiempo a arrepentirse.
  const pronto = ventana.consumar(v.ventana, { momento: T1 });
  assert.strictEqual(pronto.ok, false);
  assert.strictEqual(pronto.motivo, ventana.MOTIVOS.AUN_ABIERTA);
  assert.strictEqual(pronto.resultado, 'abierta');
  assert.strictEqual(pronto.restante, 60);
  assert.strictEqual(pronto.es_fallo, false);

  // Cuando ya cerro, se consuma.
  const tarde = ventana.consumar(v.ventana, { momento: T2 });
  assert.strictEqual(tarde.ok, true);
  assert.strictEqual(tarde.resultado, 'consumada');
  assert.strictEqual(tarde.ventana.consumada_en, T2);
  assert.strictEqual(tarde.ventana.estado, 'consumada');

  // Y una cancelada ya no se consume.
  const c = ventana.cancelar(v.ventana, { momento: T1, quien: 'dueno', motivo: 'no' });
  const trasCancelar = ventana.consumar(c.ventana, { momento: T3 });
  assert.strictEqual(trasCancelar.ok, false);
  assert.strictEqual(trasCancelar.resultado, 'cancelacion');
  assert.strictEqual(trasCancelar.es_fallo, false);
});

// ---------------------------------------------------------------------------
// 3 · sin casilla no hay ventana
// ---------------------------------------------------------------------------

test('sin_casilla_no_hay_ventana', () => {
  const r = ventana.abrir({ accion: 'volar', momento: T0 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, ventana.MOTIVOS.ACCION_SIN_CASILLA, 'una ventana para algo que no va a pasar es una mentira');

  // Una accion reversible no necesita ventana, pero la ventana existe con 0 s.
  const leer = ventana.abrir({ accion: 'leer', momento: T0 });
  assert.strictEqual(leer.ok, true);
  assert.strictEqual(leer.ventana.segundos, 0);
  assert.strictEqual(leer.ventana.exigida, false);
  assert.strictEqual(leer.ventana.cierra_en, T0);
});

test('toda_accion_irreversible_abre_ventana_exigida', () => {
  for (const accion of casillas.acciones()) {
    const r = ventana.abrir({ accion, momento: T0 });
    assert.strictEqual(r.ok, true, `${accion}: ${r.motivo}`);
    assert.strictEqual(r.ventana.exigida, casillas.es_irreversible(accion), accion);
  }
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__ventana] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__ventana] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
