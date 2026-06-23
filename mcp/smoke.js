#!/usr/bin/env node
'use strict';

/**
 * smoke.js — verifica EN VIVO que Enki-como-MCP late, con Enki corriendo.
 *
 * Dos fases:
 *   FASE A (portal por MQTT)  enciende 'portal-mcp', comprueba health, list_tools y una call de lectura.
 *   FASE B (bridge por stdio) arranca mcp/enki-mcp-server.js y hace el handshake MCP real
 *                             (initialize + tools/list) — prueba el framing JSON-RPC del bridge.
 *
 * Requisitos: Enki corriendo (broker MQTT accesible) y deps instaladas (mqtt).
 * Uso:  ENKI_BROKER_URL=mqtt://localhost:1883 ENKI_PROJECT=<id> node mcp/smoke.js
 */

const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

let mqtt;
try { mqtt = require('mqtt'); }
catch (_) { fail('falta la dependencia "mqtt" — instala deps de Enki (npm i) y reintenta'); process.exit(1); }

const BROKER = process.env.ENKI_BROKER_URL || 'mqtt://localhost:1883';
const PROJECT = process.env.ENKI_PROJECT || 'smoke-test';
const TIMEOUT = Number(process.env.ENKI_PORTAL_TIMEOUT) || 8000;

let passed = 0, failed = 0;
function ok(msg) { passed++; console.log('  ✓ ' + msg); }
function fail(msg) { failed++; console.log('  ✗ ' + msg); }
function head(msg) { console.log('\n' + msg); }

// ── RPC contra el portal por MQTT ──
const client = mqtt.connect(BROKER, { reconnectPeriod: 2000, connectTimeout: 8000 });
const pending = new Map();
client.on('message', (topic, payload) => {
  if (!topic.startsWith('ui/response/')) return;
  let m; try { m = JSON.parse(payload.toString()); } catch (_) { return; }
  const p = pending.get(m.request_id);
  if (!p) return;
  pending.delete(m.request_id); clearTimeout(p.timer); p.resolve(m);
});

function rpc(domain, action, data) {
  const request_id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(request_id); reject(new Error('timeout ' + domain + '/' + action)); }, TIMEOUT);
    pending.set(request_id, { resolve, timer });
    client.publish(`ui/request/${domain}/${action}`, JSON.stringify({ request_id, data: data || {} }), { qos: 1 });
  });
}

async function faseA() {
  head('FASE A — portal por MQTT');
  // 1. encender el interruptor portal-mcp
  try {
    const r = await rpc('interruptores', 'set', { id: 'portal-mcp', enabled: true });
    r && r.success !== false ? ok("interruptor 'portal-mcp' encendido") : fail('no se pudo encender portal-mcp: ' + JSON.stringify(r));
  } catch (e) { fail('interruptores.set: ' + e.message); }

  // 2. health del portal → activo:true
  let activo = false;
  try {
    const r = await rpc('portal', 'health', {});
    activo = !!(r && r.data && r.data.activo);
    activo ? ok('portal activo (health)') : fail('portal health no reporta activo: ' + JSON.stringify(r && r.data));
  } catch (e) { fail('portal.health: ' + e.message); }

  // 3. list_tools → catálogo guardado
  let tools = [];
  try {
    const r = await rpc('portal', 'list_tools', {});
    tools = (r && r.data && r.data.tools) || [];
    tools.length > 0
      ? ok(`list_tools devolvió ${tools.length} tools (mode=${r.data.mode}, scope=${r.data.scope})`)
      : fail('list_tools vacío (¿portal OFF, o scope/mode sin tools de lectura?)');
  } catch (e) { fail('portal.list_tools: ' + e.message); }

  // 4. una call de LECTURA (preferimos destilador.listar_clusters; si no, la primera de la lista)
  const elegida = tools.find(t => t.name === 'destilador.listar_clusters') || tools[0];
  if (!elegida) { fail('sin tool de lectura para probar la call'); return; }
  try {
    const r = await rpc('portal', 'call', { tool: elegida.name, args: { project_id: PROJECT }, project_id: PROJECT });
    const okCall = r && r.success !== false && (r.status === undefined || r.status < 400);
    okCall
      ? ok(`call de lectura '${elegida.name}' respondió (status ${r.status || 200})`)
      : fail(`call '${elegida.name}' devolvió error: ` + JSON.stringify(r && (r.error || r.data)));
  } catch (e) { fail('portal.call: ' + e.message); }
}

// ── FASE B: arranca el bridge y hace el handshake MCP por stdio ──
function faseB() {
  head('FASE B — bridge MCP por stdio');
  return new Promise((resolve) => {
    const bridge = spawn('node', [path.join(__dirname, 'enki-mcp-server.js')], {
      env: { ...process.env, ENKI_BROKER_URL: BROKER, ENKI_PROJECT: PROJECT },
      stdio: ['pipe', 'pipe', 'inherit']
    });
    let buf = '';
    const got = new Map();           // id -> response
    const done = () => { try { bridge.kill('SIGTERM'); } catch (_) {} resolve(); };
    const overall = setTimeout(() => { fail('bridge: sin respuesta a tiempo'); done(); }, TIMEOUT + 4000);

    bridge.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch (_) { continue; }
        if (m.id !== undefined) got.set(m.id, m);

        if (m.id === 1) {  // respuesta a initialize
          m.result && m.result.serverInfo ? ok('bridge initialize → ' + m.result.serverInfo.name) : fail('initialize sin serverInfo');
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });          // notificación
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });                  // pide tools
        }
        if (m.id === 2) {  // respuesta a tools/list
          const t = (m.result && m.result.tools) || [];
          t.length >= 0 && m.result
            ? ok(`bridge tools/list → ${t.length} tools por MCP`)
            : fail('tools/list por MCP falló: ' + JSON.stringify(m.error || m));
          clearTimeout(overall); done();
        }
      }
    });
    bridge.on('error', (e) => { fail('no se pudo arrancar el bridge: ' + e.message); clearTimeout(overall); done(); });
    function send(obj) { bridge.stdin.write(JSON.stringify(obj) + '\n'); }
    // arranca el handshake tras dar un respiro a la conexión MQTT del bridge
    setTimeout(() => send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }), 1500);
  });
}

(async () => {
  console.log(`[smoke] broker=${BROKER} project=${PROJECT}`);
  await new Promise((res) => { client.on('connect', () => { client.subscribe('ui/response/#'); res(); }); setTimeout(res, 9000); });
  if (!client.connected) { fail('no se pudo conectar al broker (¿Enki corriendo?)'); }
  else {
    await faseA();
    await faseB();
  }
  head(`RESULTADO: ${passed} ok · ${failed} fallos`);
  try { client.end(true); } catch (_) {}
  process.exit(failed === 0 ? 0 : 1);
})();
