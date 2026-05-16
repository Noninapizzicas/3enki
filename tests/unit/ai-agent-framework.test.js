/**
 * Tests unitarios para ai-agent-framework tras migracion paso 4 de agent-flow.
 *
 * Foco:
 *  - onAgentExecuteRequest acepta shape canonico → publica agent.execute.response canonico.
 *  - (alias agentName retirado en paso 6 de agent-flow tras migracion completa de pizzepos consumers)
 *  - Validacion: sin agent_name → publica agent.execute.failed AGENT_INPUT_INVALID.
 *  - Validacion: agent no existe → publica agent.execute.failed AGENT_NOT_FOUND.
 *  - Validacion: sin task ni context → publica agent.execute.failed AGENT_INPUT_INVALID.
 *  - Payload de agent.execute.response VALIDA contra schema oficial.
 *  - Payload de agent.execute.failed VALIDA contra schema oficial.
 *  - SUCCESS: chat.assistant.saved se publica con shape canonico chat-flow cuando conversation_id presente.
 *  - LLM error → publica agent.execute.failed con error.code clasificado.
 *  - invoke_agent (legacy path) sigue funcionando — error como objeto { code, message }.
 *  - Clasificacion canonica de errores LLM cubre los codigos esperados.
 *
 * Ejecutar: node tests/unit/ai-agent-framework.test.js
 */

'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Ajv    = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const AiAgentFrameworkModule = require('../../modules/conversacion/ai-agent-framework/index.js');

function makeAjv() {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  // Cargar schemas agent-flow + chat-flow. _common.schema.json existe en ambos
  // subsistemas — los registramos con su $id (uno apunta a /chat-flow/_common.schema.json,
  // el otro a /agent-flow/_common.schema.json) para que los $ref relativos resuelvan
  // correctamente sin colision por nombre de archivo.
  for (const sub of ['agent-flow', 'chat-flow']) {
    const dir = path.resolve(__dirname, `../../arquitectura/decisiones/_schemas/${sub}`);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const schema = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      // Registrar bajo key namespaced (sub/filename) para evitar colisiones de nombres iguales
      ajv.addSchema(schema, `${sub}/${f}`);
    }
  }
  return ajv;
}

function makeMocks() {
  const logs = [];
  const published = [];
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const eventBus = { publish: async (event, payload) => { published.push([event, payload]); } };
  return { logs, published, logger, eventBus };
}

