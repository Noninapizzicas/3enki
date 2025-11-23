#!/usr/bin/env node
/**
 * Script CLI para crear módulos Event-Core
 *
 * Uso programático (sin interacción):
 *   node scripts/create-module.js --name=mi-modulo --description="Mi módulo" --ui --persistence
 *
 * Uso interactivo:
 *   node scripts/create-module.js --interactive
 *   # o usar plop directamente:
 *   npx plop module
 *
 * Opciones:
 *   --name          Nombre del módulo (requerido, kebab-case)
 *   --description   Descripción del módulo
 *   --author        Autor del módulo
 *   --ui            Incluir UI/Dashboard
 *   --icon          Emoji para el icono (default: 📦)
 *   --persistence   Incluir persistencia JSON
 *   --events        Eventos a publicar (separados por coma)
 *   --subscriptions Eventos a escuchar (separados por coma)
 *   --apis          APIs HTTP (formato: "METHOD /path", separados por coma)
 *   --interactive   Modo interactivo (usa plop)
 *   --dry-run       Solo mostrar qué se crearía
 *   --help          Mostrar ayuda
 *
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// ==========================================
// Configuración
// ==========================================

const TEMPLATES_DIR = path.join(__dirname, '..', 'plop-templates', 'module');
const MODULES_DIR = path.join(__dirname, '..', 'modules');

// ==========================================
// Helpers
// ==========================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    name: null,
    description: 'Módulo Event-Core',
    author: 'Event Core Team',
    ui: false,
    icon: '📦',
    persistence: false,
    events: [],
    subscriptions: [],
    apis: ['GET /data'],
    interactive: false,
    dryRun: false,
    help: false
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--interactive' || arg === '-i') {
      options.interactive = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--ui') {
      options.ui = true;
    } else if (arg === '--persistence') {
      options.persistence = true;
    } else if (arg.startsWith('--name=')) {
      options.name = arg.split('=')[1];
    } else if (arg.startsWith('--description=')) {
      options.description = arg.split('=')[1];
    } else if (arg.startsWith('--author=')) {
      options.author = arg.split('=')[1];
    } else if (arg.startsWith('--icon=')) {
      options.icon = arg.split('=')[1];
    } else if (arg.startsWith('--events=')) {
      options.events = arg.split('=')[1].split(',').map(e => e.trim()).filter(e => e);
    } else if (arg.startsWith('--subscriptions=')) {
      options.subscriptions = arg.split('=')[1].split(',').map(e => e.trim()).filter(e => e);
    } else if (arg.startsWith('--apis=')) {
      options.apis = arg.split('=')[1].split(',').map(a => a.trim()).filter(a => a);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           Event-Core Module Generator v1.0.0                    ║
╚══════════════════════════════════════════════════════════════════╝

USAGE:
  node scripts/create-module.js [options]

OPTIONS:
  --name=NAME           Nombre del módulo (requerido, kebab-case)
  --description=DESC    Descripción del módulo
  --author=AUTHOR       Autor del módulo
  --ui                  Incluir UI/Dashboard
  --icon=EMOJI          Emoji para el icono (default: 📦)
  --persistence         Incluir persistencia JSON
  --events=LIST         Eventos a publicar (coma-separated)
  --subscriptions=LIST  Eventos a escuchar (coma-separated)
  --apis=LIST           APIs HTTP: "METHOD /path" (coma-separated)
  --interactive, -i     Modo interactivo (usa plop)
  --dry-run             Solo mostrar qué se crearía
  --help, -h            Mostrar esta ayuda

EXAMPLES:
  # Crear módulo básico
  node scripts/create-module.js --name=inventario --description="Gestión de inventario"

  # Crear módulo completo con UI y persistencia
  node scripts/create-module.js \\
    --name=productos \\
    --description="Gestión de productos" \\
    --ui \\
    --icon=🛒 \\
    --persistence \\
    --events="producto.creado,producto.actualizado" \\
    --subscriptions="*.eliminado" \\
    --apis="GET /items,POST /items,DELETE /items/:id"

  # Modo interactivo
  node scripts/create-module.js --interactive

  # Ver qué se crearía sin crear
  node scripts/create-module.js --name=test --dry-run
`);
}

function titleCase(str) {
  return str.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function pascalCase(str) {
  return str.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
}

function snakeCase(str) {
  return str.replace(/\./g, '_').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function processSubscriptions(subs) {
  return subs.map(event => {
    const handler = 'on' + event
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
      .replace(/\*/g, 'Any');
    return { event, handler };
  });
}

