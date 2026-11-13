'use strict';

/**
 * instagram-bridge · A2 · ResolvedorDeReceta (REFLEJO)
 *
 * El resolvedor dice QUE RECETA se aplica. Esta suite fija lo que no se puede
 * relajar:
 *   - sin receta vigente para la clave NO SE IMPROVISA: `sin_receta` y parada,
 *     aunque haya una receta parecida, una antecesora o una propuesta al lado;
 *   - con DOS vigentes en la misma clave NO SE ELIGE: `preguntar` y parada;
 *   - el emparejamiento es exacto por plataforma y capacidad, nada de parecidos;
 *   - una receta que no pasa la forma (A4.1) no se aplica a medias;
 *   - resolver NO muta el catalogo, NO mira el reloj y NO devuelve secretos.
 *
 * Ejecutar: node modules/instagram-bridge/tests/resolver.test.js
 */

const assert = require('assert');

const resolver = require('../recetas/resolver');
const catalogo = require('../recetas/catalogo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T08:00:00Z';
const M3 = '2026-11-13T09:30:00Z';

function sello(extra) {
  return Object.assign({
    proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'movil-1', momento: M1, quien: 'dueno'
  }, extra || {});
}

function receta(capacidad, extra) {
  return Object.assign({
    plataforma: 'instagram',
    capacidad: capacidad || 'publicar',
    precondicion: { descripcion: 'app abierta en inicio', ancla: { nombre_visible: 'Crear', tipo: 'boton' } },
    pasos: [
      { ancla_esperada: { nombre_visible: 'Crear', tipo: 'boton' }, accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'se abre el selector' }, espera_maxima: 1500 },
      { ancla_esperada: { nombre_visible: 'Compartir', tipo: 'boton' }, accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'queda publicado', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
        espera_maxima: 2500 }
    ],
    postcondicion: { descripcion: 'la pieza queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
    techo: 6000
  }, extra || {});
}

function proponer(estado, opts) {
  return catalogo.proponer(estado, Object.assign({
    receta: receta(), sello: sello(), origen: 'demostracion'
  }, opts || {}));
}

function publicar(estado, opts) {
  return catalogo.publicar(estado, Object.assign({
    capacidad: 'publicar', autorizacion_id: 'aut-0001', momento: M2, quien: 'dueno'
  }, opts || {}));
}

/**
 * Catalogo real con v1 y v2 de `publicar` publicadas (v1 queda antecesora) y una
 * propuesta de `comentar` que nunca se publico. Es el escenario de todos los
 * dias: una capacidad con receta y otra sin ella.
 */
function catalogo_con_publicar() {
  let e = catalogo.estado_vacio();

  const p1 = proponer(e, { receta: receta('publicar') });
  assert.strictEqual(p1.ok, true, p1.motivo);
  const pub1 = publicar(p1.estado, { version: 1 });
  assert.strictEqual(pub1.ok, true, pub1.motivo);

  const p2 = proponer(pub1.estado, { receta: receta('publicar', { techo: 7000 }), sello: sello({ momento: M3 }) });
  assert.strictEqual(p2.ok, true, p2.motivo);
  const pub2 = publicar(p2.estado, { version: 2, autorizacion_id: 'aut-0002', momento: M3 });
  assert.strictEqual(pub2.ok, true, pub2.motivo);

  // `comentar` nace propuesta y ahi se queda: no hay vigente de esa clave.
  const p3 = proponer(pub2.estado, {
    receta: receta('comentar', { techo: 4000 }),
    plataforma: 'instagram',
    capacidad: 'comentar'
  });
  assert.strictEqual(p3.ok, true, p3.motivo);

  return p3.estado;
}

/** Catalogo manipulado a mano con DOS vigentes en la misma clave (esta corrupto). */
function catalogo_con_dos_vigentes() {
  const e = catalogo_con_publicar();
  const vigente = e.recetas.find((r) => r.clave === 'instagram:publicar' && r.estado === 'vigente');
  assert.ok(vigente, 'hace falta una vigente de partida');

  const gemela = JSON.parse(JSON.stringify(vigente));
  gemela.version = vigente.version + 1;
  gemela.receta = receta('publicar', { techo: 8000 });

  const corrupto = JSON.parse(JSON.stringify(e));
  corrupto.recetas.push(gemela);
  // Sanidad: el catalogo que se le entrega a A2 tiene de verdad dos vigentes.
  const vigentes = corrupto.recetas.filter((r) => r.clave === 'instagram:publicar' && r.estado === 'vigente');
  assert.strictEqual(vigentes.length, 2);
  return corrupto;
}

// ---------------------------------------------------------------------------
// 1 · SIN RECETA NO SE IMPROVISA  (test que fija la espina del plan)
// ---------------------------------------------------------------------------

test('sin_receta_no_se_improvisa', () => {
  const e = catalogo_con_publicar();

  // Hay receta de `publicar`, una propuesta de `comentar` y nada mas. Se pide
  // `comentar`: A2 para y lo dice. NO devuelve la de publicar "que es parecida".
  const r = resolver.resolver(e, { capacidad: 'comentar', cuenta: 'taller_a' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.veredicto, 'sin_receta');
  assert.strictEqual(r.motivo, 'sin_receta');
  assert.strictEqual(r.parar, true);
  assert.strictEqual(r.resuelto, true, 'sin receta es un hecho, no un error del resolvedor');
  assert.strictEqual(r.receta, undefined, 'no se devuelve ninguna receta');
  assert.strictEqual(r.cuerpo, undefined, 'no se compone un cuerpo con otra receta');
  assert.strictEqual(r.clave, 'instagram:comentar');
  assert.strictEqual(r.candidatas, 0);
  assert.ok(r.pista && r.pista.length > 0, 'la parada dice que hace falta');
  assert.deepStrictEqual(resolver.parar_si_no_hay(r), {
    ok: false, veredicto: 'sin_receta', motivo: 'sin_receta', pista: r.pista
  });

  // Una capacidad que no existe en ninguna version tampoco se resuelve.
  const inexistente = resolver.resolver(e, { capacidad: 'encender_la_radio' });
  assert.strictEqual(inexistente.veredicto, 'sin_receta');

  // Y una clave retirada no se resuelve desde una antecesora.
  let retirado = catalogo_con_publicar();
  const fuera = catalogo.marcar_no_vigente(retirado, { capacidad: 'publicar', motivo: 'instagram cambio', momento: M3, quien: 'dueno' });
  assert.strictEqual(fuera.ok, true, fuera.motivo);
  const r2 = resolver.resolver(fuera.estado, { capacidad: 'publicar' });
  assert.strictEqual(r2.veredicto, 'sin_receta', 'una antecesora no sustituye a la vigente retirada');
  assert.strictEqual(r2.receta, undefined);
});

// ---------------------------------------------------------------------------
// 2 · DOS VIGENTES POSIBLES -> PREGUNTA, NO ELIGE
// ---------------------------------------------------------------------------

test('con_dos_vigentes_posibles_pregunta_no_elige', () => {
  const e = catalogo_con_dos_vigentes();

  const r = resolver.resolver(e, { capacidad: 'publicar', cuenta: 'taller_a' });
  assert.strictEqual(r.ok, false, 'elegir una de dos no puede salir bien');
  assert.strictEqual(r.veredicto, 'preguntar');
  assert.strictEqual(r.motivo, 'dos_vigentes_en_la_misma_clave');
  assert.strictEqual(r.parar, true);
  assert.strictEqual(r.resuelto, true);
  assert.strictEqual(r.candidatas, 2);
  assert.deepStrictEqual(r.versiones, [2, 3], 'las dos versiones, para que se decida sobre datos');
  assert.strictEqual(r.receta, undefined, 'no se elige: no viaja receta');
  assert.strictEqual(r.cuerpo, undefined);
  assert.ok(!('version' in r), 'tampoco se destaca una version como si fuera la buena');
  assert.strictEqual(r.pista, resolver.PISTAS.dos_vigentes_en_la_misma_clave);
});

// ---------------------------------------------------------------------------
// 3 · resuelve la vigente, por DOS CLAVES EXACTAS
// ---------------------------------------------------------------------------

test('resuelve_la_vigente_por_clave_exacta', () => {
  const e = catalogo_con_publicar();

  const r = resolver.resolver(e, { capacidad: 'publicar', cuenta: 'taller_a', proyecto: 'proy-a' });
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.veredicto, 'aplicar');
  assert.strictEqual(r.parar, false);
  assert.strictEqual(r.clave, 'instagram:publicar');
  assert.strictEqual(r.version, 2, 'la vigente es la ultima publicada, no la antecesora');
  assert.strictEqual(r.origen, 'demostracion');
  assert.strictEqual(r.pasos, 2);
  assert.strictEqual(r.receta.estado, 'vigente');
  assert.strictEqual(r.cuerpo.capacidad, 'publicar');
  assert.strictEqual(r.cuerpo.techo, 7000, 'el cuerpo es la receta de la v2');
  assert.deepStrictEqual(r.ambito, { proyecto: 'proy-a', cuenta: 'taller_a' });
  assert.strictEqual(resolver.puede_ejecutar(r), true);
  assert.deepStrictEqual(resolver.parar_si_no_hay(r), { ok: true });

  // La capacidad es la clave: `comentar` no devuelve la receta de `publicar`
  // aunque sea de la misma plataforma y del mismo duenno.
  assert.strictEqual(resolver.resolver(e, { capacidad: 'comentar' }).cuerpo, undefined);

  // La plataforma se normaliza; no hay dos plataformas declaradas todavia.
  assert.strictEqual(resolver.resolver(e, { capacidad: 'publicar', plataforma: ' INSTAGRAM ' }).ok, true);
});

// ---------------------------------------------------------------------------
// 4 · una receta defectuosa no se aplica a medias
// ---------------------------------------------------------------------------

test('receta_defectuosa_no_se_aplica_a_medias', () => {
  const e = catalogo_con_publicar();
  // Alguien toco el almacen a mano y le quito la postcondicion a la vigente.
  const roto = JSON.parse(JSON.stringify(e));
  const vigente = roto.recetas.find((r) => r.clave === 'instagram:publicar' && r.estado === 'vigente');
  delete vigente.receta.postcondicion;

  const r = resolver.resolver(roto, { capacidad: 'publicar' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.veredicto, 'rechazo');
  assert.strictEqual(r.motivo, 'receta_defectuosa');
  assert.strictEqual(r.parar, true);
  assert.strictEqual(r.resuelto, false);
  assert.strictEqual(r.receta, undefined, 'no se devuelve la receta rota para que se use igual');
  assert.ok(Array.isArray(r.defectos) && r.defectos.length > 0, 'el rechazo dice que defecto y en que paso');
  assert.ok(r.defectos.some((d) => d.parte === 'postcondicion' && d.paso === 2));
});

// ---------------------------------------------------------------------------
// 5 · sin catalogo legible, sin capacidad, plataforma rara: rechazo nombrado
// ---------------------------------------------------------------------------

test('sin_catalogo_legible_no_se_resuelve', () => {
  const r = resolver.resolver({ recetas: 'no soy un catalogo' }, { capacidad: 'publicar' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.veredicto, 'rechazo');
  assert.strictEqual(r.motivo, 'catalogo_ilegible');
  assert.strictEqual(r.parar, true);
  assert.strictEqual(resolver.resolver(null, { capacidad: 'publicar' }).motivo, 'catalogo_ilegible');
});

test('sin_capacidad_no_hay_clave_y_se_nombra', () => {
  const e = catalogo_con_publicar();

  for (const pedido of [{}, { capacidad: '   ' }, { capacidad: undefined }]) {
    const r = resolver.resolver(e, pedido);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.veredicto, 'rechazo');
    assert.strictEqual(r.motivo, 'entrada_invalida');
    assert.deepStrictEqual(r.faltan, ['capacidad']);
    assert.strictEqual(r.parar, true);
  }
  assert.strictEqual(resolver.resolver(e, null).motivo, 'entrada_invalida');

  const plataforma = resolver.resolver(e, { capacidad: 'publicar', plataforma: 'tiktok' });
  assert.strictEqual(plataforma.motivo, 'entrada_invalida');
  assert.deepStrictEqual(plataforma.invalidos, ['plataforma']);
});

test('lo_que_se_ve_identifica_pero_no_elige', () => {
  const e = catalogo_con_publicar();

  // Una pantalla de otra plataforma no se resuelve con una receta de Instagram.
  const r = resolver.resolver(e, {
    capacidad: 'publicar',
    visible: { plataforma: 'tiktok', pantalla: 'inicio', mirada: 'completa', nodos: [] }
  });
  assert.strictEqual(r.motivo, 'plataforma_distinta');
  assert.deepStrictEqual(r.invalidos, ['visible.plataforma']);

  // La misma pantalla, de la plataforma correcta: se resuelve y se deja constancia.
  const ok = resolver.resolver(e, {
    capacidad: 'publicar',
    visible: { plataforma: 'instagram', pantalla: 'crear', mirada: 'parcial', nodos: [{ id: 'n1' }] }
  });
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.visto, { pantalla: 'crear', mirada: 'parcial', nodos: 1 });

  // La pantalla NO cambia la receta elegida: la misma clave da la misma version.
  assert.strictEqual(ok.version, 2);
  assert.strictEqual(resolver.resolver(e, { capacidad: 'publicar' }).version, 2);
});

// ---------------------------------------------------------------------------
// 6 · reflejo: no muta, no inventa reloj, no devuelve secretos
// ---------------------------------------------------------------------------

test('no_muta_el_catalogo_y_es_determinista', () => {
  const e = catalogo_con_publicar();
  const foto = JSON.stringify(e);

  const a = resolver.resolver(e, { capacidad: 'publicar' });
  const b = resolver.resolver(e, { capacidad: 'publicar' });
  assert.deepStrictEqual(a, b, 'mismo catalogo y mismo pedido, mismo resultado');
  assert.strictEqual(JSON.stringify(e), foto, 'el resolvedor lee, no escribe');

  // Lo devuelto es una copia: tocar el resultado no toca el catalogo.
  a.cuerpo.techo = 999999;
  assert.strictEqual(JSON.stringify(e), foto);
});

test('un_secreto_en_el_pedido_se_rechaza_sin_copiarlo', () => {
  const e = catalogo_con_publicar();
  const r = resolver.resolver(e, { capacidad: 'publicar', password: 'hunter2-Taller-2026' });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'secreto_recibido');
  assert.ok(Array.isArray(r.rutas) && r.rutas.length > 0, 'se nombra la ruta del secreto');
  assert.ok(Array.isArray(r.familias) && r.familias.length > 0);
  assert.ok(JSON.stringify(r).indexOf('hunter2') === -1, 'el valor no se copia en el rechazo');
});

