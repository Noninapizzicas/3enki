/**
 * Tests unitarios — scripts/audit-helpers/analyze-session.js
 * Ejecutar: node tests/unit/audit-helpers-analyze-session.test.js
 *
 * Fixtures sinteticas (sin red, sin disco). Cubrimos:
 *  - parseArgs
 *  - excerpt / tsToMs (helpers)
 *  - loadCapture (JSONL multi-linea + linea malformada)
 *  - filterByConversation
 *  - moduleOfEvent / buildEventsByModule
 *  - findOrphans (request sin response, request sin request_id, request con response OK no es orphan)
 *  - findErrorsAndWarnings (capture .failed + timeline error/warning)
 *  - computeLatencies (request → response, request → failed)
 *  - computeCoverage (modules, tools, agents)
 *  - extractTurns (turno completo + turno sin assistant)
 *  - analyze (top-level integracion con shape canonico audit-session-analysis-v1)
 */

'use strict';

const assert = require('assert');

const a = require('../../scripts/audit-helpers/analyze-session.js');

// --------------------------------------------------
// parseArgs
// --------------------------------------------------

(function testParseArgsAll() {
  const f = a.parseArgs([
    '--export', '/tmp/e.json',
    '--capture', '/tmp/c.jsonl',
    '--conversation', 'conv-1',
    '--out', '/tmp/out.json'
  ]);
  assert.strictEqual(f.export, '/tmp/e.json');
  assert.strictEqual(f.capture, '/tmp/c.jsonl');
  assert.strictEqual(f.conversation, 'conv-1');
  assert.strictEqual(f.out, '/tmp/out.json');
})();

(function testParseArgsHelp() {
  assert.strictEqual(a.parseArgs(['--help']).help, true);
})();

// --------------------------------------------------
// excerpt
// --------------------------------------------------

(function testExcerptShortString() {
  assert.strictEqual(a.excerpt('hola mundo'), 'hola mundo');
})();

(function testExcerptLongString() {
  const long = 'X'.repeat(a.EXCERPT_MAX + 50);
  const e = a.excerpt(long);
  assert.ok(e.endsWith('…'));
  assert.strictEqual(e.length, a.EXCERPT_MAX + 1);
})();

(function testExcerptObject() {
  const obj = { foo: 'bar', n: 1 };
  assert.strictEqual(a.excerpt(obj), '{"foo":"bar","n":1}');
})();

(function testExcerptNull() {
  assert.strictEqual(a.excerpt(null), null);
})();

// --------------------------------------------------
// tsToMs
// --------------------------------------------------

(function testTsToMs() {
  assert.strictEqual(a.tsToMs('2026-05-26T10:00:00.000Z'), Date.parse('2026-05-26T10:00:00.000Z'));
  assert.strictEqual(a.tsToMs(null), null);
  assert.strictEqual(a.tsToMs('garbage'), null);
})();

// --------------------------------------------------
// loadCapture
// --------------------------------------------------

(function testLoadCaptureValid() {
  const jsonl = [
    JSON.stringify({ event_id: 'e1', event_type: 'a.b.creada' }),
    JSON.stringify({ event_id: 'e2', event_type: 'a.b.actualizada' })
  ].join('\n');
  const out = a.loadCapture(jsonl);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].event_id, 'e1');
})();

(function testLoadCaptureMalformedLine() {
  const jsonl = [
    JSON.stringify({ event_id: 'e1' }),
    'not json',
    JSON.stringify({ event_id: 'e2' })
  ].join('\n');
  const out = a.loadCapture(jsonl);
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].event_id, 'e1');
  assert.ok(out[1]._parse_error);
  assert.strictEqual(out[1]._raw, 'not json');
  assert.strictEqual(out[2].event_id, 'e2');
})();

(function testLoadCaptureEmpty() {
  assert.deepStrictEqual(a.loadCapture(''), []);
})();

// --------------------------------------------------
// filterByConversation
// --------------------------------------------------

(function testFilterByConversation() {
  const events = [
    { event_type: 'a.creada', data: { conversation_id: 'conv-1' } },
    { event_type: 'a.actualizada', data: { conversation_id: 'conv-2' } },
    { event_type: 'a.eliminada', data: { session_id: 'conv-1' } },
    { event_type: 'a.huerfana', data: {} }
  ];
  const filtered = a.filterByConversation(events, 'conv-1');
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].event_type, 'a.creada');
  assert.strictEqual(filtered[1].event_type, 'a.eliminada');
})();

