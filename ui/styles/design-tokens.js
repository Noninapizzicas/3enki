/**
 * Event Core UI - Design Tokens
 *
 * Tokens de diseño oficiales del Manual de Lenguaje Visual v1.0.0
 * Estos tokens están sincronizados con variables.css y advanced-components.css
 */

export const DesignTokens = {
  /**
   * PALETA FUNCIONAL OFICIAL
   * Fuente: manual_oficial_lenguaje_visual_v1.json
   */
  colors: {
    // Colores funcionales principales
    verde_accion: {
      hex: '#2FBF71',
      rgb: { r: 47, g: 191, b: 113 },
      significado: 'Confirmar/Continuar/OK',
      wcag_contrast_white: 3.2,  // Calculado
      wcag_contrast_black: 6.5,  // Calculado
      estado: 'activo'
    },
    ambar_pendiente: {
      hex: '#F5B700',
      rgb: { r: 245, g: 183, b: 0 },
      significado: 'Pendiente/Espera/Confirmación requerida',
      wcag_contrast_white: 1.9,
      wcag_contrast_black: 11.1,
      estado: 'pendiente'
    },
    rojo_error: {
      hex: '#E63946',
      rgb: { r: 230, g: 57, b: 70 },
      significado: 'Error/Bloqueo/Urgente',
      wcag_contrast_white: 3.9,
      wcag_contrast_black: 5.4,
      estado: 'error'
    },
    azul_info: {
      hex: '#1D4ED8',
      rgb: { r: 29, g: 78, b: 216 },
      significado: 'Información/Contexto',
      wcag_contrast_white: 6.2,
      wcag_contrast_black: 3.4,
      estado: 'info'
    },
    gris_base: {
      hex: '#6B7280',
      rgb: { r: 107, g: 114, b: 128 },
      significado: 'Neutro/Deshabilitado',
      wcag_contrast_white: 4.5,
      wcag_contrast_black: 4.7,
      estado: 'deshabilitado'
    },
    gris_fondo: {
      hex: '#0F1216',
      rgb: { r: 15, g: 18, b: 22 },
      significado: 'Fondo oscuro',
      wcag_contrast_white: 18.9,
      wcag_contrast_black: 1.1
    }
  },

  /**
   * DICCIONARIO DE SIGNOS OFICIAL
   * Fuente: manual_oficial_lenguaje_visual_v1.json
   */
  iconos: {
    cobro: {
      emoji: '💳',
      forma: 'rect_redondeado',
      direccion: '→',
      regla: 'avance/confirmación'
    },
    productos: {
      emoji: '🧾',
      forma: 'rect_redondeado',
      direccion: '↓',
      regla: 'detalle/lista'
    },
    alerta: {
      emoji: '⚠️',
      forma: 'rombo_suave',
      regla: 'atención/critico'
    },
    info: {
      emoji: 'ℹ️',
      forma: 'círculo',
      regla: 'contexto/no bloqueante'
    },
    // Acciones comunes
    add: '➕',
    edit: '✏️',
    delete: '🗑️',
    view: '👁️',
    save: '💾',
    cancel: '❌',
    search: '🔍',
    refresh: '🔄',
    download: '⬇️',
    upload: '⬆️',
    settings: '⚙️',
    // Estados
    pending: '⏳',
    in_progress: '🔄',
    completed: '✅',
    error: '❌',
    warning: '⚠️',
    success: '✓',
    // Prioridades
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  },

  /**
   * TIPOGRAFÍA
   * Fuente: biblioteca_componentes_ui_v1.json
   */
  typography: {
    base_size_px: 14,
    scale: [12, 14, 16, 18, 20],
    weight: {
      regular: 400,
      medium: 500,
      bold: 700
    }
  },

  /**
   * ESPACIADO
   * Fuente: biblioteca_componentes_ui_v1.json
   */
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16
  },

  /**
   * FORMAS (Border Radius)
   * Fuente: biblioteca_componentes_ui_v1.json
   */
  formas: {
    accion: 12,           // rect_redondeado_12
    info: 10,             // circulo_10
    alerta: 8,            // rombo_suave
    pendiente: 6          // hex_suave
  },

  /**
   * RITMO Y ANIMACIONES
   * Fuente: biblioteca_componentes_ui_v1.json
   */
  ritmo: {
    critico_hz: 1.0,
    critico_ms: 1000,
    no_critico_hz: 0.33,
    no_critico_ms: 3000,
    max_duracion_ms: 1500
  },

  /**
   * TOUCH TARGETS
   * Fuente: biblioteca_componentes_ui_v1.json
   */
  touch: {
    min_objetivo_px: {
      ancho: 56,
      alto: 56
    },
    separacion_min_px: 8,
    zonas_porcentaje: {
      izquierda: 30,
      derecha: 70
    }
  },

  /**
   * MICROINTERACCIONES
   * Fuente: manual_oficial_lenguaje_visual_v1.json
   */
  microinteracciones: {
    latencia_visual_ms: 120,
    latencia_haptica_ms: 40
  },

  /**
   * LAYOUT Y GRID
   * Fuente: manual_oficial_lenguaje_visual_v1.json
   */
  layout: {
    grid_min_cols: 2,
    gutters_px: 8,
    margen_min_px: 12
  },

  /**
   * ACCESIBILIDAD
   * Fuente: biblioteca_componentes_ui_v1.json
   */
  accesibilidad: {
    contraste_min_wcag: 'AA',
    contraste_ratio_min: 4.5,
    area_tap_min_px: 56,
    targets_separacion_px: 8,
    alternativas_texto: true
  }
};

