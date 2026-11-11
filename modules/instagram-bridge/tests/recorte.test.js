'use strict';

/**
 * instagram-bridge · M3 · RecorteDePrivacidad (REFLEJO)
 *
 * Minimizar ANTES de guardar. Esta suite fija la frase del diseno como una
 * propiedad comprobable:
 *
 *   **lo que no se guardo no hay que borrarlo**
 *
 * El recorrido de la prueba es el argumento entero:
 *   1. el hecho crudo trae correo, telefono, DNI e historial;
 *   2. `recortar` lo deja limpio ANTES de escribir, y nombra cada descarte;
 *   3. `auditar` del recortado no encuentra ni un exceso (y del crudo si: la
 *      alarma no es decorativa);
 *   4. `olvidar` sobre el recortado no encuentra nada que borrar — porque no
 *      hay nada. Ese "no habia nada" es la prueba.
 *
 * Y ademas: el recorte no deja la pieza inservible (se puede responder), no
 * reescribe lo que la persona dijo, y no inventa identificadores.
 *
 * Ejecutar: node modules/instagram-bridge/tests/recorte.test.js
 */

const assert = require('assert');

const m3 = require('../core/recorte');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function sello() {
  return { proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'movil-1', momento: '2026-11-11T12:00:00Z', quien: 'dueno' };
}

