'use strict';

/**
 * instagram-bridge · F2 · ReparadorDeReceta (MICRO-AGENTE)
 *
 * Lo que esta suite fija, y es lo mas importante del bloque:
 *   - **SIN CONFIRMACION REGISTRADA NO LLEGA AL CATALOGO.** `reparar()` produce una
 *     reparacion PROPUESTA; `para_catalogo()` se niega mientras no haya una persona
 *     que confirme con `autorizacion_id`. Y cuando por fin entra, entra como
 *     PROPUESTA y publicar vuelve a exigir autorizacion: la reparacion no se
 *     autopromueve.
 *   - **La reparacion la confirma el dueno**, no el agente que la propuso ni el
 *     sistema que detecto la rotura.
 *   - **Las anclas candidatas salen de lo observado.** El juicio (LLM) es opcional,
 *     solo puede elegir entre esas candidatas, y si falla o inventa se sigue con la
 *     regla sin romper nada.
 *   - **Una sospecha no reescribe el saber comun** (una sola evidencia no repara).
 *   - **Sin observacion suficiente no hay receta a medias**: se dice que paso hay
 *     que mirar.
 *
 * Ejecutar: node modules/instagram-bridge/tests/reparar.test.js
 */

const assert = require('assert');

const reparar = require('../recetas/reparar');
const rotura = require('../recetas/rotura');
const catalogo = require('../recetas/catalogo');
const forma = require('../core/forma-receta');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T08:00:00Z';
const M3 = '2026-11-12T12:30:00Z';

/**
 * La receta vigente: publicar con "Compartir". La plataforma lo renombro a
 * "Publicar ahora" y el paso 2 perdio "Siguiente".
 */
