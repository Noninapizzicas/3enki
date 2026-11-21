'use strict';

/**
 * instagram-bridge · A4.2 · SembradorDeDemostracion (CONVERSOR)
 *
 * Una receta nace de que una PERSONA haga la operacion una vez y se observe. Esta
 * suite fija las dos reglas del conversor:
 *   - la demostracion se convierte en PROPUESTA, nunca en vigente;
 *   - lo que no se vio no se inventa: paso sin ancla = defecto con su numero,
 *     mirada parcial = no se anota, gesto sin cambio visible = no hay consecuencia.
 *
 * Ejecutar: node modules/instagram-bridge/tests/demostracion.test.js
 */

const assert = require('assert');

const dem = require('../recetas/demostracion');
const catalogo = require('../recetas/catalogo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M0 = '2026-11-11T12:00:00Z';
const M1 = '2026-11-11T12:00:01.400Z';
const M2 = '2026-11-11T12:00:03Z';

function sello(momento) {
  return { proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'movil-1', momento: momento || M0, quien: 'dueno' };
}

function nodo(id, tipo, nombre) {
  return { id, tipo, nombre_visible: nombre };
}

function hecho(pantalla, nodos, momento, extra) {
  return Object.assign({
    sello: sello(momento), pantalla, mirada: 'completa', nodos, cuenta_visible: 'taller_a'
  }, extra || {});
}

const H0 = hecho('inicio', [nodo('a', 'boton', 'Crear'), nodo('b', 'imagen', 'Feed')], M0);
const H1 = hecho('crear', [nodo('a', 'boton', 'Crear'), nodo('c', 'texto', 'Nueva publicacion')], M1);
const H2 = hecho('crear', [nodo('a', 'boton', 'Crear'), nodo('c', 'texto', 'Nueva publicacion'), nodo('d', 'boton', 'Compartir')], M2);

function abrir() {
  const r = dem.abrir({ capacidad: 'publicar', cuenta: 'taller_a', proyecto: 'proy-a', aparato: 'movil-1', momento: M0, quien: 'dueno' });
  assert.strictEqual(r.ok, true, r.motivo);
  return r.demostracion;
}

/** Demostracion de dos pasos completa y sin ambiguedades. */
function demostracion_de_dos_pasos() {
  let d = abrir();
  const a = dem.anotar_paso(d, { antes: H0, gesto: { tipo: 'tocar', ancla: { nombre_visible: 'Crear', tipo: 'boton' } }, despues: H1 });
  assert.strictEqual(a.ok, true, a.motivo);
  d = a.demostracion;
  const b = dem.anotar_paso(d, { antes: H1, gesto: { tipo: 'tocar', ancla: { nombre_visible: 'Nueva publicacion', tipo: 'texto' } }, despues: H2 });
  assert.strictEqual(b.ok, true, b.motivo);
  return b.demostracion;
}

// ---------------------------------------------------------------------------

test('la_demostracion_produce_propuesta_y_no_vigente', () => {
  const r = dem.cerrar(demostracion_de_dos_pasos());
  assert.strictEqual(r.ok, true, JSON.stringify(r.defectos));

  const p = r.propuesta;
  assert.strictEqual(p.estado, 'propuesta');
  assert.strictEqual(p.vigente, false, 'una demostracion no concede vigencia');
  assert.strictEqual(p.origen, 'demostracion');
  assert.strictEqual(p.demostracion.pasos, 2);
  assert.strictEqual(p.demostracion.id, 'dem:instagram:publicar:taller_a:' + M0);

  // La receta propuesta ya es una receta: sus cuatro partes estan.
  assert.strictEqual(p.receta.pasos.length, 2);
  assert.ok(p.receta.precondicion && p.receta.postcondicion && p.receta.techo > 0);
  // El techo es lo medido (1400 ms del primer paso por los relojes), sin margen inventado.
  assert.strictEqual(p.receta.pasos[0].espera_maxima, 1400);
  assert.strictEqual(p.receta.pasos[1].espera_maxima, 1600);
  assert.strictEqual(p.receta.techo, 3000);

  // La precondicion es la pantalla donde empezo, con el ancla del primer paso.
  assert.deepStrictEqual(p.receta.precondicion.ancla, { nombre_visible: 'Crear', tipo: 'boton' });
  // La postcondicion es lo que aparecio, con su ancla (se vio, no se supuso).
  assert.strictEqual(p.receta.postcondicion.ancla.nombre_visible, 'Compartir');

  // Y encaja en el catalogo: nace propuesta alli tambien, jamas vigente.
  const entrada = dem.entrada_de_catalogo(p);
  const inscrita = catalogo.proponer(catalogo.estado_vacio(), entrada);
  assert.strictEqual(inscrita.ok, true, inscrita.motivo);
  assert.strictEqual(inscrita.estado_receta, 'propuesta');
  assert.strictEqual(catalogo.vigente(inscrita.estado, { capacidad: 'publicar' }).hallada, false);
  assert.strictEqual(catalogo.auditar(inscrita.estado).ok, true);
});

test('un_paso_sin_ancla_no_se_inventa_y_se_nombra_su_numero', () => {
  let d = abrir();
  d = dem.anotar_paso(d, { antes: H0, gesto: { tipo: 'tocar', ancla: { nombre_visible: 'Crear', tipo: 'boton' } }, despues: H1 }).demostracion;
  // La persona toco algo que la observacion no supo nombrar.
  d = dem.anotar_paso(d, { antes: H1, gesto: { tipo: 'tocar' }, despues: H2 }).demostracion;
  assert.strictEqual(d.pasos.length, 2, 'el paso se ANOTA aunque no tenga ancla');
  assert.strictEqual(d.pasos[1].ancla, null, 'el hueco se conserva tal cual');

  const r = dem.cerrar(d);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'defecto_de_forma');
  const falta = r.defectos.find((x) => x.parte === 'ancla_esperada');
  assert.strictEqual(falta.paso, 2);
  assert.strictEqual(falta.motivo, 'falta');
  assert.strictEqual(r.propuesta, undefined, 'sin ancla no hay receta que proponer');
});