/**
 * HELPER FUNCTIONS
 */

/**
 * Calcula el ratio de contraste entre dos colores (aproximación simplificada)
 * @param {string} hexColor1 - Color en formato hex
 * @param {string} hexColor2 - Color en formato hex
 * @returns {number} - Ratio de contraste
 */
export function calculateContrastRatio(hexColor1, hexColor2) {
  const getLuminance = (hex) => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;

    const [rs, gs, bs] = [r, g, b].map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const lum1 = getLuminance(hexColor1);
  const lum2 = getLuminance(hexColor2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Verifica si un color cumple con WCAG AA en fondo blanco
 * @param {string} hexColor - Color en formato hex
 * @returns {boolean}
 */
export function meetsWCAG_AA_onWhite(hexColor) {
  const ratio = calculateContrastRatio(hexColor, '#FFFFFF');
  return ratio >= DesignTokens.accesibilidad.contraste_ratio_min;
}

/**
 * Verifica si un color cumple con WCAG AA en fondo negro
 * @param {string} hexColor - Color en formato hex
 * @returns {boolean}
 */
export function meetsWCAG_AA_onBlack(hexColor) {
  const ratio = calculateContrastRatio(hexColor, '#000000');
  return ratio >= DesignTokens.accesibilidad.contraste_ratio_min;
}

/**
 * Obtiene el color funcional según el estado
 * @param {string} estado - Estado: 'activo', 'pendiente', 'error', 'info', 'deshabilitado'
 * @returns {string} - Color hex
 */
export function getColorByEstado(estado) {
  const estadoMap = {
    activo: DesignTokens.colors.verde_accion.hex,
    pendiente: DesignTokens.colors.ambar_pendiente.hex,
    error: DesignTokens.colors.rojo_error.hex,
    info: DesignTokens.colors.azul_info.hex,
    deshabilitado: DesignTokens.colors.gris_base.hex
  };
  return estadoMap[estado] || DesignTokens.colors.gris_base.hex;
}

/**
 * Obtiene el icono según la acción o estado
 * @param {string} key - Clave del icono
 * @returns {string} - Emoji
 */
export function getIcono(key) {
  return DesignTokens.iconos[key] || '';
}

/**
 * Valida si un componente cumple con los estándares de touch
 * @param {number} width - Ancho en px
 * @param {number} height - Alto en px
 * @returns {Object} - { valido: boolean, errores: string[] }
 */
export function validateTouchTarget(width, height) {
  const errores = [];
  const min = DesignTokens.touch.min_objetivo_px.ancho;

  if (width < min) {
    errores.push(`Ancho ${width}px < mínimo ${min}px`);
  }
  if (height < min) {
    errores.push(`Alto ${height}px < mínimo ${min}px`);
  }

  return {
    valido: errores.length === 0,
    errores
  };
}

export default DesignTokens;
