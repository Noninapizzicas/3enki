'use strict';

/**
 * instagram-bridge · F3 · MemoriaDeCambios (CUSTODIO)
 *
 * Lo que esta suite fija:
 *   - **LA MEMORIA NO GUARDA ESTADO DE NINGUNA CUENTA.** Ni seguidores, ni
 *     retratos, ni sesiones, ni metricas: solo cambios de interfaz. Los campos de
 *     una entrada son una lista CERRADA, se comprueba al registrar y se vuelve a
 *     comprobar sobre el fichero entero antes de escribir.
 *   - **Es COMPARTIDA a proposito**: no lleva sello de proyecto (una entrada
 *     sellada se rechaza), pero SI lleva quien la descubrio (`descubierto_por`) y
 *     quienes la corroboraron (`visto_por`). Atribucion, no propiedad.
 *   - El mismo cambio visto por dos proyectos es UNA entrada corroborada, no dos:
 *     asi la memoria dice cuantas veces se confirmo.
 *   - Fichero roto (JSON ilegible, esquema desconocido, o una entrada con estado de
 *     cuenta tocada a mano) NO se pisa: `sin_cambios` / `almacen_no_auditado`.
 *   - Ningun secreto entra (V1).
 *
 * Ejecutar: node modules/instagram-bridge/tests/cambios.test.js
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const cambios = require('../recetas/cambios');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const M1 = '2026-11-11T12:00:00Z';
const M2 = '2026-11-12T09:00:00Z';
const M3 = '2026-11-13T17:45:00Z';

/** Un cambio de interfaz: "Compartir" paso a llamarse "Publicar ahora". */
function un_cambio(extra) {
  return Object.assign({
    capacidad: 'publicar',
    paso: 3,
    tipo: 'ancla_renombrada',
    ancla_antes: { nombre_visible: 'Compartir', tipo: 'boton' },
    ancla_ahora: { nombre_visible: 'Publicar ahora', tipo: 'boton' },
    evidencia_ids: ['ev-1', 'ev-2'],
    confirmaciones: 2,
    descubierto_por: { proyecto: 'proy-a', cuenta: 'taller_a', quien: 'agente', momento: M1 }
  }, extra || {});
}

async function con_directorio(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'instagram-bridge-cambios-'));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1 · EL TEST DEL BLOQUE: la memoria no guarda estado de ninguna cuenta
// ---------------------------------------------------------------------------

test('la_memoria_no_guarda_estado_de_ninguna_cuenta', async () => {
  await con_directorio(async (dir) => {
    const custodio = cambios.crear({ directorio: dir });
    const ruta = path.join(dir, 'cambios.json');

    // 1. Un cambio de interfaz entra; y lo que se guarda se puede enumerar.
    const r = await custodio.registrar(un_cambio());
    assert.strictEqual(r.ok, true, r.motivo);
    const guardado = r.cambio;
    assert.deepStrictEqual(
      Object.keys(guardado).sort(),
      cambios.CAMPOS_CAMBIO.slice().sort(),
      'la entrada tiene EXACTAMENTE los campos declarados: ni uno mas'
    );

    // Estado de cuenta: ninguno.
    for (const prohibido of cambios.CAMPOS_DE_CUENTA) {
      assert.strictEqual(guardado[prohibido], undefined, `la memoria no guarda ${prohibido}`);
    }
    assert.strictEqual(guardado.seguidores, undefined);
    assert.strictEqual(guardado.retrato, undefined);
    assert.strictEqual(guardado.sesion, undefined);

    // 2. Intentar colar estado de una cuenta se rechaza CON SU NOMBRE.
    for (const campo of ['seguidores', 'retrato', 'ultima_lectura', 'metricas']) {
      const sucio = await custodio.registrar(un_cambio(Object.assign({}, {
        paso: 4,
        ancla_antes: { nombre_visible: `Ancla ${campo}`, tipo: 'boton' },
        ancla_ahora: { nombre_visible: `Otra ${campo}`, tipo: 'boton' }
      }, { [campo]: campo === 'seguidores' ? 1200 : { datos: [] } })));
      assert.strictEqual(sucio.ok, false, `un cambio con ${campo} no entra`);
      assert.strictEqual(sucio.motivo, 'estado_de_cuenta_en_memoria');
      assert.strictEqual(sucio.guardado, false);
    }

    // Anidado en el descubridor tampoco: el estado de la cuenta no se cuela por el sello.
    const anidado = await custodio.registrar(un_cambio({
      paso: 5,
      descubierto_por: { proyecto: 'proy-a', cuenta: 'taller_a', quien: 'dueno', momento: M2, seguidores: 1200 }
    }));
    assert.strictEqual(anidado.ok, false);
    assert.strictEqual(anidado.motivo, 'estado_de_cuenta_en_memoria');

    // 3. El fichero en disco tambien esta limpio: solo el cambio bueno.
    const enDisco = JSON.parse(await fsp.readFile(ruta, 'utf8'));
    assert.strictEqual(enDisco.cambios.length, 1);
    assert.strictEqual(cambios.auditar(enDisco).ok, true);
    for (const prohibido of cambios.CAMPOS_DE_CUENTA) {
      assert.strictEqual(enDisco.cambios[0][prohibido], undefined);
    }

    // 4. Un fichero TOCADO A MANO con estado de cuenta no se persiste encima: la
    //    auditoria lo ve, el custodio no escribe, y el fichero queda como estaba.
    const tocado = JSON.parse(await fsp.readFile(ruta, 'utf8'));
    tocado.cambios[0].seguidores = 1200;
    const crudo = `${JSON.stringify(tocado, null, 2)}\n`;
    await fsp.writeFile(ruta, crudo, 'utf8');

    const auditoria = cambios.auditar(tocado);
    assert.strictEqual(auditoria.ok, false);
    assert.ok(auditoria.problemas.some((p) => p.motivo === 'estado_de_cuenta_en_memoria'));

    const otro = cambios.crear({ directorio: dir });
    await otro.cargar();
    const escribiendo = await otro.registrar(un_cambio({
      paso: 6,
      ancla_antes: { nombre_visible: 'Ajustes', tipo: 'boton' },
      ancla_ahora: { nombre_visible: 'Configuracion', tipo: 'boton' }
    }));
    assert.strictEqual(escribiendo.ok, false);
    assert.strictEqual(escribiendo.motivo, 'almacen_no_auditado');
    assert.strictEqual(escribiendo.guardado, false);
    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), crudo, 'el fichero con estado de cuenta no se machaca');
  });
});

