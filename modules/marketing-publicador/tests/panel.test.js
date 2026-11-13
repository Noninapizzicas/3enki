'use strict';

/**
 * marketing-publicador · BLOQUE 20a
 *
 * Fija las tres cosas de las que depende que el panel diga la verdad:
 *
 *   1. EL MATERIAL: se lista TODO lo que hay en <public>/<proyecto>/media/, en
 *      profundidad, SIN filtro de formato ni de tamano. Un .zip, un .heic de
 *      40 MB y un .mp4 salen igual que un .jpg. Si hubiera lista blanca, el
 *      panel mentiria sobre lo que el dueño tiene.
 *
 *   2. LA ORDEN: {id, accion:'publicar', red:'instagram', destino, texto,
 *      media:{url}, archivo, simulacion:false}. `simulacion:false` es
 *      obligatoria (ausente = simulacion, el aparato no toca nada) y el
 *      payload va EN CRUDO, porque el aparato lo lee como la orden misma.
 *      Nada de red: se inyecta el publicador del bus.
 *
 *   3. EL ESTADO: lo que el aparato contesta se mapea SIN traducir el motivo.
 *      'servicio_no_activo' y 'ancla_no_encontrada' se arreglan de forma
 *      distinta: el panel tiene que poder ensenarlos con su nombre. Y un
 *      'publicado' no se degrada: publicar es irreversible.
 *
 * Ejecutar: node modules/marketing-publicador/tests/panel.test.js
 */

const assert = require('assert');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

