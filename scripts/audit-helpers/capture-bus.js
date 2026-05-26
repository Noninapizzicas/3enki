#!/usr/bin/env node
/**
 * capture-bus — captura cruda del bus MQTT a un JSONL.
 *
 * Cliente MQTT externo, cero impacto en event-core. Se suscribe a un wildcard
 * del bus y appendea cada evento al JSONL en orden de llegada. Append-only
 * para robustez frente a crashes — si el proceso muere, lo capturado hasta
 * ese momento queda intacto.
 *
 * Uso:
 *   node scripts/audit-helpers/capture-bus.js <output.jsonl> \
 *     [--idle-timeout <ms>] [--max-duration <ms>] [--topic-filter <regex>]
 *
 * Terminacion:
 *   - SIGINT (Ctrl-C): cierre limpio con flush.
 *   - --idle-timeout: cierra si no llegan eventos durante N ms.
 *   - --max-duration: corta sin importar actividad transcurridos N ms.
 *
 * Stderr: progreso periodico (un linea cada 10 eventos).
 * Stdout: solo la ruta del JSONL al cerrar.
 *
 * Shape del JSONL (una linea por evento):
 *   {
 *     "_captured_at": ISO8601,
 *     "_topic": "core/<core>/events/<path>",
 *     "event_id": "...",
 *     "event_type": "...",
 *     "timestamp": ISO8601,
 *     "source": {...},
 *     "data": {...},
 *     "metadata": {...}
 *   }
 *
 * Eventos malformados:
 *   { "_captured_at": ISO8601, "_topic": "...", "_parse_error": "...", "_raw": "..." }
 *
 * Manual operativo: arquitectura/decisiones/_contratos/manual-audit-bus-capture.contract.json
 */
'use strict';
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--idle-timeout' || a === '--max-duration' || a === '--topic-filter') {
      flags[a.slice(2)] = argv[++i];
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

const RAW_TRUNCATE_BYTES = 2048;
const PROGRESS_EVERY = 10;

function formatProgress(count, lastEventType) {
  return `[capture-bus] ${count} eventos capturados${lastEventType ? ` — ultimo: ${lastEventType}` : ''}`;
}

function buildEntry(topic, payload, capturedAt) {
  let parsed;
  try {
    parsed = JSON.parse(payload.toString('utf8'));
  } catch (err) {
    const raw = payload.toString('utf8');
    return {
      _captured_at: capturedAt,
      _topic: topic,
      _parse_error: err.message,
      _raw: raw.length > RAW_TRUNCATE_BYTES ? raw.slice(0, RAW_TRUNCATE_BYTES) + '…[truncated]' : raw
    };
  }
  // Append _captured_at y _topic SIN modificar el envelope original.
  // Spread preserva todos los campos canonicos (event_id, event_type, timestamp, source, data, metadata).
  return {
    _captured_at: capturedAt,
    _topic: topic,
    ...parsed
  };
}

function run({ outputPath, idleTimeoutMs, maxDurationMs, topicFilter, broker, mqttImpl, fsImpl, stderr, onClose }) {
  const fsRef = fsImpl || fs;
  const errStream = stderr || process.stderr;
  const mqttRef = mqttImpl || mqtt;
  const filterRegex = topicFilter ? new RegExp(topicFilter) : null;

  // Open append stream — robusto a crashes, no buffer interno mantenido por el script.
  const stream = fsRef.createWriteStream(outputPath, { flags: 'a' });

  let count = 0;
  let lastEventTs = Date.now();
  let lastEventType = null;
  let idleTimer = null;
  let maxTimer = null;
  let closing = false;

  const client = mqttRef.connect(broker, {
    clientId: 'capture-bus-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    connectTimeout: 8000,
    reconnectPeriod: 0
  });

  function shutdown(reason) {
    if (closing) return;
    closing = true;
    if (idleTimer) clearInterval(idleTimer);
    if (maxTimer) clearTimeout(maxTimer);
    errStream.write(`[capture-bus] cerrando (${reason}): ${count} eventos -> ${outputPath}\n`);
    stream.end(() => {
      try { client.end(true); } catch {}
      if (onClose) onClose({ count, outputPath, reason });
      else {
        process.stdout.write(outputPath + '\n');
        process.exit(0);
      }
    });
  }

  client.on('connect', () => {
    errStream.write(`[capture-bus] conectado a ${broker}\n`);
    client.subscribe('core/+/events/#', (err) => {
      if (err) {
        errStream.write(`[capture-bus] ERROR suscribiendo: ${err.message}\n`);
        shutdown('subscribe_error');
        return;
      }
      errStream.write('[capture-bus] suscrito a core/+/events/#\n');
      if (filterRegex) errStream.write(`[capture-bus] filtro topic: ${filterRegex}\n`);
    });
  });

  client.on('error', (err) => {
    errStream.write(`[capture-bus] ERROR mqtt: ${err.message}\n`);
    shutdown('mqtt_error');
  });

  client.on('message', (topic, payload) => {
    if (filterRegex && !filterRegex.test(topic)) return;
    const entry = buildEntry(topic, payload, new Date().toISOString());
    stream.write(JSON.stringify(entry) + '\n');
    count++;
    lastEventTs = Date.now();
    lastEventType = entry.event_type || entry._parse_error ? entry._parse_error || entry.event_type : null;
    if (count % PROGRESS_EVERY === 0) {
      errStream.write(formatProgress(count, entry.event_type) + '\n');
    }
  });

  if (idleTimeoutMs > 0) {
    // Check cada 1s (o el propio idleTimeout si es menor) si pasaron N ms sin eventos.
    const tick = Math.max(500, Math.min(1000, idleTimeoutMs / 2));
    idleTimer = setInterval(() => {
      if (Date.now() - lastEventTs >= idleTimeoutMs) {
        shutdown(`idle_timeout_${idleTimeoutMs}ms`);
      }
    }, tick);
  }

  if (maxDurationMs > 0) {
    maxTimer = setTimeout(() => shutdown(`max_duration_${maxDurationMs}ms`), maxDurationMs);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { shutdown, getCount: () => count, getClient: () => client };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || positional.length < 1) {
    process.stderr.write(
      'Uso: capture-bus.js <output.jsonl> [--idle-timeout <ms>] [--max-duration <ms>] [--topic-filter <regex>]\n'
    );
    process.exit(2);
  }
  const outputPath = path.resolve(positional[0]);
  const idleTimeoutMs = flags['idle-timeout'] ? parseInt(flags['idle-timeout'], 10) : 0;
  const maxDurationMs = flags['max-duration'] ? parseInt(flags['max-duration'], 10) : 0;
  const topicFilter = flags['topic-filter'] || null;
  const broker = process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';

  run({ outputPath, idleTimeoutMs, maxDurationMs, topicFilter, broker });
}

// Exports para tests unitarios — no se ejecuta main() si se require()-a.
module.exports = { parseArgs, buildEntry, run, RAW_TRUNCATE_BYTES };

if (require.main === module) {
  main();
}
