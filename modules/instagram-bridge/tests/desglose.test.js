'use strict';

/**
 * instagram-bridge · F4 · CoberturaOperativa (REFLEJO)
 *
 * Lo que esta suite fija:
 *   - **UNA RECETA VIGENTE QUE NO ENSAYA ES UNA CAPACIDAD CAIDA**, no "casi
 *     lista". Solo hay dos estados posibles y se comprueba que el tercero que todo
 *     el mundo quiere anadir no existe.
 *   - Un ensayo APTO de la firma vigente es lo unico que hace `operativa` una
 *     capacidad; un ensayo no apto la deja caida con su motivo.
 *   - Una receta reparada (firma distinta) necesita ensayo NUEVO: el ensayo de la
 *     receta anterior no cubre, aunque la version coincida.
 *   - Una capacidad esperada sin receta es caida (`sin_receta`), y una receta
 *     retirada por rotura tambien.
 *   - La cobertura cuenta operativas sobre el total, y el resumen dice la verdad.
 *
 * Ejecutar: node modules/instagram-bridge/tests/desglose.test.js
 */

const assert = require('assert');

const cobertura = require('../recetas/cobertura');
const catalogo = require('../recetas/catalogo');
const forma = require('../core/forma-receta');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T08:00:00Z';
const M3 = '2026-11-13T09:30:00Z';

function sello(extra) {
  return Object.assign({ proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'movil-1', momento: M1, quien: 'dueno' }, extra || {});
}