(function testFilterByConversationNullId() {
  const events = [{ event_type: 'a', data: {} }];
  assert.strictEqual(a.filterByConversation(events, null).length, 1);
})();

// --------------------------------------------------
// moduleOfEvent / buildEventsByModule
// --------------------------------------------------

(function testModuleOfEventFromSource() {
  assert.strictEqual(a.moduleOfEvent({ source: { module_id: 'recetas' }, event_type: 'recetas.creada' }), 'recetas');
})();

(function testModuleOfEventFromTypePrefix() {
  assert.strictEqual(a.moduleOfEvent({ event_type: 'escandallo.calculado' }), 'escandallo');
})();

(function testBuildEventsByModule() {
  const events = [
    { source: { module_id: 'recetas' }, event_type: 'recetas.creada' },
    { source: { module_id: 'recetas' }, event_type: 'recetas.creada' },
    { source: { module_id: 'recetas' }, event_type: 'recetas.actualizada' },
    { event_type: 'escandallo.calculado' }
  ];
  const out = a.buildEventsByModule(events);
  assert.strictEqual(out.recetas.count, 3);
  assert.strictEqual(out.recetas.event_types['recetas.creada'], 2);
  assert.strictEqual(out.escandallo.count, 1);
})();

// --------------------------------------------------
// findOrphans
// --------------------------------------------------

(function testFindOrphansRequestSinResponse() {
  const events = [
    { event_type: 'fs.read.request', event_id: 'e1', data: { request_id: 'r1' }, _captured_at: '2026-05-26T10:00:00.000Z' },
    { event_type: 'fs.write.request', event_id: 'e2', data: { request_id: 'r2' }, _captured_at: '2026-05-26T10:00:01.000Z' },
    { event_type: 'fs.read.response', data: { request_id: 'r1', content: '...' } }
  ];
  const orphans = a.findOrphans(events);
  assert.strictEqual(orphans.length, 1);
  assert.strictEqual(orphans[0].event_type, 'fs.write.request');
  assert.strictEqual(orphans[0].expected_response_event, 'fs.write.response');
  assert.ok(orphans[0].razon.includes('sin response'));
})();

(function testFindOrphansFailedTambienResuelve() {
  // Un .request resuelto por .failed NO es orphan.
  const events = [
    { event_type: 'fs.read.request', data: { request_id: 'r1' } },
    { event_type: 'fs.read.failed', data: { request_id: 'r1', error: { code: 'NOT_FOUND' } } }
  ];
  assert.strictEqual(a.findOrphans(events).length, 0);
})();

(function testFindOrphansRequestSinRequestId() {
  const events = [{ event_type: 'fs.read.request', data: {}, _captured_at: '2026-05-26T10:00:00.000Z' }];
  const orphans = a.findOrphans(events);
  assert.strictEqual(orphans.length, 1);
  assert.ok(orphans[0].razon.includes('sin request_id'));
})();

// --------------------------------------------------
// findErrorsAndWarnings
// --------------------------------------------------

(function testFindErrorsAndWarningsCapture() {
  const events = [
    {
      event_type: 'fs.read.failed',
      event_id: 'e1',
      data: { error: { code: 'NOT_FOUND', message: 'no file' } },
      source: { module_id: 'filesystem' },
      _captured_at: '2026-05-26T10:00:00.000Z'
    },
    { event_type: 'recetas.creada', data: {} }
  ];
  const out = a.findErrorsAndWarnings(events, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].source, 'bus_capture');
  assert.strictEqual(out[0].error_code, 'NOT_FOUND');
  assert.strictEqual(out[0].error_message, 'no file');
  assert.strictEqual(out[0].module, 'filesystem');
})();

(function testFindErrorsAndWarningsTimeline() {
  const exportData = {
    timeline: [
      { _type: 'warning', ts: '2026-05-26T10:00:01.000Z', module: 'ai-gateway', action: 'fallback', ctx: { reason: 'rate_limit' } },
      { _type: 'error', ts: '2026-05-26T10:00:00.000Z', module: 'agent-x', action: 'fail', ctx: { code: 'X' } },
      { _type: 'message', ts: '2026-05-26T10:00:02.000Z', role: 'user', content: 'hola' }
    ]
  };
  const out = a.findErrorsAndWarnings([], exportData);
  assert.strictEqual(out.length, 2);
  // Ordenados por ts asc
  assert.strictEqual(out[0].type, 'error');
  assert.strictEqual(out[1].type, 'warning');
})();

