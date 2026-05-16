/**
 * Smoke test local de ai-gateway tras eliminacion de PATH 1 (tools.contract v1.1).
 *
 * Cubre:
 *  - _buildPagePrefixes auto-derivado desde moduleLoader (filtrado por page_id).
 *  - Propagacion de los 9 campos del payload chat-io en eventos de tools.
 *  - Invocacion canonica por bus: ai-gateway publica `<toolName>` con
 *    {request_id, ...args} y espera `<toolName>.response` con
 *    {request_id, result|error}.
 *
 * NO existe PATH 1 (acceso directo a toolsRegistry.handler) — esa via fue
 * eliminada en v1.1 y validada por
 * arquitectura/decisiones/_validators/tools.validate.js (drift error).
 */

const Mod = require('../index.js');

// ---------- Mock moduleLoader (solo metadata: filtrado por page_id) ----------
const fakeModules = new Map([
  ['recetas',         { manifest: { name: 'recetas',        tools: [
    { name: 'recetas.crear' }, { name: 'recetas.listar' }, { name: 'recetas.obtener' }
  ]}}],
  ['menu-generator',  { manifest: { name: 'menu-generator', tools: [
    { name: 'menu.generate' }
  ]}}],
  ['carta-manager',   { manifest: { name: 'carta-manager',  tools: [
    { name: 'carta.save' }, { name: 'carta.get' }, { name: 'carta.list' }, { name: 'carta.delete' }
  ]}}],
  ['carta-digital',   { manifest: { name: 'carta-digital',  tools: [
    { name: 'cartadigital.get_config' }, { name: 'cartadigital.update_config' }
  ]}}],
  ['ai-agent-framework', { manifest: { name: 'ai-agent-framework', tools: [
    { name: 'invoke_agent' }
  ]}}],
  ['filesystem',      { manifest: { name: 'filesystem',     tools: [
    { name: 'fs.read' }, { name: 'fs.write' }, { name: 'fs.list' }
  ]}}]
]);

const allTools = [];
for (const [, mod] of fakeModules) {
  for (const t of mod.manifest.tools) allTools.push({ name: t.name, description: '' });
}

const moduleLoader = {
  loadedModules: fakeModules,
  getToolsForAI: () => allTools
  // NOTA: ya no exponemos toolsRegistry — ai-gateway no debe leerlo, todo va por bus.
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
  async publish(event, data) {
    published.push({ event, data });
    for (const h of (subs.get(event) || [])) {
      try { await h(data); } catch (e) { console.error('handler error', event, e); }
    }
  }
};

const logger = {
  info: () => {}, warn: (...a) => console.log('WARN', ...a),
  error: (...a) => console.log('ERR ', ...a), debug: () => {}
};

/**
 * Auto-responder por bus: simula lo que el loader hace en produccion
 * (_wireToolBusSubscription). Recibe `<toolName>` con {request_id, ...args},
 * llama al fakeHandler y publica `<toolName>.response`.
 */
