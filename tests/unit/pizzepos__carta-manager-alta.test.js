'use strict';

/**
 * pizzepos__carta-manager-alta — la puerta del ASISTENTE (carta.add_product).
 *
 * Un producto que nace por el asistente tiene que nacer OPERABLE, no mudo:
 *   (1) los ingredientes pueden llegar como TEXTO ('mozzarella') o como ficha rica;
 *   (2) `ingredientes_base` es la misma cosa que `ingredientes` (lo que lleva) — se funde,
 *       porque es lo único que pintan la carta pública y el comandero;
 *   (3) si no vienen opciones, se DERIVAN de lo que lleva (QUITAR, delta 0) para que se
 *       pueda quitar la cebolla desde el primer segundo;
 *   (4) el id es determinista y el duplicado es 409.
 *
 * Bus fs-backed en memoria (aplica los JSON Patch que emite el reflejo).
 * Ejecutar: node tests/unit/pizzepos__carta-manager-alta.test.js
 */

const assert = require('assert');
const CartaManagerReflejo = require('../../modules/pizzepos/carta-manager/index.js');

const DIR = '/pizzepos/cartas/';
const carta = (id) => ({
  meta: { id, nombre: id, version: 1, estado: 'en_servicio', created_at: 't', updated_at: 't' },
  categorias: [{ id: 'pizzicas', nombre: 'Pizzicas', orden: 0 }],
  productos: []
});

function applyPatch(obj, patches) {
  let root = obj;
  for (const p of patches) {
    const parts = p.path.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (p.op === 'replace') {
      if (p.path === '') { root = p.value; continue; }
      let o = root; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = p.value;
    } else if (p.op === 'add') {
      let o = root; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      if (parts[parts.length - 1] === '-') o.push(p.value); else o[parts[parts.length - 1]] = p.value;
    } else if (p.op === 'remove') {
      const idx = parts.pop(); let o = root; for (const k of parts) o = o[k];
      o.splice(Number(idx), 1);
    }
  }
  return root;
}

function makeBus(store) {
  const handlers = new Map();
  const published = [];
  const emit = (event, payload) => { const fns = handlers.get(event); if (fns) for (const fn of [...fns]) setImmediate(() => fn({ data: payload })); };
  return {
    published, store,
    subscribe(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); return () => handlers.get(event)?.delete(fn); },
    async publish(event, payload) {
      published.push([event, payload]);
      if (event === 'fs.read.request') {
        const content = store[payload.path];
        emit('fs.read.response', content != null ? { request_id: payload.request_id, path: payload.path, content } : { request_id: payload.request_id, error: { code: 'RESOURCE_NOT_FOUND', message: 'nf' } });
      } else if (event === 'fs.write.request') {
        store[payload.path] = payload.content; emit('fs.write.response', { request_id: payload.request_id, path: payload.path });
      } else if (event === 'fs.edit.request') {
        if (store[payload.path] == null) { emit('fs.edit.response', { request_id: payload.request_id, error: { code: 'RESOURCE_NOT_FOUND', message: 'nf' } }); return; }
        store[payload.path] = JSON.stringify(applyPatch(JSON.parse(store[payload.path]), payload.patches), null, 2);
        emit('fs.edit.response', { request_id: payload.request_id, path: payload.path });
      } else if (event === 'fs.list.request') {
        const prefix = payload.path.endsWith('/') ? payload.path : payload.path + '/';
        const files = Object.keys(store).filter(p => p.startsWith(prefix) && p.endsWith('.json') && !p.slice(prefix.length).includes('/')).map(p => ({ name: p.slice(prefix.length), type: 'file' }));
        emit('fs.list.response', { request_id: payload.request_id, path: payload.path, files, items: files, count: files.length });
      }
    }
  };
}

function makeReflejo(store) {
  const m = new CartaManagerReflejo();
  m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: makeBus(store), metrics: { increment(){} } });
  return m;
}

