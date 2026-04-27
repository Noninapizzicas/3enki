/**
 * Smoke test local de ai-gateway:
 *  - Solución 1: _buildPagePrefixes auto-derivado desde moduleLoader
 *  - Propagación de los 9 campos del payload chat-io en eventos de tools
 *
 * Mockea moduleLoader con módulos cuyo name no coincide con prefijo de tools
 * (caso menu-generator, carta-manager, etc.). Verifica que el filtrado funciona
 * y que los args de tools llegan enriquecidos con los 9 campos.
 */

const Mod = require('/home/user/2enki/modules/conversacion/ai-gateway/index.js');

// ---------- Mock moduleLoader ----------
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

// toolsRegistry mock con algunos handlers para probar el path directo
const toolsRegistry = new Map();
const handlerCalls = [];
toolsRegistry.set('menu.generate', {
  name: 'menu.generate',
  handler: async (args) => {
    handlerCalls.push({ tool: 'menu.generate', args });
    return { status: 202, data: { ok: true, nombre: args.nombre } };
  }
});
toolsRegistry.set('carta.list', {
  name: 'carta.list',
  handler: async (args) => {
    handlerCalls.push({ tool: 'carta.list', args });
    return [{ id: '1', nombre: 'Carta A' }];
  }
});
toolsRegistry.set('carta.save', {
  name: 'carta.save',
  handler: async (args) => {
    handlerCalls.push({ tool: 'carta.save', args });
    if (!args.carta) return { error: 'carta requerida' };
    return { id: 'new-uuid', saved: true };
  }
});
// Tool sin handler — debería ir al path 2 (evento)
toolsRegistry.set('invoke_agent', { name: 'invoke_agent', handler: null });

const moduleLoader = {
  loadedModules: fakeModules,
  getToolsForAI: () => allTools,
  toolsRegistry
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
      try { h({ data }); } catch (e) { console.error('handler error', event, e); }
    }
  }
};

const logger = {
  info: () => {}, warn: (...a) => console.log('WARN', ...a),
  error: (...a) => console.log('ERR ', ...a), debug: () => {}
};

