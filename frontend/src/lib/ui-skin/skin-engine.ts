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
import type { PielCara, PielJSON } from './piel-json';

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

// ── Tipografía ──

function generarTipografia(tipo: { display: string; body: string; mono?: string }): Record<string, string> {
  return {
    '--font-display': tipo.display,
    '--font-sans':    tipo.body,
    '--font-mono':    tipo.mono ?? "'JetBrains Mono', 'Fira Code', monospace",
  };
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
