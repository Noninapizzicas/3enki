/**
 * Tests unitarios — pizzepos__carta-design (reflejo HIBRIDO, v3.0.0).
 *
 * El reflejo sirve 4 ops: contexto_diseno (carta+marca), load_carta (carta), save, gallery.
 * NO hay profiles (la identidad sale de la marca). El mock del bus es fs-backed con el
 * contrato REAL de filesystem (éxito={...data} sin status; error={error}) y responde a
 * carta.get (carta-manager) y carta-marketing.get_perfil (marca).
 *
 * Ejecutar: node tests/unit/pizzepos__carta-design.test.js
 */

'use strict';

const assert = require('assert');
const CartaDesignReflejo = require('../../modules/pizzepos/carta-design/index.js');

// Bus fs-backed con shapes REALES. carta → carta.get; marca → carta-marketing.get_perfil.
function makeBus(store, carta, marca) {
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
      } else if (event === 'carta-marketing.get_perfil.request') {
        emit('carta-marketing.get_perfil.response', marca
          ? { request_id: rid, status: 200, data: marca }
          : { request_id: rid, status: 404, error: { code: 'RESOURCE_NOT_FOUND', message: 'sin marca' } });
      } else if (event === 'fs.read.request') {
        const content = store[payload.path];
        emit('fs.read.response', content != null
          ? { request_id: rid, path: payload.path, content }
          : { request_id: rid, error: { code: 'RESOURCE_NOT_FOUND', message: 'File not found' } });
      } else if (event === 'fs.write.request') {
        store[payload.path] = payload.content;
        emit('fs.write.response', { request_id: rid, path: payload.path });
      } else if (event === 'render.verificar.request') {
        // 2º freno (verificador-visual): en test, simulamos "miró y está sano".
        emit('render.verificar.response', { request_id: rid, status: 200, data: { ok: true, verificado: true, motivos: [] } });
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

function makeReflejo(store = {}, carta = null, marca = null) {
  const m = new CartaDesignReflejo();
  const bus = makeBus(store, carta, marca);
  m.onLoad({ logger: { debug(){}, info(){}, warn(){}, error(){} }, eventBus: bus, metrics: { increment(){} } });
  return { m, bus, store };
}

const base = { project_id: 'proj-1' };
async function testAsync(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { console.error(`✗ ${desc}\n  ${e.message}`); if (process.env.STACK) console.error(e.stack); process.exit(1); }
}

(async () => {
  console.log('pizzepos__carta-design — reflejo híbrido v3.0.0\n');

  await testAsync('load_carta delega a carta.get y devuelve objeto fresco {status,data}', async () => {
    const carta = { meta: { id: 'carta_1', nombre: 'X' }, productos: [{ id: 'p1' }] };
    const { m, bus } = makeReflejo({}, carta);
    const r = await m._loadCarta({ ...base, carta_id: 'carta_1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.meta.id, 'carta_1');
    assert.ok(bus.published.some(([e]) => e === 'carta.get.request'));
  });

  // REGRESIÓN del bug del engranaje: la response NO debe heredar el request_id interno de
  // carta.get. _loadCarta devuelve {status,data} fresco → _atender la correla al request_id
  // EXTERNO (design.load_carta). Antes hacía `return r` y el id interno pisaba al externo → timeout.
  await testAsync('load_carta: la response se correla al request_id EXTERNO (no al de carta.get)', async () => {
    const { m, bus } = makeReflejo({}, { meta: { id: 'carta_1' } });
    await m.onLoadCartaRequest({ data: { request_id: 'OUTER-123', project_id: 'proj-1', carta_id: 'carta_1' } });
    const resp = bus.published.find(([e]) => e === 'design.load_carta.response');
    assert.ok(resp, 'publica design.load_carta.response');
    assert.strictEqual(resp[1].request_id, 'OUTER-123', 'correlada al request_id externo');
    assert.strictEqual(resp[1].status, 200);
  });

  await testAsync('contexto_diseno: HIDRATA {carta, marca} y NO trae profiles', async () => {
    const carta = { meta: { id: 'carta_1' }, productos: [{ id: 'p1' }] };
    const marca = { esencia: { nombre: 'No ni ná' }, visual: { colores: { primario: '#4ade80' } } };
    const { m } = makeReflejo({}, carta, marca);
    const r = await m._contextoDiseno({ ...base, carta_id: 'carta_1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.carta.meta.id, 'carta_1');
    assert.strictEqual(r.data.marca.esencia.nombre, 'No ni ná');
    assert.ok(!('profiles' in r.data), 'sin campo profiles');
  });

  await testAsync('contexto_diseno: marca best-effort → null si carta-marketing no la tiene', async () => {
    const carta = { meta: { id: 'carta_1' } };
    const { m } = makeReflejo({}, carta, null);   // sin marca
    const r = await m._contextoDiseno({ ...base, carta_id: 'carta_1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.marca, null);
    assert.ok(r.data.carta, 'la carta sí viene');
  });

  await testAsync('contexto_diseno: carta inexistente → propaga el error correlado (sin colgar)', async () => {
    const { m, bus } = makeReflejo({}, null);   // carta.get → 404
    await m.onContextoDisenoRequest({ data: { request_id: 'OUT-9', project_id: 'proj-1', carta_id: 'fantasma' } });
    const resp = bus.published.find(([e]) => e === 'design.contexto_diseno.response');
    assert.ok(resp, 'publica response');
    assert.strictEqual(resp[1].request_id, 'OUT-9');
    assert.strictEqual(resp[1].status, 404);
  });

  await testAsync('save: escribe html + meta y emite carta.html.generada', async () => {
    // carta real + html que la REPRESENTA → pasa el freno estructural (productos) y el de render (mock sano).
    const carta = { meta: { id: 'carta_1' }, productos: [{ nombre: 'Margarita', alergenos: [] }] };
    const html = '<html><body>' + 'x'.repeat(220) + ' Margarita 8€</body></html>';
    const { m, bus, store } = makeReflejo({}, carta);
    const r = await m._save({ ...base, carta_id: 'carta_1', html, nombre: 'San Valentín', formato: 'A4 apaisado · doble cara · 3 col', generado_por: 'pagina' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.data.carta_id, 'carta_1');
    assert.strictEqual(r.data.nombre, 'San Valentín');
    assert.strictEqual(r.data.formato, 'A4 apaisado · doble cara · 3 col');
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
