#!/usr/bin/env node
/**
 * cleanup-orphan-project-dirs-via-bus — Borra directorios huerfanos en
 * data/projects/ que no tienen contraparte en project-manager (proyectos
 * vivos en BD). Cliente MQTT externo, todo por eventos.
 *
 * Origen: tras el reset operacional (TP5 del horizonte storage-layout),
 * project-manager._deleteProject fallo silenciosamente al borrar los
 * directorios fisicos de algunos proyectos (los que tenian symlinks, cartas
 * chunkeadas, o nombres no convencionales). Solo limpio la BD y dejo
 * residuos en disco. Este helper completa la limpieza de forma forensable.
 *
 * Operacion:
 *   1. Activa el proyecto Sistema (uuid 3b7795d7) — filesystem entra en
 *      systemMode y los paths se resuelven contra process.cwd() = /opt/enki.
 *   2. ui/request/project/list → lista proyectos vivos en BD con sus base_path.
 *   3. fs.list.request con path='data/projects/' → directorios en disco.
 *   4. Calcula huerfanos = directorios cuyo nombre NO matchea
 *      path.basename(base_path) de ningun proyecto vivo Y NO esta en una
 *      whitelist de sistema (_prompts, system, cualquier '_*').
 *   5. Para cada huerfano: fs.delete.request con path='data/projects/<dir>'.
 *      handleDelete aplica recursive automaticamente si es directorio.
 *
 * Flags:
 *   --dry-run        Lista candidatos sin publicar fs.delete.request.
 *   --yes            Salta confirmacion interactiva (escribe DELETE).
 *   --broker <url>   Default: wss://enki-ai.online/mqtt o AUDIT_BROKER.
 *   --timeout <ms>   Default 15000.
 *   --pause <ms>     Pausa entre deletes. Default 800.
 *
 * Manual: arquitectura/decisiones/_contratos/manual-mqtt-conexion-directa.contract.json
 */

'use strict';

const mqtt = require('mqtt');
const crypto = require('crypto');
const readline = require('readline');

// Fallback histórico (Sistema de enki-ai.online). Cada instancia tiene SU uuid de
// Sistema — se resuelve dinámicamente por systemRole='root' via ui project/list.
const SISTEMA_ID_FALLBACK = '3b7795d7-2e63-4b8e-a5e3-f153c865f306';
const SYSTEM_DIRS_WHITELIST = new Set(['_prompts', 'system']);

function parseArgs(argv) {
  const f = {
    dryRun: false, yes: false,
    broker: process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt',
    timeout: 15000, pause: 800,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') f.dryRun = true;
    else if (a === '--yes') f.yes = true;
    else if (a === '--broker') f.broker = argv[++i];
    else if (a === '--timeout') f.timeout = parseInt(argv[++i], 10);
    else if (a === '--pause') f.pause = parseInt(argv[++i], 10);
  }
  return f;
}

