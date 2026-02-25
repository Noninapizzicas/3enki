/**
 * HTML Preview Store
 *
 * Gestiona el estado del panel de previsualización HTML.
 * Se usa para mostrar HTML generado por el backend (ej: cartas de impresión)
 * sin salir de la app.
 *
 * Estándar reutilizable: cualquier módulo que publique
 * { html, title, filename } en un evento puede abrir este panel.
 */

import { writable } from 'svelte/store';
import { subscribe } from '$lib/ui-core';
import { openPanel } from '$lib/stores/ui';

// =============================================================================
// TYPES
// =============================================================================

export interface HtmlPreviewState {
  html: string;
  title: string;
  filename: string;
}

// =============================================================================
// STORE
// =============================================================================

export const htmlPreviewStore = writable<HtmlPreviewState>({
  html: '',
  title: '',
  filename: 'documento.html'
});

// =============================================================================
// ACCIONES
// =============================================================================

/**
 * Muestra un HTML en el panel de preview y abre el panel.
 */
export function showHtmlPreview(opts: { html: string; title: string; filename?: string }): void {
  htmlPreviewStore.set({
    html: opts.html,
    title: opts.title,
    filename: opts.filename || 'documento.html'
  });
  openPanel('html-preview');
}

// =============================================================================
// SUSCRIPCIONES MQTT
// =============================================================================

// Inicializar suscripciones MQTT para el panel de preview HTML.
// Escucha el evento del event bus: carta.html.generada
// Topic MQTT: core/[asterisk]/events/carta/html/generada
// El payload es un EventEnvelope con campo `data`:
// { carta_id, plantilla_id, project_id, html_path, html, title, filename }
export function initHtmlPreviewSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  // carta.html.generada → core/*/events/carta/html/generada
  unsubs.push(subscribe('core/*/events/carta/html/generada', (_, payload: unknown) => {
    const envelope = payload as { data?: { html?: string; title?: string; filename?: string } };
    const data = envelope?.data || (payload as { html?: string; title?: string; filename?: string });

    if (data?.html) {
      showHtmlPreview({
        html: data.html,
        title: data.title || 'Carta',
        filename: data.filename
      });
    }
  }));

  return () => unsubs.forEach(fn => fn());
}
