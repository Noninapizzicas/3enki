/**
 * skin-engine — inyecta PielJSON en las variables CSS de L1/L2/L4/L7.
 *
 * Reflejo puro: recibe datos, produce efectos en el DOM. Sin lógica de negocio.
 * El blueprint genera el PielJSON; este módulo solo lo aplica.
 *
 * Mecanismo: root.style.setProperty — inline gana sobre hojas de estilo,
 * igual que prisma-skin.ts. Al quitar la piel, los defaults del CSS reaparecen.
 */

import { browser } from '$app/environment';
import type { PielCara, PielExpresion, PielJSON } from './piel-json';

type CaraActiva = 'marketing' | 'trabajo';

let _pielActual: PielJSON | null = null;
let _caraActiva: CaraActiva = 'marketing';

// ── Generadores de paleta oklch ──

function generarPaletaColor(
  prefix: string,
  hue: number,
  chroma: number
): Record<string, string> {
  const steps: Array<[string, number, number]> = [
    ['50',  0.970, 0.30],
    ['100', 0.930, 0.55],
    ['200', 0.870, 0.75],
    ['300', 0.780, 0.90],
    ['400', 0.700, 1.00],
    ['500', 0.600, 1.00],
    ['600', 0.500, 0.90],
    ['700', 0.420, 0.78],
    ['800', 0.340, 0.62],
    ['900', 0.270, 0.45],
    ['950', 0.200, 0.28],
  ];

  const vars: Record<string, string> = {};
  for (const [step, lightness, chromaFactor] of steps) {
    vars[`--c-${prefix}-${step}`] = `oklch(${lightness} ${(chroma * chromaFactor).toFixed(3)} ${hue})`;
  }
  return vars;
}

function generarPaletaNeutral(hue: number, chroma: number): Record<string, string> {
  const tint = Math.min(chroma, 0.01);
  const steps: Array<[string, number]> = [
    ['0',   1.000],
    ['50',  0.970],
    ['100', 0.930],
    ['200', 0.870],
    ['300', 0.780],
    ['400', 0.660],
    ['500', 0.550],
    ['600', 0.440],
    ['700', 0.370],
    ['800', 0.280],
    ['850', 0.230],
    ['900', 0.180],
    ['950', 0.130],
    ['980', 0.100],
  ];

  const vars: Record<string, string> = {};
  for (const [step, lightness] of steps) {
    vars[`--c-neutral-${step}`] = `oklch(${lightness.toFixed(3)} ${tint.toFixed(3)} ${hue})`;
  }
  return vars;
}

// ── Radii desde factor ──

function generarRadii(factor: number): Record<string, string> {
  const base = 0.25 * factor;
  return {
    '--radius-sm':   `${(base).toFixed(3)}rem`,
    '--radius-md':   `${(base * 1.5).toFixed(3)}rem`,
    '--radius-lg':   `${(base * 2).toFixed(3)}rem`,
    '--radius-xl':   `${(base * 3).toFixed(3)}rem`,
    '--radius-2xl':  `${(base * 4).toFixed(3)}rem`,
  };
}

// ── Motion desde expresividad ──

function generarMotion(expresividad: number): Record<string, string> {
  const scale = 0.5 + expresividad * 1.5;
  return {
    '--dur-instant': `${Math.round(50 * scale)}ms`,
    '--dur-fast':    `${Math.round(100 * scale)}ms`,
    '--dur-normal':  `${Math.round(200 * scale)}ms`,
    '--dur-slow':    `${Math.round(300 * scale)}ms`,
    '--dur-slower':  `${Math.round(500 * scale)}ms`,
  };
}

// ── Sombras desde difuminado ──

function generarSombras(difuminado: number): Record<string, string> {
  const blur = difuminado;
  const opacity = 0.03 + (1 - difuminado) * 0.07;
  return {
    '--shadow-sm':  `0 1px ${Math.round(3 * (0.5 + blur))}px oklch(0 0 0 / ${(opacity * 1.5).toFixed(2)})`,
    '--shadow-md':  `0 4px ${Math.round(6 * (0.5 + blur))}px oklch(0 0 0 / ${(opacity * 1.2).toFixed(2)})`,
    '--shadow-lg':  `0 10px ${Math.round(15 * (0.5 + blur))}px oklch(0 0 0 / ${opacity.toFixed(2)})`,
    '--shadow-xl':  `0 20px ${Math.round(25 * (0.5 + blur))}px oklch(0 0 0 / ${(opacity * 0.8).toFixed(2)})`,
  };
}

