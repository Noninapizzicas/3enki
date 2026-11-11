'use strict';

/**
 * instagram-bridge · bloque 9 · Q3 · NivelDeAutonomia (REFLEJO)
 *
 * La autonomia es lo unico de este bloque que el dueno CONCEDE. Por eso la
 * suite fija dos cosas: que sin declaracion el nivel es el conservador, y que
 * el sistema no puede declararse autonomia a si mismo. Un nivel suelto, una
 * declaracion del agente o el nivel de otra cuenta no ascienden nada.
 *
 * Ejecutar: node modules/instagram-bridge/tests/nivel.test.js
 */

const assert = require('assert');

const nivel = require('../autonomia/nivel');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T12:00:00Z';

function decl(extra = {}) {
  return Object.assign({ cuenta: '@Taller_A', proyecto: 'proy-a', nivel: 'ejecutar', quien: 'dueno', momento: M1 }, extra);
}

// ---------------------------------------------------------------------------
// 1 · el suelo
// ---------------------------------------------------------------------------

test('sin_nivel_declarado_devuelve_el_conservador', () => {
  // Nada declarado.
  const r = nivel.resolver(undefined, { cuenta: 'taller_a', proyecto: 'proy-a' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.nivel, 'borrador', 'sin nivel declarado, el conservador');
  assert.strictEqual(r.nivel, nivel.CONSERVADOR);
  assert.strictEqual(r.origen, 'sin_declarar');
  assert.strictEqual(r.motivo, nivel.MOTIVOS.SIN_NIVEL_DECLARADO);

  // Una lista vacia tampoco es una declaracion.
  assert.strictEqual(nivel.resolver([], { cuenta: 'taller_a' }).nivel, 'borrador');
  assert.strictEqual(nivel.resolver({ niveles: [] }, { cuenta: 'taller_a' }).nivel, 'borrador');
  assert.strictEqual(nivel.resolver(null, { cuenta: 'taller_a' }).nivel, 'borrador');

  // Y sin cuenta no hay a quien declararle nada.
  const sinCuenta = nivel.resolver(decl(), {});
  assert.strictEqual(sinCuenta.nivel, 'borrador');
  assert.deepStrictEqual(sinCuenta.faltan, ['cuenta']);

  // El conservador es el PRIMERO de la escalera, no un valor aparte.
  assert.strictEqual(nivel.NIVELES[0], 'borrador');
  assert.strictEqual(nivel.indice('borrador'), 0);
  assert.strictEqual(nivel.bajar('borrador'), 'borrador', 'del suelo no se baja mas');
});

test('un_nivel_suelto_no_es_una_declaracion', () => {
  // 'ejecutar' como string no tiene quien lo firme.
  const r = nivel.resolver('ejecutar', { cuenta: 'taller_a', proyecto: 'proy-a' });
  assert.strictEqual(r.nivel, 'borrador');
  assert.strictEqual(r.origen, 'sin_declarar');

  // Y un objeto sin `quien` tampoco.
  const sinQuien = nivel.resolver({ cuenta: 'taller_a', nivel: 'ejecutar' }, { cuenta: 'taller_a' });
  assert.strictEqual(sinQuien.nivel, 'borrador');
  assert.strictEqual(sinQuien.motivo, nivel.MOTIVOS.NIVEL_SIN_DECLARANTE);
  assert.strictEqual(sinQuien.declarado, 'ejecutar', 'se ve el intento, no se aplica');
});

test('solo_el_dueno_declara_autonomia', () => {
  const delDueno = nivel.resolver(decl(), { cuenta: 'taller_a', proyecto: 'proy-a' });
  assert.strictEqual(delDueno.nivel, 'ejecutar');
  assert.strictEqual(delDueno.origen, 'declarado');

  // El agente y el sistema pueden escribir la declaracion, pero no se aplica.
  for (const quien of ['agente', 'sistema']) {
    const r = nivel.resolver(decl({ quien }), { cuenta: 'taller_a', proyecto: 'proy-a' });
    assert.strictEqual(r.nivel, 'borrador', `${quien} no puede subirse la autonomia`);
    assert.strictEqual(r.origen, 'rebajado');
    assert.strictEqual(r.motivo, nivel.MOTIVOS.NIVEL_NO_LO_DECLARA_EL_DUENO);
    assert.strictEqual(r.declarado, 'ejecutar');
  }

  // Un declarante que no es nadie tampoco.
  assert.strictEqual(nivel.resolver(decl({ quien: 'root' }), { cuenta: 'taller_a' }).nivel, 'borrador');
});

// ---------------------------------------------------------------------------
// 2 · el ambito
// ---------------------------------------------------------------------------

test('el_nivel_es_de_una_cuenta_y_de_un_proyecto', () => {
  // Pedir prestado el nivel de una cuenta con buena fama no vale.
  const otra = nivel.resolver(decl({ cuenta: 'otra_cuenta' }), { cuenta: 'taller_a', proyecto: 'proy-a' });
  assert.strictEqual(otra.nivel, 'borrador');
  assert.strictEqual(otra.motivo, nivel.MOTIVOS.NIVEL_DE_OTRA_CUENTA);

  // Ni el de otro proyecto.
  const otroProy = nivel.resolver(decl({ proyecto: 'proy-b' }), { cuenta: 'taller_a', proyecto: 'proy-a' });
  assert.strictEqual(otroProy.nivel, 'borrador');
  assert.strictEqual(otroProy.motivo, nivel.MOTIVOS.NIVEL_DE_OTRO_PROYECTO);

  // La cuenta se compara normalizada: @Taller_A es taller_a.
  assert.strictEqual(nivel.resolver(decl(), { cuenta: 'taller_a', proyecto: 'proy-a' }).nivel, 'ejecutar');
  assert.strictEqual(nivel.resolver(decl({ cuenta: 'TALLER_A' }), { cuenta: '@Taller_A' }).nivel, 'ejecutar');
});

test('nivel_desconocido_no_asciende', () => {
  const r = nivel.resolver(decl({ nivel: 'dios' }), { cuenta: 'taller_a' });
  assert.strictEqual(r.nivel, 'borrador');
  assert.strictEqual(r.motivo, nivel.MOTIVOS.NIVEL_DESCONOCIDO);

  // Tampoco un nivel de otra escala o con mayusculas.
  assert.strictEqual(nivel.resolver(decl({ nivel: 'EJECUTAR' }), { cuenta: 'taller_a' }).nivel, 'borrador');
  assert.strictEqual(nivel.resolver(decl({ nivel: 'auto' }), { cuenta: 'taller_a' }).nivel, 'borrador');
});

test('una_declaracion_caducada_no_sigue_vigente', () => {
  const r = nivel.resolver(decl({ vigente_hasta: M1 }), { cuenta: 'taller_a', proyecto: 'proy-a', momento: M2 });
  assert.strictEqual(r.nivel, 'borrador');
  assert.strictEqual(r.motivo, nivel.MOTIVOS.DECLARACION_CADUCADA);

  // Dentro de plazo si vale.
  const vivo = nivel.resolver(decl({ vigente_hasta: M2 }), { cuenta: 'taller_a', proyecto: 'proy-a', momento: M1 });
  assert.strictEqual(vivo.nivel, 'ejecutar');

  // Sin momento no se puede decir que este vivo: no se aplica.
  const sinMomento = nivel.resolver(decl({ vigente_hasta: M2 }), { cuenta: 'taller_a', proyecto: 'proy-a' });
  assert.strictEqual(sinMomento.nivel, 'borrador');
});

// ---------------------------------------------------------------------------
// 3 · la escalera
// ---------------------------------------------------------------------------

test('la_escalera_no_tiene_atajos', () => {
  assert.deepStrictEqual(nivel.NIVELES, ['borrador', 'permiso', 'ejecutar']);
  assert.strictEqual(nivel.mas_conservador('ejecutar', 'permiso'), 'permiso');
  assert.strictEqual(nivel.mas_conservador('borrador', 'ejecutar'), 'borrador');
  assert.strictEqual(nivel.mas_conservador('dios', 'permiso'), 'permiso', 'el que no vale no compite');
  assert.strictEqual(nivel.mas_conservador('dios', 'otro'), 'borrador');

  assert.strictEqual(nivel.comparar('borrador', 'ejecutar'), -1);
  assert.strictEqual(nivel.comparar('ejecutar', 'borrador'), 1);
  assert.strictEqual(nivel.comparar('permiso', 'permiso'), 0);
  assert.strictEqual(nivel.comparar('permiso', 'dios'), null);

  assert.strictEqual(nivel.bajar('ejecutar'), 'permiso');
  assert.strictEqual(nivel.bajar('permiso'), 'borrador');
  assert.strictEqual(nivel.bajar('borrador'), 'borrador');
  assert.strictEqual(nivel.bajar('dios'), 'borrador', 'lo que no vale cae al suelo');

  assert.strictEqual(nivel.subir('borrador'), 'permiso');
  assert.strictEqual(nivel.subir('ejecutar'), 'ejecutar');
  assert.strictEqual(nivel.techo('dios'), 'borrador');
});

test('una_declaracion_bien_formada_se_puede_validar_antes_de_creerla', () => {
  assert.strictEqual(nivel.validar_declaracion(decl()).ok, true);

  const falta = nivel.validar_declaracion({ cuenta: 'a', nivel: 'ejecutar' });
  assert.strictEqual(falta.ok, false);
  assert.ok(falta.faltan.includes('quien'));
  assert.ok(falta.faltan.includes('momento'));

  const malo = nivel.validar_declaracion(decl({ nivel: 'dios', quien: 'root' }));
  assert.strictEqual(malo.ok, false);
  assert.deepStrictEqual(malo.invalidos.sort(), ['nivel', 'quien']);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__nivel] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__nivel] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
