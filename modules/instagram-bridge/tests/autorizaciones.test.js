'use strict';

/**
 * instagram-bridge · bloque 9 · Q5 · RegistroDeAutorizaciones (CUSTODIO, logica pura)
 *
 * El libro donde viven los si. Lo que esta suite fija:
 *   - **el silencio nunca se anota como autorizacion**: ni la via `silencio`, ni
 *     la `costumbre`, ni la `historial`, ni el `sistema`;
 *   - **sin persona no hay autorizacion**, y sin referencia tampoco;
 *   - **el si tambien caduca**, con techo de una hora;
 *   - **un si, una autorizacion**: el mismo confirmacion_id no acuna dos;
 *   - **la huella la calcula el libro**, no el que pide;
 *   - **un si se gasta una vez** y el gasto es otro asiento: el libro no se edita.
 *
 * Ejecutar: node modules/instagram-bridge/tests/autorizaciones.test.js
 */

const assert = require('assert');

const autorizaciones = require('../autonomia/autorizaciones');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M0 = '2026-11-11T12:00:00Z';
const M1 = '2026-11-11T12:05:00Z';
const M2 = '2026-11-11T12:10:00Z';
const M3 = '2026-11-11T14:00:00Z';

function alta(extra = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    accion: 'publicar',
    rol: 'agente',
    nivel_al_conceder: 'permiso',
    via: 'puerta',
    quien: 'dueno',
    referencia: 'telegram:msg-1',
    confirmacion_id: 'cf-abc123456789',
    respuesta_momento: M1,
    momento: M1,
    aparato: 'movil-1'
  }, extra);
}

function anotada(extra = {}) {
  const r = autorizaciones.anotar(autorizaciones.estado_vacio(), alta(extra));
  assert.strictEqual(r.ok, true, r.motivo);
  return r;
}

function gasto(id, extra = {}) {
  return Object.assign({
    autorizacion_id: id,
    momento: M2,
    accion: 'publicar',
    cuenta: '@taller_a',
    proyecto: 'proy-a',
    rol: 'agente',
    quien: 'agente'
  }, extra);
}

// ---------------------------------------------------------------------------
// 1 · el silencio y la persona
// ---------------------------------------------------------------------------

test('el_silencio_no_se_puede_anotar_como_autorizacion', () => {
  const libro = autorizaciones.estado_vacio();

  const casos = {
    silencio: 'el_silencio_no_se_anota_como_autorizacion',
    historial: 'el_historial_no_autoriza',
    costumbre: 'la_costumbre_no_autoriza',
    sistema: 'el_sistema_no_se_autoriza_a_si_mismo'
  };

  for (const [via, motivo] of Object.entries(casos)) {
    const r = autorizaciones.anotar(libro, alta({ via }));
    assert.strictEqual(r.ok, false, `via ${via} no puede entrar`);
    assert.strictEqual(r.motivo, motivo);
    assert.strictEqual(r.estado, undefined, 'no se escribe nada');
  }

  // Una via que no es ninguna de las dos tampoco (lista cerrada).
  const rara = autorizaciones.anotar(libro, alta({ via: 'telegram' }));
  assert.strictEqual(rara.ok, false);
  assert.strictEqual(rara.motivo, autorizaciones.MOTIVOS.VIA_INVALIDA);
  assert.deepStrictEqual(rara.permitidas, ['puerta', 'canal']);

  // Y sin via no hay autorizacion.
  const sinVia = autorizaciones.anotar(libro, alta({ via: undefined }));
  assert.strictEqual(sinVia.ok, false);
  assert.ok(sinVia.faltan.includes('via'));

  // El libro se queda vacio: el silencio no ha dejado rastro de permiso.
  assert.strictEqual(libro.autorizaciones.length, 0);
});

test('sin_persona_no_hay_autorizacion', () => {
  const libro = autorizaciones.estado_vacio();
  for (const quien of ['agente', 'sistema', 'root', undefined]) {
    const r = autorizaciones.anotar(libro, alta({ quien }));
    assert.strictEqual(r.ok, false, `${quien} no autoriza`);
    assert.ok([autorizaciones.MOTIVOS.SIN_PERSONA, autorizaciones.MOTIVOS.ENTRADA_INCOMPLETA].includes(r.motivo));
  }

  // Sin referencia (la prueba de que alguien contesto) tampoco.
  const sinRef = autorizaciones.anotar(libro, alta({ referencia: ' ' }));
  assert.strictEqual(sinRef.ok, false);
  assert.ok(sinRef.faltan.includes('referencia'));

  // Sin confirmacion detras tampoco: una autorizacion no nace de la nada.
  const sinConf = autorizaciones.anotar(libro, alta({ confirmacion_id: undefined }));
  assert.strictEqual(sinConf.ok, false);
  assert.ok(sinConf.faltan.includes('confirmacion_id'));
});

