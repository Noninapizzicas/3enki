/**
 * Render Engine v2.0 — carta-design
 *
 * Motor determinista que genera HTML+CSS completo a partir de:
 *   1. Design Project JSON (decisiones creativas del LLM)
 *   2. Carta JSON (datos reales: productos, precios, ingredientes)
 *
 * Tres fases:
 *   Fase 1: Generar CSS (palette, fonts, layout, decoraciones)
 *   Fase 2: Generar HTML estructura (categorías, productos, marketing)
 *   Fase 3: Ensamblar documento completo
 *
 * Reglas de marketing aplicadas SIEMPRE por código (no por el LLM):
 *   - Ley de Miller: separador visual cada 7 items
 *   - Sin líneas de puntos nombre↔precio
 *   - break-inside: avoid
 *   - print-color-adjust: exact
 *   - Corrección automática de contraste
 *   - Producto más caro primero si no hay orden manual
 */

// =============================================================================
// REGISTROS CSS (extraídos del prompt.json original)
// =============================================================================

const GRADIENTS = {
  dark_rock: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
  warm_amber: 'linear-gradient(180deg, #fef3c7 0%, #fff 30%)',
  spotlight: 'radial-gradient(ellipse at top, rgba(180,83,9,0.15) 0%, transparent 60%)',
  paper_aged: 'linear-gradient(180deg, #f5f0e8 0%, #ebe5d6 100%)',
  midnight: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)'
};

const TEXTURES = {
  diagonal_lines: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
  dot_pattern: 'radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)',
  noise_subtle: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
  linen: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.02) 1px, rgba(0,0,0,0.02) 2px), repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(0,0,0,0.02) 1px, rgba(0,0,0,0.02) 2px)'
};

const DECORATIONS = {
  thin_line: 'border-bottom: 1px solid',
  double_line: 'border-top: 3px double',
  ornament: 'text-align: center; letter-spacing: 0.5em; opacity: 0.3',
  none: ''
};

const MILLER_LIMIT = 7;

// =============================================================================
// CLASE PRINCIPAL
// =============================================================================

class RenderEngine {

  /**
   * Punto de entrada: genera HTML completo
   * @param {Object} project - Design project resuelto (con defaults aplicados)
   * @param {Object} carta - Datos de la carta { meta, categorias, productos }
   * @returns {string} HTML completo (<!DOCTYPE html> ... </html>)
   */
  render(project, carta) {
    const css = this.generateCSS(project);
    const body = this.generateBody(project, carta);
    return this.assembleDocument(project, carta, css, body);
  }

  // ===========================================================================
  // FASE 1: CSS
  // ===========================================================================

