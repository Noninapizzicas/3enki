/**
 * Theme Store - Sistema de temas
 *
 * Gestiona:
 * - Tema activo (dark/light/system)
 * - Persistencia del tema
 * - Aplicación automática de CSS variables
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { saveUI, getState, type PersistedState } from './persistence';

// ============================================================================
// TIPOS
// ============================================================================

export type ThemeMode = 'dark' | 'light' | 'system';

export interface ThemeColors {
  // Backgrounds
  bg: string;
  bgSecondary: string;
  surface: string;
  surfaceHover: string;

  // Text
  text: string;
  textMuted: string;
  textInverse: string;

  // Borders
  border: string;
  borderFocus: string;

  // Primary
  primary: string;
  primaryHover: string;
  primaryBg: string;

  // Status
  success: string;
  warning: string;
  error: string;
  info: string;

  // Components
  panelBg: string;
  inputBg: string;
  codeBg: string;
  scrollbar: string;
  scrollbarHover: string;
}

// ============================================================================
// THEME DEFINITIONS
// ============================================================================

const darkTheme: ThemeColors = {
  bg: '#121212',
  bgSecondary: '#1a1a1a',
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceHover: 'rgba(255, 255, 255, 0.1)',

  text: '#e5e5e5',
  textMuted: '#a3a3a3',
  textInverse: '#121212',

  border: 'rgba(255, 255, 255, 0.1)',
  borderFocus: '#3b82f6',

  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryBg: 'rgba(59, 130, 246, 0.2)',

  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#3b82f6',

  panelBg: '#1e1e1e',
  inputBg: 'rgba(0, 0, 0, 0.2)',
  codeBg: '#0d0d0d',
  scrollbar: 'rgba(255, 255, 255, 0.2)',
  scrollbarHover: 'rgba(255, 255, 255, 0.3)'
};

const lightTheme: ThemeColors = {
  bg: '#ffffff',
  bgSecondary: '#f5f5f5',
  surface: 'rgba(0, 0, 0, 0.03)',
  surfaceHover: 'rgba(0, 0, 0, 0.06)',

  text: '#171717',
  textMuted: '#737373',
  textInverse: '#ffffff',

  border: 'rgba(0, 0, 0, 0.1)',
  borderFocus: '#2563eb',

  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryBg: 'rgba(37, 99, 235, 0.1)',

  success: '#16a34a',
  warning: '#ca8a04',
  error: '#dc2626',
  info: '#2563eb',

  panelBg: '#ffffff',
  inputBg: 'rgba(0, 0, 0, 0.05)',
  codeBg: '#f5f5f5',
  scrollbar: 'rgba(0, 0, 0, 0.2)',
  scrollbarHover: 'rgba(0, 0, 0, 0.3)'
};

// ============================================================================
// STORES
// ============================================================================

// Cargar tema desde persistencia o default
function getInitialTheme(): ThemeMode {
  if (!browser) return 'dark';
  const state = getState();
  return state.ui.theme || 'dark';
}

export const themeMode = writable<ThemeMode>(getInitialTheme());

// Tema efectivo (resuelve 'system')
export const effectiveTheme = derived(themeMode, ($mode) => {
  if ($mode === 'system' && browser) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return $mode === 'system' ? 'dark' : $mode;
});

// Colores del tema activo
export const themeColors = derived(effectiveTheme, ($theme) => {
  return $theme === 'dark' ? darkTheme : lightTheme;
});

// ============================================================================
// ACCIONES
// ============================================================================

/**
 * Cambiar tema
 */
export function setTheme(mode: ThemeMode): void {
  themeMode.set(mode);
  saveUI({ theme: mode } as Partial<PersistedState['ui']>);
  applyTheme(mode);
}

/**
 * Alternar entre dark y light
 */
export function toggleTheme(): void {
  const current = get(themeMode);
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

/**
 * Aplicar tema al DOM
 */
export function applyTheme(mode?: ThemeMode): void {
  if (!browser) return;

  const resolvedMode = mode || get(themeMode);
  let theme: 'dark' | 'light';

  if (resolvedMode === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    theme = resolvedMode;
  }

  const colors = theme === 'dark' ? darkTheme : lightTheme;
  const root = document.documentElement;

  // Aplicar CSS custom properties
  root.style.setProperty('--color-bg', colors.bg);
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--color-surface', colors.surface);
  root.style.setProperty('--color-surface-hover', colors.surfaceHover);

  root.style.setProperty('--color-text', colors.text);
  root.style.setProperty('--color-text-muted', colors.textMuted);
  root.style.setProperty('--color-text-inverse', colors.textInverse);

  root.style.setProperty('--color-border', colors.border);
  root.style.setProperty('--color-border-focus', colors.borderFocus);

  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-primary-hover', colors.primaryHover);
  root.style.setProperty('--color-primary-bg', colors.primaryBg);

  root.style.setProperty('--color-success', colors.success);
  root.style.setProperty('--color-warning', colors.warning);
  root.style.setProperty('--color-error', colors.error);
  root.style.setProperty('--color-info', colors.info);

  root.style.setProperty('--color-panel-bg', colors.panelBg);
  root.style.setProperty('--color-input-bg', colors.inputBg);
  root.style.setProperty('--color-code-bg', colors.codeBg);
  root.style.setProperty('--color-scrollbar', colors.scrollbar);
  root.style.setProperty('--color-scrollbar-hover', colors.scrollbarHover);

  // Clase en el body
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(`theme-${theme}`);
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

// Escuchar cambios en preferencia del sistema
if (browser) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (get(themeMode) === 'system') {
      applyTheme('system');
    }
  });

  // Aplicar tema inicial
  applyTheme();
}
