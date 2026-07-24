'use strict';

/**
 * cupulas__vista-proyecto — la nota VIVA del proyecto: se COMPUTA al momento
 * desde los datos reales (config/project.json + persistencia/current/*), nunca
 * es un snapshot guardado. La cúpula 'proyecto' nace del acto. fs en memoria.
 *
 * Ejecutar: node tests/unit/cupulas__vista-proyecto.test.js
 */

const assert = require('assert');
const CupulasReflejo = require('../../modules/cupulas');

// ── arnés: instancia con fs en memoria (read/write/list) ──
function nuevo() {
  const published = [];
  const r = new CupulasReflejo();
  const fs = new Map(); // `${project_id}::${path}` → content string
  r.logger = { info() {}, warn() {}, error() {}, debug() {} };
  r.metrics = { increment() {} };
  r.eventBus = { publish(topic, payload) { published.push({ topic, payload }); } };
  r._publicarEvento = async (name, payload) => { published.push({ topic: name, payload }); };
  r._rpc = async (evento, payload) => {
    const key = `${payload.project_id}::${payload.path}`;
    if (evento === 'fs.read.request') {
      return fs.has(key) ? { status: 200, content: fs.get(key) } : { status: 404 };
    }
    if (evento === 'fs.write.request') { fs.set(key, payload.content); return { status: 200 }; }
    if (evento === 'fs.list.request') {
      const prefix = `${payload.project_id}::${payload.path}/`;
      const files = [];
      for (const k of fs.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rel = k.slice(prefix.length);
        if (rel.includes('/')) continue; // un solo nivel
        files.push({ name: rel, type: 'file', path: `${payload.path}/${rel}`, extension: '.' + rel.split('.').pop() });
      }
      return files.length ? { files, items: files, count: files.length } : { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
    }
    return null;
  };
  const set = (path, obj) => fs.set(`${PID}::${path}`, JSON.stringify(obj));
  return { r, fs, published, set };
}

const PID = 'proj-test';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('project_id ausente → 400 INVALID_INPUT', async () => {
  const { r } = nuevo();
  const v = await r._vistaProyecto({});
  assert.strictEqual(v.status, 400);
});

test('computa la nota con identidad + dominios vivos de persistencia/current', async () => {
  const { r, set } = nuevo();
  set('/config/project.json', { name: 'Nonina', tipo: 'pizzeria' });
  set('/persistencia/current/ventas.json', { total: 320, tickets: 12 });
  set('/persistencia/current/cuentas_activas.json', [{ id: 1 }, { id: 2 }]);
  const v = await r._vistaProyecto({ project_id: PID });
  assert.strictEqual(v.status, 200);
  assert.ok(v.data.fresca_en, 'lleva sello de frescura');
  const c = v.data.nota.contenido;
  assert.ok(c.includes('# Nonina · pizzeria'), 'título con identidad');
  assert.ok(c.includes('## Ventas'), 'sección de un dominio vivo');
  assert.ok(c.includes('## Cuentas activas'), 'dominio con nombre legible');
  assert.ok(c.includes('320'), 'el dato real está en el cuerpo');
  assert.deepStrictEqual(v.data.fuentes_presentes.sort(), ['cuentas_activas', 'identidad', 'ventas']);
});

test('proyecto vacío → la nota SE ENTREGA igual (nace parcial, honesta), no rompe', async () => {
  const { r } = nuevo();
  const v = await r._vistaProyecto({ project_id: PID });
  assert.strictEqual(v.status, 200);
  assert.ok(v.data.nota.contenido.includes('sin datos'), 'la identidad ausente se marca, no se inventa');
  assert.deepStrictEqual(v.data.fuentes_presentes, []);
});

test('FRESCURA POR CONSTRUCCIÓN: mutar el dato entre llamadas → la nota refleja lo nuevo', async () => {
  const { r, set } = nuevo();
  set('/config/project.json', { name: 'Nonina' });
  set('/persistencia/current/ventas.json', { total: 100 });
  const v1 = await r._vistaProyecto({ project_id: PID });
  assert.ok(v1.data.nota.contenido.includes('100'));
  // el negocio vende más → el dato cambia
  set('/persistencia/current/ventas.json', { total: 550 });
  const v2 = await r._vistaProyecto({ project_id: PID });
  assert.ok(v2.data.nota.contenido.includes('550'), 'la 2ª lectura trae el dato NUEVO');
  assert.ok(!v2.data.nota.contenido.includes('"total": 100'), 'no es un snapshot viejo');
});

test('la cúpula «proyecto» y la nota nacen del acto; 2ª llamada no duplica', async () => {
  const { r, set } = nuevo();
  set('/config/project.json', { name: 'X' });
  await r._vistaProyecto({ project_id: PID });
  await r._vistaProyecto({ project_id: PID });
  const idx = await r._leerIndice(PID);
  assert.ok(idx.cupulas['proyecto'], 'la cúpula existe');
  assert.strictEqual(idx.cupulas['proyecto'].notas.length, 1, 'una sola nota, sin duplicar');
  assert.strictEqual(idx.cupulas['proyecto'].notas[0], 'estado-actual');
});

test('emite cupulas.vista_computada con las fuentes presentes', async () => {
  const { r, set, published } = nuevo();
  set('/persistencia/current/ventas.json', { total: 1 });
  await r._vistaProyecto({ project_id: PID });
  const ev = published.find(p => p.topic === 'cupulas.vista_computada');
  assert.ok(ev, 'emite el evento');
  assert.strictEqual(ev.payload.project_id, PID);
  assert.deepStrictEqual(ev.payload.fuentes_presentes, ['ventas']);
});

test('todo aterriza bajo la ruta del proyecto (scope:project)', async () => {
  const { r, fs, set } = nuevo();
  set('/config/project.json', { name: 'X' });
  await r._vistaProyecto({ project_id: PID });
  assert.ok(fs.has(`${PID}::/cupulas/proyecto/estado-actual.md`), 'la nota vive en data/projects/<pid>/cupulas/');
});

// ── interruptor de visibilidad POR PROYECTO ──
test('visibilidad nace APAGADA por proyecto', async () => {
  const { r } = nuevo();
  const v = await r._getVisibilidad({ project_id: PID });
  assert.strictEqual(v.status, 200);
  assert.strictEqual(v.data.vista_proyecto_global, false);
});

test('set_visibilidad enciende/apaga y persiste + emite visibilidad_cambiada', async () => {
  const { r, published } = nuevo();
  const on = await r._setVisibilidad({ project_id: PID, enabled: true });
  assert.strictEqual(on.data.vista_proyecto_global, true);
  const ev = published.find(p => p.topic === 'cupulas.visibilidad_cambiada');
  assert.ok(ev && ev.payload.enabled === true && ev.payload.project_id === PID);
  assert.strictEqual((await r._getVisibilidad({ project_id: PID })).data.vista_proyecto_global, true);
  const off = await r._setVisibilidad({ project_id: PID, enabled: false });
  assert.strictEqual(off.data.vista_proyecto_global, false);
  assert.strictEqual((await r._getVisibilidad({ project_id: PID })).data.vista_proyecto_global, false);
});

test('set_visibilidad sin enabled booleano → 400', async () => {
  const { r } = nuevo();
  const v = await r._setVisibilidad({ project_id: PID });
  assert.strictEqual(v.status, 400);
});

test('el interruptor es POR PROYECTO: encender uno no toca al otro', async () => {
  const { r } = nuevo();
  await r._setVisibilidad({ project_id: 'proj-A', enabled: true });
  assert.strictEqual((await r._getVisibilidad({ project_id: 'proj-A' })).data.vista_proyecto_global, true);
  assert.strictEqual((await r._getVisibilidad({ project_id: 'proj-B' })).data.vista_proyecto_global, false);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cupulas__vista-proyecto] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cupulas__vista-proyecto] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