  generateCSS(p) {
    const d = p.design;
    const t = p.typography;
    const palette = d.palette;
    const spacing = d.spacing;

    // Fonts
    const fontImports = this.buildFontImports(t.fonts);

    // Background
    const bgCSS = this.buildBackground(d);

    // Layout columns
    const layoutCSS = this.buildLayoutCSS(d);

    // Category header style
    const catStyle = t.category_style;
    const catBg = catStyle.background || 'transparent';
    const catColor = catStyle.text_color || palette.primary;
    const catBorder = catStyle.border_bottom ? `border-bottom: ${catStyle.border_bottom} ${palette.accent};` : '';

    // Ingredient style
    const ingStyle = t.ingredients_style;
    const ingColor = ingStyle.color || palette.muted;

    // Price style
    const priceColor = t.price_style.color || palette.text;

    // Highlight
    const highlightCSS = this.buildHighlightCSS(p);

    // Page border
    const pageBorder = d.border.show
      ? `border: ${d.border.width} ${d.border.style} ${d.border.color}; border-radius: ${d.border.radius};`
      : '';

    return `
${fontImports}

/* ── PRINT MANDATORY ─────────────────────────────────── */
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
  margin: 0; padding: 0; box-sizing: border-box;
}
@page {
  size: ${d.page_size} ${d.orientation};
  margin: ${spacing.page_margin};
}
.producto, .categoria { break-inside: avoid; }
@media print { .no-print { display: none; } }

/* ── BASE ────────────────────────────────────────────── */
html, body {
  font-family: '${t.fonts.body}', 'Inter', sans-serif;
  font-size: ${t.sizes.product_name};
  color: ${palette.text};
  line-height: 1.4;
}
body {
  ${bgCSS}
  ${pageBorder}
  padding: ${spacing.page_margin};
}

/* ── SCREEN PREVIEW ──────────────────────────────────── */
@media screen {
  body {
    max-width: ${d.orientation === 'landscape' ? '297mm' : '210mm'};
    margin: 1rem auto;
    box-shadow: 0 2px 20px rgba(0,0,0,0.3);
    min-height: ${d.orientation === 'landscape' ? '210mm' : '297mm'};
  }
}

/* ── HEADER ──────────────────────────────────────────── */
.carta-header {
  text-align: ${p.header.alignment || 'center'};
  margin-bottom: ${spacing.category_gap};
  padding-bottom: 0.3cm;
}
.carta-title {
  font-family: '${t.fonts.heading}', serif;
  font-size: ${t.sizes.carta_title};
  font-weight: 700;
  color: ${palette.primary};
  margin: 0;
}
.carta-subtitle {
  font-family: '${t.fonts.accent || t.fonts.body}', sans-serif;
  font-size: ${t.sizes.category_name};
  color: ${palette.muted};
  margin-top: 0.15cm;
}

/* ── LAYOUT ──────────────────────────────────────────── */
${layoutCSS}

/* ── CATEGORÍA ───────────────────────────────────────── */
.categoria {
  margin-bottom: ${spacing.category_gap};
}
.categoria-header {
  font-family: '${t.fonts.heading}', serif;
  font-size: ${t.sizes.category_name};
  font-weight: ${catStyle.weight || '700'};
  text-transform: ${catStyle.transform || 'none'};
  letter-spacing: ${catStyle.letter_spacing || '0'};
  color: ${catColor};
  background: ${catBg};
  padding: ${catStyle.padding || '0'};
  ${catBorder}
  margin-bottom: 0.2cm;
}

/* ── PRODUCTO ────────────────────────────────────────── */
.producto {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.3cm;
  padding: ${spacing.product_gap} 0;
}
.producto-info { flex: 1; min-width: 0; }
.producto-nombre {
  font-weight: ${t.product_name_style.weight || '600'};
  text-transform: ${t.product_name_style.transform || 'none'};
}
.producto-ingredientes {
  font-size: ${t.sizes.product_ingredients};
  color: ${ingColor};
  ${ingStyle.italic ? 'font-style: italic;' : ''}
  margin-top: 0.03cm;
  line-height: 1.3;
}
.producto-precio {
  font-family: '${t.fonts.price || t.fonts.heading}', serif;
  font-size: ${t.sizes.price};
  font-weight: ${t.price_style.weight || '700'};
  color: ${priceColor};
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── HIGHLIGHT (productos estrella) ──────────────────── */
${highlightCSS}

/* ── SEPARADORES ─────────────────────────────────────── */
.miller-break {
  height: 0.15cm;
}
.category-ornament {
  text-align: center;
  color: ${palette.muted};
  font-size: 0.6em;
  letter-spacing: 0.3em;
  padding: 0.1cm 0;
  opacity: 0.4;
}

/* ── INGREDIENT PILLS ────────────────────────────────── */
.ing-pill {
  display: inline-block;
  padding: 0.03cm 0.15cm;
  margin: 0.02cm;
  background: ${palette.muted}15;
  border-radius: 0.2cm;
  font-size: ${t.sizes.product_ingredients};
  color: ${ingColor};
}

/* ── CATEGORY DECORATIONS ────────────────────────────── */
${this.buildDecorationCSS(d, palette)}

/* ── FOOTER ──────────────────────────────────────────── */
.carta-footer {
  margin-top: ${spacing.category_gap};
  padding-top: 0.2cm;
  border-top: 1px solid ${palette.muted}40;
  text-align: ${p.footer.alignment || 'center'};
  font-size: ${t.sizes.footer};
  color: ${palette.muted};
}
`;
  }

