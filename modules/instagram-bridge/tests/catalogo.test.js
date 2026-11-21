'use strict';

/**
 * instagram-bridge · A4.4 · CatalogoDeRecetas (CUSTODIO)
 *
 * El catalogo es DONDE VIVE el saber hacer: por (plataforma, capacidad), con sus
 * versiones. Esta suite fija lo que no se puede relajar:
 *   - UNA vigente por clave, siempre, y la antecesora CONSERVADA (nada se borra);
 *   - una receta NACE PROPUESTA y nunca vigente: sin autorizacion no hay vigencia;
 *   - restaurar devuelve a vigente una antecesora sin perder el historial;
 *   - la auditoria del almacen entero (P1 sello, V1 secretos, P3 saber comun, A4.1
 *     forma) se hace ANTES de escribir, y un catalogo ilegible no se sobrescribe.
 *
 * Ejecutar: node modules/instagram-bridge/tests/catalogo.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const catalogo = require('../recetas/catalogo');
const { crear } = require('../recetas');
const forma = require('../core/forma-receta');

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

/** Catalogo con v1 y v2 publicadas de la misma clave. */
function con_dos_versiones() {
  let e = catalogo.estado_vacio();
  const p1 = proponer(e, { receta: receta() });
  assert.strictEqual(p1.ok, true, p1.motivo);
  const pub1 = publicar(p1.estado, { version: 1 });
  assert.strictEqual(pub1.ok, true, pub1.motivo);
  const p2 = proponer(pub1.estado, { receta: receta('publicar', { techo: 7000 }), sello: sello({ momento: M3 }) });
  assert.strictEqual(p2.ok, true, p2.motivo);
  const pub2 = publicar(p2.estado, { version: 2, autorizacion_id: 'aut-0002', momento: M3 });
  assert.strictEqual(pub2.ok, true, pub2.motivo);
  return pub2;
}

// ---------------------------------------------------------------------------
// 1 · una vigente por clave y la antecesora conservada
// ---------------------------------------------------------------------------

test('una_vigente_por_clave_y_antecesora_conservada', () => {
  const e = con_dos_versiones().estado;

  // Una sola vigente de la clave, y es la ultima publicada.
  const vig = catalogo.vigente(e, { plataforma: 'instagram', capacidad: 'publicar' });
  assert.strictEqual(vig.ok, true);
  assert.strictEqual(vig.hallada, true);
  assert.strictEqual(vig.receta.version, 2);
  assert.strictEqual(vig.receta.estado, 'vigente');
  assert.strictEqual(vig.receta.clave, 'instagram:publicar');

  const deLaClave = e.recetas.filter((r) => r.clave === 'instagram:publicar');
  assert.strictEqual(deLaClave.filter((r) => r.estado === 'vigente').length, 1, 'UNA vigente, ni dos ni cero');

  // La antecesora NO se borro: sigue entera, con su receta y su publicacion.
  const ant = catalogo.antecesoras(e, { capacidad: 'publicar' });
  assert.strictEqual(ant.ok, true);
  assert.strictEqual(ant.total, 1);
  const v1 = ant.antecesoras[0];
  assert.strictEqual(v1.version, 1);
  assert.strictEqual(v1.estado, 'antecesora');
  // Lo guardado es la receta NORMALIZADA por A4.1 al nacer; eso es lo que se publico
  // y eso es lo que tiene que seguir intacto tras la sustitucion.
  assert.deepStrictEqual(v1.receta, forma.validar(receta()).receta, 'la receta antecesora queda intacta');
  assert.strictEqual(v1.publicacion.autorizacion_id, 'aut-0001', 'y su firma de publicacion tambien');
  assert.strictEqual(v1.publicacion.momento, M2);

  // Las dos versiones siguen en el almacen: nada se borra, se marca.
  assert.strictEqual(catalogo.versiones(e, { capacidad: 'publicar' }).total, 2);

  // La vigente que se sustituyo dejo su paso en la historia.
  const historia = v1.historia.map((h) => h.tipo);
  assert.deepStrictEqual(historia, ['propuesta', 'publicacion', 'sustitucion']);
  assert.strictEqual(v1.historia[2].a, 'antecesora');
  assert.strictEqual(v1.historia[2].autorizacion_id, 'aut-0002');

  // Otra clave no se toca: la vigencia es por (plataforma, capacidad).
  const otra = proponer(e, { receta: receta('leer') });
  const leida = publicar(otra.estado, { capacidad: 'leer', version: 1, autorizacion_id: 'aut-0003' });
  assert.strictEqual(leida.ok, true, leida.motivo);
  assert.strictEqual(catalogo.vigente(leida.estado, { capacidad: 'leer' }).receta.version, 1);
  assert.strictEqual(catalogo.vigente(leida.estado, { capacidad: 'publicar' }).receta.version, 2);

  assert.strictEqual(catalogo.auditar(leida.estado).ok, true, JSON.stringify(catalogo.auditar(leida.estado).problemas));
});