const MarketingPublicador = require('../index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------------------------------------------------------------------------
// Utilidades: un proyecto de mentira en un directorio temporal
// ---------------------------------------------------------------------------

function tmpRoot() {
  return path.join(os.tmpdir(), `publicador-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

async function escribir(ruta, contenido) {
  await fsp.mkdir(path.dirname(ruta), { recursive: true });
  await fsp.writeFile(ruta, contenido);
}

/**
 * Monta <root>/<proyecto>/media/ con material de todos los sabores y carga el
 * modulo con un publicador FALSO (sin red): todo lo que se emite se apunta.
 */
async function montar(opciones = {}) {
  const root = tmpRoot();
  const proyecto = opciones.proyecto || 'laura';
  const media = path.join(root, proyecto, 'media');

  await escribir(path.join(media, 'foto.jpg'), Buffer.alloc(1024));
  await escribir(path.join(media, 'video.mp4'), Buffer.alloc(2048));
  await escribir(path.join(media, 'raro.zip'), Buffer.alloc(512));
  await escribir(path.join(media, 'movil.heic'), Buffer.alloc(40 * 1024 * 1024)); // 40 MB
  await escribir(path.join(media, 'sub/cancion.mp3'), Buffer.alloc(300));
  await escribir(path.join(media, 'sub/mas hondo/papel.pdf'), Buffer.alloc(100));

  const emitidas = [];
  const modulo = new MarketingPublicador();
  await modulo.onLoad({
    logger: null,
    metrics: null,
    eventBus: opciones.eventBus || null,
    moduleConfig: { public_root: root, public_ns: 'a' },
    coreId: 'core-a',
    publicador: opciones.publicador === undefined
      ? { publicar: async (evento, orden) => { emitidas.push({ evento, orden }); } }
      : opciones.publicador
  });

  return { modulo, root, proyecto, media, emitidas };
}

async function limpiar(p) {
  try { await fsp.rm(p, { recursive: true, force: true }); } catch (e) { /* da igual */ }
}

const req = (extra = {}) => ({ params: {}, query: {}, body: {}, ...extra });

// ---------------------------------------------------------------------------
// 1 · EL MATERIAL: todo, sin filtro de formato ni de tamano
// ---------------------------------------------------------------------------

test('el material se lista ENTERO: imagenes, video, zip, heic de 40 MB y subcarpetas', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const r = await modulo.handleMaterial(req({ params: { proyecto } }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));

    const nombres = r.data.material.map((f) => f.nombre).sort();
    assert.deepStrictEqual(nombres, [
      'foto.jpg',
      'movil.heic',
      'raro.zip',
      'sub/cancion.mp3',
      'sub/mas hondo/papel.pdf',
      'video.mp4'
    ], 'no se cuela ni se pierde ninguno');

    assert.strictEqual(r.data.total, 6);
    assert.strictEqual(r.data.bytes_total, 1024 + 2048 + 512 + 40 * 1024 * 1024 + 300 + 100);

    const heic = r.data.material.find((f) => f.nombre === 'movil.heic');
    assert.strictEqual(heic.bytes, 40 * 1024 * 1024, 'un fichero de 40 MB se lista igual');
    assert.strictEqual(heic.tipo, 'imagen');

    const zip = r.data.material.find((f) => f.nombre === 'raro.zip');
    assert.strictEqual(zip.tipo, 'otro', 'un formato desconocido es otro, no invisible');
    assert.strictEqual(zip.mime, 'application/octet-stream');

    const video = r.data.material.find((f) => f.nombre === 'video.mp4');
    assert.strictEqual(video.tipo, 'video');
    assert.strictEqual(video.mime, 'video/mp4');

    // La url publica: namespace + proyecto + media/ + ruta relativa (con la
    // barra de la subcarpeta intacta y los espacios escapados).
    assert.strictEqual(video.url, '/a/laura/media/video.mp4');
    const pdf = r.data.material.find((f) => f.nombre === 'sub/mas hondo/papel.pdf');
    assert.strictEqual(pdf.url, '/a/laura/media/sub/mas%20hondo/papel.pdf');

    // modificado es una fecha ISO de verdad (el panel ordena por ahi).
    assert.ok(!Number.isNaN(Date.parse(video.modificado)));
  } finally { await limpiar(root); }
});

test('lo ultimo modificado va primero (es lo que se va a publicar)', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const futuro = new Date(Date.now() + 60_000);
    await fsp.utimes(path.join(root, proyecto, 'media', 'foto.jpg'), futuro, futuro);
    const r = await modulo.handleMaterial(req({ params: { proyecto } }));
    assert.strictEqual(r.data.material[0].nombre, 'foto.jpg');
  } finally { await limpiar(root); }
});

test('proyecto inexistente -> 404 nombrado; proyecto con traversal -> 400', async () => {
  const { modulo, root } = await montar();
  try {
    const noEsta = await modulo.handleMaterial(req({ params: { proyecto: 'no-existe' } }));
    assert.strictEqual(noEsta.status, 404);
    assert.strictEqual(noEsta.data.error.code, 'RESOURCE_NOT_FOUND');
    assert.ok(noEsta.data.error.message.includes('no-existe'), 'el 404 dice de que proyecto habla');

    for (const malo of ['..', '../../etc', 'con barra', '']) {
      const r = await modulo.handleMaterial(req({ params: { proyecto: malo } }));
      assert.strictEqual(r.status, 400, `'${malo}' no es un proyecto`);
      assert.strictEqual(r.data.error.code, 'INVALID_INPUT');
    }
  } finally { await limpiar(root); }
});

// ---------------------------------------------------------------------------
// 2 · LA ORDEN: contrato del aparato, en crudo, y por el publicador inyectado
// ---------------------------------------------------------------------------

test('publicar emite la orden del contrato (con simulacion:false) y devuelve el id', async () => {
  const { modulo, root, proyecto, emitidas } = await montar();
  try {
    const r = await modulo.handlePublicar(req({
      params: { proyecto },
      body: { fichero: 'foto.jpg', texto: 'Esto es el texto de la publicacion', destino: 'historia' }
    }));

    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.ok(/^pub-[a-z0-9]+-[a-f0-9]{6}$/.test(r.data.id), 'id con forma de id: ' + r.data.id);
    assert.strictEqual(r.data.estado, 'enviado');

    assert.strictEqual(emitidas.length, 1, 'una orden, ni dos ni ninguna');
    assert.strictEqual(emitidas[0].evento, 'bridge/orden/publicar');

    const orden = emitidas[0].orden;
    assert.strictEqual(orden.id, r.data.id, 'el id que se devuelve es el que viaja');
    assert.strictEqual(orden.accion, 'publicar');
    assert.strictEqual(orden.red, 'instagram');
    assert.strictEqual(orden.destino, 'historia');
    assert.strictEqual(orden.texto, 'Esto es el texto de la publicacion');
    assert.strictEqual(orden.media.url, '/a/laura/media/foto.jpg');
    assert.strictEqual(orden.archivo, 'foto.jpg');
    assert.strictEqual(orden.simulacion, false, 'sin simulacion:false el aparato no toca nada');

    // La orden es JSON de verdad (viaja por MQTT como payload).
    assert.deepStrictEqual(JSON.parse(JSON.stringify(orden)), orden);

    // Y queda consultable por su id.
    const estado = await modulo.handleEstado(req({ params: { proyecto, id: r.data.id } }));
    assert.strictEqual(estado.status, 200);
    assert.strictEqual(estado.data.estado, 'enviado');
    assert.strictEqual(estado.data.destino, 'historia');
    assert.strictEqual(estado.data.fichero, 'foto.jpg');
  } finally { await limpiar(root); }
});

test('los tres destinos del catalogo pasan; cualquiera otro se rechaza nombrandolo', async () => {
  const { modulo, root, proyecto, emitidas } = await montar();
  try {
    for (const destino of ['historia', 'publicacion', 'reels']) {
      const r = await modulo.handlePublicar(req({
        params: { proyecto }, body: { fichero: 'video.mp4', texto: 'x', destino }
      }));
      assert.strictEqual(r.status, 200, `${destino}: ${JSON.stringify(r.data)}`);
    }
    assert.strictEqual(emitidas.length, 3);

    for (const destino of ['story', 'feed', 'instants', '']) {
      const r = await modulo.handlePublicar(req({
        params: { proyecto }, body: { fichero: 'video.mp4', texto: 'x', destino }
      }));
      assert.strictEqual(r.status, 400, `'${destino}' no esta en el catalogo`);
      assert.strictEqual(r.data.error.code, 'INVALID_INPUT');
      assert.ok(r.data.error.message.includes('historia'), 'el error ensena el catalogo');
    }
    assert.strictEqual(emitidas.length, 3, 'un destino inventado no emite nada');
  } finally { await limpiar(root); }
});

test('un fichero que no es del material no se publica (ni el de fuera, ni el que no existe)', async () => {
  const { modulo, root, proyecto, emitidas } = await montar();
  try {
    const fuera = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: '../../../etc/passwd', texto: 'x', destino: 'historia' }
    }));
    assert.strictEqual(fuera.status, 403);
    assert.strictEqual(fuera.data.error.code, 'PERMISSION_DENIED');

    const falta = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: 'no-existe.jpg', texto: 'x', destino: 'historia' }
    }));
    assert.strictEqual(falta.status, 404);
    assert.strictEqual(falta.data.error.code, 'RESOURCE_NOT_FOUND');

    const sinFichero = await modulo.handlePublicar(req({
      params: { proyecto }, body: { texto: 'x', destino: 'historia' }
    }));
    assert.strictEqual(sinFichero.status, 400);

    assert.strictEqual(emitidas.length, 0, 'nada de eso sale al bus');
  } finally { await limpiar(root); }
});

test('sin bus, el fallo se dice con nombre y el estado no se queda mintiendo', async () => {
  const { modulo, root, proyecto } = await montar({ publicador: null });
  try {
    const r = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: 'foto.jpg', texto: 'x', destino: 'publicacion' }
    }));
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.data.estado, 'fallo');
    assert.ok(r.data.motivo.startsWith('no_se_pudo_emitir: '), r.data.motivo);

    const estado = await modulo.handleEstado(req({ params: { proyecto, id: r.data.id } }));
    assert.strictEqual(estado.data.estado, 'fallo');
    assert.strictEqual(estado.data.motivo, r.data.motivo);
  } finally { await limpiar(root); }
});

// ---------------------------------------------------------------------------
// 3 · EL ESTADO: lo que contesta el aparato, sin traducir
// ---------------------------------------------------------------------------

test('ok:true -> publicado; y la publicacion no se degrada despues', async () => {
  const { modulo, root, proyecto, emitidas } = await montar();
  try {
    const r = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: 'foto.jpg', texto: 'hola', destino: 'historia' }
    }));
    const id = r.data.id;

    await modulo.onResultado({ data: { id, accion: 'publicar', red: 'instagram', ok: true, motivo: null, simulacion: false } });
    let estado = await modulo.handleEstado(req({ params: { proyecto, id } }));
    assert.strictEqual(estado.data.estado, 'publicado');
    assert.strictEqual(estado.data.motivo, null);

    // Un resultado posterior (un eco, un reintento ciego) no desmiente lo que
    // ya ocurrio: publicar es irreversible.
    await modulo.onResultado({ data: { id, ok: false, motivo: 'mano_sin_respuesta' } });
    estado = await modulo.handleEstado(req({ params: { proyecto, id } }));
    assert.strictEqual(estado.data.estado, 'publicado');

    assert.strictEqual(emitidas.length, 1);
  } finally { await limpiar(root); }
});

test('ok:false -> fallo con el motivo TAL CUAL (no se traduce a error generico)', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const r = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: 'foto.jpg', texto: 'hola', destino: 'historia' }
    }));
    const id = r.data.id;

    const casos = ['servicio_no_activo', 'ancla_no_encontrada', 'campo_vacio', 'sin_mano', 'mano_sin_respuesta'];
    for (const motivo of casos) {
      await modulo.onResultado({ data: { id, ok: false, motivo, detalle: 'lo que dijo el movil' } });
      const estado = await modulo.handleEstado(req({ params: { proyecto, id } }));
      assert.strictEqual(estado.data.estado, 'fallo');
      assert.strictEqual(estado.data.motivo, motivo, 'el motivo se queda como vino');
      assert.strictEqual(estado.data.detalle, 'lo que dijo el movil');
    }

    // Sin motivo, se nombra el hueco: un fallo sin motivo no se puede arreglar.
    await modulo.onResultado({ data: { id, ok: false } });
    const sinMotivo = await modulo.handleEstado(req({ params: { proyecto, id } }));
    assert.strictEqual(sinMotivo.data.estado, 'fallo');
    assert.ok(sinMotivo.data.motivo.length > 0);
  } finally { await limpiar(root); }
});

test('una simulacion NUNCA se lee como publicacion', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const r = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: 'foto.jpg', texto: 'hola', destino: 'historia' }
    }));
    const id = r.data.id;

    await modulo.onResultado({ data: { id, ok: true, motivo: null, simulacion: true } });
    const estado = await modulo.handleEstado(req({ params: { proyecto, id } }));
    assert.strictEqual(estado.data.estado, 'fallo', 'nada salio del aparato');
    assert.strictEqual(estado.data.motivo, 'simulacion');
  } finally { await limpiar(root); }
});

test('un resultado que no afirma nada deja el estado en recibido, con el hueco nombrado', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const r = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: 'foto.jpg', texto: 'hola', destino: 'historia' }
    }));
    const id = r.data.id;

    await modulo.onResultado({ data: { id } });
    let estado = await modulo.handleEstado(req({ params: { proyecto, id } }));
    assert.strictEqual(estado.data.estado, 'recibido');
    assert.strictEqual(estado.data.motivo, 'resultado_sin_ok');

    // Un acuse explicito tambien es 'recibido': el aparato dice que la tiene.
    await modulo.onResultado({ data: { id, acuse: true } });
    estado = await modulo.handleEstado(req({ params: { proyecto, id } }));
    assert.strictEqual(estado.data.estado, 'recibido');

    const mapeado = modulo._mapearResultado(null);
    assert.strictEqual(mapeado.estado, 'recibido');
    assert.strictEqual(mapeado.motivo, 'resultado_sin_cuerpo');
  } finally { await limpiar(root); }
});

test('el estado de un id de OTRO proyecto no se asoma', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const r = await modulo.handlePublicar(req({
      params: { proyecto }, body: { fichero: 'foto.jpg', texto: 'x', destino: 'historia' }
    }));
    const ajeno = await modulo.handleEstado(req({ params: { proyecto: 'otro-proyecto', id: r.data.id } }));
    assert.strictEqual(ajeno.status, 404);

    const inventado = await modulo.handleEstado(req({ params: { proyecto, id: 'pub-no-existe' } }));
    assert.strictEqual(inventado.status, 404);
    assert.strictEqual(inventado.data.error.code, 'RESOURCE_NOT_FOUND');
  } finally { await limpiar(root); }
});

// ---------------------------------------------------------------------------
// 4 · El panel: se sirve y se copia al proyecto
// ---------------------------------------------------------------------------

test('el panel se sirve desde el modulo (HTML + app.js), y solo esos ficheros', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const html = await modulo.handlePanel(req({ params: { proyecto } }));
    assert.strictEqual(html.status, 200);
    assert.ok(html._html.includes('Publicador'));
    assert.ok(html._html.includes(proyecto), 'el proyecto se hornea en la pagina');

    const js = await modulo.handlePanelAsset(req({ params: { fichero: 'app.js' } }));
    assert.strictEqual(js.status, 200);
    assert.ok(js.headers['Content-Type'].includes('javascript'));
    assert.ok(js.body.toString('utf8').includes('/modules/marketing-publicador'));

    const css = await modulo.handlePanelAsset(req({ params: { fichero: 'estilo.css' } }));
    assert.strictEqual(css.headers['Content-Type'], 'text/css; charset=utf-8');

    for (const malo of ['index.html', '../index.js', 'secreto.txt']) {
      const r = await modulo.handlePanelAsset(req({ params: { fichero: malo } }));
      assert.strictEqual(r.status, 404, `'${malo}' no se sirve`);
    }
  } finally { await limpiar(root); }
});

test('el panel se copia a <public>/<proyecto>/publicador/ y no se reescribe dos veces', async () => {
  const { modulo, root, proyecto } = await montar();
  try {
    const destino = path.join(root, proyecto, 'publicador');
    // onLoad ya lo instalo para el proyecto que existia.
    for (const fichero of ['index.html', 'app.js', 'estilo.css']) {
      const st = await fsp.stat(path.join(destino, fichero));
      assert.ok(st.isFile(), `${fichero} esta en el proyecto`);
    }

    // Un segundo pase no escribe nada (un deploy no reescribe el mundo).
    const segunda = await modulo._instalarPanel(proyecto);
    assert.strictEqual(segunda.instalado, true);
    assert.deepStrictEqual(segunda.escritos, []);

    // Un proyecto sin carpeta publica no se inventa: se dice por que no.
    const sinCarpeta = await modulo.handleInstalarPanel(req({ params: { proyecto: 'fantasma' } }));
    assert.strictEqual(sinCarpeta.status, 404);
    assert.ok(sinCarpeta.data.error.message.includes('fantasma'));

    // Y a mano, para un proyecto recien creado, funciona.
    await fsp.mkdir(path.join(root, 'nuevo'), { recursive: true });
    const instalado = await modulo.handleInstalarPanel(req({ params: { proyecto: 'nuevo' } }));
    assert.strictEqual(instalado.status, 200);
    assert.ok(instalado.data.url.endsWith('/a/nuevo/publicador/'));
    // Y deja la carpeta de material dicha: el panel abre en vacio, no en 404.
    assert.ok((await fsp.stat(path.join(root, 'nuevo', 'media'))).isDirectory());
  } finally { await limpiar(root); }
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
  if (fails.length === 0) { console.log(`\n[marketing-publicador] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[marketing-publicador] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
