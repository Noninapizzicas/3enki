/**
 * Tests unitarios — conversacion/ai-gateway cajones-context-partitioning v1.0.0
 *
 * Cubre los 7 metodos nuevos anyadidos por el patron cajones:
 *  - _extractCajones (auto-derivacion + override cajon_descripcion)
 *  - _rankCajones (page activo + recencia + alfabetico)
 *  - _buildCajonesSystemPrompt (catalogo rankeado + reglas operativas)
 *  - _getCajonesTools (shape de las 2 tools canonicas)
 *  - _resolveCajon (nombre con/sin prefijo de page)
 *  - _trackCajonOpened (historial FIFO con limite)
 *  - _executeCajonTool (cajon.listar + cajon.abrir + casos de error)
 *
 * Integracion:
 *  - _getTools incluye cajon tools solo cuando blueprint tiene cajones_enabled.
 *  - _loadBlueprints puebla cajonesCatalog solo para blueprints habilitados.
 *  - _composeBlueprintSystemPrompt con cajones_only_base no incluye child JSON.
 *  - onUnload limpia los maps de cajones.
 *
 * Ejecutar: node tests/unit/ai-gateway-cajones.test.js
 *
 * Contrato: arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json
 */

'use strict';

const assert = require('assert');
const AiGatewayModule = require('../../modules/conversacion/ai-gateway/index.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function makeInstance() {
  const m = new AiGatewayModule();
  m.logger = { debug(){}, info(){}, warn(){}, error(){} };
  return m;
}

function blueprintSintetico(operaciones) {
  return {
    id: 'test-modulo',
    version: '1.0.0',
    operaciones
  };
}

// --------------------------------------------------
// 1. _extractCajones
// --------------------------------------------------

test('_extractCajones devuelve array vacio si no hay operaciones', () => {
  const m = makeInstance();
  assert.deepStrictEqual(m._extractCajones({}), []);
  assert.deepStrictEqual(m._extractCajones(null), []);
  assert.deepStrictEqual(m._extractCajones({ operaciones: null }), []);
});

test('_extractCajones auto-deriva descripcion desde op.input cuando no hay override', () => {
  const m = makeInstance();
  const bp = blueprintSintetico({
    crear: { input: '{ project_id, nombre }', pseudocodigo: [] },
    listar: { input: '{ project_id }' }
  });
  const cajones = m._extractCajones(bp);
  assert.strictEqual(cajones.length, 2);
  const crear = cajones.find(c => c.nombre === 'crear');
  assert.ok(crear.descripcion.includes('project_id'), 'descripcion auto debe contener "project_id"');
  assert.ok(crear.descripcion.startsWith('input '), 'auto prefija "input "');
});

test('_extractCajones respeta override cajon_descripcion sobre auto', () => {
  const m = makeInstance();
  const bp = blueprintSintetico({
    crear: { input: '{ x }', cajon_descripcion: 'Crear receta nueva normalizando ingredientes.' }
  });
  const cajones = m._extractCajones(bp);
  assert.strictEqual(cajones[0].descripcion, 'Crear receta nueva normalizando ingredientes.');
});

test('_extractCajones usa op.descripcion si existe y no hay override', () => {
  const m = makeInstance();
  const bp = blueprintSintetico({
    obtener: { descripcion: 'Obtiene una receta por id.', input: '{ id }' }
  });
  assert.strictEqual(m._extractCajones(bp)[0].descripcion, 'Obtiene una receta por id.');
});

test('_extractCajones limita descripcion auto a 200 chars y primera linea', () => {
  const m = makeInstance();
  const huge = 'a'.repeat(500);
  const bp = blueprintSintetico({
    x: { input: huge + '\nsegunda linea' }
  });
  const desc = m._extractCajones(bp)[0].descripcion;
  assert.ok(desc.length <= 207, `descripcion = ${desc.length} chars, esperado <= 207 (200 + "input " prefix)`);
  assert.ok(!desc.includes('segunda linea'), 'no debe incluir segunda linea');
});

test('_extractCajones ordena alfabeticamente por nombre', () => {
  const m = makeInstance();
  const bp = blueprintSintetico({
    zeta: { input: '{}' },
    alfa: { input: '{}' },
    beta: { input: '{}' }
  });
  const nombres = m._extractCajones(bp).map(c => c.nombre);
  assert.deepStrictEqual(nombres, ['alfa', 'beta', 'zeta']);
});

