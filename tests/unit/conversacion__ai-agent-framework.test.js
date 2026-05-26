/**
 * Tests unitarios — conversacion__ai-agent-framework (POC2).
 *
 * Ejecutar: node tests/unit/conversacion__ai-agent-framework.test.js
 */

'use strict';

const assert = require('assert');
const AiAgentFrameworkModule = require('../../modules/conversacion/ai-agent-framework/index.js');

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];

  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };

  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  const moduleLoader = {
    toolsRegistry: new Map(),
    getToolsForAI: () => []
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus, moduleLoader };
}

async function instantiate(mocks, opts = {}) {
  const m = new AiAgentFrameworkModule();
  // Skip filesystem agent loading by overriding
  m._loadAgents = () => {};
  m._loadBasePrompt = () => { m.basePromptText = null; };
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleLoader: opts.moduleLoader !== undefined ? opts.moduleLoader : mocks.moduleLoader,
    mqttRequest: opts.mqttRequest || null,
    config: opts.config || {}
  });
  // Cargar agentes mock
  if (opts.agents) {
    for (const a of opts.agents) {
      m.agents.set(a.name, {
        name: a.name,
        description: a.description || '',
        scope: a.scope || ['*'],
        tools: a.tools || [],
        provider: a.provider || 'auto',
        model: a.model || null,
        temperature: a.temperature ?? 0.7,
        max_tokens: a.max_tokens || 2000,
        timeout_ms: a.timeout_ms || 5000,
        prompt_text: a.prompt_text || 'You are X'
      });
    }
  }
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

function makeRequest(overrides = {}) {
  return {
    data: {
      correlation_id: overrides.correlation_id || 'cid-1',
      request_id: overrides.request_id || 'req-1',
      agent_name: overrides.agent_name || 'tester',
      user_id: overrides.user_id || 'u1',
      project_id: overrides.project_id !== undefined ? overrides.project_id : 'p1',
      task: overrides.task || 'do',
      context: overrides.context || {},
      ...overrides
    }
  };
}

