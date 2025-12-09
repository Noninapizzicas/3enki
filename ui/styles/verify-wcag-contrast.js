#!/usr/bin/env node
/**
 * Event Core UI - WCAG Contrast Verification
 *
 * Script para verificar que todos los colores del sistema cumplan con
 * WCAG AA (ratio >= 4.5:1)
 *
 * Usage: node verify-wcag-contrast.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load tokens from single source of truth
const tokens = JSON.parse(
  readFileSync(join(__dirname, '../../design-system/tokens.json'), 'utf-8')
);

/**
 * Calculate luminance for a hex color
 */
function getLuminance(hex) {
  const rgb = parseInt(hex.slice(1), 16);
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;

  const [rs, gs, bs] = [r, g, b].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
function calculateContrastRatio(hexColor1, hexColor2) {
  const lum1 = getLuminance(hexColor1);
  const lum2 = getLuminance(hexColor2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Extract all colors from tokens
 */
function extractColors() {
  const colors = [];

  for (const [group, values] of Object.entries(tokens.colors)) {
    if (typeof values === 'object') {
      for (const [shade, hex] of Object.entries(values)) {
        if (hex.startsWith('#')) {
          colors.push({
            name: shade === 'DEFAULT' ? group : `${group}-${shade}`,
            hex,
            group
          });
        }
      }
    }
  }

  return colors;
}

/**
 * Verify all colors
 */
function verifyAllColors() {
  console.log('='.repeat(70));
  console.log('WCAG AA CONTRAST VERIFICATION');
  console.log('Minimum required: 4.5:1');
  console.log('Source: design-system/tokens.json');
  console.log('='.repeat(70));
  console.log('');

  const colors = extractColors();
  const results = [];

  for (const color of colors) {
    const contrasteBlanco = calculateContrastRatio(color.hex, '#FFFFFF');
    const contrasteNegro = calculateContrastRatio(color.hex, '#000000');

    const cumpleBlanco = contrasteBlanco >= 4.5;
    const cumpleNegro = contrasteNegro >= 4.5;

    let recomendacion;
    if (cumpleBlanco && !cumpleNegro) {
      recomendacion = 'Use WHITE text';
    } else if (cumpleNegro && !cumpleBlanco) {
      recomendacion = 'Use BLACK text';
    } else if (cumpleBlanco && cumpleNegro) {
      recomendacion = 'Both colors OK';
    } else {
      recomendacion = 'WARNING: Neither passes';
    }

    results.push({
      name: color.name,
      hex: color.hex,
      group: color.group,
      contrasteBlanco: contrasteBlanco.toFixed(2),
      contrasteNegro: contrasteNegro.toFixed(2),
      cumpleBlanco,
      cumpleNegro,
      recomendacion
    });
  }

  return results;
}

/**
 * Print results grouped by color group
 */
function printResults(results) {
  const groups = [...new Set(results.map(r => r.group))];

  for (const group of groups) {
    console.log(`\n${group.toUpperCase()}`);
    console.log('-'.repeat(40));

    const groupColors = results.filter(r => r.group === group);

    for (const color of groupColors) {
      const whiteIcon = color.cumpleBlanco ? '✓' : '✗';
      const blackIcon = color.cumpleNegro ? '✓' : '✗';

      console.log(
        `  ${color.name.padEnd(20)} ${color.hex}  ` +
        `W:${color.contrasteBlanco}${whiteIcon}  ` +
        `B:${color.contrasteNegro}${blackIcon}`
      );
    }
  }
}

/**
 * Generate summary
 */
function printSummary(results) {
  const passing = results.filter(r => r.cumpleBlanco || r.cumpleNegro).length;
  const failing = results.filter(r => !r.cumpleBlanco && !r.cumpleNegro).length;

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total colors: ${results.length}`);
  console.log(`Passing: ${passing}`);
  console.log(`Failing: ${failing}`);

  if (failing > 0) {
    console.log('\nColors that need attention:');
    results
      .filter(r => !r.cumpleBlanco && !r.cumpleNegro)
      .forEach(r => console.log(`  - ${r.name} (${r.hex})`));
  }
}

/**
 * Generate JSON report
 */
function generateReport(results) {
  return {
    timestamp: new Date().toISOString(),
    source: 'design-system/tokens.json',
    standard: 'WCAG AA',
    min_ratio: 4.5,
    total: results.length,
    passing: results.filter(r => r.cumpleBlanco || r.cumpleNegro).length,
    failing: results.filter(r => !r.cumpleBlanco && !r.cumpleNegro).length,
    colors: results
  };
}

// Main execution
const results = verifyAllColors();
printResults(results);
printSummary(results);

const report = generateReport(results);
writeFileSync(
  join(__dirname, 'wcag-contrast-report.json'),
  JSON.stringify(report, null, 2)
);
console.log('\nReport saved: ui/styles/wcag-contrast-report.json');
