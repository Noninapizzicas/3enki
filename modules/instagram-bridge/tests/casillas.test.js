'use strict';

/**
 * instagram-bridge · bloque 9 · Q1 · CasillaDeAccion (REFLEJO)
 *
 * Esta suite fija la regla que hace posible todo el bloque: **una accion sin
 * casilla no se ejecuta**. No hay casilla por defecto, ni casilla que traiga el
 * que pide, ni accion "nueva" que se ejecute "mientras se decide". Y fija
 * tambien la tabla: que la reversibilidad sea la de los abogados (si se notifico,
 * no es reversible) y que la huella ate ambito, accion y rol.
 *
 * Ejecutar: node modules/instagram-bridge/tests/casillas.test.js
 */

const assert = require('assert');

const casillas = require('../core/casillas');
const ritmo = require('../core/ritmo');
const puerta = require('../autonomia/puerta');
const politica = require('../autonomia/politica');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';

// ---------------------------------------------------------------------------
// 1 · la regla dura
// ---------------------------------------------------------------------------

test('accion_sin_casilla_no_se_ejecuta', () => {
  // Una accion que la tabla no conoce no tiene casilla...
  assert.strictEqual(casillas.casilla_de('volar'), null);
  assert.strictEqual(casillas.es_accion('volar'), false);

  // ...y por tanto no se puede ejecutar. Punto.
  const v = casillas.validar('volar');
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.motivo, casillas.MOTIVOS.ACCION_SIN_CASILLA);
  assert.strictEqual(casillas.puede_ejecutarse('volar'), false, 'sin casilla no se ejecuta');
  assert.strictEqual(casillas.puede_ejecutarse({ accion: 'publicar_story' }), false);
  assert.strictEqual(casillas.puede_ejecutarse({}), false, 'sin accion tampoco');
  assert.strictEqual(casillas.puede_ejecutarse(undefined), false);

  // Traerse la propia casilla no salva a una accion desconocida: manda la tabla.
  const conCasilla = casillas.validar({
    accion: 'volar',
    casilla: { reversibilidad: 'reversible', visibilidad: 'privada' }
  });
  assert.strictEqual(conCasilla.ok, false);
  assert.strictEqual(conCasilla.motivo, casillas.MOTIVOS.ACCION_SIN_CASILLA);

  // La regla no vive solo en Q1: la puerta no abre pregunta para lo que no
  // tiene casilla, y la sintesis dice `no` aunque haya un permiso del dueno.
  const cp = puerta.pedir(puerta.estado_vacio(), {
    proyecto: 'p', cuenta: 'a', accion: 'volar', rol: 'agente', aparato: 'm1',
    quien: 'agente', momento: M1, nivel_al_conceder: 'permiso'
  });
  assert.strictEqual(cp.ok, false);
  assert.strictEqual(cp.motivo, casillas.MOTIVOS.ACCION_SIN_CASILLA);

  const d = politica.decidir({
    proyecto: 'p', cuenta: 'a', rol: 'dueno', accion: 'volar', momento: M1,
    nivel: { cuenta: 'a', nivel: 'ejecutar', quien: 'dueno', momento: M1 },
    autorizacion: { procedencia: 'registro_autorizaciones', via: 'puerta', quien: 'dueno' }
  });
  assert.strictEqual(d.dictamen, 'no');
  assert.strictEqual(d.motivo, casillas.MOTIVOS.ACCION_SIN_CASILLA);
});

test('toda_accion_de_G1_tiene_casilla_y_ninguna_es_desconocida', () => {
  // Si G1 cobra una accion y Q1 no la conoce, el puente no la puede hacer.
  for (const accion of ritmo.ACCIONES) {
    const c = casillas.casilla_de(accion);
    assert.ok(c, `${accion} tiene que tener casilla`);
    assert.ok(['reversible', 'irreversible'].includes(c.reversibilidad));
    assert.ok(['visible', 'privada'].includes(c.visibilidad));
    assert.strictEqual(typeof c.ventana_segundos, 'number');
  }
  // Y las acciones que H3 ya nombraba tambien estan: no existe una accion
  // ejecutable sin casilla.
  for (const accion of ['enviar_dm', 'subir_historia', 'editar_perfil', 'borrar', 'compartir', 'etiquetar']) {
    assert.ok(casillas.casilla_de(accion), `${accion} tiene que tener casilla`);
  }
});

// ---------------------------------------------------------------------------
// 2 · la tabla no se puede comprar
// ---------------------------------------------------------------------------

test('una_casilla_traida_que_contradice_la_tabla_se_rechaza', () => {
  // Publicar es irreversible y visible. Que el payload diga otra cosa no cambia
  // nada: se rechaza el intento en vez de aceptar la casilla comoda.
  const v = casillas.validar({
    accion: 'publicar',
    casilla: { reversibilidad: 'reversible', visibilidad: 'privada' }
  });
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.motivo, casillas.MOTIVOS.CASILLA_AJENA);
  assert.strictEqual(v.traida.reversibilidad, 'reversible');
  assert.strictEqual(v.casilla.reversibilidad, 'irreversible', 'la tabla manda');

  // Si coincide, se acepta: es una confirmacion redundante, no una fuente.
  const ok = casillas.validar({
    accion: 'publicar',
    casilla: { reversibilidad: 'irreversible', visibilidad: 'visible' }
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.casilla.reversibilidad, 'irreversible');
});