(async () => {
  console.log('conversacion__ai-agent-framework — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'ai-agent-framework');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.agents.size, 0);
    assert.strictEqual(m.pendingLlm.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia agentes + pending + cache + cancela timers', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      agents: [{ name: 'a1', timeout_ms: 60000 }]
    });
    m.pendingLlm.set('p1', { timeout: setTimeout(() => {}, 60000) });
    m._conversationCache.set('proj', { conversation_id: 'c', at: Date.now() });
    await m.onUnload();
    assert.strictEqual(m.agents.size, 0);
    assert.strictEqual(m.pendingLlm.size, 0);
    assert.strictEqual(m._conversationCache.size, 0);
  });

  await testAsync('moduleLoader.toolsRegistry recibe invoke_agent al cargar', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      agents: [{ name: 'a1', description: 'x', tools: ['foo'] }, { name: 'a2', description: 'y' }]
    });
    // Trigger registration manually since _loadAgents is overridden
    m._registerInvokeAgentTool();
    const tool = mocks.moduleLoader.toolsRegistry.get('invoke_agent');
    assert.ok(tool);
    assert.strictEqual(tool.name, 'invoke_agent');
    assert.strictEqual(tool.event_based, true);
    assert.deepStrictEqual(tool.parameters.properties.agent_name.enum, ['a1', 'a2']);
    await m.onUnload();
  });

  // Group 2: agent.execute.request validation
  await testAsync('request sin request_id se ignora con warn', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { agents: [{ name: 'tester' }] });
    await m.onAgentExecuteRequest({ data: { agent_name: 'tester', task: 'do' } });
    assert.strictEqual(publishedOf(mocks, 'agent.execute.failed').length, 0);
    assert.strictEqual(publishedOf(mocks, 'llm.complete.request').length, 0);
    await m.onUnload();
  });

  await testAsync('request sin agent_name publica agent.execute.failed INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest({ data: { request_id: 'r1', task: 'do' } });
    const failures = publishedOf(mocks, 'agent.execute.failed');
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('agent_name desconocido publica agent.execute.failed RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest(makeRequest({ agent_name: 'no-existe' }));
    const failures = publishedOf(mocks, 'agent.execute.failed');
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].error.code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(failures[0].correlation_id, 'cid-1');
    assert.strictEqual(failures[0].project_id, 'p1');
    await m.onUnload();
  });

  await testAsync('request sin task ni context publica INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { agents: [{ name: 'tester' }] });
    await m.onAgentExecuteRequest(makeRequest({ task: undefined, context: {} }));
    const failures = publishedOf(mocks, 'agent.execute.failed');
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  // Group 3: Dispatch flow
  await testAsync('request valido dispara llm.complete.request + progress started', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { agents: [{ name: 'tester' }] });
    await m.onAgentExecuteRequest(makeRequest());
    const llmReqs = publishedOf(mocks, 'llm.complete.request');
    assert.strictEqual(llmReqs.length, 1);
    assert.ok(llmReqs[0].system.includes('You are X'));
    assert.strictEqual(llmReqs[0].correlation_id, 'cid-1');
    const progressEvs = publishedOf(mocks, 'agent.execute.progress');
    assert.strictEqual(progressEvs.length, 1);
    assert.strictEqual(progressEvs[0].step, 'started');
    assert.strictEqual(m.pendingLlm.size, 1);
    // cleanup
    for (const p of m.pendingLlm.values()) clearTimeout(p.timeout);
    await m.onUnload();
  });

  // Group 4: llm.complete.response success
  await testAsync('llm response success publica solo agent.execute.response (chat.assistant.saved delegado a agent-observer)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { agents: [{ name: 'tester' }] });
    await m.onAgentExecuteRequest(makeRequest({ conversation_id: 'conv-1' }));
    const llmReqId = publishedOf(mocks, 'llm.complete.request')[0].request_id;

    await m.onLlmCompleteResponse({
      data: {
        request_id: llmReqId,
        content: 'respuesta del agente',
        tool_calls_executed: ['tool1'],
        provider: 'deepseek', model: 'deepseek-chat',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 }
      }
    });

    const responses = publishedOf(mocks, 'agent.execute.response');
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].agent_name, 'tester');
    assert.strictEqual(responses[0].result.content, 'respuesta del agente');
    assert.deepStrictEqual(responses[0].result.tool_calls_executed, ['tool1']);
    assert.deepStrictEqual(responses[0].tokens, { input: 100, output: 50, total: 150 });

    // chat.assistant.saved NO se publica desde ai-agent-framework (delegado a agent-observer)
    const chatSaved = publishedOf(mocks, 'chat.assistant.saved');
    assert.strictEqual(chatSaved.length, 0);

    const progressEvs = publishedOf(mocks, 'agent.execute.progress');
    assert.ok(progressEvs.some(p => p.step === 'finalizing'));
    await m.onUnload();
  });

  await testAsync('llm response sin conversation_id NO publica chat.assistant.saved', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { agents: [{ name: 'tester' }] });
    await m.onAgentExecuteRequest(makeRequest({ conversation_id: null, project_id: null }));
    const llmReqId = publishedOf(mocks, 'llm.complete.request')[0].request_id;
    await m.onLlmCompleteResponse({
      data: { request_id: llmReqId, content: 'x' }
    });
    assert.strictEqual(publishedOf(mocks, 'agent.execute.response').length, 1);
    assert.strictEqual(publishedOf(mocks, 'chat.assistant.saved').length, 0);
    await m.onUnload();
  });

  // Group 5: llm.complete.failed (par success/failure separados segun contrato llm-flow)
  await testAsync('llm response failure publica agent.execute.failed con codigo clasificado', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { agents: [{ name: 'tester' }] });
    await m.onAgentExecuteRequest(makeRequest());
    const llmReqId = publishedOf(mocks, 'llm.complete.request')[0].request_id;
    await m.onLlmCompleteFailed({
      data: { request_id: llmReqId, error: 'request timeout', provider: 'deepseek' }
    });
    const failures = publishedOf(mocks, 'agent.execute.failed');
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].error.code, 'UPSTREAM_TIMEOUT');
    assert.strictEqual(failures[0].provider_attempted, 'deepseek');
    await m.onUnload();
  });

  // Group 6: Legacy invoke_agent flow
  await testAsync('invoke_agent legacy flow publica invoke_agent.response (no canonico)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { agents: [{ name: 'tester' }] });
    await m.onInvokeAgent({ data: { request_id: 'leg-1', agent_name: 'tester', task: 'x' } });
    const llmReqId = publishedOf(mocks, 'llm.complete.request')[0].request_id;
    await m.onLlmCompleteResponse({
      data: { request_id: llmReqId, content: 'ok' }
    });
    assert.strictEqual(publishedOf(mocks, 'invoke_agent.response').length, 1);
    assert.strictEqual(publishedOf(mocks, 'agent.execute.response').length, 0);
    await m.onUnload();
  });

  await testAsync('invoke_agent legacy con agente desconocido publica invoke_agent.response error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onInvokeAgent({ data: { request_id: 'leg-2', agent_name: 'no-existe', task: 'x' } });
    const responses = publishedOf(mocks, 'invoke_agent.response');
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  // Group 7: Helpers POC2
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout')), { status: 504, code: 'UPSTREAM_TIMEOUT' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id, project_id y agrega timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    const r = await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-z', project_id: 'p-z' });
    assert.strictEqual(r.correlation_id, 'cid-z');
    assert.strictEqual(r.project_id, 'p-z');
    assert.ok(r.timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric ai-agent-framework.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'), 'subscribe');
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'ai-agent-framework.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  await testAsync('_classifyLlmError clasifica errores LLM canonicamente', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyLlmError('429 rate limit').code, 'UPSTREAM_INVALID_RESPONSE');
    assert.strictEqual(m._classifyLlmError('401 unauthorized').code, 'UPSTREAM_INVALID_RESPONSE');
    assert.strictEqual(m._classifyLlmError('credential not found').code, 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyLlmError('boom').code, 'UNKNOWN_ERROR');
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