function instantiate(mocks, { agents, llmResult, llmError, mqttRequestImpl } = {}) {
  const m = new AiAgentFrameworkModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.basePromptText = 'BASE PROMPT';
  m.moduleLoader = { getToolsForAI: () => [] };
  m._conversationCache = new Map();
  m._conversationCacheTTL = 5 * 60 * 1000;
  // mqttRequest mockeado: por defecto devuelve conversation_id 'conv-default-<project>'.
  // Permite override por test via mqttRequestImpl.
  m.mqttRequest = mqttRequestImpl || (async (domain, action, payload) => {
    if (domain === 'project' && action === 'get-default-conversation') {
      return { conversation_id: 'conv-default-' + payload.project_id, created: false };
    }
    return null;
  });

  // Instalar agentes mockeados
  const defaultAgents = agents || [
    { name: 'recipe-analyzer', description: 'analiza recetas', scope: ['*'], tools: [],
      provider: 'auto', model: null, temperature: 0.7, max_tokens: 2000, timeout_ms: 5000,
      prompt_text: 'Eres un analizador de recetas.' }
  ];
  for (const a of defaultAgents) m.agents.set(a.name, a);

  // Override eventBus.publish para interceptar llm.complete.request y simular respuesta
  const originalPublish = mocks.eventBus.publish;
  mocks.eventBus.publish = async (event, payload) => {
    await originalPublish(event, payload);
    if (event === 'llm.complete.request') {
      // Simular respuesta del LLM. Contrato llm-flow: par success/failure
      // separados, eventos distintos, sin flag mixto.
      setImmediate(() => {
        if (llmError) {
          m.onLlmCompleteFailed({
            request_id: payload.request_id,
            error: llmError
          });
        } else {
          m.onLlmCompleteResponse({
            request_id: payload.request_id,
            content: llmResult?.content ?? 'respuesta del agente',
            tool_calls_executed: llmResult?.tool_calls_executed ?? [],
            model: llmResult?.model ?? 'deepseek-chat',
            provider: llmResult?.provider ?? 'deepseek',
            usage: llmResult?.usage ?? { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
          });
        }
      });
    }
  };

  return m;
}

function nextTick() { return new Promise(r => setImmediate(r)); }

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('ai-agent-framework — paso 4 migracion agent-flow v1.0.0\n');
  const ajv = makeAjv();
  const validateRequest  = ajv.getSchema('agent-flow/agent.execute.request.schema.json');
  const validateResponse = ajv.getSchema('agent-flow/agent.execute.response.schema.json');
  const validateFailed   = ajv.getSchema('agent-flow/agent.execute.failed.schema.json');
  // chat.assistant.saved aun no esta en el catalogo canonico chat-flow (drift por
  // omision del contrato). Cuando se canonice, este test añadira validacion contra
  // su schema oficial. Hoy se valida manualmente la presencia de los 5 campos canonicos.

  // Group 1 — onAgentExecuteRequest SUCCESS path

  await testAsync('onAgentExecuteRequest canonico → publica agent.execute.response canonico', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'corr-1',
      request_id: 'req-1',
      user_id: 'default',
      agent_name: 'recipe-analyzer',
      timestamp: '2026-05-03T10:00:00.000Z',
      task: 'analiza esta receta de paella'
    });
    await nextTick(); await nextTick();
    const ev = mocks.published.find(p => p[0] === 'agent.execute.response');
    assert.ok(ev, 'agent.execute.response publicado');
    assert.ok(!mocks.published.find(p => p[0] === 'agent.execute.failed'), 'no debe publicar failed en success');
    const payload = ev[1];
    assert.strictEqual(payload.correlation_id, 'corr-1');
    assert.strictEqual(payload.request_id, 'req-1');
    assert.strictEqual(payload.user_id, 'default');
    assert.strictEqual(payload.agent_name, 'recipe-analyzer');
    assert.strictEqual(payload.result.content, 'respuesta del agente');
    assert.strictEqual(payload.result.agent, 'recipe-analyzer', 'compat: result.agent presente para legacy consumers');
    assert.ok(Array.isArray(payload.result.tool_calls_executed));
    assert.ok(Array.isArray(payload.tool_calls_executed), 'tool_calls_executed a nivel raiz (canonico)');
    assert.ok(typeof payload.duration_ms === 'number');
    assert.ok(payload.timestamp);
    assert.deepStrictEqual(payload.tokens, { input: 10, output: 5, total: 15 });
  });

  await testAsync('agent.execute.response VALIDA contra schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'corr-v', request_id: 'req-v', user_id: 'default',
      agent_name: 'recipe-analyzer', project_id: 'proj-v', timestamp: '2026-05-03T10:00:00.000Z',
      task: 'analiza'
    });
    await nextTick(); await nextTick();
    const payload = mocks.published.find(p => p[0] === 'agent.execute.response')[1];
    const ok = validateResponse(payload);
    assert.ok(ok, `payload debe validar. errors: ${JSON.stringify(validateResponse.errors)}`);
  });

  // Group 2 — Validaciones de input

  await testAsync('sin agent_name → agent.execute.failed AGENT_INPUT_INVALID', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r-x', user_id: 'default',
      timestamp: '2026-05-03T10:00:00.000Z',
      task: 'algo'
      // sin agent_name
    });
    const ev = mocks.published.find(p => p[0] === 'agent.execute.failed');
    assert.ok(ev);
    assert.strictEqual(ev[1].error.code, 'AGENT_INPUT_INVALID');
    assert.ok(!mocks.published.find(p => p[0] === 'llm.complete.request'), 'no debe llamar al LLM');
  });

  await testAsync('agent no existe → agent.execute.failed AGENT_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r-x', user_id: 'default',
      agent_name: 'agente-fantasma',
      timestamp: '2026-05-03T10:00:00.000Z',
      task: 'algo'
    });
    const ev = mocks.published.find(p => p[0] === 'agent.execute.failed');
    assert.ok(ev);
    assert.strictEqual(ev[1].error.code, 'AGENT_NOT_FOUND');
  });

  await testAsync('sin task ni context → agent.execute.failed AGENT_INPUT_INVALID', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r-x', user_id: 'default',
      agent_name: 'recipe-analyzer',
      timestamp: '2026-05-03T10:00:00.000Z'
      // sin task ni context
    });
    const ev = mocks.published.find(p => p[0] === 'agent.execute.failed');
    assert.ok(ev);
    assert.strictEqual(ev[1].error.code, 'AGENT_INPUT_INVALID');
    assert.ok(/task o context/i.test(ev[1].error.message));
  });

  await testAsync('agent.execute.failed VALIDA contra schema oficial', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'c-v', request_id: 'r-v', user_id: 'default',
      agent_name: 'agente-fantasma', project_id: 'proj-v',
      timestamp: '2026-05-03T10:00:00.000Z',
      task: 'algo'
    });
    const payload = mocks.published.find(p => p[0] === 'agent.execute.failed')[1];
    const ok = validateFailed(payload);
    assert.ok(ok, `payload failed debe validar. errors: ${JSON.stringify(validateFailed.errors)}`);
  });

  // Group 3 — LLM error path

  await testAsync('LLM error → agent.execute.failed con error.code clasificado', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { llmError: 'credential resolve timeout: deepseek' });
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r-1', user_id: 'default',
      agent_name: 'recipe-analyzer',
      timestamp: '2026-05-03T10:00:00.000Z',
      task: 'algo'
    });
    await nextTick(); await nextTick();
    const ev = mocks.published.find(p => p[0] === 'agent.execute.failed');
    assert.ok(ev);
    assert.strictEqual(ev[1].error.code, 'CREDENTIAL_NOT_FOUND');
  });

  // Group 4 — Chat multi-participante

  await testAsync('SUCCESS con conversation_id NO publica chat.assistant.saved (delegado a agent-observer)', async () => {
    // Antes ai-agent-framework publicaba chat.assistant.saved adicional al
    // agent.execute.response. agent-observer (adaptador canonico agent-flow
    // → chat-flow) ya escucha agent.execute.response y traduce a
    // chat.assistant.saved. La doble emision causaba doble persistencia en
    // chat-io. Ahora ai-agent-framework solo publica agent.execute.response.
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'corr-chat', request_id: 'req-chat',
      user_id: 'user-7', project_id: 'proj-1', conversation_id: 'conv-99',
      agent_name: 'recipe-analyzer',
      timestamp: '2026-05-03T10:00:00.000Z',
      task: 'sugiere variantes'
    });
    await nextTick(); await nextTick();
    const chatEv = mocks.published.find(p => p[0] === 'chat.assistant.saved');
    assert.strictEqual(chatEv, undefined, 'chat.assistant.saved NO debe ser publicado desde ai-agent-framework');
    const agentResp = mocks.published.find(p => p[0] === 'agent.execute.response');
    assert.ok(agentResp, 'agent.execute.response sigue publicandose');
    assert.strictEqual(agentResp[1].conversation_id, 'conv-99');
    assert.strictEqual(agentResp[1].project_id, 'proj-1');
  });

  // Group 5 — Legacy invoke_agent path sigue funcionando

  await testAsync('invoke_agent (legacy) → publica invoke_agent.response con error como objeto', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onInvokeAgent({
      request_id: 'req-leg',
      agent_name: 'agente-fantasma',  // no existe
      task: 'algo'
    });
    const ev = mocks.published.find(p => p[0] === 'invoke_agent.response');
    assert.ok(ev);
    assert.strictEqual(typeof ev[1].error, 'object', 'error es objeto, no string');
    assert.strictEqual(ev[1].error.code, 'AGENT_NOT_FOUND');
    assert.ok(!mocks.published.find(p => p[0] === 'agent.execute.response'), 'no debe publicar el evento canonico');
    assert.ok(!mocks.published.find(p => p[0] === 'agent.execute.failed'), 'no debe publicar el evento canonico failed');
  });

  // Group 6 — Clasificacion de errores

  await testAsync('clasificacion canonica de errores LLM cubre codigos esperados', async () => {
    const m = instantiate(makeMocks());
    const cases = [
      ['credential resolve timeout: deepseek', 'CREDENTIAL_NOT_FOUND'],
      ['No hay providers disponibles', 'CREDENTIAL_NOT_FOUND'],
      ['ETIMEDOUT', 'UPSTREAM_TIMEOUT'],
      ['429 rate limit', 'UPSTREAM_RATE_LIMITED'],
      ['401 unauthorized', 'UPSTREAM_AUTH_FAILED'],
      ['500 Internal Server Error', 'UPSTREAM_5XX'],
      ['ECONNREFUSED', 'UPSTREAM_UNREACHABLE'],
      ['unexpected token < in JSON', 'UPSTREAM_INVALID_RESPONSE'],
      ['weird unknown', 'UNKNOWN_ERROR']
    ];
    for (const [msg, expected] of cases) {
      const got = m._classifyLlmError(msg).code;
      assert.strictEqual(got, expected, `${msg} → esperaba ${expected}, fue ${got}`);
    }
  });

  // Group 7 — Modelo "una via fija": resolucion canonica de conversation_id

  await testAsync('resolucion: request CON project_id SIN conversation_id resuelve a conversation_default del proyecto', async () => {
    const mocks = makeMocks();
    const calls = [];
    const m = instantiate(mocks, {
      mqttRequestImpl: async (domain, action, payload) => {
        calls.push({ domain, action, payload });
        return { conversation_id: 'conv-canonica-de-proj-1', created: false };
      }
    });
    await m.onAgentExecuteRequest({
      correlation_id: 'corr-r', request_id: 'req-r', user_id: 'system',
      agent_name: 'recipe-analyzer', timestamp: '2026-05-03T10:00:00.000Z',
      task: 'analiza',
      project_id: 'proj-1'
      // sin conversation_id
    });
    await nextTick(); await nextTick();
    // Verificar que se llamo a project-manager
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].domain, 'project');
    assert.strictEqual(calls[0].action, 'get-default-conversation');
    assert.strictEqual(calls[0].payload.project_id, 'proj-1');
    // Verificar que el response publicado incluye la conversation_id resuelta
    const ev = mocks.published.find(p => p[0] === 'agent.execute.response');
    assert.ok(ev, 'response publicado');
    assert.strictEqual(ev[1].conversation_id, 'conv-canonica-de-proj-1');
  });

  await testAsync('resolucion: request CON conversation_id explicita NO consulta project-manager', async () => {
    const mocks = makeMocks();
    const calls = [];
    const m = instantiate(mocks, {
      mqttRequestImpl: async (domain, action, payload) => {
        calls.push({ domain, action, payload });
        return { conversation_id: 'NO_DEBERIA_USARSE' };
      }
    });
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r', user_id: 'u',
      agent_name: 'recipe-analyzer', timestamp: '2026-05-03T10:00:00.000Z',
      task: 'analiza',
      project_id: 'proj-1',
      conversation_id: 'conv-humana-explicita'
    });
    await nextTick(); await nextTick();
    assert.strictEqual(calls.length, 0, 'no debe consultar project-manager si conversation_id viene en input');
    const ev = mocks.published.find(p => p[0] === 'agent.execute.response');
    assert.strictEqual(ev[1].conversation_id, 'conv-humana-explicita');
  });

  await testAsync('resolucion: cache in-memory evita mqttRequest repetido para el mismo project_id', async () => {
    const mocks = makeMocks();
    let calls = 0;
    const m = instantiate(mocks, {
      mqttRequestImpl: async () => {
        calls++;
        return { conversation_id: 'conv-default-cached' };
      }
    });
    // Primera invocacion: hace mqttRequest
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r1', user_id: 'u',
      agent_name: 'recipe-analyzer', timestamp: '2026-05-03T10:00:00.000Z',
      task: 't', project_id: 'proj-cache'
    });
    await nextTick(); await nextTick();
    // Segunda invocacion al mismo project_id: NO debe hacer mqttRequest (cache hit)
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r2', user_id: 'u',
      agent_name: 'recipe-analyzer', timestamp: '2026-05-03T10:00:01.000Z',
      task: 't', project_id: 'proj-cache'
    });
    await nextTick(); await nextTick();
    assert.strictEqual(calls, 1, 'mqttRequest llamado solo una vez gracias al cache');
    const responses = mocks.published.filter(p => p[0] === 'agent.execute.response');
    assert.strictEqual(responses.length, 2);
    assert.strictEqual(responses[0][1].conversation_id, 'conv-default-cached');
    assert.strictEqual(responses[1][1].conversation_id, 'conv-default-cached');
  });

  await testAsync('resolucion: si mqttRequest falla, agente continua sin conversation_id (degradacion graceful)', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, {
      mqttRequestImpl: async () => { throw new Error('project-manager unavailable'); }
    });
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r-fail', user_id: 'u',
      agent_name: 'recipe-analyzer', timestamp: '2026-05-03T10:00:00.000Z',
      task: 't', project_id: 'proj-x'
    });
    await nextTick(); await nextTick();
    const ev = mocks.published.find(p => p[0] === 'agent.execute.response');
    assert.ok(ev, 'response publicado pese al fallo de resolucion');
    assert.strictEqual(ev[1].conversation_id, undefined, 'conversation_id ausente — agent-observer simplemente no renderiza');
    // El warn de fallo de resolucion deberia estar en logs
    const warn = mocks.logs.find(l => l[1] === 'ai-agent-framework.resolve_conversation.failed');
    assert.ok(warn, 'warn registrado por fallo de resolucion');
  });

  await testAsync('resolucion: sin project_id NO se intenta resolver conversation_id', async () => {
    const mocks = makeMocks();
    let calls = 0;
    const m = instantiate(mocks, {
      mqttRequestImpl: async () => { calls++; return { conversation_id: 'NO' }; }
    });
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'r-np', user_id: 'u',
      agent_name: 'recipe-analyzer', timestamp: '2026-05-03T10:00:00.000Z',
      task: 't'
      // sin project_id ni conversation_id
    });
    await nextTick(); await nextTick();
    assert.strictEqual(calls, 0, 'no debe consultar sin project_id');
  });

  console.log('\nai-agent-framework: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });
