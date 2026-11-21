'use strict';

/**
 * instagram-bridge · G6 · ReguladorDePaso (REFLEJO)
 *
 * La sintesis. Recorre los cinco inputs EN ORDEN FIJO —techo, castigo, turno,
 * espera, veredicto— y emite un veredicto con su razon. Esta suite fija el
 * contrato entero:
 *   - el ORDEN es `['techo','castigo','turno','espera','veredicto']` y el
 *     veredicto dice que miro en cada paso (`porque`);
 *   - EL CASTIGO MANDA SOBRE LA PRISA DEL DUENO: con una senal firme, un trabajo
 *     urgente del dueno no se hace;
 *   - TODA PENALIZACION LLEVA FIN DECLARADO: no existe `esperar`/`parar` sin
 *     `hasta`, y nada veta mas de 24 h;
 *   - solo la plataforma PARA; el techo, el turno y la espera se ESPERAN;
 *   - una senal DUDOSA baja el ritmo (mitad de presupuesto, doble de espera) y
 *     no para jamas;
 *   - sin momento o con una accion sin precio, no hay veredicto: se nombra.
 *
 * Ejecutar: node modules/instagram-bridge/tests/regulador.test.js
 */

const assert = require('assert');

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const regulador = require('../ritmo/regulador');
const castigo = require('../ritmo/castigo');
const ritmo = require('../core/ritmo');
const { crear } = require('../ritmo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M0 = '2026-11-11T09:00:00Z';
const M1 = '2026-11-11T10:00:00Z';
const M2 = '2026-11-11T12:00:00Z';

// Un caso base que CABE en todo: cuenta con margen, sin castigo, sin cola.
function base(opts = {}) {
  return Object.assign({
    momento: M1,
    accion: 'publicar',
    conservaduria: 10,   // cuenta que ya ha tolerado: techo 120
    gastado: 0,
    castigo: { clase: 'ausente' },
    cola: {},
    ultima_accion_en: null
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · el orden
// ---------------------------------------------------------------------------

test('el_orden_de_los_cinco_inputs_es_fijo_y_se_declara', () => {
  assert.deepStrictEqual(regulador.ORDEN, ['techo', 'castigo', 'turno', 'espera', 'veredicto']);
  assert.deepStrictEqual(regulador.ReguladorDePaso.orden(), ['techo', 'castigo', 'turno', 'espera', 'veredicto']);

  const v = regulador.decidir(base());
  assert.strictEqual(v.ok, true, v.motivo);
  assert.strictEqual(v.decision, 'seguir');
  assert.strictEqual(v.razon, 'turno_libre');

  // El veredicto dice QUE miro y en QUE orden: sin eso, la decision es una caja negra.
  assert.deepStrictEqual(v.porque.map((p) => p.paso), ['techo', 'castigo', 'turno', 'espera', 'veredicto']);
  for (const paso of v.porque) {
    assert.strictEqual(typeof paso.resultado, 'string');
    assert.strictEqual(typeof paso.detalle, 'string');
    assert.ok(paso.detalle.length > 0, `el paso ${paso.paso} tiene que explicarse`);
  }
  assert.strictEqual(regulador.se_puede(v), true);
  assert.strictEqual(regulador.es_veredicto_valido(v), true);
  assert.ok(/seguir con publicar/.test(regulador.explicar(v)), regulador.explicar(v));
});

// ---------------------------------------------------------------------------
// 2 · LA REGLA: el castigo manda sobre la prisa del dueno
// ---------------------------------------------------------------------------

test('el_castigo_manda_sobre_la_prisa_del_dueno', () => {
  // El dueno tiene un trabajo urgente, es su turno, la cuenta esta libre y el
  // presupuesto sobra. Con una senal FIRME, no se hace.
  const conPrisa = base({
    conservaduria: 10,          // el maximo margen de la tabla
    gastado: 0,                 // todo el techo disponible
    trabajo: { id: 'urgente-1', secuencia: 1, accion: 'publicar', quien: 'dueno', urgencia: 3, estado: 'nuevo' },
    cola: {},                   // cuenta libre, es su turno
    ultima_accion_en: null,     // sin espera pendiente
    castigo: { clase: 'firme', familia: 'limite_de_uso', fin: M2, fin_origen: 'texto' }
  });

  const v = regulador.decidir(conPrisa);
  assert.strictEqual(v.ok, true, v.motivo);
  assert.strictEqual(v.decision, 'parar', 'la prisa del dueno no puede saltarse un castigo firme');
  assert.strictEqual(v.razon, 'castigo_firme');
  assert.strictEqual(v.hasta, M2, 'y se para hasta el fin que la senal declaro');
  assert.strictEqual(v.fin_declarado, 'texto');
  assert.strictEqual(v.turno.libre, true, 'el turno SI era suyo: por eso se ve que lo que manda es el castigo');
  assert.strictEqual(v.porque.find((p) => p.paso === 'techo').resultado, 'pasa',
    'el techo dejaba pasar: el veto viene del castigo, no del presupuesto');
  assert.strictEqual(v.porque.find((p) => p.paso === 'castigo').resultado, 'para');
  assert.strictEqual(regulador.se_puede(v), false);

  // El mismo caso SIN castigo se hace: asi se demuestra que lo que paro fue el
  // castigo y no otra cosa.
  const sinCastigo = regulador.decidir(Object.assign({}, conPrisa, { castigo: { clase: 'ausente' } }));
  assert.strictEqual(sinCastigo.decision, 'seguir', 'sin castigo, el trabajo urgente del dueno se hace');

  // El castigo tambien manda sobre el orden de la cola: aunque el trabajo NO
  // sea el primero (G4), con senal firme se para igual.
  const conTurnoAjeno = regulador.decidir(base({
    cola: { adelanta: 'otro-1' },
    castigo: { clase: 'firme', fin: M2, fin_origen: 'senal' }
  }));
  assert.strictEqual(conTurnoAjeno.decision, 'parar', 'el castigo manda tambien sobre el turno');
  assert.strictEqual(conTurnoAjeno.razon, 'castigo_firme', 'y la razon publicada es la del castigo');

  // Si el castigo firme llega con un plazo eterno, el puente lo acota y lo dice.
  const eterno = regulador.decidir(base({
    castigo: { clase: 'firme', fin: '2027-11-11T10:00:00Z', fin_origen: 'senal' }
  }));
  assert.strictEqual(eterno.decision, 'parar');
  assert.strictEqual(eterno.recortado, true, 'un ano de veto se recorta');
  assert.strictEqual(eterno.fin_declarado, 'tope');
  assert.strictEqual(eterno.hasta, '2026-11-12T10:00:00Z', 'tope duro de 24 h');
});

// ---------------------------------------------------------------------------
// 3 · LA REGLA: toda penalizacion lleva fin declarado
// ---------------------------------------------------------------------------

test('toda_penalizacion_lleva_fin_declarado', () => {
  // Se recorren TODAS las causas de veto conocidas. Ninguna puede salir sin fin.
  const casos = [
    ['techo_agotado', base({ gastado: 120 })],
    ['techo_agotado con techo explicito', base({ gastado: 30, techo: 30, techo_hasta: '2026-11-11T23:00:00Z' })],
    ['castigo_firme', base({ castigo: { clase: 'firme', fin: M2, fin_origen: 'texto' } })],
    ['castigo_firme sin plazo', base({ castigo: { clase: 'firme' } })],
    ['castigo_dudoso', base({ gastado: 100, castigo: { clase: 'dudosa', fin: M2, fin_origen: 'por_defecto' } })],
    ['cuenta_ocupada', base({ cola: { en_curso: 't-1' } })],
    ['no_es_su_turno', base({ cola: { adelanta: 't-2' } })],
    ['en_espera', base({ ultima_accion_en: M1, momento: '2026-11-11T10:01:00Z' })]
  ];

  for (const [etiqueta, entrada] of casos) {
    const v = regulador.decidir(entrada);
    assert.strictEqual(v.ok, true, `${etiqueta}: no hay veredicto (${v.motivo})`);
    assert.notStrictEqual(v.decision, 'seguir', `${etiqueta}: tenia que vetar`);

    // 1 · hay fin
    assert.ok(v.hasta, `${etiqueta}: sin fin, el veto seria eterno`);
    assert.ok(ritmo.antes_de(v.momento, v.hasta) || v.hasta === v.momento,
      `${etiqueta}: el fin (${v.hasta}) tiene que ser posterior al momento (${v.momento})`);

    // 2 · se sabe de donde sale
    assert.ok(v.fin_declarado, `${etiqueta}: hay fin pero no se declara de donde viene`);
    assert.ok(['senal', 'texto', 'techo', 'turno', 'espera', 'por_defecto', 'tope'].includes(v.fin_declarado),
      `${etiqueta}: fin_declarado desconocido (${v.fin_declarado})`);

    // 3 · y no pasa del tope: nada veta mas de un dia
    const minutos = ritmo.minutos_entre(v.momento, v.hasta);
    assert.ok(minutos <= regulador.TOPE_MINUTOS, `${etiqueta}: ${minutos} min de veto, tope ${regulador.TOPE_MINUTOS}`);

    // 4 · el invariante se puede comprobar desde fuera
    assert.strictEqual(regulador.es_veredicto_valido(v), true, `${etiqueta}: veredicto invalido`);
  }

  // Un veredicto de seguir NO lleva fin (no hay nada que caducar).
  const seguir = regulador.decidir(base());
  assert.strictEqual(seguir.decision, 'seguir');
  assert.strictEqual(seguir.hasta, null);
  assert.strictEqual(seguir.fin_declarado, null);

  // Y sin momento no hay veredicto posible: el fin no se puede inventar.
  const sinMomento = regulador.decidir({ accion: 'publicar' });
  assert.strictEqual(sinMomento.ok, false);
  assert.strictEqual(sinMomento.motivo, 'sin_momento');
  assert.ok(/veto eterno|fin/i.test(sinMomento.detalle), sinMomento.detalle);
});

test('solo_la_plataforma_para_lo_demas_se_espera', () => {
  // `parar` es exclusivo del castigo firme.
  const porTecho = regulador.decidir(base({ gastado: 200 }));
  assert.strictEqual(porTecho.decision, 'esperar', 'el techo agotado se espera: se repone');
  assert.strictEqual(porTecho.razon, 'techo_agotado');
  assert.strictEqual(porTecho.hasta, '2026-11-12T10:00:00Z', 'fin por defecto: la ventana del dia');
  assert.strictEqual(porTecho.fin_declarado, 'por_defecto');

  const porTechoConReposicion = regulador.decidir(base({ gastado: 200, techo_hasta: '2026-11-11T23:59:00Z' }));
  assert.strictEqual(porTechoConReposicion.hasta, '2026-11-11T23:59:00Z');
  assert.strictEqual(porTechoConReposicion.fin_declarado, 'techo');

  const porOcupada = regulador.decidir(base({ cola: { en_curso: 't-1' } }));
  assert.strictEqual(porOcupada.decision, 'esperar');
  assert.strictEqual(porOcupada.razon, 'cuenta_ocupada');
  assert.strictEqual(porOcupada.hasta, '2026-11-11T10:30:00Z', 'una cuenta ocupada veta 30 min, no un dia');
  assert.strictEqual(porOcupada.fin_declarado, 'por_defecto');

  const porTurno = regulador.decidir(base({ cola: { adelanta: 't-2' } }));
  assert.strictEqual(porTurno.decision, 'esperar');
  assert.strictEqual(porTurno.razon, 'no_es_su_turno');

  const porEspera = regulador.decidir(base({ ultima_accion_en: M0, momento: '2026-11-11T09:05:00Z' }));
  assert.strictEqual(porEspera.decision, 'esperar');
  assert.strictEqual(porEspera.razon, 'en_espera');
  assert.strictEqual(porEspera.fin_declarado, 'espera');
  assert.strictEqual(porEspera.hasta, '2026-11-11T09:20:00Z', 'pausa de 20 min tras publicar');
});

// ---------------------------------------------------------------------------
// 4 · la duda baja el ritmo y no para
// ---------------------------------------------------------------------------

test('la_senal_dudosa_baja_el_ritmo_y_no_para', () => {
  const sinSenal = base({ conservaduria: 100, gastado: 0 });   // techo 20
  const conDuda = base({
    conservaduria: 100,
    gastado: 6,                                                // quedan 14
    castigo: { clase: 'dudosa', fin: M2, fin_origen: 'por_defecto' }
  });

  // Publicar cuesta 12: cabe en los 14 que quedan, pero NO en la mitad (7).
  assert.strictEqual(ritmo.coste_de('publicar'), 12);
  assert.strictEqual(ritmo.perfil(100).techo_diario - 6, 14);

  const v = regulador.decidir(conDuda);
  assert.strictEqual(v.decision, 'esperar', 'con la duda recortada a la mitad, ya no cabe');
  assert.strictEqual(v.razon, 'castigo_dudoso');
  assert.notStrictEqual(v.decision, 'parar', 'una duda NUNCA para la cuenta');
  assert.strictEqual(v.bajado, true);
  assert.strictEqual(v.restante_util, 7, 'la duda deja la mitad del presupuesto');
  assert.strictEqual(v.hasta, M2, 'se espera hasta el fin de la duda');
  assert.strictEqual(v.fin_declarado, 'por_defecto');

  // Y cuando SI cabe, sigue... con menos margen y el doble de espera.
  const cabe = regulador.decidir(base({
    conservaduria: 100,
    gastado: 0,
    accion: 'leer',
    castigo: { clase: 'dudosa', fin: M2, fin_origen: 'por_defecto' },
    ultima_accion_en: null
  }));
  assert.strictEqual(cabe.decision, 'seguir', 'la duda no impide trabajar: solo va mas despacio');
  assert.strictEqual(cabe.bajado, true);
  assert.strictEqual(cabe.restante, 20);
  assert.strictEqual(cabe.restante_util, 10, 'la mitad del techo');
  assert.strictEqual(cabe.espera.minutos, 60, 'pausa minima 30 x 2 por la duda');

  // El doble de espera se nota de verdad: con la pausa normal ya habria pasado,
  // con la doble todavia no.
  const esperando = regulador.decidir(base({
    conservaduria: 100,
    gastado: 0,
    accion: 'pulso',
    castigo: { clase: 'dudosa', fin: M2 },
    ultima_accion_en: M1,
    momento: '2026-11-11T10:40:00Z'
  }));
  assert.strictEqual(esperando.decision, 'esperar');
  assert.strictEqual(esperando.razon, 'en_espera');
  assert.strictEqual(esperando.hasta, '2026-11-11T11:00:00Z', '30 x 2 = 60 min desde la ultima accion');

  // La duda tambien se traga un texto raro de verdad: se conecta con G2.
  const juicio = castigo.juzgar({ texto: 'Ha ocurrido un error inesperado' }, { momento: M1 });
  const desdeG2 = regulador.decidir(base({ conservaduria: 100, gastado: 18, castigo: juicio }));
  assert.strictEqual(juicio.clase, 'dudosa');
  assert.strictEqual(desdeG2.decision, 'esperar');
  assert.notStrictEqual(desdeG2.decision, 'parar');
  assert.ok(desdeG2.hasta, 'aunque haya salido de un texto, la duda trae fin');
});

// ---------------------------------------------------------------------------
// 5 · lo que no produce veredicto
// ---------------------------------------------------------------------------

test('sin_precio_o_sin_momento_no_hay_veredicto', () => {
  const sinPrecio = regulador.decidir(base({ accion: 'teleportar' }));
  assert.strictEqual(sinPrecio.ok, false);
  assert.strictEqual(sinPrecio.motivo, 'accion_desconocida');
  assert.deepStrictEqual(sinPrecio.invalidos, ['accion']);
  assert.ok(sinPrecio.acciones.includes('publicar'), 'dice cuales valen');
  assert.strictEqual(sinPrecio.decision, undefined, 'no se inventa un veredicto');

  const sinAccion = regulador.decidir(base({ accion: undefined }));
  assert.strictEqual(sinAccion.ok, false);
  assert.strictEqual(sinAccion.motivo, 'accion_desconocida');

  // La accion tambien puede venir dentro del trabajo.
  const desdeTrabajo = regulador.decidir(base({
    accion: undefined,
    trabajo: { id: 't-1', secuencia: 1, accion: 'leer', quien: 'dueno', estado: 'nuevo' }
  }));
  assert.strictEqual(desdeTrabajo.ok, true, desdeTrabajo.motivo);
  assert.strictEqual(desdeTrabajo.accion, 'leer');
  assert.strictEqual(desdeTrabajo.coste, 2);

  const basura = regulador.decidir('no-es-un-objeto');
  assert.strictEqual(basura.ok, false);
  assert.strictEqual(basura.motivo, 'sin_momento');
});

test('el_regulador_no_lee_el_reloj_y_sus_numeros_salen_de_G1_y_G5', () => {
  const original = Date.now;
  Date.now = () => { throw new Error('G6 no puede leer el reloj'); };
  try {
    const v = regulador.decidir(base({ conservaduria: 100, gastado: 0 }));
    assert.strictEqual(v.ok, true, v.motivo);
    assert.strictEqual(v.techo, 20, 'el techo sale de G1 con la conservaduria de G5');
    assert.strictEqual(v.perfil, 'maximo_conservador');
    assert.strictEqual(v.margen, 8, '20 - 12 = 8');
    assert.strictEqual(v.espera.minutos, 30, 'la pausa del perfil, no una constante escondida');
  } finally {
    Date.now = original;
  }

  // Mismo payload, mismo veredicto (incluido el `porque`).
  const a = JSON.stringify(regulador.decidir(base({ gastado: 5 })));
  const b = JSON.stringify(regulador.decidir(base({ gastado: 5 })));
  assert.strictEqual(a, b);

  // Sin conservaduria, se arranca conservador: no hay "perfil comodo" por defecto.
  const sinDato = regulador.decidir(base({ conservaduria: undefined, gastado: 0 }));
  assert.strictEqual(sinDato.perfil, 'maximo_conservador');
  assert.strictEqual(sinDato.conservaduria, ritmo.CONSERVADURIA_MAXIMA);

  // Una clase de castigo desconocida se lee como dudosa (fallar hacia el ritmo).
  const raro = regulador.decidir(base({ castigo: { clase: 'regular' }, gastado: 110 }));
  assert.strictEqual(raro.castigo.clase, 'dudosa');
  assert.strictEqual(raro.decision, 'esperar');
  assert.notStrictEqual(raro.decision, 'parar');
});

// ---------------------------------------------------------------------------
// 6 · la sintesis, con los cinco inputs leidos de una cuenta de verdad
// ---------------------------------------------------------------------------

test('la_sintesis_lee_los_cinco_inputs_de_una_cuenta_real', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'enki-regulador-'));
  try {
    const m = crear({ directorio: dir });
    const alta = (opts = {}) => Object.assign({
      proyecto: 'proy-a', cuenta: '@taller_a', aparato: 'movil-1',
      momento: M1, quien: 'dueno', accion: 'publicar', motivo: 'post del martes'
    }, opts);
    const tolerado = (opts = {}) => Object.assign({
      proyecto: 'proy-a', cuenta: '@taller_a', aparato: 'movil-1',
      momento: M1, quien: 'dueno', detalle: 'salio bien'
    }, opts);

    // G5 · cuenta nueva: el techo mas bajo de la tabla, sin que nadie lo diga.
    const t = await m.toleranciaDe({ cuenta: '@taller_a' });
    assert.strictEqual(t.ok, true, t.motivo);
    assert.strictEqual(t.origen, 'cuenta_nueva');
    assert.strictEqual(t.conservaduria, 100);

    // 1 · con la cuenta vacia y el presupuesto entero, se puede publicar.
    let v = await m.decidirPaso({ cuenta: '@taller_a', accion: 'publicar', momento: M1 });
    assert.strictEqual(v.ok, true, v.motivo);
    assert.strictEqual(v.decision, 'seguir');
    assert.strictEqual(v.techo, 20);
    assert.strictEqual(v.margen, 8);
    assert.strictEqual(v.tolerancia.conservaduria, 100);
    assert.strictEqual(v.gastado_declarado, false, 'el cero no vino declarado: no se disfraza de medido');

    // 2 · G3 · un trabajo en curso OCUPA la cuenta: la sintesis lo ve sin que se
    // lo digan y responde `esperar` (no `parar`: una cuenta ocupada se espera).
    const encolado = await m.encolar(alta());
    assert.strictEqual(encolado.ok, true, encolado.motivo);
    const tomado = await m.tomar({ cuenta: '@taller_a', momento: M1 });
    assert.strictEqual(tomado.ok, true, tomado.motivo);

    v = await m.decidirPaso({ cuenta: '@taller_a', accion: 'publicar', momento: M2, gastado: 0 });
    assert.strictEqual(v.decision, 'esperar');
    assert.strictEqual(v.razon, 'cuenta_ocupada');
    assert.strictEqual(v.turno.en_curso, tomado.trabajo.id);
    assert.ok(v.hasta, 'y con fin: la cuenta ocupada veta 30 min, no un dia');

    // 3 · G2 + G6 · una senal firme en crudo gana a todo lo demas: para.
    v = await m.decidirPaso({
      cuenta: '@taller_a',
      accion: 'publicar',
      momento: M2,
      gastado: 0,
      senal: { texto: 'Tu cuenta ha sido restringida durante 24 horas' }
    });
    assert.strictEqual(v.decision, 'parar', `la senal firme manda: ${v.razon}`);
    assert.strictEqual(v.razon, 'castigo_firme');
    assert.strictEqual(v.castigo.clase, 'firme');
    assert.strictEqual(v.hasta, '2026-11-12T12:00:00Z', 'las 24 horas del texto, desde el momento de lectura');

    // 4 · la cuenta se libera al cerrar, y el margen se gana con hechos tolerados.
    const cerrado = await m.cerrar({ id: tomado.trabajo.id, desenlace: 'hecho', momento: M2 });
    assert.strictEqual(cerrado.ok, true, cerrado.motivo);

    for (let i = 0; i < 12; i += 1) {
      const r = await m.anotarTolerado(tolerado({ momento: M2 }));
      assert.strictEqual(r.ok, true, r.motivo);
    }
    v = await m.decidirPaso({ cuenta: '@taller_a', accion: 'publicar', momento: M2, gastado: 0 });
    assert.strictEqual(v.tolerancia.conservaduria, 64);
    assert.strictEqual(v.perfil, 'conservador');
    assert.strictEqual(v.techo, 40, 'G1 con la conservaduria que G5 ha derivado');

    // 5 · G4 · con dos pendientes, el que adelanta es el que toca (publicar del
    // dueno), y la sintesis lo nombra en vez de decidir por su cuenta.
    await m.encolar(alta({ accion: 'leer', momento: M2, quien: 'agente' }));
    const propuesto = await m.encolar(alta({ accion: 'leer', momento: M2, quien: 'agente' }));
    assert.strictEqual(propuesto.ok, true, propuesto.motivo);
    v = await m.decidirPaso({
      cuenta: '@taller_a',
      momento: M2,
      gastado: 0,
      trabajo: propuesto.trabajo
    });
    assert.strictEqual(v.decision, 'esperar');
    assert.strictEqual(v.razon, 'no_es_su_turno');
    assert.ok(v.turno.adelanta, 'dice quien va delante (G4)');
    assert.notStrictEqual(v.turno.adelanta, propuesto.trabajo.id);

    // 6 · el presupuesto declarado se respeta y se dice que vino declarado.
    v = await m.decidirPaso({ cuenta: '@taller_a', accion: 'publicar', momento: M2, gastado: 39 });
    assert.strictEqual(v.gastado_declarado, true);
    assert.strictEqual(v.gastado, 39);
    assert.strictEqual(v.restante, 1);
    assert.strictEqual(v.decision, 'esperar');
    assert.strictEqual(v.razon, 'techo_agotado');

    // 7 · una cuenta sin historial no hereda el margen de otra (estado por cuenta).
    const otra = await m.decidirPaso({ cuenta: '@taller_b', accion: 'publicar', momento: M2 });
    assert.strictEqual(otra.tolerancia.conservaduria, 100);
    assert.strictEqual(otra.techo, 20, 'la cuenta B arranca conservadora aunque la A tenga margen');

    // 8 · y todo esto ha quedado escrito donde toca.
    const foto = m.foto();
    assert.strictEqual(foto.cola.trabajos.length, 2);
    assert.strictEqual(foto.cola.historial.length, 1);
    assert.strictEqual(foto.tolerancia.asientos.length, 12);
    assert.strictEqual(foto.escrituras > 0, true);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__regulador] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__regulador] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