test('_extractCajones ignora operaciones invalidas (no objeto)', () => {
  const m = makeInstance();
  const bp = blueprintSintetico({
    ok: { input: '{}' },
    nope: null,
    string: 'no soy operacion'
  });
  const nombres = m._extractCajones(bp).map(c => c.nombre);
  assert.deepStrictEqual(nombres, ['ok']);
});

// --------------------------------------------------
// 2. _rankCajones
// --------------------------------------------------

test('_rankCajones devuelve [] para catalogo vacio o invalido', () => {
  const m = makeInstance();
  assert.deepStrictEqual(m._rankCajones([], 'recetas', 'c1'), []);
  assert.deepStrictEqual(m._rankCajones(null, 'recetas', 'c1'), []);
});

test('_rankCajones sin page activo + sin historial = alfabetico', () => {
  const m = makeInstance();
  const cat = [
    { nombre: 'z.foo', descripcion: '' },
    { nombre: 'a.bar', descripcion: '' },
    { nombre: 'm.baz', descripcion: '' }
  ];
  const nombres = m._rankCajones(cat, null, 'c1').map(c => c.nombre);
  assert.deepStrictEqual(nombres, ['a.bar', 'm.baz', 'z.foo']);
});

test('_rankCajones pone cajones del page activo primero', () => {
  const m = makeInstance();
  const cat = [
    { nombre: 'otros.x', descripcion: '' },
    { nombre: 'recetas.crear', descripcion: '' },
    { nombre: 'mas.y', descripcion: '' },
    { nombre: 'recetas.listar', descripcion: '' }
  ];
  const nombres = m._rankCajones(cat, 'recetas', 'c1').map(c => c.nombre);
  assert.deepStrictEqual(nombres, ['recetas.crear', 'recetas.listar', 'mas.y', 'otros.x']);
});

test('_rankCajones rankea por recencia (mas reciente primero) dentro del mismo grupo', () => {
  const m = makeInstance();
  m._trackCajonOpened('c1', 'recetas.crear');
  m._trackCajonOpened('c1', 'recetas.listar');
  const cat = [
    { nombre: 'recetas.actualizar', descripcion: '' },
    { nombre: 'recetas.crear', descripcion: '' },
    { nombre: 'recetas.listar', descripcion: '' },
    { nombre: 'recetas.obtener', descripcion: '' }
  ];
  const nombres = m._rankCajones(cat, 'recetas', 'c1').map(c => c.nombre);
  assert.strictEqual(nombres[0], 'recetas.listar', 'mas reciente primero');
  assert.strictEqual(nombres[1], 'recetas.crear', 'segundo mas reciente');
});

test('_rankCajones no contamina entre conversation_id distintos', () => {
  const m = makeInstance();
  m._trackCajonOpened('c-A', 'r.x');
  const cat = [{ nombre: 'r.x' }, { nombre: 'r.y' }];
  const nA = m._rankCajones(cat, null, 'c-A').map(c => c.nombre);
  const nB = m._rankCajones(cat, null, 'c-B').map(c => c.nombre);
  assert.strictEqual(nA[0], 'r.x', 'c-A vio r.x abierto -> primero');
  assert.deepStrictEqual(nB, ['r.x', 'r.y'], 'c-B alfabetico (no contaminado)');
});

// --------------------------------------------------
// 3. _trackCajonOpened
// --------------------------------------------------

test('_trackCajonOpened acumula historial FIFO con limite CAJONES_HISTORY_MAX', () => {
  const m = makeInstance();
  const max = AiGatewayModule.CAJONES_HISTORY_MAX;
  for (let i = 0; i < max + 10; i++) m._trackCajonOpened('c1', `cajon_${i}`);
  const hist = m.conversationCajones.get('c1');
  assert.strictEqual(hist.length, max, `historial limitado a ${max}`);
  assert.strictEqual(hist[0].nombre, `cajon_10`, 'FIFO descarta los mas antiguos');
  assert.strictEqual(hist[hist.length - 1].nombre, `cajon_${max + 9}`, 'ultimo es el recien anyadido');
});

test('_trackCajonOpened con conversation_id nulo no rompe ni guarda nada', () => {
  const m = makeInstance();
  m._trackCajonOpened(null, 'x');
  m._trackCajonOpened(undefined, 'x');
  assert.strictEqual(m.conversationCajones.size, 0);
});

// --------------------------------------------------
// 4. _getCajonesTools
// --------------------------------------------------

