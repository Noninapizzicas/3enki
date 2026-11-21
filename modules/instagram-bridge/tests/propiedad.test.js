'use strict';

/**
 * instagram-bridge · P3 · ReglaDePropiedad (REFLEJO)
 *
 * El saber hacer se comparte y se mejora una vez para todos; el estado no se
 * comparte jamas. Esta suite fija, almacen por almacen:
 *   - el estado de A no aparece en B: ni lo ve, ni lo toca, ni cae en su informe.
 *   - el catalogo de recetas y la memoria de cambios (saber hacer) los ve
 *     cualquier proyecto.
 *   - un almacen privado con datos de dos proyectos es un EXCESO (no una
 *     comodidad); un almacen que no esta en la tabla tambien.
 *   - el almacen comun no admite estado privado dentro (la direccion de la fuga
 *     que importa).
 *   - sin sello no hay dueno: ni permiso de ver ni de tocar.
 *   - el padron es multi-proyecto POR DISENO (es el indice de quien es dueno de
 *     que) y no cuenta como mezcla.
 *
 * Ejecutar: node modules/instagram-bridge/tests/propiedad.test.js
 */

const assert = require('assert');
const { sellar, anadir_historia } = require('../core/sello');
const { filtrar } = require('../core/ambito');
const {
  COMPARTIBLES, PRIVADOS, propietario, puede_ver, puede_tocar,
  es_compartible, exigir_privado, exigir_compartible, verificar_mezcla
} = require('../core/propiedad');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MOMENTO = '2026-11-11T12:00:00Z';

function dato(proyecto, almacen, contenido, cuenta) {
  const r = sellar(Object.assign({ almacen }, contenido || {}), {
    proyecto, cuenta: cuenta || (proyecto === 'proy-a' ? '@taller_a' : '@taller_c'),
    aparato: 'movil-1', momento: MOMENTO, quien: 'dueno'
  });
  assert.strictEqual(r.ok, true, `no se pudo sellar el fixture de ${proyecto}`);
  return r.dato;
}

// Estado de A y estado de B: mismo tipo de dato, dueno distinto.
const retratoA = dato('proy-a', 'retratos', { id: 'retrato-a', seguidores: 10 });
const retratoB = dato('proy-b', 'retratos', { id: 'retrato-b', seguidores: 99 });
const bandejaA = dato('proy-a', 'bandejas', { id: 'bandeja-a', mensaje: 'cuanto cuesta?' });
const bandejaB = dato('proy-b', 'bandejas', { id: 'bandeja-b', mensaje: 'hay stock?' });
const autorizacionA = dato('proy-a', 'autorizaciones', { id: 'aut-a', alcance: 'publicar' });
const autorizacionB = dato('proy-b', 'autorizaciones', { id: 'aut-b', alcance: 'responder' });
const receta = dato('proy-a', 'catalogo-recetas', { id: 'receta-1', capacidad: 'publicar', version: 2 });
const cambio = dato('proy-a', 'memoria-cambios', { id: 'cambio-1', que: 'el boton Crear paso a +' });

test('el_estado_de_A_no_aparece_en_B', () => {
  const estadoA = [retratoA, bandejaA, autorizacionA];
  const estadoB = [retratoB, bandejaB, autorizacionB];

  // Lo que B ve al leer su ambito: nada de A, ni un solo campo.
  const leidoPorB = filtrar(estadoA.concat(estadoB), 'proy-b');
  assert.deepStrictEqual(leidoPorB.map((d) => d.id).sort(), ['aut-b', 'bandeja-b', 'retrato-b']);
  assert.ok(!leidoPorB.some((d) => d.id.endsWith('-a')), 'ningun dato de A en el informe de B');

  // Pregunta a pregunta: B no ve ni toca el estado de A.
  for (const deA of estadoA) {
    assert.strictEqual(propietario(deA), 'proy-a');
    assert.strictEqual(puede_ver({ proyecto: 'proy-b' }, deA), false);
    assert.strictEqual(puede_tocar({ proyecto: 'proy-b' }, deA), false);
    assert.strictEqual(puede_ver({ proyecto: 'proy-a' }, deA), true);
    assert.strictEqual(puede_tocar({ proyecto: 'proy-a' }, deA), true);
  }

  // El dueno de los dos proyectos los ve, pero cada uno por su ambito: la
  // identidad multi-proyecto no convierte un almacen privado en compartido.
  assert.strictEqual(puede_ver({ proyectos: ['proy-a', 'proy-b'] }, retratoA), true);
  assert.strictEqual(filtrar(estadoA.concat(estadoB), 'proy-a').some((d) => d.id === 'retrato-b'), false);
});

test('saber_hacer_se_comparte_y_se_mejora_una_vez', () => {
  assert.strictEqual(es_compartible(receta), true);
  assert.strictEqual(es_compartible(cambio), true);
  assert.deepStrictEqual(COMPARTIBLES.slice().sort(), ['catalogo-recetas', 'memoria-cambios']);

  // Cualquier proyecto ve el saber comun...
  assert.strictEqual(puede_ver({ proyecto: 'proy-b' }, receta), true);
  assert.strictEqual(puede_ver({ proyecto: 'proy-z' }, cambio), true);
  // ...y puede proponer una mejora (la escribe el custodio del catalogo, con
  // atribucion: E2; la regla de aqui es que no se le cierra la puerta).
  assert.strictEqual(puede_tocar({ proyecto: 'proy-b' }, receta), true);
  assert.strictEqual(exigir_compartible(receta).ok, true);
});

