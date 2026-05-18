/**
 * Smoke test de blueprint-driven modules (piloto).
 *
 * Cubre lo que ai-gateway anyade para soportar modulos blueprint:
 *  - _loadBlueprints() descubre modulos con manifest.blueprint_driven=true,
 *    lee padre + hijo y construye this.blueprintModules indexado por
 *    target_page_id.
 *  - _composeBlueprintSystemPrompt() compone padre + hijo como string que
 *    se inyecta al system prompt cuando el chat es blueprint-driven.
 *  - _getTools(page_id) devuelve SOLO las 2 tools universales cuando page_id
 *    coincide con un target_page_id de blueprintModules.
 *  - _executeUniversalBusTool('bus.publish', ...) publica al bus + retorna ok.
 *  - _executeUniversalBusTool('bus.publishAndWait', ...) publica + espera
 *    response correlacionada por request_id.
 *  - bus.publishAndWait con timeout corto → UPSTREAM_TIMEOUT.
 *  - bus.publish del nombre de la tool como evento → INVALID_INPUT (defensa).
 *
 * NO ejecuta el LLM real — eso vive en scripts/audit-helpers/test-blueprint-*
 */

const path = require('path');
const Mod = require('../index.js');

// ---------- Mock moduleLoader con un modulo blueprint-driven ----------
const blueprintDir = path.resolve(__dirname, '..', '..', '..', '_recetas-blueprint');
const fakeModules = new Map([
  ['_recetas-blueprint', {
    manifest: {
      name: '_recetas-blueprint',
      blueprint_driven: true,
      blueprint_path: 'recetas.blueprint.json',
      blueprint_parent_path: 'subsistema-recetario.modulo-base.blueprint.json',
      target_page_id: 'recetas-blueprint'
    },
    path: blueprintDir,
    blueprint_driven: true
  }],
  ['recetas', {
    manifest: { name: 'recetas', tools: [{ name: 'recetas.crear' }] }
  }]
]);

const allTools = [{ name: 'recetas.crear', description: '' }];

const moduleLoader = {
  loadedModules: fakeModules,
  getToolsForAI: () => allTools
};

// ---------- Mock eventBus ----------
const subs = new Map();
const published = [];
const eventBus = {
  subscribe(event, handler) {
    if (!subs.has(event)) subs.set(event, []);
    subs.get(event).push(handler);
    return () => {
      const arr = subs.get(event) || [];
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    };
  },
  publish(event, data) {
    published.push({ event, data });
    for (const h of (subs.get(event) || [])) {
      try { h(data); } catch (e) { console.error('handler error', event, e); }
    }
  }
};

const logger = {
  info: () => {}, warn: (...a) => console.log('WARN', ...a),
  error: (...a) => console.log('ERR ', ...a), debug: () => {}
};

