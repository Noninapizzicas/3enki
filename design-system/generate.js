#!/usr/bin/env node
/**
 * Design System Generator
 *
 * Generates tailwind.config.js from tokens.json
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

// Main execution
const tailwindConfig = generateTailwindConfig();
const frontendConfigPath = join(__dirname, '..', 'frontend', 'tailwind.config.js');

writeFileSync(frontendConfigPath, tailwindConfig);
console.log(`Generated: ${frontendConfigPath}`);
console.log('\nSource: design-system/tokens.json');
