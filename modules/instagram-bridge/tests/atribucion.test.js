'use strict';

/**
 * instagram-bridge · E2 · SelloDeAtribucion (REFLEJO)
 *
 * Lo publicado lleva a quien pertenece. Esta suite fija:
 *   - una pieza HUERFANA no sale (sin sello, sin atribucion o incoherente);
 *   - el puente NO FIRMA: ni `sellar` ni `firmar` ponen su nombre;
 *   - la atribucion es del proyecto dueno de la cuenta y no se reescribe;
 *   - `auditar` devuelve la lista de huerfanas, no una advertencia.
 *
 * Ejecutar: node modules/instagram-bridge/tests/atribucion.test.js
 */

const assert = require('assert');

const atribucion = require('../core/atribucion');
const { crear_sello } = require('../core/formas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';

function sello(proyecto = 'proy-a', opts = {}) {
  return crear_sello(Object.assign({
    proyecto,
    cuenta: 'taller_a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno'
  }, opts)).sello;
}

function pieza(opts = {}) {
  return Object.assign({
    id: 'pieza-1',
    proyecto: 'proy-a',
    texto: 'Volvemos al torno el lunes',
    sello: sello()
  }, opts);
}

const CUENTA = { proyecto: 'proy-a', cuenta: '@taller_a' };

// ---------------------------------------------------------------------------
// 1 · la regla del bloque
// ---------------------------------------------------------------------------

test('pieza_huerfana_no_sale_y_el_puente_no_firma', () => {
  // --- huerfana por falta de sello: no se puede saber de quien es ----------
  const sinSello = pieza({ id: 'p-sin-sello' });
  delete sinSello.sello;

  const v1 = atribucion.verificar(sinSello);
  assert.strictEqual(v1.ok, false);
  assert.strictEqual(v1.estado, 'huerfana');
  assert.strictEqual(v1.motivo, 'pieza_huerfana');
  assert.strictEqual(v1.causa, 'sin_sello');

  const s1 = atribucion.sellar(sinSello, CUENTA);
  assert.strictEqual(s1.ok, false);
  assert.strictEqual(s1.motivo, 'pieza_huerfana');
  assert.strictEqual(s1.pieza, undefined, 'no hay pieza sellada que publicar');

  // --- sellada pero SIN atribucion: no ha pasado por E2 --------------------
  const v2 = atribucion.verificar(pieza({ id: 'p-sin-atribucion' }));
  assert.strictEqual(v2.ok, false);
  assert.strictEqual(v2.motivo, 'sin_atribucion');
  assert.strictEqual(v2.estado, 'huerfana');

  // --- sellada y atribuida: sale ------------------------------------------
  const buena = pieza({ id: 'p-buena' });
  const s2 = atribucion.sellar(buena, CUENTA);
  assert.strictEqual(s2.ok, true, s2.motivo);
  assert.strictEqual(s2.atribucion.proyecto, 'proy-a');
  assert.strictEqual(s2.atribucion.cuenta, 'taller_a');
  assert.strictEqual(s2.atribucion.autor, 'proyecto');
  assert.strictEqual(s2.atribucion.firmado_por_el_puente, false);
  assert.strictEqual(s2.atribucion.momento, M1, 'el momento sale del sello, no de un reloj escondido');
  assert.ok(Object.isFrozen(s2.atribucion), 'la atribucion nace congelada: no se reescribe');
  assert.deepStrictEqual(atribucion.verificar(s2.pieza).proyecto, 'proy-a');

  // --- el puente NO FIRMA --------------------------------------------------
  const firma = atribucion.firmar('instagram-bridge');
  assert.strictEqual(firma.ok, false);
  assert.strictEqual(firma.motivo, 'el_puente_no_firma', 'no hay argumento que haga firmar al puente');

  const puenteComoDueno = atribucion.sellar(pieza({ id: 'p-puente' }), { proyecto: 'instagram-bridge', cuenta: '@taller_a' });
  assert.strictEqual(puenteComoDueno.ok, false);
  assert.strictEqual(puenteComoDueno.motivo, 'firma_del_puente');

  // Una pieza cuyo sello es del puente tampoco es publicable.
  const selladaPorElPuente = pieza({ id: 'p-sello-puente', sello: sello('puente') });
  const v3 = atribucion.verificar(selladaPorElPuente);
  assert.strictEqual(v3.ok, false);
  assert.strictEqual(v3.motivo, 'firma_del_puente');

  const s3 = atribucion.sellar(selladaPorElPuente, { proyecto: 'puente', cuenta: '@taller_a' });
  assert.strictEqual(s3.ok, false);
  assert.strictEqual(s3.motivo, 'firma_del_puente');

  // --- una cuenta sin dueno no atribuye nada -------------------------------
  const sinDueno = atribucion.sellar(pieza({ id: 'p-sin-dueno' }), { cuenta: '@taller_a' });
  assert.strictEqual(sinDueno.ok, false);
  assert.strictEqual(sinDueno.motivo, 'cuenta_sin_dueno');

  const sinCuenta = atribucion.sellar(pieza({ id: 'p-sin-cuenta' }), { proyecto: 'proy-a' });
  assert.strictEqual(sinCuenta.ok, false);
  assert.strictEqual(sinCuenta.motivo, 'sin_cuenta');

  // --- no se atribuye a otro proyecto una pieza sellada por uno ------------
  const ajena = atribucion.sellar(pieza({ id: 'p-ajena' }), { proyecto: 'proy-b', cuenta: '@taller_a' });
  assert.strictEqual(ajena.ok, false);
  assert.strictEqual(ajena.motivo, 'proyecto_ajeno');

  // --- la atribucion no se reescribe --------------------------------------
  const otraVez = atribucion.sellar(s2.pieza, CUENTA);
  assert.strictEqual(otraVez.ok, true);
  assert.strictEqual(otraVez.idempotente, true, 'el mismo dueno es un reintento, no un cambio');

  const cambioDeDueno = atribucion.sellar(
    Object.assign({}, s2.pieza, { sello: sello('proy-b') }),
    { proyecto: 'proy-b', cuenta: '@taller_a' }
  );
  assert.strictEqual(cambioDeDueno.ok, false);
  assert.strictEqual(cambioDeDueno.motivo, 'atribucion_ya_fijada');

  // --- auditoria de lo publicado ------------------------------------------
  const auditado = atribucion.auditar([
    s2.pieza,
    pieza({ id: 'p-huerfana' }),
    pieza({ id: 'p-firma', sello: sello('enki') })
  ]);
  assert.strictEqual(auditado.ok, false);
  assert.strictEqual(auditado.total, 3);
  assert.strictEqual(auditado.atribuidas, 1);
  assert.strictEqual(auditado.huerfanas.length, 2);
  assert.strictEqual(auditado.firmas.length, 1);
  assert.strictEqual(auditado.firmas[0].indice, 2);

  const limpio = atribucion.auditar([s2.pieza]);
  assert.strictEqual(limpio.ok, true);
  assert.deepStrictEqual(limpio.huerfanas, []);
});

test('un_autor_del_puente_en_la_pieza_tambien_es_firma', () => {
  const s = atribucion.sellar(pieza({ autor: 'dueno' }), CUENTA);
  assert.strictEqual(s.ok, true);

  const conAutorPuente = pieza({ autor: 'sistema' });
  const r = atribucion.sellar(conAutorPuente, CUENTA);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'firma_del_puente');
  assert.ok(r.invalidos.includes('autor'));

  // ... y una pieza ya atribuida cuyo autor es el puente no se da por buena.
  const yaFirmada = atribucion.sellar(pieza(), CUENTA).pieza;
  yaFirmada.autor = 'bridge';
  const v = atribucion.verificar(yaFirmada);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.motivo, 'firma_del_puente');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__atribucion] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__atribucion] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
