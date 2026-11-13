'use strict';

/**
 * instagram-bridge · T1 · FronteraSinContenido (REFLEJO)
 *
 * El puente no aporta contenido propio. Esta suite fija:
 *   - una pieza sin origen de proyecto, o con origen del puente, NO se publica;
 *   - el origen tiene que cuadrar con el sello (P1);
 *   - EL TEXTO DE RELLENO TAMBIEN ES CONTENIDO PROPIO: ni declarado como del
 *     puente ni escondido en una frase de transicion;
 *   - `auditar` devuelve la lista de originadas, no una recomendacion.
 *
 * Ejecutar: node modules/instagram-bridge/tests/frontera-contenido.test.js
 */

const assert = require('assert');

const t1 = require('../core/frontera-contenido');
const { crear_sello } = require('../core/formas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';

function sello(proyecto = 'proy-a') {
  return crear_sello({
    proyecto,
    cuenta: 'taller_a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno'
  }).sello;
}

function pieza(opts = {}) {
  return Object.assign({
    id: 'pieza-1',
    origen: 'proy-a',
    autor: 'dueno',
    texto: 'Volvemos al torno el lunes',
    sello: sello()
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · la regla fina del bloque: el relleno tambien es contenido propio
// ---------------------------------------------------------------------------

test('texto_de_relleno_tambien_es_contenido_propio', () => {
  // --- una pieza que entro del proyecto y trae su texto: recibida ----------
  const buena = t1.comprobar(pieza());
  assert.strictEqual(buena.ok, true, buena.motivo);
  assert.strictEqual(buena.estado, 'recibida');
  assert.strictEqual(buena.proyecto, 'proy-a');

  // --- relleno escondido: la procedencia dice "proyecto", la frase delata ---
  for (const relleno of ['Mira mi perfil', 'Mira mi perfil.', 'No te lo pierdas!', 'link en bio']) {
    const r = t1.comprobar(pieza({ id: `p-${relleno}`, texto: relleno }));
    assert.strictEqual(r.ok, false, `"${relleno}" no puede salir`);
    assert.strictEqual(r.estado, 'originada');
    assert.strictEqual(r.motivo, 'texto_de_relleno', `"${relleno}" es relleno`);
    assert.strictEqual(r.campo, 'texto');
  }

  // ... tambien en el pie de foto, no solo en el texto.
  const enPie = t1.comprobar(pieza({ id: 'p-pie', texto: 'Volvemos el lunes', caption: 'Sigueme para mas' }));
  assert.strictEqual(enPie.ok, false);
  assert.strictEqual(enPie.motivo, 'texto_de_relleno');
  assert.strictEqual(enPie.campo, 'caption');

  // --- relleno declarado: el puente dice que el texto lo puso el ----------
  const declaradoPuente = t1.comprobar(pieza({ id: 'p-proc-puente', procedencia: { texto: 'puente' } }));
  assert.strictEqual(declaradoPuente.ok, false);
  assert.strictEqual(declaradoPuente.motivo, 'texto_originado_por_el_puente');

  const declaradoRelleno = t1.comprobar(pieza({ id: 'p-proc-relleno', procedencia: { texto: 'relleno' } }));
  assert.strictEqual(declaradoRelleno.ok, false);
  assert.strictEqual(declaradoRelleno.motivo, 'texto_de_relleno');

  const atajoRelleno = t1.comprobar(pieza({ id: 'p-atajo', relleno: true }));
  assert.strictEqual(atajoRelleno.ok, false);
  assert.strictEqual(atajoRelleno.motivo, 'texto_de_relleno');

  // Una procedencia que no se entiende no se interpreta a favor de publicar.
  const desconocida = t1.comprobar(pieza({ id: 'p-desc', procedencia: { texto: 'lo que salga' } }));
  assert.strictEqual(desconocida.ok, false);
  assert.strictEqual(desconocida.motivo, 'procedencia_desconocida');

  // --- la pieza entera originada por el puente ----------------------------
  const origenPuente = t1.comprobar(pieza({ id: 'p-origen', origen: 'instagram-bridge' }));
  assert.strictEqual(origenPuente.ok, false);
  assert.strictEqual(origenPuente.motivo, 'origen_es_el_puente');

  const sinOrigen = t1.comprobar(pieza({ id: 'p-sin-origen', origen: undefined }));
  assert.strictEqual(sinOrigen.ok, false);
  assert.strictEqual(sinOrigen.motivo, 'sin_origen', 'sin origen se falla cerrado');

  const autorPuente = t1.comprobar(pieza({ id: 'p-autor', autor: 'sistema' }));
  assert.strictEqual(autorPuente.ok, false);
  assert.strictEqual(autorPuente.motivo, 'autor_es_el_puente');

  const sinAutor = t1.comprobar(pieza({ id: 'p-sin-autor', autor: undefined }));
  assert.strictEqual(sinAutor.ok, false);
  assert.strictEqual(sinAutor.motivo, 'sin_autor');

  // --- el origen tiene que cuadrar con el sello ---------------------------
  const selloAjeno = t1.comprobar(pieza({ id: 'p-ajena', origen: 'proy-a', sello: sello('proy-b') }));
  assert.strictEqual(selloAjeno.ok, false);
  assert.strictEqual(selloAjeno.motivo, 'origen_no_coincide_con_el_sello');

  const sinSello = pieza({ id: 'p-sin-sello' });
  delete sinSello.sello;
  const rSinSello = t1.comprobar(sinSello);
  assert.strictEqual(rSinSello.ok, false);
  assert.strictEqual(rSinSello.motivo, 'sin_sello');

  // --- el rechazo dice que haria falta, no propone "arreglarlo" -----------
  const rechazo = t1.rechazar_si_originada(pieza({ id: 'p-rechazo', texto: 'Mira mi perfil' }));
  assert.strictEqual(rechazo.ok, false);
  assert.strictEqual(rechazo.motivo, 'texto_de_relleno');
  assert.strictEqual(rechazo.rechazo.motivo, 'texto_de_relleno');
  assert.ok(rechazo.rechazo.que_haria_falta.includes('entre desde el proyecto'));

  const pasa = t1.rechazar_si_originada(pieza());
  assert.strictEqual(pasa.ok, true);
  assert.strictEqual(pasa.proyecto, 'proy-a');

  // --- auditoria del dia --------------------------------------------------
  const dia = t1.auditar([
    pieza({ id: 'p-ok' }),
    pieza({ id: 'p-ok-2', texto: 'Otra pieza del proyecto' }),
    pieza({ id: 'p-mal', texto: 'No te lo pierdas' })
  ]);
  assert.strictEqual(dia.ok, false);
  assert.strictEqual(dia.total, 3);
  assert.strictEqual(dia.recibidas, 2);
  assert.strictEqual(dia.originadas.length, 1);
  assert.strictEqual(dia.originadas[0].indice, 2);
  assert.strictEqual(dia.originadas[0].campo, 'texto');

  const limpio = t1.auditar([pieza()]);
  assert.strictEqual(limpio.ok, true);
  assert.deepStrictEqual(limpio.originadas, []);

  // La tabla de relleno es cerrada: no marca contenido real que la mencione.
  assert.strictEqual(t1.es_texto_de_relleno('Te cuento por que no pongo el link en bio'), false);
  assert.strictEqual(t1.es_texto_de_relleno('Mira mi perfil'), true);
});

test('un_adjunto_originado_por_el_puente_no_pasa', () => {
  const r = t1.comprobar(pieza({ id: 'p-adj', adjuntos: [{ tipo: 'imagen', origen: 'proy-a' }, { tipo: 'imagen', origen: 'puente' }] }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'adjunto_originado_por_el_puente');
  assert.strictEqual(r.indice, 1);

  const bueno = t1.comprobar(pieza({ id: 'p-adj-ok', adjuntos: [{ tipo: 'imagen', origen: 'proy-a' }] }));
  assert.strictEqual(bueno.ok, true);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__frontera-contenido] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__frontera-contenido] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
