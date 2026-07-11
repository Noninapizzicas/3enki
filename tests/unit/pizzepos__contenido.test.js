/**
 * Tests unitarios — pizzepos__contenido (reflejo HIBRIDO, v1.0.0).
 *
 * Base de enriquecimiento audiovisual por producto. 4 ops: get, add_imagen, quitar_imagen, set.
 * El mock del bus es fs-backed (read/write/delete) con el contrato REAL de filesystem.
 *
 * Ejecutar: node tests/unit/pizzepos__contenido.test.js
 */

'use strict';

const assert = require('assert');
const ContenidoReflejo = require('../../modules/pizzepos/contenido/index.js');

function makeBus(store) {
  const handlers = new Map();
  const published = [];
  const emit = (event, payload) => {
    const fns = handlers.get(event);
    if (fns) for (const fn of [...fns]) setImmediate(() => fn({ data: payload }));
  };
  return {
    published, store,
    subscribe(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event)?.delete(fn);
    },
    async publish(event, payload) {
      published.push([event, payload]);
      const rid = payload.request_id;
      if (event === 'fs.read.request') {
        const content = store[payload.path];
        emit('fs.read.response', content != null
          ? { request_id: rid, path: payload.path, content }
          : { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND' } });
      } else if (event === 'fs.write.request') {
        store[payload.path] = payload.content;
        emit('fs.write.response', { request_id: rid, path: payload.path });
      } else if (event === 'fs.delete.request') {
        if (store[payload.path] == null) { emit('fs.delete.response', { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND' } }); return; }
        delete store[payload.path];
        emit('fs.delete.response', { request_id: rid, path: payload.path });
      }
    }
  };
}

function makeReflejo(store = {}) {
  const m = new ContenidoReflejo();
  const bus = makeBus(store);
  m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: bus, metrics: { increment(){} } });
  return { m, bus, store };
}

const base = { project_id: 'proj-1' };
const STORE = '/pizzepos/contenido.json';
const b64 = Buffer.from('imagen-falsa').toString('base64');

async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); process.exit(1); }
}

