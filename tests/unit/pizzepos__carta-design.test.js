/**
 * Tests unitarios — pizzepos__carta-design (reflejo HIBRIDO).
 *
 * El reflejo sirve las 6 ops de file management. El mock del bus es fs-backed con el
 * contrato REAL de filesystem (éxito={...data} sin status; error={error}). load_carta
 * delega a carta.get. Los built-in profiles se leen de verdad de design-profiles/.
 *
 * Ejecutar: node tests/unit/pizzepos__carta-design.test.js
 */

'use strict';

const assert = require('assert');
const CartaDesignReflejo = require('../../modules/pizzepos/carta-design/index.js');

// Aplicador mínimo de JSON Patch (los ops que emite el reflejo: test, replace, add).
function applyPatch(obj, patches) {
  for (const p of patches) {
    const parts = p.path.split('/').slice(1);
    if (p.op === 'test') {
      let o = obj; for (const k of parts) o = o?.[k];
      if (JSON.stringify(o) !== JSON.stringify(p.value)) throw new Error('test patch failed');
    } else if (p.op === 'replace' || p.op === 'add') {
      let o = obj; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = p.value;
    }
  }
  return obj;
}

// Bus fs-backed con shapes REALES. fixtures.carta = carta para carta.get.
function makeBus(store, carta) {
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
      if (event === 'carta.get.request') {
        emit('carta.get.response', carta
          ? { request_id: rid, status: 200, data: carta }
          : { request_id: rid, status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'no existe' } });
      } else if (event === 'fs.read.request') {
        const content = store[payload.path];
        emit('fs.read.response', content != null
          ? { request_id: rid, path: payload.path, content }
          : { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND', message: 'File not found' } });
      } else if (event === 'fs.write.request') {
        store[payload.path] = payload.content;
        emit('fs.write.response', { request_id: rid, path: payload.path });
      } else if (event === 'fs.edit.request') {
        if (store[payload.path] == null) { emit('fs.edit.response', { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND' } }); return; }
        try {
          store[payload.path] = JSON.stringify(applyPatch(JSON.parse(store[payload.path]), payload.patches), null, 2);
          emit('fs.edit.response', { request_id: rid, path: payload.path });
        } catch (e) { emit('fs.edit.response', { request_id: rid, error: { code: 'CONFLICT_STATE', message: e.message } }); }
      } else if (event === 'fs.list.request') {
        const prefix = payload.path.endsWith('/') ? payload.path : payload.path + '/';
        const files = Object.keys(store)
          .filter(p => p.startsWith(prefix) && p.endsWith('.json') && !p.slice(prefix.length).includes('/'))
          .map(p => ({ name: p.slice(prefix.length), type: 'file' }));
        emit('fs.list.response', { request_id: rid, path: payload.path, files, items: files, count: files.length });
      }
    }
  };
}

function makeReflejo(store = {}, carta = null) {
  const m = new CartaDesignReflejo();
  const bus = makeBus(store, carta);
  m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: bus, metrics: { increment(){} } });
  return { m, bus, store };
}

const base = { project_id: 'proj-1' };
async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); process.exit(1); }
}

