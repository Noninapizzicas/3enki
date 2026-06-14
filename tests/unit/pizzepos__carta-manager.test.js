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
function makeBus(store, recetas = {}) {
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
    // Emite los shapes REALES de filesystem: éxito → {request_id, ...data} SIN status;
    // error → {request_id, error:{code,message}} SIN status. (Mockear la realidad, no la suposición.)
    async publish(event, payload) {
      published.push([event, payload]);
      if (event === 'fs.read.request') {
        const content = store[payload.path];
        emit('fs.read.response', content != null
          ? { request_id: payload.request_id, path: payload.path, content }
          : { request_id: payload.request_id, error: { code: 'RESOURCE_NOT_FOUND', message: 'File not found' } });
      } else if (event === 'fs.write.request') {
        store[payload.path] = payload.content;
        emit('fs.write.response', { request_id: payload.request_id, path: payload.path });
      } else if (event === 'fs.edit.request') {
        if (store[payload.path] == null) { emit('fs.edit.response', { request_id: payload.request_id, error: { code: 'RESOURCE_NOT_FOUND', message: 'File not found' } }); return; }
        const cur = JSON.parse(store[payload.path]);
        store[payload.path] = JSON.stringify(applyPatch(cur, payload.patches), null, 2);
        emit('fs.edit.response', { request_id: payload.request_id, path: payload.path });
      } else if (event === 'fs.list.request') {
        const prefix = payload.path.endsWith('/') ? payload.path : payload.path + '/';
        const files = Object.keys(store)
          .filter(p => p.startsWith(prefix) && p.endsWith('.json') && !p.slice(prefix.length).includes('/'))
          .map(p => ({ name: p.slice(prefix.length), type: 'file' }));
        emit('fs.list.response', { request_id: payload.request_id, path: payload.path, files, items: files, count: files.length });
      } else if (event === 'recetas.obtener.request') {
        const receta = recetas[payload.receta_id] || null;
        emit('recetas.obtener.response', receta
          ? { request_id: payload.request_id, status: 200, data: receta }
          : { request_id: payload.request_id, status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'receta no existe' } });
      }
    }
  };
}

function makeReflejo(store, recetas = {}) {
  const m = new CartaManagerReflejo();
  const bus = makeBus(store, recetas);
  m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: bus, metrics: { increment(){} } });
  return { m, bus };
}

const base = { project_id: 'proj-nonina', carta_id: 'carta_nonina' };
async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); process.exit(1); }
}

