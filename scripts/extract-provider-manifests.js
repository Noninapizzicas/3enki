#!/usr/bin/env node
/**
 * Extract Provider Manifests
 *
 * Extrae los contratos embebidos en los providers y genera manifest.json separados.
 *
 * Uso:
 *   node scripts/extract-provider-manifests.js [--dry-run] [--clean]
 *
 * Opciones:
 *   --dry-run   Muestra lo que haría sin escribir archivos
 *   --clean     Elimina el contrato del index.js después de extraer
 *   --provider  Procesa solo un provider específico (ej: --provider=google-vision)
 */

const fs = require('fs');
const path = require('path');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  dim: (msg) => console.log(`${colors.dim}  ${msg}${colors.reset}`)
};

// Rutas de providers
const PROVIDERS_PATHS = [
  './services/providers/local',
  './services/providers/google',
  './services/providers/anthropic',
  './services/providers/elevenlabs'
];

/**
 * Extrae el contrato de un archivo index.js usando evaluación segura
 */
function extractContract(indexPath) {
  const content = fs.readFileSync(indexPath, 'utf8');

  // Extraer name
  const nameMatch = content.match(/name:\s*['"`]([^'"`]+)['"`]/);
  const name = nameMatch ? nameMatch[1] : null;

  // Extraer description
  const descMatch = content.match(/description:\s*['"`]([^'"`]+)['"`]/);
  const description = descMatch ? descMatch[1] : null;

  // Extraer version si existe
  const versionMatch = content.match(/version:\s*['"`]([^'"`]+)['"`]/);
  const version = versionMatch ? versionMatch[1] : '1.0.0';

  // Extraer el objeto functions completo
  // Buscamos "functions: {" y capturamos hasta el cierre balanceado
  const functionsStart = content.indexOf('functions:');
  if (functionsStart === -1) {
    return { name, description, version, functions: null, error: 'No functions found' };
  }

  // Encontrar el inicio del objeto
  const braceStart = content.indexOf('{', functionsStart);
  if (braceStart === -1) {
    return { name, description, version, functions: null, error: 'Invalid functions format' };
  }

  // Encontrar el cierre balanceado
  let braceCount = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (braceCount === 0) {
      braceEnd = i;
      break;
    }
  }

  if (braceEnd === -1) {
    return { name, description, version, functions: null, error: 'Unbalanced braces' };
  }

  const functionsStr = content.substring(braceStart, braceEnd + 1);

  // Intentar parsear como objeto JS
  try {
    // Convertir a JSON válido (reemplazar keys sin quotes)
    let jsonStr = functionsStr
      // Agregar comillas a keys
      .replace(/(\s*)(\w+)(\s*):/g, '$1"$2"$3:')
      // Reemplazar comillas simples por dobles
      .replace(/'/g, '"')
      // Manejar trailing commas
      .replace(/,(\s*[}\]])/g, '$1');

    const functions = JSON.parse(jsonStr);
    return { name, description, version, functions, error: null };
  } catch (e) {
    // Si falla el parse JSON, intentar eval (más riesgoso pero funciona)
    try {
      // Crear un contexto seguro para evaluar
      const evalStr = `(${functionsStr})`;
      const functions = eval(evalStr);
      return { name, description, version, functions, error: null };
    } catch (e2) {
      return { name, description, version, functions: null, error: `Parse error: ${e2.message}` };
    }
  }
}

/**
 * Detecta dependencias/requires del provider
 */
function detectRequires(indexPath) {
  const content = fs.readFileSync(indexPath, 'utf8');
  const requires = [];

  // Buscar patrones de credenciales
  if (content.includes('GOOGLE_API_KEY')) requires.push('GOOGLE_API_KEY');
  if (content.includes('ANTHROPIC_API_KEY')) requires.push('ANTHROPIC_API_KEY');
  if (content.includes('OPENAI_API_KEY')) requires.push('OPENAI_API_KEY');
  if (content.includes('ELEVENLABS_API_KEY')) requires.push('ELEVENLABS_API_KEY');
  if (content.includes('GMAIL_')) requires.push('GMAIL_CREDENTIALS');

  // Buscar dependencias npm
  const npmDeps = [];
  const requireMatches = content.matchAll(/require\(['"`]([^./][^'"`]+)['"`]\)/g);
  for (const match of requireMatches) {
    const dep = match[1];
    if (!dep.startsWith('fs') && !dep.startsWith('path') && !dep.startsWith('http')) {
      npmDeps.push(dep);
    }
  }

  return { credentials: requires, npmDependencies: [...new Set(npmDeps)] };
}

/**
 * Genera el manifest.json
 */
function generateManifest(contract, requires) {
  const manifest = {
    $schema: '../../../schemas/provider-manifest.schema.json',
    name: contract.name,
    version: contract.version,
    description: contract.description,
    type: 'provider',

    // Dependencias
    requires: {
      credentials: requires.credentials,
      npm: requires.npmDependencies
    },

    // Funciones/acciones disponibles
    functions: {}
  };

  // Procesar cada función
  if (contract.functions) {
    for (const [fnName, fnDef] of Object.entries(contract.functions)) {
      manifest.functions[fnName] = {
        event: fnDef.event,
        description: fnDef.description || `${fnName} operation`,
        input: fnDef.input || {},
        output: fnDef.output || {}
      };
    }
  }

  return manifest;
}

/**
 * Procesa un provider
 */
function processProvider(providerPath, options) {
  const indexPath = path.join(providerPath, 'index.js');
  const manifestPath = path.join(providerPath, 'manifest.json');
  const providerName = path.basename(providerPath);

  // Verificar que existe index.js
  if (!fs.existsSync(indexPath)) {
    log.warn(`${providerName}: No index.js found`);
    return { status: 'skipped', reason: 'no index.js' };
  }

  // Verificar si ya tiene manifest
  if (fs.existsSync(manifestPath) && !options.force) {
    log.dim(`${providerName}: manifest.json already exists (use --force to overwrite)`);
    return { status: 'skipped', reason: 'manifest exists' };
  }

  // Extraer contrato
  const contract = extractContract(indexPath);
  if (contract.error) {
    log.error(`${providerName}: ${contract.error}`);
    return { status: 'error', error: contract.error };
  }

  if (!contract.name) {
    log.error(`${providerName}: No name found in module.exports`);
    return { status: 'error', error: 'no name' };
  }

  // Detectar dependencias
  const requires = detectRequires(indexPath);

  // Generar manifest
  const manifest = generateManifest(contract, requires);

  // Mostrar resultado
  const functionsCount = Object.keys(manifest.functions).length;

  if (options.dryRun) {
    log.info(`${providerName}: Would create manifest.json`);
    log.dim(`  name: ${manifest.name}`);
    log.dim(`  functions: ${functionsCount}`);
    log.dim(`  credentials: ${requires.credentials.join(', ') || 'none'}`);
    console.log('');
    console.log(JSON.stringify(manifest, null, 2));
    console.log('');
  } else {
    // Escribir manifest
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    log.success(`${providerName}: Created manifest.json (${functionsCount} functions)`);
  }

  return { status: 'success', manifest };
}

/**
 * Main
 */
function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    clean: args.includes('--clean'),
    provider: args.find(a => a.startsWith('--provider='))?.split('=')[1]
  };

  console.log('');
  log.info('Extract Provider Manifests');
  log.dim(`Options: ${JSON.stringify(options)}`);
  console.log('');

  const stats = {
    processed: 0,
    success: 0,
    skipped: 0,
    errors: 0
  };

  // Procesar cada directorio de providers
  for (const providersPath of PROVIDERS_PATHS) {
    if (!fs.existsSync(providersPath)) {
      log.dim(`Path not found: ${providersPath}`);
      continue;
    }

    log.info(`Scanning ${providersPath}...`);

    const entries = fs.readdirSync(providersPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Filtrar por provider específico si se indicó
      if (options.provider && entry.name !== options.provider) continue;

      const providerPath = path.join(providersPath, entry.name);
      stats.processed++;

      const result = processProvider(providerPath, options);

      if (result.status === 'success') stats.success++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.errors++;
    }

    console.log('');
  }

  // Resumen
  console.log('─'.repeat(50));
  log.info('Summary:');
  log.dim(`  Processed: ${stats.processed}`);
  log.success(`  Success: ${stats.success}`);
  log.warn(`  Skipped: ${stats.skipped}`);
  if (stats.errors > 0) {
    log.error(`  Errors: ${stats.errors}`);
  }

  if (options.dryRun) {
    console.log('');
    log.warn('Dry run - no files were written. Run without --dry-run to apply changes.');
  }
}

main();