test('el_estado_no_se_comparte_jamas', () => {
  assert.strictEqual(es_compartible(retratoA), false);
  assert.strictEqual(puede_ver({ proyecto: 'proy-b' }, bandejaA), false);
  assert.strictEqual(puede_tocar({ proyecto: 'proy-b' }, autorizacionA), false);
  assert.strictEqual(es_compartible({ id: 'sin-almacen-declarado' }), false, 'sin declaracion no se comparte');
});

test('almacen_privado_con_dos_proyectos_es_exceso', () => {
  const soloA = verificar_mezcla({ nombre: 'retratos', datos: [retratoA] });
  assert.strictEqual(soloA.estado, 'limpio');
  assert.strictEqual(soloA.clase, 'privado');

  const mezclado = verificar_mezcla({ nombre: 'retratos', datos: [retratoA, retratoB] });
  assert.strictEqual(mezclado.estado, 'exceso');
  assert.strictEqual(mezclado.hallazgos.length, 1);
  assert.strictEqual(mezclado.hallazgos[0].motivo, 'mezcla_de_proyectos');
  assert.match(mezclado.hallazgos[0].detalle, /proy-a/);
  assert.match(mezclado.hallazgos[0].detalle, /proy-b/);
});

test('almacen_que_no_esta_declarado_es_exceso', () => {
  const r = verificar_mezcla({ nombre: 'historial-impresiones', datos: [] });
  assert.strictEqual(r.estado, 'exceso');
  assert.strictEqual(r.hallazgos[0].motivo, 'almacen_no_declarado');
  assert.strictEqual(verificar_mezcla([retratoA]).estado, 'exceso', 'sin nombre no hay clase declarada');
});

test('un_almacen_privado_no_admite_un_dato_sin_sello', () => {
  const r = verificar_mezcla({ nombre: 'bandejas', datos: [bandejaA, { id: 'colado' }] });
  assert.strictEqual(r.estado, 'exceso');
  assert.strictEqual(r.hallazgos[0].motivo, 'dato_sin_sello');
});

test('el_almacen_comun_no_admite_estado_privado', () => {
  // La direccion que importa: estado de una cuenta colandose en el saber comun.
  const r = verificar_mezcla({ nombre: 'catalogo-recetas', datos: [receta, retratoA] });
  assert.strictEqual(r.estado, 'exceso');
  assert.strictEqual(r.hallazgos[0].motivo, 'mezcla_de_clases');
  assert.match(r.hallazgos[0].detalle, /retratos/);

  assert.strictEqual(exigir_compartible(retratoA).ok, false);
  assert.strictEqual(exigir_compartible(retratoA).motivo, 'no_es_compartible');
});

test('exigir_privado_rechaza_lo_compartible_y_lo_no_declarado', () => {
  assert.strictEqual(exigir_privado(retratoA).ok, true);
  assert.strictEqual(exigir_privado(receta).ok, false);
  assert.strictEqual(exigir_privado(receta).motivo, 'no_es_privado');
  assert.strictEqual(exigir_privado({ id: 'sin-almacen' }).motivo, 'almacen_no_declarado');
  assert.deepStrictEqual(PRIVADOS.includes('retratos'), true);
});

test('sin_sello_no_hay_dueno_ni_permiso', () => {
  const huerfano = { almacen: 'retratos', id: 'x' };
  assert.strictEqual(propietario(huerfano), null);
  assert.strictEqual(puede_ver({ proyecto: 'proy-a' }, huerfano), false);
  assert.strictEqual(puede_tocar({ proyecto: 'proy-a' }, huerfano), false);
  assert.strictEqual(puede_ver({}, receta), false, 'sin identidad no hay lectura');
  assert.strictEqual(puede_tocar({}, receta), false);
});

test('el_padron_admite_varios_proyectos_por_diseno', () => {
  const cuentaA = dato('proy-a', 'padron', { cuenta: '@taller_a', estado: 'vigente' });
  const cuentaB = dato('proy-b', 'padron', { cuenta: '@taller_c', estado: 'vigente' });
  const r = verificar_mezcla({ nombre: 'padron', datos: [cuentaA, cuentaB] });
  assert.strictEqual(r.estado, 'limpio', 'el padron es el indice de duenos, no estado de uno');
  assert.strictEqual(r.clase, 'registro');
  // Aun asi, cada proyecto sigue viendo solo su entrada.
  assert.strictEqual(puede_ver({ proyecto: 'proy-b' }, cuentaA), false);
});

test('propietario_sigue_el_sello_vigente_tras_un_traspaso', () => {
  const traspaso = anadir_historia(retratoA, {
    a: { proyecto: 'proy-b', cuenta: '@taller_a', aparato: 'movil-1', momento: MOMENTO, quien: 'dueno' },
    motivo: 'traspaso de la cuenta',
    momento: '2026-11-12T08:00:00Z',
    quien: 'dueno'
  });
  assert.strictEqual(traspaso.ok, true);
  assert.strictEqual(retratoA.sello.proyecto, 'proy-a', 'el sello de nacimiento no se toca');
  assert.strictEqual(propietario(traspaso.dato), 'proy-b', 'el dueno vigente es el destino');
  assert.strictEqual(puede_ver({ proyecto: 'proy-a' }, traspaso.dato), false);
  assert.strictEqual(puede_ver({ proyecto: 'proy-b' }, traspaso.dato), true);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__propiedad] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__propiedad] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
