'use strict';

/**
 * instagram-bridge · G4 · OrdenDePrioridad (REFLEJO)
 *
 * Cuando hay seis trabajos y solo cabe uno, el orden es una decision politica.
 * Esta suite fija las tres reglas del diseno y, tan importante como ellas, que
 * ninguna regla de abajo pueda volcarlas:
 *   - lo EMPEZADO gana a lo nuevo (un trabajo a medias ya movio el mundo);
 *   - el DUENO gana al agente (el puente es del dueno);
 *   - PUBLICAR gana a leer (una publicacion preparada caduca; leer no);
 *   - la urgencia desempata, pero jamas asciende por encima de esas tres;
 *   - el orden es TOTAL: siempre hay uno primero, y siempre el mismo.
 *
 * Ejecutar: node modules/instagram-bridge/tests/prioridad.test.js
 */

const assert = require('assert');

const prioridad = require('../core/prioridad');
const ritmo = require('../core/ritmo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function trabajo(opts = {}) {
  return Object.assign({
    id: 't-1',
    secuencia: 1,
    accion: 'publicar',
    quien: 'dueno',
    estado: 'nuevo',
    urgencia: 0
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · las tres reglas
// ---------------------------------------------------------------------------

test('lo_empezado_gana_a_lo_nuevo_y_el_dueno_al_agente', () => {
  // --- lo empezado gana a lo nuevo ---------------------------------------
  const nuevo = trabajo({ id: 'nuevo', secuencia: 1, estado: 'nuevo' });
  const empezado = trabajo({ id: 'empezado', secuencia: 9, estado: 'empezado' });

  const c1 = prioridad.comparar(empezado, nuevo);
  assert.strictEqual(c1.ok, true);
  assert.strictEqual(c1.orden, -1, 'lo empezado va antes aunque llegara despues');
  assert.strictEqual(c1.razon, 'empezado', 'y dice que decidio: empezado');
  assert.ok(prioridad.peso(empezado) > prioridad.peso(nuevo));
  assert.strictEqual(prioridad.primero([nuevo, empezado]).id, 'empezado');
  assert.strictEqual(prioridad.es_mejor(empezado, nuevo), true);
  assert.strictEqual(prioridad.es_mejor(nuevo, empezado), false);

  // ... y ni la urgencia maxima ni ser del dueno lo desbancan.
  const nuevoUrgenteDueno = trabajo({ id: 'urgente', secuencia: 0, estado: 'nuevo', urgencia: 3, quien: 'dueno' });
  assert.strictEqual(prioridad.primero([nuevoUrgenteDueno, empezado]).id, 'empezado',
    'un trabajo empezado por el agente gana a uno nuevo y urgente del dueno');

  // --- el dueno gana al agente -------------------------------------------
  const delDueno = trabajo({ id: 'dueno', secuencia: 8, quien: 'dueno' });
  const delAgente = trabajo({ id: 'agente', secuencia: 1, quien: 'agente' });

  const c2 = prioridad.comparar(delDueno, delAgente);
  assert.strictEqual(c2.orden, -1, 'lo del dueno va antes aunque llegara despues');
  assert.strictEqual(c2.razon, 'quien');
  assert.strictEqual(prioridad.primero([delAgente, delDueno]).id, 'dueno');

  // El sistema no es el dueno: no se cuela por delante de el.
  const delSistema = trabajo({ id: 'sistema', secuencia: 0, quien: 'sistema' });
  assert.strictEqual(prioridad.comparar(delDueno, delSistema).orden, -1);

  // --- publicar gana a leer ----------------------------------------------
  const publicar = trabajo({ id: 'publicar', secuencia: 7, accion: 'publicar' });
  const leer = trabajo({ id: 'leer', secuencia: 2, accion: 'leer' });

  const c3 = prioridad.comparar(publicar, leer);
  assert.strictEqual(c3.orden, -1, 'publicar va antes que leer aunque llegara despues');
  assert.strictEqual(c3.razon, 'accion');
  assert.strictEqual(prioridad.primero([leer, publicar]).id, 'publicar');

  const pulso = trabajo({ id: 'pulso', secuencia: 0, accion: 'pulso' });
  assert.strictEqual(prioridad.primero([pulso, leer]).id, 'leer', 'leer gana al pulso');
});

test('la_urgencia_desempata_pero_no_asciende_por_encima_de_las_tres_reglas', () => {
  // Urgencia 3 = 15 puntos. Las tres reglas valen 50, 100 y 1000: ninguna
  // urgencia puede comprar el sitio de arriba. Ese limite es la garantia.
  assert.strictEqual(prioridad.PESOS.urgencia * prioridad.PESOS.urgencia_maxima,
    prioridad.PESOS.urgencia * 3);
  assert.ok(prioridad.PESOS.urgencia * prioridad.PESOS.urgencia_maxima < prioridad.PESOS.accion.leer,
    'la urgencia maxima no puede valer mas que la regla mas barata (leer)');

  // Entre iguales, la urgencia si decide.
  const flojo = trabajo({ id: 'flojo', secuencia: 1, accion: 'comentar', urgencia: 0 });
  const urgente = trabajo({ id: 'urgente', secuencia: 2, accion: 'comentar', urgencia: 3 });
  const c = prioridad.comparar(urgente, flojo);
  assert.strictEqual(c.orden, -1);
  assert.strictEqual(c.razon, 'urgencia');

  // ... pero no asciende por encima de publicar.
  const leerUrgente = trabajo({ id: 'leer-urgente', secuencia: 0, accion: 'leer', urgencia: 3 });
  const comentarTranquilo = trabajo({ id: 'comentar', secuencia: 9, accion: 'comentar', urgencia: 0 });
  assert.strictEqual(prioridad.primero([leerUrgente, comentarTranquilo]).id, 'comentar',
    'comentar (30) sigue por delante de leer (10), aunque leer venga con urgencia 3');

  // ... ni hace que un trabajo del agente pase por delante del dueno.
  const agenteUrgente = trabajo({ id: 'agente-urgente', secuencia: 0, quien: 'agente', urgencia: 3 });
  const duenoTranquilo = trabajo({ id: 'dueno-tranquilo', secuencia: 9, quien: 'dueno', urgencia: 0 });
  assert.strictEqual(prioridad.primero([agenteUrgente, duenoTranquilo]).id, 'dueno-tranquilo');

  // Una urgencia fuera de rango se recorta, no explota.
  assert.strictEqual(prioridad.urgencia_de({ urgencia: 99 }), prioridad.PESOS.urgencia_maxima);
  assert.strictEqual(prioridad.urgencia_de({ urgencia: -5 }), 0);
  assert.strictEqual(prioridad.urgencia_de({}), 0);
});

// ---------------------------------------------------------------------------
// 2 · el orden es total y reproducible
// ---------------------------------------------------------------------------

test('el_orden_es_total_y_reproducible', () => {
  // Dos trabajos identicos en todo salvo la llegada: gana el que llego antes.
  const a = trabajo({ id: 'a', secuencia: 1, accion: 'leer' });
  const b = trabajo({ id: 'b', secuencia: 2, accion: 'leer' });
  assert.strictEqual(prioridad.comparar(a, b).razon, 'antiguedad');
  assert.strictEqual(prioridad.primero([b, a]).id, 'a', 'FIFO: primero llego, primero se hace');

  // Mismo trabajo = empate declarado (no un orden inventado).
  assert.strictEqual(prioridad.comparar(a, a).razon, 'identico');
  assert.strictEqual(prioridad.comparar(a, a).orden, 0);

  // La simetria del comparador.
  const pares = [
    [trabajo({ id: 'x', secuencia: 1 }), trabajo({ id: 'y', secuencia: 2, quien: 'agente' })],
    [trabajo({ id: 'x', secuencia: 3, accion: 'leer' }), trabajo({ id: 'y', secuencia: 1, accion: 'publicar' })],
    [trabajo({ id: 'x', secuencia: 1, estado: 'en_curso' }), trabajo({ id: 'y', secuencia: 2 })]
  ];
  for (const [p, q] of pares) {
    assert.strictEqual(prioridad.comparar(p, q).orden, -prioridad.comparar(q, p).orden,
      `el comparador tiene que ser antisimetrico: ${p.id} vs ${q.id}`);
  }

  // Con seis trabajos, el orden es el mismo siempre y no depende del array de entrada.
  const lista = [
    trabajo({ id: 't1', secuencia: 1, accion: 'pulso', quien: 'agente' }),
    trabajo({ id: 't2', secuencia: 2, accion: 'leer', quien: 'agente' }),
    trabajo({ id: 't3', secuencia: 3, accion: 'publicar', quien: 'agente' }),
    trabajo({ id: 't4', secuencia: 4, accion: 'responder', quien: 'dueno' }),
    trabajo({ id: 't5', secuencia: 5, accion: 'pulso', quien: 'agente', estado: 'empezado' }),
    trabajo({ id: 't6', secuencia: 6, accion: 'leer', quien: 'dueno', urgencia: 2 })
  ];
  const uno = prioridad.ordenar(lista).orden.map((t) => t.id);
  const dos = prioridad.ordenar(lista.slice().reverse()).orden.map((t) => t.id);
  assert.deepStrictEqual(uno, dos, 'el orden no puede depender de como llegue la lista');
  assert.deepStrictEqual(uno, ['t5', 't4', 't6', 't3', 't2', 't1'],
    'empezado > dueno > publicar > leer urgente > leer > pulso');
});

test('un_trabajo_invalido_no_se_cuela_al_principio', () => {
  const roto = { id: 'roto', accion: 'teleportar', quien: 'dueno', secuencia: 0 };
  const bueno = trabajo({ id: 'bueno', secuencia: 9 });

  const v = prioridad.validar(roto);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.motivo, 'trabajo_invalido');
  assert.deepStrictEqual(v.invalidos, ['accion'], 'dice QUE campo no vale');

  assert.strictEqual(prioridad.validar({}).ok, false);
  assert.deepStrictEqual(prioridad.validar({}).faltan.sort(), ['accion', 'id', 'quien', 'secuencia']);

  const orden = prioridad.ordenar([roto, bueno]);
  assert.deepStrictEqual(orden.orden.map((t) => t.id), ['bueno']);
  assert.deepStrictEqual(orden.descartados.map((t) => t.id), ['roto']);
  assert.strictEqual(orden.ok, false, 'con descartes el orden avisa');

  assert.strictEqual(prioridad.primero([roto]), null, 'un invalido no es "el primero"');
  assert.strictEqual(prioridad.ordenar('no-es-lista').ok, false);
  assert.strictEqual(prioridad.comparar(roto, bueno).ok, false);
});

test('adelanta_a_dice_quien_va_delante_sin_explicar_la_escala', () => {
  const mio = trabajo({ id: 'mio', secuencia: 5, accion: 'leer', quien: 'agente' });
  const otro = trabajo({ id: 'otro', secuencia: 6, accion: 'publicar', quien: 'agente' });

  const adelanta = prioridad.adelanta_a(mio, [mio, otro]);
  assert.ok(adelanta, 'publicar va por delante de leer');
  assert.strictEqual(adelanta.id, 'otro');
  assert.strictEqual(prioridad.comparar(adelanta, mio).razon, 'accion');

  assert.strictEqual(prioridad.adelanta_a(otro, [mio, otro]), null, 'el que va primero no tiene a nadie delante');
  assert.strictEqual(prioridad.adelanta_a(mio, [mio]), null, 'solo no tiene a nadie delante');
});

test('toda_accion_de_la_tabla_de_G1_tiene_su_peso_aqui', () => {
  // Si G1 anade una accion y G4 no la conoce, esa accion nunca gana un turno.
  for (const accion of ritmo.ACCIONES) {
    const t = trabajo({ accion });
    assert.strictEqual(prioridad.validar(t).ok, true, `${accion} tiene que ser ordenable`);
    assert.strictEqual(typeof prioridad.peso(t), 'number');
  }
  assert.ok(prioridad.PESOS.accion.publicar > prioridad.PESOS.accion.leer);
  assert.strictEqual(prioridad.PESOS.accion.pulso, 0, 'el pulso no adelanta a nadie');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__prioridad] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__prioridad] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
