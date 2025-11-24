#!/usr/bin/env node

/**
 * Auto-UI Validator
 *
 * Valida componentes, vistas y temas del sistema Auto-UI
 *
 * Usage:
 *   node scripts/auto-ui/validate.js
 *   npm run ui:validate
 */

const fs = require('fs');
const path = require('path');
const { UI } = require('../../core/constants');

// Paths
const AUTO_UI_PATH = path.join(process.cwd(), 'auto-ui');
const COMPONENTS_PATH = path.join(AUTO_UI_PATH, 'components');
const THEMES_PATH = path.join(AUTO_UI_PATH, 'config', 'themes');
const MODULES_PATH = path.join(process.cwd(), 'modules');

// Results
const results = {
  components: { valid: 0, invalid: 0, errors: [] },
  themes: { valid: 0, invalid: 0, errors: [] },
  views: { valid: 0, invalid: 0, errors: [] }
};

// ==========================================
// Validators
// ==========================================

/**
 * Valida un componente
 */
function validateComponent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const component = JSON.parse(content);
    const errors = [];

    // Required fields
    if (!component.name) {
      errors.push('Missing required field: name');
    }
    if (!component.type) {
      errors.push('Missing required field: type');
    }

    // Validate type is known
    const validTypes = Object.values(UI.COMPONENTS);
    if (component.type && !validTypes.includes(component.type) && !['core', 'layout', 'data', 'feedback', 'form', 'navigation'].includes(component.type)) {
      errors.push(`Unknown component type: ${component.type}`);
    }

    // Validate interactions
    if (component.interactions) {
      const validInteractions = Object.values(UI.INTERACTIONS);
      for (const interaction of Object.keys(component.interactions)) {
        if (!validInteractions.includes(interaction) && !['row-click', 'row-dblclick', 'header-click', 'select'].includes(interaction)) {
          errors.push(`Unknown interaction: ${interaction}`);
        }
      }
    }

    // Validate variants
    if (component.variants) {
      const validVariants = Object.values(UI.VARIANTS);
      for (const variant of Object.keys(component.variants)) {
        if (!validVariants.includes(variant) && !['default', 'elevated', 'outlined', 'interactive'].includes(variant)) {
          // Warning only, custom variants are allowed
        }
      }
    }

    if (errors.length > 0) {
      results.components.invalid++;
      results.components.errors.push({ file: filePath, errors });
      return false;
    }

    results.components.valid++;
    return true;
  } catch (error) {
    results.components.invalid++;
    results.components.errors.push({ file: filePath, errors: [error.message] });
    return false;
  }
}

/**
 * Valida un tema
 */
function validateTheme(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const theme = JSON.parse(content);
    const errors = [];

    // Required fields
    if (!theme.name) {
      errors.push('Missing required field: name');
    }

    // Required color tokens
    const requiredColors = ['bg', 'text', 'primary', 'border'];
    if (theme.colors) {
      for (const color of requiredColors) {
        if (!theme.colors[color]) {
          errors.push(`Missing required color: ${color}`);
        }
      }
    } else {
      errors.push('Missing required field: colors');
    }

    // Required spacing
    const requiredSpacing = ['sm', 'md', 'lg'];
    if (theme.spacing) {
      for (const space of requiredSpacing) {
        if (!theme.spacing[space]) {
          errors.push(`Missing required spacing: ${space}`);
        }
      }
    } else {
      errors.push('Missing required field: spacing');
    }

    if (errors.length > 0) {
      results.themes.invalid++;
      results.themes.errors.push({ file: filePath, errors });
      return false;
    }

    results.themes.valid++;
    return true;
  } catch (error) {
    results.themes.invalid++;
    results.themes.errors.push({ file: filePath, errors: [error.message] });
    return false;
  }
}

/**
 * Valida una vista
 */
