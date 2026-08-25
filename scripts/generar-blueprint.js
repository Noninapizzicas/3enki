#!/usr/bin/env node
/**
 * generar-blueprint.js — Reflejo determinista.
 * Dado un slug de módulo, lee su module.json y genera el blueprint.json
 * de interfaz con las 4 zonas operacionales, SIN usar LLM.
 *
 * Uso: node scripts/generar-blueprint.js <slug> [--deploy]
 *   --deploy: copia a /opt/enki tras generar
 */

const fs = require('fs');
const path = require('path');

const REPO_MODULES = '/home/admin/3enki/modules';
const DEPLOY_MODULES = '/opt/enki/modules';

// ── Utils ──

function slug(s) {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function tipoField(type) {
  return { string: 'text', number: 'number', boolean: 'checkbox', integer: 'number' }[type] || 'text';
}

function eventLabel(ev) {
  return ev.replace(/\.request$|\.response$/g, '').replace(/\./g, ' ').replace(/_/g, ' ').trim();
}

function esLectura(name) {
  return /get\.|\.get|listar|obtener|leer|buscar|show|status|health/i.test(name);
}

function esEscritura(name) {
  return /crear|actualizar|update|set|delete|remove|cambiar|enviar|add|push|borrar/i.test(name);
}

// ── Normalizar subscribes (array → dict; dict → dict) ──

function normalizarSubscribes(subs) {
  if (!subs) return {};
  if (Array.isArray(subs)) {
    const out = {};
    for (const s of subs) {
      if (s && s.event) out[s.event] = s.handler || s.description || true;
    }
    return out;
  }
  return subs;
}

// ── Obtener eventos de tools de un módulo ──

function extraerEventos(tools) {
  const eventos = [];

  for (const t of (tools || [])) {
    const name = t.name;
    if (!name) continue;

    const params = (t.parameters && t.parameters.properties) || {};
    const required = new Set((t.parameters && t.parameters.required) || []);

    if (esLectura(name)) {
      eventos.push({ tipo: 'dato', name, label: eventLabel(name), desc: (t.description || '').substring(0, 120) });
    } else {
      const args = Object.entries(params)
        .filter(([k]) => k !== 'project_id')
        .map(([k, v]) => ({
          name: k,
          type: tipoField(v.type || 'string'),
          label: (v.title || k).replace(/_/g, ' '),
          required: required.has(k),
        }));

      eventos.push({
        tipo: esEscritura(name) ? 'operacion' : 'accion',
        name,
        label: eventLabel(name),
        desc: (t.description || '').substring(0, 120),
        args: args.length > 0 ? args : undefined,
        confirm: esEscritura(name) || args.some(a => a.required) || undefined,
      });
    }
  }

  return eventos;
}

// ── Buscar module.json (con resolución de verticales) ──

function buscarModulo(baseDir, slugModule) {
  const dirs = [
    path.join(baseDir, slugModule),
    ...['pizzepos', 'prisma'].map(v => path.join(baseDir, v, slugModule)),
  ];
  for (const d of dirs) {
    const p = path.join(d, 'module.json');
    if (fs.existsSync(p)) return { dir: d, path: p };
  }
  return null;
}

// ── Generar blueprint ──

function generar(slugModule, deploy) {
  // Buscar en repo (escribible)
  let found = buscarModulo(REPO_MODULES, slugModule);
  const origen = found ? 'repo' : null;

  if (!found) {
    // Buscar en deploy (solo lectura)
    found = buscarModulo(DEPLOY_MODULES, slugModule);
    if (!found) {
      console.error(`❌ Módulo "${slugModule}" no encontrado ni en repo ni en deploy`);
      process.exit(1);
    }
  }

  const raw = fs.readFileSync(found.path, 'utf-8');
  const mod = JSON.parse(raw);
  const name = mod.name || slugModule.split('/').pop();
  const description = mod.description || name;
  const tools = mod.tools || [];
  const subscribesDict = normalizarSubscribes(mod.subscribes);
  const uiDecision = mod.ui_decision || { type: 'workspace_module', zone: 'modulos' };

  const eventos = extraerEventos(tools);

  const operaciones = eventos.filter(e => e.tipo === 'operacion').map(({ tipo, ...rest }) => rest);
  const acciones = eventos.filter(e => e.tipo === 'accion').map(({ tipo, ...rest }) => rest);
  const datos = eventos.filter(e => e.tipo === 'dato').map(({ tipo, ...rest }) => ({
    ...rest,
    refresh_on: Object.keys(subscribesDict).filter(s => s.includes(name)),
  }));

  // Eventos en vivo: los subscribes del module.json (NO las tools)
  const eventosVivo = Object.entries(subscribesDict).map(([ev]) => ({
    event: ev,
    label: eventLabel(ev),
  }));

  const blueprint = {
    schema: 'blueprint-interfaz-v1',
    moduleId: name,
    titulo: description.charAt(0).toUpperCase() + description.slice(1),
    ui: {
      type: uiDecision.type || 'workspace_module',
      zone: uiDecision.zone || 'modulos',
      ...(operaciones.length && { operaciones }),
      ...(acciones.length && { acciones }),
      ...(datos.length && { datos }),
      ...(eventosVivo.length && { eventos_que_escucho: eventosVivo }),
    },
  };

  // Escribir en repo
  const outDir = path.join(REPO_MODULES, slugModule);
  const outPath = path.join(outDir, `${name}.blueprint.json`);
  const contenido = JSON.stringify(blueprint, null, 2) + '\n';

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, contenido, 'utf-8');
    console.log(`✅ Blueprint: ${outPath}`);
  } catch (e) {
    // Directorio de www-data — escribir a /tmp y reportar
    const tmpPath = `/tmp/${slugModule}.blueprint.json`;
    fs.writeFileSync(tmpPath, contenido, 'utf-8');
    console.log(`⚠️  No se pudo escribir en repo (permisos): ${outPath}`);
    console.log(`   Archivo temporal: ${tmpPath}`);
    console.log(`   Para copiar: sudo cp ${tmpPath} ${outPath} && sudo chown admin:admin ${outPath}`);
  }

  // Copiar a deploy si --deploy
  if (deploy) {
    const deployDir = path.join(DEPLOY_MODULES, slugModule);
    const deployPath = path.join(deployDir, `${name}.blueprint.json`);
    try {
      fs.mkdirSync(deployDir, { recursive: true });
      fs.writeFileSync(deployPath, JSON.stringify(blueprint, null, 2) + '\n', 'utf-8');
      console.log(`✅ Deploy:    ${deployPath}`);
    } catch (e) {
      console.log(`⚠️  No se pudo escribir en deploy (permisos): ${e.message}`);
    }
  }

  console.log(`   ${operaciones.length} ops · ${acciones.length} acciones · ${datos.length} datos · ${eventosVivo.length} eventos`);
}

// ── Arranque ──

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const deploy = args.includes('--deploy');

if (!target) {
  console.error('Uso: node scripts/generar-blueprint.js <slug> [--deploy]');
  process.exit(1);
}

try {
  generar(slug(target), deploy);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
