/**
 * Ingredientes Formatter
 *
 * Convierte arrays/objetos de ingredientes a texto formateado correctamente
 * para evitar el problema de [object Object] en respuestas del LLM
 */

class IngredientesFormatter {
  /**
   * Formatea un ingrediente individual a texto
   * @param {Object} ing - { nombre, cantidad, unidad, precio_mercado?, precio_compra? }
   * @returns {string} Texto formateado del ingrediente
   */
  static formatIngredient(ing) {
    if (!ing) return '';

    // Si es un objeto, extraer propiedades
    const nombre = ing.nombre || ing.name || '';
    const cantidad = ing.cantidad || ing.amount || '';
    const unidad = ing.unidad || ing.unit || '';
    const precio = ing.precio_mercado || ing.precio_compra || ing.price || '';

    // Construir línea de ingrediente
    let linea = `${nombre}`;

    if (cantidad && unidad) {
      linea += ` — ${cantidad}${unidad}`;
    } else if (cantidad) {
      linea += ` — ${cantidad}`;
    }

    if (precio) {
      linea += ` — €${typeof precio === 'number' ? precio.toFixed(2) : precio}`;
    }

    return linea;
  }

  /**
   * Formatea un array de ingredientes a texto
   * @param {Array} ingredientes - Array de objetos de ingredientes
   * @param {Object} options - { includePrice: bool, numbered: bool }
   * @returns {string} Texto formateado con saltos de línea
   */
  static formatIngredientsList(ingredientes, options = {}) {
    if (!ingredientes || !Array.isArray(ingredientes)) {
      return '';
    }

    const { numbered = false, includePrice = true } = options;

    const lineas = ingredientes.map((ing, idx) => {
      if (!ing || typeof ing !== 'object') return '';

      const nombre = ing.nombre || ing.name || '';
      const cantidad = ing.cantidad || ing.amount || '';
      const unidad = ing.unidad || ing.unit || '';
      const precio = includePrice ? (ing.precio_mercado || ing.precio_compra || ing.price) : null;

      // Construir línea
      let linea = nombre;

      if (cantidad && unidad) {
        linea += ` — ${cantidad}${unidad}`;
      } else if (cantidad) {
        linea += ` — ${cantidad}`;
      }

      if (precio && includePrice) {
        linea += ` — €${typeof precio === 'number' ? precio.toFixed(2) : precio}`;
      }

      // Numerar si es necesario
      if (numbered) {
        linea = `${idx + 1}. ${linea}`;
      }

      return linea;
    }).filter(l => l.length > 0);

    return lineas.join('\n');
  }

  /**
   * Formatea ingredientes como tabla ASCII
   * @param {Array} ingredientes - Array de objetos
   * @returns {string} Tabla ASCII formateada
   */
  static formatIngredientsTable(ingredientes) {
    if (!ingredientes || !Array.isArray(ingredientes) || ingredientes.length === 0) {
      return 'Sin ingredientes';
    }

    // Filtrar objetos válidos
    const validIngredients = ingredientes.filter(ing =>
      ing && typeof ing === 'object' && ing.nombre
    );

    if (validIngredients.length === 0) {
      return 'Sin ingredientes válidos';
    }

    // Calcular anchos de columna
    const maxNameLength = Math.max(
      ...validIngredients.map(ing => (ing.nombre || '').length),
      10
    );
    const maxQuantityLength = Math.max(
      ...validIngredients.map(ing => `${ing.cantidad || ''}${ing.unidad || ''}`.length),
      10
    );
    const maxPriceLength = 10;

    // Construir tabla
    const lines = [];

    // Encabezado
    const header =
      `${'Ingrediente'.padEnd(maxNameLength + 2)}` +
      `${'Cantidad'.padEnd(maxQuantityLength + 2)}` +
      `${'Precio'}`;
    lines.push(header);
    lines.push('─'.repeat(header.length));

    // Filas
    validIngredients.forEach(ing => {
      const nombre = (ing.nombre || '').padEnd(maxNameLength + 2);
      const cantidad = `${ing.cantidad || ''}${ing.unidad || ''}`.padEnd(maxQuantityLength + 2);
      const precio = ing.precio_mercado ? `€${ing.precio_mercado.toFixed(2)}` : '—';
      lines.push(`${nombre}${cantidad}${precio}`);
    });

    return lines.join('\n');
  }

  /**
   * Formatea ingredientes como JSON válido (para contexto del LLM)
   * @param {Array} ingredientes - Array de objetos
   * @returns {string} JSON formateado
   */
  static formatIngredientsJSON(ingredientes) {
    if (!ingredientes || !Array.isArray(ingredientes)) {
      return '[]';
    }

    const formatted = ingredientes.map(ing => {
      if (!ing || typeof ing !== 'object') return null;

      return {
        nombre: ing.nombre || ing.name || '',
        cantidad: ing.cantidad || ing.amount || '',
        unidad: ing.unidad || ing.unit || '',
        precio_mercado: ing.precio_mercado || ing.price || 0
      };
    }).filter(ing => ing !== null);

    return JSON.stringify(formatted, null, 2);
  }

  /**
   * Validador: asegura que los ingredientes sean objetos válidos
   * @param {Array} ingredientes - Array a validar
   * @returns {Array} Array con ingredientes válidos
   */
  static validateIngredients(ingredientes) {
    if (!Array.isArray(ingredientes)) {
      return [];
    }

    return ingredientes.filter(ing => {
      return ing && typeof ing === 'object' && ing.nombre;
    });
  }

  /**
   * Serializa ingredientes de forma segura (nunca será [object Object])
   * @param {*} data - Dato a serializar
   * @returns {string} String seguro
   */
  static safeSerialization(data) {
    if (typeof data === 'string') return data;
    if (typeof data === 'number') return String(data);
    if (typeof data === 'boolean') return String(data);
    if (data === null || data === undefined) return '';

    if (Array.isArray(data)) {
      return this.formatIngredientsList(data);
    }

    if (typeof data === 'object') {
      // Si es un ingrediente único
      if (data.nombre) {
        return this.formatIngredient(data);
      }
      // Para otros objetos, usar JSON.stringify
      try {
        return JSON.stringify(data);
      } catch (err) {
        return '[Object]';
      }
    }

    return String(data);
  }
}

module.exports = IngredientesFormatter;
