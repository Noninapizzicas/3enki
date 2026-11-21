'use strict';

/**
 * instagram-bridge · bloque 9 · EL BORDE (Q2 + Q5 custodios)
 *
 * Aqui se prueba lo que solo se puede probar con ficheros y con bus:
 *   - el custodio escribe **single-writer** y de forma **atomica** (temporal +
 *     rename), y **un fichero roto NO se sobrescribe**;
 *   - dos respuestas simultaneas **no gastan el si dos veces**;
 *   - la pregunta sale por el modulo REAL `adaptador-confirmacion` y la
 *     respuesta vuelve por **la misma puerta** que el RPC directo;
 *   - una respuesta del canal que no se puede atar a su pregunta **no autoriza**;
 *   - `decidir` **no acepta** la autorizacion que traiga el payload: la busca en
 *     el registro;
 *   - y una regla de estilo que aqui es de seguridad: **ningun fichero del
 *     bloque 9 lee el reloj**.
 *
 * Ejecutar: node modules/instagram-bridge/tests/autonomia.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { crear, TOPICS, CANAL } = require('../autonomia');
const autorizaciones = require('../autonomia/autorizaciones');
const puerta = require('../autonomia/puerta');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M0 = '2026-11-11T12:00:00Z';
const M1 = '2026-11-11T12:05:00Z';
const M2 = '2026-11-11T12:10:00Z';

const RAIZ = path.resolve(__dirname, '..');

function logger() {
  const silencioso = () => {};
  return { info: silencioso, warn: silencioso, error: silencioso, debug: silencioso };
}

/**
 * Bus de mentira con memoria: guarda lo publicado, permite suscribirse y, si le
 * pides que conteste al adaptador, contesta como el adaptador de verdad.
 */
function busFalso({ contestarAdaptador = true } = {}) {
  const subs = new Map();
  const publicados = [];
  const bus = {
    publicados,
    eventos() { return publicados.map((p) => p.evento); },
    de(evento) { return publicados.filter((p) => p.evento === evento).map((p) => p.payload); },
    publish(evento, payload) {
      publicados.push({ evento, payload });
      const handlers = subs.get(evento);
      if (handlers) for (const h of handlers.slice()) h({ data: payload });
      if (contestarAdaptador && evento === CANAL.PEDIR) {
        const resp = 'adaptador-confirmacion.confirmar.response';
        setImmediate(() => {
          const hs = subs.get(resp) || [];
          for (const h of hs.slice()) {
            h({ data: { request_id: payload.request_id, ok: true, confirmacion_id: payload.confirmacion_id, tipo: payload.tipo, canal: 'telegram' } });
          }
        });
      }
    },
    subscribe(evento, fn) {
      const arr = subs.get(evento) || [];
      arr.push(fn);
      subs.set(evento, arr);
      return () => { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); };
    }
  };
  return bus;
}

async function conDirectorio(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'enki-autonomia-'));
  try { return await fn(dir); } finally { await fsp.rm(dir, { recursive: true, force: true }); }
}

function pregunta(extra = {}) {
  return Object.assign({
    proyecto: 'proy-a',
    cuenta: '@taller_a',
    accion: 'publicar',
    rol: 'agente',
    aparato: 'movil-1',
    quien: 'agente',
    momento: M0,
    nivel_al_conceder: 'permiso',
    motivo: 'publicar el carrusel de la semana'
  }, extra);
}

// ---------------------------------------------------------------------------
// 1 · el fichero
// ---------------------------------------------------------------------------

