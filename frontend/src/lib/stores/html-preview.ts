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
// HELPERS
// =============================================================================

type HtmlPreviewData = { html?: string; title?: string; filename?: string };

function extractHtmlPreviewData(payload: unknown): HtmlPreviewData {
  const envelope = payload as { data?: HtmlPreviewData };
  return envelope?.data || (payload as HtmlPreviewData);
}

// =============================================================================
// SUSCRIPCIONES MQTT
// =============================================================================

/**
 * Registra un topic MQTT que abre el panel de preview HTML al recibir datos.
 *
 * Cualquier módulo puede llamar esta función en su propio init para asociar
 * su evento MQTT al panel HTML, sin tocar initHtmlPreviewSubscriptions.
 *
 * Ejemplo:
 *   registerHtmlPreviewTopic('core/+/events/reporte/html/generado', { defaultTitle: 'Reporte' })
 */
export function registerHtmlPreviewTopic(
  topic: string,
  opts?: {
    defaultTitle?: string;
    dataExtractor?: (payload: unknown) => HtmlPreviewData;
  }
): () => void {
  return subscribe(topic, (_, payload: unknown) => {
    const data = opts?.dataExtractor
      ? opts.dataExtractor(payload)
      : extractHtmlPreviewData(payload);

    if (data?.html) {
      showHtmlPreview({
        html: data.html,
        title: data.title || opts?.defaultTitle || 'Documento',
        filename: data.filename
      });
    }
  });
}

// Inicializa la suscripción MQTT para carta.html.generada (retrocompatibilidad).
export function initHtmlPreviewSubscriptions(): () => void {
  return registerHtmlPreviewTopic('core/*/events/carta/html/generada', {
    defaultTitle: 'Carta'
  });
}
