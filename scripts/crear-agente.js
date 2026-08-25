#!/usr/bin/env node
/**
 * crear-agente.js — Asistente interactivo para crear agentes/pipelines Enki
 * Inspirado en `crewai create crew` (CrewAI).
 *
 * Guía paso a paso: nombre → identidad (role+goal+backstory) → pasos → entregable → presupuesto
 * Genera: modules/agentes/registro/store/<name>.json + pipelines/<name>.json
 *
 * Uso: node scripts/crear-agente.js [--dir /opt/enki]
 *       --dir: directorio raíz de Enki (default: /home/admin/3enki)
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────
const ENKI_DIR = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : '/home/admin/3enki';

const STORE_DIR = path.join(ENKI_DIR, 'modules/cosecha/cantera/enki/agentes');
const ESPEJO_DIR = path.join(ENKI_DIR, 'modules/cosecha/cantera/enki/agentes');

// ── Utilidades de terminal ─────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt, defaultVal = '') {
  return new Promise((resolve) => {
    const full = defaultVal ? `  ${prompt} [${defaultVal}] > ` : `  ${prompt} > `;
    rl.question(full, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function confirm(prompt, defaultVal = false) {
  return new Promise((resolve) => {
    const defaultStr = defaultVal ? 'Y/n' : 'y/N';
    rl.question(`  ${prompt} [${defaultStr}] > `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === 'y' || a === 'yes') resolve(true);
      else if (a === 'n' || a === 'no') resolve(false);
      else resolve(defaultVal);
    });
  });
}

function pick(label, options) {
  return new Promise((resolve) => {
    console.log(`\n  ${label}:`);
    options.forEach((opt, i) => {
      const desc = opt.description ? ` — ${opt.description}` : '';
      console.log(`    ${i + 1}. ${opt.name}${desc}`);
    });
    rl.question(`  Elige (1-${options.length}) > `, (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < options.length) resolve(options[idx]);
      else resolve(options[0]);
    });
  });
}

function br() { console.log(); }

function header(text) {
  br();
  console.log(`  ┌─ ${'─'.repeat(text.length + 2)}─┐`);
  console.log(`  │   ${text}   │`);
  console.log(`  └─ ${'─'.repeat(text.length + 2)}─┘`);
  br();
}

function success(text) {
  console.log(`  ✅ ${text}`);
}

function info(text) {
  console.log(`  ℹ️  ${text}`);
}

// ── Catálogo de pasos reutilizables ───────────────────────────────

const PASOS_REFLEJO = [
  { name: 'escribir',    description: 'Escribe el entregable en disco' },
  { name: 'commitar',    description: 'Git add + commit + push del entregable' },
  { name: 'leer_plan',   description: 'Lee el plan de construcción y lo inyecta al fuzzy' },
  { name: 'leer_rail',   description: 'Lee el rail de estados (tareas pendientes)' },
  { name: 'verificar',   description: 'Verifica el entregable contra las reglas' },
  { name: 'personalizado', description: 'Reflejo con operación personalizada (texto libre)' },
];

const TIPOS_PASO = [
  { name: 'fuzzy',    description: 'El LLM genera contenido (único paso no determinista)' },
  { name: 'reflejo',  description: 'Determinista: opera sobre el mundo real (escribir, commitar, etc.)' },
];

const ENTREGABLE_TIPOS = [
  { name: 'fs',       description: 'Archivo/s en disco' },
  { name: 'juicio',   description: 'El JEFE no puede verificar — se reporta como NO verificable' },
  { name: 'evento',   description: 'El entregable es un evento en el bus (no archivo)' },
  { name: 'ninguno',  description: 'Sin entregable (agente v1, success con verificado:false)' },
];

const REGLAS_JEFE = [
  { name: 'existe',              description: 'El archivo existe en disco' },
  { name: 'api_real',            description: 'El .js tiene require _shared + _atender 4 args' },
  { name: 'en_repo',             description: 'Commiteado en git (commit real, no staging)' },
  { name: 'requires_resueltos',  description: 'Todos los require relativos apuntan a archivos existentes' },
  { name: 'contenido_min',       description: 'El contenido supera un mínimo de caracteres' },
  { name: 'interfaz_operativa',  description: 'El trío frontend existe (manifest+index+Panel)' },
  { name: 'interfaz_decidida',   description: 'El module.json tiene ui_decision con type+zone' },
];

// ── Wizard principal ──────────────────────────────────────────────

async function wizard() {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   🧠  CREADOR DE AGENTES ENKI  🧠           ║');
  console.log('  ║   Inspirado en CrewAI · Pipelines v3        ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('\n  Crea un pipeline con identidad (role+goal+backstory),');
  console.log('  pasos deterministas+fuzzy, y entregable verificable.');
  console.log(`  Target: ${ENKI_DIR}`);
  br();

  // ── Paso 0: Nombre y descripción ──
  header('AGENTE');

  const name = await ask('Nombre del agente (slug, ej: analizar-mercado)');
  if (!name || !/^[a-z][a-z0-9-]{2,40}$/.test(name)) {
    console.log('  ❌ Nombre inválido. Debe ser slug (minúsculas, guiones, 3-40 chars).');
    rl.close();
    return;
  }

  // Verificar si ya existe
  const storePath = path.join(STORE_DIR, `${name}.json`);
  if (fs.existsSync(storePath)) {
    const overwrite = await confirm(`Ya existe un agente "${name}". ¿Sobrescribir?`, false);
    if (!overwrite) {
      console.log('  Cancelado.');
      rl.close();
      return;
    }
  }

  const description = await ask('Descripción (una línea, qué hace este agente)');

  // ── Paso 1: Identidad (CrewAI concept) ──
  header('IDENTIDAD (patrón CrewAI)');

  info('Define QUÉ es el agente, QUÉ busca, y QUIÉN es.');
  info('Esto se inyecta como system prompt en los pasos fuzzy.');

  const role = await ask('Role (ej: "Analista de Mercado Senior")');
  const goal = await ask('Goal (ej: "Realizar análisis profundo del mercado objetivo")');
  const backstory = await ask('Backstory (ej: "Eres un analista con 10 años de experiencia...")');

  const tieneIdentidad = role || goal || backstory;

  // ── Paso 2: Pasos ──
  header('PASOS (Pipeline)');

  info('Define los pasos del pipeline en orden. Cada paso es fuzzy o reflejo.');
  const pasos = [];

  let addMore = true;
  while (addMore) {
    const pasoName = await ask(`Nombre del paso ${pasos.length + 1} (ej: generar_analisis)`);
    if (!pasoName) break;

    const tipo = await pick('Tipo', TIPOS_PASO);
    const paso = { paso: pasoName, tipo: tipo.name };

    if (tipo.name === 'fuzzy') {
      br();
      info('Instrucción para el LLM. Sé específico: qué generar, formato, reglas.');
      info('Usa Ctrl+D (Linux) o Enter+Enter+Ctrl+C si necesitas varias líneas.');
      console.log('');
      let instruccion = await ask('Instrucción del paso fuzzy');

      const validarTamano = await confirm('¿Validar tamaño mínimo de salida?', true);
      const valida = {};
      if (validarTamano) {
        valida.tamano_min = parseInt(await ask('Tamaño mínimo (chars)', '200'), 10);
      }

      paso.instruccion = instruccion;
      if (Object.keys(valida).length > 0) paso.valida = valida;

    } else {
      // Reflejo — elegir operación
      const opcion = await pick('Operación del reflejo', PASOS_REFLEJO);
      paso.op = opcion.name;

      if (opcion.name === 'personalizado') {
        paso.op = await ask('Nombre de la operación personalizada');
      }

      if (opcion.name === 'leer_plan') {
        paso.plan = await ask('Ruta del plan', 'storage/esquemas/plan-construccion.md');
      }
    }

    pasos.push(paso);
    success(`${pasoName} (${tipo.name}) añadido`);
    br();
    addMore = await confirm('¿Añadir otro paso?', pasos.length < 2);
  }

  if (pasos.length === 0) {
    console.log('  ❌ Necesitas al menos un paso.');
    rl.close();
    return;
  }

  // ── Paso 3: Entregable ──
  header('ENTREGABLE');

  info('Define qué produce este agente y cómo lo verifica el JEFE.');

  const entTipo = await pick('Tipo de entregable', ENTREGABLE_TIPOS);
  const entregable = { tipo: entTipo.name };

  if (entTipo.name === 'fs') {
    const multiFile = await confirm('¿Multi-archivo (dir + archivos)?', true);

    if (multiFile) {
      entregable.dir = await ask('Directorio (ej: <slug> o frontend/src/lib/modules/<slug>)', '<slug>');
      entregable.archivos = [];
      let addFile = true;
      while (addFile) {
        const file = await ask(`  Archivo ${entregable.archivos.length + 1} (ej: index.js)`);
        if (file) entregable.archivos.push(file);
        addFile = await confirm('¿Añadir otro archivo?', entregable.archivos.length < 1);
        if (!file) break;
      }
    } else {
      entregable.path = await ask('Ruta del archivo (ej: storage/esquemas/esquema.md)');
    }

    // Reglas
    info('Reglas de verificación del JEFE (espacio para seleccionar):');
    const reglas = [];
    for (const regla of REGLAS_JEFE) {
      const incluir = await confirm(`  ${regla.name} — ${regla.description}`, 
        ['existe', 'en_repo'].includes(regla.name));
      if (incluir) reglas.push(regla.name);
    }
    if (reglas.length > 0) entregable.reglas = reglas;

    if (reglas.includes('contenido_min')) {
      entregable.min_chars = parseInt(await ask('Mínimo de caracteres', '500'), 10);
    }
  }

  // ── Paso 4: Presupuesto ──
  header('PRESUPUESTO');

  info('Límites de ejecución del agente.');
  const presupuesto = {
    generaciones_por_paso: parseInt(await ask('Generaciones por paso fuzzy', '3'), 10),
    max_tokens: parseInt(await ask('Máximo tokens de salida', '32000'), 10),
    generacion_timeout_ms: parseInt(await ask('Timeout por generación (ms)', '240000'), 10),
  };

  // ── Paso 5: Resumen ──
  header('RESUMEN');
  console.log(`  Nombre:       ${name}`);
  console.log(`  Descripción:  ${description}`);
  if (tieneIdentidad) {
    console.log(`  Role:         ${role || '(sin role)'}`);
    console.log(`  Goal:         ${goal || '(sin goal)'}`);
    console.log(`  Backstory:    ${(backstory || '').substring(0, 60)}${(backstory || '').length > 60 ? '...' : ''}`);
  }
  console.log(`  Pasos:        ${pasos.length}`);
  pasos.forEach(p => console.log(`    - ${p.paso} (${p.tipo})`));
  console.log(`  Entregable:   ${entregable.tipo}${entregable.path ? ' → ' + entregable.path : ''}${entregable.archivos ? ' → ' + entregable.archivos.length + ' archivos' : ''}`);
  console.log(`  Presupuesto:  ${presupuesto.max_tokens} tok, ${presupuesto.generacion_timeout_ms/1000}s timeout`);
  br();

  const confirmar = await confirm('¿Generar el agente?', true);
  if (!confirmar) {
    console.log('  Cancelado.');
    rl.close();
    return;
  }

  // ── Generar JSON ────────────────────────────────────────────────
  const identidad = {};
  if (role) identidad.role = role;
  if (goal) identidad.goal = goal;
  if (backstory) identidad.backstory = backstory;

  const pipeline = {
    name,
    description,
    ...(tieneIdentidad ? { identidad } : {}),
    pasos,
    entregable,
    presupuesto,
  };

  // ── Guardar ─────────────────────────────────────────────────────
  const json = JSON.stringify(pipeline, null, 2) + '\n';

  // Store principal
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(storePath, json, 'utf-8');
  success(`Store: ${storePath}`);

  // Espejo (esquema)
  fs.mkdirSync(ESPEJO_DIR, { recursive: true });
  const espejoPath = path.join(ESPEJO_DIR, `${name}.json`);
  fs.writeFileSync(espejoPath, json, 'utf-8');
  success(`Espejo: ${espejoPath}`);

  // ── Resumen final ──────────────────────────────────────────────
  br();
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   ✅ AGENTE CREADO                             ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  br();
  console.log(`  Para invocarlo desde el chat de Enki:`);
  console.log(`    invoke_agent("${name}", { task: "..." })`);
  br();
  console.log(`  O por MQTT:`);
  console.log(`    agent.execute.request → { name: "${name}", task: "..." }`);
  br();
  console.log(`  Para versionarlo:`);
  console.log(`    cd ${ENKI_DIR}`);
  console.log(`    git add modules/cosecha/cantera/enki/agentes/${name}.json`);
  br();

  rl.close();
}

// ── Arranque ──────────────────────────────────────────────────────

wizard().catch((err) => {
  console.error('  ❌ Error:', err.message);
  process.exit(1);
});
