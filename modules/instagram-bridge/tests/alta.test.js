'use strict';

/**
 * instagram-bridge · B2 · AltaDeCuenta (PUENTE)
 *
 * La ceremonia que pone en marcha el sistema. Esta suite fija lo que no se puede
 * relajar:
 *   - nace en `esperando_persona`: el puente no abre sesiones ni escribe el padron
 *     antes de que una persona ponga las manos (y `agente`/`sistema` no la abren);
 *   - un alta atascada esperando persona NO bloquea a otros proyectos: B se da de
 *     alta y opera mientras A sigue esperando;
 *   - recorre los SIETE pasos en orden y declara donde esta en cada momento;
 *   - si un paso falta (la mirada del aparato, la prueba), se NOMBRA y se para
 *     ahi: no se salta al siguiente y no se da por buena la cuenta;
 *   - la primera operacion es LEER: estrenar publicando se rechaza.
 *
 * Ejecutar: node modules/instagram-bridge/tests/alta.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const { crear } = require('../cuentas');
const alta = require('../cuentas/alta');
const padron_puro = require('../cuentas/padron');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-11T12:30:00Z';

// ---------------------------------------------------------------------------
// utillaje: padron REAL (B1) en un directorio temporal + la ceremonia encima
// ---------------------------------------------------------------------------

async function montar() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'instagram-alta-'));
  const padron = crear({ directorio: dir });
  await padron.cargar();
  await padron.fichas.cargar();
  const ceremonia = alta.crear({ padron, fichas: padron.fichas });
  return { dir, padron, ceremonia, limpiar: () => fsp.rm(dir, { recursive: true, force: true }) };
}

function nodo(id, tipo, nombre) {
  return { id, tipo, nombre_visible: nombre };
}

/** La mirada que trae el aparato (puerto observar): las anclas de HOY. */
function mirada(cuenta) {
  return {
    sello: { proyecto: 'proy-a', cuenta, aparato: 'movil-1', momento: M1, quien: 'dueno' },
    pantalla: 'inicio',
    mirada: 'completa',
    cuenta_visible: cuenta,
    nodos: [
      nodo('n1', 'boton', 'Crear'),
      nodo('n2', 'boton', 'Siguiente'),
      nodo('n3', 'boton', 'Compartir'),
      nodo('n4', 'texto', 'Publicado')
    ]
  };
}

function paso(ancla) {
  return {
    ancla_esperada: { nombre_visible: ancla, tipo: 'boton' },
    accion: { tipo: 'tocar' },
    consecuencia_esperada: { descripcion: `despues de ${ancla} la pantalla cambia` },
    espera_maxima: 1500
  };
}

/** Una receta vigente de la plataforma (la forma es de A4.1; aqui solo se usa). */
function receta() {
  return {
    plataforma: 'instagram',
    capacidad: 'publicar',
    estado: 'vigente',
    precondicion: { descripcion: 'app abierta en inicio' },
    pasos: [paso('Crear'), paso('Siguiente'), paso('Compartir')],
    postcondicion: { descripcion: 'queda publicado', ancla: { nombre_visible: 'Publicado', tipo: 'texto' } },
    techo: 9000
  };
}

function prueba(capacidad) {
  return { capacidad: capacidad || 'mirar', veredicto: 'ocurrio', evidencia_id: 'ev-0001', momento: M1 };
}

/** La entrada de una cuenta lista para recorrer los siete pasos. */
function entrada(extra = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno',
    autorizacion_id: 'aut-alta-0001',
    identidad_visible: { nombre: 'Taller A', presentacion: 'taller de ceramica' },
    recetas: [receta()],
    ventana_servicio: undefined,
    nivel_declarado: undefined
  }, extra);
}

// ---------------------------------------------------------------------------
// 1 · un alta esperando persona NO bloquea a otros proyectos
// ---------------------------------------------------------------------------