function registerFakeBusTool(toolName, fakeHandler) {
  eventBus.subscribe(toolName, async (payload) => {
    const { request_id, ...args } = payload || {};
    try {
      let result = await fakeHandler(args);
      if (result && typeof result === 'object') {
        if (result.error && (result.status == null || result.status >= 400)) {
          const errObj = (typeof result.error === 'object') ? result.error
            : { code: 'UNKNOWN_ERROR', message: String(result.error) };
          await eventBus.publish(`${toolName}.response`, { request_id, error: errObj });
          return;
        }
        if ('status' in result && 'data' in result && result.status >= 200 && result.status < 400) {
          result = result.data;
        }
      }
      await eventBus.publish(`${toolName}.response`, { request_id, result });
    } catch (err) {
      await eventBus.publish(`${toolName}.response`, {
        request_id,
        error: { code: 'UNKNOWN_ERROR', message: err.message || String(err) }
      });
    }
  });
}

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

  let passed = 0, failed = 0;
  function assert(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); passed++; }
    else { console.log(`  ✗ ${msg}`); failed++; }
  }

  // ============================================================
  // BLOQUE 1 — Filtrado por page_id (sin cambios respecto a v1.0)
  // ============================================================
  console.log('\n[1] Auto-derivado de prefijos al llamar _getTools');

  assert(mod.pagePrefixes === null, 'pagePrefixes empieza null (declarativo en constructor)');

  const tRecetas = mod._getTools('recetas');
  const namesRecetas = tRecetas.map(t => t.name).sort();
  assert(namesRecetas.includes('recetas.crear'), 'recetas: incluye recetas.crear');
  assert(namesRecetas.includes('invoke_agent'), 'recetas: incluye invoke_agent (global)');
  assert(!namesRecetas.includes('menu.generate'), 'recetas: NO incluye menu.generate (otro módulo)');

  assert(mod.pagePrefixes instanceof Map, 'pagePrefixes ahora es Map');
  assert(mod.pagePrefixes.get('menu-generator').has('menu'), 'pagePrefixes[menu-generator] = {menu}');

  console.log('\n[2] menu-generator (page_id "menu-generator") encuentra menu.generate');
  const tMenuGen = mod._getTools('menu-generator');
  assert(tMenuGen.map(t => t.name).includes('menu.generate'), 'menu-generator: ENCUENTRA menu.generate');

  console.log('\n[3] sin page_id → todas las tools; page_id desconocido → solo globales');
  assert(mod._getTools(null).length === allTools.length, 'sin page_id devuelve todas');
  const tUnknown = mod._getTools('no-existe').map(t => t.name);
  assert(tUnknown.includes('invoke_agent') && tUnknown.includes('fs.read'),
    'page_id desconocido → globales (invoke_agent + fs.read)');
  assert(!tUnknown.includes('recetas.crear'), 'page_id desconocido NO incluye tools de modulos');

  // ============================================================
  // BLOQUE 2 — Invocacion canonica por bus
  // ============================================================
  console.log('\n[4] Tool via bus: ai-gateway publica `<toolName>`, recibe `<toolName>.response`');
  published.length = 0;
  const calls = [];
  registerFakeBusTool('menu.generate', async (args) => {
    calls.push(args);
    return { status: 202, data: { ok: true, nombre: args.nombre } };
  });

  const result = await mod._executeToolCall('menu.generate',
    { texto: 'una carta de test', nombre: 'Test Carta' },
    {
      project_id: 'p-1', page_id: 'menu-generator', conversation_id: 'c-1',
      settings: { temperature: 0.5 }, attachments: ['file1'],
      prompt: 'system prompt', intencion: 'crear', context: { extra: 'data' }
    }
  );

  // ai-gateway debe haber publicado el evento request
  const requests = published.filter(p => p.event === 'menu.generate');
  assert(requests.length === 1, 'ai-gateway publica `menu.generate` 1 vez');
  assert(typeof requests[0].data.request_id === 'string', 'request lleva request_id (uuid)');
  assert(requests[0].data.project_id === 'p-1', 'request enriquecido con project_id del chat ctx');
  assert(requests[0].data.page_id === 'menu-generator', 'request enriquecido con page_id');
  assert(requests[0].data.settings?.temperature === 0.5, 'request enriquecido con settings');
  assert(requests[0].data._chat_context?.extra === 'data', '_chat_context preservado');

  // handler simulado debe haber recibido args (sin request_id)
  assert(calls.length === 1, 'handler invocado 1 vez');
  assert(!('request_id' in calls[0]), 'handler ve args SIN request_id (stripped por wrapper)');
  assert(calls[0].nombre === 'Test Carta', 'handler ve nombre del LLM');

  // resultado para ai-gateway: data unwrapped (status:202, data:{...} → {...})
  assert(result?.ok === true && result?.nombre === 'Test Carta', 'result es data unwrapped');

  // ============================================================
  // BLOQUE 3 — args del LLM tienen prioridad sobre chat ctx
  // ============================================================
  console.log('\n[5] args del LLM tienen prioridad sobre chat ctx');
  calls.length = 0;
  published.length = 0;
  await mod._executeToolCall('menu.generate',
    { project_id: 'p-LLM', nombre: 'OtroNombre' },
    { project_id: 'p-CHAT', conversation_id: 'c-CHAT' }
  );
  assert(calls[0].project_id === 'p-LLM', 'project_id del LLM tiene prioridad');
  assert(calls[0].conversation_id === 'c-CHAT', 'conversation_id del ctx se usa si LLM no lo trae');

  // ============================================================
  // BLOQUE 4 — Error path: handler devuelve {status:5xx, error} → reject
  // ============================================================
  console.log('\n[6] handler error → ai-gateway propaga la excepcion');
  registerFakeBusTool('carta.save', async (args) => {
    if (!args.carta) return { status: 400, error: { code: 'INVALID_INPUT', message: 'carta requerida' } };
    return { status: 200, data: { id: 'new-uuid' } };
  });

  let threw = false;
  try {
    await mod._executeToolCall('carta.save', {}, { project_id: 'p1' });
  } catch (e) {
    threw = e.message.includes('carta requerida');
  }
  assert(threw, 'error del handler se propaga como excepcion en _executeToolCall');

  // ============================================================
  // BLOQUE 5 — Tool sin auto-responder (timeout)
  // ============================================================
  console.log('\n[7] tool sin listener registrado → timeout (no se queda colgado)');
  mod.config.tool_timeout_ms = 100;  // acelerar timeout
  let timedOut = false;
  try {
    await mod._executeToolCall('does.not.exist', { foo: 1 }, { project_id: 'p1' });
  } catch (e) {
    timedOut = /timeout/.test(e.message);
  }
  assert(timedOut, 'tool sin listener -> timeout');

  // ============================================================
  // BLOQUE 6 — request_id correlation: respuestas concurrentes no se cruzan
  // ============================================================
  console.log('\n[8] request_id correlation: invocaciones concurrentes no se cruzan');
  mod.config.tool_timeout_ms = 2000;
  registerFakeBusTool('echo.do', async (args) => {
    // Resolvemos sincronicamente con el tag para que ambas invocaciones
    // generen response simultaneamente
    return { status: 200, data: `echo-${args.tag}` };
  });

  const [r1, r2] = await Promise.all([
    mod._executeToolCall('echo.do', { tag: 'A' }, {}),
    mod._executeToolCall('echo.do', { tag: 'B' }, {})
  ]);
  assert(r1 === 'echo-A', 'invocacion A recibe su propia respuesta');
  assert(r2 === 'echo-B', 'invocacion B recibe su propia respuesta');

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
  console.log(`══════════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