test('retirar_no_borra_y_la_historia_lo_cuenta', () => {
  const e = con_dos_versiones().estado;
  const r = catalogo.marcar_no_vigente(e, {
    capacidad: 'publicar', motivo: 'el ancla Compartir desaparecio', momento: M3, quien: 'agente'
  });
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.estado_receta, 'no_vigente');

  // Ya no hay vigente, pero las DOS versiones siguen ahi.
  assert.strictEqual(catalogo.vigente(r.estado, { capacidad: 'publicar' }).hallada, false);
  assert.strictEqual(catalogo.versiones(r.estado, { capacidad: 'publicar' }).total, 2);
  const v2 = r.estado.recetas.find((x) => x.version === 2);
  assert.strictEqual(v2.historia[v2.historia.length - 1].tipo, 'retirada');
  assert.strictEqual(v2.historia[v2.historia.length - 1].motivo, 'el ancla Compartir desaparecio');
  assert.strictEqual(catalogo.auditar(r.estado).ok, true);
});

test('restaurar_devuelve_la_antecesora_sin_perder_nada', () => {
  let e = con_dos_versiones().estado;

  // Volver atras sin autorizacion no: es una decision, y se registra.
  const sinAut = catalogo.restaurar(e, { capacidad: 'publicar', version: 1, momento: M3, quien: 'dueno' });
  assert.strictEqual(sinAut.ok, false);
  assert.strictEqual(sinAut.motivo, 'sin_confirmacion');
  assert.ok(sinAut.faltan.includes('autorizacion_id'));

  const r = catalogo.restaurar(e, {
    capacidad: 'publicar', version: 1, autorizacion_id: 'aut-0009', momento: M3, quien: 'dueno',
    motivo: 'la version 2 empeoro la cosa'
  });
  assert.strictEqual(r.ok, true, r.motivo);
  e = r.estado;

  assert.strictEqual(catalogo.vigente(e, { capacidad: 'publicar' }).receta.version, 1);
  // La 2 no se borra: pasa a antecesora, con su historia completa.
  const v2 = e.recetas.find((x) => x.version === 2);
  assert.strictEqual(v2.estado, 'antecesora');
  assert.strictEqual(v2.historia.map((h) => h.tipo).includes('sustitucion'), true);
  // Y la 1 conserva su publicacion original y gana el paso de restauracion.
  const v1 = e.recetas.find((x) => x.version === 1);
  assert.deepStrictEqual(v1.receta, forma.validar(receta()).receta);
  assert.strictEqual(v1.historia[v1.historia.length - 1].tipo, 'restauracion');
  assert.strictEqual(v1.publicacion.restauracion, true);
  assert.strictEqual(v1.publicacion.autorizacion_id, 'aut-0009');
  assert.strictEqual(catalogo.auditar(e).ok, true, JSON.stringify(catalogo.auditar(e).problemas));

  // Una propuesta nunca publicada no es una antecesora: no se "restaura".
  const propuesta = proponer(e, { receta: receta('leer') });
  const noEs = catalogo.restaurar(propuesta.estado, {
    capacidad: 'leer', version: 1, autorizacion_id: 'aut-0010', momento: M3, quien: 'dueno'
  });
  assert.strictEqual(noEs.ok, false);
  assert.strictEqual(noEs.motivo, 'no_es_antecesora');
});

// ---------------------------------------------------------------------------
// 2 · una receta nace propuesta y nunca vigente
// ---------------------------------------------------------------------------

