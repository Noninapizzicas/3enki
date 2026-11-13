'use strict';

/**
 * instagram-bridge · BLOQUE 6 · O3 · EvidenciaConservada (CUSTODIO)
 *
 * Lo que esta suite fija:
 *   - **sin sello de cuenta no hay evidencia**: se rechaza con
 *     `sin_sello_de_cuenta` y no se escribe ni un byte ni se publica nada. Una
 *     evidencia sin dueno no se puede atribuir a nadie (P1).
 *   - **la evidencia MAPEA a la bitacora real y no la reimplementa**: el modulo
 *     emite las peticiones del contrato de `agentes-bitacora`
 *     (`bitacora.abrir.request` / `bitacora.paso.request` /
 *     `bitacora.sellar.request`) y no escribe en
 *     `data/projects/<id>/storage/agentes/bitacoras`: esa memoria tiene un solo
 *     custodio, que es la bitacora.
 *   - un `no_se_sabe` viaja con `que_haria_falta` y NUNCA se manda como
 *     `verificado: true`;
 *   - un `ocurrio` sin prueba visible se rechaza (no basta con decir que si);
 *   - ningun secreto entra (V1), y la escritura es atomica (no quedan `.tmp`).
 *
 * Ejecutar: node modules/instagram-bridge/tests/evidencia.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const evidencia = require('../puente/evidencia');
const { EvidenciaConservada, TOPICS, mapear, auditar } = evidencia;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MOMENTO = '2026-11-11T12:00:00Z';
const BITACORA_MODULE = '/opt/enki/modules/agentes/bitacora/module.json';

function sello(opts = {}) {
  return Object.assign({ proyecto: 'proy-a', cuenta: 'taller_a', plataforma: 'instagram' }, opts);
}

function paso_ocurrido(numero = 1) {
  return {
    paso: numero,
    resultado: 'ocurrio',
    prueba: { nodo_id: `n-ok-${numero}`, ancla: 'Publicado', momento: 1800000000000, cuenta: 'taller_a' }
  };
}

function paso_no_se(numero = 2) {
  return {
    paso: numero,
    resultado: 'no_se_sabe',
    que_haria_falta: 'una mirada completa: la que hay es parcial'
  };
}

function entrada(opts = {}) {
  return Object.assign({
    request_id: 'req-0001',
    sello: sello(),
    proyecto: 'proy-a',
    agente: 'instagram-bridge',
    tarea: 'publicar_foto',
    momento: MOMENTO,
    veredicto: 'ocurrio',
    pasos: [paso_ocurrido(1)],
    duracion_ms: 4321
  }, opts);
}

/** Un bus de mentira que apunta lo que se publica, sin escribir nada. */
function bus() {
  const publicados = [];
  return {
    publicados,
    publish(topic, payload) { publicados.push({ topic, payload }); },
    topics() { return publicados.map((p) => p.topic); }
  };
}

function directorio() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'evidencia-'));
  return { raiz, dir: path.join(raiz, 'storage', 'instagram-bridge', 'evidencia') };
}

function ficheros(raiz) {
  const salida = [];
  const recorrer = (d) => {
    for (const nombre of fs.readdirSync(d)) {
      const p = path.join(d, nombre);
      if (fs.statSync(p).isDirectory()) recorrer(p);
      else salida.push(p);
    }
  };
  if (fs.existsSync(raiz)) recorrer(raiz);
  return salida;
}

// ---------------------------------------------------------------------------
// 1 · SIN SELLO DE CUENTA NO HAY EVIDENCIA
// ---------------------------------------------------------------------------

