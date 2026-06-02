#!/usr/bin/env node
/**
 * reset-projects-via-bus — Borra proyectos del sistema vivo Enki publicando
 * eventos al bus MQTT (cero rm -rf de shell, cero fs.unlink directo). Cumple
 * la clausula transversal "todo por eventos" canonizada en
 * arquitectura/decisiones/_contratos/storage-layout.contract.json (P9).
 *
 * Usa el carril UI canonico (ui/request/<dominio>/<accion> + ui/response/
 * <request_id>) en lugar del carril eventbus crudo. Razon: los UI handlers
 * de project-manager (handleUIList, handleUIDeactivate, handleUIDelete)
 * devuelven response shape {status, data|error} con detalle del fallo,
 * mientras que los bus handlers (onProjectDelete) hacen early-return
 * silencioso si el payload no cumple shape esperado (onProjectDelete espera
 * data.id, no data.project_id que seria la costumbre).
 *
 * Orquestacion: por cada proyecto candidato publica primero
 * ui/request/project/deactivate (porque _deleteProject exige is_active=false)
 * y despues ui/request/project/delete con force=true (por si tiene dependents).
 * project-manager orquesta la cascada (cierre sqlite, fs.delete.request por
 * cada path, eliminacion de symlinks).
 *
 * NO crea proyectos nuevos. La creacion la hace el usuario desde su chat
 * cuando los necesite.
 *
 * Uso:
 *   node scripts/audit-helpers/reset-projects-via-bus.js [opciones]
 *
 * Flags:
 *   --dry-run       No publica delete. Solo lista lo que haria.
 *   --yes           Salta confirmacion interactiva.
 *   --keep <csv>    Slugs/ids a conservar. Excluyente con --only.
 *   --only <csv>    Slugs/ids a borrar (resto se ignora).
 *   --broker <url>  Default: wss://enki-ai.online/mqtt o AUDIT_BROKER.
 *   --timeout <ms>  Timeout por respuesta. Default 10000.
 *   --pause <ms>    Pausa entre proyectos. Default 500.
 *
 * Manual: arquitectura/decisiones/_contratos/manual-mqtt-conexion-directa.contract.json
 */

'use strict';

const mqtt = require('mqtt');
const crypto = require('crypto');
const readline = require('readline');

function parseArgs(argv) {
  const flags = {
    dryRun: false, yes: false, keep: [], only: [],
    broker: process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt',
    timeout: 10000, pause: 500,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--yes') flags.yes = true;
    else if (a === '--keep') flags.keep = (argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--only') flags.only = (argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--broker') flags.broker = argv[++i];
    else if (a === '--timeout') flags.timeout = parseInt(argv[++i], 10);
    else if (a === '--pause') flags.pause = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      console.log(require('fs').readFileSync(__filename, 'utf-8').split('\n').slice(2, 40).join('\n').replace(/^ \*\s?/gm, ''));
      process.exit(0);
    }
  }
  if (flags.keep.length > 0 && flags.only.length > 0) {
    console.error('ERROR: --keep y --only son mutuamente exclusivos.');
    process.exit(2);
  }
  return flags;
}

