/**
 * Smoke test de blueprint-driven modules.
 *
 * Cubre lo que ai-gateway anyade para soportar modulos blueprint:
 *  - _loadBlueprints() descubre modulos con manifest.blueprint_driven=true,
 *    lee padre + hijo y construye this.blueprintModules indexado por
 *    target_page_id.
 *  - _composeBlueprintSystemPrompt() compone padre + hijo como string que
 *    se inyecta al system prompt cuando el chat es blueprint-driven.
 *  - _getTools(page_id) devuelve SOLO las 2 tools universales cuando page_id
 *    coincide con un target_page_id de blueprintModules. Otros page_id no
 *    blueprint siguen recibiendo el catalogo polyfunctional clasico.
 *  - _executeUniversalBusTool('bus.publish', ...) publica al bus + retorna ok.
 *  - _executeUniversalBusTool('bus.publishAndWait', ...) publica + espera
 *    response correlacionada por request_id.
 *  - bus.publishAndWait con timeout corto → UPSTREAM_TIMEOUT.
 *  - bus.publish del nombre de la tool como evento → INVALID_INPUT (defensa).
 */

const path = require('path');
const Mod = require('../index.js');

// ---------- Mock moduleLoader con un modulo blueprint-driven ----------
const blueprintDir = path.resolve(__dirname, '..', '..', '..', 'pizzepos', 'recetas');
// El blueprint declara target_page_id="recetas". El modulo recetas legacy
// fue eliminado (los precios polifuncionales ya no existen); este blueprint
// es la unica via del LLM hacia el dominio recetas via bus.publish/publishAndWait.
const fakeModules = new Map([
  ['recetas', {
    manifest: {
      name: 'recetas',
      blueprint_driven: true,
      blueprint_path: 'recetas.blueprint.json',
      blueprint_parent_path: 'arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json',
      target_page_id: 'recetas'
    },
    path: blueprintDir,
    blueprint_driven: true
  }],
  // Modulo cualquiera para testear que _getTools sigue devolviendo polyfunctional
  // cuando el page_id no es blueprint.
  ['otro-modulo', {
    manifest: { name: 'otro-modulo', tools: [{ name: 'otro.tool' }] }
  }]
]);

const allTools = [{ name: 'otro.tool', description: '' }];

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
  console.log('\n[1] _loadBlueprints descubre modules/pizzepos/recetas con target_page_id="recetas"');
  mod._loadBlueprints();
  assert(mod.blueprintModules.size === 1, 'blueprintModules tiene 1 entrada');
  assert(mod.blueprintModules.has('recetas'), 'indexado por target_page_id="recetas"');
  const bp = mod.blueprintModules.get('recetas');
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
  // [3] _getTools(page_id="recetas") = 2 tools universales
  // ============================================================
  console.log('\n[3] _getTools(page_id="recetas") = 2 tools universales (reemplaza al legacy)');
  const tools = mod._getTools('recetas');
  const names = tools.map(t => t.name).sort();
  assert(tools.length === 2, 'exactamente 2 tools');
  assert(names[0] === 'bus.publish' && names[1] === 'bus.publishAndWait', 'son bus.publish y bus.publishAndWait');
  assert(tools[0].parameters?.required?.includes('event'), 'bus.publish requires event');
  assert(tools[1].parameters?.required?.includes('event'), 'bus.publishAndWait requires event');

  // Otros page_id no blueprint siguen recibiendo polyfunctional clasico.
  const toolsOtro = mod._getTools('otro-modulo');
  assert(toolsOtro.map(t => t.name).includes('otro.tool'), 'page_id no blueprint sigue exponiendo polyfunctional');
  assert(!toolsOtro.map(t => t.name).includes('bus.publish'), 'page_id no blueprint NO expone bus.publish');

  // ============================================================
  // [4] bus.publish — fire-and-forget
  // ============================================================
  console.log('\n[4] bus.publish publica el evento y devuelve ack');
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

  // ============================================================
  // [12] payload omitido entero → INVALID_INPUT (defensa anti-LLM-lazy)
  //
  // Reproduce el bug observado en el audit de recetas 2026-05-20:
  // anthropic claude-sonnet-4-6 (y deepseek en bucle silencioso) emitian
  // tool calls con solo {event:'fs.write.request'} omitiendo payload entero
  // cuando el content a serializar era grande. Antes del fix, el publish
  // salia al bus con payload solo auto-injectado (sin path/content), el
  // receptor respondia INVALID_INPUT, y el LLM reintentaba con el mismo
  // defecto. El fix detecta args.payload undefined y lanza INVALID_INPUT
  // con mensaje explicito para que el LLM reconstruya el tool call.
  // ============================================================
  console.log('\n[12] bus.publishAndWait sin args.payload (omitido) → INVALID_INPUT con mensaje al LLM');
  for (const tool of ['bus.publish', 'bus.publishAndWait']) {
    let threwNoPayload = false, codeNoPayload = null, msgNoPayload = '';
    try {
      await mod._executeUniversalBusTool(tool, { event: 'fs.write.request' }, {});
    } catch (e) {
      threwNoPayload = true;
      codeNoPayload = e.code;
      msgNoPayload = e.message;
    }
    assert(threwNoPayload, `${tool}: lanza error sin payload`);
    assert(codeNoPayload === 'INVALID_INPUT', `${tool}: e.code === 'INVALID_INPUT' (got ${codeNoPayload})`);
    assert(msgNoPayload.includes('payload'), `${tool}: mensaje menciona 'payload' (got: ${msgNoPayload.slice(0,80)})`);
    assert(msgNoPayload.includes("'fs.write.request'") || msgNoPayload.includes('fs.write.request'), `${tool}: mensaje menciona el event name para orientar al LLM`);
  }
  // Tambien payload=null y payload=string (LLM mal formado)
  for (const badPayload of [null, 'string mal puesto', 42, []]) {
    let threwBad = false, codeBad = null;
    try {
      await mod._executeUniversalBusTool('bus.publishAndWait',
        { event: 'fs.read.request', payload: badPayload }, {});
    } catch (e) { threwBad = true; codeBad = e.code; }
    assert(threwBad, `payload=${JSON.stringify(badPayload)}: lanza error`);
    assert(codeBad === 'INVALID_INPUT', `payload=${JSON.stringify(badPayload)}: code===INVALID_INPUT (got ${codeBad})`);
  }
  // payload={} (vacio pero objeto) SI debe pasar — es valido como anti-bug-test
  // (filesystem decidira si rechazar por falta de campos del dominio).
  let acceptedEmpty = false;
  try {
    eventBus.subscribe('test.empty.payload.request', (p) => {
      eventBus.publish('test.empty.payload.response', { request_id: p.request_id, ok: true });
    });
    const r = await mod._executeUniversalBusTool('bus.publishAndWait',
      { event: 'test.empty.payload.request', payload: {}, timeout_ms: 1000 }, {});
    acceptedEmpty = r && r.ok === true;
  } catch {}
  assert(acceptedEmpty, 'payload:{} (vacio pero objeto) acepta y publica — solo undefined/null/non-object falla');

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
  console.log(`══════════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
