#!/usr/bin/env node
/**
 * reset-projects-via-bus — Borra proyectos del sistema vivo Enki publicando
 * eventos al bus MQTT (cero rm -rf de shell, cero fs.unlink directo). Cumple
 * la clausula transversal "todo por eventos" canonizada en
 * arquitectura/decisiones/_contratos/storage-layout.contract.json (P9).
 *
 * Operacion: cliente MQTT externo (no modulo event-core). Publica
 * project.list.request, recibe project.list.response, filtra segun flags,
 * para cada candidato publica project.delete y espera project.deleted
 * filtrado por project_id. project-manager orquesta la cascada (cierre de
 * sqlite, fs.delete.request por cada path del proyecto, eliminacion de
 * symlinks de Caddy).
 *
 * CREACION DE PROYECTOS NUEVOS: este script SOLO borra. La creacion de
 * proyectos nuevos al layout canonico se hace por el usuario desde su chat
 * normal (project.create publicado por chat-io u otro canal). Mantiene la
 * disciplina de que el operador humano decide que proyectos existen.
 *
 * Uso:
 *   node scripts/audit-helpers/reset-projects-via-bus.js [opciones]
 *
 * Flags:
 *   --dry-run               No publica project.delete. Solo lista lo que haria.
 *   --yes                   Salta la confirmacion interactiva. Solo en CI/automation.
 *   --keep <csv>            Lista de slugs/ids a conservar (no borrar).
 *   --only <csv>            Lista de slugs/ids a borrar (el resto se ignora).
 *                           Mutuamente exclusivo con --keep.
 *   --broker <url>          Default: wss://enki-ai.online/mqtt o AUDIT_BROKER.
 *   --timeout <ms>          Timeout por respuesta. Default 10000.
 *   --pause <ms>            Pausa entre deletes. Default 500.
 *
 * Ejemplos:
 *   # Ver que borraria sin tocar nada (recomendado primero):
 *   node scripts/audit-helpers/reset-projects-via-bus.js --dry-run
 *
 *   # Borrar todo menos vapersalhama:
 *   node scripts/audit-helpers/reset-projects-via-bus.js --keep vapersalhama
 *
 *   # Borrar solo los UUIDs huerfanos:
 *   node scripts/audit-helpers/reset-projects-via-bus.js --only 00939fa3-5ba7-40ab-803b-e6c21ea06359,37bc1282-e44c-467c-bb75-3d605255c9d2
 *
 * Salida: log linea por linea con cada publish y cada response correlacionada.
 * El bus queda capturable por capture-bus.js para auditoria.
 *
 * Manual operativo: arquitectura/decisiones/_contratos/manual-mqtt-conexion-directa.contract.json
 */

'use strict';

const mqtt = require('mqtt');
const crypto = require('crypto');
const readline = require('readline');

function parseArgs(argv) {
  const flags = {
    dryRun: false,
    yes: false,
    keep: [],
    only: [],
    broker: process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt',
    timeout: 10000,
    pause: 500,
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
      console.log(require('fs').readFileSync(__filename, 'utf-8').split('\n').slice(2, 50).join('\n').replace(/^ \*\s?/gm, ''));
      process.exit(0);
    }
  }
  if (flags.keep.length > 0 && flags.only.length > 0) {
    console.error('ERROR: --keep y --only son mutuamente exclusivos.');
    process.exit(2);
  }
  return flags;
}

function envelope(eventType, data) {
  return {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    timestamp: new Date().toISOString(),
    source: { core_id: 'reset-projects-helper' },
    data,
    metadata: {}
  };
}

function publish(client, eventType, data) {
  const env = envelope(eventType, data);
  // Topic canonical: replace '.' with '/' (manual-mqtt-conexion-directa)
  const topic = 'core/*/events/' + eventType.replace(/\./g, '/');
  client.publish(topic, JSON.stringify(env));
  return env;
}

function waitForEvent(client, expectedType, predicate, timeoutMs) {
  const subTopic = 'core/+/events/' + expectedType.replace(/\./g, '/');
  return new Promise((resolve, reject) => {
    let settled = false;
    const onMessage = (topic, message) => {
      try {
        const env = JSON.parse(message.toString());
        if (env.event_type !== expectedType) return;
        if (!predicate(env)) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        client.unsubscribe(subTopic);
        resolve(env);
      } catch (_) {}
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.removeListener('message', onMessage);
      client.unsubscribe(subTopic);
      reject(new Error(`timeout waiting for ${expectedType} (${timeoutMs}ms)`));
    }, timeoutMs);
    client.on('message', onMessage);
    client.subscribe(subTopic, (err) => {
      if (err && !settled) {
        settled = true;
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        reject(err);
      }
    });
  });
}