test('receta_nace_propuesta_y_nunca_vigente', () => {
  const e0 = catalogo.estado_vacio();

  const r = proponer(e0);
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.estado_receta, 'propuesta');
  assert.strictEqual(r.vigente, false, 'el nacimiento dice en voz alta que no es vigente');
  assert.strictEqual(r.receta.estado, 'propuesta');
  assert.strictEqual(r.receta.publicacion, null);
  assert.strictEqual(r.version, 1);

  // Una propuesta NO es la receta vigente de su clave: no se resuelve.
  const vig = catalogo.vigente(r.estado, { capacidad: 'publicar' });
  assert.strictEqual(vig.hallada, false);
  assert.strictEqual(vig.receta, null);
  assert.strictEqual(vig.motivo, 'sin_receta');

  // Y no se puede nacer vigente: el atajo esta cerrado por construccion.
  const atajo = proponer(e0, { estado: 'vigente' });
  assert.strictEqual(atajo.ok, false);
  assert.strictEqual(atajo.motivo, 'nace_propuesta');
  assert.strictEqual(atajo.estado_recibido, 'vigente');

  // Sin autorizacion no hay vigencia: la promocion no ocurre y no se escribe nada.
  const sinAut = publicar(r.estado, { version: 1, autorizacion_id: undefined });
  assert.strictEqual(sinAut.ok, false);
  assert.strictEqual(sinAut.motivo, 'sin_confirmacion');
  assert.strictEqual(sinAut.estado, undefined, 'un rechazo no devuelve estado nuevo');
  assert.strictEqual(catalogo.vigente(r.estado, { capacidad: 'publicar' }).hallada, false);

  // Con autorizacion si: ese es el unico camino a vigente.
  const pub = publicar(r.estado, { version: 1 });
  assert.strictEqual(pub.ok, true, pub.motivo);
  assert.strictEqual(pub.vigente, true);
  assert.strictEqual(pub.estado_receta, 'vigente');
  assert.strictEqual(pub.receta.publicacion.autorizacion_id, 'aut-0001');
  assert.strictEqual(catalogo.vigente(pub.estado, { capacidad: 'publicar' }).receta.version, 1);

  // Publicar una receta nueva de una vez NO se salta el nacimiento: queda
  // propuesta y, con autorizacion, vigente en el mismo acto.
  const deUnaVez = catalogo.publicar(catalogo.estado_vacio(), {
    receta: receta('leer'), sello: sello(), autorizacion_id: 'aut-0002', momento: M2, quien: 'dueno', origen: 'chat'
  });
  assert.strictEqual(deUnaVez.ok, true, deUnaVez.motivo);
  const nueva = deUnaVez.estado.recetas.find((x) => x.clave === 'instagram:leer');
  assert.deepStrictEqual(nueva.historia.map((h) => h.tipo), ['propuesta', 'publicacion']);
  assert.strictEqual(nueva.historia[0].a, 'propuesta');
});

test('el_catalogo_no_admite_basura_ni_secretos', () => {
  const e0 = catalogo.estado_vacio();

  // Sin postcondicion no entra: quien valida es A4.1 y el catalogo no lo repite a mano.
  const rota = receta();
  delete rota.postcondicion;
  const sinPost = proponer(e0, { receta: rota });
  assert.strictEqual(sinPost.ok, false);
  assert.strictEqual(sinPost.motivo, 'defecto_de_forma');
  assert.ok(sinPost.defectos.some((d) => d.parte === 'postcondicion' && d.paso === 2));

  // Un secreto en la entrada se rechaza entero y se dice la ruta (V1).
  const conClave = proponer(e0, { contrasena: 'hunter2!' });
  assert.strictEqual(conClave.ok, false);
  assert.strictEqual(conClave.motivo, 'secreto_recibido');
  assert.ok(conClave.rutas.some((r) => r.includes('contrasena')));
  assert.strictEqual(conClave.guardado, false);

  // Sin sello no hay entrada (P1).
  const sinSello = catalogo.proponer(e0, { receta: receta(), sello: { proyecto: 'proy-a' } });
  assert.strictEqual(sinSello.ok, false);
  assert.strictEqual(sinSello.motivo, 'sin_sello');

  // La clave tiene que ser la de la receta: no se publica bajo otra clave.
  const incoherente = proponer(e0, { receta: receta('leer'), capacidad: 'publicar' });
  assert.strictEqual(incoherente.ok, false);
  assert.strictEqual(incoherente.motivo, 'clave_incoherente');
});