test('evidencia_sin_sello_de_cuenta_se_rechaza', async () => {
  const { raiz, dir } = directorio();
  const b = bus();
  const custodio = new EvidenciaConservada({ directorio: dir, eventBus: b });

  // a) ni sello
  const sin_sello = await custodio.guardar(entrada({ sello: undefined }));
  assert.strictEqual(sin_sello.ok, false);
  assert.strictEqual(sin_sello.motivo, 'sin_sello_de_cuenta', 'sin sello de cuenta se rechaza');
  assert.ok(sin_sello.faltan.includes('proyecto'), 'se nombra lo que falta: proyecto');
  assert.ok(sin_sello.faltan.includes('cuenta'), 'se nombra lo que falta: cuenta');
  assert.strictEqual(sin_sello.guardado, false);

  // b) sello a medias (cuenta vacia) tampoco
  const a_medias = await custodio.guardar(entrada({ sello: sello({ cuenta: '   ' }) }));
  assert.strictEqual(a_medias.ok, false);
  assert.strictEqual(a_medias.motivo, 'sin_sello_de_cuenta');
  assert.deepStrictEqual(a_medias.faltan, ['cuenta']);

  // c) plataforma que no es del puente
  const plataforma = await custodio.guardar(entrada({ sello: sello({ plataforma: 'tiktok' }) }));
  assert.strictEqual(plataforma.ok, false);
  assert.strictEqual(plataforma.motivo, 'sin_sello_de_cuenta');
  assert.deepStrictEqual(plataforma.invalidos, ['plataforma']);

  // Rechazar ANTES de escribir: ni ficheros ni peticiones al bus.
  assert.deepStrictEqual(ficheros(raiz), [], 'sin sello no se escribe nada');
  assert.deepStrictEqual(b.publicados, [], 'sin sello no se publica nada');

  // El registro tampoco pasaria la auditoria previa a escribir.
  const auditoria = auditar({ esquema: 'evidencia-ejecucion-v1', request_id: 'req-0001', veredicto: 'ocurrio', pasos: [] });
  assert.strictEqual(auditoria.ok, false);
  assert.ok(
    auditoria.problemas.some((p) => p.motivo === 'sin_sello_de_cuenta'),
    'auditar tambien rechaza la evidencia huerfana'
  );

  // Y el proyecto del sello manda: no se firma evidencia de otro proyecto (P2/P3).
  const ajeno = await custodio.guardar(entrada({ proyecto: 'proy-b' }));
  assert.strictEqual(ajeno.ok, false);
  assert.strictEqual(ajeno.motivo, 'proyecto_ajeno');
  assert.deepStrictEqual(ficheros(raiz), []);
});

// ---------------------------------------------------------------------------
// 2 · MAPEA A LA BITACORA REAL, NO LA REIMPLEMENTA  (test de la espina)
// ---------------------------------------------------------------------------