// ---------------------------------------------------------------------------
// 2 · compartida: se corrobora, no se duplica; se atribuye, no se posee
// ---------------------------------------------------------------------------

test('el_mismo_cambio_visto_por_dos_proyectos_es_una_sola_entrada_corroborada', () => {
  let estado = cambios.estado_vacio();

  const a = cambios.registrar(estado, un_cambio());
  assert.strictEqual(a.ok, true, a.motivo);
  assert.strictEqual(a.corroborado, false);
  assert.strictEqual(a.estado.cambios.length, 1);

  // Otro proyecto, otra cuenta, otro momento: EL MISMO cambio de interfaz.
  const b = cambios.registrar(a.estado, un_cambio({
    evidencia_ids: ['ev-9'],
    confirmaciones: 2,
    descubierto_por: { proyecto: 'proy-b', cuenta: 'obrador_b', quien: 'dueno', momento: M2 }
  }));

  assert.strictEqual(b.ok, true, b.motivo);
  assert.strictEqual(b.corroborado, true);
  assert.strictEqual(b.estado.cambios.length, 1, 'el mismo cambio no se duplica: se corrobora');
  assert.strictEqual(b.cambio.confirmaciones, 4, '2 + 2 evidencias');
  assert.deepStrictEqual(b.cambio.evidencia_ids.sort(), ['ev-1', 'ev-2', 'ev-9']);
  assert.strictEqual(b.cambio.visto_por.length, 2);

  // La atribucion se conserva: el PRIMERO que lo descubrio, y los que lo vieron.
  assert.strictEqual(b.cambio.descubierto_por.proyecto, 'proy-a', 'se agradece al que lo descubrio');
  assert.deepStrictEqual(b.cambio.visto_por.map((v) => v.proyecto), ['proy-a', 'proy-b']);

  // Pero la memoria NO es de nadie: no hay sello, y el que la lee ve lo mismo.
  assert.strictEqual(b.cambio.sello, undefined, 'el saber comun no lleva sello de proyecto');
  assert.strictEqual(cambios.auditar(b.estado).ok, true);
  assert.strictEqual(cambios.auditar(b.estado).confirmaciones, 4);

  // Un tercer aviso identico del mismo proyecto y momento no infla la cuenta.
  const c = cambios.registrar(b.estado, un_cambio({
    descubierto_por: { proyecto: 'proy-b', cuenta: 'obrador_b', quien: 'dueno', momento: M2 }
  }));
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.cambio.visto_por.length, 2, 'el mismo testigo en el mismo momento no se anota dos veces');
});