/** El hecho tal como lo trae el aparato: con todo lo que NO se debe guardar. */
function hecho_crudo(opts = {}) {
  return Object.assign({
    sello: sello(),
    cuenta: 'taller_a',
    plataforma: 'instagram',
    conversacion_id: 'dm-77',
    mensaje_id: 'm-9001',
    remitente: 'maria.ceramica',
    texto: 'Hola, ¿queda plaza para el sabado? Mi correo es maria@ejemplo.com por si acaso.',
    momento: '2026-11-11T11:59:00Z',
    tipo: 'dm',
    // --- lo que no debe sobrevivir ---
    correo: 'maria@ejemplo.com',
    telefono: '+34 611 22 33 44',
    dni: '12345678Z',
    direccion: 'Calle Mayor 3, 2B',
    historial_de_mensajes: [{ id: 'm-1' }, { id: 'm-2' }],
    seguidores: 1843,
    nombre_completo: 'Maria Lopez Garcia',
    ip: '10.0.0.7',
    pantalla: 'dm',
    mirada: 'completa',
    nodos: [{ id: 'n1', tipo: 'campo' }]
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('lo_que_no_se_guardo_no_hay_que_borrarlo', () => {
  const crudo = hecho_crudo();

  // --- 1 · se recorta ANTES de guardar ------------------------------------
  const r = m3.recortar(crudo);
  assert.strictEqual(r.ok, true, r.motivo);
  const guardado = r.hecho;

  // Los identificadores de terceros NO estan.
  for (const campo of ['correo', 'telefono', 'dni', 'direccion', 'historial_de_mensajes', 'seguidores', 'nombre_completo', 'ip']) {
    assert.strictEqual(guardado[campo], undefined, `"${campo}" no puede llegar al disco`);
  }
  // Y los del sobre del aparato tampoco.
  assert.strictEqual(guardado.pantalla, undefined);
  assert.strictEqual(guardado.nodos, undefined);

  // Se nombra cada descarte con su motivo: no hay campos "que desaparecieron".
  const descartados = Object.fromEntries(guardado.descartado.map((d) => [d.campo, d.motivo]));
  assert.strictEqual(descartados.correo, 'identificador_de_tercero');
  assert.strictEqual(descartados.telefono, 'identificador_de_tercero');
  assert.strictEqual(descartados.dni, 'identificador_de_tercero');
  assert.strictEqual(descartados.historial_de_mensajes, 'historial');
  assert.strictEqual(descartados.nombre_completo, 'dato_sensible');
  assert.strictEqual(descartados.pantalla, 'fuera_de_la_lista');
  assert.strictEqual(guardado.descartado.length, Object.keys(crudo).length - guardado.conservado.length);

  // --- 2 · lo necesario para responder SI esta ---------------------------
  assert.strictEqual(guardado.remitente, 'maria.ceramica');
  assert.strictEqual(guardado.conversacion_id, 'dm-77');
  assert.strictEqual(guardado.mensaje_id, 'm-9001');
  assert.strictEqual(guardado.momento, '2026-11-11T11:59:00Z');
  assert.strictEqual(guardado.cuenta, 'taller_a');
  assert.strictEqual(guardado.puede_responder, true, 'el recorte no deja la pieza inservible');
  assert.deepStrictEqual(guardado.faltan, []);

  // --- 3 · el texto NO se reescribe: se anota ----------------------------
  assert.strictEqual(guardado.texto, crudo.texto, 'recortar el mensaje seria cambiar lo que dijo');
  const avisos = guardado.avisos.map((a) => a.forma);
  assert.ok(avisos.includes('correo'), `el correo dentro del texto se avisa: ${JSON.stringify(avisos)}`);
  assert.strictEqual(guardado.avisos[0].campo, 'texto');
  // El aviso nombra la forma, NO copia el valor: no se cuela por el informe.
  assert.strictEqual(JSON.stringify(guardado.avisos).includes('maria@ejemplo.com'), false);

  // --- 4 · la auditoria del recortado sale limpia ------------------------
  const auditado = m3.auditar(guardado);
  assert.strictEqual(auditado.ok, true, `excesos: ${JSON.stringify(auditado.excesos)}`);
  assert.deepStrictEqual(auditado.excesos, []);

  // --- 5 · y sobre el CRUDO encuentra los excesos (la alarma no es falsa) -
  const delCrudo = m3.auditar(crudo);
  assert.strictEqual(delCrudo.ok, false);
  const excesos = Object.fromEntries(delCrudo.excesos.map((e) => [e.campo, e.motivo]));
  assert.strictEqual(excesos.correo, 'identificador_de_tercero');
  assert.strictEqual(excesos.dni, 'identificador_de_tercero');
  assert.strictEqual(excesos.historial_de_mensajes, 'historial');

  // --- 6 · LO QUE NO SE GUARDO NO HAY QUE BORRARLO -----------------------
  // Primero, lo que NO hay: los ocho campos del exceso no existen en el
  // guardado, asi que "borrarlos" no es un paso pendiente en ningun sitio.
  const excesos_posibles = ['correo', 'telefono', 'dni', 'direccion', 'historial_de_mensajes', 'seguidores', 'nombre_completo', 'ip'];

  // Olvidar a la persona borra SOLO el minimo que se conservo. Ni uno mas:
  // nada del exceso aparece en la lista porque nunca llego a existir.
  const olvido = m3.olvidar(guardado, { remitente: 'maria.ceramica' }, 'peticion_de_la_persona');
  assert.strictEqual(olvido.ok, true);
  assert.strictEqual(olvido.habia_algo, true);
  assert.deepStrictEqual(olvido.borrados, ['remitente', 'texto', 'conversacion_id', 'mensaje_id']);
  for (const campo of excesos_posibles) {
    assert.ok(!olvido.borrados.includes(campo), `"${campo}" no se borra: no estaba`);
  }
  assert.strictEqual(olvido.retrato.remitente, undefined);
  assert.strictEqual(olvido.retrato.momento, '2026-11-11T11:59:00Z', 'lo que no es de la persona no se toca');

  // Y una segunda peticion de olvido no encuentra NADA: ya no queda nada de
  // Maria que borrar, porque nunca se guardo mas que lo justo.
  const segundo = m3.olvidar(olvido.retrato, { remitente: 'maria.ceramica' }, 'peticion_reiterada');
  assert.strictEqual(segundo.ok, true);
  assert.strictEqual(segundo.habia_algo, false);
  assert.strictEqual(segundo.motivo, 'no_habia_nada');

  // Olvidar a alguien que no esta en este retrato no toca el retrato.
  const otro = m3.olvidar(guardado, { remitente: 'pedro.otro' }, 'peticion_de_la_persona');
  assert.strictEqual(otro.habia_algo, false);
  assert.strictEqual(otro.retrato.remitente, 'maria.ceramica');

  // El contraste que demuestra que `olvidar` no es decorativo.
  const crudoGuardado = { remitente: 'maria.ceramica', texto: 'hola', conversacion_id: 'dm-77', momento: '2026-11-11T11:59:00Z' };
  const conAlgo = m3.olvidar(crudoGuardado, undefined, 'peticion_de_la_persona');
  assert.strictEqual(conAlgo.habia_algo, true);
  assert.deepStrictEqual(conAlgo.borrados, ['remitente', 'texto', 'conversacion_id']);
  assert.strictEqual(conAlgo.retrato.remitente, undefined);
});

// ---------------------------------------------------------------------------
// 2 · el recorte tampoco se pasa de listo
// ---------------------------------------------------------------------------

test('el_recorte_no_deja_mudo_ni_inventa_identificadores', () => {
  // Sin remitente ni texto no hay respuesta posible: se dice, no se rellena.
  const sinNada = m3.recortar({ cuenta: 'taller_a', conversacion_id: 'dm-1', correo: 'x@y.com' });
  assert.strictEqual(sinNada.ok, true);
  assert.strictEqual(sinNada.hecho.puede_responder, false);
  assert.deepStrictEqual(sinNada.faltan, ['remitente', 'texto']);
  assert.strictEqual(sinNada.hecho.remitente, undefined, 'no se inventa un remitente');

  // Un campo que no esta en la tabla se descarta y se nombra: no se "arregla".
  const conCampoRaro = m3.recortar({ cuenta: 'a', remitente: 'b', conversacion_id: 'c', texto: 'd', cupon: 'VERANO10' });
  assert.strictEqual(conCampoRaro.hecho.cupon, undefined);
  assert.strictEqual(conCampoRaro.hecho.descartado.find((d) => d.campo === 'cupon').motivo, 'fuera_de_la_lista');

  // Un campo extra declarado por el proyecto se conserva, y la auditoria lo ve.
  const conExtra = m3.recortar({ cuenta: 'a', remitente: 'b', conversacion_id: 'c', texto: 'd', pedido_id: 'p-1' }, { campos_extra: ['pedido_id'] });
  assert.strictEqual(conExtra.hecho.pedido_id, 'p-1');
  assert.ok(conExtra.hecho.conservado.includes('pedido_id'));

  // Un telefono metido en un campo permitido (no el texto) SI se detecta.
  const telefonoEnRemitente = { cuenta: 'a', remitente: '+34611223344', conversacion_id: 'c', texto: 'hola' };
  const auditado = m3.auditar(telefonoEnRemitente);
  assert.strictEqual(auditado.ok, false);
  assert.strictEqual(auditado.excesos[0].campo, 'remitente');
  assert.strictEqual(auditado.excesos[0].forma, 'telefono');

  // Y un instante con digitos NO es un telefono: la auditoria no da falsos.
  const conInstante = m3.recortar({ cuenta: 'a', remitente: 'b', conversacion_id: 'c', texto: 'd', momento: '2026-11-11 12:00:00' });
  assert.deepStrictEqual(m3.auditar(conInstante.hecho).excesos, []);
});

// ---------------------------------------------------------------------------
// 3 · conservar un tercero exige motivo
// ---------------------------------------------------------------------------

test('conservar_un_tercero_exige_motivo_y_es_una_lista_cerrada', () => {
  assert.strictEqual(m3.conservar({ remitente: 'maria.ceramica' }, 'responder').conservar, true);
  assert.strictEqual(m3.conservar({ remitente: 'maria.ceramica' }, 'no_repetir').conservar, true);

  // Un motivo que no esta en la lista es un censo con otro nombre.
  const marketing = m3.conservar({ remitente: 'maria.ceramica' }, 'marketing');
  assert.strictEqual(marketing.conservar, false);
  assert.strictEqual(marketing.motivo, 'motivo_no_admitido');

  // Sin identificador no hay tercero al que conservar.
  const sinId = m3.conservar({}, 'responder');
  assert.strictEqual(sinId.conservar, false);
  assert.strictEqual(sinId.motivo, 'tercero_sin_identificador');

  // Olvidar sin motivo tampoco vale: borrar sin decir por que no es un derecho,
  // es un accidente.
  assert.strictEqual(m3.olvidar({ remitente: 'x' }, undefined, '').motivo, 'motivo_no_admitido');

  // La tabla de lo que se conserva es corta y cerrada.
  assert.deepStrictEqual(m3.MOTIVOS_PARA_CONSERVAR, ['responder', 'no_repetir']);
  assert.ok(m3.CAMPOS_QUE_SE_CONSERVAN.includes('remitente'));
  assert.ok(m3.CAMPOS_QUE_SE_CONSERVAN.includes('texto'));
  assert.strictEqual(m3.CAMPOS_QUE_SE_CONSERVAN.includes('correo'), false);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__recorte] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__recorte] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
