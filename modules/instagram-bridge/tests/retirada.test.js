'use strict';

/**
 * instagram-bridge · L3 · RetiradaDePublicacion (PUENTE)
 *
 * Retirar lo publicado. Esta suite fija la regla dura del bloque:
 *
 *   **retirar pasa por PERMISO aunque el nivel declarado sea «ejecutar».**
 *
 * Y lo fija de la unica forma que sirve: ensenando que Q6, con esa misma cuenta
 * y ese mismo nivel SIN techo, dice `ejecutar` (o sea: por el nivel solo, la
 * retirada pasaria); y que a traves de L3 no pasa, porque L3 le pone techo
 * `permiso` antes de preguntar. Tambien:
 *   - sin dictamen `ejecutar` la mano NO se toca;
 *   - el respaldo de lo que habia se guarda ANTES de la mano;
 *   - si el respaldo falla, no se retira;
 *   - si la mano falla, se va a revision y NO se reintenta;
 *   - "ya no esta" lo dice el verificador, no la mano.
 *
 * Ejecutar: node modules/instagram-bridge/tests/retirada.test.js
 */

const assert = require('assert');

const l3 = require('../operacion/retirada');
const politica = require('../autonomia/politica');
const casillas = require('../core/casillas');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MOMENTO = '2026-11-11T12:00:00Z';
const CUENTA = 'taller_a';
const PROYECTO = 'proy-a';

function sello(proyecto = PROYECTO, cuenta = CUENTA) {
  return { proyecto, cuenta, plataforma: 'instagram' };
}

function pieza(opts = {}) {
  return Object.assign({
    referencia: 'post-1',
    sello: sello(),
    texto: 'Abrimos el sabado',
    publicado_en: '2026-11-10T09:00:00Z'
  }, opts);
}

/** Autorizacion REAL de Q5, con su huella: la que una persona concedio. */
function autorizacion(opts = {}) {
  const c = casillas.casilla_de('borrar');
  return Object.assign({
    autorizacion_id: 'aut-1',
    procedencia: 'registro_autorizaciones',
    via: 'puerta',
    quien: 'dueno',
    accion: 'borrar',
    cuenta: CUENTA,
    proyecto: PROYECTO,
    rol: 'dueno',
    casilla: { reversibilidad: c.reversibilidad, visibilidad: c.visibilidad },
    huella: casillas.huella({ proyecto: PROYECTO, cuenta: CUENTA, accion: 'borrar', rol: 'dueno' }),
    consumida: false,
    consumida_en: null,
    caduca_en: '2026-11-11T23:00:00Z',
    nivel_al_conceder: 'permiso'
  }, opts);
}