// ---------------------------------------------------------------------------
// 3 · la auditoria del almacen
// ---------------------------------------------------------------------------

test('la_auditoria_del_almacen_entero_mancha_el_catalogo', () => {
  const limpio = con_dos_versiones().estado;
  assert.strictEqual(catalogo.auditar(limpio).ok, true, JSON.stringify(catalogo.auditar(limpio).problemas));

  // Dos vigentes en la misma clave: el catalogo deja de saber cual usar.
  const dos = JSON.parse(JSON.stringify(limpio));
  dos.recetas[0].estado = 'vigente';
  const a1 = catalogo.auditar(dos);
  assert.strictEqual(a1.ok, false);
  assert.ok(a1.problemas.some((p) => p.motivo === 'dos_vigentes_en_la_misma_clave'));

  // Una vigente sin firma de publicacion es una vigencia que nadie concedio.
  const sinFirma = JSON.parse(JSON.stringify(limpio));
  sinFirma.recetas[1].publicacion = null;
  const a2 = catalogo.auditar(sinFirma);
  assert.strictEqual(a2.ok, false);
  assert.ok(a2.problemas.some((p) => p.motivo === 'vigente_sin_publicacion'));

  // Sin sello (P1) no pasa la auditoria.
  const sinSello = JSON.parse(JSON.stringify(limpio));
  delete sinSello.recetas[0].sello;
  const a3 = catalogo.auditar(sinSello);
  assert.strictEqual(a3.ok, false);
  assert.ok(a3.problemas.some((p) => p.motivo === 'sin_sello' && p.ruta === 'recetas[0]'));

  // Un token colado a mano no pasa (V1).
  const conToken = JSON.parse(JSON.stringify(limpio));
  conToken.recetas[0].token = 'eyJhbGciOiJIUzI1NiJ9.cGF5bG9hZA.firma';
  assert.ok(catalogo.auditar(conToken).problemas.some((p) => p.motivo === 'secreto'));

  // Una receta que dejo de ser valida (tocada a mano) no pasa (A4.1).
  const rota = JSON.parse(JSON.stringify(limpio));
  delete rota.recetas[0].receta.postcondicion;
  const a4 = catalogo.auditar(rota);
  assert.strictEqual(a4.ok, false);
  assert.ok(a4.problemas.some((p) => p.motivo === 'defecto_de_forma'));

  // Y una entrada que se declara de otro almacen es un exceso (P3).
  const privada = JSON.parse(JSON.stringify(limpio));
  privada.recetas[0].almacen = 'bandejas';
  const a5 = catalogo.auditar(privada);
  assert.strictEqual(a5.ok, false);
  assert.ok(a5.problemas.some((p) => p.motivo === 'no_es_saber_comun'));
});

test('el_catalogo_se_lee_por_clave_y_no_entero', () => {
  const e = con_dos_versiones().estado;

  const entero = catalogo.listar(e, {});
  assert.strictEqual(entero.ok, false);
  assert.strictEqual(entero.motivo, 'ambito_incompleto');
  assert.strictEqual(entero.recetas, undefined, 'un rechazo no devuelve recetas');

  const porClave = catalogo.listar(e, { capacidad: 'publicar', estado: 'vigente' });
  assert.strictEqual(porClave.ok, true);
  assert.strictEqual(porClave.total, 1);
  assert.strictEqual(porClave.recetas[0].version, 2);

  // Y lo leido son copias: tocar el resultado no toca el almacen.
  const antes = JSON.stringify(e);
  porClave.recetas[0].receta.techo = 1;
  assert.strictEqual(JSON.stringify(e), antes, 'listar devuelve copias');
});

// ---------------------------------------------------------------------------
// 4 · el custodio contra disco
// ---------------------------------------------------------------------------