function processApis(apis) {
  return apis.map(api => {
    const parts = api.trim().split(' ');
    const method = parts[0].toUpperCase();
    const apiPath = parts[1] || '/';
    const pathParts = apiPath.split('/').filter(p => p && !p.startsWith(':'));
    const handlerName = 'handle' + method.charAt(0) + method.slice(1).toLowerCase() +
      pathParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return {
      method,
      path: apiPath,
      handler: handlerName || 'handleRequest',
      description: `${method} ${apiPath}`
    };
  });
}

// ==========================================
// Template Processing
// ==========================================

async function readTemplate(templateName) {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  return await fs.readFile(templatePath, 'utf8');
}

function processTemplate(template, data) {
  let result = template;

  // Variables simples
  result = result.replace(/\{\{name\}\}/g, data.name);
  result = result.replace(/\{\{description\}\}/g, data.description);
  result = result.replace(/\{\{author\}\}/g, data.author);
  result = result.replace(/\{\{icon\}\}/g, data.icon);
  result = result.replace(/\{\{titleCase name\}\}/g, titleCase(data.name));
  result = result.replace(/\{\{pascalCase name\}\}/g, pascalCase(data.name));
  result = result.replace(/\{\{currentDate\}\}/g, new Date().toISOString().split('T')[0]);

  // Condicionales simples
  if (data.persistence) {
    result = result.replace(/\{\{#if persistence\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if persistence\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  if (data.ui) {
    result = result.replace(/\{\{#if ui\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if ui\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  if (data.hasSubscriptions) {
    result = result.replace(/\{\{#if hasSubscriptions\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if hasSubscriptions\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  // Arrays - publishEvents
  if (data.publishEvents && data.publishEvents.length > 0) {
    result = result.replace(/\{\{#if publishEvents\.length\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');

    // Each para publishEvents
    const publishEventsPattern = /\{\{#each publishEvents\}\}([\s\S]*?)\{\{\/each\}\}/g;
    result = result.replace(publishEventsPattern, (match, content) => {
      return data.publishEvents.map((event, index) => {
        let itemContent = content;
        itemContent = itemContent.replace(/\{\{this\}\}/g, event);
        itemContent = itemContent.replace(/\{\{snakeCase this\}\}/g, snakeCase(event));
        itemContent = itemContent.replace(/\{\{#unless @last\}\}(.*?)\{\{\/unless\}\}/g,
          index < data.publishEvents.length - 1 ? '$1' : '');
        return itemContent;
      }).join('');
    });
  } else {
    result = result.replace(/\{\{#if publishEvents\.length\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    result = result.replace(/\{\{#each publishEvents\}\}[\s\S]*?\{\{\/each\}\}/g, '');
  }

  // Each para subscriptions
  if (data.subscriptions && data.subscriptions.length > 0) {
    result = result.replace(/\{\{#if subscriptions\.length\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');

    const subscriptionsPattern = /\{\{#each subscriptions\}\}([\s\S]*?)\{\{\/each\}\}/g;
    result = result.replace(subscriptionsPattern, (match, content) => {
      return data.subscriptions.map((sub, index) => {
        let itemContent = content;
        itemContent = itemContent.replace(/\{\{this\.event\}\}/g, sub.event);
        itemContent = itemContent.replace(/\{\{this\.handler\}\}/g, sub.handler);
        itemContent = itemContent.replace(/\{\{\.\.\/name\}\}/g, data.name);
        itemContent = itemContent.replace(/\{\{#unless @last\}\}(.*?)\{\{\/unless\}\}/g,
          index < data.subscriptions.length - 1 ? '$1' : '');
        return itemContent;
      }).join('');
    });
  } else {
    result = result.replace(/\{\{#if subscriptions\.length\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    result = result.replace(/\{\{#each subscriptions\}\}[\s\S]*?\{\{\/each\}\}/g, '');
  }

  // Each para apis
  if (data.apis && data.apis.length > 0) {
    const apisPattern = /\{\{#each apis\}\}([\s\S]*?)\{\{\/each\}\}/g;
    result = result.replace(apisPattern, (match, content) => {
      return data.apis.map((api, index) => {
        let itemContent = content;
        itemContent = itemContent.replace(/\{\{this\.method\}\}/g, api.method);
        itemContent = itemContent.replace(/\{\{this\.path\}\}/g, api.path);
        itemContent = itemContent.replace(/\{\{this\.handler\}\}/g, api.handler);
        itemContent = itemContent.replace(/\{\{this\.description\}\}/g, api.description);
        itemContent = itemContent.replace(/\{\{\.\.\/name\}\}/g, data.name);
        itemContent = itemContent.replace(/\{\{#unless @last\}\}(.*?)\{\{\/unless\}\}/g,
          index < data.apis.length - 1 ? '$1' : '');
        return itemContent;
      }).join('');
    });
  }

  // Limpiar helpers no procesados
  result = result.replace(/\{\{#if .*?\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  result = result.replace(/\{\{#each .*?\}\}[\s\S]*?\{\{\/each\}\}/g, '');
  result = result.replace(/\{\{#unless .*?\}\}.*?\{\{\/unless\}\}/g, '');

  return result;
}

// ==========================================
// File Generation
// ==========================================

async function generateModule(options) {
  const modulePath = path.join(MODULES_DIR, options.name);

  // Preparar datos
  const data = {
    name: options.name,
    description: options.description,
    author: options.author,
    ui: options.ui,
    icon: options.icon,
    persistence: options.persistence,
    publishEvents: options.events,
    subscriptions: processSubscriptions(options.subscriptions),
    apis: processApis(options.apis),
    hasSubscriptions: options.subscriptions.length > 0
  };

  // Archivos a crear
  const files = [
    { template: 'index.js.hbs', output: 'index.js' },
    { template: 'module.json.hbs', output: 'module.json' },
    { template: 'README.md.hbs', output: 'README.md' },
    { template: 'schemas/events.json.hbs', output: 'schemas/events.json' },
    { template: 'schemas/main.json.hbs', output: `schemas/${options.name}.json` }
  ];

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Archivos que se crearían:\n');
    console.log(`📁 ${modulePath}/`);
    for (const file of files) {
      console.log(`   ├── ${file.output}`);
    }
    console.log(`   └── .generated`);
    console.log('\n📊 Configuración:');
    console.log(`   Name: ${data.name}`);
    console.log(`   Description: ${data.description}`);
    console.log(`   UI: ${data.ui}`);
    console.log(`   Persistence: ${data.persistence}`);
    console.log(`   Events: ${data.publishEvents.join(', ') || 'ninguno'}`);
    console.log(`   Subscriptions: ${options.subscriptions.join(', ') || 'ninguno'}`);
    console.log(`   APIs: ${options.apis.join(', ')}`);
    return;
  }

  // Verificar si el módulo ya existe
  try {
    await fs.access(modulePath);
    console.error(`\n❌ Error: El módulo '${options.name}' ya existe en ${modulePath}`);
    process.exit(1);
  } catch (e) {
    // No existe, perfecto
  }

  // Crear directorio del módulo
  await fs.mkdir(modulePath, { recursive: true });
  await fs.mkdir(path.join(modulePath, 'schemas'), { recursive: true });

  console.log(`\n📦 Creando módulo: ${options.name}\n`);

  // Procesar cada template
  for (const file of files) {
    try {
      const template = await readTemplate(file.template);
      const content = processTemplate(template, data);
      const outputPath = path.join(modulePath, file.output);
      await fs.writeFile(outputPath, content, 'utf8');
      console.log(`   ✅ ${file.output}`);
    } catch (error) {
      console.error(`   ❌ Error creando ${file.output}: ${error.message}`);
    }
  }

  // Crear archivo .generated
  const generatedContent = `Módulo generado el ${new Date().toISOString().split('T')[0]}\nGenerador: create-module.js\nOpciones: ${JSON.stringify(options, null, 2)}\n`;
  await fs.writeFile(path.join(modulePath, '.generated'), generatedContent, 'utf8');
  console.log(`   ✅ .generated`);

  // Resumen
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    ✅ MÓDULO CREADO                              ║
╚══════════════════════════════════════════════════════════════════╝

📁 Ubicación: ${modulePath}

🚀 Próximos pasos:
   1. Editar index.js con la lógica de negocio
   2. Ajustar schemas según necesidades
   3. Reiniciar el servidor: npm start
   4. Probar: curl http://localhost:3000/modules/${options.name}/health
`);
}

// ==========================================
// Main
// ==========================================

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.interactive) {
    console.log('\n🚀 Iniciando modo interactivo (plop)...\n');
    try {
      execSync('npx plop module', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    } catch (e) {
      // plop maneja su propia salida
    }
    process.exit(0);
  }

  if (!options.name) {
    console.error('\n❌ Error: El nombre del módulo es requerido (--name=nombre)\n');
    console.log('Usa --help para ver las opciones disponibles.');
    console.log('Usa --interactive para el modo interactivo.\n');
    process.exit(1);
  }

  // Validar nombre
  if (!/^[a-z][a-z0-9-]*$/.test(options.name)) {
    console.error('\n❌ Error: El nombre debe estar en kebab-case (ej: mi-modulo)\n');
    process.exit(1);
  }

  await generateModule(options);
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
