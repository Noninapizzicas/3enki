/**
 * Tests unitarios — scripts/audit-helpers/capture-bus.js
 * Ejecutar: node tests/unit/audit-helpers-capture-bus.test.js
 *
 * Cobertura:
 *  - parseArgs: posicionales + flags.
 *  - buildEntry: envelope canonico, parse_error, truncate del _raw.
 *  - run: suscripcion, escritura al stream, topic-filter, cierre por SIGINT virtual.
 */

'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');

const { parseArgs, buildEntry, run, RAW_TRUNCATE_BYTES } = require('../../scripts/audit-helpers/capture-bus.js');

// --------------------------------------------------
// parseArgs
// --------------------------------------------------

(function testParseArgsPositionalOnly() {
  const { positional, flags } = parseArgs(['/tmp/out.jsonl']);
  assert.deepStrictEqual(positional, ['/tmp/out.jsonl']);
  assert.deepStrictEqual(flags, {});
})();

(function testParseArgsWithFlags() {
  const { positional, flags } = parseArgs([
    '/tmp/out.jsonl',
    '--idle-timeout', '30000',
    '--max-duration', '120000',
    '--topic-filter', 'core/.+/events/receta'
  ]);
  assert.deepStrictEqual(positional, ['/tmp/out.jsonl']);
  assert.strictEqual(flags['idle-timeout'], '30000');
  assert.strictEqual(flags['max-duration'], '120000');
  assert.strictEqual(flags['topic-filter'], 'core/.+/events/receta');
})();

(function testParseArgsHelp() {
  const { flags } = parseArgs(['--help']);
  assert.strictEqual(flags.help, true);
})();

// --------------------------------------------------
// buildEntry
// --------------------------------------------------

(function testBuildEntryCanonicalEnvelope() {
  const envelope = {
    event_id: 'evt-1',
    event_type: 'recetas.creada',
    timestamp: '2026-05-26T10:00:00.000Z',
    source: { core_id: 'c1' },
    data: { request_id: 'r1', receta_id: 'rec-1', conversation_id: 'conv-1' },
    metadata: { duration_ms: 42 }
  };
  const entry = buildEntry(
    'core/c1/events/recetas/creada',
    Buffer.from(JSON.stringify(envelope)),
    '2026-05-26T10:00:00.123Z'
  );
  assert.strictEqual(entry._captured_at, '2026-05-26T10:00:00.123Z');
  assert.strictEqual(entry._topic, 'core/c1/events/recetas/creada');
  assert.strictEqual(entry.event_id, 'evt-1');
  assert.strictEqual(entry.event_type, 'recetas.creada');
  assert.strictEqual(entry.timestamp, '2026-05-26T10:00:00.000Z');
  assert.deepStrictEqual(entry.source, { core_id: 'c1' });
  assert.deepStrictEqual(entry.data, { request_id: 'r1', receta_id: 'rec-1', conversation_id: 'conv-1' });
  assert.deepStrictEqual(entry.metadata, { duration_ms: 42 });
  // El envelope original no se debe mutar — verifica que no haya campos espurios
  assert.strictEqual(Object.keys(entry).filter(k => k.startsWith('_')).length, 2, 'solo _captured_at y _topic con prefijo _');
})();

(function testBuildEntryParseError() {
  const entry = buildEntry(
    'core/c1/events/raw/garbage',
    Buffer.from('not json at all {{{'),
    '2026-05-26T10:00:01.000Z'
  );
  assert.strictEqual(entry._captured_at, '2026-05-26T10:00:01.000Z');
  assert.strictEqual(entry._topic, 'core/c1/events/raw/garbage');
  assert.ok(entry._parse_error, 'debe tener _parse_error');
  assert.strictEqual(entry._raw, 'not json at all {{{');
  assert.strictEqual(entry.event_type, undefined);
})();

(function testBuildEntryTruncatesLargeRaw() {
  const huge = 'X'.repeat(RAW_TRUNCATE_BYTES + 500) + '{{not_json';
  const entry = buildEntry('core/c1/events/junk', Buffer.from(huge), '2026-05-26T10:00:02.000Z');
  assert.ok(entry._parse_error);
  // Truncado debe ser exactamente RAW_TRUNCATE_BYTES + el sufijo "…[truncated]"
  assert.ok(entry._raw.endsWith('…[truncated]'), 'debe terminar con sufijo de truncado');
  // longitud del prefijo (antes del sufijo) === RAW_TRUNCATE_BYTES
  const prefix = entry._raw.slice(0, -'…[truncated]'.length);
  assert.strictEqual(prefix.length, RAW_TRUNCATE_BYTES);
})();

// --------------------------------------------------
// run — integracion con mocks
// --------------------------------------------------

