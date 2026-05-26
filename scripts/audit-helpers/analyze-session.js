#!/usr/bin/env node
/**
 * analyze-session — correla un chat-export.json con un bus-capture.jsonl y
 * produce JSON estructurado para inspeccion forense.
 *
 * Salida EXCLUSIVAMENTE JSON (audit-session-analysis-v1). El resumen
 * narrativo lo hace el operador o el LLM leyendo el JSON.
 *
 * Uso:
 *   node scripts/audit-helpers/analyze-session.js \
 *     --export <chat-export.json> --capture <bus-capture.jsonl> \
 *     [--conversation <id>] [--out <path>]
 *
 * Manual operativo: arquitectura/decisiones/_contratos/manual-audit-bus-capture.contract.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FORMAT = 'audit-session-analysis-v1';
const EXCERPT_MAX = 200;

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--export' || a === '--capture' || a === '--conversation' || a === '--out') {
      flags[a.slice(2)] = argv[++i];
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    }
  }
  return flags;
}

function excerpt(value) {
  if (value == null) return null;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s.length <= EXCERPT_MAX) return s;
  return s.slice(0, EXCERPT_MAX) + '…';
}

function tsToMs(ts) {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

function loadCapture(jsonlText) {
  const out = [];
  if (!jsonlText) return out;
  const lines = jsonlText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (err) {
      out.push({ _line: i + 1, _parse_error: err.message, _raw: line.slice(0, 200) });
    }
  }
  return out;
}

function filterByConversation(captureEvents, conversationId) {
  if (!conversationId) return captureEvents.slice();
  return captureEvents.filter(e => {
    if (!e || e._parse_error) return false;
    const d = e.data || {};
    return d.conversation_id === conversationId || d.session_id === conversationId;
  });
}

function moduleOfEvent(e) {
  // Preferimos source.module_id (canonico); fallback al prefix del event_type.
  const src = e.source && (e.source.module_id || e.source.core_id);
  if (src) return String(src);
  const et = e.event_type || '';
  const dot = et.indexOf('.');
  return dot > 0 ? et.slice(0, dot) : (et || 'unknown');
}

function buildEventsByModule(captureEvents) {
  const out = {};
  for (const e of captureEvents) {
    if (!e || e._parse_error) continue;
    const mod = moduleOfEvent(e);
    if (!out[mod]) out[mod] = { count: 0, event_types: {} };
    out[mod].count++;
    const et = e.event_type || 'unknown';
    out[mod].event_types[et] = (out[mod].event_types[et] || 0) + 1;
  }
  return out;
}

function findOrphans(captureEvents) {
  // Indexamos response/failed por request_id para resolver pares.
  const responsesByReq = new Map();
  for (const e of captureEvents) {
    if (!e || e._parse_error || !e.event_type) continue;
    if (!/\.(response|failed)$/.test(e.event_type)) continue;
    const reqId = e.data && e.data.request_id;
    if (reqId) responsesByReq.set(reqId, e);
  }
  const orphans = [];
  for (const e of captureEvents) {
    if (!e || e._parse_error || !e.event_type) continue;
    if (!/\.request$/.test(e.event_type)) continue;
    const reqId = e.data && e.data.request_id;
    if (reqId && responsesByReq.has(reqId)) continue;
    const expected_response_event = e.event_type.replace(/\.request$/, '.response');
    orphans.push({
      event_type: e.event_type,
      event_id: e.event_id || null,
      ts: e._captured_at || e.timestamp || null,
      data_excerpt: excerpt(e.data),
      expected_response_event,
      razon: reqId
        ? 'request_id sin response ni failed correlacionado'
        : 'request sin request_id — imposible correlacionar'
    });
  }
  return orphans;
}

function findErrorsAndWarnings(captureEvents, exportData) {
  const out = [];
  // Capture: cualquier evento .failed
  for (const e of captureEvents) {
    if (!e || e._parse_error || !e.event_type) continue;
    if (!/\.failed$/.test(e.event_type)) continue;
    const err = e.data && e.data.error;
    out.push({
      source: 'bus_capture',
      event_type: e.event_type,
      event_id: e.event_id || null,
      ts: e._captured_at || e.timestamp || null,
      module: moduleOfEvent(e),
      error_code: err && err.code,
      error_message: err && excerpt(err.message),
      data_excerpt: excerpt(e.data)
    });
  }
  // Export timeline: error / warning entries (si las hay)
  const tl = (exportData && exportData.timeline) || [];
  for (const item of tl) {
    if (!item) continue;
    if (item._type === 'error' || item._type === 'warning') {
      out.push({
        source: 'export_timeline',
        type: item._type,
        ts: item.ts || null,
        module: item.module || null,
        action: item.action || null,
        outcome: item.outcome || null,
        ctx_excerpt: excerpt(item.ctx)
      });
    }
  }
  // Ordenar por ts asc (los nulls al final).
  out.sort((a, b) => {
    const ta = tsToMs(a.ts);
    const tb = tsToMs(b.ts);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });
  return out;
}

function computeLatencies(captureEvents) {
  const requestsByReqId = new Map();
  const out = [];
  for (const e of captureEvents) {
    if (!e || e._parse_error || !e.event_type) continue;
    const reqId = e.data && e.data.request_id;
    if (!reqId) continue;
    if (/\.request$/.test(e.event_type)) {
      requestsByReqId.set(reqId, e);
    } else if (/\.(response|failed)$/.test(e.event_type)) {
      const req = requestsByReqId.get(reqId);
      if (!req) continue;
      const t0 = tsToMs(req._captured_at || req.timestamp);
      const t1 = tsToMs(e._captured_at || e.timestamp);
      if (t0 == null || t1 == null) continue;
      out.push({
        request_id: reqId,
        request_event: req.event_type,
        response_event: e.event_type,
        request_ts: req._captured_at || req.timestamp,
        response_ts: e._captured_at || e.timestamp,
        delta_ms: t1 - t0,
        outcome: /\.failed$/.test(e.event_type) ? 'failed' : 'response'
      });
    }
  }
  return out;
}

function computeCoverage(exportData, captureEvents) {
  const modules = new Set();
  for (const e of captureEvents) {
    if (e && !e._parse_error) modules.add(moduleOfEvent(e));
  }
  const toolsInvoked = new Set();
  const rawMessages = (exportData && exportData.messages_raw) || [];
  for (const m of rawMessages) {
    const md = m && m.metadata;
    const calls = md && (md.tool_calls || md.tool_calls_executed);
    if (!Array.isArray(calls)) continue;
    for (const c of calls) {
      const n = c && (c.name || c.tool);
      if (n) toolsInvoked.add(n);
    }
  }
  // Fallback: tool_call items en el timeline
  const tl = (exportData && exportData.timeline) || [];
  for (const item of tl) {
    if (item && item._type === 'tool_call' && item.name) toolsInvoked.add(item.name);
  }
  const agentsExecuted = new Set();
  const execs = (exportData && exportData.agent_executions) || [];
  for (const a of execs) {
    if (a && a.agent_name) agentsExecuted.add(a.agent_name);
  }
  return {
    modules_emitted: Array.from(modules).sort(),
    tools_invoked: Array.from(toolsInvoked).sort(),
    agents_executed: Array.from(agentsExecuted).sort()
  };
}

function extractMessagesForTurns(exportData) {
  // Preferimos messages_raw (verbose). Si no, derivamos del timeline.
  if (exportData && Array.isArray(exportData.messages_raw) && exportData.messages_raw.length > 0) {
    return exportData.messages_raw
      .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({
        role: m.role,
        ts: m.created_at || m.timestamp || null,
        content: m.content,
        metadata: m.metadata || null,
        error: m.error || null
      }));
  }
  const tl = (exportData && exportData.timeline) || [];
  return tl
    .filter(item => item && item._type === 'message' && (item.role === 'user' || item.role === 'assistant'))
    .map(item => ({
      role: item.role,
      ts: item.ts || null,
      content: item.content,
      metadata: item.metadata || null,
      error: item.error || null
    }));
}

function extractTurns(exportData, captureEvents) {
  const msgs = extractMessagesForTurns(exportData);
  const turns = [];
  let turn_index = 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== 'user') continue;
    // El asistente del turno es el siguiente assistant en orden — puede no existir si el turno fallo.
    let assistant = null;
    for (let j = i + 1; j < msgs.length; j++) {
      if (msgs[j].role === 'assistant') { assistant = msgs[j]; break; }
      if (msgs[j].role === 'user') break;
    }
    const t0 = tsToMs(m.ts);
    const t1 = assistant ? tsToMs(assistant.ts) : null;

    // Eventos del bus en la ventana del turno: [t0, t1] (o [t0, ahora] si no hay assistant).
    const turnEvents = captureEvents.filter(e => {
      if (!e || e._parse_error) return false;
      const ms = tsToMs(e._captured_at || e.timestamp);
      if (ms == null) return false;
      if (t0 != null && ms < t0) return false;
      if (t1 != null && ms > t1) return false;
      return true;
    }).map(e => ({
      ts: e._captured_at || e.timestamp,
      event_type: e.event_type,
      source: moduleOfEvent(e),
      data_excerpt: excerpt(e.data),
      correlation_id: e.data && (e.data.correlation_id || e.data.request_id) || null
    }));

    // trigger_event: el primer chat.message.saved en el rango del turno.
    const trigger = turnEvents.find(e => e.event_type === 'chat.message.saved') || null;

    // tool_calls reportados por el LLM en metadata del assistant.
    let tool_calls_reported = [];
    if (assistant && assistant.metadata) {
      let md = assistant.metadata;
      if (typeof md === 'string') {
        try { md = JSON.parse(md); } catch { md = null; }
      }
      const arr = md && (md.tool_calls || md.tool_calls_executed);
      if (Array.isArray(arr)) {
        tool_calls_reported = arr.map(c => ({
          name: c && (c.name || c.tool) || null,
          status: c && (c.status || c.result_status) || null,
          error_code: c && c.error_code || null
        }));
      }
    }

    const providers_used = [];
    if (assistant && assistant.metadata) {
      let md = assistant.metadata;
      if (typeof md === 'string') {
        try { md = JSON.parse(md); } catch { md = null; }
      }
      if (md && md.provider) providers_used.push(md.provider);
    }

    turns.push({
      turn_index: turn_index++,
      user_message: { ts: m.ts, content_excerpt: excerpt(m.content) },
      trigger_event: trigger ? { event_type: trigger.event_type, ts: trigger.ts } : null,
      events: turnEvents,
      assistant_response: assistant
        ? {
            ts: assistant.ts,
            content_excerpt: excerpt(assistant.content),
            tool_calls_reported,
            error: assistant.error || null
          }
        : null,
      duration_ms: (t0 != null && t1 != null) ? t1 - t0 : null,
      providers_used
    });
  }
  return turns;
}

function computeWindow(captureEvents) {
  let min = null;
  let max = null;
  for (const e of captureEvents) {
    if (!e || e._parse_error) continue;
    const ts = e._captured_at || e.timestamp;
    const ms = tsToMs(ts);
    if (ms == null) continue;
    if (min == null || ms < min) min = ms;
    if (max == null || ms > max) max = ms;
  }
  if (min == null || max == null) return { started_at: null, ended_at: null, duration_ms: null };
  return {
    started_at: new Date(min).toISOString(),
    ended_at: new Date(max).toISOString(),
    duration_ms: max - min
  };
}

function analyze({ exportData, captureLines, conversationId, exportPath, capturePath }) {
  const allCapture = loadCapture(captureLines);
  const captureFiltered = filterByConversation(allCapture, conversationId);

  return {
    _format: FORMAT,
    _generated_at: new Date().toISOString(),
    inputs: {
      export_path: exportPath || null,
      capture_path: capturePath || null,
      conversation_id: conversationId || (exportData && exportData.session_id) || null
    },
    window: computeWindow(captureFiltered),
    turns: extractTurns(exportData || {}, captureFiltered),
    events_by_module: buildEventsByModule(captureFiltered),
    orphans: findOrphans(captureFiltered),
    errors_and_warnings: findErrorsAndWarnings(captureFiltered, exportData || {}),
    latencies: computeLatencies(captureFiltered),
    coverage: computeCoverage(exportData || {}, captureFiltered)
  };
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || !flags.export || !flags.capture) {
    process.stderr.write(
      'Uso: analyze-session.js --export <chat-export.json> --capture <bus-capture.jsonl> ' +
      '[--conversation <id>] [--out <path>]\n'
    );
    process.exit(2);
  }
  const exportPath = path.resolve(flags.export);
  const capturePath = path.resolve(flags.capture);
  const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const captureLines = fs.readFileSync(capturePath, 'utf8');
  const conversationId = flags.conversation || exportData.session_id || null;

  const result = analyze({ exportData, captureLines, conversationId, exportPath, capturePath });

  const outPath = flags.out
    ? path.resolve(flags.out)
    : path.resolve(`${conversationId || 'session'}.analysis.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  process.stdout.write(outPath + '\n');
}

module.exports = {
  parseArgs,
  excerpt,
  tsToMs,
  loadCapture,
  filterByConversation,
  moduleOfEvent,
  buildEventsByModule,
  findOrphans,
  findErrorsAndWarnings,
  computeLatencies,
  computeCoverage,
  extractMessagesForTurns,
  extractTurns,
  computeWindow,
  analyze,
  FORMAT,
  EXCERPT_MAX
};

if (require.main === module) {
  main();
}