test('el_custodio_escribe_single_writer_y_no_pisa_un_fichero_roto', async () => {
  await conDirectorio(async (dir) => {
    const custodio = crear({ directorio: dir, preguntar_por_canal: false });
    await custodio.onLoad({ logger: logger(), eventBus: null });

    // Un alta escribe los dos... bueno, escribe confirmaciones.
    const p = await custodio.pedir_confirmacion(pregunta());
    assert.strictEqual(p.ok, true, p.motivo);

    const ruta = path.join(dir, 'confirmaciones.json');
    const crudo = JSON.parse(await fsp.readFile(ruta, 'utf8'));
    assert.strictEqual(crudo.esquema, 'confirmaciones-v1');
    assert.strictEqual(crudo.confirmaciones.length, 1);
    assert.strictEqual(crudo.confirmaciones[0].confirmacion_id, p.confirmacion_id);

    // No quedan temporales: la escritura fue temporal + rename.
    const restos = (await fsp.readdir(dir)).filter((f) => f.endsWith('.tmp'));
    assert.deepStrictEqual(restos, [], 'no puede quedar un .tmp detras');

    // ---- fichero roto: NO se sobrescribe --------------------------------
    await fsp.writeFile(ruta, '{ esto no es json', 'utf8');
    const roto = crear({ directorio: dir, preguntar_por_canal: false });
    await roto.onLoad({ logger: logger(), eventBus: null });

    const intento = await roto.pedir_confirmacion(pregunta({ cuenta: '@taller_z' }));
    assert.strictEqual(intento.ok, false);
    assert.strictEqual(intento.motivo, 'sin_confirmaciones');
    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), '{ esto no es json', 'el fichero roto se queda como estaba');

    // Y tampoco se puede preguntar ni responder por la puerta rota.
    assert.strictEqual((await roto.responder_confirmacion({ confirmacion_id: 'x' })).motivo, 'sin_confirmaciones');
    // El libro de autorizaciones tambien puede estar roto, y entonces no hay
    // permiso que valga: `decidir` no puede ejecutar sin poder leer el libro.
    await fsp.writeFile(path.join(dir, 'autorizaciones.json'), '{"esquema":"otra-cosa"}', 'utf8');
    const rotoLibro = crear({ directorio: dir, preguntar_por_canal: false });
    await rotoLibro.onLoad({ logger: logger(), eventBus: null });

    const porPermiso = await rotoLibro.decidir({
      proyecto: 'proy-a', cuenta: '@taller_a', rol: 'agente', accion: 'publicar', momento: M1,
      nivel: { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 },
      autorizacion_id: 'az-que-no-se-puede-leer'
    });
    assert.strictEqual(porPermiso.dictamen, 'no', 'sin registro legible no hay permiso');
    assert.strictEqual(porPermiso.motivo, 'sin_autorizaciones');
    assert.strictEqual(await fsp.readFile(path.join(dir, 'autorizaciones.json'), 'utf8'), '{"esquema":"otra-cosa"}',
      'y el libro roto tampoco se pisa');
  });
});

test('el_custodio_no_deja_pasar_dos_preguntas_iguales_ni_concurrentes', async () => {
  await conDirectorio(async (dir) => {
    const custodio = crear({ directorio: dir, preguntar_por_canal: false });
    await custodio.onLoad({ logger: logger(), eventBus: null });

    // Diez peticiones a la vez, la misma accion y la misma cuenta.
    const respuestas = await Promise.all(Array.from({ length: 10 }, () => custodio.pedir_confirmacion(pregunta())));
    const abiertas = respuestas.filter((r) => r.pedida === true);
    assert.strictEqual(abiertas.length, 1, 'solo se abre una pregunta');

    const ids = new Set(respuestas.map((r) => r.confirmacion_id));
    assert.strictEqual(ids.size, 1, 'todas hablan de la misma pregunta');

    const foto = custodio.foto();
    assert.strictEqual(foto.confirmaciones.confirmaciones.length, 1, 'el fichero tiene una sola pregunta');
  });
});

