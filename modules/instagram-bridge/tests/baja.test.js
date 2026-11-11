'use strict';

/**
 * instagram-bridge · B4 · BajaYTraspaso (CUSTODIO)
 *
 * El final del ciclo de vida de una cuenta. Esta suite fija lo que no se puede
 * relajar:
 *   - la baja ARCHIVA: el asiento sigue en el padron y en el fichero, con su
 *     archivo y su historia; no desaparece nada;
 *   - sin autorizacion_id no hay baja (el padron lo exige y B4 no lo rellena);
 *   - el traspaso conserva la historia y NO reescribe el sello ni el alta de
 *     nacimiento;
 *   - el traspaso exige ficha en el proyecto destino: sin ella queda PENDIENTE y
 *     la cuenta sigue sirviendo a quien servia;
 *   - borrar no es dar de baja: B4 no borra, dice que se perderia.
 *
 * Ejecutar: node modules/instagram-bridge/tests/baja.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const { crear } = require('../cuentas');
const baja = require('../cuentas/baja');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-11T13:00:00Z';
const M3 = '2026-11-11T14:00:00Z';

// ---------------------------------------------------------------------------
// utillaje: padron REAL (B1) en un directorio temporal + B4 encima
// ---------------------------------------------------------------------------

async function montar() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'instagram-baja-'));
  const padron = crear({ directorio: dir });
  await padron.cargar();
  await padron.fichas.cargar();
  const custodia = baja.crear({ padron, fichas: padron.fichas });
  return { dir, padron, custodia, limpiar: () => fsp.rm(dir, { recursive: true, force: true }) };
}

async function inscribir(padron, opts = {}) {
  const r = await padron.alta(Object.assign({
    cuenta: '@taller_a',
    proyecto: 'proy-a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno'
  }, opts));
  assert.strictEqual(r.ok, true, r.motivo);
  return r.asiento;
}

async function declarar_ficha(padron, proyecto) {
  const r = await padron.fichas.declarar({
    cuenta: '@taller_a',
    proyecto,
    aparato: 'movil-1',
    momento: M2,
    quien: 'dueno',
    autorizacion_id: 'aut-ficha-0001',
    identidad_visible: { nombre: 'Taller A' }
  });
  assert.strictEqual(r.ok, true, r.motivo);
  return r.ficha;
}

function baja_ok(extra = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    motivo: 'el proyecto deja de usar la cuenta',
    momento: M2,
    quien: 'dueno',
    autorizacion_id: 'aut-baja-0001'
  }, extra);
}

function traspaso_ok(extra = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    proyecto_destino: 'proy-b',
    motivo: 'la cuenta pasa al proyecto B',
    momento: M2,
    quien: 'dueno',
    autorizacion_id: 'aut-traspaso-0001'
  }, extra);
}

async function leer_fichero(dir) {
  return JSON.parse(await fsp.readFile(path.join(dir, 'padron.json'), 'utf8'));
}

// ---------------------------------------------------------------------------
// 1 · dar de baja archiva y no borra
// ---------------------------------------------------------------------------

test('dar_de_baja_archiva_y_no_borra', async () => {
  const { dir, padron, custodia, limpiar } = await montar();
  try {
    const nacimiento = await inscribir(padron);

    // Sin autorizacion registrada no se archiva: y no se escribe nada.
    const sinPermiso = await custodia.dar_de_baja(baja_ok({ autorizacion_id: undefined }));
    assert.strictEqual(sinPermiso.ok, false);
    assert.strictEqual(sinPermiso.motivo, 'sin_autorizacion');
    assert.deepStrictEqual(sinPermiso.faltan, ['autorizacion_id']);
    assert.strictEqual((await leer_fichero(dir)).asientos[0].estado, 'vigente', 'sin permiso no se toca el padron');

    const r = await custodia.dar_de_baja(baja_ok());
    assert.strictEqual(r.ok, true, r.motivo);
    assert.strictEqual(r.archivada, true);
    assert.strictEqual(r.borrado, false, 'la baja no borra');
    assert.strictEqual(r.historia_conservada, true);
    assert.strictEqual(r.sigue_consultable, true);
    assert.strictEqual(r.autorizacion_id, 'aut-baja-0001');

    // El asiento sigue en el FICHERO: archivado, con su archivo y su historia.
    const enDisco = await leer_fichero(dir);
    assert.strictEqual(enDisco.asientos.length, 1, 'el asiento NO se ha borrado del fichero');
    const a = enDisco.asientos[0];
    assert.strictEqual(a.estado, 'archivada');
    assert.strictEqual(a.cuenta, 'taller_a');
    assert.strictEqual(a.archivo.motivo, 'el proyecto deja de usar la cuenta');
    assert.strictEqual(a.archivo.quien, 'dueno');
    assert.strictEqual(a.archivo.autorizacion_id, 'aut-baja-0001');
    assert.strictEqual(a.historia.length, 1);
    assert.strictEqual(a.historia[0].tipo, 'archivado');

    // El alta de nacimiento y el sello no se tocaron al archivar.
    assert.deepStrictEqual(a.alta, nacimiento.alta, 'el alta de nacimiento sigue igual');
    assert.deepStrictEqual(a.sello, nacimiento.sello, 'el sello sigue igual');

    // Y la cuenta retirada se sigue pudiendo consultar (retirada != desaparecida).
    const consulta = await padron.consultar({ cuenta: '@taller_a' });
    assert.strictEqual(consulta.hallada, true, 'la cuenta archivada se sigue encontrando');
    assert.strictEqual(consulta.asiento.estado, 'archivada');

    // Segunda baja: ya esta archivada, y se dice.
    const otra = await custodia.dar_de_baja(baja_ok({ momento: M3 }));
    assert.strictEqual(otra.ok, false);
    assert.strictEqual(otra.motivo, 'ya_archivada');
    assert.strictEqual((await leer_fichero(dir)).asientos.length, 1);

    // Borrar no es dar de baja: B4 no borra y dice que se perderia.
    const borrado = custodia.borrar({ cuenta: '@taller_a', orden_explicita: true });
    assert.strictEqual(borrado.ok, false);
    assert.strictEqual(borrado.motivo, 'borrar_no_es_dar_de_baja');
    assert.strictEqual(borrado.borrado, false);
    assert.strictEqual(borrado.se_pierde.length, 3, 'dice las tres cosas que se perderian');
    assert.ok(/Q5/.test(borrado.exige), 'nombra la autorizacion que haria falta');
    assert.strictEqual((await leer_fichero(dir)).asientos.length, 1, 'borrar no ha borrado nada');
  } finally {
    await limpiar();
  }
});

// ---------------------------------------------------------------------------
// 2 · el traspaso conserva la historia y no reescribe el sello
// ---------------------------------------------------------------------------

test('el_traspaso_conserva_la_historia_y_no_reescribe_el_sello', async () => {
  const { dir, padron, custodia, limpiar } = await montar();
  try {
    const nacimiento = await inscribir(padron);

    // Puerta del destino: proy-b no tiene ficha -> el traspaso queda PENDIENTE.
    const pendiente = await custodia.traspasar(traspaso_ok());
    assert.strictEqual(pendiente.ok, false);
    assert.strictEqual(pendiente.motivo, 'ficha_destino_ausente');
    assert.strictEqual(pendiente.pendiente, true);
    assert.strictEqual(pendiente.cuenta_sigue_sirviendo, true);
    assert.strictEqual(pendiente.proyecto_actual, 'proy-a');
    const intacto = (await leer_fichero(dir)).asientos[0];
    assert.strictEqual(intacto.proyecto, 'proy-a', 'sin ficha, la cuenta no se ha movido');
    assert.strictEqual(intacto.historia.length, 0, 'ni se ha escrito historia de un traspaso que no hubo');

    // Con ficha en el destino, el traspaso se hace.
    await declarar_ficha(padron, 'proy-b');
    const r = await custodia.traspasar(traspaso_ok());
    assert.strictEqual(r.ok, true, r.motivo);
    assert.strictEqual(r.traspaso, true);
    assert.strictEqual(r.sello_intacto, true);
    assert.strictEqual(r.alta_intacta, true);
    assert.deepStrictEqual(r.de, { proyecto: 'proy-a', aparato: 'movil-1' });
    assert.deepStrictEqual(r.a, { proyecto: 'proy-b', aparato: 'movil-1' });

    // El asiento: dueno nuevo, historia con UN paso, sello y alta sin tocar.
    const despues = (await leer_fichero(dir)).asientos[0];
    assert.strictEqual(despues.proyecto, 'proy-b');
    assert.strictEqual(despues.estado, 'vigente');
    assert.strictEqual(despues.archivo, null);
    assert.strictEqual(despues.historia.length, 1);
    assert.strictEqual(despues.historia[0].tipo, 'traspaso');
    assert.deepStrictEqual(despues.historia[0].de, { proyecto: 'proy-a', aparato: 'movil-1' });
    assert.deepStrictEqual(despues.historia[0].a, { proyecto: 'proy-b', aparato: 'movil-1' });
    assert.deepStrictEqual(despues.sello, nacimiento.sello, 'el sello NO se reescribe');
    assert.deepStrictEqual(despues.alta, nacimiento.alta, 'el alta de nacimiento NO se reescribe');

    // Despues del traspaso, la baja sigue archivando y conserva TODO.
    const bajaHecha = await custodia.dar_de_baja(baja_ok({ momento: M3, proyecto: 'proy-b' }));
    assert.strictEqual(bajaHecha.ok, true, bajaHecha.motivo);
    const final = (await leer_fichero(dir)).asientos[0];
    assert.strictEqual(final.estado, 'archivada');
    assert.strictEqual(final.historia.length, 2, 'traspaso + archivado');
    assert.deepStrictEqual(final.historia.map((p) => p.tipo), ['traspaso', 'archivado']);
    assert.deepStrictEqual(final.sello, nacimiento.sello);
    assert.deepStrictEqual(final.alta, nacimiento.alta);

    // Y una cuenta archivada no se traspasa: se da de alta otra vez.
    const archivaTraspaso = await custodia.traspasar(traspaso_ok({ proyecto_destino: 'proy-c', momento: M3 }));
    assert.strictEqual(archivaTraspaso.ok, false);
    assert.strictEqual(archivaTraspaso.motivo, 'cuenta_archivada');
  } finally {
    await limpiar();
  }
});

// ---------------------------------------------------------------------------
// 3 · el borde no se salta al padron: cuenta desconocida y proyecto ajeno
// ---------------------------------------------------------------------------

test('la_baja_no_archiva_lo_que_no_es_del_proyecto_que_ordena', async () => {
  const { padron, custodia, limpiar } = await montar();
  try {
    await inscribir(padron);

    const desconocida = await custodia.dar_de_baja(baja_ok({ cuenta: '@no_existe' }));
    assert.strictEqual(desconocida.ok, false);
    assert.strictEqual(desconocida.motivo, 'cuenta_desconocida');

    const ajena = await custodia.dar_de_baja(baja_ok({ proyecto: 'proy-otro' }));
    assert.strictEqual(ajena.ok, false);
    assert.strictEqual(ajena.motivo, 'cuenta_de_otro_proyecto');
    assert.strictEqual(ajena.proyecto_vigente, 'proy-a');

    const sinPadron = baja.crear({});
    const r = await sinPadron.dar_de_baja(baja_ok());
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_padron', 'sin padron no se inventa un almacen');

    // La cuenta sigue vigente: ninguno de los rechazos archivo nada.
    assert.strictEqual((await padron.consultar({ cuenta: '@taller_a' })).asiento.estado, 'vigente');
  } finally {
    await limpiar();
  }
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__baja] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__baja] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