test('_getCajonesTools devuelve exactamente 2 tools con shape canonico', () => {
  const m = makeInstance();
  const tools = m._getCajonesTools();
  assert.strictEqual(tools.length, 2);
  assert.deepStrictEqual(tools.map(t => t.name).sort(), ['cajon.abrir', 'cajon.listar']);
  for (const t of tools) {
    assert.ok(typeof t.description === 'string' && t.description.length > 0);
    assert.strictEqual(t.parameters.type, 'object');
    assert.strictEqual(t.parameters.additionalProperties, false);
  }
  const abrir = tools.find(t => t.name === 'cajon.abrir');
  assert.deepStrictEqual(abrir.parameters.required, ['nombre']);
});

// --------------------------------------------------
// 5. _resolveCajon
// --------------------------------------------------

test('_resolveCajon devuelve null si page no es blueprint conocido', () => {
  const m = makeInstance();
  assert.strictEqual(m._resolveCajon('desconocido', 'x'), null);
});

test('_resolveCajon devuelve null si cajones no estan habilitados para ese page', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { child: { operaciones: { crear: {} } }, cajonesEnabled: false });
  assert.strictEqual(m._resolveCajon('recetas', 'crear'), null);
});

test('_resolveCajon acepta nombre bare ("crear") y con prefijo ("recetas.crear")', () => {
  const m = makeInstance();
  const op = { input: '{}', pseudocodigo: ['paso 1'] };
  m.blueprintModules.set('recetas', { child: { operaciones: { crear: op } }, cajonesEnabled: true });
  const bare = m._resolveCajon('recetas', 'crear');
  const pref = m._resolveCajon('recetas', 'recetas.crear');
  assert.strictEqual(bare.nombre, 'crear');
  assert.strictEqual(bare.op, op);
  assert.strictEqual(pref.nombre, 'recetas.crear');
  assert.strictEqual(pref.op, op);
});

// --------------------------------------------------
// 6. _executeCajonTool
// --------------------------------------------------

function setupBpWithCajones(m, page_id = 'recetas') {
  const bp = blueprintSintetico({
    crear: { input: '{ x }', pseudocodigo: ['publish(...)'], reglas_clave: ['r1'], errores_posibles: ['e1'] },
    listar: { input: '{}', pseudocodigo: ['publishAndWait(...)'] }
  });
  m.blueprintModules.set(page_id, { manifest: {}, child: bp, parent: null, systemPrompt: '', cajonesEnabled: true });
  m.cajonesCatalog.set(page_id, m._extractCajones(bp));
  return bp;
}

test('cajon.listar devuelve catalogo rankeado completo si no se filtra zona', () => {
  const m = makeInstance();
  setupBpWithCajones(m);
  const r = m._executeCajonTool('cajon.listar', {}, { page_id: 'recetas', conversation_id: 'c1' });
  assert.strictEqual(r.page_id, 'recetas');
  assert.strictEqual(r.count, 2);
  assert.deepStrictEqual(r.cajones.map(c => c.nombre).sort(), ['crear', 'listar']);
});

