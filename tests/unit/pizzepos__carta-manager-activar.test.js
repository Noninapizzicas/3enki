'use strict';

/**
 * pizzepos__carta-manager-activar — la op activar del reflejo.
 *
 * Activar una carta debe: (1) ponerla en_servicio con un patch de UN campo (sin reescribir
 * la carta -> no se pierden productos), (2) garantizar UNA sola activa bajando a borrador
 * cualquier OTRA en_servicio, (3) emitir carta.actualizada (lo que recoge el comandero/POS).
 *
 * Bus fs-backed en memoria (aplica los JSON Patch que emite el reflejo).
 * Ejecutar: node tests/unit/pizzepos__carta-manager-activar.test.js
 */

const assert = require('assert');
const CartaManagerReflejo = require('../../modules/pizzepos/carta-manager/index.js');

const DIR = '/pizzepos/cartas/';
const carta = (id, estado, productos = [{ id: 'p1', nombre: 'X' }]) => ({
  meta: { id, nombre: id, version: 1, estado, created_at: 't', updated_at: 't' },
  categorias: [{ id: 'c', nombre: 'C', orden: 0 }],
  productos
});

// JSON Patch mínimo (replace + add /- + remove /i) — los ops que emite el reflejo.
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

const estadoDe = (store, id) => JSON.parse(store[DIR + id + '.json']).meta.estado;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('activar pone la carta en_servicio (patch 1-campo, conserva productos)', async () => {
  const store = { [DIR + 'carta-4.json']: JSON.stringify(carta('carta-4', 'borrador', [{ id: 'a' }, { id: 'b' }])) };
  const m = makeReflejo(store);
  const r = await m._activar({ project_id: 'p', carta_id: 'carta-4' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.estado, 'en_servicio');
  assert.strictEqual(estadoDe(store, 'carta-4'), 'en_servicio');
  assert.strictEqual(JSON.parse(store[DIR + 'carta-4.json']).productos.length, 2, 'no pierde productos');
});

test('garantiza UNA sola activa: baja a borrador cualquier OTRA en_servicio', async () => {
  const store = {
    [DIR + 'carta-4.json']: JSON.stringify(carta('carta-4', 'borrador')),
    [DIR + 'vieja.json']: JSON.stringify(carta('vieja', 'en_servicio')),
    [DIR + 'arch.json']: JSON.stringify(carta('arch', 'archivada'))
  };
  const m = makeReflejo(store);
  await m._activar({ project_id: 'p', carta_id: 'carta-4' });
  assert.strictEqual(estadoDe(store, 'carta-4'), 'en_servicio');
  assert.strictEqual(estadoDe(store, 'vieja'), 'borrador', 'la otra activa baja a borrador');
  assert.strictEqual(estadoDe(store, 'arch'), 'archivada', 'la archivada no se toca');
});

test('emite carta.actualizada con la carta activada', async () => {
  const store = { [DIR + 'carta-4.json']: JSON.stringify(carta('carta-4', 'borrador')) };
  const m = makeReflejo(store);
  await m._activar({ project_id: 'p', carta_id: 'carta-4' });
  const ev = m.eventBus.published.find(([e]) => e === 'carta.actualizada');
  assert.ok(ev, 'debe emitir carta.actualizada');
  assert.strictEqual(ev[1].carta.meta.id, 'carta-4');
  assert.strictEqual(ev[1].carta.meta.estado, 'en_servicio');
  assert.strictEqual(ev[1].operacion, 'activar');
});

test('carta inexistente → 404 RESOURCE_NOT_FOUND, sin tocar nada', async () => {
  const store = {};
  const m = makeReflejo(store);
  const r = await m._activar({ project_id: 'p', carta_id: 'fantasma' });
  assert.strictEqual(r.status, 404);
  assert.ok(!m.eventBus.published.some(([e]) => e === 'carta.actualizada'));
});

test('sin carta_id → 400 INVALID_INPUT', async () => {
  const m = makeReflejo({});
  assert.strictEqual((await m._activar({ project_id: 'p' })).status, 400);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[pizzepos__carta-manager-activar] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[pizzepos__carta-manager-activar] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