function makeMockMqtt() {
  const client = new EventEmitter();
  client.subscribed = [];
  client.subscribe = (topic, cb) => {
    client.subscribed.push(topic);
    setImmediate(() => cb && cb(null));
  };
  client.end = () => { client.ended = true; };
  const factory = {
    connect: (broker, opts) => {
      factory.lastBroker = broker;
      factory.lastOpts = opts;
      setImmediate(() => client.emit('connect'));
      return client;
    },
    client
  };
  return factory;
}

function makeMockFs() {
  const writes = [];
  let endCallback = null;
  const stream = {
    write: (chunk) => { writes.push(chunk); return true; },
    end: (cb) => { endCallback = cb; setImmediate(() => cb && cb()); }
  };
  return {
    writes,
    createWriteStream: () => stream,
    getEndCallback: () => endCallback
  };
}

(async function testRunCapturesEvents() {
  const mqttMock = makeMockMqtt();
  const fsMock = makeMockFs();
  const stderr = { lines: [], write: function (s) { this.lines.push(s); } };
  let closedReason = null;
  let closedCount = null;

  const handle = run({
    outputPath: '/tmp/test-capture.jsonl',
    idleTimeoutMs: 0,
    maxDurationMs: 0,
    topicFilter: null,
    broker: 'wss://test.local/mqtt',
    mqttImpl: mqttMock,
    fsImpl: fsMock,
    stderr,
    onClose: ({ count, reason }) => { closedCount = count; closedReason = reason; }
  });

  // Espera al connect + subscribe
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));

  // Verifica suscripcion canonica
  assert.deepStrictEqual(mqttMock.client.subscribed, ['core/+/events/#']);

  // Emite 3 eventos
  const ev1 = { event_id: 'e1', event_type: 'recetas.creada', timestamp: 'T1', source: {core_id:'c1'}, data: {request_id:'r1'}, metadata:{} };
  const ev2 = { event_id: 'e2', event_type: 'recetas.actualizada', timestamp: 'T2', source: {core_id:'c1'}, data: {request_id:'r2'}, metadata:{} };
  mqttMock.client.emit('message', 'core/c1/events/recetas/creada', Buffer.from(JSON.stringify(ev1)));
  mqttMock.client.emit('message', 'core/c1/events/recetas/actualizada', Buffer.from(JSON.stringify(ev2)));
  mqttMock.client.emit('message', 'core/c1/events/raw/garbage', Buffer.from('not_json'));

  // Verifica 3 lineas escritas
  assert.strictEqual(fsMock.writes.length, 3);
  const line1 = JSON.parse(fsMock.writes[0].trim());
  assert.strictEqual(line1.event_id, 'e1');
  assert.strictEqual(line1._topic, 'core/c1/events/recetas/creada');
  assert.ok(line1._captured_at);

  const line3 = JSON.parse(fsMock.writes[2].trim());
  assert.ok(line3._parse_error);
  assert.strictEqual(line3._raw, 'not_json');

  assert.strictEqual(handle.getCount(), 3);

  // Shutdown manual
  handle.shutdown('test_manual');
  await new Promise(r => setImmediate(r));
  assert.strictEqual(closedReason, 'test_manual');
  assert.strictEqual(closedCount, 3);
  assert.strictEqual(mqttMock.client.ended, true);
})();

(async function testRunTopicFilter() {
  const mqttMock = makeMockMqtt();
  const fsMock = makeMockFs();
  const stderr = { lines: [], write: function (s) { this.lines.push(s); } };

  const handle = run({
    outputPath: '/tmp/test-capture-filtered.jsonl',
    idleTimeoutMs: 0,
    maxDurationMs: 0,
    topicFilter: 'core/.+/events/recetas',
    broker: 'wss://test.local/mqtt',
    mqttImpl: mqttMock,
    fsImpl: fsMock,
    stderr,
    onClose: () => {}
  });

  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));

  const ev = { event_id: 'e1', event_type: 'X', timestamp: 'T', source: {}, data: {}, metadata: {} };
  mqttMock.client.emit('message', 'core/c1/events/recetas/creada', Buffer.from(JSON.stringify(ev)));
  mqttMock.client.emit('message', 'core/c1/events/otro/cosa',       Buffer.from(JSON.stringify(ev)));
  mqttMock.client.emit('message', 'core/c1/events/recetas/x',       Buffer.from(JSON.stringify(ev)));

  // Solo los topics que matchean 'recetas' deben escribirse
  assert.strictEqual(fsMock.writes.length, 2);
  assert.ok(fsMock.writes[0].includes('recetas/creada'));
  assert.ok(fsMock.writes[1].includes('recetas/x'));

  handle.shutdown('test_done');
  await new Promise(r => setImmediate(r));
})();

console.log('OK audit-helpers-capture-bus');