function receta() {
  return {
    plataforma: 'instagram',
    capacidad: 'publicar',
    precondicion: { descripcion: 'app abierta en inicio', ancla: { nombre_visible: 'Crear', tipo: 'boton' } },
    pasos: [
      {
        ancla_esperada: { nombre_visible: 'Crear', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'se abre el selector' },
        espera_maxima: 1500
      },
      {
        ancla_esperada: { nombre_visible: 'Siguiente', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'pide el pie de foto' },
        espera_maxima: 1500
      },
      {
        ancla_esperada: { nombre_visible: 'Compartir', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
        espera_maxima: 2000
      }
    ],
    postcondicion: { descripcion: 'la pieza queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
    techo: 6000
  };
}

/** Lo que se ve AHORA en la pantalla despues del cambio de interfaz. */
function hecho(extra) {
  return Object.assign({
    pantalla: 'crear',
    mirada: 'completa',
    nodos: [
      { nombre_visible: 'Crear', tipo: 'boton', tocable: true },
      { nombre_visible: 'Publicar ahora', tipo: 'boton', tocable: true },
      { nombre_visible: 'Volver', tipo: 'boton', tocable: true },
      { nombre_visible: 'Publicado', tipo: 'texto', tocable: false },
      { nombre_visible: '', tipo: 'texto', tocable: false }
    ]
  }, extra || {});
}

function evidencias() {
  return [
    {
      evidencia_id: 'ev-1', paso: 3, tipo: 'ancla_renombrada',
      ancla: { nombre_visible: 'Compartir', tipo: 'boton' },
      observado_en: M1, quien: 'dueno'
    },
    {
      evidencia_id: 'ev-2', paso: 3, tipo: 'ancla_renombrada',
      ancla: { nombre_visible: 'Compartir', tipo: 'boton' },
      observado_en: M2, quien: 'agente'
    }
  ];
}

function entrada(extra) {
  return Object.assign({
    receta: receta(),
    evidencias: evidencias(),
    hecho: hecho(),
    momento: M2,
    quien: 'agente',
    proyecto: 'proy-a',
    cuenta: 'taller_a',
    aparato: 'movil-1'
  }, extra || {});
}

function sello(extra) {
  return Object.assign({ proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'movil-1', momento: M1, quien: 'dueno' }, extra || {});
}

/** Catalogo con la version 1 vigente de `publicar` (la que se va a romper). */
function catalogo_con_v1() {
  let estado = catalogo.estado_vacio();
  const p = catalogo.proponer(estado, { receta: receta(), sello: sello(), origen: 'demostracion' });
  assert.strictEqual(p.ok, true, p.motivo);
  const pub = catalogo.publicar(p.estado, {
    capacidad: 'publicar', version: 1, autorizacion_id: 'aut-v1', momento: M2, quien: 'dueno'
  });
  assert.strictEqual(pub.ok, true, pub.motivo);
  return pub.estado;
}

// ---------------------------------------------------------------------------
// 1 · EL TEST DEL BLOQUE: sin confirmacion no llega al catalogo
// ---------------------------------------------------------------------------

test('sin_confirmacion_registrada_no_llega_al_catalogo', () => {
  const reparacion = reparar.reparar(entrada());
  assert.strictEqual(reparacion.ok, true, reparacion.motivo);
  const r = reparacion.reparacion;

  // 1. La reparacion existe, pero es una PROPUESTA sin confirmar.
  assert.strictEqual(r.estado, 'propuesta');
  assert.strictEqual(r.vigente, false);
  assert.strictEqual(r.requiere_confirmacion, true);
  assert.strictEqual(r.confirmacion, null);

  // 2. La puerta del catalogo esta cerrada: sin persona no hay entrada.
  const sinPersona = reparar.para_catalogo(r);
  assert.strictEqual(sinPersona.ok, false);
  assert.strictEqual(sinPersona.motivo, 'sin_confirmacion');
  assert.strictEqual(sinPersona.guardado, false);

  // 3. Un agente no confirma: detecta y propone, no decide.
  const porAgente = reparar.confirmar(r, { autorizacion_id: 'aut-0001', quien: 'agente', momento: M3 });
  assert.strictEqual(porAgente.ok, false);
  assert.strictEqual(porAgente.motivo, 'no_es_persona');
  const porSistema = reparar.confirmar(r, { autorizacion_id: 'aut-0001', quien: 'sistema', momento: M3 });
  assert.strictEqual(porSistema.motivo, 'no_es_persona');

  // 4. Sin autorizacion_id tampoco: "confirmo" no es una palabra, es un registro.
  const sinAutorizacion = reparar.confirmar(r, { quien: 'dueno', momento: M3 });
  assert.strictEqual(sinAutorizacion.ok, false);
  assert.strictEqual(sinAutorizacion.motivo, 'entrada_invalida');
  assert.ok(sinAutorizacion.faltan.includes('autorizacion_id'));

  // 5. El dueno confirma: la reparacion sigue siendo propuesta, pero ya es entrada.
  const confirmada = reparar.confirmar(r, { autorizacion_id: 'aut-0001', quien: 'dueno', momento: M3 });
  assert.strictEqual(confirmada.ok, true, confirmada.motivo);
  assert.strictEqual(confirmada.reparacion.estado, 'propuesta', 'confirmar NO publica');
  assert.strictEqual(confirmada.reparacion.vigente, false);
  assert.strictEqual(confirmada.reparacion.confirmacion.autorizacion_id, 'aut-0001');

  const entradaCatalogo = reparar.para_catalogo(confirmada.reparacion);
  assert.strictEqual(entradaCatalogo.ok, true, entradaCatalogo.motivo);
  assert.strictEqual(entradaCatalogo.vigente, false);
  assert.strictEqual(entradaCatalogo.estado, 'propuesta');
  assert.strictEqual(entradaCatalogo.entrada.origen, 'reparacion');

  // 6. Y en el catalogo entra como PROPUESTA, no como vigente...
  let estado = catalogo_con_v1();
  const propuesta = catalogo.proponer(estado, entradaCatalogo.entrada);
  assert.strictEqual(propuesta.ok, true, propuesta.motivo);
  assert.strictEqual(propuesta.estado_receta, 'propuesta');
  assert.strictEqual(propuesta.vigente, false);
  assert.strictEqual(propuesta.version, 2);

  // ... y la vigente sigue siendo la v1 rota hasta que una persona publique.
  assert.strictEqual(catalogo.vigente(propuesta.estado, { capacidad: 'publicar' }).receta.version, 1);

  // 7. Publicar vuelve a exigir autorizacion: el catalogo no se fia de la anterior.
  const sinPublicar = catalogo.publicar(propuesta.estado, { capacidad: 'publicar', version: 2, momento: M3, quien: 'dueno' });
  assert.strictEqual(sinPublicar.ok, false);
  assert.strictEqual(sinPublicar.motivo, 'sin_confirmacion');

  const publicado = catalogo.publicar(propuesta.estado, {
    capacidad: 'publicar', version: 2, autorizacion_id: 'aut-0001', momento: M3, quien: 'dueno'
  });
  assert.strictEqual(publicado.ok, true, publicado.motivo);
  assert.strictEqual(publicado.estado_receta, 'vigente');
  assert.strictEqual(publicado.sustituye_a, 1);
  // La receta publicada es la reparada: el ancla nueva, no la rota.
  assert.strictEqual(publicado.receta.receta.pasos[2].ancla_esperada.nombre_visible, 'Publicar ahora');
});

// ---------------------------------------------------------------------------
// 2 · no se autopromueve
// ---------------------------------------------------------------------------

test('la_reparacion_nace_propuesta_y_descarta_la_autopromocion', () => {
  const r = reparar.reparar(entrada({
    estado: 'vigente',
    vigente: true,
    confirmada: true,
    autorizacion_id: 'aut-que-me-invento',
    confirmacion: { autorizacion_id: 'aut-que-me-invento', quien: 'dueno', momento: M3 }
  }));

  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.reparacion.estado, 'propuesta', 'una reparacion no puede nacer vigente');
  assert.strictEqual(r.reparacion.vigente, false);
  assert.strictEqual(r.reparacion.confirmacion, null, 'la confirmacion no se la pone el reparador');
  assert.strictEqual(r.requiere_confirmacion, true);

  // Se dice que se descarto: no se ignora en silencio.
  assert.ok(r.descartado.autopromocion.includes('autorizacion_id'));
  assert.ok(r.descartado.autopromocion.includes('estado'));
  assert.ok(r.descartado.autopromocion.includes('confirmacion'));

  // Y sin confirmacion real, la entrada al catalogo sigue cerrada.
  assert.strictEqual(reparar.para_catalogo(r.reparacion).motivo, 'sin_confirmacion');
});

test('una_reparacion_se_confirma_una_sola_vez', () => {
  const r = reparar.reparar(entrada()).reparacion;
  const primera = reparar.confirmar(r, { autorizacion_id: 'aut-1', quien: 'dueno', momento: M3 });
  assert.strictEqual(primera.ok, true);

  const segunda = reparar.confirmar(primera.reparacion, { autorizacion_id: 'aut-2', quien: 'dueno', momento: M3 });
  assert.strictEqual(segunda.ok, false);
  assert.strictEqual(segunda.motivo, 'ya_confirmada');
  assert.strictEqual(segunda.autorizacion_id, 'aut-1');
});

// ---------------------------------------------------------------------------
// 3 · el juicio es opcional: elige entre lo observado, y si falla no rompe
// ---------------------------------------------------------------------------

test('el_juicio_no_puede_inventar_anclas_y_si_falla_no_rompe', () => {
  // a) Un juicio que elige una candidata observada: se usa.
  const conJuicio = reparar.reparar(entrada({
    juez: () => ({ 3: 'Volver' })
  }));
  assert.strictEqual(conJuicio.ok, true, conJuicio.motivo);
  assert.strictEqual(conJuicio.reparacion.cambios[0].a.nombre_visible, 'Volver');
  assert.strictEqual(conJuicio.reparacion.cambios[0].elegido_por, 'juicio');
  assert.strictEqual(conJuicio.reparacion.juicio.usado, true);

  // b) Un juicio que INVENTA un ancla ("Siguiente" ya no esta en pantalla): se
  //    descarta, se dice y se sigue con la regla.
  const inventando = reparar.reparar(entrada({
    juez: () => ({ 3: 'Siguiente' })
  }));
  assert.strictEqual(inventando.ok, true, 'un juicio que inventa no rompe la reparacion');
  assert.strictEqual(inventando.reparacion.cambios[0].a.nombre_visible, 'Publicar ahora');
  assert.strictEqual(inventando.reparacion.cambios[0].elegido_por, 'regla');
  assert.strictEqual(inventando.reparacion.juicio.usado, false);
  assert.strictEqual(inventando.reparacion.juicio.descartes[0].motivo, 'no_estaba_en_lo_observado');

  // c) Un juicio que lanza: se anota el fallo y la reparacion sale igual.
  const roto = reparar.reparar(entrada({
    juez: () => { throw new Error('el modelo no responde'); }
  }));
  assert.strictEqual(roto.ok, true, roto.motivo);
  assert.strictEqual(roto.reparacion.juicio.usado, false);
  assert.strictEqual(roto.reparacion.juicio.motivo, 'juicio_fallo');
  assert.strictEqual(roto.reparacion.cambios[0].a.nombre_visible, 'Publicar ahora');

  // d) Sin juicio, la regla sola: el mismo resultado que con un juicio roto.
  const sinJuicio = reparar.reparar(entrada());
  assert.strictEqual(sinJuicio.reparacion.juicio.motivo, 'sin_juicio');
  assert.deepStrictEqual(
    sinJuicio.reparacion.cambios.map((c) => c.a),
    roto.reparacion.cambios.map((c) => c.a)
  );
});

// ---------------------------------------------------------------------------
// 4 · lo que no se puede reparar se dice
// ---------------------------------------------------------------------------

test('una_sospecha_no_reescribe_el_saber_comun', () => {
  const r = reparar.reparar(entrada({ evidencias: evidencias().slice(0, 1) }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'solo_sospecha');
  assert.strictEqual(r.veredicto, 'sospecha');
  assert.deepStrictEqual(r.pasos_sospechosos, [3]);
  assert.ok(r.pista.includes('sospecha'));
});

test('sin_observacion_suficiente_no_hay_receta_a_medias', () => {
  // La pantalla no tiene NADA que pueda sustituir a "Compartir": solo el ancla que
  // ya usa el paso 1, asi que no hay candidata.
  const r = reparar.reparar(entrada({
    hecho: hecho({ nodos: [{ nombre_visible: 'Crear', tipo: 'boton', tocable: true }] })
  }));

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'sin_observacion_suficiente');
  assert.strictEqual(r.pasos_sin_candidata.length, 1);
  assert.strictEqual(r.pasos_sin_candidata[0].paso, 3);
  assert.strictEqual(r.pasos_sin_candidata[0].ancla_que_falta.nombre_visible, 'Compartir');
  assert.ok(r.que_haria_falta[0].includes('paso 3'));
});

test('una_mirada_parcial_no_propone_anclas', () => {
  const r = reparar.reparar(entrada({ hecho: hecho({ mirada: 'parcial' }) }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'mirada_parcial');
});

test('sin_hecho_no_se_inventan_anclas', () => {
  const r = reparar.reparar(entrada({ hecho: undefined }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'sin_hecho');
});

// ---------------------------------------------------------------------------
// 5 · dos pasos rotos, dos anclas distintas, y la misma rotura = el mismo id
// ---------------------------------------------------------------------------

test('dos_pasos_rotos_reciben_anclas_distintas', () => {
  const dosRoturas = evidencias().concat([
    {
      evidencia_id: 'ev-3', paso: 2, tipo: 'ancla_ausente',
      ancla: { nombre_visible: 'Siguiente', tipo: 'boton' }, observado_en: M1, quien: 'dueno'
    },
    {
      evidencia_id: 'ev-4', paso: 2, tipo: 'ancla_ausente',
      ancla: { nombre_visible: 'Siguiente', tipo: 'boton' }, observado_en: M2, quien: 'agente'
    }
  ]);

  const r = reparar.reparar(entrada({ evidencias: dosRoturas }));
  assert.strictEqual(r.ok, true, r.motivo);
  const anclas = r.reparacion.cambios.map((c) => c.a.nombre_visible);
  assert.strictEqual(r.reparacion.cambios.length, 2);
  assert.strictEqual(new Set(anclas).size, 2, 'dos pasos no pueden acabar tocando el mismo boton');
  assert.ok(!anclas.includes('Crear'), 'no se reutiliza el ancla de un paso que no estaba roto');
  assert.strictEqual(forma.validar(r.reparacion.receta).ok, true);
});

test('la_misma_rotura_produce_el_mismo_identificador', () => {
  const a = reparar.reparar(entrada());
  const b = reparar.reparar(entrada());
  assert.strictEqual(a.reparacion.reparacion_id, b.reparacion.reparacion_id, 'el id es estable: el bus puede reintentar');
  assert.deepStrictEqual(a.reparacion.receta, b.reparacion.receta);

  // Otra rotura (otro paso) produce otro id.
  const c = reparar.reparar(entrada({
    evidencias: evidencias().map((e) => Object.assign({}, e, { paso: 2, ancla: { nombre_visible: 'Siguiente', tipo: 'boton' } }))
  }));
  assert.notStrictEqual(a.reparacion.reparacion_id, c.reparacion.reparacion_id);
});

test('la_reparacion_es_pura_y_no_toca_la_receta_de_entrada', () => {
  const r = receta();
  const antes = JSON.stringify(r);
  const salida = reparar.reparar(entrada({ receta: r }));
  assert.strictEqual(salida.ok, true, salida.motivo);
  assert.strictEqual(JSON.stringify(r), antes, 'la receta de entrada no se toca');
  assert.strictEqual(rotura.declarar(r, evidencias()).veredicto, 'rotura');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__reparar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__reparar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.stack || err.message}`);
  process.exit(1);
})();
