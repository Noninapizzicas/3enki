/**
 * prisma-skin — la PIEL de un proyecto prisma: otra paleta de colores para el chat,
 * distinta de pizzepos, para SABER de un vistazo en qué tipo de proyecto estás.
 *
 * Por qué NO es el modo claro: la app no es theme-complete (muchos componentes llevan
 * colores oscuros clavados), así que forzar CLARO dejaba el texto invisible. Esta piel se
 * queda en la FAMILIA OSCURA —donde los clavados siguen siendo legibles— pero cambia el
 * HUE (fondo verde-petróleo + acento teal) para diferenciarse del azul-neutro de pizzepos.
 *
 * Aplica por el MISMO mecanismo que theme.ts (root.style.setProperty → inline, gana sobre
 * hojas de estilo), así que prevalece mientras está puesta. Al salir del proyecto se restaura
 * la preferencia del usuario con applyTheme(). Además marca data-ui="prisma" en el root como
 * gancho para cualquier ajuste CSS puntual.
 */

import { browser } from '$app/environment';
import { applyTheme } from './theme';

// Paleta prisma (oscura, verde-petróleo/teal) — legible, distinta de pizzepos.
const PRISMA_SKIN: Record<string, string> = {
  '--color-bg': '#0d1512',
  '--color-bg-secondary': '#111e1a',
  '--color-surface': 'rgba(255, 255, 255, 0.05)',
  '--color-surface-hover': 'rgba(255, 255, 255, 0.10)',
  '--color-text': '#eaf2ef',
  '--color-text-muted': '#94aaa3',
  '--color-text-inverse': '#0d1512',
  '--color-border': 'rgba(255, 255, 255, 0.09)',
  '--color-border-focus': '#2dd4bf',
  '--color-primary': '#14b8a6',
  '--color-primary-hover': '#0d9488',
  '--color-primary-bg': 'rgba(20, 184, 166, 0.18)',
  '--color-success': '#34d399',
  '--color-warning': '#fbbf24',
  '--color-error': '#f87171',
  '--color-info': '#2dd4bf',
  '--color-panel-bg': '#0f1a17',
  '--color-input-bg': '#12201c',
  '--color-code-bg': '#0b1310',
  '--color-scrollbar': 'rgba(255, 255, 255, 0.12)',
  '--color-scrollbar-hover': 'rgba(255, 255, 255, 0.22)'
};

/** Aplica la piel prisma (idempotente). */
export function applyPrismaSkin(): void {
  if (!browser) return;
  const root = document.documentElement;
  root.setAttribute('data-ui', 'prisma');
  for (const [k, v] of Object.entries(PRISMA_SKIN)) root.style.setProperty(k, v);
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add('theme-prisma');
}

/** Quita la piel prisma y restaura la preferencia de tema del usuario. */
export function clearPrismaSkin(): void {
  if (!browser) return;
  const root = document.documentElement;
  if (root.getAttribute('data-ui') !== 'prisma') return;
  root.removeAttribute('data-ui');
  document.body.classList.remove('theme-prisma');
  applyTheme(); // re-aplica el tema del usuario (dark/light/system) sobre las mismas vars
}
