#!/usr/bin/env node
/**
 * list-orphan-projects — Lista directorios en /opt/enki/data/projects/ que NO
 * tienen contraparte en la base de datos de project-manager.
 *
 * DRY-RUN: solo imprime lo que se podria borrar. NO borra nada.
 *
 * Uso:
 *   node scripts/audit-helpers/list-orphan-projects.js
 *
 * Resultado: lista de directorios marcados como:
 *   - ORPHAN       → en disco, no en DB. Candidato a borrar.
 *   - TEMPLATE     → '_ejemplo', '_prompts' u otro con prefijo '_'. Conservar.
 *   - REPO_LEAK    → '2enki' u otro directorio del repo accidentalmente bajo projects/.
 *   - BAD_NAME     → 'undefined', '' u otro nombre invalido (sintoma del bug 2).
 *   - OK           → existe en disco Y en DB (con base_path matching).
 *   - DB_NO_DISK   → existe en DB pero NO en disco. Sintoma de drift inverso.
 *
 * Tras revisar manualmente el output, el usuario decide qué borrar.
 */
'use strict';
const mqtt = require('mqtt');
const crypto = require('crypto');
const path = require('path');

const BROKER = process.env.AUDIT_BROKER || 'wss://enki-ai.online/mqtt';
const PROJECTS_DIR = '/opt/enki/data/projects';

function uuidv4Like(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

(async () => {
  const c = mqtt.connect(BROKER, { clientId: 'orphan-probe-' + Date.now(), connectTimeout: 8000, reconnectPeriod: 0 });
  await new Promise(r => c.on('connect', r));

  // 1. Pedir proyectos al bus
  const listReq = crypto.randomUUID();
  const dbProjects = await new Promise((resolve, reject) => {
    c.subscribe('core/+/events/project/list/response', () => {
      c.publish('core/*/events/project/list/request', JSON.stringify({
        event_id: crypto.randomUUID(), event_type: 'project.list.request',
        timestamp: new Date().toISOString(),
        source: { core_id: 'orphan-helper' },
        data: { request_id: listReq }, metadata: {}
      }));
    });
    c.on('message', (t, m) => {
      try {
        const d = JSON.parse(m.toString()).data || {};
        if (d.request_id !== listReq) return;
        resolve(d.projects || []);
      } catch {}
    });
    setTimeout(() => reject(new Error('timeout project.list')), 8000);
  });

  // 2. Listar directorios en disco via fs.list (project_id = Sistema, que tiene basePath en /opt/enki)
  // Si no tenemos un proyecto que apunte al root, usamos cualquier proyecto y la ruta '../..'.
  // Para simplicidad, leemos el filesystem local si el script corre en el VPS, o via bus si fuera.
  // Aqui asumimos ejecucion local en el VPS:
  const fs = require('fs');
  let diskEntries = [];
  try {
    diskEntries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch (err) {
    console.error(`No puedo leer ${PROJECTS_DIR}: ${err.message}`);
    console.error('Si no estas ejecutando este script en el VPS, no funcionara. SSH al server y vuelve a ejecutar.');
    c.end(true);
    process.exit(2);
  }

  // 3. Mapear: cada directorio del disco contra la DB
  const dbBasenames = new Map();  // basename → project
  for (const p of dbProjects) {
    if (!p.base_path) continue;
    const bn = path.basename(p.base_path);
    dbBasenames.set(bn, p);
  }

  const RESERVED = new Set(['_ejemplo', '_prompts', 'sistema', 'system']);
  const REPO_NAMES = new Set(['2enki', '1enki', 'enki', 'node_modules']);

  const findings = [];
  for (const dir of diskEntries) {
    if (dbBasenames.has(dir)) {
      findings.push({ status: 'OK', dir, note: `→ DB project '${dbBasenames.get(dir).name}'` });
    } else if (dir === 'undefined' || dir === '' || dir === 'null') {
      findings.push({ status: 'BAD_NAME', dir, note: 'sintoma del Bug 2 (project-manager no validaba name)' });
    } else if (RESERVED.has(dir)) {
      findings.push({ status: 'TEMPLATE', dir, note: 'reservado/plantilla — conservar' });
    } else if (REPO_NAMES.has(dir)) {
      findings.push({ status: 'REPO_LEAK', dir, note: 'directorio del repo bajo projects/ — revisar' });
    } else if (uuidv4Like(dir)) {
      findings.push({ status: 'ORPHAN', dir, note: 'UUID huerfano sin entrada en DB' });
    } else {
      findings.push({ status: 'ORPHAN', dir, note: 'nombre legible huerfano sin entrada en DB' });
    }
  }

  // 4. Detectar drift inverso (en DB pero no en disco)
  const diskSet = new Set(diskEntries);
  for (const [bn, p] of dbBasenames) {
    if (!diskSet.has(bn)) {
      findings.push({ status: 'DB_NO_DISK', dir: bn, note: `proyecto '${p.name}' (${p.id}) sin directorio en disco` });
    }
  }

  // 5. Imprimir agrupado
  const ORDER = ['OK', 'TEMPLATE', 'REPO_LEAK', 'BAD_NAME', 'ORPHAN', 'DB_NO_DISK'];
  findings.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  console.log('═══ Auditoria de directorios en ' + PROJECTS_DIR + ' ═══');
  console.log('DB tiene ' + dbProjects.length + ' proyectos | Disco tiene ' + diskEntries.length + ' directorios');
  console.log();
  for (const f of findings) {
    console.log('  [' + f.status.padEnd(11) + '] ' + f.dir.padEnd(40) + ' | ' + f.note);
  }
  console.log();
  console.log('═══ Resumen ═══');
  const summary = {};
  for (const f of findings) summary[f.status] = (summary[f.status] || 0) + 1;
  for (const [k, v] of Object.entries(summary)) console.log('  ' + k + ': ' + v);
  console.log();
  console.log('Este script NO borra nada. Revisa manualmente cada ORPHAN/BAD_NAME/REPO_LEAK');
  console.log('antes de decidir qué eliminar. Para borrar un directorio concreto:');
  console.log('  sudo rm -rf ' + PROJECTS_DIR + '/<nombre>');

  c.end(true);
  process.exit(0);
})();
