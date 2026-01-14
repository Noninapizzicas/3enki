#!/usr/bin/env node
/**
 * Script de Migración CSS Custom → Tailwind CSS
 *
 * Este script:
 * 1. Instala Tailwind CSS y dependencias
 * 2. Configura Tailwind para SvelteKit
 * 3. Crea archivo de estilos base con variables CSS
 * 4. Genera reporte de archivos a migrar
 * 5. Proporciona mapeo CSS custom → clases Tailwind
 *
 * Uso:
 *   node scripts/migrate-to-tailwind.js [--install] [--report] [--migrate]
 *
 * Flags:
 *   --install   Instala dependencias y configura Tailwind
 *   --report    Genera reporte de archivos y estilos a migrar
 *   --migrate   Ejecuta migración automática (con backup)
 *   --dry-run   Muestra cambios sin aplicarlos
 *   --help      Muestra esta ayuda
 *
 * @author Claude
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const CONFIG = {
  frontendDir: path.join(__dirname, '..', 'frontend'),
  srcDir: path.join(__dirname, '..', 'frontend', 'src'),
  backupDir: path.join(__dirname, '..', 'frontend', '.css-backup'),

  // Mapeo de variables CSS custom → Tailwind
  variableMap: {
    // Colores de texto
    '--_text': 'text-neutral-200',
    '--_text-muted': 'text-neutral-400',

    // Fondos
    '--_bg': 'bg-neutral-900',
    '--_bg-surface': 'bg-white/5',

    // Bordes
    '--_border': 'border-white/10',
    '--_radius': 'rounded-lg',

    // Colores semánticos
    '--_primary': 'text-blue-500',
    '--_success': 'text-green-500',
    '--_danger': 'text-red-500',
  },

  // Mapeo de propiedades CSS → clases Tailwind
  propertyMap: {
    // Display
    'display: flex': 'flex',
    'display: grid': 'grid',
    'display: block': 'block',
    'display: inline-flex': 'inline-flex',
    'display: none': 'hidden',

    // Flexbox
    'flex-direction: column': 'flex-col',
    'flex-direction: row': 'flex-row',
    'align-items: center': 'items-center',
    'align-items: flex-start': 'items-start',
    'align-items: flex-end': 'items-end',
    'justify-content: center': 'justify-center',
    'justify-content: space-between': 'justify-between',
    'justify-content: flex-start': 'justify-start',
    'justify-content: flex-end': 'justify-end',
    'flex: 1': 'flex-1',
    'flex-wrap: wrap': 'flex-wrap',

    // Grid
    'grid-template-columns: repeat(2, 1fr)': 'grid-cols-2',
    'grid-template-columns: repeat(3, 1fr)': 'grid-cols-3',
    'grid-template-columns: repeat(4, 1fr)': 'grid-cols-4',

    // Spacing
    'gap: 0.25rem': 'gap-1',
    'gap: 0.35rem': 'gap-1.5',
    'gap: 0.375rem': 'gap-1.5',
    'gap: 0.5rem': 'gap-2',
    'gap: 0.75rem': 'gap-3',
    'gap: 1rem': 'gap-4',

    // Padding
    'padding: 0.25rem': 'p-1',
    'padding: 0.375rem': 'p-1.5',
    'padding: 0.5rem': 'p-2',
    'padding: 0.625rem': 'p-2.5',
    'padding: 0.75rem': 'p-3',
    'padding: 1rem': 'p-4',

    // Border radius
    'border-radius: 0.25rem': 'rounded',
    'border-radius: 0.375rem': 'rounded-md',
    'border-radius: 0.5rem': 'rounded-lg',
    'border-radius: 9999px': 'rounded-full',

    // Font size
    'font-size: 0.6rem': 'text-[0.6rem]',
    'font-size: 0.65rem': 'text-[0.65rem]',
    'font-size: 0.7rem': 'text-[0.7rem]',
    'font-size: 0.75rem': 'text-xs',
    'font-size: 0.8rem': 'text-sm',
    'font-size: 0.85rem': 'text-sm',
    'font-size: 0.875rem': 'text-sm',
    'font-size: 0.95rem': 'text-base',
    'font-size: 1rem': 'text-base',
    'font-size: 1.125rem': 'text-lg',
    'font-size: 1.25rem': 'text-xl',
    'font-size: 1.5rem': 'text-2xl',
    'font-size: 2rem': 'text-3xl',

    // Font weight
    'font-weight: 400': 'font-normal',
    'font-weight: 500': 'font-medium',
    'font-weight: 600': 'font-semibold',
    'font-weight: 700': 'font-bold',

    // Sizing
    'width: 100%': 'w-full',
    'height: 100%': 'h-full',
    'min-width: 0': 'min-w-0',

    // Position
    'position: relative': 'relative',
    'position: absolute': 'absolute',
    'position: fixed': 'fixed',

    // Overflow
    'overflow: hidden': 'overflow-hidden',
    'overflow: auto': 'overflow-auto',
    'overflow-y: auto': 'overflow-y-auto',
    'overflow-x: auto': 'overflow-x-auto',

    // Cursor
    'cursor: pointer': 'cursor-pointer',
    'cursor: not-allowed': 'cursor-not-allowed',

    // Opacity
    'opacity: 0.5': 'opacity-50',
    'opacity: 0.7': 'opacity-70',
    'opacity: 0.9': 'opacity-90',

    // Transitions
    'transition: all 0.15s': 'transition-all duration-150',
    'transition: all 0.2s': 'transition-all duration-200',

    // Text
    'text-align: center': 'text-center',
    'text-align: left': 'text-left',
    'text-align: right': 'text-right',
    'text-transform: uppercase': 'uppercase',
    'white-space: nowrap': 'whitespace-nowrap',
    'line-height: 1': 'leading-none',
    'line-height: 1.2': 'leading-tight',
    'line-height: 1.5': 'leading-normal',

    // Border
    'border: none': 'border-0',
    'border: 1px solid': 'border',
    'border: 2px solid': 'border-2',

    // Background
    'background: transparent': 'bg-transparent',
    'background: none': 'bg-transparent',
  },

  // Colores Tailwind que coinciden con los actuales
  colors: {
    primary: '#3b82f6',    // blue-500
    success: '#22c55e',    // green-500
    danger: '#ef4444',     // red-500
    text: '#e5e5e5',       // neutral-200
    textMuted: '#a3a3a3',  // neutral-400
    bg: '#1a1d24',         // custom dark
    bgCard: '#1a1d24',     // custom dark
    bgSurface: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(255, 255, 255, 0.1)',
  }
};

// ============================================================================
// UTILIDADES
// ============================================================================

const log = {
  info: (msg) => console.log(`\x1b[36mℹ\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`),
  warning: (msg) => console.log(`\x1b[33m⚠\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m✗\x1b[0m ${msg}`),
  step: (msg) => console.log(`\n\x1b[35m▸\x1b[0m ${msg}`),
  detail: (msg) => console.log(`  ${msg}`),
};

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function findSvelteFiles(dir) {
  const files = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.svelte')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

function extractStyleBlock(content) {
  const match = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return match ? match[1] : null;
}

function countCSSVariables(styleContent) {
  const counts = {};
  for (const varName of Object.keys(CONFIG.variableMap)) {
    const regex = new RegExp(`var\\(${varName.replace('--', '--')}`, 'g');
    const matches = styleContent.match(regex);
    if (matches) {
      counts[varName] = matches.length;
    }
  }
  return counts;
}

function countCSSProperties(styleContent) {
  const counts = {};
  for (const prop of Object.keys(CONFIG.propertyMap)) {
    // Normalizar espacios para mejor matching
    const normalizedProp = prop.replace(/\s+/g, '\\s*');
    const regex = new RegExp(normalizedProp, 'gi');
    const matches = styleContent.match(regex);
    if (matches) {
      counts[prop] = matches.length;
    }
  }
  return counts;
}

// ============================================================================
// INSTALACIÓN
// ============================================================================

function install() {
  log.step('Instalando Tailwind CSS y dependencias...');

  process.chdir(CONFIG.frontendDir);

  // Verificar si ya está instalado
  const packageJson = JSON.parse(readFile(path.join(CONFIG.frontendDir, 'package.json')));
  const hasTailwind = packageJson.devDependencies?.tailwindcss || packageJson.dependencies?.tailwindcss;

  if (hasTailwind) {
    log.warning('Tailwind CSS ya está instalado');
  } else {
    log.info('Instalando tailwindcss, postcss, autoprefixer...');
    execSync('npm install -D tailwindcss postcss autoprefixer', { stdio: 'inherit' });
    log.success('Dependencias instaladas');
  }

  // Crear tailwind.config.js
  log.step('Creando configuración de Tailwind...');

  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],

  theme: {
    extend: {
      colors: {
        // Colores custom del sistema
        'app': {
          'bg': '${CONFIG.colors.bg}',
          'card': '${CONFIG.colors.bgCard}',
          'surface': '${CONFIG.colors.bgSurface}',
        }
      },

      // Variables CSS como utilidades (para transición gradual)
      textColor: {
        'var-text': 'var(--_text, ${CONFIG.colors.text})',
        'var-muted': 'var(--_text-muted, ${CONFIG.colors.textMuted})',
        'var-primary': 'var(--_primary, ${CONFIG.colors.primary})',
        'var-success': 'var(--_success, ${CONFIG.colors.success})',
        'var-danger': 'var(--_danger, ${CONFIG.colors.danger})',
      },

      backgroundColor: {
        'var-bg': 'var(--_bg, ${CONFIG.colors.bg})',
        'var-surface': 'var(--_bg-surface, ${CONFIG.colors.bgSurface})',
      },

      borderColor: {
        'var-border': 'var(--_border, ${CONFIG.colors.border})',
        'var-primary': 'var(--_primary, ${CONFIG.colors.primary})',
      },

      borderRadius: {
        'var': 'var(--_radius, 0.5rem)',
      },
    },
  },

  plugins: [],
}
`;

  writeFile(path.join(CONFIG.frontendDir, 'tailwind.config.js'), tailwindConfig);
  log.success('tailwind.config.js creado');

  // Crear postcss.config.js
  const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;

  writeFile(path.join(CONFIG.frontendDir, 'postcss.config.js'), postcssConfig);
  log.success('postcss.config.js creado');

  // Crear archivo CSS base
  log.step('Creando archivo de estilos base...');

  const appCss = `/*
 * Estilos base - Event Core
 * Generado por migrate-to-tailwind.js
 */