async function main() {
  const mod = new Mod();
  mod.logger = logger;
  mod.eventBus = eventBus;
  mod.moduleLoader = moduleLoader;
  mod.config = { tool_timeout_ms: 2000 };
  mod.providers = new Map();
  mod.credentialCache = new Map();
  mod.pendingCredentials = new Map();
  mod.pendingFsReads = new Map();
  mod.blueprintModules = new Map();

  let passed = 0, failed = 0;
  function assert(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); passed++; }
    else { console.log(`  ✗ ${msg}`); failed++; }
  }

  // ============================================================
  // [1] _loadBlueprints descubre y carga padre + hijo
  // ============================================================
  console.log('\n[1] _loadBlueprints descubre el modulo _recetas-blueprint');
  mod._loadBlueprints();
  assert(mod.blueprintModules.size === 1, 'blueprintModules tiene 1 entrada');
  assert(mod.blueprintModules.has('recetas-blueprint'), 'indexado por target_page_id');
  const bp = mod.blueprintModules.get('recetas-blueprint');
  assert(bp.parent?.id === 'subsistema-recetario.modulo-base', 'padre cargado');
  assert(bp.child?.id === 'recetas', 'hijo cargado');
  assert(typeof bp.systemPrompt === 'string' && bp.systemPrompt.length > 1000, 'systemPrompt compuesto (>1000 chars)');

  // ============================================================
  // [2] systemPrompt incluye contenido del padre y del hijo
  // ============================================================
  console.log('\n[2] systemPrompt incluye contenido canonico');
  const sp = bp.systemPrompt;
  assert(sp.includes('BLUEPRINT PADRE'), 'header BLUEPRINT PADRE presente');
  assert(sp.includes('BLUEPRINT HIJO'), 'header BLUEPRINT HIJO presente');
  assert(sp.includes('bus.publishAndWait'), 'menciona la tool bus.publishAndWait');
  assert(sp.includes('receta.creada'), 'incluye evento del hijo (receta.creada)');
  assert(sp.includes('subsistema-recetario.modulo-base'), 'incluye id del padre');

  // ============================================================
  // [3] _getTools(page_id) devuelve solo las 2 tools universales
  // ============================================================
  console.log('\n[3] _getTools(page_id="recetas-blueprint") = 2 tools universales');
  const tools = mod._getTools('recetas-blueprint');
  const names = tools.map(t => t.name).sort();
  assert(tools.length === 2, 'exactamente 2 tools');
  assert(names[0] === 'bus.publish' && names[1] === 'bus.publishAndWait', 'son bus.publish y bus.publishAndWait');
  assert(tools[0].parameters?.required?.includes('event'), 'bus.publish requires event');
  assert(tools[1].parameters?.required?.includes('event'), 'bus.publishAndWait requires event');

  // Otro page_id no afecta — sigue devolviendo polyfunctional
  const toolsLegacy = mod._getTools('recetas');
  assert(toolsLegacy.map(t => t.name).includes('recetas.crear'), 'page_id legacy aun expone tools polyfunctional');
  assert(!toolsLegacy.map(t => t.name).includes('bus.publish'), 'page_id legacy NO expone bus.publish');

  // ============================================================
  // [4] bus.publish — fire-and-forget
  // ============================================================
  console.log('\n[4] bus.publish publica el evento y devuelve ok');
  published.length = 0;
  const r1 = await mod._executeUniversalBusTool('bus.publish',
    { event: 'receta.creada', payload: { id: 'r-1', nombre: 'Pizza' } },
    { project_id: 'p-1', user_id: 'u-1', correlation_id: 'corr-1' }
  );
  assert(r1?.published === true, 'devuelve { published: true }');
  assert(r1?.event === 'receta.creada', 'devuelve el nombre del evento publicado');
  assert(published.length === 1, 'publica 1 evento');
  assert(published[0].event === 'receta.creada', 'publica el nombre correcto');
  assert(published[0].data.id === 'r-1', 'preserva payload del LLM');
  assert(published[0].data.project_id === 'p-1', 'inyecta project_id del ctx');
  assert(published[0].data.user_id === 'u-1', 'inyecta user_id del ctx');
  assert(published[0].data.correlation_id === 'corr-1', 'inyecta correlation_id del ctx');
  assert(typeof published[0].data.timestamp === 'string', 'inyecta timestamp');

  // ============================================================
  // [5] bus.publishAndWait — correlacion por request_id
  // ============================================================
  console.log('\n[5] bus.publishAndWait publica + espera response correlacionada');
  published.length = 0;
  // Listener simulado que responde fs.read.request → fs.read.response
  eventBus.subscribe('fs.read.request', (payload) => {
    setImmediate(() => {
      eventBus.publish('fs.read.response', {
        request_id: payload.request_id,
        status: 200,
        content: '{"recetas":[]}'
      });
    });
  });

  const r2 = await mod._executeUniversalBusTool('bus.publishAndWait',
    { event: 'fs.read.request', payload: { path: '/proj/recetas.json' } },
    { project_id: 'p-1', user_id: 'u-1', correlation_id: 'corr-2' }
  );
  assert(r2?.status === 200, 'response.status === 200');
  assert(r2?.content === '{"recetas":[]}', 'response.content correcto');
  const req = published.find(p => p.event === 'fs.read.request');
  assert(req != null, 'publica fs.read.request');
  assert(typeof req.data.request_id === 'string', 'request_id generado por la tool');
  assert(req.data.path === '/proj/recetas.json', 'preserva payload del LLM');

  // ============================================================
  // [6] bus.publishAndWait con response_event implicito (.request → .response)
  // ============================================================
  console.log('\n[6] bus.publishAndWait infiere response_event = event.replace(.request, .response)');
  // Ya validado en [5] (no se paso response_event explicito).
  assert(true, 'inferencia .request→.response funciono (caso [5])');

  // ============================================================
  // [7] bus.publishAndWait con response_event explicito
  // ============================================================
  console.log('\n[7] bus.publishAndWait con response_event custom');
  eventBus.subscribe('agent.execute.request', (payload) => {
    setImmediate(() => {
      eventBus.publish('agent.execute.response', {
        request_id: payload.request_id,
        status: 'success',
        result: { value: 42 }
      });
    });
  });
  const r3 = await mod._executeUniversalBusTool('bus.publishAndWait',
    { event: 'agent.execute.request', payload: { agent_name: 'researcher' }, response_event: 'agent.execute.response' },
    {}
  );
  assert(r3?.status === 'success' && r3?.result?.value === 42, 'response_event explicito funciono');

  // ============================================================
  // [8] bus.publishAndWait timeout → UPSTREAM_TIMEOUT
  // ============================================================
  console.log('\n[8] bus.publishAndWait sin response → UPSTREAM_TIMEOUT');
  let threwTimeout = false, codeTimeout = null;
  try {
    await mod._executeUniversalBusTool('bus.publishAndWait',
      { event: 'no.responde.request', payload: {}, timeout_ms: 100 },
      {}
    );
  } catch (e) {
    threwTimeout = true;
    codeTimeout = e.code;
  }
  assert(threwTimeout, 'lanza error en timeout');
  assert(codeTimeout === 'UPSTREAM_TIMEOUT', `e.code === 'UPSTREAM_TIMEOUT' (got ${codeTimeout})`);

  // ============================================================
  // [9] defensa: LLM intenta publicar la tool como evento → INVALID_INPUT
  // ============================================================
  console.log('\n[9] bus.publish con event="bus.publish" → INVALID_INPUT (defensa)');
  let threwLoop = false, codeLoop = null;
  try {
    await mod._executeUniversalBusTool('bus.publish',
      { event: 'bus.publish', payload: {} },
      {}
    );
  } catch (e) {
    threwLoop = true;
    codeLoop = e.code;
  }
  assert(threwLoop, 'lanza error');
  assert(codeLoop === 'INVALID_INPUT', `e.code === 'INVALID_INPUT' (got ${codeLoop})`);

  // ============================================================
  // [10] bus.publish sin event → INVALID_INPUT
  // ============================================================
  console.log('\n[10] bus.publish sin event → INVALID_INPUT');
  let threwMissing = false, codeMissing = null;
  try {
    await mod._executeUniversalBusTool('bus.publish', { payload: {} }, {});
  } catch (e) {
    threwMissing = true;
    codeMissing = e.code;
  }
  assert(threwMissing, 'lanza error sin event');
  assert(codeMissing === 'INVALID_INPUT', `e.code === 'INVALID_INPUT' (got ${codeMissing})`);

  // ============================================================
  // [11] _executeToolCall enruta bus.* al handler universal (no al bus)
  // ============================================================
  console.log('\n[11] _executeToolCall(bus.publish, ...) NO publica el nombre "bus.publish" como evento');
  published.length = 0;
  await mod._executeToolCall('bus.publish',
    { event: 'test.evento', payload: { foo: 1 } },
    { project_id: 'p-1', user_id: 'u-1', correlation_id: 'c-1' }
  );
  assert(!published.find(p => p.event === 'bus.publish'), 'bus.publish NO se publica como evento');
  assert(published.find(p => p.event === 'test.evento'), 'test.evento si se publica');

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
  console.log(`══════════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