async function listProjects(client, timeoutMs) {
  const requestId = crypto.randomUUID();
  const promise = waitForEvent(client, 'project.list.response',
    env => env.data?.request_id === requestId, timeoutMs);
  // Pequeña pausa para asegurar que subscribe se completo antes del publish
  await new Promise(r => setTimeout(r, 200));
  publish(client, 'project.list.request', { request_id: requestId });
  const resp = await promise;
  return resp.data?.projects || [];
}

async function deleteProject(client, project, timeoutMs) {
  // project.delete -> project-manager orquesta y publica project.deleted al terminar
  const promise = waitForEvent(client, 'project.deleted',
    env => env.data?.project_id === project.id, timeoutMs);
  await new Promise(r => setTimeout(r, 100));
  publish(client, 'project.delete', { project_id: project.id });
  return promise;
}

function confirmInteractive(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  console.error(`[reset] broker=${flags.broker}  dryRun=${flags.dryRun}  keep=${flags.keep.join(',') || '(none)'}  only=${flags.only.join(',') || '(all)'}`);

  const client = mqtt.connect(flags.broker, {
    clientId: 'reset-projects-' + crypto.randomUUID().slice(0, 8),
    connectTimeout: 8000,
    reconnectPeriod: 0
  });

  try {
    await new Promise((res, rej) => {
      client.once('connect', res);
      client.once('error', rej);
      setTimeout(() => rej(new Error('connect timeout')), 8000);
    });
    console.error('[reset] mqtt connected');

    // 1. Listar
    const projects = await listProjects(client, flags.timeout);
    console.error(`[reset] sistema reporta ${projects.length} proyectos`);

    // 2. Filtrar
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
      console.log(`  - ${p.id}  name=${JSON.stringify(p.name || '(no name)')}  slug=${p.slug || '(no slug)'}  base_path=${p.base_path || '(none)'}`);
    }
    if (toKeep.length > 0) {
      console.log('\n=== A CONSERVAR (' + toKeep.length + ') ===');
      for (const p of toKeep) {
        console.log(`  - ${p.id}  name=${JSON.stringify(p.name || '(no name)')}  slug=${p.slug || '(no slug)'}`);
      }
    }

    if (flags.dryRun) {
      console.error('\n[reset] DRY-RUN: no se publica project.delete. Fin.');
      client.end();
      return;
    }

    if (toDelete.length === 0) {
      console.error('\n[reset] nada que borrar segun los filtros. Fin.');
      client.end();
      return;
    }

    // 3. Confirmar
    if (!flags.yes) {
      const answer = await confirmInteractive(
        `\n[reset] CONFIRMA: escribe exactamente DELETE para borrar los ${toDelete.length} proyectos listados arriba: `
      );
      if (answer !== 'DELETE') {
        console.error('[reset] confirmacion incorrecta. Abortado.');
        client.end();
        process.exit(1);
      }
    }

    // 4. Borrar uno por uno con pausa
    console.error('\n[reset] empezando borrado...');
    const results = { ok: 0, failed: 0 };
    for (const p of toDelete) {
      const t0 = Date.now();
      try {
        const resp = await deleteProject(client, p, flags.timeout);
        const dur = Date.now() - t0;
        console.log(`  OK    ${p.id} (${p.name || ''})  ${dur}ms  status=${resp.data?.status || 'deleted'}`);
        results.ok++;
      } catch (e) {
        console.log(`  FAIL  ${p.id} (${p.name || ''})  error=${e.message}`);
        results.failed++;
      }
      if (flags.pause > 0) await new Promise(r => setTimeout(r, flags.pause));
    }

    console.error(`\n[reset] fin. ok=${results.ok} failed=${results.failed} total=${toDelete.length}`);
    client.end();
    if (results.failed > 0) process.exit(1);
  } catch (e) {
    console.error('[reset] error:', e.message);
    try { client.end(true); } catch (_) {}
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { listProjects, deleteProject };
