#!/usr/bin/env node

/**
 * Script de Migración Automática a Constantes
 *
 * Convierte todos los hardcodeos en los módulos a usar constantes centralizadas.
 *
 * Uso:
 *   node scripts/migrate-to-constants.js [--dry-run] [--module=nombre]
 *
 * Opciones:
 *   --dry-run    Muestra los cambios sin aplicarlos
 *   --module     Migrar solo un módulo específico
 */

const fs = require('fs');
const path = require('path');

// Importar constantes para obtener los valores
const { EVENTS, API_ROUTES, FIELDS } = require('../core/constants');

// ============================================
// CONFIGURACIÓN
// ============================================

const CONFIG = {
  modulesDir: path.join(__dirname, '..', 'modules'),
  dryRun: process.argv.includes('--dry-run'),
  specificModule: process.argv.find(arg => arg.startsWith('--module='))?.split('=')[1],
  backupDir: path.join(__dirname, '..', 'backups', `backup-${Date.now()}`)
};

// ============================================
// MAPEOS DE REEMPLAZO
// ============================================

// Construir mapeos dinámicamente desde EVENTS
const EVENT_MAPPINGS = [];
Object.keys(EVENTS).forEach(domain => {
  Object.keys(EVENTS[domain]).forEach(action => {
    const eventName = EVENTS[domain][action];
    const constantPath = `EVENTS.${domain}.${action}`;
    EVENT_MAPPINGS.push({
      pattern: new RegExp(`['"\`]${eventName}['"\`]`, 'g'),
      replacement: constantPath,
      description: `Evento: ${eventName} → ${constantPath}`
    });
  });
});