// Carril UI: publish ui/request/<dominio>/<accion>, subscribe ui/response/<request_id>.
// Payload: { request_id, data: {...campos} }. Response: { status, data|error }.
function uiRequest(client, domain, action, data, timeoutMs) {
  const requestId = crypto.randomUUID();
  const responseTopic = `ui/response/${requestId}`;
  const requestTopic = `ui/request/${domain}/${action}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const onMessage = (topic, message) => {
      if (topic !== responseTopic) return;
      try {
        const env = JSON.parse(message.toString());
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        client.unsubscribe(responseTopic);
        resolve(env);
      } catch (_) {}
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.removeListener('message', onMessage);
      client.unsubscribe(responseTopic);
      reject(new Error(`timeout waiting for ${responseTopic} (${timeoutMs}ms)`));
    }, timeoutMs);
    client.on('message', onMessage);
    client.subscribe(responseTopic, (err) => {
      if (err) {
        clearTimeout(timer);
        if (!settled) { settled = true; reject(err); }
        return;
      }
      client.publish(requestTopic, JSON.stringify({ request_id: requestId, data }));
    });
  });
}

async function listProjects(client, timeoutMs) {
  const env = await uiRequest(client, 'project', 'list', {}, timeoutMs);
  if (env.status !== 200) {
    throw new Error(`project.list failed: ${env.status} ${env.error?.code} ${env.error?.message}`);
  }
  return env.data?.projects || [];
}

async function deactivateProject(client, projectId, timeoutMs) {
  return uiRequest(client, 'project', 'deactivate', { id: projectId }, timeoutMs);
}

async function deleteProject(client, projectId, timeoutMs) {
  return uiRequest(client, 'project', 'delete', { id: projectId, force: true }, timeoutMs);
}

function confirmInteractive(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  console.error(`[reset] broker=${flags.broker}  dryRun=${flags.dryRun}  keep=${flags.keep.join(',') || '(none)'}  only=${flags.only.join(',') || '(all)'}`);

  const client = mqtt.connect(flags.broker, {
    clientId: 'reset-projects-' + crypto.randomUUID().slice(0, 8),
    connectTimeout: 8000, reconnectPeriod: 0
  });

  try {
    await new Promise((res, rej) => {
      client.once('connect', res);
      client.once('error', rej);
      setTimeout(() => rej(new Error('connect timeout')), 8000);
    });
    console.error('[reset] mqtt connected');

    const projects = await listProjects(client, flags.timeout);
    console.error(`[reset] sistema reporta ${projects.length} proyectos`);

    const isKeyMatch = (p, key) => p.id === key || p.slug === key ||
      (p.name && p.name.toLowerCase() === key.toLowerCase());

    const toDelete = projects.filter(p => {
      if (flags.only.length > 0) return flags.only.some(k => isKeyMatch(p, k));
      if (flags.keep.length > 0 && flags.keep.some(k => isKeyMatch(p, k))) return false;
      return true;
    });
    const toKeep = projects.filter(p => !toDelete.includes(p));

    console.log('\n=== A BORRAR (' + toDelete.length + ') ===');
    for (const p of toDelete) {
      console.log(`  - ${p.id}  name=${JSON.stringify(p.name || '(no name)')}  isActive=${p.isActive}  systemRole=${p.systemRole || '(none)'}`);
    }
    if (toKeep.length > 0) {
      console.log('\n=== A CONSERVAR (' + toKeep.length + ') ===');
      for (const p of toKeep) {
        console.log(`  - ${p.id}  name=${JSON.stringify(p.name || '(no name)')}`);
      }
    }

    if (flags.dryRun) {
      console.error('\n[reset] DRY-RUN: no se publica nada. Fin.');
      client.end();
      return;
    }
    if (toDelete.length === 0) {
      console.error('\n[reset] nada que borrar segun filtros. Fin.');
      client.end();
      return;
    }
    if (!flags.yes) {
      const answer = await confirmInteractive(
        `\n[reset] CONFIRMA: escribe DELETE para borrar los ${toDelete.length} proyectos: `
      );
      if (answer !== 'DELETE') {
        console.error('[reset] confirmacion incorrecta. Abortado.');
        client.end();
        process.exit(1);
      }
    }

    console.error('\n[reset] empezando: deactivate -> delete por proyecto via carril UI');
    const results = { ok: 0, deactivate_failed: 0, delete_failed: 0 };
    for (const p of toDelete) {
      const tag = `${p.id} (${p.name || ''})`;
      if (p.isActive) {
        try {
          const r = await deactivateProject(client, p.id, flags.timeout);
          if (r.status !== 200) {
            console.log(`  DEACT_FAIL ${tag}  status=${r.status} code=${r.error?.code} msg=${(r.error?.message || '').slice(0,100)}`);
            results.deactivate_failed++;
            if (flags.pause > 0) await new Promise(rr => setTimeout(rr, flags.pause));
            continue;
          }
          console.log(`  deactivated  ${tag}`);
        } catch (e) {
          console.log(`  DEACT_FAIL ${tag}  ${e.message}`);
          results.deactivate_failed++;
          if (flags.pause > 0) await new Promise(rr => setTimeout(rr, flags.pause));
          continue;
        }
      }
      try {
        const t0 = Date.now();
        const r = await deleteProject(client, p.id, flags.timeout);
        const dur = Date.now() - t0;
        if (r.status !== 200) {
          console.log(`  DEL_FAIL   ${tag}  ${dur}ms  status=${r.status} code=${r.error?.code} msg=${(r.error?.message || '').slice(0,100)}`);
          results.delete_failed++;
        } else {
          console.log(`  DELETED    ${tag}  ${dur}ms`);
          results.ok++;
        }
      } catch (e) {
        console.log(`  DEL_FAIL   ${tag}  ${e.message}`);
        results.delete_failed++;
      }
      if (flags.pause > 0) await new Promise(rr => setTimeout(rr, flags.pause));
    }

    console.error(`\n[reset] fin. ok=${results.ok}  deactivate_failed=${results.deactivate_failed}  delete_failed=${results.delete_failed}  total=${toDelete.length}`);
    client.end();
    if (results.ok < toDelete.length) process.exit(1);
  } catch (e) {
    console.error('[reset] error:', e.message);
    try { client.end(true); } catch (_) {}
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { listProjects, deactivateProject, deleteProject };
