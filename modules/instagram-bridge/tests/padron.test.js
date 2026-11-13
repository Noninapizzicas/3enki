'use strict';

/**
 * instagram-bridge · B1 · PadronDeCuentas (CUSTODIO)
 *
 * El padron es el indice de duenos: que cuenta sirve a que proyecto y en que
 * aparato. Esta suite fija lo que no se puede relajar:
 *   - una cuenta tiene UN proyecto vigente; un proyecto puede tener N cuentas;
 *   - la baja ARCHIVA: el asiento sigue ahi, con su archivo y su historia;
 *   - el traspaso cambia de dueno sin perder el alta de nacimiento ni el sello;
 *   - el padron se lee por proyecto y no mezcla ambitos (sin criterio no lista);
 *   - el asiento nace sellado (P1) y el almacen no admite secretos (V1);
 *   - el custodio escribe single-writer y de forma atomica sobre el fichero, y
 *     un padron ilegible NO se sobrescribe.
 *
 * Ejecutar: node modules/instagram-bridge/tests/padron.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const padron = require('../cuentas/padron');
const { crear } = require('../cuentas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T08:00:00Z';
const M3 = '2026-11-13T09:30:00Z';

function alta(opts = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    proyecto: 'proy-a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno'
  }, opts);
}

function baja(opts = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    motivo: 'el proyecto deja de usar la cuenta',
    momento: M2,
    quien: 'dueno',
    autorizacion_id: 'aut-0001'
  }, opts);
}

function traspaso(opts = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    proyecto_destino: 'proy-b',
    motivo: 'traspaso de la cuenta al proyecto B',
    momento: M2,
    quien: 'dueno'
  }, opts);
}

// Estado con dos cuentas del proyecto A (en dos aparatos) y una del proyecto B.
function padron_de_tres() {
  let e = padron.estado_vacio();
  const r1 = padron.alta(e, alta({ cuenta: '@taller_a', proyecto: 'proy-a', aparato: 'movil-1' }));
  assert.strictEqual(r1.ok, true, r1.motivo);
  e = r1.estado;
  const r2 = padron.alta(e, alta({ cuenta: '@taller_b', proyecto: 'proy-a', aparato: 'movil-2', momento: M2 }));
  assert.strictEqual(r2.ok, true, r2.motivo);
  e = r2.estado;
  const r3 = padron.alta(e, alta({ cuenta: '@taller_c', proyecto: 'proy-b', aparato: 'movil-3', momento: M3 }));
  assert.strictEqual(r3.ok, true, r3.motivo);
  return r3.estado;
}

// ---------------------------------------------------------------------------
// 1 · una cuenta, un proyecto vigente; N cuentas por proyecto
// ---------------------------------------------------------------------------

test('una_cuenta_un_proyecto_vigente_y_N_cuentas_por_proyecto', () => {
  let e = padron.estado_vacio();

  // N cuentas en el mismo proyecto: cada una en su aparato (W3).
  const a1 = padron.alta(e, alta({ cuenta: '@taller_a', proyecto: 'proy-a', aparato: 'movil-1' }));
  assert.strictEqual(a1.ok, true, a1.motivo);
  e = a1.estado;

  const a2 = padron.alta(e, alta({ cuenta: '@taller_b', proyecto: 'proy-a', aparato: 'movil-2', momento: M2 }));
  assert.strictEqual(a2.ok, true, 'un proyecto puede tener N cuentas');
  e = a2.estado;

  assert.strictEqual(padron.cuentas_de(e, 'proy-a').length, 2, 'dos cuentas vigentes en proy-a');

  // La misma cuenta no puede tener dos duenos vigentes: se traspasa, no se re-inscribe.
  const repetida = padron.alta(e, alta({ cuenta: '@TALLER_A', proyecto: 'proy-b', aparato: 'movil-9', momento: M3 }));
  assert.strictEqual(repetida.ok, false, 'una cuenta no se inscribe dos veces');
  assert.strictEqual(repetida.motivo, 'cuenta_ya_inscrita');
  assert.strictEqual(repetida.proyecto_vigente, 'proy-a', 'dice cual es el dueno vigente');
  assert.strictEqual(repetida.estado, undefined, 'un rechazo no devuelve estado nuevo');

  // ... y el padron no ha cambiado: sigue habiendo dos asientos y ninguna en proy-b.
  const vigente = padron.vigente_de(e, { cuenta: '@taller_a' });
  assert.strictEqual(vigente.proyecto, 'proy-a', 'el dueno vigente no se movio');
  assert.strictEqual(padron.cuentas_de(e, 'proy-b').length, 0);
  assert.strictEqual(e.asientos.length, 2);

  // Invariante: cada asiento vigente tiene UN proyecto, un aparato y un estado.
  for (const asiento of e.asientos) {
    assert.strictEqual(typeof asiento.proyecto, 'string');
    assert.strictEqual(asiento.proyecto.trim() !== '', true);
    assert.strictEqual(typeof asiento.aparato, 'string');
    assert.strictEqual(asiento.estado, 'vigente');
  }
});

test('un_aparato_sostiene_una_cuenta_y_eso_es_cardinalidad', () => {
  let e = padron.estado_vacio();
  e = padron.alta(e, alta({ cuenta: '@taller_a', aparato: 'movil-1' })).estado;

  const choque = padron.alta(e, alta({ cuenta: '@personal_b', aparato: 'movil-1', momento: M2 }));
  assert.strictEqual(choque.ok, false, 'dos cuentas vivas en el mismo movil, no');
  assert.strictEqual(choque.motivo, 'cardinalidad_aparato');
  assert.strictEqual(choque.cuenta_ocupante, 'taller_a');

  // Y el traspaso tampoco puede llevar la cuenta a un aparato ya ocupado.
  const otro = padron.alta(e, alta({ cuenta: '@taller_b', aparato: 'movil-2', momento: M2 }));
  const movido = padron.traspaso(otro.estado, traspaso({ cuenta: '@taller_b', proyecto_destino: 'proy-b', aparato: 'movil-1' }));
  assert.strictEqual(movido.ok, false);
  assert.strictEqual(movido.motivo, 'cardinalidad_aparato');
});

// ---------------------------------------------------------------------------
// 2 · la baja archiva, no borra
// ---------------------------------------------------------------------------

test('baja_archiva_no_borra', () => {
  let e = padron.alta(padron.estado_vacio(), alta()).estado;
  const nacimiento = JSON.parse(JSON.stringify(e.asientos[0]));

  // Sin permiso registrado no se archiva: el padron no acepta la orden a secas.
  const sinPermiso = padron.baja(e, baja({ autorizacion_id: undefined }));
  assert.strictEqual(sinPermiso.ok, false);
  assert.strictEqual(sinPermiso.motivo, 'sin_autorizacion');
  assert.ok(sinPermiso.faltan.includes('autorizacion_id'), 'el hueco se nombra');
  assert.strictEqual(e.asientos[0].estado, 'vigente', 'sin permiso no se ha tocado nada');

  const r = padron.baja(e, baja());
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.historia_conservada, true);

  const despues = r.estado;
  assert.strictEqual(despues.asientos.length, 1, 'el asiento NO se borra');
  const asiento = despues.asientos[0];
  assert.strictEqual(asiento.estado, 'archivada');
  assert.strictEqual(asiento.cuenta, 'taller_a');
  assert.strictEqual(asiento.proyecto, 'proy-a', 'el proyecto de la historia no se pierde');
  assert.deepStrictEqual(asiento.alta, nacimiento.alta, 'el alta de nacimiento queda intacta');
  assert.deepStrictEqual(asiento.sello, nacimiento.sello, 'y su sello tambien');
  assert.strictEqual(asiento.archivo.motivo, 'el proyecto deja de usar la cuenta');
  assert.strictEqual(asiento.archivo.autorizacion_id, 'aut-0001');
  assert.strictEqual(asiento.archivo.momento, M2);

  // La historia guarda el paso de archivo; nada se ha reescrito.
  assert.strictEqual(asiento.historia.length, 1);
  assert.strictEqual(asiento.historia[0].tipo, 'archivado');
  assert.strictEqual(asiento.historia[0].de.estado, 'vigente');
  assert.strictEqual(asiento.historia[0].a.estado, 'archivada');

  // Sigue siendo consultable (archivada, pero consultable): eso es "no borrar".
  const c = padron.consultar(despues, { cuenta: '@taller_a' });
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.hallada, true);
  assert.strictEqual(c.asiento.estado, 'archivada');
  assert.strictEqual(padron.vigente_de(despues, { cuenta: '@taller_a' }), null, 'ya no hay dueno vigente');

  // Archivar dos veces es un fallo nombrado, no un no-op silencioso.
  const otraVez = padron.baja(despues, baja({ momento: M3 }));
  assert.strictEqual(otraVez.ok, false);
  assert.strictEqual(otraVez.motivo, 'ya_archivada');

  // Y una cuenta archivada no se opera: el traspaso la rechaza.
  const traspasoDeArchivada = padron.traspaso(despues, traspaso());
  assert.strictEqual(traspasoDeArchivada.ok, false);
  assert.strictEqual(traspasoDeArchivada.motivo, 'cuenta_archivada');
});

// ---------------------------------------------------------------------------
// 3 · el traspaso cambia de dueno sin perder historia
// ---------------------------------------------------------------------------

test('traspaso_cambia_dueno_sin_perder_historia', () => {
  let e = padron.alta(padron.estado_vacio(), alta()).estado;
  const nacimiento = JSON.parse(JSON.stringify(e.asientos[0]));

  const r = padron.traspaso(e, traspaso());
  assert.strictEqual(r.ok, true, r.motivo);
  e = r.estado;

  const asiento = e.asientos[0];
  assert.strictEqual(asiento.proyecto, 'proy-b', 'el dueno vigente cambia');
  assert.strictEqual(asiento.desde, M2);
  assert.deepStrictEqual(asiento.alta, nacimiento.alta, 'el alta de nacimiento no se reescribe');
  assert.deepStrictEqual(asiento.sello, nacimiento.sello, 'el sello de nacimiento no se reescribe');

  assert.strictEqual(asiento.historia.length, 1, 'el cambio queda como historia');
  assert.strictEqual(asiento.historia[0].secuencia, 1);
  assert.strictEqual(asiento.historia[0].tipo, 'traspaso');
  assert.strictEqual(asiento.historia[0].de.proyecto, 'proy-a');
  assert.strictEqual(asiento.historia[0].a.proyecto, 'proy-b');
  assert.strictEqual(asiento.historia[0].motivo, 'traspaso de la cuenta al proyecto B');
  assert.strictEqual(asiento.historia[0].momento, M2);
  assert.strictEqual(asiento.historia[0].quien, 'dueno');

  // El padron ya responde por el dueno nuevo y deja de responder por el viejo.
  assert.strictEqual(padron.cuentas_de(e, 'proy-a').length, 0);
  assert.strictEqual(padron.cuentas_de(e, 'proy-b').length, 1);
  assert.strictEqual(padron.vigente_de(e, { cuenta: '@taller_a' }).proyecto, 'proy-b');

  // Un segundo traspaso anade paso y no pisa el primero.
  const segundo = padron.traspaso(e, traspaso({ proyecto_destino: 'proy-c', motivo: 'el proyecto B se cierra', momento: M3 }));
  assert.strictEqual(segundo.ok, true, segundo.motivo);
  const h = segundo.asiento.historia;
  assert.strictEqual(h.length, 2);
  assert.strictEqual(h[0].a.proyecto, 'proy-b', 'la historia no se reescribe');
  assert.strictEqual(h[1].secuencia, 2);
  assert.strictEqual(h[1].de.proyecto, 'proy-b');
  assert.strictEqual(h[1].a.proyecto, 'proy-c');
  assert.strictEqual(segundo.asiento.alta.momento, M1, 'sigue naciendo el 11');

  // Traspasar al mismo dueno es un fallo nombrado, no un cambio vacio.
  const mismo = padron.traspaso(segundo.estado, traspaso({ proyecto_destino: 'proy-c', momento: M3 }));
  assert.strictEqual(mismo.ok, false);
  assert.strictEqual(mismo.motivo, 'mismo_proyecto');

  // Y una cuenta que no esta no se traspasa.
  const fantasma = padron.traspaso(segundo.estado, traspaso({ cuenta: '@nadie', momento: M3 }));
  assert.strictEqual(fantasma.ok, false);
  assert.strictEqual(fantasma.motivo, 'cuenta_desconocida');
});

// ---------------------------------------------------------------------------
// 4 · el padron se lee por proyecto y no mezcla
// ---------------------------------------------------------------------------

test('el_padron_se_lee_por_proyecto_y_no_mezcla', () => {
  const e = padron_de_tres();

  const a = padron.listar(e, { proyecto: 'proy-a' });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.total, 2);
  assert.deepStrictEqual(a.asientos.map((x) => x.cuenta).sort(), ['taller_a', 'taller_b']);
  for (const asiento of a.asientos) {
    assert.strictEqual(asiento.proyecto, 'proy-a', 'ni un asiento de otro proyecto');
  }
  assert.ok(!a.asientos.some((x) => x.cuenta === 'taller_c'), 'la cuenta de proy-b no se cuela');

  const b = padron.listar(e, { proyecto: 'proy-b' });
  assert.strictEqual(b.total, 1);
  assert.strictEqual(b.asientos[0].cuenta, 'taller_c');

  // Por aparato y por cuenta (el handle se normaliza: @ y mayusculas dan igual).
  const porAparato = padron.listar(e, { aparato: 'movil-3' });
  assert.deepStrictEqual(porAparato.asientos.map((x) => x.cuenta), ['taller_c']);
  const porCuenta = padron.listar(e, { cuenta: '@TALLER_B' });
  assert.strictEqual(porCuenta.total, 1);
  assert.strictEqual(porCuenta.asientos[0].proyecto, 'proy-a');

  // Sin criterio de ambito no hay listado: el padron no se devuelve entero.
  const entero = padron.listar(e, {});
  assert.strictEqual(entero.ok, false);
  assert.strictEqual(entero.motivo, 'ambito_incompleto');
  assert.strictEqual(entero.asientos, undefined, 'no hay asientos en un rechazo');

  // Y el estado de origen no se muta al listar (las lecturas no escriben).
  const antes = JSON.stringify(e);
  padron.listar(e, { proyecto: 'proy-a' }).asientos[0].proyecto = 'proy-z';
  assert.strictEqual(JSON.stringify(e), antes, 'listar devuelve copias');
});

// ---------------------------------------------------------------------------
// Extras: sello, secretos y el custodio contra disco
// ---------------------------------------------------------------------------

test('el_asiento_nace_sellado_y_el_padron_se_audita', () => {
  const e = padron_de_tres();

  for (const asiento of e.asientos) {
    assert.ok(asiento.sello, 'todo asiento nace con sello (P1)');
    assert.deepStrictEqual(Object.keys(asiento.sello).sort(), ['aparato', 'cuenta', 'momento', 'proyecto', 'quien']);
    assert.strictEqual(asiento.sello.proyecto, asiento.proyecto);
    assert.strictEqual(asiento.sello.aparato, asiento.aparato);
    assert.strictEqual(asiento.sello.cuenta, asiento.cuenta);
  }

  const limpia = padron.auditar(e);
  assert.strictEqual(limpia.ok, true, JSON.stringify(limpia.problemas));

  // Un asiento sin sello mancha el almacen entero y se nombra la ruta.
  const roto = JSON.parse(JSON.stringify(e));
  delete roto.asientos[1].sello;
  const sucia = padron.auditar(roto);
  assert.strictEqual(sucia.ok, false);
  assert.ok(sucia.problemas.some((p) => p.motivo === 'sin_sello' && p.ruta === 'asientos[1]'));
});

test('el_padron_no_guarda_secretos', () => {
  const e = padron.estado_vacio();

  // Una credencial en la entrada se rechaza entera y se dice donde venia.
  const conClave = padron.alta(e, alta({ contrasena: 'hunter2!' }));
  assert.strictEqual(conClave.ok, false);
  assert.strictEqual(conClave.motivo, 'secreto_recibido');
  assert.strictEqual(conClave.guardado, false);
  assert.ok(conClave.rutas.some((r) => r.includes('contrasena')), 'la ruta del secreto se nombra');
  assert.strictEqual(e.asientos.length, 0, 'no ha entrado nada');

  const conToken = padron.traspaso(padron_de_tres(), traspaso({ sessionid: 'abc123def456' }));
  assert.strictEqual(conToken.ok, false);
  assert.strictEqual(conToken.motivo, 'secreto_recibido');

  // Y sobre el almacen entero: un token colado a mano se detecta.
  const sucio = JSON.parse(JSON.stringify(padron_de_tres()));
  sucio.asientos[0].token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123';
  const auditoria = padron.auditar(sucio);
  assert.strictEqual(auditoria.ok, false);
  assert.ok(auditoria.problemas.some((p) => p.motivo === 'secreto'), 'el token no pasa la auditoria');
});

test('el_custodio_persiste_single_writer_y_no_pierde_asientos', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'padron-instagram-'));
  try {
    const custodio = crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, true, 'un padron que no existe arranca vacio');

    // Dos altas a la vez: el candado de single-writer las serializa y las dos
    // acaban en el fichero. Sin candado, la segunda pisaria el estado de la primera.
    const [r1, r2] = await Promise.all([
      custodio.alta(alta({ cuenta: '@taller_a', aparato: 'movil-1' })),
      custodio.alta(alta({ cuenta: '@taller_b', aparato: 'movil-2', momento: M2 }))
    ]);
    assert.strictEqual(r1.ok, true, r1.motivo);
    assert.strictEqual(r2.ok, true, r2.motivo);

    const disco = JSON.parse(await fsp.readFile(path.join(dir, 'padron.json'), 'utf8'));
    assert.strictEqual(disco.esquema, 'padron-cuentas-v1');
    assert.strictEqual(disco.asientos.length, 2, 'las dos altas estan en el fichero');
    assert.strictEqual(disco.revision, 2);
    assert.strictEqual(padron.auditar(disco).ok, true, 'lo persistido pasa la auditoria');

    // No quedan temporales: la escritura fue atomica y se renombro.
    const restos = (await fsp.readdir(dir)).filter((f) => f.endsWith('.tmp'));
    assert.deepStrictEqual(restos, [], 'sin ficheros temporales sueltos');

    // Otra instancia lee lo mismo: el almacen es el que manda, no la memoria.
    const otra = crear({ directorio: dir });
    await otra.cargar();
    assert.strictEqual(otra.foto().asientos.length, 2);
    assert.strictEqual(otra.foto().asientos[0].sello.proyecto, 'proy-a');

    // Una baja a traves del custodio tambien persiste el archivo, no el borrado.
    const bajaOk = await otra.baja(baja({ cuenta: '@taller_a' }));
    assert.strictEqual(bajaOk.ok, true, bajaOk.motivo);
    const tras = JSON.parse(await fsp.readFile(path.join(dir, 'padron.json'), 'utf8'));
    assert.strictEqual(tras.asientos.length, 2, 'archivar no borra el asiento del fichero');
    assert.strictEqual(tras.asientos[0].estado, 'archivada');
    assert.strictEqual(tras.asientos[0].archivo.autorizacion_id, 'aut-0001');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('un_padron_ilegible_no_se_sobrescribe', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'padron-roto-'));
  try {
    const ruta = path.join(dir, 'padron.json');
    const basura = '{ esto no es un padron';
    await fsp.writeFile(ruta, basura, 'utf8');

    const custodio = crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, false);
    assert.ok(['padron_ilegible', 'esquema_desconocido'].includes(carga.motivo));

    // Ni alta ni listado: se devuelve sin_padron y el fichero queda como estaba.
    const r = await custodio.alta(alta());
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_padron');

    const listado = await custodio.listar({ proyecto: 'proy-a' });
    assert.strictEqual(listado.ok, false);
    assert.strictEqual(listado.motivo, 'sin_padron');

    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), basura, 'el padron roto no se machaca');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('el_fichero_del_repo_es_un_padron_valido_y_vacio', async () => {
  const ruta = path.resolve(__dirname, '../../../storage/instagram-bridge/padron.json');
  const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));
  assert.strictEqual(datos.esquema, 'padron-cuentas-v1');
  assert.deepStrictEqual(datos.asientos, [], 'el padron del repo nace vacio y sin duenos inventados');
  assert.strictEqual(padron.auditar(datos).ok, true);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__padron] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__padron] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
