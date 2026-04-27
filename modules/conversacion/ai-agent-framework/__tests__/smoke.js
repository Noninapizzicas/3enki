/**
 * Smoke test local de ai-agent-framework v1.1.0
 *
 * Verifica:
 *  - Carga de agentes desde agents/*.json
 *  - Handler invoke_agent (path del LLM principal)
 *  - Handler agent.execute.request (path event-driven de módulos)
 *  - Devolución de respuesta al evento correcto en cada caso
 *  - Cimentaciones para Fase 8: session_id, conversation_id se preservan
 */

const path = require('path');
const Mod = require('/home/user/2enki/modules/conversacion/ai-agent-framework/index.js');

// ---------- Mock EventBus ----------
const subs = new Map();
const published = []; // historial de eventos publicados

const eventBus = {
  subscribe(event, handler) {
    if (!subs.has(event)) subs.set(event, []);
    subs.get(event).push(handler);
  },
  async publish(event, data) {
    published.push({ event, data, ts: Date.now() });
    // Simular respuesta del LLM cuando alguien publica llm.complete.request
    if (event === 'llm.complete.request') {
      setImmediate(() => dispatch('llm.complete.response', {
        request_id: data.request_id,
        success: true,
        content: `Mock LLM response for system prompt of length ${(data.system||'').length}`,
        tool_calls_executed: []
      }));
    }
    dispatch(event, data);
  }
};

function dispatch(event, data) {
  for (const h of (subs.get(event) || [])) {
    try { h({ data }); } catch (e) { console.error('handler error', event, e); }
  }
}

const logger = {
  info: () => {}, warn: (...a) => console.log('WARN', ...a),
  error: (...a) => console.log('ERR ', ...a), debug: () => {}
};

// ---------- moduleLoader stub ----------
const moduleLoader = {
  toolsRegistry: new Map(),
  getToolsForAI: () => []
};