test('el_custodio_persiste_single_writer_y_atomico', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'catalogo-instagram-'));
  try {
    const custodio = crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, true, 'un catalogo que no existe arranca vacio');

    // Dos nacimientos a la vez en la MISMA clave: el candado serializa y las dos
    // versiones quedan (1 y 2), no las dos como version 1.
    const [r1, r2] = await Promise.all([
      custodio.proponer({ receta: receta(), sello: sello() }),
      custodio.proponer({ receta: receta('publicar', { techo: 7000 }), sello: sello() })
    ]);
    assert.strictEqual(r1.ok, true, r1.motivo);
    assert.strictEqual(r2.ok, true, r2.motivo);
    assert.deepStrictEqual([r1.version, r2.version].sort(), [1, 2], 'sin candado, las dos serian la 1');

    const enDisco = JSON.parse(await fsp.readFile(path.join(dir, 'catalogo-recetas.json'), 'utf8'));
    assert.strictEqual(enDisco.esquema, 'catalogo-recetas-v1');
    assert.strictEqual(enDisco.recetas.length, 2);
    assert.strictEqual(enDisco.revision, 2);
    assert.strictEqual(catalogo.auditar(enDisco).ok, true, 'lo persistido pasa la auditoria');

    const restos = (await fsp.readdir(dir)).filter((f) => f.endsWith('.tmp'));
    assert.deepStrictEqual(restos, [], 'sin ficheros temporales sueltos');

    // Otra instancia lee lo mismo y publica la v2: el fichero es el que manda.
    const otra = crear({ directorio: dir });
    await otra.cargar();
    const pub = await otra.publicar({ capacidad: 'publicar', version: 2, autorizacion_id: 'aut-1', momento: M2, quien: 'dueno' });
    assert.strictEqual(pub.ok, true, pub.motivo);
    const tras = JSON.parse(await fsp.readFile(path.join(dir, 'catalogo-recetas.json'), 'utf8'));
    assert.strictEqual(tras.recetas.filter((r) => r.estado === 'vigente').length, 1);
    assert.strictEqual(catalogo.vigente(tras, { capacidad: 'publicar' }).receta.version, 2);

    // Un fallo del bus sale por .failed con su request_id, no como response con
    // ok:false: nadie puede leer un fallo como un exito.
    const fallos = [];
    otra.eventBus = { publish: (t, p) => fallos.push({ t, p }) };
    const sinAut = await otra.onPublicarRequest({
      data: { request_id: 'req-1', capacidad: 'publicar', version: 1, momento: M2, quien: 'dueno' }
    });
    assert.strictEqual(sinAut.ok, false);
    assert.strictEqual(sinAut.motivo, 'sin_confirmacion');
    assert.strictEqual(fallos.length, 1);
    assert.strictEqual(fallos[0].t, 'instagram.receta.publicar.failed');
    assert.strictEqual(fallos[0].p.request_id, 'req-1');
    // Y el catalogo en disco no ha cambiado por un rechazo.
    assert.strictEqual(catalogo.vigente(JSON.parse(await fsp.readFile(path.join(dir, 'catalogo-recetas.json'), 'utf8')), { capacidad: 'publicar' }).receta.version, 2);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('un_catalogo_ilegible_no_se_sobrescribe', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'catalogo-roto-'));
  try {
    const ruta = path.join(dir, 'catalogo-recetas.json');
    const basura = '{ esto no es un catalogo';
    await fsp.writeFile(ruta, basura, 'utf8');

    const custodio = crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, false);
    assert.ok(['catalogo_ilegible', 'esquema_desconocido'].includes(carga.motivo));

    const r = await custodio.proponer({ receta: receta(), sello: sello() });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_catalogo');

    const leido = await custodio.vigente({ capacidad: 'publicar' });
    assert.strictEqual(leido.ok, false);
    assert.strictEqual(leido.motivo, 'sin_catalogo');

    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), basura, 'el catalogo roto no se machaca');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('el_fichero_del_repo_es_un_catalogo_valido_y_vacio', async () => {
  const ruta = path.resolve(__dirname, '../../../storage/instagram-bridge/catalogo-recetas.json');
  const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));
  assert.strictEqual(datos.esquema, 'catalogo-recetas-v1');
  assert.deepStrictEqual(datos.recetas, [], 'el catalogo del repo nace vacio y sin recetas inventadas');
  assert.strictEqual(catalogo.auditar(datos).ok, true);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__catalogo] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__catalogo] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