// ── Tipografía (familias + peso + escala modular) ──

function generarTipografia(tipo: {
  display: string;
  body: string;
  mono?: string;
  pesoTitulos?: number;
  escala?: number;
}): Record<string, string> {
  const vars: Record<string, string> = {
    '--font-display': tipo.display,
    '--font-sans':    tipo.body,
    '--font-mono':    tipo.mono ?? "'JetBrains Mono', 'Fira Code', monospace",
  };

  const peso = tipo.pesoTitulos ?? 700;
  vars['--fw-heading'] = String(peso);

  const r = tipo.escala ?? 1.25;
  vars['--fs-xs']   = `${(1 / r / r).toFixed(3)}rem`;
  vars['--fs-sm']   = `${(1 / r).toFixed(3)}rem`;
  vars['--fs-base'] = '1rem';
  vars['--fs-md']   = `${r.toFixed(3)}rem`;
  vars['--fs-lg']   = `${(r * r).toFixed(3)}rem`;
  vars['--fs-xl']   = `${(r * r * r).toFixed(3)}rem`;
  vars['--fs-2xl']  = `${(r ** 4).toFixed(3)}rem`;
  vars['--fs-3xl']  = `${(r ** 5).toFixed(3)}rem`;

  return vars;
}

// ── Espaciado desde densidad ──

function generarEspaciado(factor: number): Record<string, string> {
  return {
    '--space-component-gap': `${(0.5 * factor).toFixed(2)}rem`,
    '--space-section-gap':   `${(2.0 * factor).toFixed(2)}rem`,
    '--space-page-padding':  `${(1.0 * factor).toFixed(2)}rem`,
    '--space-card-padding':  `${(1.0 * factor).toFixed(2)}rem`,
    '--space-hero-y':        `${(6.0 * factor).toFixed(2)}rem`,
  };
}

// ── Superficie (gradiente + glass) ──

function generarSuperficie(
  gradiente: number,
  glass: number,
  primaryHue: number,
  primaryChroma: number
): Record<string, string> {
  const vars: Record<string, string> = {};

  if (gradiente > 0) {
    const c = (primaryChroma * 0.3 * gradiente).toFixed(3);
    vars['--hero-bg'] = `linear-gradient(135deg, oklch(0.97 ${c} ${primaryHue}), oklch(0.93 ${(parseFloat(c) * 0.5).toFixed(3)} ${(primaryHue + 30) % 360}))`;
  } else {
    vars['--hero-bg'] = 'var(--surface-base)';
  }

  if (glass > 0) {
    const blur = Math.round(8 + glass * 16);
    const alpha = (0.6 + (1 - glass) * 0.35).toFixed(2);
    vars['--surface-glass'] = `oklch(0.97 0.002 0 / ${alpha})`;
    vars['--surface-glass-blur'] = `blur(${blur}px)`;
  } else {
    vars['--surface-glass'] = 'var(--surface-raised)';
    vars['--surface-glass-blur'] = 'none';
  }

  return vars;
}

// ── Borde (peso + acento) ──

function generarBorde(
  peso: number,
  acento: 'none' | 'top' | 'left',
  primaryHue: number,
  primaryChroma: number
): Record<string, string> {
  const borderWidth = peso <= 0.3 ? 0 : Math.round(1 + peso * 1.5);
  const shadowOpacity = Math.max(0.01, 0.12 * (1 - peso * 0.4));
  const accentChroma = Math.max(primaryChroma, 0.12);

  return {
    '--border-card-width':   `${borderWidth}px`,
    '--shadow-card':         peso > 1
      ? `0 1px 2px oklch(0 0 0 / ${shadowOpacity.toFixed(2)})`
      : `0 4px ${Math.round(12 + (1 - peso) * 8)}px oklch(0 0 0 / ${shadowOpacity.toFixed(2)})`,
    '--accent-bar-color':    `oklch(0.58 ${accentChroma.toFixed(3)} ${primaryHue})`,
    '--accent-bar-width':    acento === 'none' ? '0px' : acento === 'top' ? '100%' : '6px',
    '--accent-bar-height':   acento === 'none' ? '0px' : acento === 'top' ? '4px' : '100%',
  };
}

