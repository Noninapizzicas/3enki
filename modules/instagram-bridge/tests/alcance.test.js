'use strict';

/**
 * instagram-bridge · S2 · DetectorDeFueraDeAlcance (REFLEJO)
 *
 * Crecimiento fuera; operacion dentro. Esta suite fija:
 *
 *   - DIEZ CUENTAS CON EL MISMO TEXTO es fuera de alcance, y se dice con su
 *     motivo y su frase de frontera (no con un error del sistema);
 *   - el mismo patron con dos cuentas todavia no es volumen: el umbral es una
 *     decision escrita, no una corazonada;
 *   - **no bloquea al usuario legitimo que repite su propio mensaje**: la misma
 *     cuenta diez veces es UNA persona insistiendo, y se le contesta;
 *   - diez respuestas DISTINTAS a diez personas es el trabajo normal;
 *   - los patrones de forma (seguidores, listas, me gusta masivos, "un poquito
 *     de cada") se detectan por la forma de la peticion, no por el tamano;
 *   - no hay "version pequena" de lo mismo: no se negocia.
 *
 * Ejecutar: node modules/instagram-bridge/tests/alcance.test.js
 */

const assert = require('assert');

const s2 = require('../puente/alcance');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const TEXTO = 'Hola! Te escribo para contarte que queda plaza en el taller de ceramica del sabado por la manana.';