test('el_si_tambien_caduca', () => {
  const libro = autorizaciones.estado_vacio();

  // Caducidad por defecto: 15 minutos desde la concesion.
  const def = anotada();
  assert.strictEqual(def.autorizacion.caduca_en, '2026-11-11T12:20:00Z');
  assert.strictEqual(def.autorizacion.concedida_en, M1);

  // Un si que llega despues de la caducidad no entra.
  const tarde = autorizaciones.anotar(libro, alta({
    momento: M0, caduca_en: M1, respuesta_momento: M2, confirmacion_id: 'cf-tarde'
  }));
  assert.strictEqual(tarde.ok, false);
  assert.strictEqual(tarde.motivo, autorizaciones.MOTIVOS.SI_CADUCADO);

  // Ni una autorizacion eterna: mas de una hora se rechaza.
  const eterna = autorizaciones.anotar(libro, alta({
    caduca_en: '2026-11-12T12:00:00Z', confirmacion_id: 'cf-eterna'
  }));
  assert.strictEqual(eterna.ok, false);
  assert.strictEqual(eterna.motivo, autorizaciones.MOTIVOS.CADUCIDAD_DEMASIADO_LARGA);
  assert.strictEqual(eterna.tope_segundos, 3600);

  // Ni una caducidad anterior a la concesion.
  const alReves = autorizaciones.anotar(libro, alta({ caduca_en: M0, confirmacion_id: 'cf-alreves' }));
  assert.strictEqual(alReves.ok, false);
  assert.strictEqual(alReves.motivo, autorizaciones.MOTIVOS.CADUCIDAD_INVALIDA);

  // El gasto tambien caduca: el permiso vivo a las 12:10 esta muerto a las 14:00.
  const c = autorizaciones.consultar(def.estado, { autorizacion_id: def.autorizacion_id, momento: M3 });
  assert.strictEqual(c.autorizacion.vigente, false);
  assert.strictEqual(c.motivo, autorizaciones.MOTIVOS.CADUCADA);

  const gasto = autorizaciones.consumir(def.estado, {
    autorizacion_id: def.autorizacion_id, momento: M3,
    accion: 'publicar', cuenta: '@taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente'
  });
  assert.strictEqual(gasto.ok, false);
  assert.strictEqual(gasto.motivo, autorizaciones.MOTIVOS.CADUCADA);
});

test('un_nivel_conservador_no_produce_permiso', () => {
  for (const nivel of ['borrador', undefined, 'dios']) {
    const r = autorizaciones.anotar(autorizaciones.estado_vacio(), alta({ nivel_al_conceder: nivel }));
    assert.strictEqual(r.ok, false, `nivel ${nivel}`);
    assert.ok([autorizaciones.MOTIVOS.NIVEL_CONSERVADOR, autorizaciones.MOTIVOS.ENTRADA_INCOMPLETA].includes(r.motivo));
  }
});

// ---------------------------------------------------------------------------
// 2 · un si, una autorizacion
// ---------------------------------------------------------------------------

test('un_si_una_autorizacion', () => {
  const a = anotada();

  // El mismo si no acuna un segundo permiso.
  const segundo = autorizaciones.anotar(a.estado, alta({ rol: 'dueno' }));
  assert.strictEqual(segundo.ok, false);
  assert.strictEqual(segundo.motivo, autorizaciones.MOTIVOS.CONFIRMACION_YA_AUTORIZADA);
  assert.strictEqual(segundo.confirmacion_id, 'cf-abc123456789');

  // Y un id de autorizacion repetido tampoco (aunque el si sea otro).
  const repetido = autorizaciones.anotar(a.estado, alta({ confirmacion_id: 'cf-otro', autorizacion_id: a.autorizacion_id }));
  assert.strictEqual(repetido.ok, false);
  assert.strictEqual(repetido.motivo, autorizaciones.MOTIVOS.AUTORIZACION_DUPLICADA);

  // Dos si distintos para la misma accion si son dos permisos: cada uno con su
  // confirmacion y su momento, y cada uno se gastara por separado.
  const otroSi = autorizaciones.anotar(a.estado, alta({ confirmacion_id: 'cf-otro', respuesta_momento: M2, momento: M2 }));
  assert.strictEqual(otroSi.ok, true, otroSi.motivo);
  assert.notStrictEqual(otroSi.autorizacion_id, a.autorizacion_id);
});

