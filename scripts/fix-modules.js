#!/usr/bin/env node

/**
 * Script para arreglar módulos incompatibles con Event Core
 *
 * Problemas que arregla:
 * 1. Constructores que reciben dependencias (deben recibirlas en onLoad)
 * 2. module.json con apis como objeto (debe ser array)
 *
 * Uso:
 *   node scripts/fix-modules.js --dry-run    # Ver cambios sin aplicar
 *   node scripts/fix-modules.js              # Aplicar cambios
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const MODULES_DIR = path.join(__dirname, '../modules');
const BACKUP_DIR = path.join(__dirname, '../backups', `fix-modules-${Date.now()}`);

const stats = {
  modulesProcessed: 0,
  constructorsFixed: 0,
  apisFixed: 0,
  errors: []
};

/**
 * Crea backup de un archivo
 */
function backupFile(filePath) {
  if (DRY_RUN) return;

  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  const backupPath = path.join(BACKUP_DIR, relativePath);

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(filePath, backupPath);
}

/**
 * Arregla module.json: apis objeto → array
 */
function fixModuleJson(modulePath) {
  const jsonPath = path.join(modulePath, 'module.json');

  if (!fs.existsSync(jsonPath)) return false;

  try {
    const content = fs.readFileSync(jsonPath, 'utf8');
    const json = JSON.parse(content);

    // Si apis es objeto, convertir a array
    if (json.apis && typeof json.apis === 'object' && !Array.isArray(json.apis)) {
      const apisArray = Object.entries(json.apis).map(([key, value]) => ({
        ...value,
        handler: `handle${key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`
      }));

      json.apis = apisArray;

      if (DRY_RUN) {
        console.log(`  [DRY] Convertiría apis de objeto a array (${apisArray.length} endpoints)`);
      } else {
        backupFile(jsonPath);
        fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
        console.log(`  ✅ apis convertido a array (${apisArray.length} endpoints)`);
      }

      stats.apisFixed++;
      return true;
    }

    return false;
  } catch (error) {
    stats.errors.push({ file: jsonPath, error: error.message });
    console.log(`  ❌ Error en module.json: ${error.message}`);
    return false;
  }
}

/**
 * Arregla index.js: constructor con dependencias → onLoad pattern
 */
function fixIndexJs(modulePath) {
  const indexPath = path.join(modulePath, 'index.js');

  if (!fs.existsSync(indexPath)) return false;

  try {
    let content = fs.readFileSync(indexPath, 'utf8');
    let modified = false;

    // Patrón 1: constructor(config, logger, eventBus, ...)
    const pattern1 = /constructor\s*\(\s*config\s*,\s*logger\s*,\s*eventBus[^)]*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/;

    // Patrón 2: constructor(config, { logger, eventBus, ... })
    const pattern2 = /constructor\s*\(\s*config\s*,\s*\{\s*logger\s*,\s*eventBus[^}]*\}\s*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/;

    // Patrón 3: constructor(config, coreInstance)
    const pattern3 = /constructor\s*\(\s*config\s*,\s*coreInstance\s*\)\s*\{/;

    if (pattern1.test(content) || pattern2.test(content) || pattern3.test(content)) {
      // Extraer nombre de la clase
      const classMatch = content.match(/class\s+(\w+)/);
      if (!classMatch) return false;

      const className = classMatch[1];

      // Buscar qué dependencias usa el módulo
      const usesLogger = content.includes('this.logger');
      const usesEventBus = content.includes('this.eventBus');
      const usesMetrics = content.includes('this.metrics');
      const usesConfig = content.includes('this.config');
      const usesCoreConfig = content.includes('this.coreConfig');
      const usesModuleLoader = content.includes('this.moduleLoader');

      // Crear nuevo constructor
      let newConstructor = `constructor() {
    this.name = '${path.basename(modulePath)}';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.logger = null;
    this.eventBus = null;${usesMetrics ? '\n    this.metrics = null;' : ''}${usesModuleLoader ? '\n    this.moduleLoader = null;' : ''}
    this.config = {};
  }`;

      // Crear/modificar onLoad
      const onLoadContent = `
  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;${usesMetrics ? '\n    this.metrics = core.metrics;' : ''}${usesModuleLoader ? '\n    this.moduleLoader = core.moduleLoader;' : ''}
    this.config = core.config || {};

    this.logger.info('${path.basename(modulePath)}.loading', {
      module: this.name,
      version: this.version
    });`;

      // Reemplazar constructor viejo
      content = content.replace(
        /constructor\s*\([^)]*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/,
        newConstructor
      );

      // Si onLoad existe, modificar inicio
      if (content.includes('async onLoad(')) {
        // Reemplazar el inicio de onLoad existente
        content = content.replace(
          /async onLoad\s*\([^)]*\)\s*\{/,
          onLoadContent
        );
      }

      // Quitar acceso a logger en constructor (líneas que usan this.logger antes de onLoad)
      // Esto es más complejo, solo marcamos el archivo

      modified = true;

      if (DRY_RUN) {
        console.log(`  [DRY] Arreglaría constructor de ${className}`);
      } else {
        backupFile(indexPath);
        fs.writeFileSync(indexPath, content);
        console.log(`  ✅ Constructor de ${className} arreglado`);
      }

      stats.constructorsFixed++;
    }

    return modified;
  } catch (error) {
    stats.errors.push({ file: indexPath, error: error.message });
    console.log(`  ❌ Error en index.js: ${error.message}`);
    return false;
  }
}

/**
 * Procesa un módulo
 */
function processModule(moduleName) {
  const modulePath = path.join(MODULES_DIR, moduleName);

  if (!fs.statSync(modulePath).isDirectory()) return;

  console.log(`\n📦 ${moduleName}`);
  stats.modulesProcessed++;

  const jsonFixed = fixModuleJson(modulePath);
  const indexFixed = fixIndexJs(modulePath);

  if (!jsonFixed && !indexFixed) {
    if (VERBOSE) console.log('  ⏭️  Sin cambios necesarios');
  }
}

/**
 * Main
 */
function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Fix Modules - Event Core Compatibility              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN MODE - No se modificarán archivos\n');
  }

  // Módulos problemáticos conocidos
  const problematicModules = [
    'admin-panel',
    'ai-agent-framework',
    'ai-gateway',
    'calling-generator',
    'plugin-manager',
    'prompt-manager',
    'tool-orchestrator',
    'ui-renderer'
  ];

  problematicModules.forEach(processModule);

  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                       RESUMEN                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`📁 Módulos procesados:    ${stats.modulesProcessed}`);
  console.log(`🔧 Constructores arreglados: ${stats.constructorsFixed}`);
  console.log(`📋 module.json arreglados:   ${stats.apisFixed}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errores: ${stats.errors.length}`);
    stats.errors.forEach(e => console.log(`   - ${e.file}: ${e.error}`));
  }

  if (!DRY_RUN && (stats.constructorsFixed > 0 || stats.apisFixed > 0)) {
    console.log(`\n💾 Backup creado en: ${BACKUP_DIR}`);
  }

  console.log('\n📋 Próximos pasos:');
  console.log('   1. Revisar los cambios en los archivos');
  console.log('   2. Reiniciar el sistema: node index.js');
  console.log('   3. Verificar que los módulos cargan correctamente');
}

try {
  main();
} catch (error) {
  console.error('❌ Error fatal:', error.message);
  console.error(error.stack);
  process.exit(1);
}