test('alta_esperando_persona_no_bloquea_a_otros_proyectos', async () => {
  const { padron, ceremonia, limpiar } = await montar();
  try {
    // El alta de A se abre y se queda esperando a una persona. No se toca el padron.
    const a = ceremonia.iniciar(entrada({ proyecto: 'proy-a', cuenta: '@taller_a', aparato: 'movil-1' }));
    assert.strictEqual(a.ok, true, a.motivo);
    assert.strictEqual(a.estado_alta, 'esperando_persona', 'el alta nace esperando persona');
    assert.strictEqual(a.alta.sesion.abierta, false, 'el puente no abre la sesion');
    assert.strictEqual(padron.foto().asientos.length, 0, 'antes de la persona no se inscribe nada');

    // Mientras A espera, el proyecto B se da de alta y queda operativo.
    const b = ceremonia.iniciar(entrada({ proyecto: 'proy-b', cuenta: '@taller_b', aparato: 'movil-2' }));
    assert.strictEqual(b.ok, true, b.motivo);
    const bHecha = await ceremonia.abrir_sesion(b.clave, {
      quien: 'dueno',
      momento: M1,
      mirada: mirada('taller_b'),
      prueba: prueba('mirar')
    });
    assert.strictEqual(bHecha.ok, true, bHecha.motivo || bHecha.paso_faltante);
    assert.strictEqual(bHecha.estado_alta, 'operativa', 'B queda operativa sin esperar a A');

    // A sigue exactamente donde estaba: esperando persona, sin haber escrito nada.
    const aAhora = ceremonia.estado(a.clave).alta;
    assert.strictEqual(aAhora.estado, 'esperando_persona', 'A sigue esperando persona');
    assert.strictEqual(aAhora.recorrido.length, 0, 'A no ha recorrido ningun paso todavia');
    assert.deepStrictEqual(ceremonia.esperando_persona().map((x) => x.proyecto), ['proy-a']);

    // El padron tiene la cuenta de B y solo la de B.
    const foto = padron.foto();
    assert.strictEqual(foto.asientos.length, 1, 'solo B se ha inscrito');
    assert.strictEqual(foto.asientos[0].cuenta, 'taller_b');
    assert.strictEqual(padron_puro.cuentas_de(foto, 'proy-a').length, 0, 'el proyecto A no tiene nada inscrito');

    // Y cuando la persona aparece, A tambien termina. Nadie quedo bloqueado.
    const aHecha = await ceremonia.abrir_sesion(a.clave, {
      quien: 'dueno',
      momento: M2,
      mirada: mirada('taller_a'),
      prueba: prueba('mirar')
    });
    assert.strictEqual(aHecha.ok, true, aHecha.motivo || aHecha.paso_faltante);
    assert.strictEqual(aHecha.estado_alta, 'operativa');

    const final = padron.foto();
    assert.strictEqual(final.asientos.length, 2, 'las dos cuentas estan inscritas');
    assert.strictEqual(padron_puro.cuentas_de(final, 'proy-a').length, 1);
    assert.strictEqual(padron_puro.cuentas_de(final, 'proy-b').length, 1);
    assert.deepStrictEqual(ceremonia.esperando_persona(), [], 'nadie queda esperando');
    assert.strictEqual(ceremonia.estado().total, 2, 'dos ceremonias, cada una la suya');
  } finally {
    await limpiar();
  }
});

// ---------------------------------------------------------------------------
// 2 · los siete pasos, en orden, y el alta declara donde esta
// ---------------------------------------------------------------------------