(async () => {
  console.log('pizzepos__carta-manager — reflejo FASE 2+3 (identidad determinista)\n');

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

  // ── FASE 3: identidad de carta (onCartaCreada reusa la carta general existente) ──

  await testAsync('onCartaCreada con carta general en_servicio existente → REUSA su id (sobreescribe, no spawnea)', async () => {
    const existente = cartaInicial();
    existente.meta.estado = 'en_servicio';   // la general
    const store = { [CARTA_PATH]: JSON.stringify(existente) };
    const { m } = makeReflejo(store);
    // menu-generator manda una carta con OTRO id (nombre distinto)
    const entrante = { meta: { id: 'carta_bella', nombre: 'Carta Bella' }, categorias: [{ id: 'x', nombre: 'X', orden: 0 }], productos: [] };
    await m.onCartaCreada({ data: { project_id: 'proj-nonina', carta: entrante } });
    // NO se creó carta_bella.json; se sobreescribió carta_nonina.json
    assert.ok(!store['/pizzepos/cartas/carta_bella.json'], 'no debe crear fichero nuevo');
    const guardada = JSON.parse(store[CARTA_PATH]);
    assert.strictEqual(guardada.meta.id, 'carta_nonina');   // id reusado
    assert.strictEqual(guardada.meta.nombre, 'Carta Bella'); // contenido nuevo
  });

  await testAsync('onCartaCreada sin cartas previas → crea con el id entrante (primera vez)', async () => {
    const store = {};
    const { m } = makeReflejo(store);
    const entrante = { meta: { id: 'carta_nonina', nombre: 'Nonina' }, categorias: [{ id: 'x', nombre: 'X', orden: 0 }], productos: [] };
    await m.onCartaCreada({ data: { project_id: 'proj-nonina', carta: entrante } });
    assert.ok(store['/pizzepos/cartas/carta_nonina.json'], 'crea la primera carta con su id');
  });

  await testAsync('onCartaCreada con varias cartas activas (ambiguo) → NO fuerza id (deja el entrante)', async () => {
    const a = cartaInicial(); a.meta.id = 'carta_a';
    const b = cartaInicial(); b.meta.id = 'carta_b';
    const store = {
      '/pizzepos/cartas/carta_a.json': JSON.stringify(a),   // ambas borrador (ninguna en_servicio)
      '/pizzepos/cartas/carta_b.json': JSON.stringify(b)
    };
    const { m } = makeReflejo(store);
    const entrante = { meta: { id: 'carta_nueva', nombre: 'Nueva' }, categorias: [{ id: 'x', nombre: 'X', orden: 0 }], productos: [] };
    await m.onCartaCreada({ data: { project_id: 'proj-nonina', carta: entrante } });
    // ambiguo (2 activas, 0 en_servicio) → no pisa ninguna, crea con el id entrante
    assert.ok(store['/pizzepos/cartas/carta_nueva.json'], 'con varias activas no fuerza, respeta el id entrante');
  });

  // ── add_from_receta: NACE producto desde receta (toppings=variaciones; masa/salsa fuera) ──

  const recetaPizza = {
    nombre: 'pizza bachata', tipo: 'pizza',
    lineas: [
      { id: 'linea-masa', nombre: 'Masa de pizza', cantidad: 1, unidad: 'ud', categoria: 'masa' },        // BASE → fuera
      { id: 'linea-tomate', nombre: 'Tomate frito casero', cantidad: 60, unidad: 'g', categoria: 'salsa' }, // topping (salsa SÍ entra)
      { id: 'linea-alcaparras', nombre: 'Alcaparras', cantidad: 30, unidad: 'g', categoria: 'verdura' },    // topping
      { id: 'linea-anchoas', nombre: 'Anchoas', cantidad: 8.5, unidad: 'ud', categoria: 'pescado' },        // topping
      { id: 'linea-mozzarella', nombre: 'Queso mozzarella', cantidad: 100, unidad: 'g', categoria: 'queso' }// topping
    ]
  };

  await testAsync('add_from_receta: mapea líneas a ingredientes, EXCLUYE solo la masa (tomate=topping), id determinista', async () => {
    const carta = cartaInicial();
    carta.categorias.push({ id: 'pizzicas', nombre: 'Pizzicas', orden: 1 });
    const store = { [CARTA_PATH]: JSON.stringify(carta) };
    const { m } = makeReflejo(store, { 'pizza-bachata': recetaPizza });
    const r = await m._addFromReceta({ ...base, receta_id: 'pizza-bachata', categoria_id: 'pizzicas', precio: 10.5 });
    assert.strictEqual(r.status, 201);
    const prod = r.data.producto;
    assert.strictEqual(prod.id, 'pizzicas_pizza_bachata');   // id determinista (FASE 2)
    assert.strictEqual(prod.precio, 10.5);
    // 4 toppings: tomate(salsa) + alcaparras + anchoas + mozzarella ; solo la masa fuera
    assert.strictEqual(prod.ingredientes.length, 4);
    const nombres = prod.ingredientes.map(i => i.nombre);
    assert.ok(!nombres.includes('Masa de pizza'), 'la masa (base) fuera');
    assert.ok(nombres.includes('Tomate frito casero'), 'el tomate (salsa) SÍ es topping');
    assert.deepStrictEqual(prod.ingredientes.map(i => i.familia).sort(), ['pescado', 'queso', 'salsa', 'verdura']);
    assert.strictEqual(prod.ingredientes.find(i => i.nombre === 'Queso mozzarella').id, 'queso_mozzarella');
  });

  await testAsync('add_from_receta con precio omitido → 0 (NUNCA inventa precio)', async () => {
    const carta = cartaInicial();
    carta.categorias.push({ id: 'pizzicas', nombre: 'Pizzicas', orden: 1 });
    const store = { [CARTA_PATH]: JSON.stringify(carta) };
    const { m } = makeReflejo(store, { 'pizza-bachata': recetaPizza });
    const r = await m._addFromReceta({ ...base, receta_id: 'pizza-bachata', categoria_id: 'pizzicas' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.producto.precio, 0);
  });

  await testAsync('add_from_receta con receta inexistente → 404', async () => {
    const store = { [CARTA_PATH]: JSON.stringify(cartaInicial()) };
    const { m } = makeReflejo(store, {});
    const r = await m._addFromReceta({ ...base, receta_id: 'fantasma', categoria_id: 'hamburguesas' });
    assert.strictEqual(r.status, 404);
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
