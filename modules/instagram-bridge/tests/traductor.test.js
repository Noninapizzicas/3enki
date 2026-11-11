'use strict';

/**
 * instagram-bridge · R2 · TraductorDeFallo (MICRO-AGENTE)
 *
 * **Al dueno no se le nombran pantallas, ni botones, ni terminos tecnicos. Se le
 * dice QUE HACE FALTA.** Esta suite fija:
 *
 *   - TODAS las frases de la tabla pasan el seguro: ni pantalla, ni boton, ni
 *     tecnicismo, ni en la frase ni en lo que hace falta;
 *   - el mensaje tecnico que llega (detalle, pantalla, ancla) NO se repite, no se
 *     cita y no se resume: se queda en la puerta;
 *   - un codigo desconocido no se inventa una explicacion: cae en la frase honesta
 *     y dice que hace falta que lo mire una persona;
 *   - `hace_falta` esta siempre: un fallo sin «que se necesita» deja al dueno
 *     donde estaba;
 *   - un texto de error entero no se toma por un codigo (no se devuelve tal cual);
 *   - `revisar()` caza pantallas, botones y tecnicismos (el seguro, comprobado);
 *   - no lanza con nada: ni null, ni numeros, ni objetos sin codigo.
 *
 * Ejecutar: node modules/instagram-bridge/tests/traductor.test.js
 */

const assert = require('assert');

const r2 = require('../puente/traductor');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// El fallo «de verdad»: el que trae todo lo que no se le puede decir al dueno.
const FALLO_TECNICO = {
  codigo: 'rotura',
  paso: 'paso 3 · publicar',
  ancla: 'boton Compartir',
  pantalla: 'crear',
  nodo: 'n_8812',
  detalle: 'Timeout 30000 en el selector .btn-share del DOM',
  error: 'Error 500 en el endpoint /api/v1/media'
};

const PROHIBIDO_EN_FRASE = [
  'pantalla', 'perfil', 'inicio', 'crear', 'dm', 'comentarios', 'boton', 'botones',
  'icono', 'menu', 'pestana', 'compartir', 'selector', 'dom', 'endpoint', 'api',
  'timeout', 'null', 'json', 'http', 'token', 'payload', 'error', 'stack'
];

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('al_dueno_no_se_le_nombran_pantallas', () => {
  // TODAS las frases de la tabla, una por una, pasan el seguro.
  const codigos = Object.keys(r2.TABLA).concat(['codigo_que_no_existe']);
  assert.ok(codigos.length >= 17, 'la tabla tiene que cubrir los fallos del puente');

  for (const codigo of codigos) {
    const r = r2.traducir(Object.assign({}, FALLO_TECNICO, { codigo }));

    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.revisada.limpia, true, `[${codigo}] la frase nombra lo prohibido: ${r.frase}`);
    assert.strictEqual(r2.revisar(r.frase).limpia, true);
    assert.strictEqual(r2.revisar(r.hace_falta.join('. ')).limpia, true, `[${codigo}] lo que hace falta nombra lo prohibido`);

    // Ni una palabra prohibida en la frase (comprobado tambien palabra a palabra).
    const normalizada = r.frase.toLowerCase();
    for (const palabra of PROHIBIDO_EN_FRASE) {
      if (palabra === 'dm') {
        assert.strictEqual(/\bdm\b/.test(normalizada), false, `[${codigo}] nombra dm: ${r.frase}`);
        continue;
      }
      assert.strictEqual(normalizada.includes(palabra), false, `[${codigo}] nombra "${palabra}": ${r.frase}`);
    }
  }

  // Y el mensaje tecnico que llego NO aparece en la respuesta, ni siquiera en un
  // campo de datos: no se limpia ni se cita, se sustituye.
  const r = r2.traducir(FALLO_TECNICO);
  const serializado = JSON.stringify(r);
  for (const trozo of ['btn-share', 'Timeout', '/api/v1/media', 'n_8812', 'selector', 'Compartir']) {
    assert.strictEqual(serializado.includes(trozo), false, `el tecnico "${trozo}" se ha colado en la respuesta`);
  }
  assert.strictEqual(r.tecnico_oculto, true, 'se declara que habia tecnico y se quedo en la puerta');
});

test('el_tecnico_no_se_repite_ni_disfrazado_de_codigo', () => {
  // Lo que llega como prosa de error no es un codigo y no se devuelve tal cual.
  const prosa = r2.traducir('Error 500 en el selector .btn-share del DOM');
  assert.strictEqual(prosa.ok, true);
  assert.strictEqual(prosa.codigo, null, 'una frase no es un codigo');
  assert.strictEqual(prosa.motivo, 'sin_codigo');
  assert.strictEqual(prosa.revisada.limpia, true);
  assert.strictEqual(JSON.stringify(prosa).includes('btn-share'), false);
});