test('el_alta_recorre_los_siete_pasos_y_declara_donde_esta', async () => {
  const { padron, ceremonia, limpiar } = await montar();
  try {
    // Los siete pasos declarados, en el orden que el plano exige.
    assert.deepStrictEqual(alta.PASO_IDS, [
      'padron.inscribir',
      'ficha.declarar',
      'catalogo.recetas_vigentes',
      'ventana.declarar',
      'nivel.declarar',
      'ensayo.ejecutar',
      'primera_operacion.leer'
    ]);

    const inicio = ceremonia.iniciar(entrada());
    assert.strictEqual(inicio.ok, true, inicio.motivo);
    assert.strictEqual(inicio.pasos, 7, 'el alta declara sus siete pasos');
    assert.strictEqual(inicio.alta.pasos.length, 7);
    assert.ok(inicio.donde_esta.startsWith('esperando_persona'), 'declara donde esta desde el minuto cero');

    // La sesion la abre una PERSONA: ni el agente ni el sistema.
    const porAgente = await ceremonia.abrir_sesion(inicio.clave, { quien: 'agente', momento: M1 });
    assert.strictEqual(porAgente.ok, false);
    assert.strictEqual(porAgente.motivo, 'la_sesion_la_abre_una_persona');
    assert.strictEqual(padron.foto().asientos.length, 0, 'un intento sin persona no escribe nada');

    const hecha = await ceremonia.abrir_sesion(inicio.clave, {
      quien: 'dueno',
      momento: M1,
      mirada: mirada('taller_a'),
      prueba: prueba('mirar')
    });
    assert.strictEqual(hecha.ok, true, hecha.motivo || hecha.paso_faltante);
    assert.strictEqual(hecha.estado_alta, 'operativa');
    assert.strictEqual(hecha.cuenta_operativa, true);

    // Recorrido: siete pasos, en orden, todos dichos.
    const a = hecha.alta;
    assert.strictEqual(a.recorrido.length, 7, 'siete pasos recorridos');
    assert.deepStrictEqual(a.recorrido.map((p) => p.paso), alta.PASO_IDS, 'en el orden del plano');
    assert.deepStrictEqual(a.recorrido.map((p) => p.ok), [true, true, true, true, true, true, true]);
    assert.strictEqual(a.paso_actual, null, 'sin paso pendiente: cerrada');
    assert.ok(/^operativa: /.test(a.donde_esta), 'declara que esta operativa y por que');

    // Lo que cada pieza dejo en la ceremonia (no reimplementado aqui).
    assert.strictEqual(a.asiento.cuenta, 'taller_a');
    assert.strictEqual(a.asiento.proyecto, 'proy-a');
    assert.strictEqual(a.ficha.cuenta, 'taller_a');
    assert.strictEqual(a.ficha_modo, 'lectura', 'sin voz declarada, la ficha solo lee');
    assert.strictEqual(a.puede_operar, false, 'sin voz no se opera, aunque el alta se cierre');
    assert.strictEqual(a.recetas.length, 1, 'una receta vigente puesta a disposicion');
    assert.strictEqual(a.ventana_servicio.criterio, alta.VENTANA_POR_DEFECTO);
    assert.strictEqual(a.ventana_servicio.origen, 'W7_por_defecto', 'W7 se declara como default, no se inventa');
    assert.strictEqual(a.nivel.nivel, 'borrador', 'sin nivel declarado, el conservador (Q3)');
    assert.strictEqual(a.nivel.origen, 'sin_declarar');
    assert.strictEqual(a.ensayo.apto, true);
    assert.strictEqual(a.prueba.capacidad, 'mirar');
    assert.strictEqual(a.prueba.veredicto, 'ocurrio');

    // En el padron hay UNA cuenta operativa, y es la que se cerro.
    const foto = padron.foto();
    assert.strictEqual(foto.asientos.length, 1);
    assert.strictEqual(padron_puro.consultar(foto, { cuenta: '@taller_a' }).asiento.estado, 'vigente');
    assert.strictEqual(ceremonia.iniciar(entrada()).motivo, 'alta_ya_cerrada', 'una cuenta operativa no se re-da de alta: se traspasa');
  } finally {
    await limpiar();
  }
});

// ---------------------------------------------------------------------------
// 3 · si un paso falta, se nombra y se para ahi (no se salta al siguiente)
// ---------------------------------------------------------------------------