// ── Forma (proporción botones + hero align + card hover) ──

function generarForma(
  botonProportion: number,
  heroAlign: 'center' | 'left',
  cardHover: 'lift' | 'glow' | 'border',
  primaryHue: number,
  primaryChroma: number
): Record<string, string> {
  const btnPadH = (0.5 + botonProportion * 0.7).toFixed(2);
  const accentChroma = Math.max(primaryChroma, 0.12);
  const vars: Record<string, string> = {
    '--btn-pad-h-factor':    btnPadH,
    '--hero-text-align':     heroAlign,
    '--hero-align-items':    heroAlign === 'left' ? 'flex-start' : 'center',
  };

  if (cardHover === 'lift') {
    vars['--card-hover-transform'] = 'translateY(-4px)';
    vars['--card-hover-shadow']    = '0 12px 24px oklch(0 0 0 / 0.12)';
    vars['--card-hover-border']    = 'var(--border-subtle)';
  } else if (cardHover === 'glow') {
    vars['--card-hover-transform'] = 'translateY(-2px)';
    vars['--card-hover-shadow']    = `0 0 24px oklch(0.6 ${accentChroma.toFixed(3)} ${primaryHue} / 0.35)`;
    vars['--card-hover-border']    = `oklch(0.7 ${(accentChroma * 0.5).toFixed(3)} ${primaryHue})`;
  } else {
    vars['--card-hover-transform'] = 'none';
    vars['--card-hover-shadow']    = 'var(--shadow-card)';
    vars['--card-hover-border']    = `oklch(0.58 ${accentChroma.toFixed(3)} ${primaryHue})`;
  }

  return vars;
}

// ── Separadores entre secciones ──

function generarSeparadores(
  estilo: 'none' | 'line' | 'gradient' | 'accent',
  primaryHue: number,
  primaryChroma: number
): Record<string, string> {
  const accentChroma = Math.max(primaryChroma, 0.12);
  const vars: Record<string, string> = {
    '--section-divider-display': estilo === 'none' ? 'none' : 'block',
  };

  if (estilo === 'line') {
    vars['--section-divider'] = 'none';
    vars['--section-divider-bg'] = 'var(--border-subtle)';
    vars['--section-divider-height'] = '1px';
  } else if (estilo === 'gradient') {
    vars['--section-divider'] = 'none';
    vars['--section-divider-bg'] = `linear-gradient(90deg, transparent 5%, oklch(0.7 ${accentChroma.toFixed(3)} ${primaryHue}) 50%, transparent 95%)`;
    vars['--section-divider-height'] = '2px';
  } else if (estilo === 'accent') {
    vars['--section-divider'] = 'none';
    vars['--section-divider-bg'] = `oklch(0.58 ${accentChroma.toFixed(3)} ${primaryHue})`;
    vars['--section-divider-height'] = '3px';
  } else {
    vars['--section-divider'] = 'none';
    vars['--section-divider-bg'] = 'transparent';
    vars['--section-divider-height'] = '0px';
  }

  return vars;
}

// ── Expresión — lo que rompe la caja rectangular ──