// ---- UI rail (project.* operations) ----
function uiRequest(client, domain, action, data, timeoutMs) {
  const rid = crypto.randomUUID();
  const respTopic = `ui/response/${rid}`;
  const reqTopic = `ui/request/${domain}/${action}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const onMessage = (topic, message) => {
      if (topic !== respTopic) return;
      try {
        const env = JSON.parse(message.toString());
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        client.unsubscribe(respTopic);
        resolve(env);
      } catch (_) {}
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.removeListener('message', onMessage);
      client.unsubscribe(respTopic);
      reject(new Error(`timeout ${respTopic}`));
    }, timeoutMs);
    client.on('message', onMessage);
    client.subscribe(respTopic, (err) => {
      if (err) { clearTimeout(timer); if (!settled) { settled = true; reject(err); } return; }
      client.publish(reqTopic, JSON.stringify({ request_id: rid, data }));
    });
  });
}

// ---- Bus rail (fs.* operations) ----
function busRequest(client, eventType, responseType, payload, timeoutMs) {
  const rid = crypto.randomUUID();
  const respTopic = 'core/+/events/' + responseType.replace(/\./g, '/');
  const reqTopic = 'core/*/events/' + eventType.replace(/\./g, '/');
  return new Promise((resolve, reject) => {
    let settled = false;
    const onMessage = (topic, message) => {
      try {
        const env = JSON.parse(message.toString());
        if (env.event_type !== responseType) return;
        if (env.data?.request_id !== rid) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        client.unsubscribe(respTopic);
        resolve(env);
      } catch (_) {}
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.removeListener('message', onMessage);
      client.unsubscribe(respTopic);
      reject(new Error(`timeout ${responseType}`));
    }, timeoutMs);
    client.on('message', onMessage);
    client.subscribe(respTopic, (err) => {
      if (err) { clearTimeout(timer); if (!settled) { settled = true; reject(err); } return; }
      client.publish(reqTopic, JSON.stringify({
        event_id: crypto.randomUUID(), event_type: eventType,
        timestamp: new Date().toISOString(),
        source: { core_id: 'cleanup-orphan-helper' },
        data: { request_id: rid, ...payload },
        metadata: {}
      }));
    });
  });
}

function confirmInteractive(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  console.error(`[cleanup] broker=${flags.broker}  dryRun=${flags.dryRun}`);

  const client = mqtt.connect(flags.broker, {
    clientId: 'cleanup-orphan-' + crypto.randomUUID().slice(0, 8),
    connectTimeout: 8000, reconnectPeriod: 0
  });

  try {
    await new Promise((res, rej) => {
      client.once('connect', res);
      client.once('error', rej);
      setTimeout(() => rej(new Error('connect timeout')), 8000);
    });
    console.error('[cleanup] mqtt connected');

    // 1. Resolver el Sistema DE ESTA instancia (cada broker tiene su uuid) y
    //    activarlo para que filesystem entre en systemMode.
    const uiList = await uiRequest(client, 'project', 'list', {}, flags.timeout);
    const sistema = (uiList.data?.projects || []).find(p => p.systemRole === 'root')
                 || (uiList.data?.projects || []).find(p => p.name === 'Sistema');
    const sistemaId = sistema?.id || SISTEMA_ID_FALLBACK;
    const actResp = await uiRequest(client, 'project', 'activate', { id: sistemaId }, flags.timeout);
    if (actResp.status !== 200) {
      throw new Error(`activate Sistema failed: ${actResp.status} ${actResp.error?.code}`);
    }
    console.error(`[cleanup] Sistema activado (systemMode on) id=${sistemaId.slice(0, 8)}`);

    // 2. Listar proyectos vivos via BUS rail (no UI rail) — el bus response
    //    incluye base_path explicito, el UI rail solo da slug que puede divergir
    //    del basename del directorio (caso Vapers_Alhama: slug='vapers-alhama'
    //    pero base_path apunta a 'vapersalhama/').
    const listResp = await busRequest(client, 'project.list.request', 'project.list.response',
      {}, flags.timeout);
    const projects = listResp.data?.projects || [];
    const liveBasenames = new Set();
    for (const p of projects) {
      if (p.base_path) {
        const bn = p.base_path.split('/').filter(Boolean).pop();
        if (bn) liveBasenames.add(bn);
      }
      if (p.id) liveBasenames.add(p.id);
      if (p.slug) liveBasenames.add(p.slug);
    }
    console.error(`[cleanup] BD: ${projects.length} proyectos vivos, ${liveBasenames.size} basenames protegidos`);

    // 3. Listar directorios en disco
    const lsResp = await busRequest(client, 'fs.list.request', 'fs.list.response',
      { path: 'data/projects/' }, flags.timeout);
    const entries = lsResp.data?.entries || lsResp.data?.files || lsResp.data?.contents || [];
    const dirs = entries
      .filter(e => (typeof e === 'object' ? (e.type === 'directory' || e.kind === 'directory') : true))
      .map(e => (typeof e === 'object' ? e.name : e));
    console.error(`[cleanup] disco: ${dirs.length} entradas en data/projects/`);

    // 4. Calcular huerfanos
    const orphans = dirs.filter(d => {
      if (SYSTEM_DIRS_WHITELIST.has(d)) return false;
      if (d.startsWith('_')) return false;
      if (liveBasenames.has(d)) return false;
      return true;
    });
    const kept = dirs.filter(d => !orphans.includes(d));

    console.log('\n=== HUERFANOS (' + orphans.length + ') ===');
    for (const d of orphans) console.log('  -', d);
    console.log('\n=== CONSERVADOS (' + kept.length + ') ===');
    for (const d of kept) {
      const reason = SYSTEM_DIRS_WHITELIST.has(d) ? 'whitelist'
        : d.startsWith('_') ? 'underscore-prefix'
        : liveBasenames.has(d) ? 'live-project' : '?';
      console.log('  -', d, '   (' + reason + ')');
    }

    if (flags.dryRun) {
      console.error('\n[cleanup] DRY-RUN: no se publica fs.delete.request. Fin.');
      client.end();
      return;
    }
    if (orphans.length === 0) {
      console.error('\n[cleanup] nada que borrar. Fin.');
      client.end();
      return;
    }
    if (!flags.yes) {
      const ans = await confirmInteractive(
        `\n[cleanup] CONFIRMA: escribe DELETE para borrar los ${orphans.length} directorios huerfanos: `
      );
      if (ans !== 'DELETE') {
        console.error('[cleanup] abortado.');
        client.end();
        process.exit(1);
      }
    }

    // 5. Borrar uno por uno
    console.error('\n[cleanup] borrando huerfanos via fs.delete.request...');
    const results = { ok: 0, failed: 0 };
    for (const d of orphans) {
      const targetPath = 'data/projects/' + d;
      try {
        const t0 = Date.now();
        const r = await busRequest(client, 'fs.delete.request', 'fs.delete.response',
          { path: targetPath }, flags.timeout);
        const dur = Date.now() - t0;
        if (r.data?.error) {
          console.log(`  FAIL  ${targetPath}  ${dur}ms  code=${r.data.error.code} msg=${(r.data.error.message || '').slice(0,100)}`);
          results.failed++;
        } else {
          console.log(`  OK    ${targetPath}  ${dur}ms  type=${r.data?.type || '?'}`);
          results.ok++;
        }
      } catch (e) {
        console.log(`  FAIL  ${targetPath}  ${e.message}`);
        results.failed++;
      }
      if (flags.pause > 0) await new Promise(rr => setTimeout(rr, flags.pause));
    }

    console.error(`\n[cleanup] fin. ok=${results.ok} failed=${results.failed} total=${orphans.length}`);
    client.end();
    if (results.failed > 0) process.exit(1);
  } catch (e) {
    console.error('[cleanup] error:', e.message);
    try { client.end(true); } catch (_) {}
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
