'use strict';

/**
 * instagram-bridge · E1 · FichaDeCuenta (CUSTODIO)
 *
 * La ficha es el NOMBRE de la cuenta: identidad visible, voz declarada por el
 * proyecto y limites propios. Esta suite fija lo que no se puede relajar:
 *   - sin ficha NO se opera; con ficha y sin voz SOLO SE LEE;
 *   - la voz no se inventa: la declara el proyecto, con su autorizacion;
 *   - la ficha es por cuenta Y por proyecto: no se lee desde otro proyecto;
 *   - una cuenta sin proyecto dueno es un FALLO DE ALTA, no una ficha incompleta;
 *   - el custodio escribe single-writer, de forma atomica, audita antes de
 *     escribir y NO sobrescribe un almacen ilegible.
 *
 * Ejecutar: node modules/instagram-bridge/tests/ficha.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const ficha = require('../cuentas/ficha');
const cuentas = require('../cuentas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T08:00:00Z';

const VOZ = {
  tono: 'cercano, sin emojis, frases cortas',
  vocabulario: ['torno', 'esmalte', 'horno'],
  lo_que_nunca_dice: ['garantia de por vida', 'el mejor del mundo'],
  limites_de_tema: ['politica', 'salud'],
  declarada_por: 'proyecto',
  autorizacion_id: 'aut-voz-1'
};

function declaracion(opts = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    proyecto: 'proy-a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno',
    autorizacion_id: 'aut-ficha-1',
    identidad_visible: { nombre: 'Taller A', presentacion: 'ceramica de torno' }
  }, opts);
}

function cambio(opts = {}) {
  return Object.assign({
    cuenta: '@taller_a',
    proyecto: 'proy-a',
    cambio: { voz: VOZ },
    motivo: 'el proyecto declara la voz de la cuenta',
    momento: M2,
    quien: 'dueno',
    autorizacion_id: 'aut-voz-1'
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · sin ficha no se opera; sin voz solo se lee
// ---------------------------------------------------------------------------

test('sin_ficha_no_se_opera_y_sin_voz_solo_se_lee', () => {
  const vacio = ficha.estado_vacio();

  // Sin ficha: no hay nada que operar y se dice.
  const sinFicha = ficha.leer(vacio, { proyecto: 'proy-a', cuenta: '@taller_a' });
  assert.strictEqual(sinFicha.ok, true);
  assert.strictEqual(sinFicha.hallada, false);
  assert.strictEqual(sinFicha.modo, 'sin_ficha');

  const op = ficha.puede_operar(null);
  assert.strictEqual(op.ok, false);
  assert.strictEqual(op.motivo, 'sin_ficha');
  assert.strictEqual(ficha.admite(null, 'hola').motivo, 'sin_ficha');

  // Ficha sin voz: existe, se lee... y no se responde.
  const alta = ficha.declarar(vacio, declaracion());
  assert.strictEqual(alta.ok, true, alta.motivo);
  assert.strictEqual(alta.modo, 'lectura', 'sin voz declarada la ficha nace en lectura');
  assert.strictEqual(alta.puede_operar, false);

  const enLectura = ficha.puede_operar(alta.ficha);
  assert.strictEqual(enLectura.ok, false);
  assert.strictEqual(enLectura.motivo, 'sin_voz');
  assert.strictEqual(enLectura.solo_lectura, true);

  const noAdmite = ficha.admite(alta.ficha, 'Volvemos al torno el lunes');
  assert.strictEqual(noAdmite.ok, false);
  assert.strictEqual(noAdmite.motivo, 'sin_voz');
  assert.strictEqual(noAdmite.solo_lectura, true);

  const sinVoz = ficha.voz(alta.estado, { proyecto: 'proy-a', cuenta: '@taller_a' });
  assert.strictEqual(sinVoz.ok, true);
  assert.strictEqual(sinVoz.voz, null);
  assert.strictEqual(sinVoz.modo, 'lectura');

  // La voz se declara (actualizar con autorizacion): la ficha pasa a operativa.
  const conVoz = ficha.actualizar(alta.estado, cambio());
  assert.strictEqual(conVoz.ok, true, conVoz.motivo);
  assert.strictEqual(conVoz.modo, 'operativa');
  assert.strictEqual(conVoz.puede_operar, true);
  assert.strictEqual(conVoz.ficha.historia.length, 1, 'el cambio deja historia');
  assert.strictEqual(conVoz.ficha.historia[0].tipo, 'voz_declarada');
  assert.deepStrictEqual(conVoz.ficha.sello, alta.ficha.sello, 'el sello de nacimiento no se toca');

  const si = ficha.admite(conVoz.ficha, 'Volvemos al torno el lunes.');
  assert.strictEqual(si.ok, true);
  assert.strictEqual(si.tono, VOZ.tono);
  assert.strictEqual(si.voz_aplicada, true);

  const nunca = ficha.admite(conVoz.ficha, 'Te doy garantia de por vida.');
  assert.strictEqual(nunca.ok, false);
  assert.strictEqual(nunca.motivo, 'dice_lo_que_nunca_dice');
  assert.strictEqual(nunca.frase, 'garantia de por vida');

  const tema = ficha.admite(conVoz.ficha, 'Hablemos de politica un rato.');
  assert.strictEqual(tema.ok, false);
  assert.strictEqual(tema.motivo, 'tema_fuera_de_limite');
  assert.strictEqual(tema.tema, 'politica');

  // La voz NO se inventa: sin declarante del proyecto o sin autorizacion, no.
  const sinDeclarante = ficha.declarar(ficha.estado_vacio(), declaracion({
    cuenta: '@taller_b',
    voz: { tono: 'cercano', lo_que_nunca_dice: [], declarada_por: 'agente', autorizacion_id: 'aut-x' }
  }));
  assert.strictEqual(sinDeclarante.ok, false);
  assert.strictEqual(sinDeclarante.motivo, 'voz_invalida');
  assert.ok(sinDeclarante.invalidos.includes('declarada_por'), 'dice que el declarante no vale');

  const sinAutorizacion = ficha.declarar(ficha.estado_vacio(), declaracion({
    cuenta: '@taller_b',
    voz: { tono: 'cercano', declarada_por: 'proyecto' }
  }));
  assert.strictEqual(sinAutorizacion.ok, false);
  assert.strictEqual(sinAutorizacion.motivo, 'voz_invalida');
  assert.ok(sinAutorizacion.faltan.includes('autorizacion_id'));

  const sinTono = ficha.declarar(ficha.estado_vacio(), declaracion({
    cuenta: '@taller_b',
    voz: { declarada_por: 'proyecto', autorizacion_id: 'aut-x' }
  }));
  assert.strictEqual(sinTono.ok, false);
  assert.ok(sinTono.faltan.includes('tono'));

  // La ficha es por proyecto: la misma cuenta en otro proyecto no se ve.
  const desdeB = ficha.leer(conVoz.estado, { proyecto: 'proy-b', cuenta: '@taller_a' });
  assert.strictEqual(desdeB.ok, true);
  assert.strictEqual(desdeB.hallada, false);
  assert.strictEqual(desdeB.ficha, null, 'no se devuelve la ficha de otro proyecto');
  assert.strictEqual(desdeB.motivo, 'ficha_de_otro_proyecto');

  const sinProyecto = ficha.leer(conVoz.estado, { cuenta: '@taller_a' });
  assert.strictEqual(sinProyecto.ok, false);
  assert.strictEqual(sinProyecto.motivo, 'ambito_incompleto', 'sin proyecto no se lee una ficha');

  const admisionAjena = ficha.admitir(conVoz.estado, { proyecto: 'proy-b', cuenta: '@taller_a', texto: 'hola' });
  assert.strictEqual(admisionAjena.ok, false);
  assert.strictEqual(admisionAjena.motivo, 'sin_ficha');
});

// ---------------------------------------------------------------------------
// 2 · una cuenta sin proyecto dueno es un fallo de alta
// ---------------------------------------------------------------------------

test('cuenta_sin_proyecto_dueno_es_fallo_de_alta', () => {
  const vacio = ficha.estado_vacio();

  for (const proyecto of [undefined, null, '', '   ']) {
    const r = ficha.declarar(vacio, declaracion({ proyecto }));
    assert.strictEqual(r.ok, false, `proyecto ${JSON.stringify(proyecto)} no puede tener ficha`);
    assert.strictEqual(r.motivo, 'cuenta_sin_proyecto_dueno');
    assert.ok(r.faltan.includes('proyecto'));
    assert.strictEqual(r.estado, undefined, 'un rechazo no devuelve estado nuevo');
  }

  // El puente no es dueno de ninguna cuenta: tampoco hay ficha a su nombre.
  for (const proyecto of ['instagram-bridge', 'puente', 'sistema', 'enki']) {
    const r = ficha.declarar(vacio, declaracion({ proyecto }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'cuenta_sin_proyecto_dueno');
    assert.ok(r.invalidos.includes('proyecto'));
  }

  // Y el almacen no se ha movido.
  assert.strictEqual(vacio.fichas.length, 0);
  assert.strictEqual(vacio.revision, 0);
});

// ---------------------------------------------------------------------------
// 3 · el custodio: single-writer, atomico y auditado
// ---------------------------------------------------------------------------

test('el_custodio_escribe_single_writer_y_audita_antes_de_guardar', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fichas-'));
  try {
    const custodio = ficha.crear({ directorio: dir });

    // Tres altas simultaneas no se pisan: las tres llegan al fichero.
    const rs = await Promise.all([
      custodio.declarar(declaracion({ cuenta: '@taller_a' })),
      custodio.declarar(declaracion({ cuenta: '@taller_b' })),
      custodio.declarar(declaracion({ cuenta: '@taller_c' }))
    ]);
    for (const r of rs) assert.strictEqual(r.ok, true, r.motivo);

    const guardado = JSON.parse(await fsp.readFile(path.join(dir, 'fichas.json'), 'utf8'));
    assert.strictEqual(guardado.fichas.length, 3, 'ninguna alta se perdio');
    assert.strictEqual(guardado.revision, 3);
    assert.strictEqual(ficha.auditar(guardado).ok, true, 'el fichero pasa la auditoria');

    const restos = (await fsp.readdir(dir)).filter((n) => n.endsWith('.tmp'));
    assert.deepStrictEqual(restos, [], 'no quedan temporales de la escritura atomica');

    // Otra instancia lee lo mismo: la verdad esta en el fichero, no en memoria.
    const otra = ficha.crear({ directorio: dir });
    const carga = await otra.cargar();
    assert.strictEqual(carga.ok, true);
    assert.strictEqual(otra.foto().fichas.length, 3);

    const leida = await otra.leer({ proyecto: 'proy-a', cuenta: '@taller_b' });
    assert.strictEqual(leida.ok, true);
    assert.strictEqual(leida.hallada, true);
    assert.strictEqual(leida.modo, 'lectura');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('un_almacen_ilegible_no_se_sobrescribe', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fichas-roto-'));
  try {
    const ruta = path.join(dir, 'fichas.json');
    const basura = '{ esto no es un almacen de fichas';
    await fsp.writeFile(ruta, basura, 'utf8');

    const custodio = ficha.crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, false);

    const alta = await custodio.declarar(declaracion());
    assert.strictEqual(alta.ok, false);
    assert.strictEqual(alta.motivo, 'sin_fichas');

    const lectura = await custodio.leer({ proyecto: 'proy-a', cuenta: '@taller_a' });
    assert.strictEqual(lectura.ok, false);
    assert.strictEqual(lectura.motivo, 'sin_fichas');

    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), basura, 'el almacen roto no se machaca');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4 · la auditoria del almacen: sello, secretos, ambito y voz
// ---------------------------------------------------------------------------

test('la_auditoria_nombra_sello_secreto_ambito_y_voz', () => {
  const { crear_sello } = require('../core/formas');
  const sello = crear_sello({
    proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'movil-1', momento: M1, quien: 'dueno'
  }).sello;

  const buena = {
    almacen: 'fichas',
    ficha_id: 'proy-a:instagram:taller_a',
    proyecto: 'proy-a',
    plataforma: 'instagram',
    cuenta: 'taller_a',
    identidad_visible: { nombre: 'Taller A', presentacion: null },
    voz: null,
    limites: { no_publica: [], no_contesta: [] },
    sello,
    historia: []
  };

  const limpio = ficha.auditar({ esquema: ficha.ESQUEMA, almacen: 'fichas', revision: 1, actualizado: M1, fichas: [buena] });
  assert.strictEqual(limpio.ok, true, JSON.stringify(limpio.problemas));

  // Sin sello no hay ficha que valga (P1).
  const sinSello = JSON.parse(JSON.stringify(buena));
  delete sinSello.sello;
  const a1 = ficha.auditar({ esquema: ficha.ESQUEMA, almacen: 'fichas', revision: 1, actualizado: M1, fichas: [sinSello] });
  assert.strictEqual(a1.ok, false);
  assert.ok(a1.problemas.some((p) => p.motivo === 'sin_sello'));

  // Una ficha que dice proyecto A con sello de B es una fuga de ambito (P3).
  const ajena = Object.assign({}, buena, { proyecto: 'proy-b' });
  const a2 = ficha.auditar({ esquema: ficha.ESQUEMA, almacen: 'fichas', revision: 1, actualizado: M1, fichas: [ajena] });
  assert.ok(a2.problemas.some((p) => p.motivo === 'ficha_de_otro_proyecto'));

  // Voz que no declaro el proyecto: no es voz.
  const vozAjena = Object.assign({}, buena, {
    voz: { tono: 'x', vocabulario: [], lo_que_nunca_dice: [], limites_de_tema: [], declarada_por: 'agente', autorizacion_id: 'a' }
  });
  const a3 = ficha.auditar({ esquema: ficha.ESQUEMA, almacen: 'fichas', revision: 1, actualizado: M1, fichas: [vozAjena] });
  assert.ok(a3.problemas.some((p) => p.motivo === 'voz_no_declarada_por_el_proyecto'));

  // Dos fichas de la misma cuenta y proyecto: una sola verdad.
  const a4 = ficha.auditar({ esquema: ficha.ESQUEMA, almacen: 'fichas', revision: 2, actualizado: M1, fichas: [buena, buena] });
  assert.ok(a4.problemas.some((p) => p.motivo === 'ficha_duplicada'));

  // Un secreto no entra en el almacen (V1).
  const conSecreto = JSON.parse(JSON.stringify(buena));
  conSecreto.identidad_visible.api_key = 'sk-live-abcdef0123456789';
  const a5 = ficha.auditar({ esquema: ficha.ESQUEMA, almacen: 'fichas', revision: 1, actualizado: M1, fichas: [conSecreto] });
  assert.strictEqual(a5.ok, false);
  assert.ok(a5.problemas.some((p) => p.motivo === 'secreto'), JSON.stringify(a5.problemas));
});

test('por_el_bus_un_rechazo_sale_por_failed_y_la_response_no_lleva_el_almacen', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fichas-bus-'));
  try {
    const modulo = cuentas.crear({ directorio: dir });
    const publicados = [];
    modulo.fichas.eventBus = { publish: (topic, payload) => publicados.push({ topic, payload }) };

    // Sin proyecto dueno: par de fallo, y por `.failed` (no una response con ok:false).
    const rechazo = await modulo.onFichaDeclararRequest({ data: { request_id: 'r1', cuenta: '@taller_a' } });
    assert.strictEqual(rechazo.ok, false);
    assert.strictEqual(rechazo.motivo, 'cuenta_sin_proyecto_dueno');
    assert.strictEqual(publicados.length, 1);
    assert.strictEqual(publicados[0].topic, 'instagram.ficha.declarar.failed');
    assert.strictEqual(publicados[0].payload.request_id, 'r1');

    // Alta buena: response correlada y sin el almacen entero dentro.
    const alta = await modulo.onFichaDeclararRequest({ data: Object.assign(declaracion(), { request_id: 'r2' }) });
    assert.strictEqual(alta.ok, true, alta.motivo);
    assert.strictEqual(alta.request_id, 'r2');
    assert.strictEqual(alta.estado, undefined, 'la response no publica el almacen entero');
    assert.strictEqual(alta.ficha.cuenta, 'taller_a');
    assert.strictEqual(publicados[1].topic, 'instagram.ficha.declarar.response');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('el_modulo_cuentas_hospeda_la_ficha_sin_crear_otro_modulo', () => {
  const modulo = cuentas.crear({ directorio: path.join(os.tmpdir(), 'fichas-no-usado') });
  assert.strictEqual(typeof modulo.fichas.declarar, 'function', 'el borde del padron hospeda el custodio de la ficha');
  assert.strictEqual(typeof modulo.fichas.actualizar, 'function');
  assert.strictEqual(typeof modulo.onFichaDeclararRequest, 'function', 'los topics de la ficha llegan al mismo modulo');
  assert.strictEqual(typeof modulo.onFichaLeerRequest, 'function');
  assert.strictEqual(cuentas.ficha.ESQUEMA, 'fichas-de-cuenta-v1');
  assert.strictEqual(cuentas.ficha.ALMACEN, 'fichas');
});

test('el_fichero_del_repo_es_un_almacen_valido_y_vacio', async () => {
  const ruta = path.resolve(__dirname, '../../../storage/instagram-bridge/fichas.json');
  const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));
  assert.strictEqual(datos.esquema, 'fichas-de-cuenta-v1');
  assert.deepStrictEqual(datos.fichas, [], 'el almacen del repo nace vacio y sin voces inventadas');
  assert.strictEqual(ficha.auditar(datos).ok, true);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__ficha] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__ficha] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