function cuentas(n, prefijo = 'cuenta') {
  return Array.from({ length: n }, (_, i) => ({ cuenta: `${prefijo}_${i + 1}` }));
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('diez_cuentas_con_el_mismo_texto_es_fuera_de_alcance', () => {
  // --- diez cuentas distintas, el mismo texto ---------------------------
  const diez = s2.detectar({ texto: TEXTO, destinatarios: cuentas(10) });
  assert.strictEqual(diez.ok, true);
  assert.strictEqual(diez.dentro, false);
  assert.strictEqual(diez.estado, 'fuera');
  assert.strictEqual(diez.motivo, 'mismo_texto_a_varias_cuentas');
  assert.strictEqual(diez.cuentas_distintas, 10);
  assert.strictEqual(diez.con_el_mismo_texto, 10);
  assert.strictEqual(diez.umbral, 3);

  // La frase NOMBRA la frontera; no es un error tecnico ni un "no permitido".
  assert.ok(diez.frase.startsWith('Esto no lo hago:'));
  assert.ok(diez.frase.includes('no es una respuesta'));
  assert.strictEqual(diez.negociable, false);

  // Y no es cosa del tamano: TRES ya es fuera (el umbral es una decision).
  const tres = s2.detectar({ texto: TEXTO, destinatarios: cuentas(3) });
  assert.strictEqual(tres.dentro, false);
  assert.strictEqual(tres.motivo, 'mismo_texto_a_varias_cuentas');
  assert.strictEqual(tres.cuentas_distintas, 3);

  // Dos todavia no: es un envio a dos personas, y eso no es una campana.
  const dos = s2.detectar({ texto: TEXTO, destinatarios: cuentas(2) });
  assert.strictEqual(dos.dentro, true);
  assert.strictEqual(dos.cuentas_distintas, 2);

  // --- el mismo texto con otra puntuacion sigue siendo el mismo texto ---
  const variantes = [
    { cuenta: 'ana', texto: TEXTO },
    { cuenta: 'bea', texto: TEXTO.replace('!', '') },
    { cuenta: 'carla', texto: TEXTO.toLowerCase() }
  ];
  const conVariantes = s2.detectar({ destinatarios: variantes });
  assert.strictEqual(conVariantes.dentro, false, 'una coma de diferencia no cambia el patron');
  assert.strictEqual(conVariantes.motivo, 'mismo_texto_a_varias_cuentas');

  // --- cada destinatario con SU texto: eso es responder, no difundir ----
  const personalizados = [
    { cuenta: 'ana', texto: 'Hola Ana, si queda plaza el sabado, te apunto.' },
    { cuenta: 'bea', texto: 'Hola Bea, el sabado esta libre, dime si vienes.' },
    { cuenta: 'carla', texto: 'Hola Carla, quedan dos plazas para el taller.' },
    { cuenta: 'dani', texto: 'Hola Dani, te guardo sitio el sabado por la manana.' }
  ];
  const distintas = s2.detectar({ destinatarios: personalizados });
  assert.strictEqual(distintas.dentro, true, 'diez respuestas distintas son el trabajo normal');
  assert.strictEqual(distintas.con_el_mismo_texto, 1);

  // --- veinte destinatarios ya es volumen aunque cada texto sea distinto -
  const veinte = Array.from({ length: 20 }, (_, i) => ({ cuenta: `c_${i}`, texto: `respuesta numero ${i} para ti` }));
  const porVolumen = s2.detectar({ destinatarios: veinte });
  assert.strictEqual(porVolumen.dentro, false);
  assert.strictEqual(porVolumen.motivo, 'volumen');
  assert.strictEqual(porVolumen.umbral, 20);
});

// ---------------------------------------------------------------------------
// 2 · EL USUARIO LEGITIMO
// ---------------------------------------------------------------------------

test('repetir_el_propio_mensaje_no_es_volumen', () => {
  // La MISMA cuenta diez veces es una persona insistiendo: se le contesta.
  const insiste = s2.es_volumen_pequeno_repetido({
    texto: '¿Me puedes decir el precio?',
    cuenta_propia: 'taller_a',
    destinatarios: Array.from({ length: 10 }, () => ({ cuenta: 'maria.ceramica' }))
  });
  assert.strictEqual(insiste.fuera, false);
  assert.strictEqual(insiste.cuentas_distintas, 1);
  assert.strictEqual(insiste.con_el_mismo_texto, 1);

  // Lo mismo por la puerta de `detectar`: dentro.
  const diez = s2.detectar({
    texto: '¿Me puedes decir el precio del taller?',
    destinatarios: Array.from({ length: 10 }, () => ({ cuenta: 'maria.ceramica' }))
  });
  assert.strictEqual(diez.dentro, true, 'diez mensajes de la misma persona no son una campana');

  // Nuestra propia cuenta en la lista no cuenta como destinatario.
  const conNosotros = s2.es_volumen_pequeno_repetido({
    texto: TEXTO,
    cuenta_propia: 'taller_a',
    destinatarios: [{ cuenta: 'taller_a' }, { cuenta: 'taller_a' }, { cuenta: 'taller_a' }]
  });
  assert.strictEqual(conNosotros.fuera, false);
  assert.strictEqual(conNosotros.cuentas_distintas, 0);

  // Y repetir el MISMO mensaje a la misma persona tres veces tampoco.
  const alMismo = s2.detectar({
    texto: 'Te lo reenvio por si no te llego: el taller es el sabado.',
    destinatarios: [{ cuenta: 'maria' }, { cuenta: 'maria' }, { cuenta: 'maria' }]
  });
  assert.strictEqual(alMismo.dentro, true);

  // Una mencion suelta no se confunde con un patron.
  assert.strictEqual(s2.parecido('hola que tal', 'hola que tal'), 0, 'un texto corto no se compara por parecido');
  assert.strictEqual(s2.mismo_texto('ok', 'ok'), true);
  assert.strictEqual(s2.mismo_texto('', 'algo'), false);
});

// ---------------------------------------------------------------------------
// 3 · SE DETECTA POR FORMA
// ---------------------------------------------------------------------------

test('se_detecta_por_forma_y_se_responde_nombrando_la_frontera', () => {
  const casos = [
    ['quiero conseguir seguidores rapido', 'conseguir_seguidores'],
    ['necesito ganar seguidores para la cuenta del taller', 'conseguir_seguidores'],
    ['manda el mismo mensaje a todos mis contactos', 'escribir_a_muchos'],
    ['quiero escribir a muchos sin que se note', 'escribir_a_muchos'],
    ['dale me gusta a todos los del barrio', 'gustar_en_masa'],
    ['hazme follow for follow con veinte cuentas', 'gustar_en_masa'],
    ['manda un poquito de cada a todos', 'un_poquito_de_cada'],
    ['un poco de cada uno y asi crecemos', 'un_poquito_de_cada']
  ];
  for (const [texto, motivo] of casos) {
    const r = s2.detectar({ texto });
    assert.strictEqual(r.dentro, false, `"${texto}" deberia estar fuera`);
    assert.strictEqual(r.motivo, motivo, `"${texto}" -> ${r.motivo}`);
    assert.strictEqual(r.negociable, false);
    assert.ok(s2.responder_frontera(r).startsWith('Esto no lo hago:'));
  }

  // El trabajo normal no se toca.
  const normal = [
    'contesta a maria que el taller abre el lunes',
    'publica la foto del curso con su texto',
    'lee los comentarios de la ultima publicacion',
    'responde al mensaje de pedro sobre el precio'
  ];
  for (const texto of normal) {
    const r = s2.detectar({ texto });
    assert.strictEqual(r.dentro, true, `"${texto}" es operacion normal`);
    assert.strictEqual(r.motivo, null);
  }

  // La frase de frontera es distinta segun el motivo, y ninguna es un error.
  const fraseSeguidores = s2.detectar({ texto: 'conseguir seguidores' }).frase;
  const fraseAlcance = s2.responder_frontera({ motivo: 'fuera_de_alcance' });
  assert.notStrictEqual(fraseSeguidores, fraseAlcance);
  assert.ok(s2.responder_frontera({ motivo: 'inventado' }).length > 0, 'un motivo raro tiene frase generica');

  // Sin texto ni destinatarios no hay nada que decidir: se dice, no se supone.
  const vacio = s2.detectar({});
  assert.strictEqual(vacio.ok, false);
  assert.strictEqual(vacio.motivo, 'entrada_invalida');
  assert.deepStrictEqual(vacio.faltan, ['texto']);

  // La tabla es consultable: umbrales y patrones son datos, no magia.
  const d = s2.describir();
  assert.strictEqual(d.umbral_cuentas_distintas, 3);
  assert.strictEqual(d.se_detecta_por, 'forma de la peticion, no por tamano');
  assert.strictEqual(d.negociable, false);
  assert.strictEqual(s2.esta_dentro({ texto: 'contesta a maria' }), true);
  assert.strictEqual(s2.esta_dentro({ texto: 'ganar seguidores' }), false);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__alcance] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__alcance] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
