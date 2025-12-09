#!/usr/bin/env node
/**
 * Design System Generator
 *
 * Generates tailwind.config.js and variables.css from tokens.json
 *
 * Usage: node generate.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load tokens
const tokens = JSON.parse(readFileSync(join(__dirname, 'tokens.json'), 'utf-8'));

/**
 * Generate Tailwind config
 */
function generateTailwindConfig() {
  const config = `/** @type {import('tailwindcss').Config} */
// AUTO-GENERATED from design-system/tokens.json - DO NOT EDIT DIRECTLY
// Run: node design-system/generate.js

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: ${JSON.stringify(tokens.colors, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      spacing: ${JSON.stringify(tokens.spacing, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      borderRadius: ${JSON.stringify(tokens.borderRadius, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      fontFamily: {
        sans: ${JSON.stringify(tokens.fontFamily.sans)},
        mono: ${JSON.stringify(tokens.fontFamily.mono)}
      },
      fontSize: ${JSON.stringify(tokens.fontSize, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      fontWeight: ${JSON.stringify(tokens.fontWeight, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      boxShadow: ${JSON.stringify(tokens.boxShadow, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      transitionDuration: ${JSON.stringify(tokens.transitionDuration, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      zIndex: ${JSON.stringify(tokens.zIndex, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      screens: ${JSON.stringify(tokens.screens, null, 6).replace(/"/g, "'").replace(/\n/g, '\n      ')},
      width: {
        'sidebar': '${tokens.layout['sidebar-width']}',
        'sidebar-collapsed': '${tokens.layout['sidebar-collapsed']}',
        'modal': '500px'
      },
      margin: {
        'sidebar': '${tokens.layout['sidebar-width']}',
        'sidebar-collapsed': '${tokens.layout['sidebar-collapsed']}'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms')
  ]
}
`;

  return config;
}

/**
 * Generate CSS Variables
 */
function generateCSSVariables() {
  let css = `/**
 * Event Core Design System - CSS Variables
 * AUTO-GENERATED from design-system/tokens.json - DO NOT EDIT DIRECTLY
 * Run: node design-system/generate.js
 */

:root {
`;

  // Colors
  css += `  /* ========== COLORS ========== */\n`;

  for (const [group, values] of Object.entries(tokens.colors)) {
    if (typeof values === 'object') {
      for (const [shade, color] of Object.entries(values)) {
        const varName = shade === 'DEFAULT' ? `--${group}` : `--${group}-${shade}`;
        css += `  ${varName}: ${color};\n`;
      }
    }
    css += '\n';
  }

  // Spacing
  css += `  /* ========== SPACING ========== */\n`;
  for (const [name, value] of Object.entries(tokens.spacing)) {
    css += `  --spacing-${name}: ${value};\n`;
  }
  css += '\n';

  // Border Radius
  css += `  /* ========== BORDER RADIUS ========== */\n`;
  for (const [name, value] of Object.entries(tokens.borderRadius)) {
    css += `  --border-radius-${name}: ${value};\n`;
  }
  css += '\n';

  // Font Family
  css += `  /* ========== TYPOGRAPHY ========== */\n`;
  css += `  --font-family-sans: ${tokens.fontFamily.sans.join(', ')};\n`;
  css += `  --font-family-mono: ${tokens.fontFamily.mono.join(', ')};\n`;
  css += '\n';

  // Font Size
  for (const [name, value] of Object.entries(tokens.fontSize)) {
    css += `  --font-size-${name}: ${value};\n`;
  }
  css += '\n';

  // Font Weight
  for (const [name, value] of Object.entries(tokens.fontWeight)) {
    css += `  --font-weight-${name}: ${value};\n`;
  }
  css += '\n';

  // Box Shadow
  css += `  /* ========== SHADOWS ========== */\n`;
  for (const [name, value] of Object.entries(tokens.boxShadow)) {
    css += `  --shadow-${name}: ${value};\n`;
  }
  css += '\n';

  // Transitions
  css += `  /* ========== TRANSITIONS ========== */\n`;
  for (const [name, value] of Object.entries(tokens.transitionDuration)) {
    css += `  --transition-${name}: ${value} ease;\n`;
  }
  css += '\n';

  // Z-Index
  css += `  /* ========== Z-INDEX ========== */\n`;
  for (const [name, value] of Object.entries(tokens.zIndex)) {
    css += `  --z-${name}: ${value};\n`;
  }
  css += '\n';

  // Layout
  css += `  /* ========== LAYOUT ========== */\n`;
  for (const [name, value] of Object.entries(tokens.layout)) {
    css += `  --${name}: ${value};\n`;
  }
  css += '\n';

  // Accessibility
  css += `  /* ========== ACCESSIBILITY ========== */\n`;
  for (const [name, value] of Object.entries(tokens.accessibility)) {
    const cssValue = typeof value === 'number' && !name.includes('ratio') ? `${value}px` : value;
    css += `  --${name}: ${cssValue};\n`;
  }

  css += `}

/* ========== SEMANTIC ALIASES ========== */
:root {
  --background: var(--bg);
  --background-alt: var(--bg-card);
  --surface: var(--bg-card);
  --border: var(--border);
  --text-primary: var(--text);
  --text-secondary: var(--text-muted);
}

/* ========== DARK MODE (default) ========== */
[data-theme="light"] {
  --bg: #f9fafb;
  --bg-card: #ffffff;
  --bg-hover: #f3f4f6;
  --bg-input: #ffffff;
  --text: #111827;
  --text-muted: #6b7280;
  --text-disabled: #9ca3af;
  --border: #e5e7eb;
}
`;

  return css;
}

// Main execution
const tailwindConfig = generateTailwindConfig();
const cssVariables = generateCSSVariables();

// Write files
const frontendConfigPath = join(__dirname, '..', 'frontend', 'tailwind.config.js');
const cssVariablesPath = join(__dirname, '..', 'ui', 'styles', 'variables.css');

writeFileSync(frontendConfigPath, tailwindConfig);
console.log(`✓ Generated: ${frontendConfigPath}`);

writeFileSync(cssVariablesPath, cssVariables);
console.log(`✓ Generated: ${cssVariablesPath}`);

console.log('\nDesign system files generated successfully!');
console.log('Source: design-system/tokens.json');
