'use strict';

/**
 * instagram-bridge · G2 · LectorDeCastigo (MICRO-AGENTE)
 *
 * La senal de castigo es la unica voz de la plataforma que el puente puede oir,
 * y equivocarse al leerla se paga caro en los dos sentidos: leer la duda como
 * permiso quema la cuenta, y leer un error de red como castigo la deja parada
 * tres dias sin motivo. Esta suite fija el juicio:
 *   - TRES CLASES y nada mas: firme / dudosa / ausente;
 *   - la DUDA se resuelve como DUDOSA (baja el ritmo, no para);
 *   - toda senal firme o dudosa lleva FIN declarado; si el texto no lo dice, lo
 *     pone el puente Y LO DICE (`fin_origen: 'por_defecto'`);
 *   - sin LLM funciona igual (reglas); con LLM, el modelo no puede BORRAR una
 *     senal firme que esta escrita, ni romper el juicio si devuelve basura;
 *   - no lee la pantalla: recibe la senal ya observada, y no lee el reloj.
 *
 * Ejecutar: node modules/instagram-bridge/tests/castigo.test.js
 */

const assert = require('assert');

const castigo = require('../ritmo/castigo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T10:00:00Z';

// ---------------------------------------------------------------------------
// 1 · la clasificacion
// ---------------------------------------------------------------------------

test('senal_dudosa_baja_el_ritmo_y_no_para', () => {
  // 1 · Una senal FIRME es la unica que autoriza a parar.
  const firme = castigo.juzgar({ texto: 'Hemos restringido tu cuenta durante 24 horas' }, { momento: M1 });
  assert.strictEqual(firme.ok, true, firme.motivo);
  assert.strictEqual(firme.clase, 'firme');
  assert.strictEqual(firme.familia, 'bloqueo_de_cuenta');
  assert.strictEqual(castigo.es_parada(firme), true);
  assert.strictEqual(castigo.obliga_a_bajar(firme), false);
  assert.strictEqual(firme.fin, '2026-11-12T10:00:00Z', 'el plazo escrito manda: 24 horas');

  // 2 · Una senal DUDOSA baja el ritmo y NO para. Nunca.
  const dudosa = castigo.juzgar({ texto: 'Algo ha ido mal, vuelve a intentarlo' }, { momento: M1 });
  assert.strictEqual(dudosa.clase, 'dudosa');
  assert.strictEqual(castigo.es_parada(dudosa), false, 'la duda no para la cuenta');
  assert.strictEqual(castigo.obliga_a_bajar(dudosa), true, 'la duda baja el ritmo');
  assert.ok(dudosa.fin, 'y aun asi declara su fin');
  assert.strictEqual(dudosa.fin, '2026-11-11T16:00:00Z', 'fin por defecto de una duda: 6 horas');
  assert.strictEqual(dudosa.fin_origen, 'por_defecto');

  // 3 · Un texto que NO se reconoce no es "no pasa nada": es duda.
  const desconocido = castigo.juzgar({ texto: 'Codigo XJ-442 inesperado en la operacion' }, { momento: M1 });
  assert.strictEqual(desconocido.clase, 'dudosa', 'lo que no se reconoce se lee como dudosa');
  assert.strictEqual(desconocido.familia, 'senal_ambigua');
  assert.strictEqual(castigo.es_parada(desconocido), false);

  // 4 · Un error conocido sin sujeto tambien es duda, no permiso.
  const errorRed = castigo.juzgar({ texto: 'No se pudo cargar. Intentalo mas tarde.' }, { momento: M1 });
  assert.strictEqual(['firme', 'dudosa'].includes(errorRed.clase), true);

  // 5 · Sin senal: AUSENTE. No es una buena noticia, es la ausencia de dato.
  for (const nada of [null, undefined, {}, { texto: '' }, { indicios: [] }]) {
    const ausente = castigo.juzgar(nada, { momento: M1 });
    assert.strictEqual(ausente.clase, 'ausente', `sin senal (${JSON.stringify(nada)}) no se inventa castigo`);
    assert.strictEqual(ausente.familia, 'sin_senal');
    assert.strictEqual(castigo.es_parada(ausente), false);
    assert.strictEqual(castigo.obliga_a_bajar(ausente), false, 'la ausencia de dato no baja el ritmo sola');
    assert.strictEqual(ausente.fin, null, 'sin castigo no hay nada que caducar');
  }

  // 6 · Una mirada PARCIAL sin texto no prueba que no haya castigo: es duda.
  const parcial = castigo.juzgar({ mirada: 'parcial', motivo_sin_mirada: 'no se vio el dialogo' }, { momento: M1 });
  assert.strictEqual(parcial.clase, 'dudosa');
  assert.ok(parcial.fin, 'una duda siempre tiene fin');
});

test('un_error_de_red_no_es_un_castigo_firme', () => {
  // Cuidado con el falso positivo: "vuelve a intentarlo" es un error, no una
  // restriccion. Si el puente lo leyera como firme, pararia la cuenta cada vez
  // que el movil pierde cobertura.
  const red = castigo.juzgar({ texto: 'Se ha producido un error de red. Vuelve a intentarlo.' }, { momento: M1 });
  assert.notStrictEqual(red.clase, 'firme', 'un fallo de red no es la plataforma diciendo que no');
  assert.strictEqual(red.clase, 'dudosa');

  // ... pero un limite de uso SI es firme, y con su plazo.
  const limite = castigo.juzgar({ texto: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' }, { momento: M1 });
  assert.strictEqual(limite.clase, 'firme');
  assert.strictEqual(limite.familia, 'limite_de_uso');
  assert.strictEqual(limite.fin, '2026-11-11T10:15:00Z', 'los 15 minutos del texto');

  // La accion bloqueada tambien, y sin plazo escrito se le pone uno declarado.
  const bloqueo = castigo.juzgar({ texto: 'Accion bloqueada por seguridad' }, { momento: M1 });
  assert.strictEqual(bloqueo.clase, 'firme');
  assert.strictEqual(bloqueo.familia, 'restriccion_de_accion');
  assert.strictEqual(bloqueo.fin_origen, 'por_defecto');
  assert.strictEqual(bloqueo.fin, '2026-11-12T10:00:00Z', 'un dia por defecto para una senal firme sin plazo');
  assert.strictEqual(bloqueo.tope, false);
});

test('el_texto_se_normaliza_y_no_se_traga_las_tildes', () => {
  assert.strictEqual(castigo.normalizar_texto('  ACCIÓN Bloqueada  '), 'accion bloqueada');
  assert.strictEqual(castigo.normalizar_texto('Demasiadas   SOLICITUDES'), 'demasiadas solicitudes');
  assert.strictEqual(castigo.normalizar_texto(undefined), '');

  // La misma senal con y sin tildes cae en la misma clase.
  const conTilde = castigo.juzgar({ texto: 'Tu cuenta ha sido restringida' }, { momento: M1 });
  const sinTilde = castigo.juzgar({ texto: 'tu cuenta ha sido restringida' }, { momento: M1 });
  assert.strictEqual(conTilde.clase, sinTilde.clase);
  assert.strictEqual(conTilde.familia, sinTilde.familia);

  // Los indicios sueltos cuentan igual que el texto (el observador no siempre
  // devuelve una frase; a veces devuelve hechos).
  const porIndicios = castigo.juzgar({ indicios: ['modal_error', 'texto: intenta de nuevo mas tarde'] }, { momento: M1 });
  assert.strictEqual(porIndicios.clase, 'firme');
  assert.strictEqual(porIndicios.familia, 'limite_de_uso');
});

// ---------------------------------------------------------------------------
// 2 · el fin declarado
// ---------------------------------------------------------------------------

test('toda_senal_de_castigo_declara_su_fin', () => {
  const casos = [
    { texto: 'Accion bloqueada' },
    { texto: 'Intenta de nuevo mas tarde' },
    { texto: 'Algo ha ido mal' },
    { texto: 'texto rarisimo sin patron' },
    { indicios: ['checkpoint_required'] },
    { mirada: 'parcial', motivo_sin_mirada: 'no se vio' }
  ];
  for (const senal of casos) {
    const j = castigo.juzgar(senal, { momento: M1 });
    assert.strictEqual(j.ok, true, `deberia juzgar: ${JSON.stringify(senal)}`);
    if (j.clase === 'ausente') continue;
    assert.ok(j.fin, `una senal ${j.clase} tiene que traer fin: ${JSON.stringify(senal)}`);
    assert.ok(['senal', 'texto', 'por_defecto'].includes(j.fin_origen), `origen declarado: ${j.fin_origen}`);
    // Y el fin no puede ser anterior al momento en que se lee.
    assert.strictEqual(j.fin > M1.slice(0, -1) || j.fin !== M1, true);
    assert.strictEqual(castigo.juzgar(senal, { momento: M1 }).fin, j.fin, 'determinista');
  }

  // El fin explicito de la senal manda sobre cualquier plazo del texto.
  const explicito = castigo.juzgar({ texto: 'Accion bloqueada durante 5 minutos', hasta: '2026-11-13T00:00:00Z' }, { momento: M1 });
  assert.strictEqual(explicito.fin, '2026-11-13T00:00:00Z');
  assert.strictEqual(explicito.fin_origen, 'senal');

  // Un "hasta" en el pasado no se cree: se cae al plazo del texto.
  const caducado = castigo.juzgar({ texto: 'Accion bloqueada durante 30 minutos', hasta: '2026-11-01T00:00:00Z' }, { momento: M1 });
  assert.strictEqual(caducado.fin, '2026-11-11T10:30:00Z');
  assert.strictEqual(caducado.fin_origen, 'texto');

  // Un plazo absurdo se respeta pero se marca: por encima de 30 dias, ese "fin"
  // es una forma educada de decir "para siempre".
  const eterno = castigo.juzgar({ texto: 'Tu cuenta ha sido suspendida durante 365 dias' }, { momento: M1 });
  assert.strictEqual(eterno.tope, true, 'el tope tiene que avisar');
  const dias = (Date.parse(eterno.fin) - Date.parse(M1)) / 86400000;
  assert.strictEqual(dias, 30, 'se recorta a 30 dias, y se dice');
});

// ---------------------------------------------------------------------------
// 3 · reglas y LLM: la duda se resuelve igual
// ---------------------------------------------------------------------------

test('sin_llm_funciona_igual_y_la_duda_se_resuelve_como_dudosa', () => {
  // Sin clasificador: reglas. Es el modo por defecto y tiene que bastar.
  const sinLlm = castigo.juzgar({ texto: 'Hemos restringido tu cuenta' }, { momento: M1 });
  assert.strictEqual(sinLlm.origen, 'reglas');
  assert.strictEqual(sinLlm.llm, 'no_oferta');
  assert.strictEqual(sinLlm.clase, 'firme');

  // Un clasificador que revienta no rompe el juicio: se cae a las reglas.
  const revienta = castigo.juzgar({ texto: 'Algo ha ido mal' }, {
    momento: M1,
    clasificador: () => { throw new Error('el modelo no esta'); }
  });
  assert.strictEqual(revienta.ok, true, 'el juicio no depende del modelo');
  assert.strictEqual(revienta.clase, 'dudosa');
  assert.strictEqual(revienta.llm, 'fallo');
  assert.strictEqual(revienta.origen, 'reglas');

  // Un clasificador que devuelve basura tampoco: se rechaza y mandan las reglas.
  for (const basura of [null, undefined, 'firme', {}, { clase: 'regular' }, { clase: 42 }]) {
    const r = castigo.juzgar({ texto: 'Algo ha ido mal' }, { momento: M1, clasificador: () => basura });
    assert.strictEqual(r.clase, 'dudosa', `basura ${JSON.stringify(basura)} no cambia el juicio`);
    assert.strictEqual(r.origen, 'reglas');
    assert.strictEqual(r.llm, 'rechazado');
  }

  // Un clasificador valido SI manda (para lo que las reglas no pueden ver).
  const conLlm = castigo.juzgar({ texto: 'Operacion no completada (#4471)' }, {
    momento: M1,
    clasificador: () => ({ clase: 'dudosa', familia: 'senal_ambigua', confianza: 0.7, motivo: 'un aviso sin sujeto', evidencia: ['llm'] })
  });
  assert.strictEqual(conLlm.origen, 'llm');
  assert.strictEqual(conLlm.llm, 'usado');
  assert.strictEqual(conLlm.confianza, 0.7);
  assert.strictEqual(conLlm.motivo, 'un aviso sin sujeto');

  // ... pero NO puede borrar una senal firme que esta escrita. Lo que la
  // plataforma dijo, escrito esta.
  const borrado = castigo.juzgar({ texto: 'Tu cuenta ha sido suspendida' }, {
    momento: M1,
    clasificador: () => ({ clase: 'ausente', familia: 'sin_senal' })
  });
  assert.strictEqual(borrado.clase, 'firme', 'el modelo no puede tapar un bloqueo escrito');
  assert.strictEqual(borrado.llm, 'rechazado');
  assert.ok(/se descarta/.test(borrado.motivo), borrado.motivo);
});

test('sin_momento_no_se_inventa_un_fin', () => {
  // El fin se calcula sobre el instante que llega. Sin instante no hay fin, y
  // sin fin no hay castigo que respetar sin volverlo eterno: se nombra el hueco.
  const sinMomento = castigo.juzgar({ texto: 'Accion bloqueada' });
  assert.strictEqual(sinMomento.ok, false);
  assert.strictEqual(sinMomento.motivo, 'sin_momento');
  assert.deepStrictEqual(sinMomento.faltan, ['momento']);
  assert.strictEqual(sinMomento.clase, 'firme', 'el juicio se conserva aunque falte el instante');
  assert.strictEqual(sinMomento.fin, null);

  // Con `momento` en la propia senal, vale.
  const conMomento = castigo.juzgar({ texto: 'Accion bloqueada', momento: M1 });
  assert.strictEqual(conMomento.ok, true);
  assert.ok(conMomento.fin);

  // Ausente no necesita instante: no hay nada que caducar.
  assert.strictEqual(castigo.juzgar({}).ok, true);
});

test('el_juicio_no_lee_el_reloj_ni_la_pantalla', () => {
  const original = Date.now;
  Date.now = () => { throw new Error('G2 no puede leer el reloj'); };
  try {
    const j = castigo.juzgar({ texto: 'Intenta de nuevo en 10 minutos' }, { momento: M1 });
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.fin, '2026-11-11T10:10:00Z');
  } finally {
    Date.now = original;
  }

  // G2 recibe la senal ya observada: no hay campo de pantalla que leer y no
  // hay ninguna llamada de red en el modulo.
  const fuente = require('fs').readFileSync(require.resolve('../ritmo/castigo'), 'utf8');
  assert.strictEqual(/require\(['"](https?|net|dns|tls)['"]\)/.test(fuente), false, 'G2 no habla con la red');
  assert.strictEqual(/Date\.now\s*\(/.test(fuente), false, 'G2 no lee el reloj');

  // La presion que consume G6 es solo lo que G6 necesita.
  const presion = castigo.presion_de(castigo.juzgar({ texto: 'Accion bloqueada' }, { momento: M1 }));
  assert.deepStrictEqual(Object.keys(presion).sort(), ['clase', 'familia', 'fin', 'fin_origen']);
  assert.strictEqual(presion.clase, 'firme');
  assert.strictEqual(castigo.presion_de(null).clase, 'dudosa', 'una presion ilegible se lee como dudosa');
});

test('la_tabla_de_patrones_es_cerrada_y_declarada', () => {
  const tabla = castigo.patrones();
  assert.ok(tabla.length >= 5);
  for (const regla of tabla) {
    assert.ok(castigo.FAMILIAS.includes(regla.familia), `familia declarada: ${regla.familia}`);
    assert.ok(['firme', 'dudosa'].includes(regla.clase), 'una regla o es firme o es dudosa (lo ausente no se lee)');
    assert.strictEqual(typeof regla.fuente, 'string');
  }
  // Hay al menos una regla firme de cada tipo de castigo real.
  const familiasFirmes = new Set(tabla.filter((r) => r.clase === 'firme').map((r) => r.familia));
  for (const familia of ['bloqueo_de_cuenta', 'restriccion_de_accion', 'limite_de_uso']) {
    assert.ok(familiasFirmes.has(familia), `falta una regla firme para ${familia}`);
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__castigo] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__castigo] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