// --------------------------------------------------
// computeLatencies
// --------------------------------------------------

(function testComputeLatencies() {
  const events = [
    { event_type: 'fs.read.request', data: { request_id: 'r1' }, _captured_at: '2026-05-26T10:00:00.000Z' },
    { event_type: 'fs.read.response', data: { request_id: 'r1' }, _captured_at: '2026-05-26T10:00:00.500Z' },
    { event_type: 'fs.write.request', data: { request_id: 'r2' }, _captured_at: '2026-05-26T10:00:01.000Z' },
    { event_type: 'fs.write.failed', data: { request_id: 'r2', error: { code: 'X' } }, _captured_at: '2026-05-26T10:00:01.250Z' }
  ];
  const out = a.computeLatencies(events);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].request_id, 'r1');
  assert.strictEqual(out[0].delta_ms, 500);
  assert.strictEqual(out[0].outcome, 'response');
  assert.strictEqual(out[1].request_id, 'r2');
  assert.strictEqual(out[1].delta_ms, 250);
  assert.strictEqual(out[1].outcome, 'failed');
})();

// --------------------------------------------------
// computeCoverage
// --------------------------------------------------

(function testComputeCoverage() {
  const captureEvents = [
    { source: { module_id: 'recetas' }, event_type: 'recetas.creada' },
    { source: { module_id: 'escandallo' }, event_type: 'escandallo.calculado' }
  ];
  const exportData = {
    messages_raw: [
      { role: 'assistant', metadata: { tool_calls: [{ name: 'recetas.crear', status: 'ok' }] } },
      { role: 'assistant', metadata: { tool_calls_executed: [{ name: 'bus.publish' }] } }
    ],
    agent_executions: [
      { agent_name: 'recetas-experto' },
      { agent_name: 'planner' }
    ]
  };
  const out = a.computeCoverage(exportData, captureEvents);
  assert.deepStrictEqual(out.modules_emitted, ['escandallo', 'recetas']);
  assert.deepStrictEqual(out.tools_invoked, ['bus.publish', 'recetas.crear']);
  assert.deepStrictEqual(out.agents_executed, ['planner', 'recetas-experto']);
})();

// --------------------------------------------------
// extractTurns
// --------------------------------------------------

(function testExtractTurnsCompleto() {
  const exportData = {
    messages_raw: [
      { role: 'user', created_at: '2026-05-26T10:00:00.000Z', content: 'Crea una receta de tortilla' },
      {
        role: 'assistant',
        created_at: '2026-05-26T10:00:05.000Z',
        content: 'Receta creada con id rec-1.',
        metadata: { provider: 'anthropic', tool_calls: [{ name: 'recetas.crear', status: 'ok' }] }
      }
    ]
  };
  const captureEvents = [
    { event_type: 'chat.message.saved', _captured_at: '2026-05-26T10:00:00.100Z', data: {} },
    { event_type: 'recetas.creada', _captured_at: '2026-05-26T10:00:03.000Z', data: { receta_id: 'rec-1' }, source: { module_id: 'recetas' } },
    { event_type: 'ai.chat.response', _captured_at: '2026-05-26T10:00:04.900Z', data: {} }
  ];
  const turns = a.extractTurns(exportData, captureEvents);
  assert.strictEqual(turns.length, 1);
  const t = turns[0];
  assert.strictEqual(t.turn_index, 0);
  assert.strictEqual(t.user_message.content_excerpt, 'Crea una receta de tortilla');
  assert.ok(t.trigger_event);
  assert.strictEqual(t.trigger_event.event_type, 'chat.message.saved');
  assert.strictEqual(t.events.length, 3);
  assert.strictEqual(t.assistant_response.tool_calls_reported.length, 1);
  assert.strictEqual(t.assistant_response.tool_calls_reported[0].name, 'recetas.crear');
  assert.strictEqual(t.duration_ms, 5000);
  assert.deepStrictEqual(t.providers_used, ['anthropic']);
})();