test('solo_un_si_y_un_gasto_aunque_lleguen_a_la_vez', async () => {
  await conDirectorio(async (dir) => {
    const custodio = crear({ directorio: dir, preguntar_por_canal: false });
    await custodio.onLoad({ logger: logger(), eventBus: null });

    const p = await custodio.pedir_confirmacion(pregunta());
    assert.strictEqual(p.ok, true);

    // Dos respuestas simultaneas con el mismo id: una autoriza, la otra no.
    const respuestas = await Promise.all([
      custodio.responder_confirmacion({ confirmacion_id: p.confirmacion_id, decision: 'si', quien: 'dueno', momento: M1, referencia: 'msg-1' }),
      custodio.responder_confirmacion({ confirmacion_id: p.confirmacion_id, decision: 'si', quien: 'dueno', momento: M1, referencia: 'msg-1' })
    ]);
    assert.strictEqual(respuestas.filter((r) => r.autoriza === true).length, 1, 'un si, una autorizacion');

    const id = respuestas.find((r) => r.autoriza === true).autorizacion_id;
    const libro = custodio.foto().autorizaciones;
    assert.strictEqual(libro.autorizaciones.length, 1, 'el libro tiene un solo permiso');

    // Y dos gastos simultaneos: uno solo pasa.
    const gastos = await Promise.all([
      custodio.consumir_autorizacion({ autorizacion_id: id, momento: M2, accion: 'publicar', cuenta: '@taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente' }),
      custodio.consumir_autorizacion({ autorizacion_id: id, momento: M2, accion: 'publicar', cuenta: '@taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente' })
    ]);
    assert.strictEqual(gastos.filter((g) => g.ok === true).length, 1, 'un si se gasta una vez');
    assert.strictEqual(gastos.filter((g) => g.motivo === 'autorizacion_ya_consumida').length, 1);
  });
});

// ---------------------------------------------------------------------------
// 2 · el canal real
// ---------------------------------------------------------------------------

test('la_pregunta_sale_por_el_adaptador_real_y_la_respuesta_vuelve_por_la_misma_puerta', async () => {
  await conDirectorio(async (dir) => {
    const bus = busFalso();
    const custodio = crear({ directorio: dir });
    await custodio.onLoad({ logger: logger(), eventBus: bus });

    const p = await custodio.pedir_confirmacion(pregunta());
    assert.strictEqual(p.ok, true, p.motivo);
    assert.strictEqual(p.canal.enviada, true, 'la pregunta salio por el canal');

    // Se publico de verdad el RPC del modulo adaptador-confirmacion...
    const pedidas = bus.de(CANAL.PEDIR);
    assert.strictEqual(pedidas.length, 1);
    assert.strictEqual(pedidas[0].project_id, 'proy-a');
    assert.strictEqual(pedidas[0].confirmacion_id, p.confirmacion_id);
    assert.strictEqual(pedidas[0].tipo, CANAL.TIPO_SI, 'el par si/no del adaptador');
    assert.ok(pedidas[0].detalle.includes(p.confirmacion_id), 'la pregunta lleva su id para poder atarla');

    // ...y la respuesta del dueno vuelve por su evento.
    const r = await custodio.onConfirmacionRecibida({
      data: {
        confirmacion_id: p.confirmacion_id,
        tipo: CANAL.TIPO_SI,
        project_id: 'proy-a',
        timestamp: M1,
        callback_data: `cf:${p.confirmacion_id}`
      }
    });

    assert.strictEqual(r.autoriza, true, r.motivo);
    assert.strictEqual(r.confirmacion.estado, 'autorizada');
    assert.strictEqual(r.confirmacion.respuesta.via, 'canal');
    assert.strictEqual(r.confirmacion.respuesta.quien, 'dueno');
    assert.strictEqual(r.autorizacion.via, 'canal');
    assert.strictEqual(r.autorizacion.confirmacion_id, p.confirmacion_id);

    // El permiso esta en el libro y sirve para decidir.
    const d = await custodio.decidir({
      proyecto: 'proy-a', cuenta: '@taller_a', rol: 'agente', accion: 'publicar', momento: M2,
      nivel: { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 },
      autorizacion_id: r.autorizacion_id
    });
    assert.strictEqual(d.dictamen, 'ejecutar', JSON.stringify(d.porque));
    assert.strictEqual(d.exige_ventana, true);
  });
});