const productoGuardado = (store, id) => JSON.parse(store[DIR + id + '.json']).productos.find(p => p.id.startsWith('pizzicas_'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('ingredientes como TEXTO se elevan a ficha canónica (id, familia, precio_extra)', async () => {
  const store = { [DIR + 'c.json']: JSON.stringify(carta('c')) };
  const m = makeReflejo(store);
  const r = await m._addProduct({
    project_id: 'p', carta_id: 'c',
    producto: { nombre: 'Prueba', precio: 9.99, categoria_id: 'pizzicas', ingredientes: ['mozzarella', 'tomate'] }
  });
  assert.strictEqual(r.status, 201);
  const p = productoGuardado(store, 'c');
  assert.strictEqual(p.ingredientes.length, 2, 'no pierde ingredientes por llegar como texto');
  assert.deepStrictEqual(p.ingredientes.map(i => i.id).sort(), ['mozzarella', 'tomate']);
  for (const i of p.ingredientes) {
    assert.ok(i.nombre && i.familia, 'cada ingrediente sale con nombre y familia');
    assert.strictEqual(typeof i.precio_extra, 'number', 'el comandero necesita precio_extra');
  }
});

test('ingredientes_base se funde en ingredientes (lo único que pinta la carta)', async () => {
  const store = { [DIR + 'c.json']: JSON.stringify(carta('c')) };
  const m = makeReflejo(store);
  await m._addProduct({
    project_id: 'p', carta_id: 'c',
    producto: { nombre: 'Prueba', precio: 9.99, categoria_id: 'pizzicas', ingredientes_base: ['mozzarella', 'tomate'] }
  });
  const p = productoGuardado(store, 'c');
  assert.strictEqual(p.ingredientes.length, 2);
  assert.strictEqual(p.ingredientes_base, undefined, 'no queda un campo que nadie lee');
});

test('ingredientes + ingredientes_base se fusionan sin duplicar por id', async () => {
  const store = { [DIR + 'c.json']: JSON.stringify(carta('c')) };
  const m = makeReflejo(store);
  await m._addProduct({
    project_id: 'p', carta_id: 'c',
    producto: {
      nombre: 'Prueba', precio: 9.99, categoria_id: 'pizzicas',
      ingredientes: [{ nombre: 'mozzarella', familia: 'queso', emoji: '🧀' }],
      ingredientes_base: ['mozzarella', 'tomate']
    }
  });
  const p = productoGuardado(store, 'c');
  assert.strictEqual(p.ingredientes.length, 2, 'mozzarella no se duplica');
  const moz = p.ingredientes.find(i => i.id === 'mozzarella');
  assert.strictEqual(moz.familia, 'queso', 'gana la ficha rica');
  assert.strictEqual(moz.emoji, '🧀');
});

test('sin opciones, se derivan QUITAR de lo que lleva', async () => {
  const store = { [DIR + 'c.json']: JSON.stringify(carta('c')) };
  const m = makeReflejo(store);
  await m._addProduct({
    project_id: 'p', carta_id: 'c',
    producto: { nombre: 'Prueba', precio: 9.99, categoria_id: 'pizzicas', ingredientes: ['mozzarella', 'tomate'] }
  });
  const p = productoGuardado(store, 'c');
  assert.ok(Array.isArray(p.opciones) && p.opciones.length, 'el producto nace con variaciones');
  const sin = p.opciones.find(o => o.modo === 'QUITAR');
  assert.ok(sin, 'hay bloque Sin');
  assert.deepStrictEqual(sin.valores.map(v => v.id).sort(), ['mozzarella', 'tomate']);
  assert.ok(sin.valores.every(v => v.delta_precio_centimos === 0), 'quitar no cobra');
});

test('id determinista y duplicado → 409', async () => {
  const store = { [DIR + 'c.json']: JSON.stringify(carta('c')) };
  const m = makeReflejo(store);
  const alta = { project_id: 'p', carta_id: 'c', producto: { nombre: 'Prueba', precio: 9.99, categoria_id: 'pizzicas' } };
  const r1 = await m._addProduct(alta);
  assert.strictEqual(r1.status, 201);
  assert.strictEqual(r1.data.producto.id, 'pizzicas_prueba');
  const r2 = await m._addProduct(alta);
  assert.strictEqual(r2.status, 409);
});

test('producto sin nombre o sin precio → 400', async () => {
  const store = { [DIR + 'c.json']: JSON.stringify(carta('c')) };
  const m = makeReflejo(store);
  assert.strictEqual((await m._addProduct({ project_id: 'p', carta_id: 'c', producto: { precio: 1, categoria_id: 'pizzicas' } })).status, 400);
  assert.strictEqual((await m._addProduct({ project_id: 'p', carta_id: 'c', producto: { nombre: 'X', categoria_id: 'pizzicas' } })).status, 400);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[pizzepos__carta-manager-alta] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pizzepos__carta-manager-alta] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