test('la_huella_la_calcula_el_libro_no_el_que_pide', () => {
  // El libro calcula la huella y la guarda.
  const a = anotada();
  assert.strictEqual(typeof a.huella, 'string');
  assert.strictEqual(a.autorizacion.huella, a.huella);

  // Si el que pide trae una huella, o coincide o se rechaza.
  const coincide = autorizaciones.anotar(autorizaciones.estado_vacio(), alta({ confirmacion_id: 'cf-2', huella: a.huella }));
  assert.strictEqual(coincide.ok, true);
  assert.strictEqual(coincide.huella, a.huella);

  const falsa = autorizaciones.anotar(autorizaciones.estado_vacio(), alta({ confirmacion_id: 'cf-3', huella: 'f'.repeat(32) }));
  assert.strictEqual(falsa.ok, false);
  assert.strictEqual(falsa.motivo, autorizaciones.MOTIVOS.HUELLA_NO_CORRESPONDE);

  // Y una casilla traida que contradice la tabla se rechaza aqui tambien.
  const conCasilla = autorizaciones.anotar(autorizaciones.estado_vacio(), alta({
    confirmacion_id: 'cf-4', casilla: { reversibilidad: 'reversible', visibilidad: 'privada' }
  }));
  assert.strictEqual(conCasilla.ok, false);
  assert.strictEqual(conCasilla.motivo, 'casilla_ajena');
});

// ---------------------------------------------------------------------------
// 3 · el gasto
// ---------------------------------------------------------------------------

test('consumir_exige_la_accion_autorizada', () => {
  const a = anotada();

  const casos = [
    { campo: 'accion', valor: 'comentar', motivo: autorizaciones.MOTIVOS.PERMISO_DE_OTRA_ACCION },
    { campo: 'cuenta', valor: '@taller_b', motivo: autorizaciones.MOTIVOS.PERMISO_DE_OTRA_CUENTA },
    { campo: 'proyecto', valor: 'proy-b', motivo: autorizaciones.MOTIVOS.PERMISO_DE_OTRO_PROYECTO },
    { campo: 'rol', valor: 'dueno', motivo: autorizaciones.MOTIVOS.PERMISO_DE_OTRO_ROL }
  ];

  for (const caso of casos) {
    const r = autorizaciones.consumir(a.estado, gasto(a.autorizacion_id, { [caso.campo]: caso.valor }));
    assert.strictEqual(r.ok, false, caso.campo);
    assert.strictEqual(r.motivo, caso.motivo, caso.campo);
    assert.strictEqual(r.estado, undefined, 'un gasto rechazado no escribe');
  }

  // El bueno si gasta.
  const bueno = autorizaciones.consumir(a.estado, gasto(a.autorizacion_id));
  assert.strictEqual(bueno.ok, true, bueno.motivo);
  assert.strictEqual(bueno.consumo.accion, 'publicar');
  assert.strictEqual(bueno.consumo.huella, a.huella);
});

test('un_si_se_gasta_una_vez', () => {
  const a = anotada();
  const primero = autorizaciones.consumir(a.estado, gasto(a.autorizacion_id));
  assert.strictEqual(primero.ok, true);

  const segundo = autorizaciones.consumir(primero.estado, gasto(a.autorizacion_id, { momento: M2 }));
  assert.strictEqual(segundo.ok, false);
  assert.strictEqual(segundo.motivo, autorizaciones.MOTIVOS.YA_GASTADA);
  assert.strictEqual(segundo.consumida_en, M2);

  assert.strictEqual(autorizaciones.esta_gastada(primero.estado, a.autorizacion_id), true);
  assert.strictEqual(autorizaciones.consumida_en(primero.estado, a.autorizacion_id), M2);

  // La consulta lo dice sin que nadie lo guarde: se deriva del libro.
  const c = autorizaciones.consultar(primero.estado, { autorizacion_id: a.autorizacion_id, momento: M2 });
  assert.strictEqual(c.gastada, true);
  assert.strictEqual(c.vigente, false);
  assert.strictEqual(c.autorizacion.consumida, true);
});

test('el_libro_es_append_only', () => {
  const a = anotada();
  const antes = JSON.stringify(a.estado.autorizaciones);

  const c = autorizaciones.consumir(a.estado, gasto(a.autorizacion_id));
  assert.strictEqual(c.ok, true);

  // El asiento de la autorizacion NO cambio: el gasto es otro asiento.
  assert.strictEqual(JSON.stringify(c.estado.autorizaciones), antes);
  assert.strictEqual(c.estado.consumos.length, 1);
  assert.strictEqual(c.estado.revision, a.estado.revision + 1);
  assert.strictEqual(c.estado.secuencia, a.estado.secuencia + 1);

  // Y el estado original no se muta (el custodio trabaja con copias).
  assert.strictEqual(a.estado.consumos.length, 0);
});