// Campos comunes
const FIELD_MAPPINGS = [
  // Request fields
  { pattern: /['"]request_id['"]/g, replacement: 'FIELDS.REQUEST.ID', field: 'request_id' },
  { pattern: /['"]project_id['"]/g, replacement: 'FIELDS.REQUEST.PROJECT_ID', field: 'project_id' },
  { pattern: /['"]conversation_id['"]/g, replacement: 'FIELDS.REQUEST.CONVERSATION_ID', field: 'conversation_id' },
  { pattern: /['"]file_path['"]/g, replacement: 'FIELDS.REQUEST.FILE_PATH', field: 'file_path' },
  { pattern: /['"]content['"]/g, replacement: 'FIELDS.REQUEST.CONTENT', field: 'content' },
  { pattern: /['"]timestamp['"]/g, replacement: 'FIELDS.REQUEST.TIMESTAMP', field: 'timestamp' },

  // Response fields
  { pattern: /['"]success['"]/g, replacement: 'FIELDS.RESPONSE.SUCCESS', field: 'success' },
  { pattern: /['"]data['"]/g, replacement: 'FIELDS.RESPONSE.DATA', field: 'data' },
  { pattern: /['"]error['"]/g, replacement: 'FIELDS.RESPONSE.ERROR', field: 'error' },
  { pattern: /['"]message['"]/g, replacement: 'FIELDS.RESPONSE.MESSAGE', field: 'message' }
];

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function getAllModules() {
  return fs.readdirSync(CONFIG.modulesDir)
    .filter(name => {
      const modulePath = path.join(CONFIG.modulesDir, name);
      return fs.statSync(modulePath).isDirectory();
    });
}

function backupFile(filePath) {
  if (CONFIG.dryRun) return;

  const relativePath = path.relative(path.join(__dirname, '..'), filePath);
  const backupPath = path.join(CONFIG.backupDir, relativePath);
  const backupDir = path.dirname(backupPath);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  fs.copyFileSync(filePath, backupPath);
}

function shouldProcessFile(filePath) {
  // Solo procesar archivos .js (excepto scripts)
  if (!filePath.endsWith('.js')) return false;
  if (filePath.includes('/scripts/')) return false;
  if (filePath.includes('/node_modules/')) return false;
  if (filePath.includes('/core/')) return false;  // No migrar el core

  return true;
}

function needsConstantsImport(content) {
  return !content.includes("require('../../core/constants')") &&
         !content.includes('require("../../core/constants")');
}

function addConstantsImport(content) {
  // Detectar si ya hay imports
  const lines = content.split('\n');
  let insertIndex = 0;

  // Buscar después de los requires existentes
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('require(')) {
      insertIndex = i + 1;
    }
    if (lines[i].trim().startsWith('class ') || lines[i].trim().startsWith('function ')) {
      break;
    }
  }

  const importLine = "const { EVENTS, FIELDS, HELPERS, CONFIG, ERRORS } = require('../../core/constants');";
  lines.splice(insertIndex, 0, '', importLine);

  return lines.join('\n');
}

function migrateEventHandlers(content) {
  let modified = content;
  let changes = [];

  EVENT_MAPPINGS.forEach(mapping => {
    const matches = content.match(mapping.pattern);
    if (matches) {
      modified = modified.replace(mapping.pattern, mapping.replacement);
      changes.push({
        type: 'event',
        count: matches.length,
        description: mapping.description
      });
    }
  });

  return { content: modified, changes };
}

function migrateFieldNames(content) {
  let modified = content;
  let changes = [];

  // Solo reemplazar en contextos específicos (dentro de objetos, acceso a propiedades)
  FIELD_MAPPINGS.forEach(mapping => {
    // Detectar contextos seguros para reemplazo
    // 1. En objetos: { 'field': value } o { "field": value }
    // 2. En acceso: obj['field'] o obj["field"]
    // 3. En query/body: req.query['field']

    const safeContexts = [
      // Dentro de objetos { 'field': ... }
      new RegExp(`(\\{[^}]*?)${mapping.pattern}([^}]*?\\})`, 'g'),
      // Acceso a propiedades obj['field']
      new RegExp(`(\\[[\\s]*)${mapping.pattern}([\\s]*\\])`, 'g'),
    ];

    safeContexts.forEach(contextPattern => {
      const matches = modified.match(contextPattern);
      if (matches) {
        // Reemplazar solo en contextos seguros
        modified = modified.replace(
          new RegExp(`(\\{[^}]*?|\\[[\\s]*)${mapping.pattern}`, 'g'),
          `$1${mapping.replacement}`
        );

        if (!changes.find(c => c.field === mapping.field)) {
          changes.push({
            type: 'field',
            field: mapping.field,
            replacement: mapping.replacement,
            count: matches.length
          });
        }
      }
    });
  });

  return { content: modified, changes };
}

function migrateResponseBuilders(content) {
  let modified = content;
  let changes = [];

  // Patrón: res.json({ success: true, data: ... })
  const successPattern = /res\.json\(\{\s*success:\s*true,\s*data:\s*([^}]+)\}\)/g;
  const matches = content.match(successPattern);

  if (matches) {
    modified = modified.replace(
      successPattern,
      'res.json(HELPERS.buildResponse(true, $1))'
    );
    changes.push({
      type: 'helper',
      description: 'Convertido a HELPERS.buildResponse',
      count: matches.length
    });
  }

  // Patrón: res.json({ success: false, error: ... })
  const errorPattern = /res\.json\(\{\s*success:\s*false,\s*error:\s*([^}]+)\}\)/g;
  const errorMatches = content.match(errorPattern);

  if (errorMatches) {
    modified = modified.replace(
      errorPattern,
      'res.json(HELPERS.buildResponse(false, null, $1))'
    );
    changes.push({
      type: 'helper',
      description: 'Convertido error a HELPERS.buildResponse',
      count: errorMatches.length
    });
  }

  return { content: modified, changes };
}

function processFile(filePath) {
  console.log(`\n📄 Procesando: ${path.relative(CONFIG.modulesDir, filePath)}`);

  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  let allChanges = [];

  // 1. Migrar eventos
  const eventsResult = migrateEventHandlers(content);
  content = eventsResult.content;
  allChanges.push(...eventsResult.changes);

  // 2. Migrar campos
  const fieldsResult = migrateFieldNames(content);
  content = fieldsResult.content;
  allChanges.push(...fieldsResult.changes);

  // 3. Migrar response builders
  const helpersResult = migrateResponseBuilders(content);
  content = helpersResult.content;
  allChanges.push(...helpersResult.changes);

  // 4. Agregar import si es necesario
  if (allChanges.length > 0 && needsConstantsImport(content)) {
    content = addConstantsImport(content);
    console.log('   ✅ Import de constantes agregado');
  }

  // Mostrar resumen de cambios
  if (allChanges.length > 0) {
    console.log('   📊 Cambios realizados:');

    const eventChanges = allChanges.filter(c => c.type === 'event');
    if (eventChanges.length > 0) {
      console.log(`      • ${eventChanges.length} eventos migrados`);
    }

    const fieldChanges = allChanges.filter(c => c.type === 'field');
    if (fieldChanges.length > 0) {
      console.log(`      • ${fieldChanges.length} campos migrados`);
    }

    const helperChanges = allChanges.filter(c => c.type === 'helper');
    if (helperChanges.length > 0) {
      console.log(`      • ${helperChanges.reduce((sum, c) => sum + c.count, 0)} responses convertidos a helpers`);
    }

    // Guardar cambios
    if (!CONFIG.dryRun) {
      backupFile(filePath);
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log('   💾 Archivo actualizado');
    } else {
      console.log('   ⚠️  DRY RUN - Cambios no aplicados');
    }
  } else {
    console.log('   ✓ No requiere cambios');
  }

  return allChanges.length;
}

function processModule(moduleName) {
  console.log(`\n📦 Módulo: ${moduleName}`);
  console.log('─'.repeat(50));

  const modulePath = path.join(CONFIG.modulesDir, moduleName);
  const indexFile = path.join(modulePath, 'index.js');

  if (!fs.existsSync(indexFile)) {
    console.log('   ⚠️  No se encontró index.js');
    return 0;
  }

  if (!shouldProcessFile(indexFile)) {
    console.log('   ⏭️  Archivo excluido');
    return 0;
  }

  return processFile(indexFile);
}

// ============================================
// MAIN
// ============================================

function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   🔄 MIGRACIÓN AUTOMÁTICA A CONSTANTES                ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log();

  if (CONFIG.dryRun) {
    console.log('⚠️  MODO DRY RUN - No se aplicarán cambios\n');
  }

  if (CONFIG.specificModule) {
    console.log(`📍 Migrando solo: ${CONFIG.specificModule}\n`);
  }

  // Crear directorio de backup
  if (!CONFIG.dryRun && !fs.existsSync(CONFIG.backupDir)) {
    fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    console.log(`💾 Backups en: ${CONFIG.backupDir}\n`);
  }

  // Obtener módulos a procesar
  const modules = CONFIG.specificModule
    ? [CONFIG.specificModule]
    : getAllModules();

  console.log(`📋 Módulos a procesar: ${modules.length}\n`);

  // Procesar cada módulo
  let totalChanges = 0;
  let modulesChanged = 0;

  modules.forEach(moduleName => {
    const changes = processModule(moduleName);
    if (changes > 0) {
      totalChanges += changes;
      modulesChanged++;
    }
  });

  // Resumen final
  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMEN FINAL');
  console.log('═'.repeat(50));
  console.log(`✅ Módulos procesados: ${modules.length}`);
  console.log(`🔄 Módulos modificados: ${modulesChanged}`);
  console.log(`📝 Total de cambios: ${totalChanges}`);

  if (CONFIG.dryRun) {
    console.log('\n⚠️  DRY RUN COMPLETADO - Ejecuta sin --dry-run para aplicar cambios');
  } else {
    console.log('\n✅ MIGRACIÓN COMPLETADA');
    console.log(`💾 Backups guardados en: ${CONFIG.backupDir}`);
  }

  console.log('\n🔍 Próximos pasos:');
  console.log('   1. Revisar los cambios con: git diff');
  console.log('   2. Probar que todo funciona');
  console.log('   3. Hacer commit de los cambios');
}

// Ejecutar
try {
  main();
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
