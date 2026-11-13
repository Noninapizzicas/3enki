'use strict';

/**
 * instagram-bridge · R1 · TaxonomiaDeFallos (REFLEJO)
 *
 * Esta suite fija lo que no se puede relajar del bloque 4:
 *   - SEIS familias cerradas, con codigo estable, dueno y remedio;
 *   - el enum de Rust es ESPEJO del JS: el test LEE `crate/src/contrato/fallo.rs`,
 *     extrae las variantes y falla si una orilla tiene una familia que la otra no;
 *   - `limite_alcanzado` NO es un error: es un INPUT del regulador (G2/G6), con
 *     `es_error: false`, `reintentable: false` y remedio `regular`;
 *   - lo que no se reconoce cae en `interfaz` (conservador) y se marca;
 *   - los codigos son CONTRATO: no se mueven aunque cambie el texto.
 *
 * El test de paridad no compara con una lista copiada a mano: lee el .rs. Si
 * anades una familia en un lado y no en el otro, se pone rojo.
 *
 * Ejecutar: node modules/instagram-bridge/tests/fallos.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fallos = require('../core/fallos');

const RUTA_RUST = path.resolve(__dirname, '../crate/src/contrato/fallo.rs');
const RUTA_CARGO = path.resolve(__dirname, '../crate/Cargo.toml');
const FUENTE_RUST = fs.readFileSync(RUTA_RUST, 'utf8');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------------------------------------------------------------------------
// lector del fichero de Rust (el test de paridad lee, no adivina)
// ---------------------------------------------------------------------------

/** Devuelve el contenido entre las llaves que abren en/despues de `desde`. */
function cuerpo_llaves(texto, desde) {
  const abre = texto.indexOf('{', desde);
  assert.notStrictEqual(abre, -1, 'se esperaba un bloque entre llaves en el fichero de Rust');
  let nivel = 0;
  for (let i = abre; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '{') nivel += 1;
    else if (c === '}') {
      nivel -= 1;
      if (nivel === 0) return texto.slice(abre + 1, i);
    }
  }
  throw new Error('bloque sin cerrar en crate/src/contrato/fallo.rs');
}

/** Bloque de un `pub enum X {` o `impl X {` del fichero de Rust. */
function bloque(marca) {
  const i = FUENTE_RUST.indexOf(marca);
  assert.notStrictEqual(i, -1, `no encuentro «${marca}» en crate/src/contrato/fallo.rs`);
  return cuerpo_llaves(FUENTE_RUST, i);
}

/** Cuerpo de una `fn` dentro de un bloque de impl. */
function fn_de(impl, nombre) {
  const m = new RegExp(`fn\\s+${nombre}\\s*\\(`).exec(impl);
  assert.ok(m, `no encuentro «fn ${nombre}» en el impl de Rust`);
  return cuerpo_llaves(impl, m.index);
}

