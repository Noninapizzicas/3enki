'use strict';

/**
 * Test del MÓDULO (no del constructor): se instancia el reflejo real con un bus
 * de mentira y se ejecuta el camino completo LEER → CONSTRUIR → GUARDAR → EMITIR.
 *
 * Lo que se verifica, que es lo que no se puede ver sin desplegar:
 *   · lee EXACTAMENTE las rutas que existen en el storage del proyecto;
 *   · escribe index.html y bloques.json en el destino del cableado;
 *   · emite pantalla-tv.publicada con carta, versión y huella;
 *   · con la carta en BORRADOR no escribe NADA y devuelve 409.
 *
 * Uso: node modules/pantalla-tv/test/modulo.test.js [--storage <ruta pizzepos>]
 * Se salta solo (exit 0) si no hay storage real que leer.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const PantallaTv = require('../index');

const i = process.argv.indexOf('--storage');
// OJO: raíz del STORAGE del proyecto (no la carpeta pizzepos): el módulo lee
// rutas relativas a esa raíz, 'pizzepos/tarifas.json' incluido.
const STORAGE = i > -1 ? process.argv[i + 1] : '/opt/enki/data/projects/the-pirate/storage';
const PUBLICADO = '/opt/enki/public/a/the-pirate/escaparate/bloques.json';
const CABLEADO = path.join(__dirname, '..', 'ejemplos', 'the-pirate.json');

if (!fs.existsSync(path.join(STORAGE, 'pizzepos', 'tarifas.json'))) {
  console.log(`\n(sin storage real en ${STORAGE}: test del módulo OMITIDO)`);
  process.exit(0);
}

function instancia({ cartaBorrador = false } = {}) {
  const m = new PantallaTv();
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.metrics = { increment() {} };
  const eventos = [];
  m.eventBus = { publish: (e, d) => eventos.push({ e, d }), subscribe: () => () => {} };
  const escritos = {};
  const leidos = [];

  m._rpc = async (evento, payload = {}) => {
    if (evento === 'fs.read.request') {
      leidos.push(payload.path);
      let f;
      if (payload.path === 'pantalla-tv/cableado.json') f = CABLEADO;      // el cableado vive en el storage del proyecto
      else f = path.join(STORAGE, String(payload.path).replace(/^\//, ''));
      if (!fs.existsSync(f)) return { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
      if (payload.encoding === 'base64') return { status: 200, content: fs.readFileSync(f).toString('base64') };
      let texto = fs.readFileSync(f, 'utf8');
      if (cartaBorrador && /cartas\//.test(payload.path)) {
        const c = JSON.parse(texto); c.meta.estado = 'borrador'; texto = JSON.stringify(c);
      }
      return { status: 200, content: texto };
    }
    if (evento === 'fs.write.request') { escritos[payload.path] = payload.content; return { status: 200 }; }
    return null;
  };
  return { m, eventos, escritos, leidos };
}

(async () => {
  console.log('\nmódulo pantalla-tv (bus de mentira, datos reales)');
  let ok = 0;
  const probar = async (nombre, fn) => {
    try { await fn(); console.log(`  ok  ${nombre}`); ok++; }
    catch (e) { console.log(`  FALLA ${nombre}\n        ${e.message}`); process.exitCode = 1; }
  };

  await probar('LEE las rutas del storage del proyecto y escribe en el destino del cableado', async () => {
    const { m, escritos, leidos } = instancia();
    const r = await m._construir({ project_id: 'the-pirate' }, 'test');
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    assert.ok(leidos.includes('pizzepos/tarifas.json'), 'no leyó tarifas');
    assert.ok(leidos.some(p => /^pizzepos\/cartas\/.+\.json$/.test(p)), 'no leyó la carta en servicio');
    assert.ok(leidos.includes('pizzepos/marca.json'), 'no leyó la marca');
    assert.ok(leidos.includes('pizzepos/servicio/config.json'), 'no leyó el servicio');
    assert.ok(escritos['/www/escaparate/bloques.json'], 'no escribió bloques.json');
    assert.ok(escritos['/www/escaparate/index.html'], 'no escribió index.html');
    const d = JSON.parse(escritos['/www/escaparate/bloques.json']);
    assert.strictEqual(d.sello.carta.estado, 'en_servicio');
    assert.ok(d.piezas.length > 0);
  });

  // Lo publicado tiene que estar ENTERO en lo que el constructor produce hoy: si
  // una pieza de la calle desaparece o cambia, el cliente está viendo algo que el
  // código ya no sabe hacer → falla. Al revés no: una pieza nueva que aún no está
  // publicada es un deploy pendiente, no una incoherencia — se canta y se sigue.
  await probar('todo lo que sirve la calle está en lo que escribe (y lo nuevo se canta)', async () => {
    if (!fs.existsSync(PUBLICADO)) throw new Error(`sin publicado en ${PUBLICADO}`);
    const { m, escritos } = instancia();
    await m._construir({ project_id: 'the-pirate' }, 'test');
    const nuevo = JSON.parse(escritos['/www/escaparate/bloques.json']);
    const vivo = JSON.parse(fs.readFileSync(PUBLICADO, 'utf8'));
    const firma = p => [p.id, p.forma, p.zona || '-', p.precio || '-', p.titulo || '-', p.imagen ? 'img' : 'sin'].join('|');
    const construidas = new Set(nuevo.piezas.map(firma));
    const publicadas = vivo.piezas.map(firma);
    const ausentes = publicadas.filter(f => !construidas.has(f));
    assert.deepStrictEqual(ausentes, [], 'la calle sirve piezas que el constructor ya no produce');
    const nuevas = [...construidas].filter(f => !publicadas.includes(f));
    if (nuevas.length) console.log(`        (${nuevas.length} piezas nuevas sin publicar — deploy pendiente: ${nuevas.length > 3 ? nuevas.slice(0, 3).join(', ') + '…' : nuevas.join(', ')})`);
    assert.strictEqual(nuevo.sello.carta.version, vivo.sello.carta.version);
  });

  await probar('emite pantalla-tv.publicada con carta, versión y huella', async () => {
    const { m, eventos } = instancia();
    await m._construir({ project_id: 'the-pirate' }, 'test');
    const ev = eventos.find(x => x.e === 'pantalla-tv.publicada');
    assert.ok(ev, 'no emitió el evento');
    assert.ok(ev.d.huella, 'sin huella');
    assert.ok(ev.d.carta && ev.d.carta.version, 'sin versión de carta');
    assert.strictEqual(ev.d.destino, '/www/escaparate');
  });

  await probar('carta en BORRADOR: NO escribe nada y devuelve 409', async () => {
    const { m, escritos, eventos } = instancia({ cartaBorrador: true });
    const r = await m._construir({ project_id: 'the-pirate' }, 'test');
    assert.strictEqual(r.status, 409);
    assert.strictEqual(Object.keys(escritos).length, 0, 'escribió con la carta en borrador');
    assert.ok(!eventos.some(x => x.e === 'pantalla-tv.publicada'));
  });

  await probar('proyecto SIN cableado: 404 y nada escrito (la pantalla es opt-in)', async () => {
    const { m, escritos } = instancia();
    m._rpc = async (evento, payload = {}) => {
      if (evento === 'fs.read.request') return { status: 404 };
      if (evento === 'fs.write.request') escritos[payload.path] = payload.content;
      return null;
    };
    const r = await m._construir({ project_id: 'otro' }, 'test');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(Object.keys(escritos).length, 0);
  });

  await probar('el rebote agrupa N eventos en UN horneado', async () => {
    const { m } = instancia();
    let llamadas = 0;
    m._construir = async () => { llamadas++; return { status: 200 }; };
    m.onCartaCambiada({ data: { project_id: 'the-pirate' } });
    m.onCartaCambiada({ data: { project_id: 'the-pirate' } });
    m.onContenidoCambiado({ data: { project_id: 'the-pirate' } });
    await new Promise(r => setTimeout(r, 4600));
    assert.strictEqual(llamadas, 1, `horneó ${llamadas} veces`);
  });

  console.log(`\n${ok} pruebas ok${process.exitCode ? ' — CON FALLOS' : ''}\n`);
})();