test('consumir_sin_autorizacion_no_inventa_nada', () => {
  const libro = autorizaciones.estado_vacio();
  const r = autorizaciones.consumir(libro, gasto('az-inventada'));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, autorizaciones.MOTIVOS.AUTORIZACION_DESCONOCIDA);
  assert.strictEqual(libro.consumos.length, 0);
});

// ---------------------------------------------------------------------------
// 4 · la auditoria
// ---------------------------------------------------------------------------

test('la_auditoria_rechaza_un_libro_tocado', () => {
  const a = anotada();
  assert.strictEqual(autorizaciones.auditar(a.estado).ok, true, 'el libro recien escrito esta bien');

  const tocar = (fn) => {
    const copia = JSON.parse(JSON.stringify(a.estado));
    fn(copia);
    return autorizaciones.auditar(copia);
  };

  // Una autorizacion del sistema.
  assert.strictEqual(tocar((l) => { l.autorizaciones[0].quien = 'sistema'; }).ok, false);
  // Una via del silencio.
  assert.strictEqual(tocar((l) => { l.autorizaciones[0].via = 'silencio'; }).ok, false);
  // Un si posterior a su caducidad.
  assert.strictEqual(tocar((l) => { l.autorizaciones[0].respuesta_momento = M3; }).ok, false);
  // Una huella que ya no corresponde con la accion.
  assert.strictEqual(tocar((l) => { l.autorizaciones[0].huella = 'f'.repeat(32); }).ok, false);
  // Una caducidad eterna.
  assert.strictEqual(tocar((l) => { l.autorizaciones[0].caduca_en = '2027-11-11T12:00:00Z'; }).ok, false);
  // Un permiso concedido en borrador.
  assert.strictEqual(tocar((l) => { l.autorizaciones[0].nivel_al_conceder = 'borrador'; }).ok, false);
  // Un sello que falta.
  assert.strictEqual(tocar((l) => { delete l.autorizaciones[0].sello; }).ok, false);

  // El mismo permiso gastado dos veces.
  const gastada = autorizaciones.consumir(a.estado, gasto(a.autorizacion_id));
  const doble = JSON.parse(JSON.stringify(gastada.estado));
  doble.consumos.push(Object.assign({}, doble.consumos[0], { momento: M2 }));
  const audit = autorizaciones.auditar(doble);
  assert.strictEqual(audit.ok, false);
  assert.ok(audit.problemas.some((p) => p.motivo === 'autorizacion_gastada_dos_veces'), JSON.stringify(audit.problemas));

  // Un consumo de una autorizacion que no existe.
  const huerfano = JSON.parse(JSON.stringify(a.estado));
  huerfano.consumos.push({ autorizacion_id: 'az-fantasma', momento: M2, accion: 'publicar', cuenta: 'taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente', huella: 'x' });
  assert.strictEqual(autorizaciones.auditar(huerfano).ok, false);
});

test('el_esquema_y_las_listas_se_declaran', () => {
  const vacio = autorizaciones.estado_vacio();
  assert.strictEqual(vacio.esquema, 'autorizaciones-v1');
  assert.strictEqual(vacio.almacen, 'autorizaciones');
  assert.deepStrictEqual(vacio.autorizaciones, []);
  assert.deepStrictEqual(vacio.consumos, []);
  assert.strictEqual(autorizaciones.es_estado(vacio), true);
  assert.strictEqual(autorizaciones.es_estado({ esquema: 'autorizaciones-v1' }), false);
  assert.strictEqual(autorizaciones.auditar({}).ok, false);
});

test('listar_filtra_por_proyecto_y_cuenta_sin_mezclar', () => {
  let estado = autorizaciones.estado_vacio();
  const a1 = autorizaciones.anotar(estado, alta({ confirmacion_id: 'cf-1' }));
  estado = a1.estado;
  const a2 = autorizaciones.anotar(estado, alta({ confirmacion_id: 'cf-2', cuenta: '@taller_b' }));
  estado = a2.estado;
  const a3 = autorizaciones.anotar(estado, alta({ confirmacion_id: 'cf-3', proyecto: 'proy-b' }));
  estado = a3.estado;

  assert.strictEqual(autorizaciones.listar(estado, {}).total, 3);
  assert.strictEqual(autorizaciones.listar(estado, { proyecto: 'proy-a' }).total, 2);
  assert.strictEqual(autorizaciones.listar(estado, { cuenta: 'taller_a' }).total, 2);
  assert.strictEqual(autorizaciones.listar(estado, { proyecto: 'proy-a', cuenta: 'taller_a' }).total, 1);
  assert.strictEqual(autorizaciones.listar(estado, { proyecto: 'proy-z' }).total, 0);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__autorizaciones] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__autorizaciones] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