  // ===========================================================================
  // FASE 2: HTML BODY
  // ===========================================================================

  generateBody(project, carta) {
    const parts = [];

    // Header
    if (project.header.show) {
      const title = esc(project.header.title_override || carta.meta?.nombre || 'Carta');
      parts.push('<div class="carta-header">');
      parts.push(`  <h1 class="carta-title">${title}</h1>`);
      if (project.header.subtitle) {
        parts.push(`  <div class="carta-subtitle">${esc(project.header.subtitle)}</div>`);
      }
      parts.push('</div>');
    }

    // Categorías
    const categorias = this.orderCategories(carta.categorias, project);
    parts.push('<div class="carta-content">');

    const decoStyle = project.design?.decorations?.category_separator;
    const ornamentChar = project.design?.decorations?.ornament_char || '·';

    for (let ci = 0; ci < categorias.length; ci++) {
      const cat = categorias[ci];
      const productos = this.getProductsForCategory(cat.id, carta.productos, project);
      if (productos.length === 0) continue;

      // Ornamento entre categorías (no antes de la primera)
      if (ci > 0 && decoStyle === 'ornament') {
        parts.push(`  <div class="category-ornament">${esc(ornamentChar)} ${esc(ornamentChar)} ${esc(ornamentChar)}</div>`);
      }

      parts.push('  <div class="categoria">');
      parts.push(`    <div class="categoria-header">${esc(cat.nombre)}</div>`);

      for (let i = 0; i < productos.length; i++) {
        // Ley de Miller: separador visual cada MILLER_LIMIT items
        if (i > 0 && i % MILLER_LIMIT === 0) {
          parts.push('    <div class="miller-break"></div>');
        }

        const prod = productos[i];
        const isStar = (project.marketing.star_products || []).includes(prod.id);
        const cls = isStar ? ' star' : '';

        parts.push(`    <div class="producto${cls}">`);
        parts.push('      <div class="producto-info">');
        parts.push(`        <span class="producto-nombre">${esc(prod.nombre)}</span>`);

        // Ingredientes
        if (project.typography.ingredients_style.show && prod.ingredientes?.length) {
          const ings = this.formatIngredients(prod.ingredientes, project);
          parts.push(`        <div class="producto-ingredientes">${ings}</div>`);
        }

        parts.push('      </div>');

        // Precio
        if (typeof prod.precio === 'number' && prod.precio > 0) {
          const price = this.formatPrice(prod.precio, project.marketing.price_display);
          parts.push(`      <span class="producto-precio">${price}</span>`);
        }

        parts.push('    </div>');
      }

      parts.push('  </div>');
    }

    parts.push('</div>');

    // Footer
    if (project.footer.show && project.footer.text) {
      parts.push(`<div class="carta-footer">${esc(project.footer.text)}</div>`);
    }

    return parts.join('\n');
  }

  // ===========================================================================
  // FASE 3: ENSAMBLAR DOCUMENTO
  // ===========================================================================

