'use strict';

/**
 * instagram-bridge · T2 · FronteraSinIdentidad (REFLEJO)
 *
 * El puente no tiene identidad publica propia. Esta suite fija:
 *   - `vetar` rechaza toda firma del puente, sin excepciones;
 *   - `auditar` exige que TODO este atribuido a un proyecto y que ninguna firma
 *     sea del puente;
 *   - sobre el padron ENTERO: una cuenta sin proyecto dueno es un FALLO DE ALTA
 *     (`cuenta_sin_proyecto_dueno`), no una cuenta del sistema; una cuenta con
 *     proyecto o handle del puente si es una identidad del sistema.
 *
 * Ejecutar: node modules/instagram-bridge/tests/frontera-identidad.test.js
 */

const assert = require('assert');

const t2 = require('../core/frontera-identidad');
const atribucion = require('../core/atribucion');
const { crear_sello } = require('../core/formas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';

function sello(proyecto = 'proy-a') {
  return crear_sello({
    proyecto,
    cuenta: 'taller_a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno'
  }).sello;
}

function pieza(opts = {}) {
  return Object.assign({
    id: 'pieza-1',
    origen: 'proy-a',
    autor: 'dueno',
    texto: 'Volvemos al torno el lunes',
    sello: sello()
  }, opts);
}

function atribuida(proyecto = 'proy-a', opts = {}) {
  return atribucion.sellar(pieza(opts), { proyecto, cuenta: '@taller_a' }).pieza;
}

// ---------------------------------------------------------------------------
// 1 · la regla del bloque
// ---------------------------------------------------------------------------

test('cuenta_sin_proyecto_dueno_es_fallo_de_alta', () => {
  // --- un asiento sin proyecto no es una cuenta del sistema: es un alta a medias
  const padronRoto = {
    esquema: 'padron-cuentas-v1',
    revision: 1,
    asientos: [
      { plataforma: 'instagram', cuenta: 'taller_a', proyecto: 'proy-a', aparato: 'movil-1' },
      { plataforma: 'instagram', cuenta: 'huerfana', proyecto: '', aparato: 'movil-9' }
    ]
  };

  const r = t2.hay_cuenta_del_sistema(padronRoto);
  assert.strictEqual(r.ok, false, 'un padron con un alta a medias no esta limpio');
  assert.strictEqual(r.hay, false, 'no es una cuenta del sistema');
  assert.strictEqual(r.fallos_de_alta.length, 1);
  assert.strictEqual(r.fallos_de_alta[0].motivo, 'cuenta_sin_proyecto_dueno');
  assert.strictEqual(r.fallos_de_alta[0].cuenta, 'huerfana');
  assert.ok(r.fallos_de_alta[0].pista.includes('alta a medias'));

  // --- una cuenta a nombre del puente SI es una identidad del sistema
  const padronConSistema = {
    asientos: [
      { plataforma: 'instagram', cuenta: 'taller_a', proyecto: 'proy-a' },
      { plataforma: 'instagram', cuenta: 'instagram_bridge', proyecto: 'proy-a' }
    ]
  };
  const s = t2.hay_cuenta_del_sistema(padronConSistema);
  assert.strictEqual(s.ok, false);
  assert.strictEqual(s.hay, true);
  assert.strictEqual(s.cuentas[0].motivo, 'cuenta_del_sistema');
  assert.strictEqual(s.cuentas[0].cuenta, 'instagram_bridge');
  assert.deepStrictEqual(s.fallos_de_alta, []);

  // ... y un proyecto que es el puente tampoco es un proyecto dueno.
  const padronProyectoPuente = { asientos: [{ plataforma: 'instagram', cuenta: 'taller_a', proyecto: 'enki' }] };
  const p = t2.hay_cuenta_del_sistema(padronProyectoPuente);
  assert.strictEqual(p.hay, true);
  assert.strictEqual(p.cuentas[0].proyecto, 'enki');

  // --- padron limpio y padron ausente -------------------------------------
  const limpio = t2.hay_cuenta_del_sistema({ asientos: [{ plataforma: 'instagram', cuenta: 'taller_a', proyecto: 'proy-a' }] });
  assert.strictEqual(limpio.ok, true);
  assert.strictEqual(limpio.hay, false);

  const sinPadron = t2.hay_cuenta_del_sistema(null);
  assert.strictEqual(sinPadron.ok, false);
  assert.strictEqual(sinPadron.motivo, 'sin_padron');
  assert.strictEqual(sinPadron.hay, false);

  // --- vetar: el puente no firma ------------------------------------------
  for (const firma of ['instagram-bridge', 'puente', 'sistema', 'enki', { actor: 'bridge' }, { autor: 'puente' }]) {
    const v = t2.vetar(firma);
    assert.strictEqual(v.ok, false, `${JSON.stringify(firma)} no puede firmar`);
    assert.strictEqual(v.motivo, 'firma_del_puente');
  }
  assert.strictEqual(t2.vetar('proy-a').ok, true);
  assert.strictEqual(t2.vetar('proy-a').motivo, 'no_cuenta_nada');
  assert.strictEqual(t2.vetar(undefined).motivo, 'sin_firma');

  // --- auditar lo publicado -----------------------------------------------
  const buena = atribuida();

  // Una pieza publicada por otra via, con la firma del puente puesta: T2 audita
  // lo publicado tal como esta, no lo que E2 habria dejado pasar.
  const delPuente = pieza({
    id: 'p-del-puente',
    origen: 'instagram-bridge',
    sello: sello('instagram-bridge'),
    atribucion: { proyecto: 'instagram-bridge', cuenta: 'taller_a', autor: 'proyecto', firmado_por_el_puente: false }
  });
  const sinAtribucion = pieza({ id: 'p-sin-atribucion' });

  const auditado = t2.auditar([buena, delPuente, sinAtribucion]);
  assert.strictEqual(auditado.ok, false);
  assert.strictEqual(auditado.limpio, false);
  assert.strictEqual(auditado.total, 3);
  assert.strictEqual(auditado.firmas.length, 1);
  assert.strictEqual(auditado.firmas[0].indice, 1);
  assert.strictEqual(auditado.sin_atribucion.length, 1);
  assert.strictEqual(auditado.sin_atribucion[0].indice, 2);

  const soloBuena = t2.auditar({ piezas: [buena] });
  assert.strictEqual(soloBuena.ok, true);
  assert.strictEqual(soloBuena.limpio, true);

  // La auditoria del padron es la misma pregunta, con su nombre del diseno.
  assert.strictEqual(t2.auditar_padron({ asientos: [] }).ok, true);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__frontera-identidad] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__frontera-identidad] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
