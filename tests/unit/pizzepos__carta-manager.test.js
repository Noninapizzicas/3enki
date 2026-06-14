/**
 * Tests unitarios — pizzepos__carta-manager (reflejo, FASE 2 identidad determinista).
 *
 * El reflejo muta via RPC al bus (fs.read/edit/write.request). El mock es un bus
 * fs-backed: guarda la carta en memoria y aplica los patches RFC6902 que el reflejo
 * emite, de modo que podemos encadenar mutaciones (p.ej. añadir dos veces → 409).
 *
 * Verifica las garantías de FASE 2:
 *   - add_product: id DETERMINISTA slug(cat)+'_'+slug(nombre) (no UUID) → sin duplicados,
 *   - add_product: acepta y normaliza `ingredientes` a {id, nombre, emoji?, familia},
 *   - add_category: id = slug(nombre), dedup por id,
 *   - update_product: acepta ingredientes, el id del producto NO cambia al renombrar.
 *
 * Ejecutar: node tests/unit/pizzepos__carta-manager.test.js
 */

'use strict';

const assert = require('assert');
const CartaManagerReflejo = require('../../modules/pizzepos/carta-manager/index.js');

const CARTA_PATH = '/pizzepos/cartas/carta_nonina.json';

function cartaInicial() {
  return {
    meta: { id: 'carta_nonina', nombre: 'Nonina', version: 1, estado: 'borrador', created_at: '2026-06-13T00:00:00.000Z', updated_at: '2026-06-13T00:00:00.000Z' },
    categorias: [{ id: 'hamburguesas', nombre: 'Hamburguesas', orden: 0 }],
    productos: []
  };
}

// Aplicador mínimo de JSON Patch (los ops que emite el reflejo: replace, add /-, remove /i).
function getPath(obj, parts) { return parts.reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, parts, value) {
  if (parts.length === 0) return value;
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
  return obj;
}
function applyPatch(obj, patches) {
  let root = obj;
  for (const p of patches) {
    const parts = p.path.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (p.op === 'replace') {
      if (p.path === '') root = p.value; else setPath(root, parts, p.value);
    } else if (p.op === 'add') {
      if (parts[parts.length - 1] === '-') getPath(root, parts.slice(0, -1)).push(p.value);
      else setPath(root, parts, p.value);
    } else if (p.op === 'remove') {
      const idx = parts.pop();
      getPath(root, parts).splice(Number(idx), 1);
    }
  }
  return root;
}

// Bus fs-backed: responde fs.read/edit/write y mantiene el store coherente.
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
      if (event === 'fs.read.request') {
        const content = store[payload.path];
        emit('fs.read.response', content != null
          ? { request_id: payload.request_id, status: 200, content }
          : { request_id: payload.request_id, status: 404 });
      } else if (event === 'fs.write.request') {
        store[payload.path] = payload.content;
        emit('fs.write.response', { request_id: payload.request_id, status: 200 });
      } else if (event === 'fs.edit.request') {
        const cur = JSON.parse(store[payload.path] || '{}');
        const next = applyPatch(cur, payload.patches);
        store[payload.path] = JSON.stringify(next, null, 2);
        emit('fs.edit.response', { request_id: payload.request_id, status: 200 });
      } else if (event === 'fs.list.request') {
        emit('fs.list.response', { request_id: payload.request_id, status: 200, data: [] });
      }
    }
  };
}

function makeReflejo(store) {
  const m = new CartaManagerReflejo();
  const bus = makeBus(store);
  m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: bus, metrics: { increment(){} } });
  return { m, bus };
}

const base = { project_id: 'proj-nonina', carta_id: 'carta_nonina' };
async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); process.exit(1); }
}

(async () => {
  console.log('pizzepos__carta-manager — reflejo FASE 2 (identidad determinista)\n');

  await testAsync('add_product: id DETERMINISTA slug(cat)_slug(nombre) + ingredientes canónicos', async () => {
    const store = { [CARTA_PATH]: JSON.stringify(cartaInicial()) };
    const { m } = makeReflejo(store);
    const r = await m._addProduct({
      ...base,
      producto: {
        nombre: 'TEXAS', precio: 15.5, categoria_id: 'hamburguesas',
        ingredientes: [
          { nombre: 'Pan brioche', emoji: '🍞', familia: 'otro' },
          { nombre: 'Bacon', familia: 'carne' },
          { nombre: 'Salsa rara', familia: 'inventada' }   // familia inválida → 'otro'
        ]
      }
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.producto.id, 'hamburguesas_texas');   // determinista, no UUID
    const ing = r.data.producto.ingredientes;
    assert.strictEqual(ing.length, 3);
    assert.strictEqual(ing[0].id, 'pan_brioche');                   // id = slug(nombre)
    assert.strictEqual(ing[0].familia, 'otro');
    assert.strictEqual(ing[1].familia, 'carne');
    assert.strictEqual(ing[2].familia, 'otro');                     // familia inválida normalizada
  });

  await testAsync('add_product dos veces el mismo → 409 ALREADY_EXISTS (sin duplicar)', async () => {
    const store = { [CARTA_PATH]: JSON.stringify(cartaInicial()) };
    const { m } = makeReflejo(store);
    const p = { nombre: 'TEXAS', precio: 15.5, categoria_id: 'hamburguesas' };
    const r1 = await m._addProduct({ ...base, producto: p });
    assert.strictEqual(r1.status, 201);
    const r2 = await m._addProduct({ ...base, producto: p });
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.error.code, 'ALREADY_EXISTS');
    // el store tiene UN solo producto, no dos
    assert.strictEqual(JSON.parse(store[CARTA_PATH]).productos.length, 1);
  });

  await testAsync('add_product con categoria inexistente → 412 PRECONDITION_FAILED', async () => {
    const store = { [CARTA_PATH]: JSON.stringify(cartaInicial()) };
    const { m } = makeReflejo(store);
    const r = await m._addProduct({ ...base, producto: { nombre: 'X', precio: 1, categoria_id: 'fantasma' } });
    assert.strictEqual(r.status, 412);
  });

  await testAsync('add_category: id = slug(nombre); duplicado → 409', async () => {
    const store = { [CARTA_PATH]: JSON.stringify(cartaInicial()) };
    const { m } = makeReflejo(store);
    const r1 = await m._addCategory({ ...base, categoria: { nombre: 'Pizzicas' } });
    assert.strictEqual(r1.status, 201);
    assert.strictEqual(r1.data.categoria.id, 'pizzicas');
    // misma categoria (mismo slug) → 409
    const r2 = await m._addCategory({ ...base, categoria: { nombre: 'PIZZICAS' } });
    assert.strictEqual(r2.status, 409);
  });

  await testAsync('update_product: acepta ingredientes; el id NO cambia al renombrar', async () => {
    const carta = cartaInicial();
    carta.productos.push({ id: 'hamburguesas_texas', nombre: 'TEXAS', precio: 15.5, categoria_id: 'hamburguesas', ingredientes: [] });
    const store = { [CARTA_PATH]: JSON.stringify(carta) };
    const { m } = makeReflejo(store);
    const r = await m._updateProduct({
      ...base, producto_id: 'hamburguesas_texas',
      campos: { nombre: 'TEXAS DELUXE', ingredientes: [{ nombre: 'Queso', familia: 'queso' }] }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.producto.id, 'hamburguesas_texas');   // id estable aunque cambie el nombre
    assert.strictEqual(r.data.producto.nombre, 'TEXAS DELUXE');
    assert.strictEqual(r.data.producto.ingredientes[0].id, 'queso');
    assert.strictEqual(r.data.producto.ingredientes[0].familia, 'queso');
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
