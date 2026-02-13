/**
 * Page Context Store — Framework genérico para contexto de página
 *
 * Patrón reutilizable: cada página que quiera chat contextual
 * llama a setPageContext() al montar y clearPageContext() al desmontar.
 * Los paneles/componentes llaman a updatePageState() cuando algo cambia.
 * El chat lee getPageContextSnapshot() al enviar mensajes.
 *
 * Ejemplo:
 *   onMount → setPageContext({ route: '/menu-generator', title: 'Menu Generator', ... })
 *   Panel OCR → updatePageState('ocrText', extractedText)
 *   Panel OCR → updatePageState('ocrBackend', 'google-vision')
 *   Chat send → getPageContextSnapshot() → se inyecta en system prompt
 *   onDestroy → clearPageContext()
 */

import { writable, get } from 'svelte/store';

// ============================================================================
// TYPES
// ============================================================================

export interface PageContext {
  /** Ruta de la página (ej: '/menu-generator', '/comandero') */
  route: string;

  /** Título corto de la página */
  title: string;

  /** Qué hace esta página — el LLM lo lee para entender el contexto */
  description: string;

  /**
   * Instrucciones específicas para el LLM cuando el usuario está en esta página.
   * Ej: "Cuando el usuario dice 'genera con eso', usa el texto OCR del estado."
   */
  instructions?: string;

  /**
   * Estado vivo de la página — los paneles lo actualizan en tiempo real.
   * Claves y valores dependen de cada página.
   * Ej: { ocrText: '...', ocrBackend: 'google-vision', activeCarta: 'carta_xxx' }
   */
  state: Record<string, any>;
}

// ============================================================================
// STORE
// ============================================================================

export const pageContext = writable<PageContext | null>(null);

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Establece el contexto de la página actual.
 * Llamar en onMount() del +page.svelte o componente principal de la página.
 */
export function setPageContext(ctx: PageContext): void {
  pageContext.set(ctx);
}

/**
 * Actualiza un campo del estado de la página.
 * Llamar desde paneles/componentes cuando algo cambia.
 *
 * @example
 * updatePageState('ocrText', extractedText);
 * updatePageState('pipelineStep', 'ocr_done');
 */
export function updatePageState(key: string, value: any): void {
  pageContext.update(ctx => {
    if (!ctx) return ctx;
    return {
      ...ctx,
      state: { ...ctx.state, [key]: value }
    };
  });
}

/**
 * Actualiza múltiples campos del estado de una vez.
 *
 * @example
 * updatePageStateBatch({ ocrText: text, ocrBackend: 'google-vision', pipelineStep: 'ocr_done' });
 */
export function updatePageStateBatch(updates: Record<string, any>): void {
  pageContext.update(ctx => {
    if (!ctx) return ctx;
    return {
      ...ctx,
      state: { ...ctx.state, ...updates }
    };
  });
}

/**
 * Limpia el contexto de la página.
 * Llamar en onDestroy() del +page.svelte.
 */
export function clearPageContext(): void {
  pageContext.set(null);
}

/**
 * Obtiene snapshot del contexto actual (para enviar con mensajes del chat).
 * Retorna null si no hay contexto activo.
 */
export function getPageContextSnapshot(): PageContext | null {
  return get(pageContext);
}
