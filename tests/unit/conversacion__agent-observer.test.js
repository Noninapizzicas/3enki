/**
 * Tests unitarios — conversacion__agent-observer (POC2 reescritura).
 *
 * Ejecutar: node tests/unit/conversacion__agent-observer.test.js
 */

'use strict';

const assert = require('assert');
const AgentObserverModule = require('../../modules/conversacion/agent-observer/index.js');

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

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new AgentObserverModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    config: opts.config || {}
  });
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
      request_id: overrides.request_id || 'req-1',
      conversation_id: overrides.conversation_id || 'conv-1',
      agent_name: overrides.agent_name || 'tester',
      correlation_id: overrides.correlation_id || 'cid-1',
      project_id: overrides.project_id !== undefined ? overrides.project_id : 'proj-1',
      task: overrides.task || 'do something',
      ...overrides
    }
  };
}

(async () => {
  console.log('conversacion__agent-observer — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'agent-observer');
    assert.strictEqual(m.version, '2.0.0');
    assert.strictEqual(m.openCards.size, 0);
    await m.onUnload();
  });

  await testAsync('onUnload limpia openCards', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    m.openCards.set('x', { agent_name: 'x' });
    await m.onUnload();
    assert.strictEqual(m.openCards.size, 0);
  });

  // Group 2: Bus handlers
  await testAsync('onAgentExecuteRequest publica chat.assistant.saved status=open + abre card', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest(makeRequest());
    assert.strictEqual(m.openCards.size, 1);
    const evs = publishedOf(mocks, 'chat.assistant.saved');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].correlation_id, 'cid-1');
    assert.strictEqual(evs[0].project_id, 'proj-1');
    assert.ok(evs[0].timestamp);
    const meta = JSON.parse(evs[0].metadata);
    assert.strictEqual(meta.author.kind, 'agent');
    assert.strictEqual(meta.block.type, 'agent_intervention');
    assert.strictEqual(meta.block.status, 'open');
    assert.ok(meta.block.started_at);
    await m.onUnload();
  });

  await testAsync('onAgentExecuteResponse publica status=closed + cierra card', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest(makeRequest());
    await m.onAgentExecuteResponse({
      data: {
        request_id: 'req-1', conversation_id: 'conv-1', agent_name: 'tester',
        correlation_id: 'cid-1', project_id: 'proj-1',
        result: { content: 'resultado del agente' },
        duration_ms: 1234,
        tool_calls_executed: ['x']
      }
    });
    assert.strictEqual(m.openCards.size, 0);
    const evs = publishedOf(mocks, 'chat.assistant.saved');
    assert.strictEqual(evs.length, 2);
    const meta = JSON.parse(evs[1].metadata);
    assert.strictEqual(meta.block.status, 'closed');
    assert.strictEqual(meta.block.duration_ms, 1234);
    assert.deepStrictEqual(meta.block.tool_calls_executed, ['x']);
    await m.onUnload();
  });

  await testAsync('onAgentExecuteFailed publica status=failed + cierra card', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest(makeRequest());
    await m.onAgentExecuteFailed({
      data: {
        request_id: 'req-1', conversation_id: 'conv-1', agent_name: 'tester',
        correlation_id: 'cid-1', project_id: 'proj-1',
        error: { code: 'TOOL_FAILED', message: 'tool x rompio' },
        duration_ms: 99,
        provider_attempted: 'deepseek'
      }
    });
    assert.strictEqual(m.openCards.size, 0);
    const evs = publishedOf(mocks, 'chat.assistant.saved');
    const meta = JSON.parse(evs[1].metadata);
    assert.strictEqual(meta.block.status, 'failed');
    assert.deepStrictEqual(meta.block.error, { code: 'TOOL_FAILED', message: 'tool x rompio' });
    assert.strictEqual(meta.block.provider_attempted, 'deepseek');
    await m.onUnload();
  });

  await testAsync('onAgentExecuteProgress muta tarjeta sin crear card nueva', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest(makeRequest());
    await m.onAgentExecuteProgress({
      data: {
        request_id: 'req-1', conversation_id: 'conv-1', agent_name: 'tester',
        correlation_id: 'cid-1',
        step: 'thinking', message: 'analizando contexto'
      }
    });
    assert.strictEqual(m.openCards.size, 1);
    const evs = publishedOf(mocks, 'chat.assistant.saved');
    assert.strictEqual(evs.length, 2);
    const meta = JSON.parse(evs[1].metadata);
    assert.strictEqual(meta.block.status, 'open');
    assert.strictEqual(meta.block.step, 'thinking');
    await m.onUnload();
  });

  // Group 3: Politica fail-silent
  await testAsync('sin conversation_id NO publica nada (fail-silent)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest({ data: { request_id: 'r1', agent_name: 'x', correlation_id: 'c' } });
    assert.strictEqual(m.openCards.size, 0);
    assert.strictEqual(publishedOf(mocks, 'chat.assistant.saved').length, 0);
    await m.onUnload();
  });

  await testAsync('config.enabled=false desactiva todo handler', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { enabled: false } });
    await m.onAgentExecuteRequest(makeRequest());
    assert.strictEqual(m.openCards.size, 0);
    assert.strictEqual(publishedOf(mocks, 'chat.assistant.saved').length, 0);
    await m.onUnload();
  });

  await testAsync('progress sobre card inexistente no publica', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteProgress({
      data: { request_id: 'unknown', conversation_id: 'c1', agent_name: 'x', step: 'thinking' }
    });
    assert.strictEqual(publishedOf(mocks, 'chat.assistant.saved').length, 0);
    await m.onUnload();
  });

  // Group 4: Filtro min_message_for_progress
  await testAsync('progress step=started filtrado cuando min=thinking', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { min_message_for_progress: 'thinking' } });
    await m.onAgentExecuteRequest(makeRequest());
    mocks.published.length = 0;
    await m.onAgentExecuteProgress({
      data: { request_id: 'req-1', conversation_id: 'conv-1', agent_name: 'tester', step: 'started' }
    });
    assert.strictEqual(publishedOf(mocks, 'chat.assistant.saved').length, 0);
    await m.onUnload();
  });

  await testAsync('progress step=thinking pasa filtro default', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onAgentExecuteRequest(makeRequest());
    mocks.published.length = 0;
    await m.onAgentExecuteProgress({
      data: { request_id: 'req-1', conversation_id: 'conv-1', agent_name: 'tester', step: 'thinking' }
    });
    assert.strictEqual(publishedOf(mocks, 'chat.assistant.saved').length, 1);
    await m.onUnload();
  });

  // Group 5: Truncate + detail_voluminoso
  await testAsync('content corto NO marca detail_voluminoso', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { summary_max_chars: 100 } });
    await m.onAgentExecuteRequest(makeRequest());
    await m.onAgentExecuteResponse({
      data: {
        request_id: 'req-1', conversation_id: 'conv-1', agent_name: 'tester',
        correlation_id: 'cid-1',
        result: { content: 'corto' }
      }
    });
    const evs = publishedOf(mocks, 'chat.assistant.saved');
    const meta = JSON.parse(evs[1].metadata);
    assert.strictEqual(meta.block.detail_url, undefined);
    await m.onUnload();
  });

  await testAsync('content largo marca detail_voluminoso + detail_url', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { summary_max_chars: 50 } });
    await m.onAgentExecuteRequest(makeRequest());
    const longContent = 'x'.repeat(200);
    await m.onAgentExecuteResponse({
      data: {
        request_id: 'req-1', conversation_id: 'conv-1', agent_name: 'tester',
        correlation_id: 'cid-1',
        result: { content: longContent }
      }
    });
    const evs = publishedOf(mocks, 'chat.assistant.saved');
    const meta = JSON.parse(evs[1].metadata);
    assert.strictEqual(meta.block.detail_url, '/agent/intervention/req-1/detail');
    await m.onUnload();
  });

  await testAsync('_truncate respeta limite + caracter elipsis', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._truncate('hola', 10), 'hola');
    assert.strictEqual(m._truncate('abcdefghijk', 5), 'abcd…');
    assert.strictEqual(m._truncate(null, 5), '');
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

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('not found')), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('timeout fired')), { status: 504, code: 'TIMEOUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('boom')), { status: 500, code: 'UNKNOWN_ERROR' });
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

  await testAsync('_handleHandlerError mapea status y emite metric agent-observer.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'), 'subscribe');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'agent-observer.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  console.log('\nTodos los tests pasaron.');
})().catch(e => { console.error(e); process.exit(1); });
