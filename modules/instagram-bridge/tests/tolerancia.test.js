'use strict';

/**
 * instagram-bridge · G5 · MemoriaDeTolerancia (CUSTODIO)
 *
 * La memoria dice que se ha aguantado hasta ahora, y con eso se decide cuanto
 * se puede pedir. Esta suite fija lo que no se puede mimar:
 *   - UNA CUENTA NUEVA ARRANCA EN EL MAXIMO CONSERVADOR: sin asientos no hay
 *     margen ganado, y el perfil que se devuelve es el mas lento de G1;
 *   - la conservaduria NO se guarda: se deriva del historial, y dos lecturas dan
 *     el mismo numero (una sola verdad);
 *   - la memoria es append-only: no se reescribe ni se borra un asiento;
 *   - un castigo firme devuelve la cuenta al maximo conservador;
 *   - el estado es POR CUENTA: la memoria de una no contamina la de otra;
 *   - sin sello (P1) o con secreto (V1) no se anota, y el fichero roto no se pisa.
 *
 * Ejecutar: node modules/instagram-bridge/tests/tolerancia.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const tolerancia = require('../ritmo/tolerancia');
const ritmo = require('../core/ritmo');
const { crear } = require('../ritmo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T10:00:00Z';
const M2 = '2026-11-11T12:00:00Z';
const M3 = '2026-11-12T09:00:00Z';

function asiento(opts = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno',
    tipo: 'tolerado',
    detalle: 'publicacion que salio sin incidencia'
  }, opts);
}

function anotar(estado, opts = {}) {
  const r = tolerancia.anotar(estado, asiento(opts));
  assert.strictEqual(r.ok, true, `no se pudo anotar: ${r.motivo} ${JSON.stringify(r.faltan || [])}`);
  return r;
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA: cuenta nueva = maximo conservador
// ---------------------------------------------------------------------------

test('cuenta_nueva_arranca_en_el_maximo_conservador', () => {
  const vacio = tolerancia.estado_vacio();
  const t = tolerancia.tolerancia_de(vacio, { cuenta: '@taller_a', proyecto: 'proy-a' });

  assert.strictEqual(t.ok, true, t.motivo);
  assert.strictEqual(t.origen, 'cuenta_nueva', 'no hay que confundir "no he tolerado nada" con "he tolerado poco"');
  assert.strictEqual(t.asientos, 0);
  assert.strictEqual(t.conservaduria, ritmo.CONSERVADURIA_MAXIMA);
  assert.strictEqual(t.conservaduria, 100);
  assert.strictEqual(t.castigos_firmes, 0);
  assert.strictEqual(t.tolerados, 0);

  // ... y el perfil que sale es el mas lento de G1, no un "normal" comodo.
  const perfil = ritmo.perfil_de_cuenta_nueva();
  assert.strictEqual(t.perfil.nombre, 'maximo_conservador');
  assert.strictEqual(t.perfil.nombre, perfil.nombre);
  assert.strictEqual(t.perfil.techo_diario, perfil.techo_diario);
  assert.strictEqual(t.perfil.techo_diario, 20, 'el techo mas bajo de la tabla');
  assert.strictEqual(t.perfil.publicaciones_al_dia, 1, 'una cuenta nueva publica UNA cosa al dia');

  // La derivacion directa dice lo mismo que la consulta: una sola verdad.
  assert.strictEqual(tolerancia.derivar_conservaduria([]), 100);
  assert.strictEqual(tolerancia.conservaduria_de_cuenta_nueva(), ritmo.CONSERVADURIA_MAXIMA);

  // Y no hace falta que la cuenta exista en ningun padron para saber esto.
  assert.strictEqual(tolerancia.tolerancia_de(vacio, { cuenta: '@nunca_vista' }).conservaduria, 100);
});

test('el_margen_se_gana_de_uno_en_uno_y_no_se_regala', () => {
  let e = tolerancia.estado_vacio();

  const primera = anotar(e, { momento: M1 });
  e = primera.estado;
  assert.strictEqual(primera.conservaduria, 97, 'un hecho tolerado baja 3 puntos, no 30');
  assert.strictEqual(primera.perfil, 'maximo_conservador', 'un exito no cambia de escalon');

  let r = anotar(e, { momento: M2 });
  e = r.estado;
  assert.strictEqual(r.conservaduria, 94);

  // Hacen falta muchos hechos tolerados para salir del escalon mas bajo (75).
  let vueltas = 2;
  while (e.asientos.length < 12) {
    r = anotar(e, { momento: M2 });
    e = r.estado;
    vueltas += 1;
  }
  const t = tolerancia.tolerancia_de(e, { cuenta: '@taller_a' });
  assert.strictEqual(t.asientos, 12);
  assert.strictEqual(t.conservaduria, 100 - 12 * 3);
  assert.strictEqual(t.conservaduria, 64);
  assert.strictEqual(t.perfil.nombre, 'conservador', 'a 64 ya se sale del maximo conservador');
  assert.ok(t.perfil.techo_diario > 20);

  // El suelo existe: ni la cuenta mas buena del mundo se queda sin freno.
  const muchos = Array.from({ length: 80 }, (_, i) => ({ tipo: 'tolerado', secuencia: i, momento: M1 }));
  assert.strictEqual(tolerancia.derivar_conservaduria(muchos), ritmo.CONSERVADURIA_MINIMA);
  assert.strictEqual(ritmo.perfil(ritmo.CONSERVADURIA_MINIMA).nombre, 'confiado');
});

test('un_castigo_firme_devuelve_la_cuenta_al_maximo_conservador', () => {
  let e = tolerancia.estado_vacio();
  // La cuenta lleva diez exitos: se ha ganado algo de margen.
  for (let i = 0; i < 10; i += 1) e = anotar(e, { momento: M1 }).estado;
  let t = tolerancia.tolerancia_de(e, { cuenta: '@taller_a' });
  assert.strictEqual(t.conservaduria, 70);

  // Un castigo DUDOSO sube 15: baja el ritmo sin devolverla al principio.
  let r = tolerancia.anotar_castigo(e, asiento({ momento: M2, clase: 'dudosa', detalle: 'aviso de seguridad' }));
  assert.strictEqual(r.ok, true, r.motivo);
  e = r.estado;
  t = tolerancia.tolerancia_de(e, { cuenta: '@taller_a' });
  assert.strictEqual(t.castigos_dudosos, 1);
  assert.strictEqual(t.castigos_firmes, 0);
  assert.strictEqual(t.conservaduria, 85);

  // Un castigo FIRME la devuelve al maximo: si la plataforma ya dijo que no, no
  // se sigue con el margen de antes.
  r = tolerancia.anotar_castigo(e, asiento({ momento: M3, clase: 'firme', detalle: 'accion bloqueada' }));
  assert.strictEqual(r.ok, true, r.motivo);
  e = r.estado;
  t = tolerancia.tolerancia_de(e, { cuenta: '@taller_a' });
  assert.strictEqual(t.castigos_firmes, 1);
  assert.strictEqual(t.conservaduria, 100, 'castigo firme = vuelta al maximo conservador');
  assert.strictEqual(t.perfil.nombre, 'maximo_conservador');
  assert.strictEqual(t.origen, 'registro', 'y sigue habiendo historial: no es una cuenta nueva');

  // Una clase desconocida se anota como DUDOSA: anotar de menos prudencia es el
  // unico error que no se corrige despues. Y una duda SUBE 15 puntos, no
  // resetea: se ve mejor partiendo de una cuenta con margen.
  let g = tolerancia.estado_vacio();
  for (let i = 0; i < 10; i += 1) g = anotar(g, { momento: M1 }).estado;
  assert.strictEqual(tolerancia.tolerancia_de(g, { cuenta: '@taller_a' }).conservaduria, 70);

  const raro = tolerancia.anotar_castigo(g, asiento({ momento: M2, clase: 'regular' }));
  assert.strictEqual(raro.ok, true, raro.motivo);
  assert.strictEqual(raro.asiento.tipo, 'castigo_dudoso');
  assert.strictEqual(raro.conservaduria, 85, 'la duda sube 15, no resetea');

  // Sobre una cuenta ya en el maximo, una duda no puede pasar de 100.
  const enMaximo = tolerancia.anotar_castigo(tolerancia.estado_vacio(), asiento({ clase: 'regular' }));
  assert.strictEqual(enMaximo.conservaduria, 100, 'el techo de la conservaduria es 100');
});

// ---------------------------------------------------------------------------
// 2 · una sola verdad: derivada, append-only, por cuenta
// ---------------------------------------------------------------------------

test('la_conservaduria_se_deriva_y_no_se_guarda', () => {
  let e = tolerancia.estado_vacio();
  e = anotar(e, { momento: M1 }).estado;
  e = anotar(e, { momento: M2, tipo: 'castigo_dudoso' }).estado;

  // El almacen NO lleva la conservaduria: solo hechos y su sello.
  const guardado = JSON.stringify(e);
  assert.strictEqual(/conservaduria/.test(guardado), false, 'el numero no se guarda: se deriva');
  for (const a of e.asientos) {
    assert.strictEqual(typeof a.tipo, 'string');
    assert.ok(a.sello, 'cada asiento lleva su sello (P1)');
  }

  // Dos lecturas del mismo historial dan el mismo numero, y el orden no importa
  // (se ordena por secuencia, no por como esten en el array).
  const t1 = tolerancia.tolerancia_de(e, { cuenta: '@taller_a' });
  const t2 = tolerancia.tolerancia_de(e, { cuenta: '@taller_a' });
  assert.deepStrictEqual(t1, t2);

  const desordenado = { esquema: e.esquema, almacen: e.almacen, revision: e.revision, secuencia: e.secuencia, actualizado: null, asientos: e.asientos.slice().reverse() };
  assert.strictEqual(tolerancia.tolerancia_de(desordenado, { cuenta: '@taller_a' }).conservaduria, t1.conservaduria,
    'el fold ordena por secuencia: el array no manda');

  // Append-only: anotar no toca lo anterior.
  const antes = JSON.parse(JSON.stringify(e.asientos));
  const despues = anotar(e, { momento: M3 }).estado;
  assert.strictEqual(despues.asientos.length, antes.length + 1);
  assert.deepStrictEqual(despues.asientos.slice(0, antes.length), antes, 'los asientos viejos no se reescriben');

  // Un tipo desconocido no mueve nada (ni revienta).
  assert.strictEqual(tolerancia.derivar_conservaduria([{ tipo: 'inventado', secuencia: 1, momento: M1 }]), 100);
  assert.strictEqual(tolerancia.derivar_conservaduria('no-es-lista'), 100);
});

test('el_estado_es_por_cuenta_y_no_se_mezcla', () => {
  let e = tolerancia.estado_vacio();
  for (let i = 0; i < 5; i += 1) e = anotar(e, { momento: M1 }).estado;
  e = anotar(e, { cuenta: '@taller_b', proyecto: 'proy-a', momento: M2, tipo: 'castigo_firme' }).estado;

  const a = tolerancia.tolerancia_de(e, { cuenta: '@taller_a' });
  const b = tolerancia.tolerancia_de(e, { cuenta: '@taller_b' });

  assert.strictEqual(a.conservaduria, 85, 'la cuenta A conserva su margen');
  assert.strictEqual(b.conservaduria, 100, 'la cuenta B esta en el maximo por su castigo');
  assert.notStrictEqual(a.conservaduria, b.conservaduria, 'una cuenta no arrastra a la otra');

  // Dos cuentas del mismo proyecto tienen memorias separadas.
  const c = tolerancia.tolerancia_de(e, { cuenta: '@taller_c' });
  assert.strictEqual(c.origen, 'cuenta_nueva');
  assert.strictEqual(c.conservaduria, 100);

  // Sin criterio no se sirve la memoria entera (P2).
  const sinAmbito = tolerancia.listar(e, {});
  assert.strictEqual(sinAmbito.ok, false);
  assert.strictEqual(sinAmbito.motivo, 'ambito_incompleto');

  // Por cuenta, sale lo suyo y solo lo suyo.
  const soloA = tolerancia.listar(e, { cuenta: '@taller_a' });
  assert.strictEqual(soloA.ok, true);
  assert.strictEqual(soloA.total, 5);
  assert.ok(soloA.asientos.every((x) => x.cuenta === '@taller_a'));
});

test('sin_sello_o_con_secreto_no_se_anota', () => {
  const e = tolerancia.estado_vacio();

  const sinQuien = tolerancia.anotar(e, asiento({ quien: undefined }));
  assert.strictEqual(sinQuien.ok, false);
  assert.strictEqual(sinQuien.motivo, 'sin_sello');
  assert.ok(sinQuien.faltan.includes('quien'));

  const sinAparato = tolerancia.anotar(e, asiento({ aparato: undefined }));
  assert.strictEqual(sinAparato.motivo, 'sin_sello');
  assert.ok(sinAparato.faltan.includes('aparato'));

  const tipoRaro = tolerancia.anotar(e, asiento({ tipo: 'me_lo_invento' }));
  assert.strictEqual(tipoRaro.ok, false);
  assert.strictEqual(tipoRaro.motivo, 'tipo_desconocido');
  assert.deepStrictEqual(tipoRaro.tipos, ['tolerado', 'castigo_firme', 'castigo_dudoso', 'reinicio']);

  const conSecreto = tolerancia.anotar(e, asiento({ detalle: 'se uso password: hunter2secreto' }));
  assert.strictEqual(conSecreto.ok, false);
  assert.strictEqual(conSecreto.motivo, 'secreto_recibido');
  assert.strictEqual(conSecreto.guardado, false);

  assert.strictEqual(e.asientos.length, 0, 'ningun rechazo muta el almacen');

  // Reinicio: vuelve a empezar, y queda escrito que se reinicio.
  let f = tolerancia.estado_vacio();
  for (let i = 0; i < 8; i += 1) f = anotar(f, { momento: M1 }).estado;
  assert.strictEqual(tolerancia.tolerancia_de(f, { cuenta: '@taller_a' }).conservaduria, 76);
  const reinicio = tolerancia.reiniciar(f, asiento({ momento: M2, detalle: 'cambio de aparato' }));
  assert.strictEqual(reinicio.ok, true);
  assert.strictEqual(tolerancia.tolerancia_de(reinicio.estado, { cuenta: '@taller_a' }).conservaduria, 100);
});

// ---------------------------------------------------------------------------
// 3 · el custodio
// ---------------------------------------------------------------------------

test('el_custodio_es_single_writer_y_no_pisa_lo_roto', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'enki-tol-'));
  try {
    const custodio = crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, true);

    // Diez anotaciones A LA VEZ: ni se pierde ninguna ni se repite la secuencia.
    const altas = await Promise.all(Array.from({ length: 10 }, (_, i) => custodio.anotarTolerado(asiento({ detalle: `exito ${i}` }))));
    for (const a of altas) assert.strictEqual(a.ok, true, a.motivo);

    const foto = custodio.foto();
    assert.strictEqual(foto.tolerancia.asientos.length, 10);
    assert.strictEqual(foto.tolerancia.secuencia, 10);
    assert.strictEqual(new Set(foto.tolerancia.asientos.map((a) => a.id)).size, 10);

    // Del disco se lee lo mismo y la derivacion coincide con la de memoria.
    const enDisco = JSON.parse(await fsp.readFile(path.join(dir, 'tolerancia.json'), 'utf8'));
    assert.strictEqual(enDisco.asientos.length, 10);
    assert.strictEqual(tolerancia.auditar(enDisco).ok, true);
    assert.strictEqual(tolerancia.tolerancia_de(enDisco, { cuenta: '@taller_a' }).conservaduria, 70);

    const restos = (await fsp.readdir(dir)).filter((f) => f.includes('.tmp'));
    assert.deepStrictEqual(restos, [], 'sin temporales a medias');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }

  // Fichero roto: se nombra y NO se machaca.
  const dir2 = await fsp.mkdtemp(path.join(os.tmpdir(), 'enki-tol-rota-'));
  try {
    const ruta = path.join(dir2, 'tolerancia.json');
    const basura = '{"esquema":"otra-cosa","asientos":[]}';
    await fsp.writeFile(ruta, basura, 'utf8');

    const custodio = crear({ directorio: dir2 });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, false);
    assert.strictEqual(carga.tolerancia, 'esquema_desconocido');

    const r = await custodio.anotarTolerado(asiento());
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_tolerancia');
    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), basura, 'la memoria rota no se machaca');
  } finally {
    await fsp.rm(dir2, { recursive: true, force: true });
  }
});

test('el_fichero_del_repo_es_una_memoria_valida_y_vacia', async () => {
  const ruta = path.resolve(__dirname, '../../../storage/instagram-bridge/tolerancia.json');
  const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));
  assert.strictEqual(datos.esquema, 'tolerancia-v1');
  assert.deepStrictEqual(datos.asientos, [], 'la memoria del repo nace vacia: ninguna cuenta con margen regalado');
  assert.strictEqual(tolerancia.auditar(datos).ok, true);
  assert.strictEqual(tolerancia.tolerancia_de(datos, { cuenta: '@taller_a' }).conservaduria, 100);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__tolerancia] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__tolerancia] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
