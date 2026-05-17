/**
 * Escandallo Tool Result Formatter
 *
 * Convierte resultados complejos de escandallo a strings formateados
 * ANTES de pasarlos al AI, evitando [object Object]
 */

class EscandalloToolResultFormatter {
  /**
   * Formatea resultado de obtenerEscandallo para presentación al AI
   * @param {Object} escandallo - { coste_total, coste_porcion, snapshot, ... }
   * @returns {string} Texto formateado listo para AI
   */
  static formatObtenerEscandallo(escandallo) {
    if (!escandallo || typeof escandallo !== 'object') {
      return '[Escandallo no disponible]';
    }

    const lines = [];

    lines.push('=== RESULTADO ESCANDALLO ===');
    lines.push('');

    // Información general
    if (escandallo.receta_nombre) {
      lines.push(`📋 Receta: ${escandallo.receta_nombre}`);
    }

    // Costes principales
    lines.push('💰 COSTES:');
    if (escandallo.coste_total !== undefined) {
      lines.push(`  • Coste Total: €${escandallo.coste_total.toFixed(2)}`);
    }
    if (escandallo.coste_porcion !== undefined) {
      lines.push(`  • Coste por Porción: €${escandallo.coste_porcion.toFixed(2)}`);
    }
    if (escandallo.porciones !== undefined) {
      lines.push(`  • Porciones: ${escandallo.porciones}`);
    }

    // Precio de venta y margen
    if (escandallo.precio_venta !== undefined) {
      lines.push('');
      lines.push('💵 VENTA:');
      lines.push(`  • Precio Venta: €${escandallo.precio_venta.toFixed(2)}`);

      if (escandallo.coste_porcion !== undefined) {
        const margen = escandallo.precio_venta - escandallo.coste_porcion;
        const porcentaje = ((margen / escandallo.precio_venta) * 100).toFixed(1);
        lines.push(`  • Margen: €${margen.toFixed(2)} (${porcentaje}%)`);
      }
    }

    // Food Cost si está disponible
    if (escandallo.food_cost_porcentaje !== undefined) {
      lines.push('');
      lines.push('📊 VIABILIDAD:');
      lines.push(`  • Food Cost: ${escandallo.food_cost_porcentaje.toFixed(1)}%`);

      const status = this.getFoodCostStatus(escandallo.food_cost_porcentaje);
      lines.push(`  • Estado: ${status}`);
    }

    // Desglose por ingrediente si está disponible
    if (escandallo.snapshot && typeof escandallo.snapshot === 'object') {
      lines.push('');
      lines.push('📦 DESGLOSE POR INGREDIENTE:');

      // Intentar parsear si es string JSON
      let snapshot = escandallo.snapshot;
      if (typeof snapshot === 'string') {
        try {
          snapshot = JSON.parse(snapshot);
        } catch (e) {
          // Si no es JSON válido, mostrar como texto
          lines.push(`  ${snapshot.substring(0, 100)}...`);
          return lines.join('\n');
        }
      }

      // Si es objeto, listar ingredientes
      if (typeof snapshot === 'object') {
        const entries = Object.entries(snapshot);
        if (entries.length > 0) {
          entries
            .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))
            .slice(0, 5)
            .forEach(([nombre, precio]) => {
              const porcentaje = escandallo.coste_total
                ? ((parseFloat(precio) / escandallo.coste_total) * 100).toFixed(1)
                : '?';
              lines.push(`  • ${nombre}: €${parseFloat(precio).toFixed(2)} (${porcentaje}%)`);
            });

          if (entries.length > 5) {
            lines.push(`  ... y ${entries.length - 5} más`);
          }
        }
      }
    }

    // Notas
    if (escandallo.notas) {
      lines.push('');
      lines.push(`📝 Notas: ${escandallo.notas}`);
    }

    lines.push('');
    lines.push(`⏰ Calculado: ${escandallo.calculado_at ? new Date(escandallo.calculado_at).toLocaleString('es-ES') : 'fecha desconocida'}`);

    return lines.join('\n');
  }

  /**
   * Formatea estado de food cost
   * @param {number} porcentaje - Porcentaje de food cost
   * @returns {string} Descripción del estado
   */
  static getFoodCostStatus(porcentaje) {
    if (porcentaje <= 25) return '✅ Excelente';
    if (porcentaje <= 30) return '✅ Óptimo';
    if (porcentaje <= 35) return '⚠️ Aceptable';
    if (porcentaje <= 40) return '⚠️ Advertencia';
    return '❌ Crítico';
  }

  /**
   * Formatea resultado de calcularImpacto
   * @param {Object} result - Resultado de cálculo de impacto
   * @returns {string} Texto formateado
   */
  static formatImpactoCalculo(result) {
    if (!result || typeof result !== 'object') {
      return '[Cálculo no disponible]';
    }

    const lines = [];

    lines.push('=== ANÁLISIS DE IMPACTO ===');
    lines.push('');

    if (result.change_type) {
      lines.push(`📌 Tipo de cambio: ${result.change_type}`);
    }

    if (result.coste_antes !== undefined && result.coste_despues !== undefined) {
      const diferencia = result.coste_despues - result.coste_antes;
      const porcentaje = ((diferencia / result.coste_antes) * 100).toFixed(1);

      lines.push(`Coste antes: €${result.coste_antes.toFixed(2)}`);
      lines.push(`Coste después: €${result.coste_despues.toFixed(2)}`);
      lines.push(`Diferencia: €${diferencia.toFixed(2)} (${porcentaje}%)`);
    }

    if (result.nuevo_margen !== undefined) {
      lines.push(`Margen estimado: €${result.nuevo_margen.toFixed(2)}`);
    }

    if (result.recomendacion) {
      lines.push('');
      lines.push(`💡 Recomendación: ${result.recomendacion}`);
    }

    return lines.join('\n');
  }

  /**
   * Wrapper seguro que maneja cualquier tipo de resultado
   * @param {*} data - Datos a formatear
   * @param {string} tipo - Tipo de resultado ('obtener' | 'impacto' | 'otro')
   * @returns {string} Siempre retorna string
   */
  static formatSafely(data, tipo = 'obtener') {
    try {
      if (!data) return '[Sin datos]';
      if (typeof data === 'string') return data;

      switch (tipo) {
        case 'obtener':
          return this.formatObtenerEscandallo(data);
        case 'impacto':
          return this.formatImpactoCalculo(data);
        default:
          return JSON.stringify(data);
      }
    } catch (error) {
      return `[Error al formatear: ${error.message}]`;
    }
  }
}

module.exports = EscandalloToolResultFormatter;
