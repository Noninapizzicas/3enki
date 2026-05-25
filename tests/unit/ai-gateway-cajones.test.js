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
  m.pageGraph.set('x', { consumes: new Set(['y']), consumed_by: new Set() });
  m.conversationPageFoco.set('c1', 'x');
  await m.onUnload();
  assert.strictEqual(m.cajonesCatalog.size, 0);
  assert.strictEqual(m.conversationCajones.size, 0);
  assert.strictEqual(m.pageGraph.size, 0);
  assert.strictEqual(m.conversationPageFoco.size, 0);
});

// --------------------------------------------------
// 11. _buildPageGraph (Fase 5 bis)
// --------------------------------------------------

function setupBlueprintsWithReferences(m) {
  // recetas: estado_persistente propio, no consume otros modulos via publishAndWait
  m.blueprintModules.set('recetas', {
    manifest: {},
    child: { operaciones: { listar: { pseudocodigo: ["raw = await publishAndWait('fs.read.request', {...})"] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  // escandallo consume recetas + mercadona-api
  m.blueprintModules.set('escandallo', {
    manifest: {},
    child: { operaciones: { calcular: { pseudocodigo: [
      "raw = await publishAndWait('recetas.obtener.request', {...})",
      "prod = await publishAndWait('mercadona-api.precio.request', {...})"
    ] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  // viabilidad consume escandallo
  m.blueprintModules.set('viabilidad', {
    manifest: {},
    child: { operaciones: { evaluar: { pseudocodigo: ["c = await publishAndWait('escandallo.calcular.request', {...})"] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
}

test('_buildPageGraph extrae aristas correctas del pseudocodigo (solo hacia blueprints reales)', () => {
  const m = makeInstance();
  setupBlueprintsWithReferences(m);
  m._buildPageGraph();
  // recetas: no consume nada (fs.* es primitiva, se filtra), pero es consumido por escandallo
  const recetasNode = m.pageGraph.get('recetas');
  assert.ok(recetasNode, 'recetas debe existir en grafo');
  assert.strictEqual(recetasNode.consumes.size, 0, 'recetas no consume otros modulos (fs.* es primitiva)');
  assert.ok(recetasNode.consumed_by.has('escandallo'), 'escandallo consume recetas');
  // escandallo consume recetas (blueprint cargado). mercadona-api NO crea arista
  // porque no esta en blueprintModules (solo se crean aristas hacia destinos
  // navegables reales — fix del bug de "nodos fantasma" del 2026-05-25).
  const eNode = m.pageGraph.get('escandallo');
  assert.ok(eNode.consumes.has('recetas'), 'escandallo consume recetas');
  assert.ok(!eNode.consumes.has('mercadona-api'), 'mercadona-api no es blueprint => no aparece como destino');
  assert.ok(eNode.consumed_by.has('viabilidad'), 'viabilidad consume escandallo');
});

test('_buildPageGraph usa catalogo eventos-publish-subscribe.json si esta disponible (fix bug bus.publish + carta vs carta-manager)', () => {
  const m = makeInstance();
  // 2 blueprints simulando el caso real menu-generator → carta-manager.
  m.blueprintModules.set('menu-generator', {
    manifest: { name: 'menu-generator' },
    child: { operaciones: { generar: { pseudocodigo: ["await bus.publish('carta.creada', {...})"] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  m.blueprintModules.set('carta-manager', {
    manifest: { name: 'carta-manager' },
    child: {
      operaciones: { save: { pseudocodigo: ["// no invoca otros modulos"] } },
      eventos_que_escucho: [{ evento: 'carta.creada', handler: '_on_carta_creada' }]
    },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  // Mock loadedModules para que pathToPageIdMap pueda resolver paths.
  const fakeLoaded = new Map([
    ['menu-generator', { path: '/repo/modules/pizzepos/menu-generator', manifest: { name: 'menu-generator', target_page_id: 'menu-generator' } }],
    ['carta-manager', { path: '/repo/modules/pizzepos/carta-manager', manifest: { name: 'carta-manager', target_page_id: 'carta-manager' } }]
  ]);
  m.moduleLoader = { loadedModules: fakeLoaded };
  // Stub _loadEventCatalog para inyectar catalogo simulado (no depende de
  // que exista el archivo en disco — el test verifica logica, no IO).
  m._loadEventCatalog = () => ({
    eventos: {
      'carta.creada': {
        publishers: [{ source: 'modules/pizzepos/menu-generator/menu-generator.blueprint.json', ref: 'operaciones.pseudocodigo' }],
        subscribers: [{ source: 'modules/pizzepos/carta-manager/carta-manager.blueprint.json', handler: '_on_carta_creada' }]
      }
    }
  });
  // Stub _buildPathToPageIdMap para reflejar los paths del catalogo simulado.
  // (alternativa: configurar process.cwd o REPO_ROOT, mas complejo).
  m._buildPathToPageIdMap = () => new Map([
    ['modules/pizzepos/menu-generator/menu-generator.blueprint.json', 'menu-generator'],
    ['modules/pizzepos/carta-manager/carta-manager.blueprint.json', 'carta-manager']
  ]);
  m._buildPageGraph();
  const mgNode = m.pageGraph.get('menu-generator');
  const cmNode = m.pageGraph.get('carta-manager');
  assert.ok(mgNode.consumes.has('carta-manager'), 'menu-generator -> carta-manager (via carta.creada del catalogo)');
  assert.ok(cmNode.consumed_by.has('menu-generator'), 'carta-manager <- menu-generator (arista inversa)');
});

test('_buildPageGraph filtra prefijos primitivos (fs, project, llm, ai, etc.)', () => {
  const m = makeInstance();
  m.blueprintModules.set('test', {
    manifest: {},
    child: { operaciones: { x: { pseudocodigo: [
      "await publishAndWait('fs.read.request', {...})",
      "await publishAndWait('project.get.request', {...})",
      "await publishAndWait('llm.complete.request', {...})",
      "await publishAndWait('ai.chat.request', {...})",
      "await publishAndWait('credential.resolve.request', {...})",
      "await publishAndWait('agent.execute.request', {...})"
    ] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  m._buildPageGraph();
  assert.strictEqual(m.pageGraph.get('test').consumes.size, 0, 'todas las refs son primitivas, no aristas de grafo');
});

test('_buildPageGraph respeta override paginas_relacionadas del manifest', () => {
  const m = makeInstance();
  m.blueprintModules.set('a', {
    manifest: { paginas_relacionadas: ['b', 'c'] },
    child: { operaciones: {} },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  m.blueprintModules.set('b', { manifest: {}, child: { operaciones: {} }, parent: null, systemPrompt: '', cajonesEnabled: true });
  m.blueprintModules.set('c', { manifest: {}, child: { operaciones: {} }, parent: null, systemPrompt: '', cajonesEnabled: true });
  m._buildPageGraph();
  assert.ok(m.pageGraph.get('a').consumes.has('b'));
  assert.ok(m.pageGraph.get('a').consumes.has('c'));
  assert.ok(m.pageGraph.get('b').consumed_by.has('a'), 'paginas_relacionadas crea aristas bidireccionales');
});

test('_buildPageGraph no crea self-edges aunque el pseudocodigo se autoreference', () => {
  const m = makeInstance();
  m.blueprintModules.set('foo', {
    manifest: {},
    child: { operaciones: { x: { pseudocodigo: ["await publishAndWait('foo.bar.request', {...})"] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  m._buildPageGraph();
  assert.strictEqual(m.pageGraph.get('foo').consumes.size, 0, 'no self-edges');
});

// --------------------------------------------------
// 12. _executeNavTool — page.related
// --------------------------------------------------

test('page.related devuelve consumes + consumed_by + related — solo NAVEGABLES (blueprints registrados)', () => {
  const m = makeInstance();
  setupBlueprintsWithReferences(m);
  m._buildPageGraph();
  const r = m._executeNavTool('page.related', { page_id: 'escandallo' }, { conversation_id: 'c1' });
  assert.strictEqual(r.page_id, 'escandallo');
  // mercadona-api no esta registrado como blueprint -> se filtra de consumes.
  assert.deepStrictEqual(r.consumes, ['recetas']);
  assert.deepStrictEqual(r.consumed_by, ['viabilidad']);
  assert.ok(r.related.includes('recetas') && r.related.includes('viabilidad'));
  assert.ok(!r.related.includes('mercadona-api'), 'no incluir nodos no navegables (no son blueprints registrados)');
});

test('_buildPageGraph no crea aristas hacia targets que no son blueprints (fix nodos fantasma 2026-05-25)', () => {
  const m = makeInstance();
  // foo (blueprint navegable) referencia bar-no-blueprint via publishAndWait.
  // Antes del fix: el grafo creaba un nodo fantasma 'bar-no-blueprint' con
  // arista, y page.related lo filtraba a posteriori. Tras el fix: el grafo
  // ya no crea la arista en origen (target no esta en blueprintModules).
  m.blueprintModules.set('foo', {
    manifest: {},
    child: { operaciones: { x: { pseudocodigo: ["await publishAndWait('bar-no-blueprint.do.request', {...})"] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  m._buildPageGraph();
  assert.ok(!m.pageGraph.get('foo').consumes.has('bar-no-blueprint'),
    'grafo NO crea arista hacia target no-blueprint (limpieza en origen)');
  assert.ok(!m.pageGraph.has('bar-no-blueprint'),
    'grafo NO contiene nodo fantasma para target no-blueprint');
  const r = m._executeNavTool('page.related', { page_id: 'foo' }, { conversation_id: 'c1' });
  assert.deepStrictEqual(r.consumes, [], 'page.related coherente: nada que filtrar');
  assert.deepStrictEqual(r.related, []);
});

test('page.related sin page_id en args usa ctx.page_id', () => {
  const m = makeInstance();
  setupBlueprintsWithReferences(m);
  m._buildPageGraph();
  const r = m._executeNavTool('page.related', {}, { page_id: 'viabilidad', conversation_id: 'c1' });
  assert.strictEqual(r.page_id, 'viabilidad');
  assert.ok(r.consumes.includes('escandallo'));
});

test('page.related con page_id sin aristas devuelve listas vacias coherentes', () => {
  const m = makeInstance();
  m.pageGraph = new Map();
  const r = m._executeNavTool('page.related', { page_id: 'huerfano' }, { conversation_id: 'c1' });
  assert.deepStrictEqual(r, { page_id: 'huerfano', consumes: [], consumed_by: [], related: [] });
});

test('page.related sin page_id ni ctx.page_id devuelve INVALID_INPUT', () => {
  const m = makeInstance();
  assert.throws(
    () => m._executeNavTool('page.related', {}, { conversation_id: 'c1' }),
    err => err.code === 'INVALID_INPUT'
  );
});

// --------------------------------------------------
// 13. _executeNavTool — chat.cambiar_foco
// --------------------------------------------------

test('chat.cambiar_foco valida nuevo_page_id presente', () => {
  const m = makeInstance();
  m.eventBus = { publish() {} };
  assert.throws(
    () => m._executeNavTool('chat.cambiar_foco', {}, { conversation_id: 'c1' }),
    err => err.code === 'INVALID_INPUT'
  );
});

test('chat.cambiar_foco devuelve RESOURCE_NOT_FOUND si destino no es blueprint registrado', () => {
  const m = makeInstance();
  m.eventBus = { publish() {} };
  m.blueprintModules.set('recetas', { child: {}, cajonesEnabled: true });
  assert.throws(
    () => m._executeNavTool('chat.cambiar_foco', { nuevo_page_id: 'desconocido' }, { conversation_id: 'c1' }),
    err => err.code === 'RESOURCE_NOT_FOUND'
  );
});

test('chat.cambiar_foco actualiza conversationPageFoco + publica chat.foco.cambiado', () => {
  const m = makeInstance();
  const published = [];
  m.eventBus = { publish(ev, p) { published.push({ ev, p }); } };
  m.blueprintModules.set('recetas', { child: {}, cajonesEnabled: true });
  m.blueprintModules.set('viabilidad', { child: {}, cajonesEnabled: true });
  const r = m._executeNavTool('chat.cambiar_foco', { nuevo_page_id: 'viabilidad', motivo: 'pregunta de coste mensual' }, {
    conversation_id: 'c1', page_id: 'recetas', project_id: 'p1', user_id: 'u1', correlation_id: 'corr-1'
  });
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.nuevo_page_id, 'viabilidad');
  assert.strictEqual(r.anterior, 'recetas');
  assert.strictEqual(m.conversationPageFoco.get('c1'), 'viabilidad');
  assert.strictEqual(published.length, 1);
  assert.strictEqual(published[0].ev, 'chat.foco.cambiado');
  const data = published[0].p;
  assert.strictEqual(data.conversation_id, 'c1');
  assert.strictEqual(data.anterior, 'recetas');
  assert.strictEqual(data.nuevo, 'viabilidad');
  assert.strictEqual(data.motivo, 'pregunta de coste mensual');
  assert.strictEqual(data.project_id, 'p1');
  assert.strictEqual(data.correlation_id, 'corr-1');
  assert.ok(data.request_id, 'genera request_id');
  assert.ok(data.timestamp, 'genera timestamp');
});

test('chat.cambiar_foco devuelve noop sin publicar si ya estaba en ese page', () => {
  const m = makeInstance();
  const published = [];
  m.eventBus = { publish(ev, p) { published.push({ ev, p }); } };
  m.blueprintModules.set('recetas', { child: {}, cajonesEnabled: true });
  m.conversationPageFoco.set('c1', 'recetas');
  const r = m._executeNavTool('chat.cambiar_foco', { nuevo_page_id: 'recetas' }, {
    conversation_id: 'c1', page_id: 'recetas'
  });
  assert.strictEqual(r.status, 'noop');
  assert.strictEqual(published.length, 0, 'no publica si no hay cambio efectivo');
});

// --------------------------------------------------
// 14. Integracion _getTools incluye nav tools en blueprints cajones
// --------------------------------------------------

test('_getTools incluye chat.cambiar_foco y page.related cuando cajones_enabled (desde toolsRegistry)', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {}, child: {}, parent: null, systemPrompt: '', cajonesEnabled: true });
  // Simular que el loader registro las nav tools (v1.2: declaradas en
  // module.json.tools[] de ai-gateway, auto-registradas en toolsRegistry).
  const registry = new Map([
    ['page.related',     { name: 'page.related',     description: 'd1', parameters: { type: 'object' } }],
    ['chat.cambiar_foco', { name: 'chat.cambiar_foco', description: 'd2', parameters: { type: 'object' } }]
  ]);
  m.moduleLoader = { loadedModules: new Map(), getToolsForAI: () => [], toolsRegistry: registry };
  const tools = m._getTools('recetas');
  const names = tools.map(t => t.name);
  assert.ok(names.includes('chat.cambiar_foco'), 'incluye chat.cambiar_foco');
  assert.ok(names.includes('page.related'), 'incluye page.related');
  assert.ok(names.includes('cajon.listar'), 'sigue incluyendo cajon.listar');
});

test('_getTools omite nav tools sin error si no estan registradas todavia en toolsRegistry', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {}, child: {}, parent: null, systemPrompt: '', cajonesEnabled: true });
  m.moduleLoader = { loadedModules: new Map(), getToolsForAI: () => [], toolsRegistry: new Map() };
  const tools = m._getTools('recetas');
  const names = tools.map(t => t.name);
  // Cajones + universales presentes; nav no porque el registro lo decide el loader runtime.
  assert.ok(names.includes('cajon.abrir'));
  assert.ok(names.includes('bus.publish'));
  assert.ok(!names.includes('chat.cambiar_foco'));
});

test('_getTools NO incluye nav tools si cajones_enabled es false (modo legacy)', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {}, child: {}, parent: null, systemPrompt: '', cajonesEnabled: false });
  m.moduleLoader = { loadedModules: new Map(), getToolsForAI: () => [], toolsRegistry: new Map() };
  const tools = m._getTools('recetas');
  const names = tools.map(t => t.name);
  assert.ok(!names.includes('chat.cambiar_foco'), 'NO incluye nav tools en legacy');
  assert.ok(!names.includes('page.related'), 'NO incluye nav tools en legacy');
});

test('module.json.tools[] declara page.related y chat.cambiar_foco con handler canonico (v1.2)', () => {
  const manifest = require('../../modules/conversacion/ai-gateway/module.json');
  const tools = manifest.tools || [];
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  assert.ok(byName['page.related'], 'page.related declarada en module.json');
  assert.strictEqual(byName['page.related'].handler, 'handlePageRelated');
  assert.ok(byName['chat.cambiar_foco'], 'chat.cambiar_foco declarada en module.json');
  assert.strictEqual(byName['chat.cambiar_foco'].handler, 'handleChatCambiarFoco');
  assert.deepStrictEqual(byName['chat.cambiar_foco'].parameters.required, ['nuevo_page_id']);
});

test('handlers publicos handlePageRelated / handleChatCambiarFoco delegan a _executeNavTool', async () => {
  const m = makeInstance();
  m.eventBus = { publish() {} };
  setupBlueprintsWithReferences(m);
  m._buildPageGraph();
  const r = await m.handlePageRelated({ page_id: 'escandallo' });
  assert.strictEqual(r.page_id, 'escandallo');
  assert.ok(Array.isArray(r.related));

  m.blueprintModules.set('viabilidad', { child: {}, cajonesEnabled: true });
  const r2 = await m.handleChatCambiarFoco({ nuevo_page_id: 'viabilidad', conversation_id: 'c1' });
  assert.strictEqual(r2.status, 'ok');
  assert.strictEqual(r2.nuevo_page_id, 'viabilidad');
});

// --------------------------------------------------
// 15. Pages JS legacy navegables (target_page_id en modulos no-blueprint)
// --------------------------------------------------

test('_isNavegablePage reconoce blueprints + modulos con target_page_id', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {}, child: {}, parent: null, systemPrompt: '', cajonesEnabled: true });
  // menu-generator es JS legacy con target_page_id declarado
  m.moduleLoader = {
    loadedModules: new Map([
      ['menu-generator', { manifest: { target_page_id: 'menu-generator' } }],
      ['filesystem', { manifest: { /* sin target_page_id — no navegable */ } }]
    ])
  };
  assert.strictEqual(m._isNavegablePage('recetas'), true, 'blueprint navegable');
  assert.strictEqual(m._isNavegablePage('menu-generator'), true, 'JS legacy con target_page_id navegable');
  assert.strictEqual(m._isNavegablePage('filesystem'), false, 'modulo sin target_page_id no navegable');
  assert.strictEqual(m._isNavegablePage('inexistente'), false);
});

test('_listNavegablePages devuelve union blueprints + target_page_id', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {} });
  m.blueprintModules.set('escandallo', { manifest: {} });
  m.moduleLoader = {
    loadedModules: new Map([
      ['menu-generator', { manifest: { target_page_id: 'menu-generator' } }],
      ['recetas', { manifest: { target_page_id: 'recetas' } }] // duplicado con blueprint — no se cuenta dos veces
    ])
  };
  const lista = m._listNavegablePages();
  assert.deepStrictEqual(lista, ['escandallo', 'menu-generator', 'recetas']);
});

test('chat.cambiar_foco acepta target_page_id de modulo JS legacy (menu-generator)', () => {
  const m = makeInstance();
  m.eventBus = { publish() {} };
  m.blueprintModules.set('recetas', { manifest: {}, cajonesEnabled: true });
  m.moduleLoader = {
    loadedModules: new Map([
      ['menu-generator', { manifest: { target_page_id: 'menu-generator' } }]
    ])
  };
  const r = m._executeNavTool('chat.cambiar_foco', { nuevo_page_id: 'menu-generator', motivo: 'usuario sube foto de menu' }, { conversation_id: 'c1', page_id: 'recetas' });
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.nuevo_page_id, 'menu-generator');
  assert.strictEqual(r.anterior, 'recetas');
});

test('_buildPageGraph registra como nodos los modulos con target_page_id aunque no sean blueprints', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', {
    manifest: {},
    child: { operaciones: { x: { pseudocodigo: ["await publishAndWait('menu-generator.algo.request', {})"] } } },
    parent: null, systemPrompt: '', cajonesEnabled: true
  });
  m.moduleLoader = {
    loadedModules: new Map([
      ['menu-generator', { manifest: { target_page_id: 'menu-generator' } }]
    ])
  };
  m._buildPageGraph();
  // recetas y menu-generator deben existir como nodos
  assert.ok(m.pageGraph.has('recetas'));
  assert.ok(m.pageGraph.has('menu-generator'));
  // arista detectada del pseudocodigo: recetas consumes menu-generator
  // (PERO el regex de _buildPageGraph filtra primitivas; verifica que menu-generator NO esta en la lista de primitivas)
  // Si la arista no aparece (por filtro futuro), al menos el nodo SI existe via target_page_id branch.
});

test('page.related incluye menu-generator si esta conectado en grafo', () => {
  const m = makeInstance();
  m.blueprintModules.set('recetas', { manifest: {}, child: {}, parent: null, systemPrompt: '', cajonesEnabled: true });
  m.moduleLoader = {
    loadedModules: new Map([
      ['menu-generator', { manifest: { target_page_id: 'menu-generator' } }]
    ])
  };
  // Simular aristas hechas (override paginas_relacionadas o pseudocodigo)
  m.pageGraph.set('recetas', { consumes: new Set(['menu-generator']), consumed_by: new Set() });
  m.pageGraph.set('menu-generator', { consumes: new Set(), consumed_by: new Set(['recetas']) });
  const r = m._executeNavTool('page.related', { page_id: 'recetas' }, { conversation_id: 'c1' });
  assert.ok(r.consumes.includes('menu-generator'), 'menu-generator aparece como navegable en page.related');
});

// --------------------------------------------------
// 16. Blueprint subscribers asincronos (frente 2.4)
// --------------------------------------------------

function makeBusMock() {
  const subscriptions = new Map(); // event -> [handler]
  return {
    subscriptions,
    subscribe(event, handler) {
      const list = subscriptions.get(event) || [];
      list.push(handler);
      subscriptions.set(event, list);
      return () => {
        const arr = subscriptions.get(event);
        if (arr) {
          const idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    },
    emit(event, envelope) {
      for (const h of subscriptions.get(event) || []) h(envelope);
    },
    publish() {}
  };
}

test('_wireBlueprintAsyncSubscribers ignora blueprints sin eventos_que_escucho', () => {
  const m = makeInstance();
  m.eventBus = makeBusMock();
  m.blueprintModules.set('recetas', { child: { eventos_que_escucho: [] }, cajonesEnabled: true });
  m._wireBlueprintAsyncSubscribers();
  assert.strictEqual(m.asyncSubscriptions.size, 0);
});

test('_wireBlueprintAsyncSubscribers acepta forma objeto {evento, handler}', () => {
  const m = makeInstance();
  m.eventBus = makeBusMock();
  m.blueprintModules.set('recetas', {
    child: {
      eventos_que_escucho: [{ evento: 'escandallo.coste.calculado', handler: '_aplicar_coste_calculado' }],
      operaciones: { _aplicar_coste_calculado: { pseudocodigo: ['paso 1'] } }
    },
    cajonesEnabled: true
  });
  m._wireBlueprintAsyncSubscribers();
  assert.strictEqual(m.asyncSubscriptions.size, 1);
  assert.ok(m.asyncSubscriptions.has('escandallo.coste.calculado'));
  const subs = m.asyncSubscriptions.get('escandallo.coste.calculado');
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].page_id, 'recetas');
  assert.strictEqual(subs[0].handler_name, '_aplicar_coste_calculado');
});

test('_wireBlueprintAsyncSubscribers acepta forma string (handler auto-derivado)', () => {
  const m = makeInstance();
  m.eventBus = makeBusMock();
  m.blueprintModules.set('foo', {
    child: {
      eventos_que_escucho: ['bar.algo.pasado'],
      operaciones: { _on_bar_algo_pasado: { pseudocodigo: ['x'] } }
    },
    cajonesEnabled: true
  });
  m._wireBlueprintAsyncSubscribers();
  const subs = m.asyncSubscriptions.get('bar.algo.pasado');
  assert.strictEqual(subs.length, 1);
  assert.strictEqual(subs[0].handler_name, '_on_bar_algo_pasado');
});

test('_wireBlueprintAsyncSubscribers omite si el handler no existe en operaciones', () => {
  const m = makeInstance();
  m.eventBus = makeBusMock();
  m.blueprintModules.set('recetas', {
    child: {
      eventos_que_escucho: [{ evento: 'x.y.z', handler: '_handler_inexistente' }],
      operaciones: { otra_op: {} }
    },
    cajonesEnabled: true
  });
  m._wireBlueprintAsyncSubscribers();
  assert.strictEqual(m.asyncSubscriptions.size, 0, 'no registra suscripcion sin handler');
});

test('async subscriber: loop-guard descarta eventos emitidos por el propio subscriber', async () => {
  const m = makeInstance();
  const bus = makeBusMock();
  m.eventBus = bus;
  m.blueprintModules.set('recetas', {
    child: {
      eventos_que_escucho: [{ evento: 'receta.actualizada', handler: '_on_recursive' }],
      operaciones: { _on_recursive: { pseudocodigo: ['x'] } }
    },
    cajonesEnabled: true
  });
  let invocaciones = 0;
  m._handleBlueprintAsyncEvent = async () => { invocaciones++; };
  m._wireBlueprintAsyncSubscribers();
  // Emitir evento con source = recetas (auto-publicacion)
  bus.emit('receta.actualizada', { data: { foo: 1 }, source: { module_id: 'recetas' } });
  await new Promise(r => setImmediate(r));
  assert.strictEqual(invocaciones, 0, 'loop-guard descarto evento auto-publicado');
  // Emitir evento de OTRO source — debe procesarlo
  bus.emit('receta.actualizada', { data: { foo: 1 }, source: { module_id: 'escandallo' } });
  await new Promise(r => setImmediate(r));
  assert.strictEqual(invocaciones, 1, 'evento externo SI se procesa');
});

test('_handleBlueprintAsyncEvent invoca _executeLLM con prompt sintetico + page_id correcto', async () => {
  const m = makeInstance();
  m.logger = { info(){}, warn(){}, error(){}, debug(){} };
  m.eventBus = makeBusMock();
  m.blueprintModules.set('recetas', { child: { operaciones: { _h: { pseudocodigo: ['x'] } } }, cajonesEnabled: true });
  m.moduleLoader = { loadedModules: new Map(), getToolsForAI: () => [], toolsRegistry: new Map() };
  let captured = null;
  m._executeLLM = async (args) => { captured = args; return {}; };
  await m._handleBlueprintAsyncEvent({
    page_id: 'recetas',
    handler_name: '_h',
    evento: 'foo.bar.baz',
    event_payload: { project_id: 'proj-1', receta_id: 'rec-1', coste_total: 12.3, correlation_id: 'corr-1' }
  });
  assert.ok(captured, '_executeLLM fue invocado');
  assert.strictEqual(captured.page_id, 'recetas', 'page_id del subscriber');
  assert.strictEqual(captured.project_id, 'proj-1', 'project_id viene del payload');
  assert.strictEqual(captured.correlation_id, 'corr-1', 'correlation_id viene del payload');
  assert.strictEqual(captured.user_id, 'async-subscriber');
  assert.ok(captured.conversation_id, 'genera conversation_id nuevo');
  assert.strictEqual(captured.intencion, 'async-handler');
  assert.strictEqual(captured.context?.async_invocation, true);
  // El mensaje sintetico debe contener evento + handler + payload serializado
  const msg = captured.messages[0]?.content || '';
  assert.ok(msg.includes('foo.bar.baz'), 'mensaje contiene evento');
  assert.ok(msg.includes('_h'), 'mensaje contiene handler_name');
  assert.ok(msg.includes('"receta_id": "rec-1"'), 'mensaje contiene payload serializado');
});

test('_handleBlueprintAsyncEvent NO propaga errores al publisher (fire-and-forget)', async () => {
  const m = makeInstance();
  const logged = [];
  m.logger = { info(){}, warn(){}, error(e, p) { logged.push({ e, p }); }, debug(){} };
  m.eventBus = makeBusMock();
  m.blueprintModules.set('x', { child: {} });
  m.moduleLoader = { loadedModules: new Map(), getToolsForAI: () => [], toolsRegistry: new Map() };
  m._executeLLM = async () => { throw new Error('LLM down'); };
  // No debe lanzar — el handler es fire-and-forget desde el publisher
  await m._handleBlueprintAsyncEvent({
    page_id: 'x', handler_name: '_h', evento: 'foo.bar',
    event_payload: { project_id: 'p1' }
  });
  assert.ok(logged.some(l => l.e === 'ai-gateway.async-handler.failed'), 'fallo loggeado');
});

test('onUnload libera todas las async subscriptions', async () => {
  const m = makeInstance();
  m.providers = new Map();
  m.credentialCache = new Map();
  m.pendingCredentials = new Map();
  m.pendingFsReads = new Map();
  let unsubbed = 0;
  m.asyncSubscriptions.set('evt.a', [{ page_id: 'x', handler_name: '_h', unsub: () => unsubbed++ }]);
  m.asyncSubscriptions.set('evt.b', [{ page_id: 'y', handler_name: '_h2', unsub: () => unsubbed++ }]);
  await m.onUnload();
  assert.strictEqual(unsubbed, 2);
  assert.strictEqual(m.asyncSubscriptions.size, 0);
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