test('una_respuesta_del_canal_sin_contexto_no_autoriza', async () => {
  await conDirectorio(async (dir) => {
    const bus = busFalso();
    const custodio = crear({ directorio: dir });
    await custodio.onLoad({ logger: logger(), eventBus: bus });

    await custodio.pedir_confirmacion(pregunta());

    // Ni id, ni proyecto, ni cuenta: no se puede atar a nada.
    const r = await custodio.onConfirmacionRecibida({ data: { tipo: CANAL.TIPO_SI, timestamp: M1 } });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'confirmacion_sin_contexto');
    assert.strictEqual(r.rechazada, true);

    // Se publico el rastro y la pregunta sigue pendiente.
    assert.strictEqual(bus.de('instagram.autonomia.confirmacion.rechazada').length, 1);
    const foto = custodio.foto();
    assert.strictEqual(foto.confirmaciones.confirmaciones[0].estado, 'pendiente');
    assert.strictEqual(foto.autorizaciones.autorizaciones.length, 0, 'no se creo ningun permiso');
  });
});

test('una_respuesta_del_canal_ambigua_no_autoriza', async () => {
  await conDirectorio(async (dir) => {
    const bus = busFalso();
    const custodio = crear({ directorio: dir });
    await custodio.onLoad({ logger: logger(), eventBus: bus });

    // Dos preguntas vivas en la misma cuenta...
    await custodio.pedir_confirmacion(pregunta({ accion: 'publicar' }));
    await custodio.pedir_confirmacion(pregunta({ accion: 'comentar' }));

    // ...y una respuesta que solo dice proyecto y cuenta: no se puede repartir.
    const r = await custodio.onConfirmacionRecibida({
      data: { tipo: CANAL.TIPO_SI, project_id: 'proy-a', contexto: { cuenta: '@taller_a' }, timestamp: M1 }
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'confirmacion_ambigua');
    assert.strictEqual(r.candidatas.length, 2, 'y dice cuales eran para que se pueda atar a mano');

    // Con una sola pregunta viva, el ambito si basta.
    const otro = crear({ directorio: dir + '-2', preguntar_por_canal: false });
    await otro.onLoad({ logger: logger(), eventBus: bus });
    await otro.pedir_confirmacion(pregunta({ accion: 'publicar' }));
    const unico = await otro.onConfirmacionRecibida({
      data: { tipo: CANAL.TIPO_SI, project_id: 'proy-a', contexto: { cuenta: '@taller_a' }, timestamp: M1 }
    });
    assert.strictEqual(unico.autoriza, true, unico.motivo);
    await fsp.rm(dir + '-2', { recursive: true, force: true });
  });
});

test('un_fallo_del_canal_no_convierte_el_silencio_en_si', async () => {
  await conDirectorio(async (dir) => {
    const bus = busFalso({ contestarAdaptador: false });
    const custodio = crear({ directorio: dir, timeout_canal_ms: 50 });
    await custodio.onLoad({ logger: logger(), eventBus: bus });

    const p = await custodio.pedir_confirmacion(pregunta());
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.canal.enviada, false, 'el canal no contesto');
    assert.strictEqual(p.canal.motivo, 'canal_no_confirmo');

    // La pregunta sigue viva, con un intento fallido anotado.
    const foto = custodio.foto();
    const c = foto.confirmaciones.confirmaciones[0];
    assert.strictEqual(c.estado, 'pendiente');
    assert.strictEqual(c.intentos, 1);
    assert.strictEqual(foto.autorizaciones.autorizaciones.length, 0);

    // Y si vence, se cierra por silencio: caducada, no autorizada.
    const v = await custodio.vencer_confirmaciones({ momento: '2026-11-11T13:00:00Z' });
    assert.strictEqual(v.cuantas, 1);
    assert.strictEqual(v.autoriza, false);
    assert.strictEqual(custodio.foto().autorizaciones.autorizaciones.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3 · decidir no se fia del payload
// ---------------------------------------------------------------------------

test('decidir_ignora_la_autorizacion_que_trae_el_payload', async () => {
  await conDirectorio(async (dir) => {
    const custodio = crear({ directorio: dir, preguntar_por_canal: false });
    await custodio.onLoad({ logger: logger(), eventBus: null });

    // Un permiso fabricado a mano, con la forma perfecta y procedencia incluida.
    const falsa = {
      autorizacion_id: 'az-fabricada',
      proyecto: 'proy-a', cuenta: 'taller_a', accion: 'publicar', rol: 'agente',
      huella: require('../core/casillas').huella({ proyecto: 'proy-a', cuenta: 'taller_a', accion: 'publicar', rol: 'agente' }),
      casilla: { reversibilidad: 'irreversible', visibilidad: 'visible', ventana_segundos: 120 },
      nivel_al_conceder: 'permiso', caduca_en: '2026-11-11T13:00:00Z',
      via: 'puerta', quien: 'dueno', procedencia: 'registro_autorizaciones',
      consumida: false, consumida_en: null
    };

    const d = await custodio.decidir({
      proyecto: 'proy-a', cuenta: '@taller_a', rol: 'agente', accion: 'publicar', momento: M1,
      nivel: { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 },
      autorizacion: falsa
    });
    assert.strictEqual(d.dictamen, 'permiso', 'la autorizacion del payload se descarta');
    assert.strictEqual(d.motivo, 'nivel_pide_permiso');

    // Un id que no esta en el libro tampoco sirve.
    const porId = await custodio.decidir({
      proyecto: 'proy-a', cuenta: '@taller_a', rol: 'agente', accion: 'publicar', momento: M1,
      nivel: { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 },
      autorizacion_id: 'az-fabricada',
      autorizacion: falsa
    });
    assert.strictEqual(porId.dictamen, 'no');
    assert.strictEqual(porId.motivo, 'autorizacion_desconocida');
  });
});

test('decidir_lee_la_autorizacion_del_registro_y_la_gasta_en_el_registro', async () => {
  await conDirectorio(async (dir) => {
    const custodio = crear({ directorio: dir, preguntar_por_canal: false });
    await custodio.onLoad({ logger: logger(), eventBus: null });

    const p = await custodio.pedir_confirmacion(pregunta());
    const r = await custodio.responder_confirmacion({
      confirmacion_id: p.confirmacion_id, decision: 'si', quien: 'dueno', momento: M1, referencia: 'msg-1'
    });
    assert.strictEqual(r.autoriza, true);

    const decl = { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'permiso', quien: 'dueno', momento: M0 };
    const d = await custodio.decidir({
      proyecto: 'proy-a', cuenta: '@taller_a', rol: 'agente', accion: 'publicar', momento: M1,
      nivel: decl, autorizacion_id: r.autorizacion_id
    });
    assert.strictEqual(d.dictamen, 'ejecutar');
    assert.strictEqual(d.autorizacion_id, r.autorizacion_id);
    assert.strictEqual(d.exige_ventana, true);

    // Se gasta y la siguiente decision ya no puede ejecutar.
    const g = await custodio.consumir_autorizacion({
      autorizacion_id: r.autorizacion_id, momento: M2,
      accion: 'publicar', cuenta: '@taller_a', proyecto: 'proy-a', rol: 'agente', quien: 'agente'
    });
    assert.strictEqual(g.ok, true, g.motivo);

    const despues = await custodio.decidir({
      proyecto: 'proy-a', cuenta: '@taller_a', rol: 'agente', accion: 'publicar', momento: M2,
      nivel: decl, autorizacion_id: r.autorizacion_id
    });
    assert.strictEqual(despues.dictamen, 'no', 'un permiso gastado no vuelve a servir');
    assert.strictEqual(despues.motivo, 'permiso_ya_gastado');
  });
});

test('los_almacenes_del_repo_existen_y_estan_vacios', async () => {
  // Un almacen de ejemplo con datos dentro seria un estado inventado que nadie
  // sabe de donde sale.
  const base = path.resolve(__dirname, '../../../storage/instagram-bridge');
  const confirmaciones = JSON.parse(await fsp.readFile(path.join(base, 'confirmaciones.json'), 'utf8'));
  const libro = JSON.parse(await fsp.readFile(path.join(base, 'autorizaciones.json'), 'utf8'));

  assert.strictEqual(puerta.es_estado(confirmaciones), true);
  assert.strictEqual(confirmaciones.confirmaciones.length, 0);
  assert.strictEqual(autorizaciones.es_estado(libro), true);
  assert.strictEqual(libro.autorizaciones.length, 0);
  assert.strictEqual(libro.consumos.length, 0);
  assert.strictEqual(puerta.auditar(confirmaciones).ok, true);
  assert.strictEqual(autorizaciones.auditar(libro).ok, true);
});

// ---------------------------------------------------------------------------
// 4 · el contrato y el reloj
// ---------------------------------------------------------------------------

test('ningun_fichero_de_autonomia_usa_el_reloj', () => {
  const ficheros = [
    'core/casillas.js',
    'autonomia/nivel.js',
    'autonomia/ventana.js',
    'autonomia/puerta.js',
    'autonomia/autorizaciones.js',
    'autonomia/politica.js',
    'autonomia/index.js'
  ];
  for (const f of ficheros) {
    // Se quitan los comentarios: la cabecera de Q4 NOMBRA Date.now() para decir
    // que no se usa, y eso no es usarlo.
    const src = fs.readFileSync(path.join(RAIZ, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/Date\.now\s*\(/.test(src), `${f} no puede llamar a Date.now()`);
    assert.ok(!/new\s+Date\s*\(\s*\)/.test(src), `${f} no puede leer el reloj`);
  }
});

test('cada_topic_declarado_tiene_su_handler', () => {
  const manifiesto = require('../autonomia/module.json');
  const proto = require('../autonomia').Autonomia.prototype;
  for (const s of manifiesto.subscribes) {
    assert.strictEqual(typeof proto[s.handler], 'function', `falta ${s.handler} para ${s.event}`);
  }
  for (const t of Object.values(TOPICS)) {
    assert.ok(manifiesto.subscribes.some((s) => s.event === `${t}.request`), `el topic ${t} no esta declarado`);
    assert.ok(manifiesto.publishes.some((p) => p.event === `${t}.response`), `falta la response de ${t}`);
    assert.ok(manifiesto.publishes.some((p) => p.event === `${t}.failed`), `falta el failed de ${t}`);
  }
  // Y el canal real esta declarado en las dos direcciones.
  assert.ok(manifiesto.subscribes.some((s) => s.event === CANAL.RECIBIDA));
  assert.ok(manifiesto.subscribes.some((s) => s.event === CANAL.FALLIDA));
  assert.ok(manifiesto.publishes.some((p) => p.event === CANAL.PEDIR));
});

test('el_manifiesto_declara_el_contrato_y_las_invariantes', () => {
  const m = require('../autonomia/module.json');
  assert.strictEqual(m.name, 'autonomia');
  assert.strictEqual(m.version, '0.1.0');
  assert.ok(/^\d+\.\d+\.\d+$/.test(m.version), 'version semver');
  assert.deepStrictEqual(m.dependencies, [], 'sin dependencias nuevas');
  assert.strictEqual(m.main, 'index.js');
  assert.ok(fs.existsSync(path.join(RAIZ, 'autonomia', m.main)));

  // Los invariantes del bloque estan escritos, no solo implementados.
  for (const inv of [
    'una_accion_sin_casilla_no_se_ejecuta',
    'sin_nivel_declarado_el_conservador',
    'el_silencio_nunca_se_anota_como_autorizacion',
    'un_si_viejo_es_un_no',
    'el_historial_informa_pero_no_autoriza',
    'no_hay_segunda_via_para_conseguir_permiso'
  ]) {
    assert.ok(m.config.invariantes.includes(inv), `falta el invariante ${inv}`);
  }

  // Los almacenes que declara son los que escribe.
  const rutas = m.config.persistence.paths;
  assert.ok(rutas.includes('storage/instagram-bridge/confirmaciones.json'));
  assert.ok(rutas.includes('storage/instagram-bridge/autorizaciones.json'));
});

test('el_bus_habla_por_el_par_request_response_y_failed', async () => {
  await conDirectorio(async (dir) => {
    const bus = busFalso();
    const custodio = crear({ directorio: dir, preguntar_por_canal: false });
    await custodio.onLoad({ logger: logger(), eventBus: bus });

    // Una consulta buena: response con request_id.
    const ok = await custodio.onCasillaConsultarRequest({ data: { accion: 'publicar', request_id: 'r-1' } });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.request_id, 'r-1');
    const resp = bus.de(`${TOPICS.CASILLA_CONSULTAR}.response`);
    assert.strictEqual(resp.length, 1);
    assert.strictEqual(resp[0].casilla.reversibilidad, 'irreversible');

    // Una consulta mala: failed con motivo, no response con ok:false.
    const malo = await custodio.onCasillaConsultarRequest({ data: { accion: 'volar', request_id: 'r-2' } });
    assert.strictEqual(malo.ok, false);
    assert.strictEqual(malo.motivo, 'accion_sin_casilla');
    const failed = bus.de(`${TOPICS.CASILLA_CONSULTAR}.failed`);
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(failed[0].request_id, 'r-2');

    // El veredicto tambien viaja por el bus.
    const d = await custodio.onDecidirRequest({
      data: {
        request_id: 'r-3', proyecto: 'proy-a', cuenta: '@taller_a', rol: 'sistema',
        accion: 'publicar', momento: M1,
        nivel: { cuenta: '@taller_a', proyecto: 'proy-a', nivel: 'ejecutar', quien: 'dueno', momento: M0 }
      }
    });
    assert.strictEqual(d.dictamen, 'no', 'el sistema no publica');
  });
});

test('las_piezas_puras_del_bloque_hablan_por_el_bus_sin_tocar_ficheros', async () => {
  await conDirectorio(async (dir) => {
    const custodio = crear({ directorio: dir, preguntar_por_canal: false });
    await custodio.onLoad({ logger: logger(), eventBus: null });

    // Q1
    const c = await custodio.consultar_casilla({ accion: 'publicar' });
    assert.strictEqual(c.ejecutable, true);
    assert.strictEqual(c.casilla.ventana_segundos, 120);

    // Q3
    const n = await custodio.consultar_nivel({ cuenta: '@taller_a', proyecto: 'proy-a' });
    assert.strictEqual(n.nivel, 'borrador');

    // Q4
    const v = await custodio.abrir_ventana({ accion: 'publicar', momento: M0, operacion_id: 'op-1' });
    assert.strictEqual(v.ok, true);
    assert.strictEqual(v.ventana.cierra_en, '2026-11-11T12:02:00Z');
    const cancel = await custodio.cancelar_ventana({ ventana: v.ventana, momento: '2026-11-11T12:01:00Z', quien: 'dueno', motivo: 'no' });
    assert.strictEqual(cancel.resultado, 'cancelacion');
    assert.strictEqual(cancel.es_fallo, false);

    // Nada de esto escribio un fichero.
    const ficheros = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
    assert.deepStrictEqual(ficheros, [], 'los reflejos no escriben');
  });
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__autonomia] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__autonomia] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
