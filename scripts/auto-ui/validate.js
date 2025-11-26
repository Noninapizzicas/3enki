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
 * Valida un componente Auto-UI v2
 */
function validateComponent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const component = JSON.parse(content);
    const errors = [];
    const warnings = [];

    // Required fields for v2
    if (!component.name) {
      errors.push('Missing required field: name');
    }

    // v2: Check version
    if (component.version) {
      const version = parseFloat(component.version);
      if (version < 2.0) {
        warnings.push(`Component uses old version ${component.version}, should be 2.0.0+`);
      }
    }

    // v2: Should have _category instead of type
    if (!component._category && !component.type) {
      errors.push('Missing required field: _category (or legacy type)');
    }
    if (component.type && !component._category) {
      warnings.push('Using legacy "type" field, should use "_category" in v2');
    }

    // Validate category is known
    const validCategories = ['core', 'layout', 'data', 'feedback', 'form', 'navigation', 'custom'];
    const category = component._category || component.type;
    if (category && !validCategories.includes(category)) {
      warnings.push(`Unknown component category: ${category}`);
    }

    // v2: Validate props definition
    if (component.props) {
      // Good - has props definition
      for (const [propName, propDef] of Object.entries(component.props)) {
        if (!propDef.type) {
          errors.push(`Property "${propName}" missing type definition`);
        }
      }
    } else {
      warnings.push('Component missing "props" definition (recommended in v2)');
    }

    // Validate interactions
    if (component.interactions) {
      const validInteractions = Object.values(UI.INTERACTIONS);
      for (const interaction of Object.keys(component.interactions)) {
        if (!validInteractions.includes(interaction) && !['row-click', 'row-dblclick', 'header-click', 'select', 'drag', 'swipe'].includes(interaction)) {
          warnings.push(`Unknown interaction: ${interaction}`);
        }
      }
    }

    // Validate variants
    if (component.variants) {
      const validVariants = ['primary', 'secondary', 'success', 'warning', 'danger', 'ghost', 'outline', 'default'];
      for (const [variantName, variantDef] of Object.entries(component.variants)) {
        if (!validVariants.includes(variantName)) {
          warnings.push(`Custom variant: ${variantName}`);
        }
        // v2: Check for hover states
        if (variantName !== 'default' && !variantDef.hover) {
          warnings.push(`Variant "${variantName}" missing hover state (recommended in v2)`);
        }
      }
    }

    // v2: Validate states
    if (component.states) {
      const recommendedStates = ['default', 'hover', 'active', 'focus', 'disabled', 'loading'];
      const missingStates = recommendedStates.filter(s => !component.states[s]);
      if (missingStates.length > 0) {
        warnings.push(`Missing recommended states: ${missingStates.join(', ')}`);
      }
    } else {
      warnings.push('Component missing "states" definition (recommended in v2)');
    }

    // v2: Check for accessibility
    if (!component.accessibility) {
      warnings.push('Component missing "accessibility" definition (recommended in v2)');
    } else {
      if (!component.accessibility.role) {
        warnings.push('Accessibility missing "role"');
      }
      if (!component.accessibility.keyboard) {
        warnings.push('Accessibility missing "keyboard" bindings (recommended in v2)');
      }
    }

    // v2: Check for animations
    if (!component.animations && category === 'feedback') {
      warnings.push('Feedback component missing "animations" (recommended)');
    }

    if (errors.length > 0) {
      results.components.invalid++;
      results.components.errors.push({ file: filePath, errors, warnings });
      return false;
    }

    if (warnings.length > 0) {
      results.components.warnings = results.components.warnings || [];
      results.components.warnings.push({ file: filePath, warnings });
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
 * Valida una vista Auto-UI v2
 */
function validateView(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const view = JSON.parse(content);
    const errors = [];
    const warnings = [];

    // Required fields
    if (!view.name) {
      errors.push('Missing required field: name');
    }
    if (!view.type) {
      errors.push('Missing required field: type');
    }

    // Validate view type
    const validTypes = Object.values(UI.VIEWS);
    if (view.type && !validTypes.includes(view.type) && !['custom', 'widget-group'].includes(view.type)) {
      errors.push(`Unknown view type: ${view.type}`);
    }

    // v2: Check for deprecated widget names
    const contentStr = JSON.stringify(view);
    if (contentStr.includes('"metric-card"')) {
      warnings.push('Using deprecated "metric-card", should use "stat-card" in v2');
    }
    if (contentStr.includes('"type":"table"') && !contentStr.includes('table-advanced')) {
      warnings.push('Using basic "table", consider using "table-advanced" for v2 features');
    }

    // v2: Validate @data references format
    const dataRefs = contentStr.match(/@data\.[a-zA-Z0-9_.]+/g);
    if (dataRefs) {
      // Good - uses v2 data binding
    } else if (contentStr.includes('\\{{')) {
      warnings.push('Using legacy template syntax (\\{{}}), prefer @data references in v2');
    }

    // v2: STRICT layout validation
    if (view.type === 'dashboard') {
      if (!view.layout) {
        errors.push('[v2] Dashboard MUST have "layout" definition');
      } else {
        // v2 STRICT: layout must be object with type and config
        if (typeof view.layout === 'string') {
          errors.push(`[v2] Layout MUST be object {type, config}, not string. Found: "${view.layout}"`);
        } else if (!view.layout.type) {
          errors.push('[v2] Layout object missing required "type" property');
        } else if (!view.layout.config) {
          errors.push('[v2] Layout object missing required "config" property');
        } else {
          const validLayouts = ['two-column', 'three-column', 'grid', 'tabs', 'flex', 'sidebar'];
          if (!validLayouts.includes(view.layout.type)) {
            warnings.push(`Unknown layout type: ${view.layout.type}`);
          }

          // Check for required config properties based on layout type
          if (view.layout.type === 'two-column') {
            if (!view.layout.config.leftWidth || !view.layout.config.rightWidth) {
              errors.push('[v2] two-column layout.config MUST have leftWidth and rightWidth');
            }
          }
        }
      }

      // v2 STRICT: Check for "widget" vs "type" in sections
      if (view.sections && Array.isArray(view.sections)) {
        for (const section of view.sections) {
          if (section.type && !section.widget) {
            errors.push(`[v2] Section "${section.id}" MUST use "widget" property, not "type"`);
          }

          // v2: Deprecated "column" property
          if (section.column) {
            warnings.push(`[v2] Section "${section.id}" uses deprecated "column" property`);
          }

          // v2: Props should be in "config"
          if (section.widget && (section.title || section.label) && !section.config) {
            warnings.push(`[v2] Section "${section.id}" props should be wrapped in "config" object`);
          }
        }
      }

      // v2: Check for permissions
      if (!view.permissions) {
        warnings.push('[v2] View missing "permissions" array (recommended in v2)');
      }
    }

    // Validate actions
    if (view.header?.actions) {
      for (const action of view.header.actions) {
        if (action.action?.type) {
          const validActions = Object.values(UI.ACTIONS);
          if (!validActions.includes(action.action.type)) {
            warnings.push(`Unknown action type: ${action.action.type}`);
          }
        }
      }
    }

    // v2: Check for realtime/MQTT integration
    if (view.realtime || contentStr.includes('mqtt_topic')) {
      // Good - has realtime support
    } else if (view.type === 'dashboard' || view.type === 'list') {
      warnings.push('Dashboard/list view missing realtime updates (consider adding mqtt_topic)');
    }

    if (errors.length > 0) {
      results.views.invalid++;
      results.views.errors.push({ file: filePath, errors, warnings });
      return false;
    }

    if (warnings.length > 0) {
      results.views.warnings = results.views.warnings || [];
      results.views.warnings.push({ file: filePath, warnings });
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
  const totalWarnings = (results.components.warnings?.length || 0) + (results.views.warnings?.length || 0);

  console.log(`   Components: ${results.components.valid} valid, ${results.components.invalid} invalid`);
  console.log(`   Themes:     ${results.themes.valid} valid, ${results.themes.invalid} invalid`);
  console.log(`   Views:      ${results.views.valid} valid, ${results.views.invalid} invalid`);
  console.log(`   ─────────────────────`);
  console.log(`   Total:      ${totalValid} valid, ${totalInvalid} invalid\n`);

  if (totalWarnings > 0) {
    console.log(`⚠️  ${totalWarnings} warnings found (Auto-UI v2 recommendations)\n`);
  }

  // Show errors
  if (totalInvalid > 0) {
    console.log('❌ Errors:\n');

    const allErrors = [
      ...results.components.errors,
      ...results.themes.errors,
      ...results.views.errors
    ];

    for (const { file, errors, warnings } of allErrors) {
      console.log(`   ${path.relative(process.cwd(), file)}:`);
      for (const error of errors) {
        console.log(`      ❌ ${error}`);
      }
      if (warnings) {
        for (const warning of warnings) {
          console.log(`      ⚠️  ${warning}`);
        }
      }
      console.log('');
    }

    process.exit(1);
  }

  // Show warnings (non-fatal)
  if (totalWarnings > 0) {
    console.log('⚠️  Warnings:\n');

    const allWarnings = [
      ...(results.components.warnings || []),
      ...(results.views.warnings || [])
    ];

    for (const { file, warnings } of allWarnings) {
      console.log(`   ${path.relative(process.cwd(), file)}:`);
      for (const warning of warnings) {
        console.log(`      ⚠️  ${warning}`);
      }
      console.log('');
    }
  }

  console.log('✅ All validations passed!\n');
  if (totalWarnings > 0) {
    console.log(`💡 Consider addressing ${totalWarnings} warnings for full Auto-UI v2 compatibility\n`);
  }
  process.exit(0);
}

// Run
scan();