test('la_evidencia_mapea_a_bitacora_y_no_la_reimplementa', async () => {
  const { raiz, dir } = directorio();
  const b = bus();
  const custodio = new EvidenciaConservada({ directorio: dir, eventBus: b });

  const r = await custodio.guardar(entrada({ pasos: [paso_ocurrido(1), paso_ocurrido(2)] }));
  assert.strictEqual(r.ok, true, `se guarda: ${r.motivo}`);
  assert.strictEqual(r.guardado, true);
  assert.strictEqual(r.bitacora.publicado, true, 'las peticiones llegan al bus');
  assert.strictEqual(r.completa, true);

  // El orden es el del contrato: abrir, un paso por consecuencia, sellar.
  assert.deepStrictEqual(b.topics(), [
    'bitacora.abrir.request',
    'bitacora.paso.request',
    'bitacora.paso.request',
    'bitacora.sellar.request'
  ]);

  // Y son EXACTAMENTE los topics que la bitacora real declara en `subscribes`:
  // si el contrato cambia alli, este test lo dice.
  if (fs.existsSync(BITACORA_MODULE)) {
    const modulo = JSON.parse(fs.readFileSync(BITACORA_MODULE, 'utf8'));
    const suscribe = new Set(modulo.subscribes.map((s) => s.event));
    for (const topic of Object.values(TOPICS)) {
      assert.ok(suscribe.has(topic), `${topic} no esta en el contrato de agentes-bitacora`);
    }
    assert.strictEqual(modulo.name, 'agentes-bitacora');
  }

  // El payload de abrir es el suyo: request_id, project_id, agent_name, task.
  const abrir = b.publicados[0].payload;
  assert.strictEqual(abrir.request_id, 'req-0001');
  assert.strictEqual(abrir.project_id, 'proy-a');
  assert.strictEqual(abrir.agent_name, 'instagram-bridge');
  assert.strictEqual(abrir.task, 'publicar_foto');

  // Cada paso lleva el nombre de paso, el mensaje y la herramienta.
  for (const p of b.publicados.slice(1, 3)) {
    assert.strictEqual(p.payload.request_id, 'req-0001');
    assert.strictEqual(p.payload.project_id, 'proy-a');
    assert.match(p.payload.paso, /^consecuencia_\d+$/);
    assert.match(p.payload.message, /ocurrio/);
    assert.strictEqual(p.payload.tool_invoked, 'instagram-bridge:taller_a');
  }

  // El sellar lleva veredicto + verificado: la bitacora decide el estado con eso.
  const sellar = b.publicados[3].payload;
  assert.strictEqual(sellar.request_id, 'req-0001');
  assert.strictEqual(sellar.project_id, 'proy-a');
  assert.strictEqual(sellar.duracion_ms, 4321);
  assert.strictEqual(sellar.veredicto.resultado, 'ocurrio');
  assert.strictEqual(sellar.veredicto.verificado, true);
  assert.strictEqual(sellar.veredicto.pruebas.length, 2, 'las pruebas viajan con el veredicto');

  // NO se reimplementa la bitacora: en todo el arbol solo existe NUESTRA
  // evidencia. Ni `data/projects/.../agentes/bitacoras` ni nada parecido.
  const escritos = ficheros(raiz);
  assert.strictEqual(escritos.length, 1, `solo la evidencia propia: ${escritos.join(', ')}`);
  assert.ok(escritos[0].startsWith(dir), 'la evidencia vive en nuestro directorio');
  assert.ok(!escritos.some((f) => /agentes[\\/]bitacoras/.test(f)), 'no se escribe la bitacora de otro');
  assert.ok(!escritos.some((f) => f.endsWith('.tmp')), 'no quedan temporales: escritura atomica');

  // El registro guardado es evidencia sellada: lleva el SelloDeCuenta congelado.
  const guardada = await custodio.recuperar('req-0001');
  assert.ok(guardada, 'la evidencia se puede recuperar');
  assert.strictEqual(guardada.esquema, 'evidencia-ejecucion-v1');
  assert.deepStrictEqual(guardada.sello, sello());
  assert.strictEqual(guardada.veredicto, 'ocurrio');
  assert.strictEqual(guardada.pasos[0].prueba.nodo_id, 'n-ok-1');

  // `mapear()` da las mismas peticiones SIN publicar: sirve para reemitir si el
  // bus estaba caido, porque la evidencia es la fuente y la bitacora el destino.
  const antes = b.publicados.length;
  const peticiones = mapear(guardada);
  assert.strictEqual(b.publicados.length, antes, 'mapear no publica');
  assert.deepStrictEqual(peticiones.map((p) => p.topic), b.topics());

  // Sin bus, el registro queda en disco y se dice que la bitacora NO se entero.
  const sinBus = new EvidenciaConservada({ directorio: path.join(raiz, 'otra'), eventBus: null });
  const mudo = await sinBus.guardar(entrada({ request_id: 'req-0002' }));
  assert.strictEqual(mudo.ok, true);
  assert.strictEqual(mudo.guardado, true);
  assert.strictEqual(mudo.bitacora.publicado, false);
  assert.strictEqual(mudo.completa, false, 'sin bitacora no se puede decir que quedo escrita');
  assert.strictEqual(mudo.bitacora.motivo, 'sin_bitacora');
});

// ---------------------------------------------------------------------------
// 3 · NO SE SABE NO SE DISFRAZA DE VERIFICADO
// ---------------------------------------------------------------------------