test('el_alta_se_para_nombrando_el_paso_que_falta_y_lo_retoma_ahi', async () => {
  const { ceremonia, limpiar } = await montar();
  try {
    const inicio = ceremonia.iniciar(entrada({ cuenta: '@taller_c', aparato: 'movil-3' }));
    assert.strictEqual(inicio.ok, true, inicio.motivo);

    // Sin la mirada del aparato, el ensayo no se puede hacer: se para EN el ensayo.
    const sinMirada = await ceremonia.abrir_sesion(inicio.clave, { quien: 'dueno', momento: M1 });
    assert.strictEqual(sinMirada.ok, false);
    assert.strictEqual(sinMirada.paso_faltante, 'ensayo.ejecutar', 'nombra el paso que falta');
    assert.strictEqual(sinMirada.pieza, 'A4.3 · EnsayoEnSeco');
    assert.strictEqual(sinMirada.estado_alta, 'detenida');
    assert.strictEqual(sinMirada.pasos_hechos, 5, 'los cinco anteriores si se hicieron');
    assert.strictEqual(sinMirada.continuable, true);
    const recorrido = sinMirada.alta.recorrido.map((p) => p.paso);
    assert.deepStrictEqual(recorrido, alta.PASO_IDS.slice(0, 5).concat('ensayo.ejecutar'),
      'no hay rastro de los pasos 6 y 7: no se salto al siguiente');
    assert.ok(/detenida en ensayo\.ejecutar/.test(sinMirada.donde_esta), sinMirada.donde_esta);

    // Y sin prueba tampoco: la cuenta no esta operativa hasta que hay primera lectura.
    const conMirada = await ceremonia.continuar(inicio.clave, { momento: M1, mirada: mirada('taller_c') });
    assert.strictEqual(conMirada.ok, false);
    assert.strictEqual(conMirada.paso_faltante, 'primera_operacion.leer');
    assert.strictEqual(conMirada.motivo, 'sin_prueba_de_la_primera_operacion');
    assert.strictEqual(conMirada.estado_alta, 'detenida');

    // Retomada EN EL PASO donde se paro: no se reinicia ni se reinscribe la cuenta.
    const final = await ceremonia.continuar(inicio.clave, { momento: M2, mirada: mirada('taller_c'), prueba: prueba('mirar') });
    assert.strictEqual(final.ok, true, final.motivo || final.paso_faltante);
    assert.strictEqual(final.estado_alta, 'operativa');
    const hechos = final.alta.recorrido.filter((p) => p.ok).map((p) => p.paso);
    assert.deepStrictEqual(hechos, alta.PASO_IDS, 'los siete, una vez cada uno, en orden');
    assert.strictEqual(final.alta.asiento.cuenta, 'taller_c');
  } finally {
    await limpiar();
  }
});

// ---------------------------------------------------------------------------
// 4 · la primera operacion es LEER; el resto se rechaza con su nombre
// ---------------------------------------------------------------------------

test('la_primera_operacion_no_estrena_publicando', async () => {
  const { ceremonia, limpiar } = await montar();
  try {
    const inicio = ceremonia.iniciar(entrada({ cuenta: '@taller_d', aparato: 'movil-4' }));
    const r = await ceremonia.abrir_sesion(inicio.clave, {
      quien: 'dueno',
      momento: M1,
      mirada: mirada('taller_d'),
      prueba: prueba('publicar')
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'primera_operacion_no_es_lectura');
    assert.strictEqual(r.paso_faltante, 'primera_operacion.leer');
    assert.strictEqual(r.estado_alta, 'detenida', 'no se cierra el alta con un estreno publico');

    // Un veredicto sin evidencia tampoco: la espera agotada no prueba nada.
    const sinEvidencia = await ceremonia.continuar(inicio.clave, {
      momento: M1,
      mirada: mirada('taller_d'),
      prueba: { capacidad: 'mirar', veredicto: 'ocurrio' }
    });
    assert.strictEqual(sinEvidencia.ok, false);
    assert.strictEqual(sinEvidencia.motivo, 'prueba_no_concluyente');
  } finally {
    await limpiar();
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__alta] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__alta] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