/** Puertos de mentira que APUNTAN lo que se les pide, en orden. */
function puertos(opts = {}) {
  const orden = [];
  const o = opts;
  return {
    orden,
    permiso: {
      decidir: (peticion) => {
        orden.push({ puerto: 'permiso', peticion });
        return politica.decidir(peticion);
      }
    },
    respaldo: {
      conservar: async (snapshot) => {
        orden.push({ puerto: 'respaldo', referencia: snapshot.referencia, texto: snapshot.texto });
        if (o.respaldo_falla) return { ok: false, motivo: 'disco_lleno' };
        return { ok: true, respaldo_id: 'resp-1' };
      }
    },
    mano: {
      ejecutar: async (accion) => {
        orden.push({ puerto: 'mano', accion: accion.accion, operacion: accion.operacion, referencia: accion.referencia });
        if (o.mano_falla) return { ok: false, motivo: 'ancla_no_encontrada' };
        return { ok: true, senal: 'pulsado' };
      }
    },
    verificador: {
      comprobar: async (post) => {
        orden.push({ puerto: 'verificador', postcondicion: post.postcondicion });
        if (o.no_se_observa) return { ok: true, observado: false, motivo: 'sigue_visible' };
        return { ok: true, observado: true };
      }
    },
    evidencia: {
      guardar: async (entrada) => {
        orden.push({ puerto: 'evidencia', request_id: entrada.request_id, veredicto: entrada.veredicto });
        return { ok: true, ruta: `/tmp/${entrada.request_id}.json` };
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA DEL BLOQUE
// ---------------------------------------------------------------------------

test('retirar_pasa_por_permiso_aunque_el_nivel_sea_ejecutar', async () => {
  // --- 1 · con esa cuenta y ese nivel, Q6 SIN TECHO dice "ejecutar" --------
  // (declaracion del dueno, su cuenta, su proyecto: nivel real, no un typo)
  const declaracion = { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA, proyecto: PROYECTO };
  const sinTecho = politica.decidir({
    proyecto: PROYECTO,
    cuenta: CUENTA,
    rol: 'dueno',
    accion: 'borrar',
    nivel: declaracion,
    momento: MOMENTO
  });
  assert.strictEqual(sinTecho.ok, true);
  assert.strictEqual(sinTecho.dictamen, 'ejecutar', 'sin techo, el nivel ejecutar autoriza');
  assert.strictEqual(sinTecho.nivel, 'ejecutar');

  // --- 2 · por L3, con el MISMO nivel y sin autorizacion: NO se retira -----
  const p = puertos();
  const retirada = new l3.RetiradaDePublicacion(p);

  const r = await retirada.retirar({
    pieza: pieza(),
    nivel: declaracion,
    rol: 'dueno',
    momento: MOMENTO
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.veredicto, 'no_retirada');
  assert.strictEqual(r.motivo, 'retirada_exige_permiso', `motivo inesperado: ${r.motivo}`);
  assert.strictEqual(r.falta, 'autorizacion');
  assert.strictEqual(r.dictamen, 'permiso');

  // El techo se ve, y se ve que rebajo: nivel declarado vs nivel efectivo.
  assert.strictEqual(r.techo.nivel_declarado, 'ejecutar');
  assert.strictEqual(r.techo.nivel_efectivo, 'permiso');
  assert.strictEqual(r.techo.rebajado, true);

  // Lo que Q6 recibio de L3 lleva el techo puesto.
  const consulta = p.orden.find((x) => x.puerto === 'permiso');
  assert.ok(consulta, 'Q6 fue consultado');
  assert.strictEqual(consulta.peticion.nivel.nivel, 'permiso', 'el nivel que ve Q6 es el rebajado');
  assert.strictEqual(consulta.peticion.accion, 'borrar', 'retirar cae en la casilla de borrar');

  // Y NO se toco nada: ni mano, ni respaldo, ni verificador, ni evidencia.
  assert.strictEqual(p.orden.some((x) => x.puerto === 'mano'), false, 'la mano no se toco');
  assert.strictEqual(p.orden.some((x) => x.puerto === 'respaldo'), false);
  assert.strictEqual(p.orden.some((x) => x.puerto === 'evidencia'), false);

  // --- 3 · el nivel es un TECHO, no una puerta: tambien con 'permiso' -----
  const p2 = puertos();
  const r2 = await new l3.RetiradaDePublicacion(p2).retirar({
    pieza: pieza(), nivel: { nivel: 'permiso', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO
  });
  assert.strictEqual(r2.motivo, 'retirada_exige_permiso');

  // --- 4 · sin nivel declarado, el conservador manda ----------------------
  const p3 = puertos();
  const r3 = await new l3.RetiradaDePublicacion(p3).retirar({ pieza: pieza(), momento: MOMENTO });
  assert.strictEqual(r3.ok, false);
  assert.strictEqual(r3.motivo, 'nivel_conservador_no_retira');
  assert.strictEqual(p3.orden.some((x) => x.puerto === 'mano'), false);

  // --- 5 · con una autorizacion REAL de una persona, si se retira ---------
  const p4 = puertos();
  const r4 = await new l3.RetiradaDePublicacion(p4).retirar({
    pieza: pieza(),
    nivel: declaracion,
    rol: 'dueno',
    momento: MOMENTO,
    autorizacion: autorizacion()
  });
  assert.strictEqual(r4.ok, true, r4.motivo);
  assert.strictEqual(r4.veredicto, 'retirada');
  assert.strictEqual(r4.autorizacion_id, 'aut-1');
  assert.strictEqual(r4.techo.nivel_efectivo, 'permiso', 'el techo sigue puesto aunque haya autorizacion');
  assert.strictEqual(p4.orden.some((x) => x.puerto === 'mano'), true);

  // --- 6 · una autorizacion de OTRA accion no vale -----------------------
  const p5 = puertos();
  const r5 = await new l3.RetiradaDePublicacion(p5).retirar({
    pieza: pieza(),
    nivel: declaracion,
    rol: 'dueno',
    momento: MOMENTO,
    autorizacion: autorizacion({ accion: 'publicar', huella: casillas.huella({ proyecto: PROYECTO, cuenta: CUENTA, accion: 'publicar', rol: 'dueno' }) })
  });
  assert.strictEqual(r5.ok, false);
  assert.strictEqual(r5.veredicto, 'no_retirada');
  assert.strictEqual(r5.motivo, 'permiso_denegado');
  assert.strictEqual(r5.motivo_de_q6, 'permiso_de_otra_accion');
  assert.strictEqual(p5.orden.some((x) => x.puerto === 'mano'), false);
});

// ---------------------------------------------------------------------------
// 2 · el orden de los pasos y el respaldo previo
// ---------------------------------------------------------------------------

test('el_respaldo_va_antes_de_la_mano_y_sin_respaldo_no_se_retira', async () => {
  // --- el orden: permiso -> respaldo -> mano -> verificacion -> evidencia --
  const p = puertos();
  const r = await new l3.RetiradaDePublicacion(p).retirar({
    pieza: pieza(), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(r.ok, true, r.motivo);
  assert.deepStrictEqual(p.orden.map((x) => x.puerto), ['permiso', 'respaldo', 'mano', 'verificador', 'evidencia']);

  // El respaldo lleva lo que habia: el texto de la pieza, no una promesa.
  const respaldo = p.orden.find((x) => x.puerto === 'respaldo');
  assert.strictEqual(respaldo.referencia, 'post-1');
  assert.strictEqual(respaldo.texto, 'Abrimos el sabado');

  // La evidencia se ancla al respaldo: se puede volver a mirar lo que habia.
  assert.strictEqual(r.respaldo_id, 'resp-1');
  assert.strictEqual(r.evidencia.guardada, true);

  // --- si el respaldo falla, NO se retira: la mano no llega a tocarse -----
  const p2 = puertos({ respaldo_falla: true });
  const r2 = await new l3.RetiradaDePublicacion(p2).retirar({
    pieza: pieza(), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.veredicto, 'no_retirada');
  assert.strictEqual(r2.motivo, 'sin_respaldo_previo');
  assert.strictEqual(p2.orden.some((x) => x.puerto === 'mano'), false, 'sin prueba de lo que habia no se toca la mano');
});

// ---------------------------------------------------------------------------
// 3 · el fallo no se reintenta y el exito se verifica
// ---------------------------------------------------------------------------

test('si_la_mano_falla_va_a_revision_y_no_se_reintenta', async () => {
  const p = puertos({ mano_falla: true });
  const r = await new l3.RetiradaDePublicacion(p).retirar({
    pieza: pieza(), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.veredicto, 'revision');
  assert.strictEqual(r.motivo, 'paso_fallido');
  assert.strictEqual(r.reintentable, false, 'A5: no se reintenta un paso que cambio el mundo');
  assert.strictEqual(r.paso_a_revision, true);
  assert.strictEqual(r.consecuencia, 'incierta');

  // Una sola llamada a la mano: no hay reintento escondido.
  assert.strictEqual(p.orden.filter((x) => x.puerto === 'mano').length, 1);
  // Y no se afirma lo que no se observo.
  assert.strictEqual(p.orden.some((x) => x.puerto === 'verificador'), false);

  // --- "ya no esta" lo dice el verificador, no la mano -------------------
  const p2 = puertos({ no_se_observa: true });
  const r2 = await new l3.RetiradaDePublicacion(p2).retirar({
    pieza: pieza(), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.veredicto, 'revision');
  assert.strictEqual(r2.motivo, 'no_se_observo_que_ya_no_esta');
  assert.strictEqual(r2.consecuencia, 'incierta');
  assert.strictEqual(p2.orden.some((x) => x.puerto === 'evidencia'), false, 'sin verificacion no se firma el exito');

  // --- sin verificador inyectado no se puede afirmar nada ----------------
  const p3 = puertos();
  delete p3.verificador;
  const r3 = await new l3.RetiradaDePublicacion(p3).retirar({
    pieza: pieza(), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(r3.veredicto, 'revision');
  assert.strictEqual(r3.motivo, 'sin_verificador');
  assert.deepStrictEqual(r3.que_haria_falta, ['verificador']);
});

// ---------------------------------------------------------------------------
// 4 · lo que la pieza exige antes de empezar
// ---------------------------------------------------------------------------

test('sin_sello_sin_referencia_o_sin_mano_no_hay_retirada', async () => {
  const p = puertos();

  // Sin sello de cuenta no se retira: no se sabe de quien es.
  const sinSello = await new l3.RetiradaDePublicacion(p).retirar({ pieza: { referencia: 'x' }, momento: MOMENTO });
  assert.strictEqual(sinSello.motivo, 'sin_sello_de_cuenta');
  assert.ok(sinSello.faltan.includes('sello.proyecto'));

  // Sin referencia no hay a que apuntar.
  const sinRef = await new l3.RetiradaDePublicacion(p).retirar({ pieza: { sello: sello() }, momento: MOMENTO });
  assert.strictEqual(sinRef.motivo, 'sin_referencia');

  // Sin momento no se puede fechar la evidencia.
  const sinMomento = await new l3.RetiradaDePublicacion(p).retirar({ pieza: pieza() });
  assert.strictEqual(sinMomento.motivo, 'sin_momento');

  // Sin mano no se finge: se nombra el puerto que falta.
  const sinMano = await l3.crear({ permiso: p.permiso, respaldo: p.respaldo, evidencia: p.evidencia }).retirar({
    pieza: pieza(), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(sinMano.ok, false);
  assert.strictEqual(sinMano.motivo, 'sin_puerto');
  assert.deepStrictEqual(sinMano.faltan, ['mano']);

  // Una pieza de otro proyecto no se retira desde este.
  const ajeno = await new l3.RetiradaDePublicacion(p).retirar({
    pieza: pieza({ proyecto: 'proy-b' }), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(ajeno.motivo, 'proyecto_ajeno');

  // Corregir sin cambio no es corregir.
  const sinCambio = await new l3.RetiradaDePublicacion(p).corregir({
    pieza: pieza(), nivel: { nivel: 'ejecutar', quien: 'dueno', cuenta: CUENTA }, rol: 'dueno', momento: MOMENTO, autorizacion: autorizacion()
  });
  assert.strictEqual(sinCambio.motivo, 'sin_cambio');

  // Y las tres operaciones caen en la misma casilla: si `corregir` tuviera otra,
  // seria la puerta de atras de `retirar`.
  assert.deepStrictEqual(l3.ACCION_DE_CASILLA, { retirar: 'borrar', corregir: 'borrar', borrar: 'borrar' });

  // El techo es una funcion consultable, y solo BAJA.
  assert.strictEqual(l3.nivel_con_techo('ejecutar').nivel, 'permiso');
  assert.strictEqual(l3.nivel_con_techo('permiso').nivel, 'permiso');
  assert.strictEqual(l3.nivel_con_techo('borrador').nivel, 'borrador');
  assert.strictEqual(l3.nivel_con_techo({ nivel: 'ejecutar', quien: 'dueno', vigente_hasta: '2026-12-01T00:00:00Z' }).nivel, 'permiso');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__retirada] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__retirada] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
