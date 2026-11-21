'use strict';

/**
 * instagram-bridge · R4 · AvisoAnticipado (PUENTE)
 *
 * **UN aviso por causa y ventana.** Esta suite fija:
 *
 *   - el mismo (causa, ventana) avisa UNA vez: la segunda llamada no produce nada
 *     y lo dice (`ya_avisado`) — un aviso repetido entrena al dueno a ignorarlos;
 *   - la misma causa en OTRA ventana si vuelve a avisar: la ventana es lo que
 *     separa «esto ya te lo conte» de «esto sigue pasando»;
 *   - sin ventana NO se avisa: sin ella la anti-repeticion no existe, y las dos
 *     alternativas (repetirse siempre o no volver a darse nunca) son peores;
 *   - se cablea a `motor-avisos` REAL: el payload que publica este puente lo
 *     acepta el productor del repo (se comprueba llamandolo de verdad), y es el
 *     quien sube el aviso a `aviso-al-negocio`;
 *   - un aviso que NO salio (sin bus, productor mudo o productor que rechaza) NO
 *     se marca como dado: decir «ya avise» de un aviso que no salio es mentir;
 *   - la memoria se puede exportar (`avisados()`) y rehidratar (`sembrar()`),
 *     porque vive en RAM y quien quiera que dure la guarda;
 *   - nada de esto lanza.
 *
 * Ejecutar: node modules/instagram-bridge/tests/avisos.test.js
 */

const assert = require('assert');

const r4 = require('../puente/avisos');
const MotorAvisos = require('../../contabilidad-analitica/motor-avisos');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const PROYECTO = 'taller-ceramica';

/**
 * Bus de mentira con la forma del real, y con el PRODUCTOR REAL dentro: lo que
 * publica el puente lo contesta `motor-avisos` de verdad (no una respuesta
 * inventada para que el test pase).
 */
function busConMotorReal(eventBusDelMotor) {
  const suscripciones = {};
  const motor = new MotorAvisos();
  motor.eventBus = eventBusDelMotor || { publish: () => {} };

  return {
    publicados: [],
    publish(topic, payload) {
      this.publicados.push({ topic, payload });
      if (topic !== 'motor-avisos.producir.request') return;
      const responseTopic = 'motor-avisos.producir.response';
      Promise.resolve(motor.onProducirRequest({ data: payload })).then((resultado) => {
        const oyentes = suscripciones[responseTopic] || [];
        for (const fn of oyentes) fn({ data: { request_id: payload.request_id, ...resultado } });
      });
    },
    subscribe(topic, fn) {
      suscripciones[topic] = (suscripciones[topic] || []).concat([fn]);
      return () => { suscripciones[topic] = (suscripciones[topic] || []).filter((f) => f !== fn); };
    }
  };
}