(async () => {
  console.log('pizzepos__carta-design — reflejo híbrido\n');

  await testAsync('load_carta delega a carta.get (por la puerta de carta-manager)', async () => {
    const carta = { meta: { id: 'carta_1', nombre: 'X' }, productos: [{ id: 'p1' }] };
    const { m, bus } = makeReflejo({}, carta);
    const r = await m._loadCarta({ ...base, carta_id: 'carta_1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.meta.id, 'carta_1');
    assert.ok(bus.published.some(([e]) => e === 'carta.get.request'));
  });

  await testAsync('save: escribe html + meta y emite carta.html.generada', async () => {
    const { m, bus, store } = makeReflejo();
    const r = await m._save({ ...base, carta_id: 'carta_1', profile_id: 'modern-bold', html: '<html>hola</html>', generado_por: 'pagina' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.carta_id, 'carta_1');
    // hay un .html y un .json companion en el store
    const keys = Object.keys(store);
    assert.ok(keys.some(k => k.endsWith('.html')), 'guarda el html');
    assert.ok(keys.some(k => k.endsWith('.json')), 'guarda el meta');
    assert.ok(bus.published.some(([e]) => e === 'carta.html.generada'), 'emite el evento');
  });

  await testAsync('save sin html → 400 INVALID_INPUT', async () => {
    const { m } = makeReflejo();
    const r = await m._save({ ...base, carta_id: 'carta_1' });
    assert.strictEqual(r.status, 400);
  });

  await testAsync('profiles: devuelve los 5 built-in (leídos del módulo) + custom', async () => {
    const custom = { id: 'mi-estilo', nombre: 'Mi Estilo', tipo: 'custom', activo: true };
    const store = { '/pizzepos/carta-design/profiles/mi-estilo.json': JSON.stringify(custom) };
    const { m } = makeReflejo(store);
    const r = await m._profiles({ ...base });
    assert.strictEqual(r.status, 200);
    const builtIn = r.data.filter(p => p.tipo === 'built-in');
    const cust = r.data.filter(p => p.tipo === 'custom');
    assert.strictEqual(builtIn.length, 5, 'los 5 built-in');
    assert.strictEqual(cust.length, 1, 'el custom');
    assert.ok(builtIn.some(p => p.id === 'modern-bold'));
  });

  await testAsync('profiles: filtra los custom soft-deleted (activo:false)', async () => {
    const store = {
      '/pizzepos/carta-design/profiles/vivo.json': JSON.stringify({ id: 'vivo', nombre: 'Vivo', activo: true }),
      '/pizzepos/carta-design/profiles/muerto.json': JSON.stringify({ id: 'muerto', nombre: 'Muerto', activo: false })
    };
    const { m } = makeReflejo(store);
    const r = await m._profiles({ ...base });
    const ids = r.data.filter(p => p.tipo === 'custom').map(p => p.id);
    assert.ok(ids.includes('vivo') && !ids.includes('muerto'));
  });

  await testAsync('save_profile: id = slug(nombre), guarda activo:true', async () => {
    const { m, store } = makeReflejo();
    const r = await m._saveProfile({ ...base, nombre: 'Mi Estilo Rústico' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.id, 'mi-estilo-rustico');
    assert.strictEqual(r.data.activo, true);
    assert.ok(store['/pizzepos/carta-design/profiles/mi-estilo-rustico.json']);
  });

  await testAsync('save_profile que colisiona con built-in → 409', async () => {
    const { m } = makeReflejo();
    const r = await m._saveProfile({ ...base, nombre: 'Modern Bold' });   // slug → modern-bold (built-in)
    assert.strictEqual(r.status, 409);
  });

  await testAsync('delete_profile built-in → 403 PERMISSION_DENIED', async () => {
    const { m } = makeReflejo();
    const r = await m._deleteProfile({ ...base, profile_id: 'modern-bold' });
    assert.strictEqual(r.status, 403);
  });

  await testAsync('delete_profile custom → soft-delete (activo:false)', async () => {
    const store = { '/pizzepos/carta-design/profiles/mio.json': JSON.stringify({ id: 'mio', nombre: 'Mio', activo: true }) };
    const { m } = makeReflejo(store);
    const r = await m._deleteProfile({ ...base, profile_id: 'mio' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(JSON.parse(store['/pizzepos/carta-design/profiles/mio.json']).activo, false);
  });

  await testAsync('delete_profile inexistente → 404', async () => {
    const { m } = makeReflejo();
    const r = await m._deleteProfile({ ...base, profile_id: 'fantasma' });
    assert.strictEqual(r.status, 404);
  });

  await testAsync('gallery: lista designs y filtra por carta_id', async () => {
    const store = {
      '/pizzepos/carta-design/designs/carta_1__t1.json': JSON.stringify({ carta_id: 'carta_1', filename: 'carta_1__t1.html', generado_at: '2026-06-14T10:00:00Z' }),
      '/pizzepos/carta-design/designs/carta_2__t2.json': JSON.stringify({ carta_id: 'carta_2', filename: 'carta_2__t2.html', generado_at: '2026-06-14T11:00:00Z' })
    };
    const { m } = makeReflejo(store);
    const todos = await m._gallery({ ...base });
    assert.strictEqual(todos.data.length, 2);
    const soloUno = await m._gallery({ ...base, carta_id: 'carta_1' });
    assert.strictEqual(soloUno.data.length, 1);
    assert.strictEqual(soloUno.data[0].carta_id, 'carta_1');
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