/** CamelCase -> snake_case, igual que los codigos de contrato. */
function snake(texto) {
  return texto.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** Pares capturados por una regex global: { variante: valor }. */
function pares(bloque_texto, re, valor) {
  const out = {};
  for (const m of bloque_texto.matchAll(re)) out[m[1]] = valor(m);
  return out;
}

function leer_rust() {
  const enum_familias = bloque('pub enum FamiliaDeFallo');

  // Variantes: lineas sueltas `    Sesion,` dentro del enum (sin atributos ni
  // comentarios: si los hubiera, no casan con esta forma y el test avisa).
  const variantes = [];
  for (const linea of enum_familias.split('\n')) {
    const m = /^\s{4}([A-Z][A-Za-z0-9]*),\s*$/.exec(linea);
    if (m) variantes.push(m[1]);
  }
  assert.ok(variantes.length > 0, 'el enum de Rust no tiene variantes legibles');

  const impl = bloque('impl FamiliaDeFallo');

  const codigos = pares(fn_de(impl, 'codigo'), /FamiliaDeFallo::(\w+)\s*=>\s*"([a-z_]+)"/g, (m) => m[2]);
  const remedios = pares(fn_de(impl, 'remedio'), /FamiliaDeFallo::(\w+)\s*=>\s*Remedio::(\w+)/g, (m) => snake(m[2]));
  const duenos = pares(fn_de(impl, 'dueno'), /FamiliaDeFallo::(\w+)\s*=>\s*"([A-Za-z]+)"/g, (m) => m[2]);

  // Flags: cada brazo dice true/false; el comodin `_` es el valor por defecto.
  function flags(nombre) {
    const cuerpo = fn_de(impl, nombre);
    const por_variante = {};
    for (const m of cuerpo.matchAll(/(\w+)\s*=>\s*(true|false)/g)) {
      por_variante[m[1]] = m[2] === 'true';
    }
    const comodin = por_variante._;
    assert.strictEqual(typeof comodin, 'boolean', `«fn ${nombre}» de Rust necesita un comodin _ => true|false`);
    for (const v of variantes) if (!(v in por_variante)) por_variante[v] = comodin;
    return por_variante;
  }

  return {
    variantes,
    codigos,
    remedios,
    duenos,
    es_error: flags('es_error'),
    es_reintentable: flags('es_reintentable')
  };
}

// ---------------------------------------------------------------------------
// 1 · el test de paridad
// ---------------------------------------------------------------------------

test('las_seis_familias_coinciden_en_js_y_rust', () => {
  const rust = leer_rust();
  const js = fallos.FAMILIAS;

  // 1. Las seis, y en el mismo orden. Nada de listas paralelas: el enum de Rust
  //    es la unica otra copia y este test la compara con la del JS.
  assert.deepStrictEqual(
    rust.variantes.map(snake),
    js.map((f) => f.codigo),
    'las variantes del enum de Rust tienen que ser exactamente las familias del JS, en el mismo orden'
  );

  // 2. Cada familia: mismo codigo, mismo remedio, mismo dueno y mismos flags.
  for (const familia of js) {
    const variante = rust.variantes.find((v) => snake(v) === familia.codigo);
    assert.ok(variante, `Rust no tiene la familia «${familia.codigo}»`);

    assert.strictEqual(
      rust.codigos[variante],
      familia.codigo,
      `el codigo declarado en Rust para ${variante} no es «${familia.codigo}»`
    );
    assert.strictEqual(
      snake(variante),
      familia.codigo,
      `la variante ${variante} se escribe distinto que su codigo de contrato`
    );
    assert.strictEqual(
      rust.remedios[variante],
      familia.que_hace_el_sistema,
      `la familia «${familia.codigo}» declara remedios distintos en JS y Rust`
    );
    assert.strictEqual(
      rust.duenos[variante],
      familia.dueno,
      `la familia «${familia.codigo}» declara duenos distintos en JS y Rust`
    );
    assert.strictEqual(
      rust.es_error[variante],
      familia.es_error,
      `la familia «${familia.codigo}» discrepa en es_error`
    );
    assert.strictEqual(
      rust.es_reintentable[variante],
      familia.reintentable,
      `la familia «${familia.codigo}» discrepa en es_reintentable`
    );
  }

  // 3. Ni familias de mas en un lado ni brazos sueltos en el otro.
  for (const mapa of [rust.codigos, rust.remedios, rust.duenos]) {
    assert.deepStrictEqual(
      Object.keys(mapa).sort(),
      rust.variantes.slice().sort(),
      'el impl de Rust tiene brazos para variantes que el enum no declara'
    );
  }
  assert.strictEqual(new Set(js.map((f) => f.codigo)).size, js.length, 'hay codigos repetidos en JS');
  assert.strictEqual(fallos.CODIGOS.length, 6, 'R1 son SEIS familias');
});

// ---------------------------------------------------------------------------
// 2 · la regla del bloque: el freno no es averia
// ---------------------------------------------------------------------------

test('limite_alcanzado_no_es_error_sino_input_del_regulador', () => {
  const familia = fallos.familia('limite_alcanzado');
  assert.ok(familia, 'la familia limite_alcanzado tiene que existir');

  // 1. Declarada como NO error, NO reintentable y con remedio `regular`.
  assert.strictEqual(familia.es_error, false, 'un freno de la plataforma no es una averia');
  assert.strictEqual(familia.reintentable, false, 'reintentar contra un castigo lo empeora');
  assert.strictEqual(familia.que_hace_el_sistema, 'regular');
  assert.ok(fallos.REMEDIOS.includes('regular'));
  assert.ok(!fallos.REMEDIOS_DE_ERROR.includes('regular'), 'regular no es un remedio de error');

  // 2. Clasificar el fallo no lo convierte en error ni propone reintento.
  const clasificado = fallos.clasificar({ familia_fallo: 'limite_alcanzado', motivo: 'cuota_agotada' });
  assert.strictEqual(clasificado.familia, 'limite_alcanzado');
  assert.strictEqual(clasificado.es_error, false);
  assert.strictEqual(clasificado.va_al_regulador, true);
  assert.notStrictEqual(clasificado.que_hace_el_sistema, 'reintentar');
  assert.strictEqual(clasificado.conservador, false);

  // 3. La senal sale para G2/G6; para una averia de verdad, no.
  const senal = fallos.senal_de_regulador({ familia_fallo: 'limite_alcanzado', motivo: 'cuota_agotada' });
  assert.ok(senal, 'un limite alcanzado SIEMPRE produce senal de regulador');
  assert.strictEqual(senal.es_senal, true);
  assert.strictEqual(senal.familia, 'limite_alcanzado');
  assert.strictEqual(senal.es_error, false);
  assert.strictEqual(senal.va_al_regulador, true);

  assert.strictEqual(fallos.senal_de_regulador({ familia_fallo: 'interfaz' }), null);
  assert.strictEqual(fallos.senal_de_regulador({ familia_fallo: 'sesion' }), null);
  assert.strictEqual(fallos.senal_de_regulador({ motivo: 'no_llego' }), null);

  // 4. El motivo tambien basta: el payload del bus trae el motivo, no siempre
  //    la familia resuelta.
  assert.strictEqual(fallos.clasificar({ motivo: 'cuota_agotada' }).familia, 'limite_alcanzado');
  assert.strictEqual(fallos.clasificar({ motivo: 'castigo' }).es_error, false);

  // 5. Y en Rust, la misma regla: las otras cinco son errores y dan remedios de
  //    error; el comodin no se lleva el freno por delante.
  const rust = leer_rust();
  const variante_limite = rust.variantes.find((v) => snake(v) === 'limite_alcanzado');
  assert.strictEqual(rust.es_error[variante_limite], false);
  assert.strictEqual(rust.es_reintentable[variante_limite], false);
  assert.strictEqual(rust.remedios[variante_limite], 'regular');
  for (const variante of rust.variantes) {
    if (variante === variante_limite) continue;
    assert.strictEqual(rust.es_error[variante], true, `${variante} tiene que ser error en Rust`);
    assert.notStrictEqual(rust.remedios[variante], 'regular', `${variante} no puede ser un freno`);
  }
});

// ---------------------------------------------------------------------------
// 3 · conservador: lo que no se reconoce para
// ---------------------------------------------------------------------------

test('una_familia_desconocida_cae_en_interfaz_y_se_marca', () => {
  const raro = fallos.clasificar({ familia_fallo: 'septima', motivo: 'pantalla_verde' });

  assert.strictEqual(raro.familia, 'interfaz', 'lo desconocido se clasifica conservadoramente');
  assert.strictEqual(raro.conservador, true, 'y se marca: no se reconocio, no se comprobo');
  assert.strictEqual(raro.es_error, true);
  assert.strictEqual(raro.reintentable, false, 'insistir contra lo desconocido es como se publica dos veces');
  assert.strictEqual(raro.que_hace_el_sistema, 'declarar_rotura');
  assert.strictEqual(raro.motivo, 'pantalla_verde', 'el motivo original no se pierde');
});

test('un_sobre_con_ok_true_no_se_clasifica_como_fallo', () => {
  const exito = fallos.clasificar({ ok: true, familia_fallo: 'plataforma' });

  assert.strictEqual(exito.clasificado, false, 'un ok:true no es un fallo');
  assert.strictEqual(exito.familia, null);
  assert.strictEqual(exito.es_error, false);
  assert.strictEqual(fallos.senal_de_regulador({ ok: true }), null);
});

// ---------------------------------------------------------------------------
// 4 · contrato: codigos fijos, dueno y remedio en toda familia
// ---------------------------------------------------------------------------

test('los_codigos_son_contrato_y_no_se_mueven', () => {
  assert.deepStrictEqual(fallos.CODIGOS, [
    'sesion',
    'aparato',
    'interfaz',
    'plataforma',
    'dato_que_falta',
    'limite_alcanzado'
  ]);

  for (const familia of fallos.FAMILIAS) {
    assert.match(familia.codigo, /^[a-z][a-z0-9_]*$/, `codigo no snake_case: ${familia.codigo}`);
    assert.ok(familia.descripcion && familia.descripcion.length > 20, `sin descripcion: ${familia.codigo}`);
    assert.ok(fallos.REMEDIOS.includes(familia.que_hace_el_sistema), `remedio inventado en ${familia.codigo}`);
    assert.ok(fallos.dueno(familia.codigo), `sin dueno: ${familia.codigo}`);
    assert.strictEqual(Object.isFrozen(familia), true, 'las familias no se reescriben en caliente');
  }
  assert.strictEqual(Object.isFrozen(fallos.FAMILIAS), true);
  assert.strictEqual(Object.isFrozen(fallos.CODIGOS), true);

  // El remedio `reintentar` es de una sola familia, y no es el freno.
  const reintentables = fallos.FAMILIAS.filter((f) => f.reintentable).map((f) => f.codigo);
  assert.deepStrictEqual(reintentables, ['plataforma']);
});

test('el_enum_de_rust_no_arrastra_dependencias_externas', () => {
  // Los comentarios pueden NOMBRAR serde (explican por que no se usa); lo que
  // se comprueba es el codigo: ni atributos de serde ni crates externos.
  const codigo = FUENTE_RUST.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
  assert.ok(!/serde/i.test(codigo), 'el enum espejo no lleva serde todavia');
  assert.ok(!/extern\s+crate/.test(codigo), 'sin crates externos en el contrato del aparato');

  const cargo = fs.readFileSync(RUTA_CARGO, 'utf8');
  const deps = /\[dependencies\]([\s\S]*?)(\n\[|$)/.exec(cargo);
  const cuerpo = deps ? deps[1].replace(/#[^\n]*/g, '').trim() : '';

  // El bloque 16 rompe el "0 dependencias" del crate en UNA superficie: el canal
  // con el bus (WebSocket seguro + TLS). No es una grieta abierta: es una lista
  // cerrada. Cualquier crate que no sea una de estas tres hace fallar este test,
  // y las tres estan justificadas en Cargo.toml y en el README (bloque 16).
  const PERMITIDAS = ['rustls', 'tungstenite', 'webpki-roots'];
  // Solo las lineas `nombre = ...` cuentan: las continuaciones de una tabla
  // (`features = [...]` partido en varias lineas) no son dependencias.
  const declaradas = [...cuerpo.matchAll(/^([A-Za-z0-9_-]+)\s*=/gm)].map((m) => m[1]);

  assert.deepStrictEqual(
    declaradas.slice().sort(),
    PERMITIDAS.slice().sort(),
    `el aparato solo admite las dependencias del canal; declara: ${declaradas.join(', ')}`
  );
  assert.ok(
    !/serde/i.test(cuerpo),
    'el contrato del aparato no usa serde: el JSON del canal es propio'
  );
});

// ---------------------------------------------------------------------------
// 5 · los remedios declarados existen y dicen que hacer
// ---------------------------------------------------------------------------

test('cada_remedio_declarado_dice_que_se_hace', () => {
  assert.deepStrictEqual(fallos.REMEDIOS_DE_ERROR, [
    'reintentar',
    'volver',
    'escalar',
    'pedir_persona',
    'declarar_rotura',
    'esperar',
    'preguntar'
  ]);

  for (const remedio of fallos.REMEDIOS) {
    assert.ok(fallos.POR_QUE_DEL_REMEDIO[remedio], `el remedio «${remedio}» no dice que se hace`);
  }

  // Una familia que no existe no inventa dueno ni reintento.
  assert.strictEqual(fallos.familia('septima'), null);
  assert.strictEqual(fallos.dueno('septima'), null);
  assert.strictEqual(fallos.remedio('septima'), null);
  assert.strictEqual(fallos.es_reintentable('septima'), false);
  assert.strictEqual(fallos.es_error('septima'), true, 'lo desconocido se trata como error');
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let passed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { fails.push({ name, err }); }
}
if (fails.length === 0) { console.log(`\n[instagram-bridge__fallos] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[instagram-bridge__fallos] FAIL ${fails.length}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);
