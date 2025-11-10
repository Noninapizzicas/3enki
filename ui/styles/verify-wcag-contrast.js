/**
 * Event Core UI - WCAG Contrast Verification
 *
 * Script para verificar que todos los colores del sistema cumplan con
 * WCAG AA (ratio ≥ 4.5:1)
 */

import { DesignTokens, calculateContrastRatio, meetsWCAG_AA_onWhite, meetsWCAG_AA_onBlack } from './design-tokens.js';

/**
 * Verifica todos los colores funcionales
 */
function verifyAllColors() {
  console.log('='.repeat(70));
  console.log('VERIFICACIÓN DE CONTRASTE WCAG AA');
  console.log('Mínimo requerido: 4.5:1');
  console.log('='.repeat(70));
  console.log('');

  const results = [];

  for (const [nombre, colorData] of Object.entries(DesignTokens.colors)) {
    const { hex, significado } = colorData;

    // Calcular contrastes
    const contrasteBlanco = calculateContrastRatio(hex, '#FFFFFF');
    const contrasteNegro = calculateContrastRatio(hex, '#000000');

    // Verificar cumplimiento
    const cumpleBlanco = contrasteBlanco >= 4.5;
    const cumpleNegro = contrasteNegro >= 4.5;

    // Recomendación de fondo
    let recomendacion;
    if (cumpleBlanco && !cumpleNegro) {
      recomendacion = 'Usar texto BLANCO';
    } else if (cumpleNegro && !cumpleBlanco) {
      recomendacion = 'Usar texto NEGRO';
    } else if (cumpleBlanco && cumpleNegro) {
      recomendacion = 'Ambos colores OK';
    } else {
      recomendacion = '⚠️ NINGUNO CUMPLE';
    }

    results.push({
      nombre,
      hex,
      significado,
      contrasteBlanco: contrasteBlanco.toFixed(2),
      contrasteNegro: contrasteNegro.toFixed(2),
      cumpleBlanco,
      cumpleNegro,
      recomendacion
    });

    // Imprimir resultado
    console.log(`📊 ${nombre.toUpperCase()}`);
    console.log(`   Color: ${hex}`);
    console.log(`   Significado: ${significado}`);
    console.log(`   Contraste con blanco: ${contrasteBlanco.toFixed(2)}:1 ${cumpleBlanco ? '✅' : '❌'}`);
    console.log(`   Contraste con negro: ${contrasteNegro.toFixed(2)}:1 ${cumpleNegro ? '✅' : '❌'}`);
    console.log(`   → ${recomendacion}`);
    console.log('');
  }

  return results;
}

/**
 * Genera recomendaciones para los colores que no cumplen
 */
function generateRecommendations(results) {
  console.log('='.repeat(70));
  console.log('RECOMENDACIONES');
  console.log('='.repeat(70));
  console.log('');

  const problemColors = results.filter(r => !r.cumpleBlanco && !r.cumpleNegro);

  if (problemColors.length === 0) {
    console.log('✅ Todos los colores cumplen con WCAG AA!');
  } else {
    console.log(`⚠️  ${problemColors.length} color(es) no cumplen con WCAG AA:`);
    console.log('');

    problemColors.forEach(color => {
      console.log(`   ${color.nombre} (${color.hex})`);
      console.log(`   Sugerencia: Oscurecer o aclarar el color, o usar solo para elementos decorativos`);
      console.log('');
    });
  }

  // Imprimir colores que solo funcionan con un fondo específico
  const whiteOnlyColors = results.filter(r => r.cumpleBlanco && !r.cumpleNegro);
  const blackOnlyColors = results.filter(r => !r.cumpleBlanco && r.cumpleNegro);

  if (whiteOnlyColors.length > 0) {
    console.log('');
    console.log('💡 Colores que REQUIEREN texto blanco:');
    whiteOnlyColors.forEach(c => {
      console.log(`   - ${c.nombre} (${c.hex}): ${c.significado}`);
    });
  }

  if (blackOnlyColors.length > 0) {
    console.log('');
    console.log('💡 Colores que REQUIEREN texto negro:');
    blackOnlyColors.forEach(c => {
      console.log(`   - ${c.nombre} (${c.hex}): ${c.significado}`);
    });
  }
}

/**
 * Verifica combinaciones de colores específicas del sistema
 */
function verifyColorCombinations() {
  console.log('');
  console.log('='.repeat(70));
  console.log('VERIFICACIÓN DE COMBINACIONES DE COLORES');
  console.log('='.repeat(70));
  console.log('');

  const combinations = [
    {
      name: 'Botón Verde Acción (texto blanco)',
      bg: DesignTokens.colors.verde_accion.hex,
      fg: '#FFFFFF'
    },
    {
      name: 'Botón Rojo Error (texto blanco)',
      bg: DesignTokens.colors.rojo_error.hex,
      fg: '#FFFFFF'
    },
    {
      name: 'Botón Azul Info (texto blanco)',
      bg: DesignTokens.colors.azul_info.hex,
      fg: '#FFFFFF'
    },
    {
      name: 'Botón Ámbar Pendiente (texto negro)',
      bg: DesignTokens.colors.ambar_pendiente.hex,
      fg: '#000000'
    },
    {
      name: 'Botón Gris Base (texto blanco)',
      bg: DesignTokens.colors.gris_base.hex,
      fg: '#FFFFFF'
    }
  ];

  combinations.forEach(combo => {
    const ratio = calculateContrastRatio(combo.bg, combo.fg);
    const cumple = ratio >= 4.5;

    console.log(`${cumple ? '✅' : '❌'} ${combo.name}`);
    console.log(`   Fondo: ${combo.bg}, Texto: ${combo.fg}`);
    console.log(`   Ratio: ${ratio.toFixed(2)}:1 ${cumple ? '(Cumple WCAG AA)' : '(NO cumple WCAG AA)'}`);
    console.log('');
  });
}

/**
 * Genera reporte JSON
 */
function generateJSONReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    standard: 'WCAG AA',
    min_ratio: 4.5,
    total_colors: results.length,
    passing: results.filter(r => r.cumpleBlanco || r.cumpleNegro).length,
    failing: results.filter(r => !r.cumpleBlanco && !r.cumpleNegro).length,
    colors: results
  };

  return report;
}

/**
 * Ejecutar verificación
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const results = verifyAllColors();
  generateRecommendations(results);
  verifyColorCombinations();

  console.log('');
  console.log('='.repeat(70));
  console.log('RESUMEN');
  console.log('='.repeat(70));

  const report = generateJSONReport(results);
  console.log(`Total de colores: ${report.total_colors}`);
  console.log(`✅ Aprobados: ${report.passing}`);
  console.log(`❌ Reprobados: ${report.failing}`);
  console.log('');

  // Escribir reporte JSON
  const fs = await import('fs');
  fs.writeFileSync(
    './wcag-contrast-report.json',
    JSON.stringify(report, null, 2)
  );
  console.log('📄 Reporte guardado en: wcag-contrast-report.json');
}

export { verifyAllColors, generateRecommendations, verifyColorCombinations, generateJSONReport };