test('nombra_lo_que_hace_falta', () => {
  // Un fallo sin «que se necesita» deja al dueno donde estaba: siempre hay algo.
  for (const codigo of Object.keys(r2.TABLA)) {
    const r = r2.traducir(codigo);
    assert.ok(Array.isArray(r.hace_falta), `[${codigo}] hace_falta no es lista`);
    if (codigo !== 'no_ocurrio' && codigo !== 'sin_evidencia') {
      assert.ok(r.hace_falta.length > 0, `[${codigo}] no dice que hace falta`);
    }
  }

  // Los casos caros, con la necesidad concreta y no un «algo habra que hacer».
  assert.deepStrictEqual(r2.traducir('sin_permiso').hace_falta, ['tu permiso para seguir']);
  assert.deepStrictEqual(r2.que_hace_falta('sesion_caida'), ['que la cuenta vuelva a entrar']);
  assert.ok(r2.traducir('limite_de_ritmo').hace_falta[0].includes('esperar'));
  assert.ok(r2.traducir('sin_red').hace_falta[0].includes('conexion'));

  // Y el fallo de verdad (rotura): manda a mirarlo con una persona, no a reintentar
  // a ciegas, porque reintentar una rotura es repetir el mismo golpe.
  assert.ok(r2.traducir('rotura').hace_falta[0].includes('una persona'));
  assert.ok(r2.traducir('rotura').frase.includes('ha dejado de servir'));
});

test('un_codigo_desconocido_no_se_inventa_una_explicacion', () => {
  const r = r2.traducir({ codigo: 'no_existe_esto' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.motivo, 'codigo_sin_traduccion');
  assert.strictEqual(r.frase, 'No ha salido, y no tengo una explicacion que puedas usar.');
  assert.deepStrictEqual(r.hace_falta, ['que una persona lo mire']);
  assert.strictEqual(r.revisada.limpia, true);

  // Y un fallo sin codigo tampoco inventa: dice el hueco.
  const sinCodigo = r2.traducir({ detalle: 'algo paso' });
  assert.strictEqual(sinCodigo.motivo, 'sin_codigo');
  assert.strictEqual(sinCodigo.revisada.limpia, true);
});

test('el_seguro_caza_pantallas_botones_y_tecnicos', () => {
  // El seguro es la mitad ejecutable de la regla: si no cazara, la regla seria
  // una promesa. Se comprueba con las tres familias.
  const pantalla = r2.revisar('No encuentro el boton Compartir en la pantalla de crear');
  assert.strictEqual(pantalla.limpia, false);
  assert.deepStrictEqual(pantalla.encontrados.map((e) => e.tipo).sort(), ['boton', 'boton', 'pantalla']);

  const boton = r2.revisar('Pulsa el icono del menu y desliza');
  assert.strictEqual(boton.limpia, false);
  assert.ok(boton.encontrados.every((e) => e.tipo === 'boton'));

  const tecnico = r2.revisar('El selectro del DOM devolvio null');
  assert.strictEqual(tecnico.limpia, false);

  // «admin» no es «dm», y «lograr» no es «log»: el seguro no da falsos positivos
  // que hagan inservible una frase buena.
  assert.strictEqual(r2.revisar('La cuenta la lleva el admin, que es quien decide').limpia, true);
  assert.strictEqual(r2.revisar('Lo he intentado y no he podido llegar').limpia, true);
  assert.strictEqual(r2.revisar('La cuenta ha dejado de entrar sola.').limpia, true);
});

test('no_lanza_con_nada', () => {
  for (const basura of [null, undefined, 0, 42, [], {}, '', '   ', true]) {
    const r = r2.traducir(basura);
    assert.strictEqual(r.ok, true, `deberia contestar con ${JSON.stringify(basura)}`);
    assert.strictEqual(typeof r.frase, 'string');
    assert.strictEqual(r.revisada.limpia, true);
    assert.ok(Array.isArray(r.hace_falta));
  }
});

test('los_fallos_del_puente_estan_cubiertos', () => {
  // Los codigos que el resto del puente ya produce: si uno no estuviera, el dueno
  // recibiria la frase generica en el caso mas frecuente.
  const delPuente = [
    'sin_puerto', 'no_ocurrio', 'sin_evidencia', 'sin_receta', 'rotura',
    'plataforma_cambio', 'receta_retirada', 'limite_de_ritmo', 'sin_permiso',
    'sin_autorizacion', 'fuera_de_alcance', 'sesion_caida', 'sin_red',
    'tiempo_agotado', 'pieza_rechazada', 'sin_voz', 'ininteligible', 'sin_datos'
  ];
  for (const codigo of delPuente) {
    assert.ok(r2.TABLA[codigo], `falta el codigo "${codigo}" en la tabla`);
    assert.strictEqual(r2.traducir(codigo).motivo, 'traducido', `"${codigo}" no se traduce`);
  }

  const d = r2.describir();
  assert.strictEqual(d.regla, 'al dueno no se le nombran pantallas, ni botones, ni terminos tecnicos; se le dice que hace falta');
  assert.strictEqual(d.no_repite_el_mensaje_tecnico, true);
  assert.ok(d.prohibidos.pantallas.includes('perfil'));
  assert.ok(d.prohibidos.tecnicismos.includes('selector'));
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__traductor] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__traductor] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