function generarExpresion(
  exp: PielExpresion,
  primaryHue: number,
  primaryChroma: number,
  accentHue: number
): Record<string, string> {
  const vars: Record<string, string> = {};
  const c = Math.max(primaryChroma, 0.12);

  // Hero title treatment
  if (exp.heroEstilo === 'stroke') {
    vars['--hero-title-color'] = 'transparent';
    vars['--hero-title-stroke'] = `2px oklch(0.3 ${c.toFixed(3)} ${primaryHue})`;
    vars['--hero-title-fill'] = 'transparent';
    vars['--hero-title-bg'] = 'none';
    vars['--hero-title-bg-clip'] = 'unset';
  } else if (exp.heroEstilo === 'shadow-brutal') {
    vars['--hero-title-color'] = `oklch(0.15 ${(c * 0.5).toFixed(3)} ${primaryHue})`;
    vars['--hero-title-stroke'] = 'unset';
    vars['--hero-title-fill'] = 'currentColor';
    vars['--hero-title-shadow'] = `6px 6px 0px oklch(0.6 ${c.toFixed(3)} ${primaryHue}), 12px 12px 0px oklch(0.8 ${(c * 0.5).toFixed(3)} ${accentHue})`;
    vars['--hero-title-bg'] = 'none';
    vars['--hero-title-bg-clip'] = 'unset';
  } else if (exp.heroEstilo === 'gradient-text') {
    vars['--hero-title-color'] = 'transparent';
    vars['--hero-title-stroke'] = 'unset';
    vars['--hero-title-fill'] = 'transparent';
    vars['--hero-title-bg'] = `linear-gradient(135deg, oklch(0.45 ${c.toFixed(3)} ${primaryHue}), oklch(0.55 ${c.toFixed(3)} ${accentHue}), oklch(0.4 ${c.toFixed(3)} ${(primaryHue + 60) % 360}))`;
    vars['--hero-title-bg-clip'] = 'text';
  } else {
    vars['--hero-title-color'] = 'var(--text-primary)';
    vars['--hero-title-stroke'] = 'unset';
    vars['--hero-title-fill'] = 'currentColor';
    vars['--hero-title-bg'] = 'none';
    vars['--hero-title-bg-clip'] = 'unset';
    vars['--hero-title-shadow'] = 'none';
  }

  // Section diagonal clip
  const skew = exp.sectionSkew;
  if (skew > 0) {
    vars['--section-clip-top'] = `polygon(0 ${skew}vw, 100% 0, 100% calc(100% - ${skew}vw), 0 100%)`;
    vars['--section-clip-margin'] = `-${skew * 0.6}vw`;
    vars['--section-clip-padding-extra'] = `${skew * 1.2}vw`;
  } else {
    vars['--section-clip-top'] = 'none';
    vars['--section-clip-margin'] = '0';
    vars['--section-clip-padding-extra'] = '0';
  }

  // Background textures
  if (exp.textura === 'stripes') {
    vars['--section-texture'] = `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 10px,
      oklch(0.5 ${(c * 0.3).toFixed(3)} ${primaryHue} / ${exp.texturaOpacidad.toFixed(2)}) 10px,
      oklch(0.5 ${(c * 0.3).toFixed(3)} ${primaryHue} / ${exp.texturaOpacidad.toFixed(2)}) 11px
    )`;
  } else if (exp.textura === 'dots') {
    vars['--section-texture'] = `radial-gradient(
      circle 1.5px at 10px 10px,
      oklch(0.5 ${(c * 0.4).toFixed(3)} ${primaryHue} / ${exp.texturaOpacidad.toFixed(2)}) 1.5px,
      transparent 1.5px
    )`;
    vars['--section-texture-size'] = '20px 20px';
  } else if (exp.textura === 'diagonal') {
    vars['--section-texture'] = `repeating-linear-gradient(
      45deg,
      oklch(0.6 ${(c * 0.2).toFixed(3)} ${primaryHue} / ${(exp.texturaOpacidad * 0.5).toFixed(2)}) 0px,
      transparent 1px,
      transparent 20px
    )`;
  } else if (exp.textura === 'noise') {
    vars['--section-texture'] = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${exp.texturaOpacidad.toFixed(2)}'/%3E%3C/svg%3E")`;
    vars['--section-texture-size'] = '200px 200px';
  } else {
    vars['--section-texture'] = 'none';
  }

  // Hero scale — oversized text
  vars['--hero-title-scale'] = exp.escalaHero.toFixed(2);

  // Card rotation
  if (exp.cardRotacion !== 0) {
    const r = exp.cardRotacion;
    vars['--card-rotate-1'] = `${(-r).toFixed(1)}deg`;
    vars['--card-rotate-2'] = `${(r * 0.6).toFixed(1)}deg`;
    vars['--card-rotate-3'] = `${(r * 1.2).toFixed(1)}deg`;
  } else {
    vars['--card-rotate-1'] = '0deg';
    vars['--card-rotate-2'] = '0deg';
    vars['--card-rotate-3'] = '0deg';
  }

  // Nav invertida
  if (exp.navInvertida) {
    vars['--nav-bg'] = `oklch(0.25 ${(c * 0.8).toFixed(3)} ${primaryHue})`;
    vars['--nav-text'] = `oklch(0.92 ${(c * 0.1).toFixed(3)} ${primaryHue})`;
    vars['--nav-border'] = `oklch(0.35 ${(c * 0.6).toFixed(3)} ${primaryHue})`;
  } else {
    vars['--nav-bg'] = 'var(--surface-glass, var(--surface-raised))';
    vars['--nav-text'] = 'var(--text-primary)';
    vars['--nav-border'] = 'var(--border-subtle)';
  }

  // Hero text shadow dramática
  if (exp.heroSombraTexto) {
    vars['--hero-title-shadow'] = vars['--hero-title-shadow'] ||
      `0 4px 30px oklch(0.4 ${c.toFixed(3)} ${primaryHue} / 0.5)`;
  }

  return vars;
}