(async () => {
  console.log('pizzepos__contenido — reflejo híbrido v1.0.0\n');

  await testAsync('add_imagen: escribe fichero + referencia, primera = principal, emite evento', async () => {
    const { m, bus, store } = makeReflejo();
    const r = await m._addImagen({ ...base, product_id: 'pizzicas_samba', content: b64, ext: 'jpg', alt: 'Samba' });
    assert.strictEqual(r.status, 201);
    assert.ok(r.data.id && r.data.url.startsWith('/pizzepos/contenido/imagenes/'));
    assert.strictEqual(r.data.principal, true, 'la primera es principal');
    // el fichero de imagen está en el store fs y la referencia en contenido.json
    assert.ok(Object.keys(store).some(k => k.startsWith('/pizzepos/contenido/imagenes/')), 'fichero escrito');
    const c = JSON.parse(store[STORE]);
    assert.strictEqual(c.productos.pizzicas_samba.imagenes.length, 1);
    assert.ok(bus.published.some(([e]) => e === 'contenido.actualizado'));
  });

  await testAsync('add_imagen: la 2ª no es principal; principal:true reasigna', async () => {
    const { m } = makeReflejo();
    await m._addImagen({ ...base, product_id: 'p', content: b64, ext: 'png' });          // principal
    const r2 = await m._addImagen({ ...base, product_id: 'p', content: b64, ext: 'png' }); // no principal
    assert.strictEqual(r2.data.principal, false);
    const r3 = await m._addImagen({ ...base, product_id: 'p', content: b64, ext: 'png', principal: true });
    assert.strictEqual(r3.data.principal, true);
    const g = await m._get({ ...base, product_id: 'p' });
    const principales = g.data.imagenes.filter(i => i.principal);
    assert.strictEqual(principales.length, 1, 'solo una principal');
    assert.strictEqual(principales[0].id, r3.data.id, 'la última marcada');
  });

  await testAsync('get: producto sin contenido → estructura vacía reservada', async () => {
    const { m } = makeReflejo();
    const r = await m._get({ ...base, product_id: 'fantasma' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data, { imagenes: [], descripcion: '', audio: [], video: [], interaccion: {} });
  });

  await testAsync('quitar_imagen: borra referencia + fichero, promueve principal', async () => {
    const { m, store } = makeReflejo();
    const i1 = await m._addImagen({ ...base, product_id: 'p', content: b64, ext: 'jpg' }); // principal
    const i2 = await m._addImagen({ ...base, product_id: 'p', content: b64, ext: 'jpg' });
    const r = await m._quitarImagen({ ...base, product_id: 'p', imagen_id: i1.data.id });
    assert.strictEqual(r.status, 200);
    assert.ok(!Object.keys(store).includes(i1.data.url), 'fichero borrado');
    const g = await m._get({ ...base, product_id: 'p' });
    assert.strictEqual(g.data.imagenes.length, 1);
    assert.strictEqual(g.data.imagenes[0].id, i2.data.id);
    assert.strictEqual(g.data.imagenes[0].principal, true, 'promovida a principal');
  });

  await testAsync('quitar_imagen inexistente → 404', async () => {
    const { m } = makeReflejo();
    await m._addImagen({ ...base, product_id: 'p', content: b64, ext: 'jpg' });
    const r = await m._quitarImagen({ ...base, product_id: 'p', imagen_id: 'zzz' });
    assert.strictEqual(r.status, 404);
  });

  await testAsync('set (PUERTA EXTENSIBLE): deep-merge de descripcion/audio sin tocar imagenes', async () => {
    const { m } = makeReflejo();
    await m._addImagen({ ...base, product_id: 'p', content: b64, ext: 'jpg' });
    const r = await m._set({ ...base, product_id: 'p', parche: { descripcion: 'La pizza estrella', audio: [{ url: '/x.mp3', tipo: 'jingle' }] } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.descripcion, 'La pizza estrella');
    assert.strictEqual(r.data.audio.length, 1);
    assert.strictEqual(r.data.imagenes.length, 1, 'set NO pisó las imágenes');
  });

  await testAsync('set: parche parcial no pisa el resto (deep-merge)', async () => {
    const { m } = makeReflejo();
    await m._set({ ...base, product_id: 'p', parche: { descripcion: 'A', interaccion: { hover: 'zoom' } } });
    const r = await m._set({ ...base, product_id: 'p', parche: { interaccion: { sonido: 'pop' } } });
    assert.strictEqual(r.data.descripcion, 'A', 'descripcion intacta');
    assert.strictEqual(r.data.interaccion.hover, 'zoom', 'hover intacto');
    assert.strictEqual(r.data.interaccion.sonido, 'pop', 'sonido añadido');
  });

  await testAsync('get sin product_id → todos los productos', async () => {
    const { m } = makeReflejo();
    await m._addImagen({ ...base, product_id: 'a', content: b64, ext: 'jpg' });
    await m._addImagen({ ...base, product_id: 'b', content: b64, ext: 'jpg' });
    const r = await m._get({ ...base });
    assert.deepStrictEqual(Object.keys(r.data).sort(), ['a', 'b']);
  });

  // REGRESIÓN del engranaje: response correlada al request_id externo (vía _atender).
  await testAsync('add_imagen: response correlada al request_id externo', async () => {
    const { m, bus } = makeReflejo();
    await m.onAddImagenRequest({ data: { request_id: 'OUT-1', project_id: 'proj-1', product_id: 'p', content: b64, ext: 'jpg' } });
    const resp = bus.published.find(([e]) => e === 'contenido.add_imagen.response');
    assert.ok(resp);
    assert.strictEqual(resp[1].request_id, 'OUT-1');
    assert.strictEqual(resp[1].status, 201);
  });

  await testAsync('add_imagen REFERENCIA: url_remota → apunta al CDN, sin escribir fichero, remota:true', async () => {
    const { m, store } = makeReflejo();
    const r = await m._addImagen({ ...base, product_id: 'gafas', url_remota: 'https://i0.wp.com/esthervolta.com/x.jpg', alt: 'Gafas' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.url, 'https://i0.wp.com/esthervolta.com/x.jpg', 'la url es la remota, no una ruta local');
    assert.strictEqual(r.data.remota, true);
    assert.ok(!Object.keys(store).some(k => k.startsWith('/pizzepos/contenido/imagenes/')), 'NO escribe fichero (referencia)');
    const c = JSON.parse(store[STORE]);
    assert.strictEqual(c.productos.gafas.imagenes[0].fuente, 'web');
  });

  await testAsync('add_imagen: sin content ni url_remota → INVALID_INPUT', async () => {
    const { m } = makeReflejo();
    const r = await m._addImagen({ ...base, product_id: 'p', alt: 'x' });
    assert.strictEqual(r.status, 400);
  });

  await testAsync('quitar_imagen REMOTA: no intenta borrar del fs (solo la referencia)', async () => {
    const { m } = makeReflejo();
    const add = await m._addImagen({ ...base, product_id: 'p', url_remota: 'https://i0.wp.com/z.png' });
    let borradoFs = false;
    m._delete = async () => { borradoFs = true; return { status: 200 }; };
    const q = await m._quitarImagen({ ...base, product_id: 'p', imagen_id: add.data.id });
    assert.strictEqual(q.status, 200);
    assert.strictEqual(borradoFs, false, 'una referencia remota no se borra del fs');
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