(function testExtractTurnsSinAssistant() {
  // El turno fallo, no hay assistant message.
  const exportData = {
    messages_raw: [
      { role: 'user', created_at: '2026-05-26T10:00:00.000Z', content: 'hola' }
    ]
  };
  const captureEvents = [
    { event_type: 'ai.chat.failed', _captured_at: '2026-05-26T10:00:02.000Z', data: { error: { code: 'X' } } }
  ];
  const turns = a.extractTurns(exportData, captureEvents);
  assert.strictEqual(turns.length, 1);
  assert.strictEqual(turns[0].assistant_response, null);
  assert.strictEqual(turns[0].duration_ms, null);
  // Sin t1, todos los eventos posteriores a t0 entran al turno.
  assert.strictEqual(turns[0].events.length, 1);
})();

// --------------------------------------------------
// analyze (top-level)
// --------------------------------------------------

(function testAnalyzeShape() {
  const exportData = {
    _format: 'conversation-export-v2',
    session_id: 'conv-1',
    messages_raw: [
      { role: 'user', created_at: '2026-05-26T10:00:00.000Z', content: 'hola' },
      { role: 'assistant', created_at: '2026-05-26T10:00:02.000Z', content: 'mundo', metadata: { provider: 'kimi' } }
    ],
    agent_executions: [{ agent_name: 'planner' }]
  };
  const jsonl = [
    JSON.stringify({ event_type: 'chat.message.saved', _captured_at: '2026-05-26T10:00:00.100Z', data: { conversation_id: 'conv-1' }, source: { module_id: 'chat-io' } }),
    JSON.stringify({ event_type: 'fs.read.request', _captured_at: '2026-05-26T10:00:00.500Z', data: { conversation_id: 'conv-1', request_id: 'r1' }, source: { module_id: 'filesystem' } }),
    JSON.stringify({ event_type: 'fs.read.response', _captured_at: '2026-05-26T10:00:00.700Z', data: { conversation_id: 'conv-1', request_id: 'r1' }, source: { module_id: 'filesystem' } }),
    JSON.stringify({ event_type: 'ai.chat.response', _captured_at: '2026-05-26T10:00:01.900Z', data: { conversation_id: 'conv-1' }, source: { module_id: 'ai-gateway' } })
  ].join('\n');

  const result = a.analyze({
    exportData,
    captureLines: jsonl,
    conversationId: 'conv-1',
    exportPath: '/tmp/e.json',
    capturePath: '/tmp/c.jsonl'
  });

  assert.strictEqual(result._format, 'audit-session-analysis-v1');
  assert.ok(result._generated_at);
  assert.strictEqual(result.inputs.export_path, '/tmp/e.json');
  assert.strictEqual(result.inputs.capture_path, '/tmp/c.jsonl');
  assert.strictEqual(result.inputs.conversation_id, 'conv-1');

  assert.ok(result.window.started_at);
  assert.ok(result.window.ended_at);
  assert.strictEqual(typeof result.window.duration_ms, 'number');

  assert.strictEqual(result.turns.length, 1);
  assert.ok(result.events_by_module['chat-io']);
  assert.ok(result.events_by_module['filesystem']);
  assert.ok(result.events_by_module['ai-gateway']);

  assert.strictEqual(result.orphans.length, 0);
  assert.strictEqual(result.errors_and_warnings.length, 0);
  assert.strictEqual(result.latencies.length, 1);
  assert.strictEqual(result.latencies[0].delta_ms, 200);

  assert.ok(result.coverage.modules_emitted.includes('filesystem'));
  assert.deepStrictEqual(result.coverage.agents_executed, ['planner']);
})();

(function testAnalyzeFiltersByConversation() {
  const jsonl = [
    JSON.stringify({ event_type: 'a.creada', data: { conversation_id: 'conv-1' }, _captured_at: '2026-05-26T10:00:00.000Z' }),
    JSON.stringify({ event_type: 'a.creada', data: { conversation_id: 'conv-2' }, _captured_at: '2026-05-26T10:00:01.000Z' })
  ].join('\n');
  const result = a.analyze({
    exportData: { session_id: 'conv-1' },
    captureLines: jsonl,
    conversationId: 'conv-1'
  });
  // events_by_module debe contar 1, no 2
  const total = Object.values(result.events_by_module).reduce((s, m) => s + m.count, 0);
  assert.strictEqual(total, 1);
})();

console.log('OK audit-helpers-analyze-session');