// ── Ensamblar todas las variables de una cara ──

function caraAVariables(cara: PielCara): Record<string, string> {
  return {
    ...generarPaletaColor('primary', cara.color.primary.hue, cara.color.primary.chroma),
    ...generarPaletaColor('accent', cara.color.accent.hue, cara.color.accent.chroma),
    ...generarPaletaNeutral(cara.color.neutral.hue, cara.color.neutral.chroma),
    ...generarTipografia(cara.tipografia),
    ...generarRadii(cara.radii.factor),
    ...generarMotion(cara.motion.expresividad),
    ...generarSombras(cara.sombras.difuminado),
    ...generarEspaciado(cara.espaciado.factor),
    ...generarSuperficie(
      cara.superficie.gradiente,
      cara.superficie.glass,
      cara.color.primary.hue,
      cara.color.primary.chroma
    ),
    ...generarBorde(
      cara.borde.peso,
      cara.borde.acento,
      cara.color.primary.hue,
      cara.color.primary.chroma
    ),
    ...generarForma(
      cara.forma.botonProportion,
      cara.forma.heroAlign,
      cara.forma.cardHover,
      cara.color.primary.hue,
      cara.color.primary.chroma
    ),
    ...generarSeparadores(
      cara.separadores.estilo,
      cara.color.primary.hue,
      cara.color.primary.chroma
    ),
    ...(cara.expresion ? generarExpresion(
      cara.expresion,
      cara.color.primary.hue,
      cara.color.primary.chroma,
      cara.color.accent.hue
    ) : {}),
  };
}

// ── Variables que el engine inyectó (para poder limpiar) ──

let _varsInyectadas: string[] = [];

function inyectarVariables(vars: Record<string, string>): void {
  if (!browser) return;
  const root = document.documentElement;
  const keys = Object.keys(vars);
  for (const key of keys) {
    root.style.setProperty(key, vars[key]);
  }
  _varsInyectadas = keys;
}

function limpiarVariables(): void {
  if (!browser) return;
  const root = document.documentElement;
  for (const key of _varsInyectadas) {
    root.style.removeProperty(key);
  }
  _varsInyectadas = [];
}

// ── API pública ──

/** Aplica un PielJSON completo. Usa la cara según la ruta activa. */
export function aplicarPiel(piel: PielJSON, cara?: CaraActiva): void {
  _pielActual = piel;
  if (cara) _caraActiva = cara;
  const datos = _caraActiva === 'trabajo' ? piel.trabajo : piel.marketing;
  const vars = caraAVariables(datos);
  inyectarVariables(vars);
  if (browser) {
    document.documentElement.setAttribute('data-piel', piel.project_id);
    document.documentElement.setAttribute('data-cara', _caraActiva);
    document.documentElement.setAttribute('data-variant', _caraActiva === 'marketing' ? 'light' : 'dark');
  }
}

/** Cambia la cara activa (marketing ↔ trabajo) sin recargar el PielJSON. */
export function cambiarCara(cara: CaraActiva): void {
  if (!_pielActual) return;
  aplicarPiel(_pielActual, cara);
}

/** Quita la piel: las variables CSS vuelven a los defaults de las hojas de estilo. */
export function quitarPiel(): void {
  limpiarVariables();
  _pielActual = null;
  if (browser) {
    document.documentElement.removeAttribute('data-piel');
    document.documentElement.removeAttribute('data-cara');
    document.documentElement.removeAttribute('data-variant');
  }
}

/** Devuelve la piel aplicada, o null. */
export function pielActual(): PielJSON | null {
  return _pielActual;
}

/** Devuelve qué cara está activa. */
export function caraActiva(): CaraActiva {
  return _caraActiva;
}