test('lo_que_se_puede_deshacer_no_es_lo_que_se_puede_des_ver', () => {
  // Observar: reversible y privado.
  assert.strictEqual(casillas.es_inocua('leer'), true);
  assert.strictEqual(casillas.es_inocua('pulso'), true);
  assert.strictEqual(casillas.es_irreversible('leer'), false);

  // Seguir se puede deshacer con "dejar de seguir", pero la notificacion ya
  // salio: es irreversible. Esa es la regla de los abogados.
  assert.strictEqual(casillas.es_irreversible('seguir'), true);
  assert.strictEqual(casillas.es_visible('seguir'), true);
  assert.strictEqual(casillas.es_inocua('seguir'), false);

  // Publicar es el caso canonico: el hecho es la publicacion.
  assert.strictEqual(casillas.es_irreversible('publicar'), true);
  assert.strictEqual(casillas.es_visible('publicar'), true);

  // Responder es irreversible pero PRIVADO: solo lo ve el dueno.
  assert.strictEqual(casillas.es_irreversible('responder'), true);
  assert.strictEqual(casillas.es_visible('responder'), false);

  // Programar aun no ha pasado nada: reversible.
  assert.strictEqual(casillas.es_irreversible('programar'), false);
});

test('cada_accion_irreversible_declara_su_rato_de_arrepentimiento', () => {
  for (const accion of casillas.acciones()) {
    const v = casillas.ventana_de(accion);
    assert.strictEqual(v.declarada, true);
    if (casillas.es_irreversible(accion)) {
      assert.ok(v.segundos > 0, `${accion} es irreversible y tiene que tener ventana`);
    } else {
      assert.strictEqual(v.segundos, 0, `${accion} es reversible: no necesita ventana`);
    }
  }
  assert.strictEqual(casillas.ventana_de('publicar').segundos, 120);
  assert.strictEqual(casillas.ventana_de('borrar').segundos, 180);
});

test('la_tabla_es_inmutable', () => {
  assert.ok(Object.isFrozen(casillas.CASILLAS));
  assert.ok(Object.isFrozen(casillas.CASILLAS.publicar));

  const c = casillas.casilla_de('publicar');
  c.reversibilidad = 'reversible';
  assert.strictEqual(casillas.casilla_de('publicar').reversibilidad, 'irreversible', 'la copia no toca la tabla');
});

test('el_paso_compuesto_hereda_lo_peor_de_sus_acciones', () => {
  // Leer y publicar en el mismo paso es tan irreversible y tan visible como
  // publicar, y el rato de espera es el mayor.
  const c = casillas.combinar('leer', 'publicar');
  assert.strictEqual(c.reversibilidad, 'irreversible');
  assert.strictEqual(c.visibilidad, 'visible');
  assert.strictEqual(c.ventana_segundos, 120);

  const c2 = casillas.combinar('leer', 'pulso');
  assert.strictEqual(c2.reversibilidad, 'reversible');
  assert.strictEqual(c2.visibilidad, 'privada');

  assert.strictEqual(casillas.combinar('leer', 'volar'), null, 'sin casilla no hay combinacion');
});

// ---------------------------------------------------------------------------
// 3 · la huella
// ---------------------------------------------------------------------------

test('la_huella_ata_proyecto_cuenta_accion_rol_y_casilla', () => {
  const base = { proyecto: 'p', cuenta: '@Taller_A', accion: 'publicar', rol: 'agente' };
  const h = casillas.huella(base);
  assert.strictEqual(typeof h, 'string');
  assert.strictEqual(h.length, 32);

  // La cuenta se normaliza: @Taller_A y taller_a son la misma.
  assert.strictEqual(h, casillas.huella({ proyecto: 'p', cuenta: 'taller_a', accion: 'publicar', rol: 'agente' }));

  // Cambia cualquier cosa y cambia la huella: un permiso no sirve para otra cosa.
  assert.notStrictEqual(h, casillas.huella({ ...base, accion: 'comentar' }));
  assert.notStrictEqual(h, casillas.huella({ ...base, cuenta: 'taller_b' }));
  assert.notStrictEqual(h, casillas.huella({ ...base, proyecto: 'q' }));
  assert.notStrictEqual(h, casillas.huella({ ...base, rol: 'dueno' }));

  // Sin casilla no hay huella: no se puede atar un permiso a lo desconocido.
  assert.strictEqual(casillas.huella({ ...base, accion: 'volar' }), null);
  assert.strictEqual(casillas.huella({ ...base, cuenta: '' }), null);
});

test('la_huella_es_estable_entre_llamadas', () => {
  const partes = { proyecto: 'p', cuenta: 'a', accion: 'publicar', rol: 'agente' };
  assert.strictEqual(casillas.huella(partes), casillas.huella(partes));
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__casillas] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__casillas] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