// ---------- Carga el módulo ----------
async function main() {
  const mod = new Mod();
  await mod.onLoad({ logger, eventBus, moduleLoader });

  console.log(`\nAgentes cargados: ${mod.agents.size}`);
  if (mod.agents.size === 0) {
    console.log('✗ No se cargaron agentes (revisar agents/ directory)');
    process.exit(1);
  }
  // Suscribir handlers según module.json
  const moduleJson = require('/home/user/2enki/modules/conversacion/ai-agent-framework/module.json');
  for (const sub of moduleJson.subscribes) {
    if (typeof mod[sub.handler] === 'function') {
      eventBus.subscribe(sub.event, (e) => mod[sub.handler](e));
    }
  }

  // Pick un agente cualquiera
  const agentName = [...mod.agents.keys()][0];
  console.log(`Usando agente: ${agentName}`);

  let passed = 0, failed = 0;
  function assert(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); passed++; }
    else { console.log(`  ✗ ${msg}`); failed++; }
  }

  // -------- TEST 1: invoke_agent (path del LLM) --------
  console.log('\n[1] invoke_agent (path LLM)');
  published.length = 0;
  await mod.onInvokeAgent({ data: {
    request_id: 'req-001',
    agent_name: agentName,
    task: 'Tarea de test',
    context: { project_id: 'p1', foo: 'bar' }
  }});
  // Esperamos ciclo: llm.complete.request → llm.complete.response → invoke_agent.response
  await new Promise(r => setTimeout(r, 50));

  const llmReqs1 = published.filter(p => p.event === 'llm.complete.request');
  assert(llmReqs1.length === 1, 'publicó 1 llm.complete.request');
  assert(llmReqs1[0]?.data?.system?.includes('CONTEXTO ENTREGADO'), 'system prompt incluye contexto');

  const responses1 = published.filter(p => p.event === 'invoke_agent.response');
  assert(responses1.length === 1, 'respondió por invoke_agent.response (no por agent.execute.response)');
  assert(responses1[0]?.data?.request_id === 'req-001', 'request_id propagado');
  assert(responses1[0]?.data?.result?.agent === agentName, 'result.agent es el agente correcto');
  assert(responses1[0]?.data?.session_id === null, 'session_id null por defecto');
  assert(responses1[0]?.data?.should_continue === false, 'should_continue=false por defecto');

  const wrongResponses1 = published.filter(p => p.event === 'agent.execute.response');
  assert(wrongResponses1.length === 0, 'NO publicó agent.execute.response (sería bug)');

  // -------- TEST 2: agent.execute.request (path módulos) --------
  console.log('\n[2] agent.execute.request (path event-driven de módulos)');
  published.length = 0;
  await mod.onAgentExecuteRequest({ data: {
    request_id: 'req-002',
    agent_name: agentName,  // soporta tanto agent_name como agentName
    task: 'Tarea desde módulo',
    context: { project_id: 'p2' }
  }});
  await new Promise(r => setTimeout(r, 50));

  const responses2 = published.filter(p => p.event === 'agent.execute.response');
  assert(responses2.length === 1, 'respondió por agent.execute.response (no por invoke_agent.response)');
  assert(responses2[0]?.data?.request_id === 'req-002', 'request_id propagado');
  assert(responses2[0]?.data?.result?.agent === agentName, 'result.agent es el agente correcto');

  const wrongResponses2 = published.filter(p => p.event === 'invoke_agent.response');
  assert(wrongResponses2.length === 0, 'NO publicó invoke_agent.response (sería bug)');

  // -------- TEST 3: agente desconocido --------
  console.log('\n[3] agente desconocido devuelve error en el evento correcto');
  published.length = 0;
  await mod.onAgentExecuteRequest({ data: {
    request_id: 'req-003',
    agent_name: 'no-existe',
    task: 'esto va a fallar'
  }});
  await new Promise(r => setTimeout(r, 50));

  const errorResponses = published.filter(p => p.event === 'agent.execute.response');
  assert(errorResponses.length === 1, 'publicó respuesta');
  assert(errorResponses[0]?.data?.error?.includes('no encontrado'), 'error indica agente no encontrado');
  assert(!errorResponses[0]?.data?.result, 'no hay result cuando hay error');

  // -------- TEST 4: cimentaciones para Fase 8 (session_id, prev_state, conversation_id) --------
  console.log('\n[4] cimentaciones Fase 8 (session_id se preserva, conversation_id dispara mensaje)');
  published.length = 0;
  await mod.onAgentExecuteRequest({ data: {
    request_id: 'req-004',
    agent_name: agentName,
    task: 'tarea con sesión',
    context: { project_id: 'p4' },
    session_id: 'sess-abc',
    prev_state: { paso: 3 },
    conversation_id: 'conv-xyz'
  }});
  await new Promise(r => setTimeout(r, 50));

  const llmReqs4 = published.filter(p => p.event === 'llm.complete.request');
  assert(llmReqs4[0]?.data?.system?.includes('sess-abc'), 'system prompt incluye session_id');
  assert(llmReqs4[0]?.data?.system?.includes('"paso": 3'), 'system prompt incluye prev_state');
  assert(llmReqs4[0]?.data?.conversation_id === 'conv-xyz', 'conversation_id pasado al LLM gateway');

  const responses4 = published.filter(p => p.event === 'agent.execute.response');
  assert(responses4[0]?.data?.session_id === 'sess-abc', 'session_id devuelto en respuesta');

  const chatMessages = published.filter(p => p.event === 'chat.assistant.saved');
  assert(chatMessages.length === 1, 'mensaje del agente publicado en chat (porque hay conversation_id)');
  assert(chatMessages[0]?.data?.metadata?.author?.kind === 'agent', 'metadata.author.kind=agent');
  assert(chatMessages[0]?.data?.metadata?.author?.id === agentName, 'metadata.author.id correcto');
  assert(chatMessages[0]?.data?.metadata?.block?.type === 'agent_intervention', 'block.type=agent_intervention');

  // -------- TEST 5: sin conversation_id NO se publica chat.assistant.saved --------
  console.log('\n[5] sin conversation_id, no se publica mensaje en chat');
  published.length = 0;
  await mod.onInvokeAgent({ data: {
    request_id: 'req-005',
    agent_name: agentName,
    task: 'sin conversation_id'
  }});
  await new Promise(r => setTimeout(r, 50));
  const chatMessages5 = published.filter(p => p.event === 'chat.assistant.saved');
  assert(chatMessages5.length === 0, 'NO se publicó chat.assistant.saved (no hay conversation_id)');

  // -------- TEST 6: backwards compat — `agentName` (camelCase) también funciona --------
  console.log('\n[6] compat: agentName en camelCase también se acepta');
  published.length = 0;
  await mod.onAgentExecuteRequest({ data: {
    request_id: 'req-006',
    agentName: agentName,  // camelCase, como lo usan los 6 módulos pizzepos
    task: 'compat test',
    context: { project_id: 'p6' }
  }});
  await new Promise(r => setTimeout(r, 50));
  const responses6 = published.filter(p => p.event === 'agent.execute.response');
  assert(responses6.length === 1, 'agentName camelCase también funcionó');
  assert(!responses6[0]?.data?.error, 'sin error');

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron`);
  console.log(`══════════════════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