test('una_entrada_sellada_por_un_proyecto_se_rechaza_en_la_auditoria', () => {
  const r = cambios.registrar(cambios.estado_vacio(), un_cambio());
  assert.strictEqual(r.ok, true, r.motivo);

  const conSello = JSON.parse(JSON.stringify(r.estado));
  conSello.cambios[0].sello = { proyecto: 'proy-a', cuenta: 'taller_a', aparato: 'm1', momento: M1, quien: 'dueno' };

  const auditoria = cambios.auditar(conSello);
  assert.strictEqual(auditoria.ok, false);
  assert.ok(auditoria.problemas.some((p) => p.motivo === 'sello_de_proyecto_en_memoria_comun'));
});

// ---------------------------------------------------------------------------
// 3 · el fichero: single-writer, atomico, auditado, y roto no se pisa
// ---------------------------------------------------------------------------

test('un_fichero_roto_no_se_pisa', async () => {
  await con_directorio(async (dir) => {
    const ruta = path.join(dir, 'cambios.json');
    await fsp.writeFile(ruta, '{ esto no es json', 'utf8');

    const custodio = cambios.crear({ directorio: dir });
    const carga = await custodio.cargar();
    assert.strictEqual(carga.ok, false);
    assert.strictEqual(carga.motivo, 'cambios_ilegible');

    const r = await custodio.registrar(un_cambio());
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_cambios');

    const l = await custodio.listar({ capacidad: 'publicar' });
    assert.strictEqual(l.ok, false);
    assert.strictEqual(l.motivo, 'sin_cambios');

    assert.strictEqual(await fsp.readFile(ruta, 'utf8'), '{ esto no es json', 'el fichero roto no se machaca');
  });
});

test('el_registro_es_atomico_y_no_deja_temporales', async () => {
  await con_directorio(async (dir) => {
    const custodio = cambios.crear({ directorio: dir });
    const r = await custodio.registrar(un_cambio());
    assert.strictEqual(r.ok, true, r.motivo);

    const ficheros = await fsp.readdir(dir);
    assert.deepStrictEqual(ficheros, ['cambios.json'], 'no quedan .tmp detras');
    const datos = JSON.parse(await fsp.readFile(path.join(dir, 'cambios.json'), 'utf8'));
    assert.strictEqual(datos.esquema, 'memoria-cambios-v1');
    assert.strictEqual(datos.almacen, 'memoria-cambios');
    assert.strictEqual(datos.cambios.length, 1);
    assert.strictEqual(datos.cambios[0].cambio_id, 'cambio-000001');
  });
});

test('las_escrituras_simultaneas_no_pisan_la_secuencia', async () => {
  await con_directorio(async (dir) => {
    const custodio = cambios.crear({ directorio: dir });
    const ops = [];
    for (let i = 0; i < 6; i += 1) {
      ops.push(custodio.registrar(un_cambio({
        paso: 10 + i,
        ancla_antes: { nombre_visible: `Boton ${i}`, tipo: 'boton' },
        ancla_ahora: { nombre_visible: `Accion ${i}`, tipo: 'boton' }
      })));
    }
    const resultados = await Promise.all(ops);
    assert.strictEqual(resultados.filter((x) => x.ok).length, 6);

    const datos = JSON.parse(await fsp.readFile(path.join(dir, 'cambios.json'), 'utf8'));
    const secuencias = datos.cambios.map((c) => c.secuencia).sort((a, b) => a - b);
    assert.deepStrictEqual(secuencias, [1, 2, 3, 4, 5, 6], 'una secuencia por cambio, sin huecos ni repetidos');
    assert.strictEqual(cambios.auditar(datos).ok, true);
  });
});

// ---------------------------------------------------------------------------
// 4 · solo cambios de interfaz, y ningun secreto
// ---------------------------------------------------------------------------

