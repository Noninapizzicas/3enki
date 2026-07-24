#!/usr/bin/env node
/**
 * generar-skill-backend.js
 *
 * Dado un módulo de 3enki, genera su SKILL.md para la cantera.
 * Lee module.json + index.js y produce el contrato completo.
 *
 * Uso:
 *   node .claude/skills/generar-ui-web/generar-skill-backend.js modules/prisma/carrito
 *
 * Opciones:
 *   --dry-run    Solo muestra la salida, no escribe
 *   --output     Directorio destino (default: modules/cosecha/cantera/enki/<nombre>)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');  // 3enki/
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MODULE_PATH = args.find(a => !a.startsWith('--')) || '';

if (!MODULE_PATH) {
  console.error('Uso: node generar-skill-backend.js <ruta-modulo> [--dry-run] [--output <dir>]');
  process.exit(1);
}

// ── Lectura ──
const moduleDir = path.resolve(ROOT, MODULE_PATH);
const mfPath = path.join(moduleDir, 'module.json');
const idxPath = path.join(moduleDir, 'index.js');

const manifest = JSON.parse(fs.readFileSync(mfPath, 'utf-8'));
const source = fs.existsSync(idxPath) ? fs.readFileSync(idxPath, 'utf-8') : '';

const name = manifest.name || path.basename(moduleDir);
const desc = manifest.description || manifest._doc || `Módulo ${name}`;
const doc = manifest._doc || '';
const events = manifest.subscribes || [];

// ── Analizar código fuente para payloads ──
function extractFunctionSignature(code, fnName) {
  const rx = new RegExp(`${fnName}\\s*[:=]\\s*(?:async\\s*)?\\(([^)]*)\\)`, 'm');
  const m = code.match(rx);
  if (m) return `(${m[1]})`;
  return '(data)';
}

function extractPayloads(code, eventName) {
  // Intenta encontrar ejemplos de payload en los comentarios o el código
  const result = {};
  const shortName = eventName.split('.').pop() || eventName;
  
  // Busca comentarios con ejemplos de payload
  const commentRx = new RegExp(`\\/\\*[\\s\\S]*?${shortName}[\\s\\S]*?\\*\\/`, 'i');
  const comment = code.match(commentRx);
  if (comment) {
    const jsonRx = comment[0].match(/\{[\s\S]*?"\w+[\s\S]*?\}/);
    if (jsonRx) {
      try { result.example = JSON.parse(jsonRx[0]); } catch {}
    }
  }
  return result;
}

// ── Generar SKILL.md ──
function generate() {
  const lines = [];
  
  // Frontmatter
  lines.push('---');
  lines.push(`name: ${name}`);
  lines.push(`description: "${desc}"`);
  lines.push('fuente: enki');
  
  // Determinar dominio del path
  const parent = path.basename(path.dirname(moduleDir));
  const dominio = parent === 'prisma' ? 'comercio' : parent;
  lines.push(`dominio: ${dominio}`);
  lines.push(`lente_dominio: ${parent}`);
  lines.push(`tags: [${name}, ${parent}, reflejo, bus, mqtt, integracion]`);
  lines.push('---');
  lines.push('');
  
  // Título
  lines.push(`# ${parent} · ${name}`);
  lines.push('');
  
  // Descripción
  if (doc) {
    // Extraer primer párrafo del _doc
    const firstPara = doc.split('\n')[0].trim();
    lines.push(`> **Qué es.** ${firstPara}`);
    lines.push('>');
    
    // Extraer info adicional del _doc
    const extraLines = doc.split('\n').slice(1).filter(l => l.trim()).map(l => '> ' + l.trim());
    if (extraLines.length) lines.push(...extraLines);
    lines.push('>');
    lines.push(`> Código: \`${path.relative(ROOT, moduleDir)}/index.js\`. Esta skill es la referencia de uso; la verdad viva es el código.`);
    lines.push('');
  }
  
  // Eventos que atiende
  lines.push('---');
  lines.push('');
  lines.push('## Eventos que atiende (request → response)');
  lines.push('');
  lines.push('| Evento | Handler | Descripción |');
  lines.push('|---|---|---|');
  
  for (const ev of events) {
    if (ev.event.endsWith('.request')) {
      lines.push(`| \`${ev.event}\` | \`${ev.handler}\` | ${ev.description || ''} |`);
    }
  }
  lines.push('');
  
  // Eventos que emite (fire-and-forget)
  const emitEvents = events.filter(e => e.event.endsWith('.response'));
  if (emitEvents.length) {
    lines.push('## Eventos que emite');
    lines.push('');
    lines.push('| Evento | Descripción |');
    lines.push('|---|---|');
    for (const ev of emitEvents) {
      lines.push(`| \`${ev.event}\` | ${ev.description || ''} |`);
    }
    lines.push('');
  }
  
  // Eventos que escucha (señales)
  const signalEvents = events.filter(e => !e.event.endsWith('.request') && !e.event.endsWith('.response'));
  if (signalEvents.length) {
    lines.push('## Señales que escucha');
    lines.push('');
    for (const ev of signalEvents) {
      lines.push(`- \`${ev.event}\` → ${ev.description || 'reacciona'}`);
    }
    lines.push('');
  }
  
  // Dependencias detectadas en el código
  const deps = (source.match(/\.request/g) || [])
    .map(() => null)
    .filter(() => false); // Placeholder, no extraemos bien las dependencias así
  
  if (source) {
    const rpcCalls = source.match(/_rpc\s*\(\s*['"](\w+\.\w+)\.request['"]/g);
    if (rpcCalls && rpcCalls.length) {
      lines.push('## Dependencias (RPC saliente)');
      lines.push('');
      for (const rpc of rpcCalls) {
        const m = rpc.match(/['"](\w+\.\w+)\.request['"]/);
        if (m) lines.push(`- \`${m[1]}.request\``);
      }
      lines.push('');
    }
  }
  
  // Flujo típico (genérico)
  lines.push('## Flujo típico');
  lines.push('');
  lines.push('```');
  lines.push(`// 1. ${name}.request → ${name}.response`);
  lines.push(`// 2. Procesa y emite eventos`);
  lines.push(`// 3. Persiste si aplica`);
  lines.push('```');
  lines.push('');
  
  // Patrón RPC
  lines.push('## Patrón RPC');
  lines.push('');
  lines.push('```');
  lines.push('publish →  ui/request/<dominio>/<accion>    { request_id, data }');
  lines.push('listen  ←  ui/response/<request_id>         { request_id, status, data }');
  lines.push('```');
  lines.push('');
  
  return lines.join('\n');
}

// ── Escribir ──
const output = generate();

if (DRY_RUN) {
  console.log(output);
  process.exit(0);
}

const outputDir = args.includes('--output') 
  ? path.resolve(ROOT, args[args.indexOf('--output') + 1])
  : path.resolve(ROOT, 'modules/cosecha/cantera/enki', name);

fs.mkdirSync(outputDir, { recursive: true });
const outPath = path.join(outputDir, 'SKILL.md');
fs.writeFileSync(outPath, output, 'utf-8');
console.log(`✅ Skill generada: ${outPath}`);
console.log(`   ${path.relative(ROOT, outPath)}`);
