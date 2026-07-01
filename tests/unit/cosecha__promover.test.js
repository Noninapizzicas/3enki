'use strict';

/**
 * cosecha__promover — el PUENTE cantera → cuenco (skill de la abundancia → lente activa).
 *
 * promover lee una skill del propio pozo y se la entrega al cuenco (lentes.montar.request);
 * el cuenco pone la guarda no-colgantes y su veredicto se propaga. Es el paso que activa
 * la abundancia por demanda: lo guardado en la cantera se vuelve lente inyectable.
 *
 * Ejecutar: node tests/unit/cosecha__promover.test.js
 */

const assert = require('assert');
const CosechaModule = require('../../modules/cosecha/index.js');

const LOG = { debug(){}, info(){}, warn(){}, error(){} };

async function makeCargado() {
  const m = new CosechaModule();
  await m.onLoad({ logger: LOG, eventBus: null, metrics: { increment(){} } });
  return m;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('promueve una skill de la cantera: lee su cuerpo y llama a lentes.montar', async () => {
  const m = await makeCargado();
  let llamada = null;
  m._rpc = async (ev, payload) => { llamada = { ev, payload }; return { status: 200, data: { dominio: 'diseño', nombre: 'deep-research', montada: true, total_lentes: 9 } }; };
  const r = await m._promover({ nombre: 'deep-research', dominio: 'diseño', tarea: 'tema' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.promovida, true);
  assert.strictEqual(llamada.ev, 'lentes.montar.request', 'delega en el cuenco');
  assert.strictEqual(llamada.payload.dominio, 'diseño');
  assert.strictEqual(llamada.payload.tarea, 'tema');
  const skill = m._skills.get('deep-research');
  assert.strictEqual(llamada.payload.contenido, skill.contenido, 'entrega el cuerpo real de la skill');
  assert.strictEqual(llamada.payload.cuando_usar, skill.descripcion, 'cuando_usar por defecto = descripcion');
});

test('cuando_usar override respeta el param', async () => {
  const m = await makeCargado();
  let payload = null;
  m._rpc = async (ev, p) => { payload = p; return { status: 200, data: {} }; };
  await m._promover({ nombre: 'deep-research', dominio: 'diseño', cuando_usar: 'trigger a medida' });
  assert.strictEqual(payload.cuando_usar, 'trigger a medida');
});

test('skill inexistente -> 404, y NO llama al cuenco', async () => {
  const m = await makeCargado();
  let llamado = false;
  m._rpc = async () => { llamado = true; return { status: 200, data: {} }; };
  const r = await m._promover({ nombre: 'no-existe', dominio: 'diseño' });
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.error ? undefined : r.data.faltan, undefined); // 404 lleva error, no data
  assert.strictEqual(llamado, false, 'no molesta al cuenco si la skill no está');
});

test('propaga la guarda del cuenco: 409 colgante tal cual', async () => {
  const m = await makeCargado();
  m._rpc = async () => ({ status: 409, error: { code: 'CONFLICT_STATE', message: 'dominio sin pack' } });
  const r = await m._promover({ nombre: 'deep-research', dominio: 'inventado' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.error.code, 'CONFLICT_STATE');
});

test('cuenco mudo (timeout) -> 504', async () => {
  const m = await makeCargado();
  m._rpc = async () => null;
  const r = await m._promover({ nombre: 'deep-research', dominio: 'diseño' });
  assert.strictEqual(r.status, 504);
});

test('sin nombre -> 400', async () => {
  const m = await makeCargado();
  m._rpc = async () => ({ status: 200, data: {} });
  assert.strictEqual((await m._promover({ dominio: 'diseño' })).status, 400);
});

test('defaultea dominio/tarea desde el HOGAR declarado por la skill', async () => {
  const m = await makeCargado();
  m._skills.set('con-hogar', { nombre: 'con-hogar', descripcion: 'un oficio', contenido: '# c', dominio: '', tags: [], lente_dominio: 'diseño', lente_tarea: 'tema' });
  let payload = null;
  m._rpc = async (ev, p) => { payload = p; return { status: 200, data: {} }; };
  const r = await m._promover({ nombre: 'con-hogar' });   // sin dominio/tarea: los toma del hogar
  assert.strictEqual(r.status, 200);
  assert.strictEqual(payload.dominio, 'diseño', 'dominio del hogar');
  assert.strictEqual(payload.tarea, 'tema', 'tarea del hogar');
  assert.strictEqual(r.data.dominio, 'diseño');
});

test('el param dominio/tarea pisa el hogar de la skill', async () => {
  const m = await makeCargado();
  m._skills.set('con-hogar', { nombre: 'con-hogar', descripcion: 'd', contenido: '# c', dominio: '', tags: [], lente_dominio: 'diseño', lente_tarea: 'tema' });
  let payload = null;
  m._rpc = async (ev, p) => { payload = p; return { status: 200, data: {} }; };
  await m._promover({ nombre: 'con-hogar', dominio: 'copy', tarea: 'copy' });
  assert.strictEqual(payload.dominio, 'copy');
  assert.strictEqual(payload.tarea, 'copy');
});

test('sin dominio param ni hogar declarado -> 400 (no adivina)', async () => {
  const m = await makeCargado();
  m._skills.set('sin-hogar', { nombre: 'sin-hogar', descripcion: 'd', contenido: '# c', dominio: '', tags: [], lente_dominio: '', lente_tarea: '' });
  m._rpc = async () => ({ status: 200, data: {} });
  const r = await m._promover({ nombre: 'sin-hogar' });
  assert.strictEqual(r.status, 400);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[cosecha__promover] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[cosecha__promover] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
