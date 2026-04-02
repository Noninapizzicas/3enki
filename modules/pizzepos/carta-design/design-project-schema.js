/**
 * Design Project Schema v2.0
 *
 * Define la estructura del JSON de decisiones creativas que el LLM genera.
 * Incluye defaults sensatos para que el LLM solo necesite especificar
 * lo que quiere cambiar — el resto se rellena automáticamente.
 *
 * Tres "personajes" aportan decisiones:
 *   - Marketing: qué destacar, dónde, cómo ordenar
 *   - Diseñador gráfico: paleta, layout, decoraciones
 *   - Tipógrafo: fonts, tamaños, jerarquía
 */

// =============================================================================
// DEFAULTS — cada campo tiene un valor sensato
// =============================================================================

const DEFAULTS = {
  version: '2.0',

  // ── Marketing ──────────────────────────────────────────────────────────────
  marketing: {
    star_products: [],                    // IDs de productos estrella (max 2-3 por categoría)
    anchor_strategy: 'most_expensive_first', // 'most_expensive_first' | 'manual' | 'none'
    anchor_products: {},                  // { categoria_id: producto_id } — solo si strategy='manual'
    highlight_style: 'subtle_box',        // 'subtle_box' | 'gold_border' | 'larger_font' | 'icon' | 'none'
    price_display: 'no_symbol',           // 'no_symbol' (11,50) | 'with_symbol' (11,50 €) | 'symbol_after' (11,50€)
    product_order: {},                    // { categoria_id: [producto_ids...] } — null = orden por defecto
    golden_triangle: null,                // { top_right, center, bottom_left } — null = auto
    subcategory_splits: {}                // { categoria_id: [{ label, product_ids }] }
  },

  // ── Diseño visual ─────────────────────────────────────────────────────────
  design: {
    orientation: 'portrait',              // 'portrait' | 'landscape'
    page_size: 'A4',                      // 'A4' | 'A5' | 'A3'
    layout: 'two_column',                 // 'single_column' | 'two_column' | 'three_column' | 'multi_column' | 'diptico'

    palette: {
      background: '#ffffff',
      text: '#1a1a1a',
      primary: '#1a1a1a',
      secondary: '#b45309',
      accent: '#b45309',
      muted: '#888888',
      highlight_bg: 'rgba(180, 83, 9, 0.06)',
      highlight_border: '#b45309'
    },

    background: {
      type: 'solid',                      // 'solid' | 'gradient' | 'texture'
      gradient: null,                     // nombre: 'dark_rock' | 'warm_amber' | 'paper_aged' | 'midnight' | null
      texture: null                       // nombre: 'diagonal_lines' | 'dot_pattern' | 'noise_subtle' | 'linen' | null
    },

    spacing: {
      page_margin: '1.5cm',
      category_gap: '0.8cm',
      product_gap: '0.15cm',
      column_gap: '0.8cm'
    },

    border: {
      show: false,
      style: 'solid',
      width: '1px',
      color: '#1a1a1a',
      radius: '0'
    },

    decorations: {
      category_separator: 'thin_line',    // 'thin_line' | 'double_line' | 'ornament' | 'none'
      product_separator: 'none',          // 'thin_line' | 'dotted' | 'none'
      ornament_char: '·',                 // carácter decorativo entre categorías
      page_border: false
    }
  },

  // ── Tipografía ────────────────────────────────────────────────────────────
  typography: {
    fonts: {
      heading: 'Playfair Display',
      body: 'Inter',
      accent: null,                       // opcional, para detalles decorativos
      price: null                         // null = hereda de heading
    },

    sizes: {
      carta_title: '24pt',
      category_name: '13pt',
      product_name: '9.5pt',
      product_ingredients: '7.5pt',
      price: '10pt',
      footer: '7pt'
    },

    category_style: {
      transform: 'uppercase',
      letter_spacing: '0.05em',
      weight: '700',
      background: null,                   // null = sin fondo, o color CSS
      text_color: null,                   // null = hereda de palette.primary
      padding: '0.2cm 0',
      border_bottom: '1px solid'          // borde inferior, null = sin borde
    },

    product_name_style: {
      weight: '600',
      transform: 'none'
    },

    ingredients_style: {
      show: true,
      format: 'inline_comma',             // 'inline_comma' | 'inline_dash' | 'pills' | 'hidden'
      show_emoji: false,
      italic: true,
      color: null                         // null = hereda de palette.muted
    },

    price_style: {
      weight: '700',
      color: null,                        // null = hereda de palette.text
      alignment: 'right'
    }
  },

  // ── Header / Footer ───────────────────────────────────────────────────────
  header: {
    show: true,
    title_override: null,                 // null = usa carta.meta.nombre
    subtitle: null,
    show_date: false,
    alignment: 'center'
  },

  footer: {
    show: true,
    text: 'Todos nuestros productos pueden contener alérgenos. Consulte con el personal.',
    alignment: 'center'
  }
};

// =============================================================================
// REGISTROS DE VALORES VÁLIDOS
// =============================================================================