function busMudo() {
  return {
    publicados: [],
    publish(topic, payload) { this.publicados.push({ topic, payload }); },
    subscribe() { return () => {}; }
  };
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('un_aviso_por_causa_y_ventana', async () => {
  const bus = busConMotorReal();
  const aviso = new r4.AvisoAnticipado({ bus });

  // Primera vez: avisa.
  const uno = await aviso.avisar({ causa: 'sesion_caida', ventana: '2026-11-11', project_id: PROYECTO });
  assert.strictEqual(uno.ok, true, uno.motivo);
  assert.strictEqual(uno.avisado, true);
  assert.strictEqual(uno.clave, 'sesion_caida::2026-11-11');
  assert.strictEqual(uno.productor, 'motor-avisos');
  assert.ok(uno.aviso_id && uno.aviso_id.startsWith('aviso_'), 'el productor real devuelve su aviso_id');

  // Segunda vez, mismo par: NO se produce otro aviso.
  const dos = await aviso.avisar({ causa: 'sesion_caida', ventana: '2026-11-11', project_id: PROYECTO });
  assert.strictEqual(dos.ok, true);
  assert.strictEqual(dos.avisado, false);
  assert.strictEqual(dos.motivo, 'ya_avisado');
  assert.strictEqual(dos.clave, uno.clave);
  assert.strictEqual(bus.publicados.filter((p) => p.topic === 'motor-avisos.producir.request').length, 1,
    'al productor se le pidio UNA vez');

  // Misma causa, otra ventana: eso ya es otro dia y si se avisa.
  const tres = await aviso.avisar({ causa: 'sesion_caida', ventana: '2026-11-12', project_id: PROYECTO });
  assert.strictEqual(tres.avisado, true);
  assert.strictEqual(tres.clave, 'sesion_caida::2026-11-12');

  // Otra causa, misma ventana: tambien, porque es otra cosa que contar.
  const cuatro = await aviso.avisar({ causa: 'rotura', ventana: '2026-11-11', project_id: PROYECTO });
  assert.strictEqual(cuatro.avisado, true);

  assert.deepStrictEqual(aviso.avisados(), [
    'sesion_caida::2026-11-11', 'sesion_caida::2026-11-12', 'rotura::2026-11-11'
  ]);
});

test('la_ventana_es_obligatoria_y_sin_ella_no_se_avisa', async () => {
  const bus = busConMotorReal();
  const aviso = new r4.AvisoAnticipado({ bus });

  const sinVentana = await aviso.avisar({ causa: 'rotura', project_id: PROYECTO });
  assert.strictEqual(sinVentana.ok, false, 'sin ventana no hay anti-repeticion, y sin ella no se avisa');
  assert.strictEqual(sinVentana.avisado, false);
  assert.strictEqual(sinVentana.motivo, 'sin_ventana');
  assert.strictEqual(bus.publicados.length, 0, 'al productor no se le molesta');

  const sinCausa = await aviso.avisar({ ventana: 'v1', project_id: PROYECTO });
  assert.strictEqual(sinCausa.ok, false);
  assert.strictEqual(sinCausa.motivo, 'sin_causa');

  const sinProyecto = await aviso.avisar({ causa: 'rotura', ventana: 'v1' });
  assert.strictEqual(sinProyecto.ok, false);
  assert.strictEqual(sinProyecto.motivo, 'sin_project_id');

  // La regla tambien se puede preguntar sin avisar.
  const decision = r4.debe_avisar(new Set(['rotura::v1']), 'rotura', 'v1');
  assert.strictEqual(decision.avisar, false);
  assert.strictEqual(decision.motivo, 'ya_avisado');
  assert.strictEqual(decision.clave, 'rotura::v1');
  assert.deepStrictEqual(r4.debe_avisar([], 'rotura', 'v1'), { avisar: true, clave: 'rotura::v1', motivo: 'avisado' });
  assert.strictEqual(r4.clave_de('', 'v1'), null);
});

test('se_cablea_a_motor_avisos_real_y_a_su_entrega', async () => {
  // El productor de verdad, con un bus propio que apunta lo que SUBE: el aviso
  // tiene que llegar a `aviso-al-negocio.entregar.request` (la entrega R1), no
  // quedarse dentro del motor.
  const subidos = [];
  const bus = busConMotorReal({ publish: (topic, payload) => subidos.push({ topic, payload }) });
  const aviso = new r4.AvisoAnticipado({ bus });

  const r = await aviso.avisar({
    causa: 'publicacion_no_salio',
    ventana: '2026-11-11',
    project_id: PROYECTO,
    detalle: 'La pieza de las tazas no aparece en la cuenta.'
  });
  assert.strictEqual(r.avisado, true, r.motivo);

  // Lo que se publica: el topic REAL y el payload que el productor acepta.
  const peticion = bus.publicados.find((p) => p.topic === 'motor-avisos.producir.request');
  assert.ok(peticion, 'no se pidio al productor real');
  assert.strictEqual(peticion.payload.project_id, PROYECTO);
  assert.strictEqual(peticion.payload.tipo, 'aviso');
  assert.strictEqual(peticion.payload.origen, 'instagram-bridge/aviso-anticipado');
  assert.strictEqual(peticion.payload.ref, 'publicacion_no_salio::2026-11-11');
  assert.strictEqual(peticion.payload.titulo, 'Una publicacion no ha salido');
  assert.deepStrictEqual(peticion.payload.senal, {
    causa: 'publicacion_no_salio',
    ventana: '2026-11-11',
    momento: null,
    ref: 'publicacion_no_salio::2026-11-11'
  });

  // Y la entrega: el motor sube el aviso al puente R1 (aviso-al-negocio), que es
  // quien lo lleva al canal. No se llama a adaptador-avisos desde aqui.
  const entrega = subidos.find((s) => s.topic === 'aviso-al-negocio.entregar.request');
  assert.ok(entrega, 'el aviso no se subio a la entrega de aviso-al-negocio');
  assert.strictEqual(entrega.payload.project_id, PROYECTO);
  assert.strictEqual(entrega.payload.aviso.aviso_id, r.aviso_id);
  assert.ok(subidos.some((s) => s.topic === 'contabilidad.aviso_producido'));
});

test('un_aviso_que_no_salio_no_se_marca_como_dado', async () => {
  // Sin bus: no se puede producir. No se marca, para poder reintentar.
  const sinBus = new r4.AvisoAnticipado({});
  const uno = await sinBus.avisar({ causa: 'rotura', ventana: 'v1', project_id: PROYECTO });
  assert.strictEqual(uno.ok, false);
  assert.strictEqual(uno.avisado, false);
  assert.strictEqual(uno.motivo, 'sin_productor');
  assert.deepStrictEqual(sinBus.avisados(), []);

  // Con bus mudo (nadie contesta): tampoco se marca.
  const mudo = new r4.AvisoAnticipado({ bus: busMudo(), timeout_ms: 20 });
  const dos = await mudo.avisar({ causa: 'rotura', ventana: 'v1', project_id: PROYECTO });
  assert.strictEqual(dos.ok, false);
  assert.strictEqual(dos.avisado, false);
  assert.strictEqual(dos.motivo, 'productor_no_contesto');
  assert.deepStrictEqual(mudo.avisados(), []);

  // Y cuando el bus vuelve, el aviso sale: no se quedo «avisado» por haberlo
  // intentado antes.
  const aviso = new r4.AvisoAnticipado({ bus: busConMotorReal() });
  const tres = await aviso.avisar({ causa: 'rotura', ventana: 'v1', project_id: PROYECTO });
  assert.strictEqual(tres.avisado, true);
});

test('un_productor_que_rechaza_tampoco_cuenta_como_avisado', async () => {
  const rechaza = new r4.AvisoAnticipado({
    productor: () => ({ ok: false, motivo: 'sin_senal' })
  });
  const r = await rechaza.avisar({ causa: 'otro', ventana: 'v1', project_id: PROYECTO });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.avisado, false);
  assert.strictEqual(r.motivo, 'sin_senal');
  assert.deepStrictEqual(rechaza.avisados(), []);
});

