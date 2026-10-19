/**
 * Tests unitarios para agent-observer.
 *
 * Foco:
 *  - onAgentExecuteRequest con conversation_id → publica chat.assistant.saved
 *    con metadata.block.type='agent_intervention' y status='open'.
 *  - onAgentExecuteRequest sin conversation_id → NO publica nada.
 *  - onAgentExecuteProgress actualiza la tarjeta abierta (correlacionado por
 *    request_id) — el frontend muta la misma card.
 *  - onAgentExecuteResponse cierra la tarjeta con status='closed' y resumen.
 *  - onAgentExecuteFailed cierra la tarjeta con status='failed' + error.
 *  - Detalle voluminoso (>summary_max_chars) pone block.detail_url.
 *  - config.enabled=false desactiva el modulo (no publica).
 *  - Si una progress llega sin tarjeta abierta (no vimos el request), se ignora.
 *
 * Ejecutar: node tests/unit/agent-observer.test.js
 */

'use strict';

const assert = require('assert');

const AgentObserverModule = require('../../modules/conversacion/agent-observer/index.js');

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

function instantiate(mocks, configOverride = {}) {
  const m = new AgentObserverModule();
  m.logger   = mocks.logger;
  m.eventBus = mocks.eventBus;
  m.config   = { enabled: true, summary_max_chars: 280, min_message_for_progress: 'thinking', ...configOverride };
  return m;
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

(async () => {
  console.log('agent-observer — patron agente-vive-en-chat\n');

  await testAsync('onAgentExecuteRequest con conversation_id publica card open', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'corr-1', request_id: 'req-1', user_id: 'default',
      agent_name: 'cartadigital-composer', timestamp: '2026-05-03T10:00:00.000Z',
      task: 'Recomponer carta', conversation_id: 'conv-99', project_id: 'proj-1'
    });
    const ev = mocks.published.find(p => p[0] === 'chat.assistant.saved');
    assert.ok(ev, 'chat.assistant.saved publicado');
    assert.strictEqual(ev[1].conversation_id, 'conv-99');
    assert.strictEqual(ev[1].project_id, 'proj-1');
    assert.strictEqual(ev[1].correlation_id, 'corr-1');
    const meta = JSON.parse(ev[1].metadata);
    assert.strictEqual(meta.author.kind, 'agent');
    assert.strictEqual(meta.author.id, 'cartadigital-composer');
    assert.strictEqual(meta.block.type, 'agent_intervention');
    assert.strictEqual(meta.block.status, 'open');
    assert.strictEqual(meta.block.request_id, 'req-1');
    assert.ok(/cartadigital-composer iniciando/.test(ev[1].assistant_message));
  });

  await testAsync('onAgentExecuteRequest SIN conversation_id NO publica nada', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'corr-x', request_id: 'req-x', user_id: 'default',
      agent_name: 'agente-cron', timestamp: '2026-05-03T10:00:00.000Z',
      task: 'tarea automatica'
    });
    assert.strictEqual(mocks.published.length, 0);
  });

  await testAsync('onAgentExecuteProgress actualiza card abierta con step', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    // Abrir card
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'req-2', user_id: 'u', agent_name: 'recipe-analyzer',
      timestamp: '2026-05-03T10:00:00.000Z', task: 'analiza', conversation_id: 'conv-1'
    });
    // Reset publishes para ver solo lo del progress
    mocks.published.length = 0;
    await m.onAgentExecuteProgress({
      correlation_id: 'c', request_id: 'req-2', user_id: 'u', agent_name: 'recipe-analyzer',
      timestamp: '2026-05-03T10:00:01.000Z', step: 'tool_call', tool_invoked: 'tarifas.assign',
      conversation_id: 'conv-1'
    });
    const ev = mocks.published.find(p => p[0] === 'chat.assistant.saved');
    assert.ok(ev, 'progress publicado como chat.assistant.saved');
    const meta = JSON.parse(ev[1].metadata);
    assert.strictEqual(meta.block.status, 'open', 'card sigue abierta');
    assert.strictEqual(meta.block.step, 'tool_call');
    assert.strictEqual(meta.block.tool_invoked, 'tarifas.assign');
    assert.ok(/Llamando a tarifas\.assign/.test(ev[1].assistant_message));
  });

  await testAsync('onAgentExecuteProgress sin tarjeta abierta NO publica', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteProgress({
      correlation_id: 'c', request_id: 'req-fantasma', user_id: 'u', agent_name: 'X',
      timestamp: '2026-05-03T10:00:00.000Z', step: 'thinking', conversation_id: 'conv-1'
    });
    assert.strictEqual(mocks.published.length, 0, 'sin card previa no publica');
  });

  await testAsync('onAgentExecuteResponse cierra card con status=closed y resumen', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'req-r', user_id: 'u', agent_name: 'menu-structurer',
      timestamp: '2026-05-03T10:00:00.000Z', task: 'estructura', conversation_id: 'conv-9', project_id: 'p'
    });
    mocks.published.length = 0;
    await m.onAgentExecuteResponse({
      correlation_id: 'c', request_id: 'req-r', user_id: 'u', agent_name: 'menu-structurer',
      timestamp: '2026-05-03T10:00:05.000Z', conversation_id: 'conv-9', project_id: 'p',
      result: { content: 'Carta estructurada con 3 categorias y 12 platos.' },
      duration_ms: 4500
    });
    const ev = mocks.published.find(p => p[0] === 'chat.assistant.saved');
    assert.ok(ev);
    const meta = JSON.parse(ev[1].metadata);
    assert.strictEqual(meta.block.status, 'closed');
    assert.strictEqual(meta.block.duration_ms, 4500);
    assert.ok(meta.block.ended_at);
    assert.strictEqual(ev[1].assistant_message, 'Carta estructurada con 3 categorias y 12 platos.');
    // Card limpiada
    assert.strictEqual(m.openCards.size, 0);
  });

  await testAsync('onAgentExecuteResponse con result voluminoso pone block.detail_url', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { summary_max_chars: 50 });
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'req-big', user_id: 'u', agent_name: 'A',
      timestamp: '2026-05-03T10:00:00.000Z', task: 't', conversation_id: 'conv-big'
    });
    mocks.published.length = 0;
    const longContent = 'x'.repeat(500);
    await m.onAgentExecuteResponse({
      correlation_id: 'c', request_id: 'req-big', user_id: 'u', agent_name: 'A',
      timestamp: '2026-05-03T10:00:05.000Z', conversation_id: 'conv-big',
      result: { content: longContent }, duration_ms: 100
    });
    const ev = mocks.published.find(p => p[0] === 'chat.assistant.saved');
    const meta = JSON.parse(ev[1].metadata);
    assert.ok(meta.block.detail_url, 'detail_url presente cuando content > summary_max_chars');
    assert.ok(ev[1].assistant_message.length <= 50, 'mensaje truncado');
    assert.ok(/…$/.test(ev[1].assistant_message), 'truncado con ellipsis');
  });

  await testAsync('onAgentExecuteFailed cierra card con status=failed y error legible', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'req-f', user_id: 'u', agent_name: 'broken-agent',
      timestamp: '2026-05-03T10:00:00.000Z', task: 't', conversation_id: 'conv-f'
    });
    mocks.published.length = 0;
    await m.onAgentExecuteFailed({
      correlation_id: 'c', request_id: 'req-f', user_id: 'u', agent_name: 'broken-agent',
      timestamp: '2026-05-03T10:00:01.000Z', conversation_id: 'conv-f',
      error: { code: 'UPSTREAM_TIMEOUT', message: 'Timeout esperando agente broken-agent' },
      duration_ms: 30000, provider_attempted: 'deepseek'
    });
    const ev = mocks.published.find(p => p[0] === 'chat.assistant.saved');
    assert.ok(ev);
    const meta = JSON.parse(ev[1].metadata);
    assert.strictEqual(meta.block.status, 'failed');
    assert.strictEqual(meta.block.error.code, 'UPSTREAM_TIMEOUT');
    assert.strictEqual(meta.block.provider_attempted, 'deepseek');
    assert.ok(/⚠️ broken-agent fall[oó] \(UPSTREAM_TIMEOUT\)/.test(ev[1].assistant_message));
    assert.strictEqual(m.openCards.size, 0, 'card limpiada tras failed');
  });

  await testAsync('config.enabled=false desactiva el modulo', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks, { enabled: false });
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'req', user_id: 'u', agent_name: 'A',
      timestamp: '2026-05-03T10:00:00.000Z', task: 't', conversation_id: 'conv'
    });
    assert.strictEqual(mocks.published.length, 0);
  });

  await testAsync('progress con step=started es ignorado por defecto (min=thinking)', async () => {
    const mocks = makeMocks();
    const m = instantiate(mocks);
    await m.onAgentExecuteRequest({
      correlation_id: 'c', request_id: 'req-st', user_id: 'u', agent_name: 'A',
      timestamp: '2026-05-03T10:00:00.000Z', task: 't', conversation_id: 'conv'
    });
    mocks.published.length = 0;
    await m.onAgentExecuteProgress({
      correlation_id: 'c', request_id: 'req-st', user_id: 'u', agent_name: 'A',
      timestamp: '2026-05-03T10:00:01.000Z', step: 'started', conversation_id: 'conv'
    });
    assert.strictEqual(mocks.published.length, 0, 'started filtrado por min_message_for_progress=thinking');
  });

  console.log('\nagent-observer: todos los tests pasaron ✓');
})().catch(err => { console.error(err); process.exit(1); });
