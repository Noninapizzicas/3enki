#!/usr/bin/env node
/**
 * recolectar-anatomia.js — REFLEJO de piel-del-sistema, Fase 1.
 *
 * Consulta las cúpulas de un proyecto y produce la anatomía JSON
 * que alimenta spec-maker.js.
 *
 * Dos modos:
 *   MQTT  → consulta cúpulas por el bus (Enki vivo)
 *   LOCAL → lee archivos del proyecto (fallback universal)
 *
 * Uso:
 *   node recolectar-anatomia.js <project_id>          # vía MQTT
 *   node recolectar-anatomia.js --local <path>        # vía filesystem
 *   node recolectar-anatomia.js --stdin               # anatomía manual
 */

'use strict';

const MODE = process.argv[2];
const ARG  = process.argv[3];
const OUT  = process.argv.includes('--json') ? 'json' : 'human';

// ── MODO LOCAL (fallback universal) ──
function explorarLocal(rootPath) {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(rootPath || '.');

  const identidad = { name: path.basename(root), tipo: 'unknown', marca: null };

  // Intentar leer package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    identidad.name = pkg.name || identidad.name;
    identidad.tipo = pkg.type || pkg.keywords?.[0] || 'unknown';
  } catch {}

  // Intentar README
  try {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf-8').substring(0, 200);
    identidad.descripcion = readme;
  } catch {}

  // Detectar estructura
  const dominios = [];
  try {
    const dirs = fs.readdirSync(root, { withFileTypes: true });
    const mods = dirs.filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('node_modules'));
    for (const d of mods.slice(0, 10)) {
      dominios.push({ clave: d.name, titulo: d.name.replace(/[-_]/g, ' '), muestra: null });
    }
  } catch {}

  return {
    identidad,
    dominios,
    capacidades: [],
    cupulas: []
  };
}

// ── MODO STDIN ──
function desdeStdin() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.on('data', c => raw += c);
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('JSON inválido en stdin')); }
    });
  });
}

// ── MODO MQTT (conexión a Enki vivo) ──
async function desdeMqtt(projectId) {
  // Requiere mqtt. Si no está, falla a local simulado.
  let mqtt;
  try { mqtt = require('mqtt'); }
  catch { return explorarLocal('.'); }

  const BROKER = process.env.ENKI_BROKER || 'wss://enki-ai.online/mqtt';
  const client = mqtt.connect(BROKER, { connectTimeout: 10000 });

  const rpc = (domain, action, data, timeout = 10000) => new Promise((res, rej) => {
    const requestId = require('crypto').randomUUID();
    const topic = `ui/request/${domain}/${action}`;
    const respTopic = `ui/response/${requestId}`;
    const t = setTimeout(() => { client.unsubscribe(respTopic); rej(new Error('timeout')); }, timeout);

    client.subscribe(respTopic, () => {
      client.on('message', (t, m) => {
        if (t === respTopic) {
          clearTimeout(t);
          client.unsubscribe(respTopic);
          try { res(JSON.parse(m.toString())); }
          catch { rej(new Error('invalid JSON response')); }
        }
      });
      client.publish(topic, JSON.stringify({ request_id: requestId, data }));
    });
  });

  await new Promise(r => client.on('connect', r));

  try {
    const [vista, caps, cupList] = await Promise.all([
      rpc('cupulas', 'vista_proyecto', { project_id: projectId }).catch(() => ({ data: null })),
      rpc('ui', 'request/cupula-eventos/buscar_capacidad', { project_id: projectId, query: '' }).catch(() => ({ data: [] })),
      rpc('cupulas', 'listar_cupulas', { project_id: projectId }).catch(() => ({ data: [] }))
    ]);

    client.end();

    const identidad = vista?.data?.identidad || { name: projectId, tipo: 'unknown', marca: null };
    const dominios = Array.isArray(vista?.data?.dominios) ? vista.data.dominios : [];
    const capacidades = Array.isArray(caps?.data) ? caps.data.map(c => ({
      name: c.name || c.nombre,
      tipo: c.tipo || 'rpc',
      descripcion: c.descripcion || c.description || '',
      request_shape: c.request_shape || c.parameters || null
    })) : [];
    const cupulas = Array.isArray(cupList?.data) ? cupList.data.map(c => ({
      id: c.id || c.tema,
      tipo: c.tipo || '',
      notas_count: c.notas_count || 0
    })) : [];

    return { identidad, dominios, capacidades, cupulas };

  } catch (e) {
    client.end();
    throw e;
  }
}

// ── MAIN ──
(async () => {
  let anatomia;

  if (MODE === '--local') {
    anatomia = explorarLocal(ARG);
  } else if (MODE === '--stdin') {
    anatomia = await desdeStdin();
  } else if (MODE && !MODE.startsWith('--')) {
    anatomia = await desdeMqtt(MODE);
  } else {
    // Sin argumentos: intenta project_id del entorno o local
    anatomia = process.env.PROJECT_ID
      ? await desdeMqtt(process.env.PROJECT_ID)
      : explorarLocal('.');
  }

  if (OUT === 'json') {
    process.stdout.write(JSON.stringify(anatomia) + '\n');
  } else {
    console.log(JSON.stringify(anatomia, null, 2));
  }
})().catch(e => {
  console.error('recolectar-anatomia: error —', e.message);
  process.exit(1);
});