// ---------------------------------------------------------------------------
// 7 · las dos consultas pequennas de la clase
// ---------------------------------------------------------------------------

test('vigencia_y_version_se_declaran', () => {
  const e = catalogo_con_publicar();
  const vigente = e.recetas.find((r) => r.estado === 'vigente');
  const antecesora = e.recetas.find((r) => r.estado === 'antecesora');
  const propuesta = e.recetas.find((r) => r.estado === 'propuesta');

  assert.strictEqual(resolver.vigencia(vigente), 'vigente');
  assert.strictEqual(resolver.vigencia(antecesora), 'no_vigente');
  assert.strictEqual(resolver.vigencia(propuesta), 'no_vigente');
  assert.strictEqual(resolver.vigencia({ version: 1 }), 'desconocida', 'sin situacion no es vigente por defecto');
  assert.strictEqual(resolver.vigencia(null), 'desconocida');

  assert.strictEqual(resolver.version_de(vigente), 2);
  assert.strictEqual(resolver.version_de({ version: 0 }), null);
  assert.strictEqual(resolver.version_de({ version: '2' }), null);
  assert.strictEqual(resolver.version_de(null), null);

  // La vista clase responde lo mismo que las funciones sueltas.
  assert.strictEqual(resolver.ResolvedorDeReceta.resolver(e, { capacidad: 'publicar' }).version, 2);
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let passed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { fails.push({ name, err }); }
}
if (fails.length === 0) { console.log(`\n[instagram-bridge__resolver] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[instagram-bridge__resolver] FAIL ${fails.length}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);