  assembleDocument(project, carta, css, body) {
    const title = esc(project.header.title_override || carta.meta?.nombre || 'Carta');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${css}
  </style>
</head>
<body>
${body}
</body>
</html>`;
  }

  // ===========================================================================
  // HELPERS: Layout CSS
  // ===========================================================================

  buildLayoutCSS(d) {
    const gap = d.spacing.column_gap;
    switch (d.layout) {
      case 'single_column':
        return `.carta-content { max-width: 18cm; margin: 0 auto; }`;
      case 'two_column':
        return `.carta-content { column-count: 2; column-gap: ${gap}; }
.categoria { break-inside: avoid; }`;
      case 'three_column':
        return `.carta-content { column-count: 3; column-gap: ${gap}; }
.categoria { break-inside: avoid; }`;
      case 'multi_column':
        return `.carta-content { column-count: 4; column-gap: ${gap}; }
.categoria { break-inside: avoid; }`;
      case 'diptico':
        return `.carta-content { display: flex; gap: ${gap}; }
.carta-content > .categoria { flex: 1; }`;
      default:
        return `.carta-content { column-count: 2; column-gap: ${gap}; }
.categoria { break-inside: avoid; }`;
    }
  }

  // ===========================================================================
  // HELPERS: Background CSS
  // ===========================================================================

  buildBackground(d) {
    const bgColor = d.palette.background || '#ffffff';
    const gradient = d.background.gradient && GRADIENTS[d.background.gradient];
    const texture = d.background.texture && TEXTURES[d.background.texture];

    // Combinar gradient + texture en una sola declaración para que no se pisen
    if (gradient && texture) {
      const extra = d.background.texture === 'dot_pattern' ? '\n  background-size: auto, 12px 12px;' : '';
      return `background: ${gradient};\n  background-image: ${texture}, ${gradient};${extra}`;
    }
    if (gradient) {
      return `background: ${gradient};`;
    }
    if (texture) {
      const extra = d.background.texture === 'dot_pattern' ? '\n  background-size: 12px 12px;' : '';
      return `background-color: ${bgColor};\n  background-image: ${texture};${extra}`;
    }
    return `background: ${bgColor};`;
  }

  // ===========================================================================
  // HELPERS: Decoration CSS
  // ===========================================================================

  buildDecorationCSS(d, palette) {
    const deco = d.decorations || {};
    const parts = [];

    // Separador entre categorías
    switch (deco.category_separator) {
      case 'double_line':
        parts.push(`.categoria-header { border-bottom: 3px double ${palette.accent}; padding-bottom: 0.15cm; }`);
        break;
      case 'ornament':
        // Se añade en HTML via .category-ornament
        break;
      case 'none':
        parts.push(`.categoria-header { border-bottom: none; }`);
        break;
      // 'thin_line' is the default, handled by base CSS
    }

    // Separador entre productos
    switch (deco.product_separator) {
      case 'thin_line':
        parts.push(`.producto { border-bottom: 1px solid ${palette.muted}20; }`);
        parts.push(`.producto:last-child { border-bottom: none; }`);
        break;
      case 'dotted':
        parts.push(`.producto { border-bottom: 1px dotted ${palette.muted}30; }`);
        parts.push(`.producto:last-child { border-bottom: none; }`);
        break;
      // 'none' is default
    }

    // Borde de página
    if (deco.page_border) {
      parts.push(`body { border: 1px solid ${palette.accent}; }`);
    }

    return parts.join('\n');
  }

  // ===========================================================================
  // HELPERS: Font imports
  // ===========================================================================

  buildFontImports(fonts) {
    const unique = new Set();
    for (const f of Object.values(fonts)) {
      if (f && typeof f === 'string') unique.add(f);
    }
    if (unique.size === 0) return '';

    const families = Array.from(unique)
      .map(f => `family=${f.replace(/\s+/g, '+')}:wght@400;600;700`)
      .join('&');

    return `@import url('https://fonts.googleapis.com/css2?${families}&display=swap');`;
  }

  // ===========================================================================
  // HELPERS: Highlight CSS
  // ===========================================================================

  buildHighlightCSS(p) {
    const palette = p.design.palette;
    switch (p.marketing.highlight_style) {
      case 'subtle_box':
        return `.producto.star {
  background: ${palette.highlight_bg || 'rgba(0,0,0,0.03)'};
  border-left: 3px solid ${palette.highlight_border || palette.accent};
  padding-left: 0.25cm;
  margin-left: -0.3cm;
  border-radius: 2px;
}`;
      case 'gold_border':
        return `.producto.star {
  border: 1px solid ${palette.accent};
  padding: 0.15cm 0.25cm;
  border-radius: 4px;
  background: ${palette.highlight_bg || 'transparent'};
}`;
      case 'larger_font':
        return `.producto.star .producto-nombre {
  font-size: 1.15em;
  font-weight: 800;
}
.producto.star .producto-precio {
  font-size: 1.1em;
  color: ${palette.accent};
}`;
      case 'icon':
        return `.producto.star .producto-nombre::before {
  content: '⭐ ';
  font-size: 0.8em;
}`;
      case 'none':
        return '';
      default:
        return `.producto.star {
  background: ${palette.highlight_bg || 'rgba(0,0,0,0.03)'};
  padding: 0.1cm 0.2cm;
  border-radius: 2px;
}`;
    }
  }

  // ===========================================================================
  // MARKETING: Orden de categorías
  // ===========================================================================

  orderCategories(categorias, project) {
    if (!categorias) return [];
    return [...categorias].sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }

  // ===========================================================================
  // MARKETING: Productos por categoría con orden inteligente
  // ===========================================================================

  getProductsForCategory(catId, allProducts, project) {
    const mkt = project.marketing;
    let products = (allProducts || []).filter(p => p.categoria === catId);

    // Si hay orden manual para esta categoría, aplicar
    if (mkt.product_order && mkt.product_order[catId]) {
      const order = mkt.product_order[catId];
      products = this.applyManualOrder(products, order);
    } else if (mkt.anchor_strategy === 'most_expensive_first') {
      // Ancla automática: más caro primero, segundo más caro último (primacy/recency)
      products = this.applyPriceAnchor(products);
    }

    return products;
  }

  applyManualOrder(products, order) {
    const ordered = [];
    const remaining = [...products];

    for (const id of order) {
      if (id === '...rest' || id === '...rest_alpha') {
        // Placeholder: insertar resto aquí
        continue;
      }
      const idx = remaining.findIndex(p => p.id === id);
      if (idx >= 0) {
        ordered.push(remaining.splice(idx, 1)[0]);
      }
    }

    // Si queda "rest", insertar al final (o alfabético si ...rest_alpha)
    if (order.includes('...rest_alpha')) {
      remaining.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }

    return [...ordered, ...remaining];
  }

  applyPriceAnchor(products) {
    if (products.length <= 2) return products;

    const sorted = [...products].sort((a, b) => (b.precio || 0) - (a.precio || 0));
    const mostExpensive = sorted[0];
    const secondMost = sorted[1];

    // Quitar ambos de la lista original
    const rest = products.filter(p => p.id !== mostExpensive.id && p.id !== secondMost.id);

    // Más caro primero, segundo más caro último
    return [mostExpensive, ...rest, secondMost];
  }

  // ===========================================================================
  // HELPERS: Formateo de ingredientes
  // ===========================================================================

  formatIngredients(ingredientes, project) {
    const style = project.typography.ingredients_style;
    const showEmoji = style.show_emoji;

    const parts = ingredientes.map(ing => {
      const emoji = showEmoji && ing.emoji ? `${ing.emoji} ` : '';
      return `${emoji}${esc(ing.nombre)}`;
    });

    switch (style.format) {
      case 'inline_comma':
        return parts.join(', ');
      case 'inline_dash':
        return parts.join(' — ');
      case 'pills':
        return parts.map(p => `<span class="ing-pill">${p}</span>`).join(' ');
      case 'hidden':
        return '';
      default:
        return parts.join(', ');
    }
  }

  // ===========================================================================
  // HELPERS: Formateo de precios
  // ===========================================================================

  formatPrice(precio, display) {
    const formatted = precio.toFixed(2).replace('.', ',');
    switch (display) {
      case 'no_symbol':
        return formatted;
      case 'with_symbol':
        return `${formatted} €`;
      case 'symbol_after':
        return `${formatted}€`;
      default:
        return formatted;
    }
  }
}

// ===========================================================================
// UTILIDAD: Escape HTML
// ===========================================================================

function esc(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = RenderEngine;