test('solo_entran_cambios_de_interfaz_declarados', () => {
  const estado = cambios.estado_vacio();

  for (const tipo of ['ancla_renombrada', 'ancla_desaparecida', 'postcondicion_cambiada']) {
    const r = cambios.registrar(estado, un_cambio({
      tipo,
      ancla_ahora: tipo === 'ancla_desaparecida' ? null : { nombre_visible: 'Publicar ahora', tipo: 'boton' }
    }));
    assert.strictEqual(r.ok, true, `${tipo}: ${r.motivo}`);
  }

  const inventado = cambios.registrar(estado, un_cambio({ tipo: 'la_app_va_regular' }));
  assert.strictEqual(inventado.ok, false);
  assert.strictEqual(inventado.motivo, 'tipo_no_declarado');

  // Renombrada sin decir a que nombre: no es un cambio, es un rumor.
  const sinAhora = cambios.registrar(estado, un_cambio({ ancla_ahora: null }));
  assert.strictEqual(sinAhora.ok, false);
  assert.strictEqual(sinAhora.motivo, 'ancla_incoherente');

  // Misma ancla antes y despues: no hubo cambio.
  const iguales = cambios.registrar(estado, un_cambio({
    ancla_ahora: { nombre_visible: 'compartir', tipo: 'boton' }
  }));
  assert.strictEqual(iguales.ok, false);
  assert.strictEqual(iguales.motivo, 'ancla_incoherente');

  // Sin testigo ni momento no entra: la memoria es comun, pero se sabe quien la descubrio.
  const sinTestigo = cambios.registrar(estado, un_cambio({ descubierto_por: { proyecto: 'proy-a' } }));
  assert.strictEqual(sinTestigo.ok, false);
  assert.strictEqual(sinTestigo.motivo, 'descubridor_invalido');
});

test('ningun_secreto_entra_en_la_memoria', () => {
  const r = cambios.registrar(cambios.estado_vacio(), un_cambio({
    descubierto_por: {
      proyecto: 'proy-a', cuenta: 'taller_a', quien: 'agente', momento: M1,
      nota: 'token=ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxxxx'
    }
  }));
  // El campo `nota` no esta declarado en el descubridor, y ademas lleva un secreto:
  // se rechaza antes de copiar nada.
  assert.strictEqual(r.ok, false);
  assert.ok(['secreto_recibido', 'campo_no_permitido'].includes(r.motivo), r.motivo);
  assert.strictEqual(JSON.stringify(r).includes('ya29.a0AfH6SMB'), false, 'el secreto no se copia al informe');
});

test('la_memoria_se_lee_por_ambito_y_por_paso', () => {
  let estado = cambios.estado_vacio();
  const uno = cambios.registrar(estado, un_cambio());
  const dos = cambios.registrar(uno.estado, un_cambio({
    capacidad: 'comentar', paso: 2, tipo: 'ancla_desaparecida',
    ancla_antes: { nombre_visible: 'Responder', tipo: 'boton' }, ancla_ahora: null,
    descubierto_por: { proyecto: 'proy-b', cuenta: 'obrador_b', quien: 'dueno', momento: M3 }
  }));

  assert.strictEqual(dos.ok, true, dos.motivo);

  const sinCriterio = cambios.listar(dos.estado, {});
  assert.strictEqual(sinCriterio.ok, false);
  assert.strictEqual(sinCriterio.motivo, 'ambito_incompleto');

  const dePublicar = cambios.listar(dos.estado, { capacidad: 'publicar' });
  assert.strictEqual(dePublicar.total, 1);
  assert.strictEqual(dePublicar.cambios[0].capacidad, 'publicar');

  const delPaso2 = cambios.listar(dos.estado, { capacidad: 'comentar', paso: 2 });
  assert.strictEqual(delPaso2.total, 1);
  assert.strictEqual(delPaso2.cambios[0].ancla_ahora, null);

  // `buscar` es lo que F2 mira antes de adivinar: ya hay un cambio para ese paso.
  const hallado = cambios.buscar(dos.estado, { capacidad: 'comentar', paso: 2 });
  assert.strictEqual(hallado.hallado, true);
  assert.strictEqual(hallado.cambio.tipo, 'ancla_desaparecida');

  const inexistente = cambios.buscar(dos.estado, { capacidad: 'publicar', paso: 99 });
  assert.strictEqual(inexistente.hallado, false);
  assert.strictEqual(inexistente.motivo, 'cambio_inexistente');
});

// ---------------------------------------------------------------------------
// 5 · el fichero del repo
// ---------------------------------------------------------------------------

test('el_fichero_del_repo_es_una_memoria_valida_y_vacia', async () => {
  const ruta = path.resolve(__dirname, '../../../storage/instagram-bridge/cambios.json');
  const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));

  assert.strictEqual(datos.esquema, 'memoria-cambios-v1');
  assert.strictEqual(datos.almacen, 'memoria-cambios');
  assert.deepStrictEqual(datos.cambios, [], 'la memoria del repo nace vacia: no hay cambios inventados');
  assert.strictEqual(cambios.auditar(datos).ok, true);

  // Y es la clase de almacen que dice ser: saber comun, no estado privado (P3).
  const propiedad = require('../core/propiedad');
  assert.strictEqual(propiedad.clase_de_almacen(datos.almacen), 'compartible');
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
  if (fails.length === 0) { console.log(`\n[instagram-bridge__cambios] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__cambios] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.stack || err.message}`);
  process.exit(1);
})();
