/**
 * PDF Module - Visor de PDFs
 *
 * Zona: chat-tools
 * Panel: pdf-viewer
 *
 * Features:
 * - Cargar y visualizar PDFs
 * - Adjuntar PDF al chat
 * - Extraer texto (futuro)
 */

import type { UIModule, AppState } from '$lib/ui-core';
import PdfPanel from './PdfPanel.svelte';

export const pdfModule: UIModule = {
  manifest: {
    id: 'pdf',
    name: 'PDF',
    version: '1.0.0',
    zone: 'chat-tools',
    button: {
      id: 'pdf-btn',
      icon: '📕',
      dynamicIcon: false,
      label: 'Visor PDF',
      action: { type: 'panel', panelId: 'pdf-viewer' },
      order: 3
    },
    panels: [
      {
        id: 'pdf-viewer',
        title: 'Visor de PDF',
        size: 'lg',
        position: 'bottom'
      }
    ],
    mqtt: {
      publishes: ['pdf/load', 'pdf/attach'],
      subscribes: ['pdf/loaded', 'pdf/text']
    }
  },

  PanelComponent: PdfPanel
};

export default pdfModule;
