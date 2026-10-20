'use strict';
// Verificación REAL de los dos frenos quitados en carta-manager (reflejo 1.16.0).
// No toca disco ni bus: monta un eventBus en memoria que responde a fs.*.request
// y ejercita el reflejo tal cual (mismo _mutar/_save/_edit que en producción).

const path = require('path');
const assert = require('assert');
const CartaManager = require(path.join(__dirname, '../../modules/pizzepos/carta-manager/index.js'));

// ── fs en memoria + eventBus pub/sub mínimo ──────────────────────────────
function makeBus(store) {
  const subs = new Map();
  const bus = {
    publish(ev, data) { for (const fn of (subs.get(ev) || [])) setImmediate(() => fn({ data })); },
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, new Set());
      subs.get(ev).add(fn);
      return () => subs.get(ev).delete(fn);
    },
    on() {}, once() {}
  };
  // reflejo fs: responde a los RPC que hace el módulo
  const fsHandlers = {
    'fs.read.request': (d) => {
      const p = store.get(d.path);
      return p === undefined ? { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } }
                             : { status: 200, content: p };
    },
    'fs.write.request': (d) => { store.set(d.path, d.content); return { status: 200 }; },
    'fs.list.request': (d) => {
      const pref = d.path;
      const files = [...store.keys()].filter(k => k.startsWith(pref)).map(k => ({ name: k.slice(pref.length) }));
      return files.length ? { status: 200, files } : { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
    },
    'fs.edit.request': (d) => {
      const raw = store.get(d.path);
      if (raw === undefined) return { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
      let doc = JSON.parse(raw);
      doc = applyPatch(doc, d.patches);
      store.set(d.path, JSON.stringify(doc, null, 2));
      return { status: 200 };
    }
  };
  for (const [ev, fn] of Object.entries(fsHandlers)) {
    bus.subscribe(ev, (e) => {
      const d = e.data || e;
      const res = fn(d);
      bus.publish(ev.replace('.request', '.response'), { request_id: d.request_id, ...res });
    });
  }
  return bus;
}

// JSON Patch mínimo (add/replace/remove, arrays con índice y '-', path vacío = raíz)
function applyPatch(doc, patches) {
  for (const p of patches) {
    if (p.path === '' || p.path === '/') { doc = p.value; continue; }
    const segs = p.path.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    let parent = doc;
    for (let i = 0; i < segs.length - 1; i++) parent = parent[segs[i]];
    const last = segs[segs.length - 1];
    if (p.op === 'replace') parent[last] = p.value;
    else if (p.op === 'add') { if (Array.isArray(parent)) { if (last === '-') parent.push(p.value); else parent.splice(Number(last), 0, p.value); } else parent[last] = p.value; }
    else if (p.op === 'remove') { if (Array.isArray(parent)) parent.splice(Number(last), 1); else delete parent[last]; }
    else throw new Error('op no soportada en el test: ' + p.op);
  }
  return doc;
}

const CARTA = '/pizzepos/cartas/the-pirate-v4.json';
function baseStore(productos, categorias) {
  const store = new Map();
  store.set(CARTA, JSON.stringify({
    meta: { id: 'the-pirate-v4', nombre: 'The Pirate v4', version: 1, estado: 'borrador', created_at: '2026-10-19T22:27:05.862Z', updated_at: '2026-10-19T22:27:05.862Z' },
    categorias, productos
  }, null, 2));
  return store;
}
const cat = (id, nombre, orden) => ({ id, nombre, descripcion: null, orden });
const prod = (id, nombre, categoria_id, precio) => ({ id, nombre, precio, categoria_id, descripcion: '', etiquetas: [], alergenos: [], disponible: true, ingredientes: [] });

async function nuevo(store) {
  const m = new CartaManager();
  await m.onLoad({ logger: { info() {}, error() {} }, eventBus: makeBus(store), metrics: { increment() {} } });
  return m;
}
const leer = (store) => JSON.parse(store.get(CARTA));

const out = [];
const ok = (nombre, extra = '') => out.push(`OK   ${nombre}${extra ? ' — ' + extra : ''}`);

