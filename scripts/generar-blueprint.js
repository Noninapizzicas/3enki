#!/usr/bin/env node
/**
 * generar-blueprint.js — Reflejo determinista.
 * Dado un slug de módulo, lee su module.json y genera el blueprint.json
 * de interfaz con las 4 zonas operacionales + el trío frontend
 * (manifest.json + index.ts + Panel.svelte), SIN usar LLM.
 *
 * Uso: node scripts/generar-blueprint.js <slug> [--deploy] [--no-frontend]
 *   --deploy: copia a /opt/enki tras generar
 *   --no-frontend: solo genera el blueprint, sin el trío frontend
 */

const fs = require('fs');
const path = require('path');

const REPO_MODULES = '/home/admin/3enki/modules';
const DEPLOY_MODULES = '/opt/enki/modules';
const REPO_FRONTEND = '/home/admin/3enki/frontend/src/lib/modules';

// ── Utils ──

function slug(s) {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function pascalCase(s) {
  return String(s || '').split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
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

// ── Extraer eventos de ui_handlers ──

function extraerEventosDeUiHandlers(uiHandlers) {
  const eventos = [];
  for (const h of (uiHandlers || [])) {
    if (!h.action) continue;
    const name = `${h.domain || 'mod'}.${h.action}`;
    if (esLectura(h.action)) {
      eventos.push({ tipo: 'dato', name, label: eventLabel(name), desc: '' });
    } else {
      eventos.push({
        tipo: esEscritura(h.action) ? 'operacion' : 'accion',
        name,
        label: eventLabel(name),
        desc: '',
      });
    }
  }
  return eventos;
}

// ── Generar trío frontend ──

function generarFrontend(slugModule, name, description, blueprint, uiDecision) {
  const pascal = pascalCase(name);
  const icon = uiDecision.icon || '📦';
  const zone = uiDecision.zone || 'modulos';
  const order = uiDecision.order || 50;
  const label = pascal;
  const frontDir = path.join(REPO_FRONTEND, slugModule);

  const manifest = {
    id: name,
    name: pascal,
    version: '0.1.0',
    zone,
    order,
    icon,
    label,
  };

  const indexTs = `import type { UIModule } from '$lib/ui-core';
import ${pascal}Panel from './${pascal}Panel.svelte';

export const ${name.replace(/-/g, '_')}Module: UIModule = {
  manifest: {
    id: '${name}',
    name: '${pascal}',
    version: '0.1.0',
    zone: '${zone}',
    button: {
      id: '${name}-btn',
      icon: '${icon}',
      label: '${label}',
      action: { type: 'panel', panelId: '${name}-panel' },
      order: ${order}
    },
    panels: [{
      id: '${name}-panel',
      title: '${pascal}',
      size: 'lg'
    }]
  },
  PanelComponent: ${pascal}Panel
};

export default ${name.replace(/-/g, '_')}Module;

export { default as ${pascal}Panel } from './${pascal}Panel.svelte';
`;

  const panelSvelte = `<script lang="ts">
  import BlueprintForm from '$lib/components/blueprint-form/BlueprintForm.svelte';
  import blueprint from './${name}.blueprint.json';

  export let panelId = '';
</script>

<div data-${name}-panel={panelId}>
  <BlueprintForm {blueprint} moduleId="${name}" titulo="${icon} ${pascal} — generado del blueprint" />
</div>
`;

  try {
    fs.mkdirSync(frontDir, { recursive: true });
    fs.writeFileSync(path.join(frontDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(path.join(frontDir, 'index.ts'), indexTs, 'utf-8');
    fs.writeFileSync(path.join(frontDir, `${pascal}Panel.svelte`), panelSvelte, 'utf-8');
    fs.writeFileSync(path.join(frontDir, `${name}.blueprint.json`), JSON.stringify(blueprint, null, 2) + '\n', 'utf-8');
    console.log(`✅ Frontend: ${frontDir}/`);
    console.log(`   manifest.json · index.ts · ${pascal}Panel.svelte · ${name}.blueprint.json`);
  } catch (e) {
    console.log(`⚠️  No se pudo escribir frontend (permisos): ${e.message}`);
    console.log(`   Dir: ${frontDir}`);
  }
}

function generar(slugModule, deploy, noFrontend) {
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
  const uiHandlers = mod.ui_handlers || [];
  const subscribesDict = normalizarSubscribes(mod.subscribes);
  const uiDecision = mod.ui_decision || { type: 'workspace_module', zone: 'modulos' };

  const eventosTools = extraerEventos(tools);
  const eventosHandlers = extraerEventosDeUiHandlers(uiHandlers);
  const nombresVistos = new Set(eventosTools.map(e => e.name));
  const eventos = [...eventosTools, ...eventosHandlers.filter(e => !nombresVistos.has(e.name))];

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

  // Generar trío frontend (manifest + index.ts + Panel.svelte + blueprint copy)
  if (!noFrontend) {
    generarFrontend(slugModule, name, description, blueprint, uiDecision);
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
const noFrontend = args.includes('--no-frontend');

if (!target) {
  console.error('Uso: node scripts/generar-blueprint.js <slug> [--deploy] [--no-frontend]');
  process.exit(1);
}

try {
  generar(slug(target), deploy, noFrontend);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