async function main() {
  const mod = new Mod();
  // Sin que se llame onLoad (require providers, etc), seteamos los mínimos para los tests
  mod.logger = logger;
  mod.eventBus = eventBus;
  mod.moduleLoader = moduleLoader;
  mod.config = {};
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
  // BLOQUE 1 — Solución 1 (auto-derivado de prefijos)
  // ============================================================
  console.log('\n[1] Auto-derivado de prefijos al llamar _getTools');

  // Antes de la primera llamada, pagePrefixes es undefined
  assert(mod.pagePrefixes === undefined, 'pagePrefixes empieza undefined');

  // Caso recetas (prefijo coincide con name) — TIENE que funcionar (compat)
  const tRecetas = mod._getTools('recetas');
  const namesRecetas = tRecetas.map(t => t.name).sort();
  assert(namesRecetas.includes('recetas.crear'), 'recetas: incluye recetas.crear');
  assert(namesRecetas.includes('recetas.listar'), 'recetas: incluye recetas.listar');
  assert(namesRecetas.includes('invoke_agent'), 'recetas: incluye invoke_agent (global)');
  assert(!namesRecetas.includes('menu.generate'), 'recetas: NO incluye menu.generate (otro módulo)');

  // Después de la primera llamada, pagePrefixes ya está construido
  assert(mod.pagePrefixes instanceof Map, 'pagePrefixes ahora es Map');
  assert(mod.pagePrefixes.has('menu-generator'), 'pagePrefixes contiene menu-generator');
  assert(mod.pagePrefixes.get('menu-generator').has('menu'), 'pagePrefixes[menu-generator] = {menu}');
  assert(mod.pagePrefixes.get('carta-digital').has('cartadigital'), 'pagePrefixes[carta-digital] = {cartadigital}');

  // Caso menu-generator (prefijo NO coincide con name) — el bug que arreglamos
  console.log('\n[2] menu-generator (page_id "menu-generator") encuentra menu.generate');
  const tMenuGen = mod._getTools('menu-generator');
  const namesMenuGen = tMenuGen.map(t => t.name).sort();
  assert(namesMenuGen.includes('menu.generate'), 'menu-generator: ENCUENTRA menu.generate (antes no)');
  assert(namesMenuGen.includes('invoke_agent'), 'menu-generator: incluye invoke_agent global');
  assert(!namesMenuGen.includes('recetas.crear'), 'menu-generator: NO incluye tools de otros módulos');

  // Caso carta-manager
  console.log('\n[3] carta-manager (page_id "carta-manager") encuentra carta.*');
  const tCartaMgr = mod._getTools('carta-manager');
  const namesCartaMgr = tCartaMgr.map(t => t.name).sort();
  assert(namesCartaMgr.includes('carta.save'), 'carta-manager: encuentra carta.save');
  assert(namesCartaMgr.includes('carta.list'), 'carta-manager: encuentra carta.list');
  assert(!namesCartaMgr.includes('cartadigital.get_config'), 'carta-manager: NO incluye cartadigital.* (otro módulo)');

  // Caso carta-digital
  console.log('\n[4] carta-digital (page_id "carta-digital") encuentra cartadigital.*');
  const tCD = mod._getTools('carta-digital');
  const namesCD = tCD.map(t => t.name).sort();
  assert(namesCD.includes('cartadigital.get_config'), 'carta-digital: encuentra cartadigital.get_config');
  assert(!namesCD.includes('carta.save'), 'carta-digital: NO incluye carta.save (otro módulo)');

  // Caso sin page_id → todas las tools
  console.log('\n[5] sin page_id → todas las tools');
  const tAll = mod._getTools(null);
  assert(tAll.length === allTools.length, `sin page_id devuelve todas las tools (${allTools.length})`);

  // Caso page_id desconocido → solo globales
  console.log('\n[6] page_id desconocido → solo globales');
  const tUnknown = mod._getTools('no-existe');
  const namesUnknown = tUnknown.map(t => t.name).sort();
  assert(namesUnknown.includes('invoke_agent'), 'globales presentes');
  assert(namesUnknown.includes('fs.read'), 'fs.read presente (global)');
  assert(!namesUnknown.includes('recetas.crear'), 'no incluye tools de módulos desconocidos');

  // ============================================================
  // BLOQUE 2 — Propagación de los 9 campos a handler DIRECTO
  // ============================================================
  console.log('\n[7] handler directo recibe args enriquecidos con los 9 campos');
  handlerCalls.length = 0;

  await mod._executeToolCall('menu.generate',
    { texto: 'una carta de test', nombre: 'Test Carta' },
    {
      project_id: 'p-1', page_id: 'menu-generator', conversation_id: 'c-1',
      settings: { temperature: 0.5 }, attachments: ['file1'],
      prompt: 'system prompt', intencion: 'crear', context: { extra: 'data' }
    }
  );

  assert(handlerCalls.length === 1, 'handler directo invocado 1 vez');
  const args = handlerCalls[0].args;
  assert(args.texto === 'una carta de test', 'preserva texto del LLM');
  assert(args.nombre === 'Test Carta', 'preserva nombre del LLM');
  assert(args.project_id === 'p-1', 'enriquece project_id desde context');
  assert(args.page_id === 'menu-generator', 'enriquece page_id desde context');
  assert(args.conversation_id === 'c-1', 'enriquece conversation_id desde context');
  assert(args.settings?.temperature === 0.5, 'enriquece settings desde context');
  assert(JSON.stringify(args.attachments) === '["file1"]', 'enriquece attachments desde context');
  assert(args.prompt === 'system prompt', 'enriquece prompt desde context');
  assert(args.intencion === 'crear', 'enriquece intencion desde context');
  assert(args._chat_context?.extra === 'data', '_chat_context preservado');

  // ============================================================
  // BLOQUE 3 — Args del LLM tienen prioridad sobre context (en path directo)
  // ============================================================
  console.log('\n[8] args del LLM tienen prioridad sobre el chat context');
  handlerCalls.length = 0;

  await mod._executeToolCall('menu.generate',
    { project_id: 'p-LLM', nombre: 'OtroNombre' },
    { project_id: 'p-CHAT', conversation_id: 'c-CHAT' }
  );

  const args2 = handlerCalls[0].args;
  assert(args2.project_id === 'p-LLM', 'project_id del LLM tiene prioridad sobre chatContext');
  assert(args2.conversation_id === 'c-CHAT', 'conversation_id del chatContext se usa si LLM no lo trae');
  assert(args2.nombre === 'OtroNombre', 'preserva nombre del LLM');

  // ============================================================
  // BLOQUE 4 — Path directo: handler se invoca directamente, NO publica evento
  // ============================================================
  console.log('\n[9] Path directo: tool con handler NO publica evento');
  published.length = 0;
  handlerCalls.length = 0;

  const directResult = await mod._executeToolCall('menu.generate',
    { nombre: 'TestDirect', texto: 'una carta' },
    { project_id: 'p-D', conversation_id: 'c-D', page_id: 'menu-generator' }
  );
  assert(handlerCalls.length === 1, 'handler invocado directamente 1 vez');
  assert(handlerCalls[0].tool === 'menu.generate', 'handler de menu.generate');
  assert(handlerCalls[0].args.project_id === 'p-D', 'args enriquecidos llegan al handler directo');
  assert(handlerCalls[0].args.nombre === 'TestDirect', 'args originales preservados');
  assert(directResult?.ok === true, 'devuelve result.data del handler (status:202 → data extraida)');
  assert(published.filter(p => p.event === 'menu.generate').length === 0,
    'NO publica evento menu.generate (path directo)');

  // ============================================================
  // BLOQUE 5 — Path directo: handler con error
  // ============================================================
  console.log('\n[11] Path directo: handler que devuelve {error} es propagado como excepción');
  let threw = false;
  try {
    await mod._executeToolCall('carta.save', {}, { project_id: 'p1' });
  } catch (e) {
    threw = e.message.includes('carta requerida');
  }
  assert(threw, 'el error del handler se propaga como excepción');

  // ============================================================
  // BLOQUE 6 — Path evento (fallback): tool sin handler usa el bus
  // ============================================================
  console.log('\n[12] Path evento (fallback): tool sin handler publica evento');
  published.length = 0;
  // Disparamos sin esperar (no hay listener real → timeout, pero solo queremos ver que publica)
  mod._executeToolCall('invoke_agent',
    { agent_name: 'X', task: 'algo' },
    { project_id: 'p1', conversation_id: 'c1' }
  );
  await new Promise(r => setTimeout(r, 50));
  const invokes = published.filter(p => p.event === 'invoke_agent');
  assert(invokes.length === 1, 'publica evento invoke_agent (path 2 fallback)');
  assert(invokes[0]?.data?.agent_name === 'X', 'preserva agent_name del LLM');
  assert(invokes[0]?.data?.project_id === 'p1', 'enriquece con project_id del context');

  // ============================================================
  // BLOQUE 7 — Sin chatContext, no rompe (path 2)
  // ============================================================
  console.log('\n[13] _executeToolCall sin chatContext no rompe (path evento)');
  published.length = 0;
  mod._executeToolCall('invoke_agent', { agent_name: 'Y', task: 'sin ctx' }, undefined);
  await new Promise(r => setTimeout(r, 50));
  const lastInvoke = published.filter(p => p.event === 'invoke_agent')[0]?.data;
  assert(lastInvoke != null, 'publicó evento');
  assert(lastInvoke.project_id === null, 'project_id es null por defecto');
  assert(lastInvoke._chat_context === null, '_chat_context es null por defecto');

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
  console.log(`══════════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