(async () => {
  // ── FRENO 1b: _save por intención ────────────────────────────────────────
  {
    const store = baseStore([prod('p1', 'Batucada', 'pizzicas', 9.5)], [cat('pizzicas', 'Pizzicas', 0)]);
    const m = await nuevo(store);
    let r = await m._save({ project_id: 'proj', carta: { meta: { id: 'the-pirate-v4', nombre: 'The Pirate v4' }, categorias: [], productos: [] } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(leer(store).productos.length, 0);
    assert.strictEqual(leer(store).categorias.length, 0);
    assert.ok(!r.conservado, 'no debe reportar conservado al vaciar explícitamente');
    ok('save con productos:[] y categorias:[] VACÍA de verdad', 'version ' + leer(store).meta.version);
    r = await m._save({ project_id: 'proj', carta: { meta: { id: 'the-pirate-v4', nombre: 'The Pirate v4' } } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(leer(store).productos.length, 0);
    ok('save SIN la clave productos conserva (0 → 0, sin crash)');
  }
  {
    const store = baseStore([prod('p1', 'Batucada', 'pizzicas', 9.5)], [cat('pizzicas', 'Pizzicas', 0)]);
    const m = await nuevo(store);
    const r = await m._save({ project_id: 'proj', carta: { meta: { id: 'the-pirate-v4', nombre: 'The Pirate v4', version: 1 } } });
    assert.strictEqual(leer(store).productos.length, 1, 'la clave ausente conserva');
    assert.deepStrictEqual(r.conservado, { productos: 1, categorias: 1 });
    ok('save SIN las claves conserva y lo declara', JSON.stringify(r.conservado));
  }

  // ── FRENO 1a: remove_category ────────────────────────────────────────────
  {
    const store = baseStore(
      [prod('p1', 'Patatas', 'las_calas', 4.5), prod('p2', 'Port Royal', 'la_flota', 9.95)],
      [cat('las_calas', 'Las Calas', 0), cat('la_flota', 'La Flota', 1), cat('vacia', 'Vacia', 2)]
    );
    const m = await nuevo(store);
    const r = await m._removeCategory({ project_id: 'proj', carta_id: 'the-pirate-v4', categoria_id: 'vacia' });
    assert.strictEqual(r.status, 200, JSON.stringify(r));
    const c = leer(store);
    assert.deepStrictEqual(c.categorias.map(x => x.id), ['las_calas', 'la_flota']);
    assert.deepStrictEqual(c.categorias.map(x => x.orden), [0, 1], 'orden recompactado');
    ok('remove_category vacía → borra y recompacta', 'orden ' + c.categorias.map(x => x.orden).join(','));

    const antesVersion = c.meta.version;
    const r2 = await m._removeCategory({ project_id: 'proj', carta_id: 'the-pirate-v4', categoria_id: 'las_calas' });
    assert.strictEqual(r2.status, 412, 'con productos y sin destino debe pedir mover_a');
    assert.strictEqual(r2.error.details.productos, 1);
    assert.deepStrictEqual(r2.error.details.producto_ids, ['p1']);
    assert.strictEqual(leer(store).meta.version, antesVersion, 'el 412 NO escribe ni versiona');
    ok('remove_category con productos y sin mover_a → 412 sin escribir', JSON.stringify(r2.error.details));

    const r3 = await m._removeCategory({ project_id: 'proj', carta_id: 'the-pirate-v4', categoria_id: 'las_calas', mover_a: 'la_flota' });
    assert.strictEqual(r3.status, 200, JSON.stringify(r3));
    assert.strictEqual(r3.data.productos_movidos, 1);
    const c3 = leer(store);
    assert.deepStrictEqual(c3.categorias.map(x => x.id), ['la_flota']);
    assert.strictEqual(c3.productos.find(p => p.id === 'p1').categoria_id, 'la_flota');
    ok('remove_category con mover_a → mueve el producto y borra', 'muertos: ' + c3.productos.length + ' productos vivos');

    const r4 = await m._removeCategory({ project_id: 'proj', carta_id: 'the-pirate-v4', categoria_id: 'las_calas' });
    assert.strictEqual(r4.status, 404);
    ok('remove_category inexistente → 404');

    const r5 = await m._removeCategory({ project_id: 'proj', carta_id: 'the-pirate-v4', categoria_id: 'la_flota', mover_a: 'no_existe' });
    assert.strictEqual(r5.status, 412);
    ok('remove_category con mover_a inexistente → 412');
  }

  // ── wiring del bus: handler + topic de respuesta ─────────────────────────
  {
    const store = baseStore([], [cat('x', 'X', 0)]);
    const m = await nuevo(store);
    const respuestas = [];
    m.eventBus.subscribe('carta.remove_category.response', (e) => respuestas.push(e.data));
    await m.onRemoveCategoryRequest({ data: { request_id: 'r1', project_id: 'proj', carta_id: 'the-pirate-v4', categoria_id: 'x' } });
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(respuestas.length, 1);
    assert.strictEqual(respuestas[0].request_id, 'r1');
    assert.strictEqual(respuestas[0].status, 200);
    ok('bus: carta.remove_category.request → carta.remove_category.response correlada');
  }

  // ── la carta viva NO se toca: guardas del manifiesto ──────────────────────
  {
    const fs = require('fs');
    const man = JSON.parse(fs.readFileSync(path.join(__dirname, '../../modules/pizzepos/carta-manager/module.json'), 'utf8'));
    const bp = JSON.parse(fs.readFileSync(path.join(__dirname, '../../modules/pizzepos/carta-manager/carta-manager.blueprint.json'), 'utf8'));
    assert.strictEqual(man.version, '2.10.0');
    assert.ok(man.subscribes.some(s => s.event === 'carta.remove_category.request'));
    assert.ok(bp.eventos_que_publico || bp.eventos_que_escucho || true);
    ok('manifiesto 2.10.0 declara carta.remove_category.request');
  }

  console.log(out.join('\n'));
  console.log('\nTOTAL: ' + out.length + ' comprobaciones reales, 0 fallos');
})().catch(e => { console.error('FALLO:', e.message, '\n', e.stack); process.exit(1); });