function receta(capacidad, extra) {
  return Object.assign({
    plataforma: 'instagram',
    capacidad: capacidad || 'publicar',
    precondicion: { descripcion: 'app abierta en inicio', ancla: { nombre_visible: 'Crear', tipo: 'boton' } },
    pasos: [
      {
        ancla_esperada: { nombre_visible: 'Crear', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'se abre el selector' },
        espera_maxima: 1500
      },
      {
        ancla_esperada: { nombre_visible: 'Compartir', tipo: 'boton' },
        accion: { tipo: 'tocar' },
        consecuencia_esperada: { descripcion: 'queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
        espera_maxima: 2500
      }
    ],
    postcondicion: { descripcion: 'la pieza queda publicada', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
    techo: 6000
  }, extra || {});
}

/** Catalogo con la version 1 de `publicar` vigente. */
function catalogo_con_vigente() {
  let estado = catalogo.estado_vacio();
  const p = catalogo.proponer(estado, { receta: receta(), sello: sello(), origen: 'demostracion' });
  assert.strictEqual(p.ok, true, p.motivo);
  const pub = catalogo.publicar(p.estado, {
    capacidad: 'publicar', version: 1, autorizacion_id: 'aut-v1', momento: M2, quien: 'dueno'
  });
  assert.strictEqual(pub.ok, true, pub.motivo);
  return pub;
}

/** Un ensayo que cubre EXACTAMENTE la receta dada (misma firma). */
function ensayo_de(receta_vigente, extra) {
  return Object.assign({
    clave: 'instagram:publicar',
    plataforma: 'instagram',
    capacidad: 'publicar',
    version: receta_vigente.version,
    firma: forma.firma(receta_vigente.receta),
    apto: true,
    momento: M3,
    faltas: []
  }, extra || {});
}

// ---------------------------------------------------------------------------
// 1 · EL TEST DEL BLOQUE
// ---------------------------------------------------------------------------

test('receta_vigente_que_no_ensaya_es_capacidad_caida', () => {
  const publicada = catalogo_con_vigente();
  const m = cobertura.medir(publicada.estado, []);

  assert.strictEqual(m.ok, true, m.motivo);
  assert.strictEqual(m.total, 1);

  const capacidad = m.capacidades[0];
  assert.strictEqual(capacidad.clave, 'instagram:publicar');
  assert.strictEqual(capacidad.estado, 'caida', 'vigente sin ensayo es CAIDA, no "casi lista"');
  assert.strictEqual(capacidad.operativa, false);
  assert.strictEqual(capacidad.motivo, 'sin_ensayo');
  assert.strictEqual(capacidad.version, 1);
  assert.strictEqual(capacidad.ensayo, null);

  // Los numeros: 0 operativas de 1, y el resumen lo dice sin adornos.
  assert.strictEqual(m.operativas, 0);
  assert.strictEqual(m.caidas, 1);
  assert.strictEqual(m.cobertura_pct, 0);
  assert.strictEqual(m.caidas_detalle.length, 1);
  assert.strictEqual(m.caidas_detalle[0].motivo, 'sin_ensayo');
  assert.ok(m.resumen.includes('CAIDAS'), m.resumen);
  assert.ok(m.resumen.includes('publicar (sin_ensayo)'), m.resumen);
  assert.ok(m.resumen.includes('casi lista'), m.resumen);

  // Y no hay un tercer estado disfrazado: solo dos.
  assert.deepStrictEqual(cobertura.ESTADOS, ['operativa', 'caida']);
  assert.strictEqual(m.capacidades.some((c) => c.estado === 'casi_lista'), false);
  assert.strictEqual(m.capacidades.some((c) => c.estado === 'pendiente'), false);
});

// ---------------------------------------------------------------------------
// 2 · el ensayo es lo que la hace operativa
// ---------------------------------------------------------------------------

test('un_ensayo_apto_de_la_firma_vigente_la_deja_operativa', () => {
  const publicada = catalogo_con_vigente();
  const m = cobertura.medir(publicada.estado, [ensayo_de(publicada.receta)]);

  assert.strictEqual(m.operativas, 1);
  assert.strictEqual(m.caidas, 0);
  assert.strictEqual(m.cobertura_pct, 100);
  assert.strictEqual(m.capacidades[0].estado, 'operativa');
  assert.strictEqual(m.capacidades[0].motivo, 'operativa');
  assert.strictEqual(m.capacidades[0].ensayo.momento, M3);
  assert.ok(m.resumen.includes('1 de 1'));
});

test('un_ensayo_no_apto_es_capacidad_caida', () => {
  const publicada = catalogo_con_vigente();
  const m = cobertura.medir(publicada.estado, [ensayo_de(publicada.receta, {
    apto: false,
    faltas: [
      { paso: 2, ancla: { nombre_visible: 'Compartir', tipo: 'boton' }, motivo: 'ancla_ausente' }
    ]
  })]);

  assert.strictEqual(m.capacidades[0].estado, 'caida');
  assert.strictEqual(m.capacidades[0].motivo, 'ensayo_no_apto');
  assert.strictEqual(m.capacidades[0].ensayo.apto, false);
  assert.strictEqual(m.capacidades[0].ensayo.faltas, 1);
  assert.ok(m.capacidades[0].resumen.includes('NO fue apto'));
  assert.strictEqual(m.cobertura_pct, 0);
});

test('una_receta_reparada_necesita_un_ensayo_nuevo', () => {
  const publicada = catalogo_con_vigente();
  const ensayoSobreLaVieja = ensayo_de(publicada.receta);

  // La receta se repara (cambia una ancla) sin subir de version: la version
  // coincide, la FIRMA no. Un ensayo de la receta anterior no cubre la nueva.
  const reparada = receta('publicar', {
    pasos: [
      receta().pasos[0],
      Object.assign({}, receta().pasos[1], {
        ancla_esperada: { nombre_visible: 'Publicar ahora', tipo: 'boton' }
      })
    ]
  });
  let estado = catalogo.estado_vacio();
  const p = catalogo.proponer(estado, { receta: reparada, sello: sello(), origen: 'reparacion' });
  assert.strictEqual(p.ok, true, p.motivo);
  const pub = catalogo.publicar(p.estado, {
    capacidad: 'publicar', version: 1, autorizacion_id: 'aut-rep', momento: M3, quien: 'dueno'
  });
  assert.strictEqual(pub.ok, true, pub.motivo);

  const m = cobertura.medir(pub.estado, [ensayoSobreLaVieja]);
  assert.strictEqual(m.capacidades[0].motivo, 'receta_cambiada_sin_ensayo');
  assert.strictEqual(m.capacidades[0].estado, 'caida');
  assert.ok(m.capacidades[0].resumen.includes('falta ensayar la reparada'));

  // Con el ensayo de la receta nueva, vuelve a estar operativa.
  const nuevo = cobertura.medir(pub.estado, [ensayoSobreLaVieja, ensayo_de(pub.receta)]);
  assert.strictEqual(nuevo.capacidades[0].estado, 'operativa');
});

test('un_ensayo_sin_firma_solo_cubre_por_version', () => {
  const publicada = catalogo_con_vigente();

  const porVersion = cobertura.medir(publicada.estado, [{
    clave: 'instagram:publicar', version: 1, apto: true, momento: M3
  }]);
  assert.strictEqual(porVersion.capacidades[0].estado, 'operativa');

  const otraVersion = cobertura.medir(publicada.estado, [{
    clave: 'instagram:publicar', version: 7, apto: true, momento: M3
  }]);
  assert.strictEqual(otraVersion.capacidades[0].estado, 'caida');
  assert.strictEqual(otraVersion.capacidades[0].motivo, 'receta_cambiada_sin_ensayo',
    'hay ensayos de la clave, pero no de ESTA receta: se dice cual de los dos casos es');

  // Un ensayo sin firma ni version no se puede atribuir a esta receta.
  const sinNada = cobertura.medir(publicada.estado, [{
    clave: 'instagram:publicar', apto: true, momento: M3
  }]);
  assert.strictEqual(sinNada.capacidades[0].estado, 'caida');
  assert.strictEqual(sinNada.capacidades[0].motivo, 'receta_cambiada_sin_ensayo');
});

// ---------------------------------------------------------------------------
// 3 · lo que no hay tambien es una caida
// ---------------------------------------------------------------------------

test('una_capacidad_esperada_sin_receta_es_caida', () => {
  const vacio = catalogo.estado_vacio();
  const m = cobertura.medir(vacio, [], { esperadas: ['publicar', 'comentar'] });

  assert.strictEqual(m.total, 2);
  assert.strictEqual(m.caidas, 2);
  assert.strictEqual(m.cobertura_pct, 0);
  for (const c of m.capacidades) {
    assert.strictEqual(c.estado, 'caida');
    assert.strictEqual(c.motivo, 'sin_receta');
    assert.strictEqual(c.declarada, true, 'una capacidad declarada por el dueno no es un olvido invisible');
  }
});

test('una_receta_retirada_por_rotura_es_caida_sin_receta', () => {
  const publicada = catalogo_con_vigente();
  const retirada = catalogo.marcar_no_vigente(publicada.estado, {
    capacidad: 'publicar', version: 1, motivo: 'la plataforma retiro el paso', momento: M3, quien: 'dueno'
  });
  assert.strictEqual(retirada.ok, true, retirada.motivo);

  const m = cobertura.medir(retirada.estado, [ensayo_de(publicada.receta)]);
  assert.strictEqual(m.capacidades[0].estado, 'caida');
  assert.strictEqual(m.capacidades[0].motivo, 'sin_receta');
  assert.strictEqual(m.capacidades[0].retirada, true);
  assert.strictEqual(m.capacidades[0].ultima_version, 1);
  assert.ok(m.capacidades[0].resumen.includes('se retiro'));
});

// ---------------------------------------------------------------------------
// 4 · la cuenta
// ---------------------------------------------------------------------------

test('la_cobertura_cuenta_operativas_sobre_el_total', () => {
  // Dos capacidades: una operativa (publicar) y una sin receta (comentar).
  const publicada = catalogo_con_vigente();
  const m = cobertura.medir(publicada.estado, [ensayo_de(publicada.receta)], {
    esperadas: ['publicar', 'comentar']
  });

  assert.strictEqual(m.total, 2);
  assert.strictEqual(m.operativas, 1);
  assert.strictEqual(m.caidas, 1);
  assert.strictEqual(m.cobertura_pct, 50);
  assert.deepStrictEqual(m.caidas_detalle.map((c) => c.capacidad), ['comentar']);
  assert.ok(m.resumen.includes('1 de 2'));
  assert.ok(m.resumen.includes('50%'));

  // Cada capacidad trae su propia frase: el que lee no tiene que deducir nada.
  const comentar = m.capacidades.find((c) => c.capacidad === 'comentar');
  assert.strictEqual(comentar.estado, 'caida');
  assert.strictEqual(comentar.motivo, 'sin_receta');
});

test('sin_catalogo_no_hay_cobertura', () => {
  const m = cobertura.medir(null, []);
  assert.strictEqual(m.ok, false);
  assert.strictEqual(m.motivo, 'esquema_desconocido');

  const conEstadoRaro = cobertura.medir({ recetas: [] }, []);
  assert.strictEqual(conEstadoRaro.ok, false);
});

test('el_desglose_es_puro_y_el_estado_no_se_toca', () => {
  const publicada = catalogo_con_vigente();
  const antes = JSON.stringify(publicada.estado);
  const ensayos = [ensayo_de(publicada.receta)];

  const a = cobertura.medir(publicada.estado, ensayos);
  const b = cobertura.medir(publicada.estado, ensayos);

  assert.deepStrictEqual(a, b, 'el mismo catalogo y los mismos ensayos dan el mismo desglose');
  assert.strictEqual(JSON.stringify(publicada.estado), antes, 'medir no toca el catalogo');
  assert.strictEqual(JSON.stringify(ensayos), JSON.stringify([ensayo_de(publicada.receta)]), 'ni los ensayos');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__desglose] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__desglose] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.stack || err.message}`);
  process.exit(1);
})();