test('una_mirada_parcial_no_se_anota', () => {
  const parcial = hecho('crear', [nodo('a', 'boton', 'Crear'), nodo('c', 'texto', 'Nueva publicacion')], M1, {
    mirada: 'parcial', motivo_sin_mirada: 'un aviso tapaba la mitad'
  });
  const r = dem.anotar_paso(abrir(), { antes: H0, gesto: { tipo: 'tocar', ancla: { nombre_visible: 'Crear', tipo: 'boton' } }, despues: parcial });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'mirada_parcial');
  assert.strictEqual(r.paso, 1);
  assert.strictEqual(r.lado, 'despues');
});

test('un_gesto_sin_cambio_visible_no_tiene_consecuencia', () => {
  let d = abrir();
  d = dem.anotar_paso(d, { antes: H0, gesto: { tipo: 'tocar', ancla: { nombre_visible: 'Crear', tipo: 'boton' } }, despues: H0 }).demostracion;
  const r = dem.cerrar(d);
  assert.strictEqual(r.ok, false);
  const falta = r.defectos.find((x) => x.parte === 'consecuencia_esperada');
  assert.strictEqual(falta.paso, 1);
  assert.strictEqual(falta.motivo, 'falta');
});

test('dos_cosas_en_un_toque_piden_repetir_y_no_se_adivina', () => {
  const ambiguo = hecho('crear', [
    nodo('a', 'boton', 'Crear'), nodo('c', 'texto', 'Nueva publicacion'), nodo('d', 'boton', 'Compartir')
  ], M2);
  const r = dem.anotar_paso(abrir(), { antes: H0, gesto: { tipo: 'tocar', ancla: { nombre_visible: 'Crear', tipo: 'boton' } }, despues: ambiguo });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'pasos_ambiguos');
  assert.deepStrictEqual(r.aparecen, ['Nueva publicacion', 'Compartir']);

  // Escribir abre un teclado: muchas teclas nuevas no son dos decisiones.
  const tecleo = hecho('crear', [
    nodo('a', 'boton', 'Crear'), nodo('c', 'texto', 'Nueva publicacion'), nodo('t1', 'texto', 'a'), nodo('t2', 'texto', 'b')
  ], M2);
  const ok = dem.anotar_paso(abrir(), {
    antes: H1, gesto: { tipo: 'escribir', texto: 'hola', ancla: { nombre_visible: 'Nueva publicacion', tipo: 'texto' } }, despues: tecleo
  });
  assert.strictEqual(ok.ok, true, ok.motivo);
});

test('descartar_exige_motivo_y_cierra_la_demostracion', () => {
  const d = abrir();
  assert.strictEqual(dem.descartar(d, '  ').motivo, 'sin_motivo');
  const r = dem.descartar(d, 'la persona se equivoco de cuenta');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.demostracion.estado, 'descartada');
  assert.strictEqual(r.demostracion.motivo_descarte, 'la persona se equivoco de cuenta');
  assert.strictEqual(dem.anotar_paso(r.demostracion, { antes: H0, gesto: { tipo: 'tocar' }, despues: H1 }).motivo, 'demostracion_no_abierta');
  assert.strictEqual(dem.cerrar(r.demostracion).motivo, 'demostracion_no_abierta');
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let passed = 0; const fails = [];
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { fails.push({ name, err }); }
}
if (fails.length === 0) { console.log(`\n[instagram-bridge__demostracion] OK ${passed}/${tests.length}`); process.exit(0); }
console.error(`\n[instagram-bridge__demostracion] FAIL ${fails.length}/${tests.length}`);
for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
process.exit(1);