function validateView(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const view = JSON.parse(content);
    const errors = [];

    // Required fields
    if (!view.name) {
      errors.push('Missing required field: name');
    }
    if (!view.type) {
      errors.push('Missing required field: type');
    }

    // Validate view type
    const validTypes = Object.values(UI.VIEWS);
    if (view.type && !validTypes.includes(view.type) && !['custom'].includes(view.type)) {
      errors.push(`Unknown view type: ${view.type}`);
    }

    // Validate actions
    if (view.header?.actions) {
      for (const action of view.header.actions) {
        if (action.action?.type) {
          const validActions = Object.values(UI.ACTIONS);
          if (!validActions.includes(action.action.type)) {
            errors.push(`Unknown action type: ${action.action.type}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      results.views.invalid++;
      results.views.errors.push({ file: filePath, errors });
      return false;
    }

    results.views.valid++;
    return true;
  } catch (error) {
    results.views.invalid++;
    results.views.errors.push({ file: filePath, errors: [error.message] });
    return false;
  }
}

// ==========================================
// Scanner
// ==========================================

/**
 * Escanea y valida todos los archivos
 */
function scan() {
  console.log('\n🔍 Auto-UI Validator\n');
  console.log('='.repeat(50) + '\n');

  // Validate components
  console.log('📦 Validating components...\n');
  if (fs.existsSync(COMPONENTS_PATH)) {
    const categories = fs.readdirSync(COMPONENTS_PATH, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const category of categories) {
      const categoryPath = path.join(COMPONENTS_PATH, category);
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(categoryPath, file);
        const valid = validateComponent(filePath);
        console.log(`   ${valid ? '✓' : '✗'} ${category}/${file}`);
      }
    }
  }

  // Validate themes
  console.log('\n🎨 Validating themes...\n');
  if (fs.existsSync(THEMES_PATH)) {
    const files = fs.readdirSync(THEMES_PATH).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(THEMES_PATH, file);
      const valid = validateTheme(filePath);
      console.log(`   ${valid ? '✓' : '✗'} ${file}`);
    }
  }

  // Also validate main theme.json
  const mainThemePath = path.join(AUTO_UI_PATH, 'config', 'theme.json');
  if (fs.existsSync(mainThemePath)) {
    const valid = validateTheme(mainThemePath);
    console.log(`   ${valid ? '✓' : '✗'} theme.json (active)`);
  }

  // Validate module views
  console.log('\n📄 Validating module views...\n');
  if (fs.existsSync(MODULES_PATH)) {
    const modules = fs.readdirSync(MODULES_PATH, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const moduleName of modules) {
      const viewsPath = path.join(MODULES_PATH, moduleName, 'views');
      if (fs.existsSync(viewsPath)) {
        const files = fs.readdirSync(viewsPath).filter(f => f.endsWith('.json'));

        for (const file of files) {
          const filePath = path.join(viewsPath, file);
          const valid = validateView(filePath);
          console.log(`   ${valid ? '✓' : '✗'} ${moduleName}/views/${file}`);
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary\n');

  const totalValid = results.components.valid + results.themes.valid + results.views.valid;
  const totalInvalid = results.components.invalid + results.themes.invalid + results.views.invalid;

  console.log(`   Components: ${results.components.valid} valid, ${results.components.invalid} invalid`);
  console.log(`   Themes:     ${results.themes.valid} valid, ${results.themes.invalid} invalid`);
  console.log(`   Views:      ${results.views.valid} valid, ${results.views.invalid} invalid`);
  console.log(`   ─────────────────────`);
  console.log(`   Total:      ${totalValid} valid, ${totalInvalid} invalid\n`);

  // Show errors
  if (totalInvalid > 0) {
    console.log('❌ Errors:\n');

    const allErrors = [
      ...results.components.errors,
      ...results.themes.errors,
      ...results.views.errors
    ];

    for (const { file, errors } of allErrors) {
      console.log(`   ${path.relative(process.cwd(), file)}:`);
      for (const error of errors) {
        console.log(`      - ${error}`);
      }
      console.log('');
    }

    process.exit(1);
  }

  console.log('✅ All validations passed!\n');
  process.exit(0);
}

// Run
scan();