test('la_memoria_se_exporta_y_se_rehidrata', async () => {
  const primero = new r4.AvisoAnticipado({ bus: busConMotorReal() });
  await primero.avisar({ causa: 'rotura', ventana: 'v1', project_id: PROYECTO });
  const claves = primero.avisados();
  assert.deepStrictEqual(claves, ['rotura::v1']);

  // Tras un reinicio, el modulo no repite lo que ya se dijo.
  const segundo = new r4.AvisoAnticipado({ bus: busConMotorReal(), ya_avisados: claves });
  const repetido = await segundo.avisar({ causa: 'rotura', ventana: 'v1', project_id: PROYECTO });
  assert.strictEqual(repetido.avisado, false);
  assert.strictEqual(repetido.motivo, 'ya_avisado');

  // sembrar() tambien acepta un array y no duplica.
  const tercero = new r4.AvisoAnticipado({ bus: busConMotorReal() });
  assert.strictEqual(tercero.sembrar(['a::1', 'a::1', '', null]), 1);
  assert.deepStrictEqual(tercero.avisados(), ['a::1']);
});

test('causas_desconocidas_se_avisan_pero_se_declara_el_hueco', async () => {
  const aviso = new r4.AvisoAnticipado({ bus: busConMotorReal() });
  const r = await aviso.avisar({
    causa: 'causa_nueva_del_puente',
    ventana: 'v1',
    project_id: PROYECTO,
    titulo: 'Algo que el dueno tiene que saber'
  });
  assert.strictEqual(r.avisado, true);
  assert.ok(r.causa_abierta !== null, 'la causa fuera del catalogo se declara');

  const d = r4.describir();
  assert.strictEqual(d.regla, 'un aviso por causa y ventana');
  assert.strictEqual(d.productor, 'motor-avisos.producir.request (real) → aviso-al-negocio → adaptador-avisos');
  assert.ok(d.causas.includes('sesion_caida'));
  assert.ok(d.causas.includes('publicacion_no_salio'));
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__avisos] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__avisos] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