test('cajon.listar con zona filtra por prefijo', () => {
  const m = makeInstance();
  m.blueprintModules.set('multi', {
    manifest: {},
    child: { operaciones: { a: { input: '{}' } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  m.cajonesCatalog.set('multi', [
    { nombre: 'recetas.crear', descripcion: '' },
    { nombre: 'escandallo.calcular', descripcion: '' },
    { nombre: 'recetas.listar', descripcion: '' }
  ]);
  const r = m._executeCajonTool('cajon.listar', { zona: 'recetas' }, { page_id: 'multi', conversation_id: 'c1' });
  assert.strictEqual(r.count, 2);
  assert.ok(r.cajones.every(c => c.nombre.startsWith('recetas.')));
});

test('cajon.abrir devuelve pseudocodigo + reglas + errores + input', () => {
  const m = makeInstance();
  setupBpWithCajones(m);
  const r = m._executeCajonTool('cajon.abrir', { nombre: 'crear' }, { page_id: 'recetas', conversation_id: 'c1' });
  assert.strictEqual(r.nombre, 'crear');
  assert.deepStrictEqual(r.pseudocodigo, ['publish(...)']);
  assert.deepStrictEqual(r.reglas_clave, ['r1']);
  assert.deepStrictEqual(r.errores_posibles, ['e1']);
  assert.strictEqual(r.input, '{ x }');
});

test('cajon.abrir registra el cajon abierto en historial para ranking futuro', () => {
  const m = makeInstance();
  setupBpWithCajones(m);
  m._executeCajonTool('cajon.abrir', { nombre: 'crear' }, { page_id: 'recetas', conversation_id: 'c1' });
  const hist = m.conversationCajones.get('c1');
  assert.strictEqual(hist.length, 1);
  assert.strictEqual(hist[0].nombre, 'crear');
});

test('cajon.abrir devuelve RESOURCE_NOT_FOUND si el nombre no existe', () => {
  const m = makeInstance();
  setupBpWithCajones(m);
  assert.throws(
    () => m._executeCajonTool('cajon.abrir', { nombre: 'no_existe' }, { page_id: 'recetas', conversation_id: 'c1' }),
    err => err.code === 'RESOURCE_NOT_FOUND'
  );
});

test('cajon.abrir devuelve INVALID_INPUT si nombre falta', () => {
  const m = makeInstance();
  setupBpWithCajones(m);
  assert.throws(
    () => m._executeCajonTool('cajon.abrir', {}, { page_id: 'recetas', conversation_id: 'c1' }),
    err => err.code === 'INVALID_INPUT'
  );
});

test('cajon.* falla con INVALID_INPUT si page_id no es un blueprint conocido', () => {
  const m = makeInstance();
  assert.throws(
    () => m._executeCajonTool('cajon.listar', {}, { page_id: 'desconocido', conversation_id: 'c1' }),
    err => err.code === 'INVALID_INPUT'
  );
});

test('cajon.* falla con INVALID_INPUT si blueprint existe pero cajones_enabled es false', () => {
  const m = makeInstance();
  m.blueprintModules.set('legacy', { child: { operaciones: {} }, cajonesEnabled: false });
  assert.throws(
    () => m._executeCajonTool('cajon.listar', {}, { page_id: 'legacy', conversation_id: 'c1' }),
    err => err.code === 'INVALID_INPUT'
  );
});

// --------------------------------------------------
// 7. _buildCajonesSystemPrompt
// --------------------------------------------------

test('_buildCajonesSystemPrompt contiene base + catalogo rankeado + reglas operativas', () => {
  const m = makeInstance();
  setupBpWithCajones(m);
  const ctx = { systemPrompt: 'PROMPT_BASE_PADRE', parent: null, cajonesEnabled: true };
  const sp = m._buildCajonesSystemPrompt(ctx, 'c1', 'recetas');
  assert.ok(sp.includes('PROMPT_BASE_PADRE'), 'incluye prompt base precalculado');
  assert.ok(sp.includes('CATALOGO DE CAJONES'), 'incluye titulo de catalogo');
  assert.ok(sp.includes('recetas'), 'menciona page_id');
  assert.ok(sp.includes('- crear ->'), 'incluye linea de cajon crear');
  assert.ok(sp.includes('- listar ->'), 'incluye linea de cajon listar');
  assert.ok(sp.includes('REGLAS OPERATIVAS'), 'incluye seccion de reglas');
  assert.ok(sp.includes('cajon.abrir'), 'reglas mencionan cajon.abrir');
  assert.ok(sp.includes('Una sola operacion por turno'), 'incluye principio una_operacion_por_turno');
});

test('_buildCajonesSystemPrompt incluye anti-patron observado en runtime: no invocar cajon.listar redundante', () => {
  // Anti-patron real observado en audit Fase 5 (2026-05-23, deepseek): el LLM
  // invocaba cajon.listar en T1 (chitchat "que puedes hacer") y antes de
  // cajon.abrir en T4, aunque el catalogo ya estaba en el system prompt.
  // La regla operativa lo desincentiva explicitamente.
  const m = makeInstance();
  setupBpWithCajones(m);
  const ctx = { systemPrompt: 'BASE', parent: null, cajonesEnabled: true };
  const sp = m._buildCajonesSystemPrompt(ctx, 'c1', 'recetas');
  assert.ok(sp.includes('NO invoques cajon.listar'), 'la regla operativa debe desincentivar cajon.listar redundante');
  assert.ok(sp.includes('zona'), 'la regla operativa debe explicar el unico uso valido (filtro por zona)');
});

test('_buildCajonesSystemPrompt avisa cuando el catalogo esta vacio', () => {
  const m = makeInstance();
  m.blueprintModules.set('empty', { child: { operaciones: {} }, cajonesEnabled: true });
  m.cajonesCatalog.set('empty', []);
  const ctx = { systemPrompt: 'BASE', parent: null, cajonesEnabled: true };
  const sp = m._buildCajonesSystemPrompt(ctx, 'c1', 'empty');
  assert.ok(sp.includes('catalogo vacio'), 'avisa de catalogo vacio');
});

// --------------------------------------------------
// 8. _composeBlueprintSystemPrompt con opts.cajones_only_base
// --------------------------------------------------

test('_composeBlueprintSystemPrompt con cajones_only_base NO incluye child JSON', () => {
  const m = makeInstance();
  const child = blueprintSintetico({ crear: { input: '{}', pseudocodigo: ['SECRETO_CHILD'] } });
  const sp = m._composeBlueprintSystemPrompt(null, child, { cajones_only_base: true });
  assert.ok(!sp.includes('SECRETO_CHILD'), 'modo cajones no incluye pseudocodigo del child');
  assert.ok(!sp.includes('BLUEPRINT HIJO'), 'modo cajones no incluye seccion HIJO');
  assert.ok(!sp.includes('REGLAS OPERATIVAS'), 'modo cajones no incluye reglas (se inyectan por turno)');
});

test('_composeBlueprintSystemPrompt sin opts mantiene comportamiento legacy (incluye child)', () => {
  const m = makeInstance();
  const child = blueprintSintetico({ crear: { input: '{}', pseudocodigo: ['MARCADOR_LEGACY'] } });
  const sp = m._composeBlueprintSystemPrompt(null, child);
  assert.ok(sp.includes('MARCADOR_LEGACY'), 'legacy incluye pseudocodigo');
  assert.ok(sp.includes('BLUEPRINT HIJO'), 'legacy incluye seccion HIJO');
  assert.ok(sp.includes('REGLAS OPERATIVAS'), 'legacy incluye reglas');
});

// --------------------------------------------------
// 9. Integracion: _getTools y _loadBlueprints
// --------------------------------------------------

test('_getTools incluye cajon tools cuando page_id activo es blueprint con cajones_enabled', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {}, child: {}, parent: null, systemPrompt: '', cajonesEnabled: true });
  m.moduleLoader = { loadedModules: new Map(), getToolsForAI: () => [] };
  const tools = m._getTools('recetas');
  const names = tools.map(t => t.name);
  assert.ok(names.includes('cajon.listar'), 'incluye cajon.listar');
  assert.ok(names.includes('cajon.abrir'), 'incluye cajon.abrir');
  assert.ok(names.includes('bus.publish'), 'sigue incluyendo bus.publish');
  assert.ok(names.includes('bus.publishAndWait'), 'sigue incluyendo bus.publishAndWait');
});

test('_getTools NO incluye cajon tools cuando cajones_enabled es false (modo legacy)', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {}, child: {}, parent: null, systemPrompt: '', cajonesEnabled: false });
  m.moduleLoader = { loadedModules: new Map(), getToolsForAI: () => [] };
  const tools = m._getTools('recetas');
  const names = tools.map(t => t.name);
  assert.ok(!names.includes('cajon.listar'), 'NO incluye cajon.listar en modo legacy');
  assert.ok(!names.includes('cajon.abrir'), 'NO incluye cajon.abrir en modo legacy');
  assert.ok(names.includes('bus.publish'), 'sigue exponiendo las 2 universales');
});

// --------------------------------------------------
// 10. onUnload limpia los maps
// --------------------------------------------------

test('onUnload limpia cajonesCatalog y conversationCajones sin leak', async () => {
  const m = makeInstance();
  m.providers = new Map();
  m.credentialCache = new Map();
  m.pendingCredentials = new Map();
  m.pendingFsReads = new Map();
  m.cajonesCatalog.set('x', [{}]);
  m.conversationCajones.set('c1', [{ nombre: 'x' }]);
  await m.onUnload();
  assert.strictEqual(m.cajonesCatalog.size, 0);
  assert.strictEqual(m.conversationCajones.size, 0);
});

// --------------------------------------------------
// Runner
// --------------------------------------------------

(async function run() {
  let passed = 0, failed = 0;
  const failures = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
    } catch (err) {
      failed++;
      failures.push({ name, err });
    }
  }
  if (failed === 0) {
    console.log(`\n[ai-gateway-cajones] OK ${passed}/${tests.length}`);
    process.exit(0);
  }
  console.error(`\n[ai-gateway-cajones] FAIL ${failed}/${tests.length}`);
  for (const { name, err } of failures) {
    console.error(`  x ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  }
  process.exit(1);
})();
