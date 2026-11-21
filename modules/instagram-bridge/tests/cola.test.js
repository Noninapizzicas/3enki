'use strict';

/**
 * instagram-bridge · G3 · ColaDeTrabajos (CUSTODIO)
 *
 * La promesa de esta pieza es una y es dura: NUNCA dos trabajos en curso para
 * la misma cuenta. Dos tomas simultaneas, dos pestanas o dos reintentos abren
 * dos veces el mismo editor y publican dos veces; la cola lo impide por
 * construccion (`tomar_siguiente` se niega) y lo comprueba sobre el disco
 * (`auditar`), porque un fallo de codigo no puede quedar escondido.
 *
 * Ademas:
 *   - el orden es el de G4 (FIFO con urgencia), no el de llegada a secas;
 *   - la cuenta ocupa la CUENTA, no el proyecto: dos cuentas del mismo proyecto
 *     pueden trabajar a la vez;
 *   - nada dura para siempre: lo caducado se archiva y deja de ocupar;
 *   - lo cerrado va al historial: la cola no borra;
 *   - sin sello (P1), con secreto (V1) o con una accion sin precio, no entra;
 *   - el custodio escribe single-writer, atomico, y un fichero roto NO se pisa.
 *
 * Ejecutar: node modules/instagram-bridge/tests/cola.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const cola = require('../ritmo/cola');
const { crear } = require('../ritmo');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T10:00:00Z';
const M2 = '2026-11-11T10:05:00Z';
const M3 = '2026-11-11T10:10:00Z';
const M4 = '2026-11-11T10:15:00Z';

function entrada(opts = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    aparato: 'movil-1',
    momento: M1,
    quien: 'dueno',
    accion: 'publicar',
    urgencia: 0,
    motivo: 'publicar el post del martes'
  }, opts);
}

function encolar(estado, opts = {}) {
  const r = cola.enconlar(estado, entrada(opts));
  assert.strictEqual(r.ok, true, `no se pudo encolar: ${r.motivo} ${JSON.stringify(r.invalidos || [])}`);
  return r.estado;
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA: nunca dos en curso para la misma cuenta
// ---------------------------------------------------------------------------

test('nunca_dos_en_curso_para_la_misma_cuenta', () => {
  // Dos trabajos en la misma cuenta.
  let e = cola.estado_vacio();
  e = encolar(e, { accion: 'publicar', momento: M1 });
  e = encolar(e, { accion: 'leer', momento: M2, urgencia: 0 });

  // La primera toma entrega uno y lo pone EN CURSO.
  const primera = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M3 });
  assert.strictEqual(primera.ok, true, primera.motivo);
  assert.ok(primera.trabajo, 'tiene que entregar un trabajo');
  assert.strictEqual(primera.trabajo.estado, 'en_curso');
  assert.strictEqual(primera.trabajo.accion, 'publicar', 'G4: publicar va antes que leer');
  e = primera.estado;

  // La segunda toma, con la cuenta ocupada, se NIEGA. No "elige otro": se niega.
  for (const momento of [M3, M4]) {
    const segunda = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento });
    assert.strictEqual(segunda.ok, false, 'con un trabajo en curso no se entrega otro');
    assert.strictEqual(segunda.motivo, 'cuenta_ocupada');
    assert.strictEqual(segunda.en_curso, primera.trabajo.id, 'dice cual esta en curso');
    assert.strictEqual(segunda.estado, undefined, 'un rechazo no devuelve estado nuevo');
    assert.strictEqual(segunda.trabajo, undefined, 'un rechazo no entrega trabajo');
  }

  // El estado no ha cambiado: sigue habiendo UN en curso y uno pendiente.
  assert.strictEqual(e.trabajos.filter((t) => t.estado === 'en_curso').length, 1);
  assert.strictEqual(e.trabajos.filter((t) => t.estado === 'pendiente').length, 1);

  // Se cierra el primero y entonces SI se puede tomar el segundo.
  const cierre = cola.cerrar(e, { id: primera.trabajo.id, desenlace: 'hecho', momento: M4 });
  assert.strictEqual(cierre.ok, true, cierre.motivo);
  e = cierre.estado;

  const tercera = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M4 });
  assert.strictEqual(tercera.ok, true, tercera.motivo);
  assert.strictEqual(tercera.trabajo.accion, 'leer');
  assert.notStrictEqual(tercera.trabajo.id, primera.trabajo.id, 'es el OTRO trabajo');
  e = tercera.estado;

  // Y de nuevo: uno en curso, ninguno pendiente.
  assert.strictEqual(e.trabajos.filter((t) => t.estado === 'en_curso').length, 1);

  // La auditoria del almacen vuelve a comprobarlo: si alguien escribe dos en
  // curso a mano, el custodio lo ve antes de guardar.
  const roto = JSON.parse(JSON.stringify(e));
  roto.trabajos.push(Object.assign({}, roto.trabajos[0], { id: 't-999', secuencia: 99 }));
  roto.secuencia = 99;
  const auditoria = cola.auditar(roto);
  assert.strictEqual(auditoria.ok, false, 'dos en curso en la misma cuenta es un exceso');
  assert.ok(auditoria.problemas.some((p) => p.motivo === 'cuenta_ocupada'),
    `la auditoria tiene que nombrar la regla rota: ${JSON.stringify(auditoria.problemas)}`);
});

test('la_cuenta_se_ocupa_por_cuenta_y_no_por_proyecto', () => {
  let e = cola.estado_vacio();
  e = encolar(e, { cuenta: '@taller_a', proyecto: 'proy-a', momento: M1 });
  e = encolar(e, { cuenta: '@taller_b', proyecto: 'proy-a', aparato: 'movil-2', momento: M2 });

  // Dos cuentas del MISMO proyecto: cada una con su trabajo en curso.
  const a = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M3 });
  assert.strictEqual(a.ok, true, a.motivo);
  e = a.estado;

  const b = cola.tomar_siguiente(e, { cuenta: '@taller_b', momento: M3 });
  assert.strictEqual(b.ok, true, 'el limite es de la cuenta, no del proyecto: ' + b.motivo);
  e = b.estado;

  assert.strictEqual(e.trabajos.filter((t) => t.estado === 'en_curso').length, 2, 'una por cuenta');
  assert.strictEqual(cola.auditar(e).ok, true, 'dos cuentas distintas en curso NO es un exceso');

  // Una cuenta sin trabajos no entrega nada, pero tampoco falla.
  const vacia = cola.tomar_siguiente(e, { cuenta: '@taller_c', momento: M3 });
  assert.strictEqual(vacia.ok, true);
  assert.strictEqual(vacia.trabajo, null);
  assert.strictEqual(vacia.motivo, 'sin_trabajo');
});

test('cerrar_deja_la_cuenta_libre_y_no_borra_nada', () => {
  let e = cola.estado_vacio();
  e = encolar(e, { momento: M1 });
  const t = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M2 });
  e = t.estado;

  // Cerrar sin desenlace valido no cierra.
  const sinDesenlace = cola.cerrar(e, { id: t.trabajo.id, momento: M3 });
  assert.strictEqual(sinDesenlace.ok, false);
  assert.strictEqual(sinDesenlace.motivo, 'desenlace_invalido');
  assert.deepStrictEqual(sinDesenlace.desenlaces, ['hecho', 'fallado', 'caducado', 'abandonado']);

  // Cerrar algo que no esta en curso tampoco.
  const cierre = cola.cerrar(e, { id: t.trabajo.id, desenlace: 'hecho', momento: M3, detalle: 'salio' });
  assert.strictEqual(cierre.ok, true, cierre.motivo);
  assert.strictEqual(cierre.cuenta_libre, true);
  e = cierre.estado;

  const dosVeces = cola.cerrar(e, { id: t.trabajo.id, desenlace: 'hecho', momento: M4 });
  assert.strictEqual(dosVeces.ok, false);
  assert.strictEqual(dosVeces.motivo, 'trabajo_desconocido', 'ya no esta en la cola viva');
  // ... pero SI esta en el historial, con su desenlace y su detalle.
  assert.strictEqual(e.historial.length, 1);
  assert.strictEqual(e.historial[0].estado, 'hecho');
  assert.strictEqual(e.historial[0].detalle, 'salio');
  assert.strictEqual(e.historial[0].cerrado_en, M3);
  assert.strictEqual(e.trabajos.length, 0, 'lo cerrado sale de la cola viva...');
  assert.strictEqual(cola.auditar(e).ok, true);
});

test('devolver_libera_la_cuenta_sin_cerrar_el_trabajo', () => {
  let e = cola.estado_vacio();
  e = encolar(e, { momento: M1 });
  const t = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M2 });
  e = t.estado;

  const devuelto = cola.devolver(e, { id: t.trabajo.id, momento: M3, detalle: 'la app se quedo cargando' });
  assert.strictEqual(devuelto.ok, true, devuelto.motivo);
  assert.strictEqual(devuelto.trabajo.estado, 'pendiente');
  e = devuelto.estado;

  assert.strictEqual(cola.en_curso_de(e, '@taller_a'), null, 'la cuenta queda libre');
  assert.strictEqual(e.trabajos.length, 1, 'el trabajo sigue vivo');
  assert.strictEqual(e.trabajos[0].intentos, 1, 'el intento queda contado');
  assert.strictEqual(e.trabajos[0].detalle, 'la app se quedo cargando');

  // Se puede volver a tomar (reintento), y sigue siendo el mismo trabajo.
  const otra = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M4 });
  assert.strictEqual(otra.ok, true, otra.motivo);
  assert.strictEqual(otra.trabajo.id, t.trabajo.id);
  assert.strictEqual(otra.trabajo.intentos, 2);
});

// ---------------------------------------------------------------------------
// 2 · el orden lo pone G4, no la llegada
// ---------------------------------------------------------------------------

test('el_orden_es_fifo_con_urgencia', () => {
  let e = cola.estado_vacio();
  e = encolar(e, { accion: 'pulso', momento: M1 });
  e = encolar(e, { accion: 'leer', momento: M1 });
  e = encolar(e, { accion: 'publicar', momento: M1, urgencia: 3 });
  e = encolar(e, { accion: 'leer', momento: M1, urgencia: 3 });

  // publicar con urgencia primero; luego el leer urgente; luego el leer normal; pulso al final.
  const orden = [];
  for (let i = 0; i < 4; i += 1) {
    const t = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M2 });
    assert.strictEqual(t.ok, true, t.motivo);
    orden.push(t.trabajo.accion);
    e = cola.cerrar(t.estado, { id: t.trabajo.id, desenlace: 'hecho', momento: M3 }).estado;
  }
  assert.deepStrictEqual(orden, ['publicar', 'leer', 'leer', 'pulso']);

  // El listado tambien viene ordenado (y dice cuantos hay de cada).
  const listado = cola.listar(e, { cuenta: '@taller_a' });
  assert.strictEqual(listado.ok, true);
  assert.strictEqual(listado.total, 0, 'ya no queda nada vivo');
  assert.strictEqual(e.historial.length, 4, 'pero los cuatro estan en el historial');
});

test('nada_dura_para_siempre_lo_caducado_se_archiva', () => {
  let e = cola.estado_vacio();
  e = encolar(e, { accion: 'leer', momento: M1, expira_en: '2026-11-11T10:30:00Z' });

  // Antes de expirar, se entrega.
  const vivo = cola.tomar_siguiente(e, { cuenta: '@taller_a', momento: M2 });
  assert.strictEqual(vivo.ok, true, vivo.motivo);
  assert.strictEqual(vivo.trabajo.accion, 'leer');

  // Un trabajo que nace caducado no se encola.
  const nacidoMuerto = cola.enconlar(e, entrada({ momento: M2, expira_en: M1 }));
  assert.strictEqual(nacidoMuerto.ok, false);
  assert.strictEqual(nacidoMuerto.motivo, 'entrada_invalida');
  assert.deepStrictEqual(nacidoMuerto.invalidos, ['expira_en']);

  // Pasado el plazo, el pendiente se archiva y deja de ocupar sitio.
  let f = cola.estado_vacio();
  f = encolar(f, { accion: 'comentar', momento: M1, expira_en: M2 });
  assert.strictEqual(f.trabajos.length, 1);

  const tarde = cola.tomar_siguiente(f, { cuenta: '@taller_a', momento: M4 });
  assert.strictEqual(tarde.ok, true, tarde.motivo);
  assert.strictEqual(tarde.trabajo, null, 'un trabajo caducado no se entrega');
  assert.deepStrictEqual(tarde.archivados, ['t-00001'], 'y se dice cual se archivo');
  assert.strictEqual(tarde.estado.historial[0].estado, 'caducado');
  assert.strictEqual(tarde.estado.trabajos.length, 0);

  // Sin `expira_en` se pone una vida por defecto: nunca null.
  const sinPlazo = cola.enconlar(cola.estado_vacio(), entrada({ momento: M1 }));
  assert.strictEqual(sinPlazo.ok, true, sinPlazo.motivo);
  assert.strictEqual(sinPlazo.trabajo.expira_en, '2026-11-11T14:00:00Z',
    `vida por defecto de ${cola.VIDA_POR_DEFECTO_MINUTOS} min`);
});

// ---------------------------------------------------------------------------
// 3 · lo que no entra: sin sello, con secreto, con accion sin precio
// ---------------------------------------------------------------------------

test('sin_sello_con_secreto_o_sin_precio_no_entra', () => {
  const e = cola.estado_vacio();

  // P1: el sello es el quinteto. Sin `quien` no hay dueno.
  const sinQuien = cola.enconlar(e, entrada({ quien: undefined }));
  assert.strictEqual(sinQuien.ok, false);
  assert.strictEqual(sinQuien.motivo, 'sin_sello');
  assert.ok(sinQuien.faltan.includes('quien'), 'el hueco se nombra');

  const sinAparato = cola.enconlar(e, entrada({ aparato: undefined }));
  assert.strictEqual(sinAparato.motivo, 'sin_sello');
  assert.ok(sinAparato.faltan.includes('aparato'));

  // Una accion que G1 no sabe cobrar no se regula: no entra.
  const sinPrecio = cola.enconlar(e, entrada({ accion: 'teleportar' }));
  assert.strictEqual(sinPrecio.ok, false);
  assert.strictEqual(sinPrecio.motivo, 'accion_desconocida');
  assert.ok(sinPrecio.acciones.includes('publicar'), 'dice cuales valen');

  // V1: un token en la cola es un token en el disco.
  const conSecreto = cola.enconlar(e, entrada({ motivo: 'usar access_token: abcd1234efgh5678 para entrar' }));
  assert.strictEqual(conSecreto.ok, false, 'un token en el motivo de un trabajo no entra');
  assert.strictEqual(conSecreto.motivo, 'secreto_recibido');
  assert.strictEqual(conSecreto.guardado, false);
  assert.ok(conSecreto.rutas.includes('motivo'), `la ruta se nombra: ${JSON.stringify(conSecreto.rutas)}`);

  // Urgencia fuera de rango.
  const malaUrgencia = cola.enconlar(e, entrada({ urgencia: 9 }));
  assert.strictEqual(malaUrgencia.ok, false);
  assert.deepStrictEqual(malaUrgencia.invalidos, ['urgencia']);

  // Id repetido.
  const uno = cola.enconlar(e, entrada({ id: 'fijo' }));
  assert.strictEqual(uno.ok, true);
  const repetido = cola.enconlar(uno.estado, entrada({ id: 'fijo', momento: M2 }));
  assert.strictEqual(repetido.ok, false);
  assert.strictEqual(repetido.motivo, 'trabajo_ya_encolado');

  // Y el estado no se ha movido con ninguno de los rechazos.
  assert.strictEqual(e.trabajos.length, 0, 'un rechazo no muta el estado');
});

test('cada_trabajo_nace_sellado_con_la_cuenta_del_ambito', () => {
  const e = encolar(cola.estado_vacio(), {});
  const t = e.trabajos[0];
  assert.strictEqual(t.sello.proyecto, 'proy-a');
  assert.strictEqual(t.sello.cuenta, '@taller_a');
  assert.strictEqual(t.sello.aparato, 'movil-1');
  assert.strictEqual(t.sello.momento, M1);
  assert.strictEqual(t.sello.quien, 'dueno');
  assert.strictEqual(t.almacen, 'colas', 'P3: el almacen se declara en el asiento');
  assert.strictEqual(t.coste, 12, 'el coste se congela al encolar (G1)');
  assert.strictEqual(cola.auditar(e).ok, true);
});

// ---------------------------------------------------------------------------
// 4 · el custodio: single-writer, atomico, y no pisa lo roto
// ---------------------------------------------------------------------------

test('el_custodio_es_single_writer_y_atomico', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'enki-cola-'));
  try {
    const custodio = crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, true, 'sin fichero se arranca vacio');

    // Diez encolados A LA VEZ: si el candado fallara, se perderian trabajos.
    const altas = await Promise.all(Array.from({ length: 10 }, (_, i) => custodio.encolar(entrada({
      accion: 'leer',
      motivo: `trabajo ${i}`,
      momento: M1
    }))));
    for (const a of altas) assert.strictEqual(a.ok, true, a.motivo);

    const foto = custodio.foto();
    assert.strictEqual(foto.cola.trabajos.length, 10, 'los diez estan, no nueve');
    assert.strictEqual(new Set(foto.cola.trabajos.map((t) => t.id)).size, 10, 'y con ids distintos');
    assert.strictEqual(foto.cola.secuencia, 10, 'la secuencia no se repite');

    // Del disco se lee lo mismo: la escritura llego entera.
    const enDisco = JSON.parse(await fsp.readFile(path.join(dir, 'cola.json'), 'utf8'));
    assert.strictEqual(enDisco.trabajos.length, 10);
    assert.strictEqual(cola.auditar(enDisco).ok, true);

    // Dos tomas simultaneas: UNA entrega y la otra se niega (single-writer).
    const [t1, t2] = await Promise.all([
      custodio.tomar({ cuenta: '@taller_a', momento: M2 }),
      custodio.tomar({ cuenta: '@taller_a', momento: M2 })
    ]);
    const ok = [t1, t2].filter((r) => r.ok === true && r.trabajo);
    const no = [t1, t2].filter((r) => r.ok === false);
    assert.strictEqual(ok.length, 1, `una sola toma puede entregar: ${JSON.stringify([t1.motivo, t2.motivo])}`);
    assert.strictEqual(no.length, 1);
    assert.strictEqual(no[0].motivo, 'cuenta_ocupada');

    // No queda ningun temporal a medias.
    const restos = (await fsp.readdir(dir)).filter((f) => f.includes('.tmp'));
    assert.deepStrictEqual(restos, [], 'la escritura atomica no deja temporales');

    // Un ambito sin criterio no lista la cola entera (P2).
    const sinAmbito = await custodio.listarTrabajos({});
    assert.strictEqual(sinAmbito.ok, false);
    assert.strictEqual(sinAmbito.motivo, 'ambito_incompleto');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('un_fichero_roto_no_se_pisa', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'enki-cola-rota-'));
  try {
    const ruta = path.join(dir, 'cola.json');
    const basura = '{ esto no es una cola';
    await fsp.writeFile(ruta, basura, 'utf8');

    const custodio = crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, false);
    assert.ok(['cola_ilegible', 'esquema_desconocido'].includes(carga.cola), `motivo: ${carga.cola}`);

    const r = await custodio.encolar(entrada());
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_cola');

    const listado = await custodio.listarTrabajos({ cuenta: '@taller_a' });
    assert.strictEqual(listado.ok, false);
    assert.strictEqual(listado.motivo, 'sin_cola');

    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), basura, 'la cola rota no se machaca');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('el_fichero_del_repo_es_una_cola_valida_y_vacia', async () => {
  const ruta = path.resolve(__dirname, '../../../storage/instagram-bridge/cola.json');
  const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));
  assert.strictEqual(datos.esquema, 'cola-trabajos-v1');
  assert.deepStrictEqual(datos.trabajos, [], 'la cola del repo nace vacia y sin trabajos inventados');
  assert.deepStrictEqual(datos.historial, []);
  assert.strictEqual(datos.secuencia, 0);
  assert.strictEqual(cola.auditar(datos).ok, true);
});

// ---------------------------------------------------------------------------
// 5 · el contrato del bus: handlers reales y par de fallo
// ---------------------------------------------------------------------------

test('cada_handler_del_manifest_existe_y_publica_su_par', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'enki-ritmo-bus-'));
  try {
    const manifest = JSON.parse(await fsp.readFile(path.resolve(__dirname, '../ritmo/module.json'), 'utf8'));
    assert.strictEqual(manifest.name, 'ritmo');
    assert.strictEqual(manifest.version, '0.1.0');

    const publicados = [];
    const custodio = crear({ directorio: dir });
    custodio.eventBus = {
      publish: (topic, payload) => publicados.push({ topic, payload }),
      subscribe: () => () => {}
    };
    custodio.logger = { info: () => {}, error: () => {} };
    await custodio.cargar();

    // Todo handler declarado existe en la clase y todo publish es un par real.
    for (const sub of manifest.subscribes) {
      assert.strictEqual(typeof custodio[sub.handler], 'function', `falta el handler ${sub.handler}`);
      assert.ok(sub.event.endsWith('.request'), `${sub.event} tiene que ser un .request`);
    }
    const publica = new Set(manifest.publishes.map((p) => p.event));
    for (const sub of manifest.subscribes) {
      const base = sub.event.slice(0, -'.request'.length);
      assert.ok(publica.has(`${base}.response`), `falta ${base}.response en el manifest`);
      assert.ok(publica.has(`${base}.failed`), `falta ${base}.failed en el manifest`);
    }

    // Un exito publica la response correlada...
    const ok = await custodio.onEncolarRequest({ data: { request_id: 'r-1', proyecto: 'proy-a', cuenta: '@taller_a', aparato: 'movil-1', momento: M1, quien: 'dueno', accion: 'publicar' } });
    assert.strictEqual(ok.ok, true, ok.motivo);
    assert.strictEqual(ok.request_id, 'r-1');
    assert.strictEqual(publicados.length, 1);
    assert.strictEqual(publicados[0].topic, 'instagram.ritmo.trabajo.encolar.response');
    assert.strictEqual(publicados[0].payload.estado, undefined, 'la response NO publica el almacen entero');

    // ... y un rechazo publica el par `.failed`, nunca una response con ok:false.
    const malo = await custodio.onEncolarRequest({ data: { request_id: 'r-2', proyecto: 'proy-a', cuenta: '@taller_a', aparato: 'movil-1', momento: M1, quien: 'dueno', accion: 'teleportar' } });
    assert.strictEqual(malo.ok, false);
    assert.strictEqual(publicados.length, 2);
    assert.strictEqual(publicados[1].topic, 'instagram.ritmo.trabajo.encolar.failed');
    assert.strictEqual(publicados[1].payload.motivo, 'accion_desconocida');
    assert.strictEqual(publicados[1].payload.request_id, 'r-2');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__cola] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__cola] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