@tailwind base;
@tailwind components;
@tailwind utilities;

/* ============================================================================
   Variables CSS globales (para compatibilidad durante migración)
   ============================================================================ */

:root {
  /* Colores de texto */
  --color-text: ${CONFIG.colors.text};
  --color-text-muted: ${CONFIG.colors.textMuted};

  /* Fondos */
  --color-bg: ${CONFIG.colors.bg};
  --color-bg-card: ${CONFIG.colors.bgCard};

  /* Colores semánticos */
  --color-primary: ${CONFIG.colors.primary};
  --color-success: ${CONFIG.colors.success};
  --color-danger: ${CONFIG.colors.danger};

  /* Estados */
  --color-hover: rgba(255, 255, 255, 0.1);
  --color-active: rgba(255, 255, 255, 0.15);
}

/* ============================================================================
   Componentes base (usar @apply para consistencia)
   ============================================================================ */

@layer components {
  /* Botones */
  .btn {
    @apply inline-flex items-center justify-center gap-1.5 px-3 py-2;
    @apply text-sm font-medium rounded-lg;
    @apply transition-all duration-150;
    @apply cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-primary {
    @apply bg-green-500 text-white hover:brightness-110;
  }

  .btn-secondary {
    @apply bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-200;
  }

  .btn-danger {
    @apply bg-red-500 text-white hover:brightness-110;
  }

  /* Inputs */
  .input {
    @apply w-full px-3 py-2 text-sm;
    @apply bg-white/5 text-neutral-200;
    @apply border border-white/10 rounded-lg;
    @apply transition-colors duration-150;
    @apply focus:outline-none focus:border-blue-500;
    @apply placeholder:text-neutral-500;
  }

  /* Labels */
  .label {
    @apply text-xs font-medium text-neutral-400;
  }

  /* Paneles */
  .panel {
    @apply flex flex-col h-full;
    @apply text-neutral-200;
  }

  .panel-header {
    @apply flex items-center justify-between;
    @apply px-2 py-1.5;
    @apply border-b border-white/10;
  }

  .panel-content {
    @apply flex-1 overflow-y-auto p-2;
  }

  /* Tabs */
  .tab {
    @apply px-2.5 py-1.5;
    @apply text-xs text-neutral-400;
    @apply rounded-lg cursor-pointer;
    @apply transition-all duration-150;
    @apply hover:bg-white/5 hover:text-neutral-200;
  }

  .tab-active {
    @apply bg-blue-500 text-white;
  }

  /* Cards/Items */
  .card {
    @apply p-3 bg-white/5 border border-white/10 rounded-lg;
    @apply transition-colors duration-150;
    @apply hover:border-blue-500;
  }

  .card-selected {
    @apply border-blue-500 bg-blue-500/10;
  }

  /* Estados vacíos */
  .empty-state {
    @apply flex flex-col items-center justify-center gap-2;
    @apply p-6 text-center;
  }

  .empty-icon {
    @apply text-3xl opacity-50;
  }

  .empty-title {
    @apply text-base font-semibold text-neutral-200;
  }

  .empty-text {
    @apply text-sm text-neutral-400;
  }

  /* Mensajes */
  .error-msg {
    @apply p-2 text-sm text-center;
    @apply bg-red-500/15 text-red-500 rounded-lg;
  }

  .success-msg {
    @apply p-2 text-sm text-center;
    @apply bg-green-500/15 text-green-500 rounded-lg;
  }

  /* Grid de selección */
  .selection-grid {
    @apply grid grid-cols-2 gap-1.5;
  }

  .selection-btn {
    @apply flex flex-col items-center gap-1 p-2;
    @apply bg-white/5 border-2 border-white/10 rounded-lg;
    @apply cursor-pointer transition-all duration-150;
    @apply hover:border-blue-500;
  }

  .selection-btn-active {
    @apply border-blue-500 bg-blue-500/10;
  }
}

/* ============================================================================
   Utilidades custom
   ============================================================================ */

@layer utilities {
  /* Scrollbar personalizado */
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}
`;

  writeFile(path.join(CONFIG.srcDir, 'app.css'), appCss);
  log.success('src/app.css creado');

  // Verificar si hay que importar el CSS en +layout.svelte
  const layoutPath = path.join(CONFIG.srcDir, 'routes', '+layout.svelte');
  if (fileExists(layoutPath)) {
    let layoutContent = readFile(layoutPath);
    if (!layoutContent.includes("import '../app.css'") && !layoutContent.includes('import "../app.css"')) {
      log.warning('Añade esta línea en src/routes/+layout.svelte:');
      log.detail("import '../app.css';");
    }
  }

  log.success('\n¡Instalación completada!');
  log.info('Próximos pasos:');
  log.detail('1. Añadir import "../app.css" en +layout.svelte');
  log.detail('2. Ejecutar: node scripts/migrate-to-tailwind.js --report');
  log.detail('3. Migrar componentes gradualmente');
}

// ============================================================================
// REPORTE
// ============================================================================

function generateReport() {
  log.step('Analizando archivos Svelte...');

  const files = findSvelteFiles(CONFIG.srcDir);
  const report = {
    totalFiles: files.length,
    filesWithStyles: 0,
    totalVariables: {},
    totalProperties: {},
    fileDetails: [],
  };

  for (const file of files) {
    const content = readFile(file);
    const styleBlock = extractStyleBlock(content);

    if (!styleBlock) continue;

    report.filesWithStyles++;

    const relativePath = path.relative(CONFIG.srcDir, file);
    const variables = countCSSVariables(styleBlock);
    const properties = countCSSProperties(styleBlock);

    // Acumular totales
    for (const [varName, count] of Object.entries(variables)) {
      report.totalVariables[varName] = (report.totalVariables[varName] || 0) + count;
    }
    for (const [propName, count] of Object.entries(properties)) {
      report.totalProperties[propName] = (report.totalProperties[propName] || 0) + count;
    }

    // Solo incluir archivos con estilos relevantes
    if (Object.keys(variables).length > 0 || Object.keys(properties).length > 0) {
      report.fileDetails.push({
        path: relativePath,
        variables,
        properties,
        styleLines: styleBlock.split('\n').length,
      });
    }
  }

  // Ordenar por cantidad de estilos
  report.fileDetails.sort((a, b) => b.styleLines - a.styleLines);

  // Mostrar reporte
  console.log('\n' + '='.repeat(70));
  console.log('  REPORTE DE MIGRACIÓN CSS → TAILWIND');
  console.log('='.repeat(70));

  console.log(`\n📊 RESUMEN`);
  console.log(`   Archivos Svelte totales: ${report.totalFiles}`);
  console.log(`   Archivos con <style>:    ${report.filesWithStyles}`);

  console.log(`\n🎨 VARIABLES CSS MÁS USADAS`);
  const sortedVars = Object.entries(report.totalVariables).sort((a, b) => b[1] - a[1]);
  for (const [varName, count] of sortedVars) {
    const tailwindClass = CONFIG.variableMap[varName] || '(sin mapeo)';
    console.log(`   ${count.toString().padStart(4)} × ${varName.padEnd(20)} → ${tailwindClass}`);
  }

  console.log(`\n📐 PROPIEDADES CSS MAPEABLES (top 15)`);
  const sortedProps = Object.entries(report.totalProperties).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [propName, count] of sortedProps) {
    const tailwindClass = CONFIG.propertyMap[propName];
    console.log(`   ${count.toString().padStart(4)} × ${propName.padEnd(35)} → ${tailwindClass}`);
  }

  console.log(`\n📁 ARCHIVOS A MIGRAR (por líneas de CSS)`);
  for (const file of report.fileDetails.slice(0, 15)) {
    console.log(`   ${file.styleLines.toString().padStart(4)} líneas  ${file.path}`);
  }

  if (report.fileDetails.length > 15) {
    console.log(`   ... y ${report.fileDetails.length - 15} archivos más`);
  }

  console.log('\n' + '='.repeat(70));

  // Guardar reporte JSON
  const reportPath = path.join(CONFIG.frontendDir, 'tailwind-migration-report.json');
  writeFile(reportPath, JSON.stringify(report, null, 2));
  log.success(`Reporte guardado en: ${reportPath}`);

  return report;
}

// ============================================================================
// MIGRACIÓN AUTOMÁTICA
// ============================================================================

function migrate(dryRun = false) {
  log.step(`${dryRun ? '[DRY RUN] ' : ''}Iniciando migración automática...`);

  // Crear backup
  if (!dryRun) {
    log.info('Creando backup...');
    if (!fs.existsSync(CONFIG.backupDir)) {
      fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    }
  }

  const files = findSvelteFiles(CONFIG.srcDir);
  let migratedCount = 0;
  let changesCount = 0;

  for (const file of files) {
    let content = readFile(file);
    const originalContent = content;
    let fileChanges = 0;

    // Migrar variables CSS a clases Tailwind en atributos class
    // Esta es una migración conservadora - solo reemplaza patrones claros

    // Reemplazar clases inline que usan variables
    // Ejemplo: style="color: var(--_text)" → class="text-var-text"

    const styleInlineRegex = /style="([^"]+)"/g;
    content = content.replace(styleInlineRegex, (match, styles) => {
      let newStyles = styles;
      let classesToAdd = [];

      // Mapear estilos inline a clases
      if (styles.includes('var(--_text)')) {
        classesToAdd.push('text-var-text');
        newStyles = newStyles.replace(/color:\s*var\(--_text\);?/g, '');
      }
      if (styles.includes('var(--_text-muted)')) {
        classesToAdd.push('text-var-muted');
        newStyles = newStyles.replace(/color:\s*var\(--_text-muted\);?/g, '');
      }

      newStyles = newStyles.trim();
      if (classesToAdd.length > 0) {
        fileChanges++;
        if (newStyles) {
          return `class="${classesToAdd.join(' ')}" style="${newStyles}"`;
        }
        return `class="${classesToAdd.join(' ')}"`;
      }

      return match;
    });

    if (content !== originalContent) {
      migratedCount++;
      changesCount += fileChanges;

      const relativePath = path.relative(CONFIG.srcDir, file);

      if (dryRun) {
        log.info(`[DRY RUN] ${relativePath}: ${fileChanges} cambios`);
      } else {
        // Backup
        const backupPath = path.join(CONFIG.backupDir, relativePath);
        writeFile(backupPath, originalContent);

        // Escribir cambios
        writeFile(file, content);
        log.success(`${relativePath}: ${fileChanges} cambios`);
      }
    }
  }

  console.log('\n' + '-'.repeat(50));
  log.info(`Archivos ${dryRun ? 'a migrar' : 'migrados'}: ${migratedCount}`);
  log.info(`Cambios totales: ${changesCount}`);

  if (!dryRun && migratedCount > 0) {
    log.success(`Backup guardado en: ${CONFIG.backupDir}`);
  }
}

// ============================================================================
// CLI
// ============================================================================

function showHelp() {
  console.log(`
Migrate to Tailwind CSS - Event Core
=====================================

Uso:
  node scripts/migrate-to-tailwind.js [opciones]

Opciones:
  --install     Instala Tailwind y crea configuración
  --report      Genera reporte de archivos a migrar
  --migrate     Ejecuta migración automática (conservadora)
  --dry-run     Muestra cambios sin aplicarlos (usar con --migrate)
  --help        Muestra esta ayuda

Ejemplos:
  node scripts/migrate-to-tailwind.js --install
  node scripts/migrate-to-tailwind.js --report
  node scripts/migrate-to-tailwind.js --migrate --dry-run
  node scripts/migrate-to-tailwind.js --migrate

Flujo recomendado:
  1. --install     → Instala y configura Tailwind
  2. --report      → Analiza el estado actual
  3. --dry-run     → Revisa los cambios propuestos
  4. --migrate     → Aplica cambios automáticos
  5. Manual        → Migra el resto gradualmente
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    showHelp();
    return;
  }

  console.log('\n🎨 Migrate to Tailwind CSS\n');

  if (args.includes('--install')) {
    install();
  }

  if (args.includes('--report')) {
    generateReport();
  }

  if (args.includes('--migrate')) {
    const dryRun = args.includes('--dry-run');
    migrate(dryRun);
  }
}

main();