test('no_se_sabe_exige_que_haria_falta_y_no_viaja_como_verificado', async () => {
  const { raiz, dir } = directorio();
  const b = bus();
  const custodio = new EvidenciaConservada({ directorio: dir, eventBus: b });

  // Sin lo que haria falta: es una excusa, no una evidencia.
  const mudo = await custodio.guardar(entrada({ veredicto: 'no_se_sabe', pasos: [paso_no_se(1)], que_haria_falta: [] }));
  assert.strictEqual(mudo.ok, false);
  assert.strictEqual(mudo.motivo, 'no_se_sabe_sin_que_haria_falta');
  assert.deepStrictEqual(ficheros(raiz), []);
  assert.deepStrictEqual(b.publicados, []);

  // Con lo que haria falta: se guarda, y el veredicto NO se vende como verificado.
  const honesto = await custodio.guardar(entrada({
    veredicto: 'no_se_sabe',
    pasos: [paso_ocurrido(1), paso_no_se(2)],
    que_haria_falta: ['una mirada completa del paso 2']
  }));
  assert.strictEqual(honesto.ok, true, `se guarda: ${honesto.motivo}`);
  assert.strictEqual(honesto.evidencia.veredicto, 'no_se_sabe');
  assert.deepStrictEqual(honesto.evidencia.que_haria_falta, ['una mirada completa del paso 2']);

  const sellar = b.publicados[b.publicados.length - 1];
  assert.strictEqual(sellar.topic, 'bitacora.sellar.request');
  assert.strictEqual(sellar.payload.veredicto.resultado, 'no_se_sabe');
  assert.strictEqual(sellar.payload.veredicto.verificado, false, 'no se sabe NO es verificado');
  assert.strictEqual(sellar.payload.veredicto.no_confirmado, true);
  assert.ok(sellar.payload.veredicto.que_haria_falta.length > 0);

  // El paso sin saber lleva su falta en el mensaje: la bitacora lo puede leer.
  const pasoDos = b.publicados.find((p) => p.payload.paso === 'consecuencia_2');
  assert.match(pasoDos.payload.message, /no se sabe/);
  assert.match(pasoDos.payload.message, /mirada completa/);
});

// ---------------------------------------------------------------------------
// 4 · OCURRIO SIN PRUEBA Y SECRETOS: SE RECHAZA ANTES DE ESCRIBIR
// ---------------------------------------------------------------------------

test('ocurrio_sin_prueba_y_secreto_se_rechazan_antes_de_escribir', async () => {
  const { raiz, dir } = directorio();
  const b = bus();
  const custodio = new EvidenciaConservada({ directorio: dir, eventBus: b });

  // Decir "ocurrio" sin nodo visible no es una prueba: no entra.
  const sinPrueba = await custodio.guardar(entrada({
    pasos: [{ paso: 1, resultado: 'ocurrio' }]
  }));
  assert.strictEqual(sinPrueba.ok, false);
  assert.strictEqual(sinPrueba.motivo, 'evidencia_no_auditada');
  assert.ok(
    sinPrueba.problemas.some((p) => p.campo === 'pasos[0].prueba' && p.motivo === 'ocurrio_sin_prueba'),
    'se nombra el paso y lo que falta'
  );

  // Un secreto en la evidencia se rechaza entero y se dice por donde venia (V1).
  const conSecreto = await custodio.guardar(entrada({
    detalle: { password: 'hunter2-supersecreto' }
  }));
  assert.strictEqual(conSecreto.ok, false);
  assert.strictEqual(conSecreto.motivo, 'secreto_recibido');
  assert.ok(conSecreto.rutas.some((r) => r.includes('password')), 'la ruta del secreto se nombra');

  assert.deepStrictEqual(ficheros(raiz), [], 'nada se escribe si no pasa la auditoria');
  assert.deepStrictEqual(b.publicados, [], 'ni se pide nada a la bitacora');

  // Y dos guardados simultaneos no dejan basura ni ficheros a medias.
  const uno = custodio.guardar(entrada({ request_id: 'req-par' }));
  const dos = custodio.guardar(entrada({ request_id: 'req-par', duracion_ms: 999 }));
  const [a, c] = await Promise.all([uno, dos]);
  assert.ok(a.ok && c.ok);
  const escritos = ficheros(raiz);
  assert.strictEqual(escritos.length, 1, 'un request_id, un fichero');
  assert.ok(!escritos.some((f) => f.endsWith('.tmp')));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(escritos[0], 'utf8')), 'el fichero es JSON entero');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__evidencia] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__evidencia] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