const VALID_LAYOUTS = ['single_column', 'two_column', 'three_column', 'multi_column', 'diptico'];
const VALID_ORIENTATIONS = ['portrait', 'landscape'];
const VALID_PAGE_SIZES = ['A3', 'A4', 'A5'];
const VALID_PRICE_DISPLAYS = ['no_symbol', 'with_symbol', 'symbol_after'];
const VALID_HIGHLIGHT_STYLES = ['subtle_box', 'gold_border', 'larger_font', 'icon', 'none'];
const VALID_ANCHOR_STRATEGIES = ['most_expensive_first', 'manual', 'none'];
const VALID_INGREDIENT_FORMATS = ['inline_comma', 'inline_dash', 'pills', 'hidden'];
const VALID_SEPARATORS = ['thin_line', 'double_line', 'ornament', 'dotted', 'none'];
const VALID_BG_TYPES = ['solid', 'gradient', 'texture'];

// =============================================================================
// DEEP MERGE — combina defaults con overrides del LLM
// =============================================================================

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === null || source[key] === undefined) {
      result[key] = source[key];
    } else if (typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// =============================================================================
// RESOLVE — aplica profile_base + overrides del LLM sobre los defaults
// =============================================================================

/**
 * Resuelve un design project: defaults ← profile ← overrides del LLM
 *
 * @param {Object} project - JSON de decisiones del LLM (parcial o completo)
 * @param {Map|Object} profiles - perfiles built-in disponibles
 * @returns {{ resolved: Object, warnings: string[] }}
 */
function resolveProject(project, profiles = new Map()) {
  const warnings = [];

  // 1. Empezar con defaults
  let resolved = JSON.parse(JSON.stringify(DEFAULTS));

  // 2. Si hay profile_base, aplicar sus valores encima
  if (project.profile_base) {
    const profile = profiles instanceof Map
      ? profiles.get(project.profile_base)
      : profiles[project.profile_base];

    if (profile) {
      resolved = applyProfileToDefaults(resolved, profile);
    } else {
      warnings.push(`Perfil "${project.profile_base}" no encontrado, usando defaults`);
    }
  }

  // 3. Aplicar overrides del LLM encima de todo
  resolved = deepMerge(resolved, project);

  // 4. Validar
  const errors = validate(resolved);
  if (errors.length > 0) {
    warnings.push(...errors.map(e => `Validación: ${e}`));
  }

  // 5. Limpiar campos meta que no son del render
  resolved.version = '2.0';

  return { resolved, warnings };
}

/**
 * Traduce un perfil de diseño (formato existente) al formato design project
 */
function applyProfileToDefaults(defaults, profile) {
  const overrides = {};

  // Paleta
  if (profile.color_palette) {
    overrides.design = overrides.design || {};
    overrides.design.palette = {};
    if (profile.color_palette.primary) overrides.design.palette.primary = profile.color_palette.primary;
    if (profile.color_palette.secondary) overrides.design.palette.secondary = profile.color_palette.secondary;
    if (profile.color_palette.background) overrides.design.palette.background = profile.color_palette.background;
    if (profile.color_palette.text) overrides.design.palette.text = profile.color_palette.text;
    if (profile.color_palette.accent) overrides.design.palette.accent = profile.color_palette.accent;
    if (profile.color_palette.muted) overrides.design.palette.muted = profile.color_palette.muted;
  }

  // Fonts
  if (profile.fonts) {
    overrides.typography = overrides.typography || {};
    overrides.typography.fonts = {};
    if (profile.fonts.heading) overrides.typography.fonts.heading = profile.fonts.heading;
    if (profile.fonts.body) overrides.typography.fonts.body = profile.fonts.body;
    if (profile.fonts.accent) overrides.typography.fonts.accent = profile.fonts.accent;
  }

  // Layout
  if (profile.layout_type) {
    overrides.design = overrides.design || {};
    overrides.design.layout = profile.layout_type;
  }

  return deepMerge(defaults, overrides);
}

// =============================================================================
// VALIDACIÓN
// =============================================================================

function validate(project) {
  const errors = [];

  // Layout
  if (project.design?.layout && !VALID_LAYOUTS.includes(project.design.layout)) {
    errors.push(`layout "${project.design.layout}" no válido. Opciones: ${VALID_LAYOUTS.join(', ')}`);
  }

  // Orientation
  if (project.design?.orientation && !VALID_ORIENTATIONS.includes(project.design.orientation)) {
    errors.push(`orientation "${project.design.orientation}" no válida`);
  }

  // Page size
  if (project.design?.page_size && !VALID_PAGE_SIZES.includes(project.design.page_size)) {
    errors.push(`page_size "${project.design.page_size}" no válido`);
  }

  // Price display
  if (project.marketing?.price_display && !VALID_PRICE_DISPLAYS.includes(project.marketing.price_display)) {
    errors.push(`price_display "${project.marketing.price_display}" no válido`);
  }

  // Highlight
  if (project.marketing?.highlight_style && !VALID_HIGHLIGHT_STYLES.includes(project.marketing.highlight_style)) {
    errors.push(`highlight_style "${project.marketing.highlight_style}" no válido`);
  }

  return errors;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  DEFAULTS,
  resolveProject,
  deepMerge,
  validate,
  applyProfileToDefaults,
  VALID_LAYOUTS,
  VALID_ORIENTATIONS,
  VALID_PAGE_SIZES,
  VALID_PRICE_DISPLAYS,
  VALID_HIGHLIGHT_STYLES,
  VALID_ANCHOR_STRATEGIES,
  VALID_INGREDIENT_FORMATS,
  VALID_SEPARATORS,
  VALID_BG_TYPES
};
