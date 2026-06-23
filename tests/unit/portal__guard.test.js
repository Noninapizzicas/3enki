'use strict';

/**
 * PORTAL — el guard de la puerta de Enki (MCP).
 *
 * Verifica que la superficie de capacidades está GUARDADA: interruptor (OFF=cerrado),
 * scope (project no toca sistema), mode (read no muta), allowlist (manda sobre todo),
 * confirmación (mutaciones piden visto bueno). Sin bus real, sin core: moduleLoader stub.
 *
 * Ejecutar: node tests/unit/portal__guard.test.js
 */

const assert = require('assert');

const Mod = require('../../modules/portal');
const Portal = Mod.default || Mod;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const TOOLS = [
  { name: 'recetas.listar', description: 'lista', parameters: { type: 'object' } },
  { name: 'recetas.crear', description: 'crea', parameters: { type: 'object' } },
  { name: 'db.query', description: 'sql', parameters: { type: 'object' } },                 // prefijo SISTEMA
  { name: 'cobro.confirm', description: 'confirma', parameters: { type: 'object' }, confirmation: true }
];

function loaderStub() {
  const map = new Map(TOOLS.map(t => [t.name, t]));
  return {
    getToolsForAI: () => TOOLS.map(t => ({ ...t })),
    getTool: (n) => map.get(n) || null,
    executeTool: async (n, args) => ({ status: 200, data: { called: n, args } })
  };
}

function nuevoPortal(over = {}) {
  const p = new Portal();
  p.logger = { info() {}, warn() {} };
  p.metrics = { increment() {} };
  p.eventBus = { publish() {} };
  p.moduleLoader = loaderStub();
  p.activo = true;
  p.mode = 'read';
  p.scope = 'project';
  p.projectId = null;
  p.allowlist = null;
  Object.assign(p, over);
  return p;
}

test('interruptor OFF -> list vacío y call 503 (puerta cerrada)', async () => {
  const p = nuevoPortal({ activo: false });
  const list = await p.handleListTools();
  assert.deepStrictEqual(list.data.tools, []);
  assert.strictEqual(list.data.cerrado, true);
  const call = await p.handleCall({ tool: 'recetas.listar' });
  assert.strictEqual(call.status, 503);
});

test('mode read + scope project -> solo tools de lectura no-sistema en el catálogo', async () => {
  const p = nuevoPortal();
  const { tools } = (await p.handleListTools()).data;
  const names = tools.map(t => t.name);
  assert.deepStrictEqual(names, ['recetas.listar']);   // crear=write, db=sistema, confirm=write → fuera
});

test('call de tool de ESCRITURA en mode read -> 403', async () => {
  const p = nuevoPortal();
  const r = await p.handleCall({ tool: 'recetas.crear' });
  assert.strictEqual(r.status, 403);
});

test('call de tool de SISTEMA en scope project -> 403', async () => {
  const p = nuevoPortal();
  const r = await p.handleCall({ tool: 'db.query' });
  assert.strictEqual(r.status, 403);
});

test('happy path: tool de lectura permitida -> ejecuta e inyecta project_id', async () => {
  const p = nuevoPortal({ projectId: 'p1' });
  const r = await p.handleCall({ tool: 'recetas.listar', args: { foo: 1 } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.result.data.args.project_id, 'p1');   // el portal inyectó el scope
});

test('scope project: project_id ajeno -> 403 (no sale de su casa)', async () => {
  const p = nuevoPortal({ projectId: 'p1' });
  const r = await p.handleCall({ tool: 'recetas.listar', args: { project_id: 'otro' } });
  assert.strictEqual(r.status, 403);
});

test('allowlist manda: solo esas tools, aunque sean de escritura', async () => {
  const p = nuevoPortal({ allowlist: new Set(['recetas.crear']), projectId: 'p1' });
  const names = (await p.handleListTools()).data.tools.map(t => t.name);
  assert.deepStrictEqual(names, ['recetas.crear']);
  const r = await p.handleCall({ tool: 'recetas.crear' });
  assert.strictEqual(r.status, 200);                              // allowlist puentea mode read
  const fuera = await p.handleCall({ tool: 'recetas.listar' });
  assert.strictEqual(fuera.status, 403);                          // no está en la lista
});

test('confirmación: tool confirmation:true sin confirmado -> 409; con confirmado -> ejecuta', async () => {
  const p = nuevoPortal({ allowlist: new Set(['cobro.confirm']), projectId: 'p1' });
  const sin = await p.handleCall({ tool: 'cobro.confirm' });
  assert.strictEqual(sin.status, 409);
  const con = await p.handleCall({ tool: 'cobro.confirm', confirmado: true });
  assert.strictEqual(con.status, 200);
});

test('tool inexistente -> 404', async () => {
  const p = nuevoPortal();
  const r = await p.handleCall({ tool: 'no.existe' });
  assert.strictEqual(r.status, 404);
});

test('mode write: las mutaciones se exponen y ejecutan (con project_id)', async () => {
  const p = nuevoPortal({ mode: 'write', projectId: 'p1' });
  const names = (await p.handleListTools()).data.tools.map(t => t.name);
  assert.ok(names.includes('recetas.crear'), 'en write, la mutación aparece en el catálogo');
  const r = await p.handleCall({ tool: 'recetas.crear', args: { nombre: 'x' } });
  assert.strictEqual(r.status, 200);
});

test('interruptor portal-mcp-write ON -> mode pasa a write en caliente', () => {
  const p = nuevoPortal();
  assert.strictEqual(p.mode, 'read');
  p.onInterruptorCambiado({ data: { id: 'portal-mcp-write', enabled: true } });
  assert.strictEqual(p.mode, 'write');
  p.onInterruptorCambiado({ data: { id: 'portal-mcp-write', enabled: false } });
  assert.strictEqual(p.mode, 'read');
});

test('ENDURECIDO: mutación en scope=project SIN project_id -> 400 (no muta global)', async () => {
  const p = nuevoPortal({ mode: 'write', projectId: null });   // sin proyecto fijado
  const r = await p.handleCall({ tool: 'recetas.crear', args: { nombre: 'x' } });  // sin project_id
  assert.strictEqual(r.status, 400);
  const ok = await p.handleCall({ tool: 'recetas.crear', args: { nombre: 'x' }, project_id: 'p1' });
  assert.strictEqual(ok.status, 200);   // con project_id, pasa
});

// ── runner (async) ──
(async () => {
  let passed = 0, failed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { failed++; fails.push({ name, err }); }
  }
  if (failed === 0) { console.log(`\n[portal__guard] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[portal__guard] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
