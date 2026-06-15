/**
 * Módulo Contenido — gestión de imágenes por producto (pieza 4 del subsistema digital).
 * Panel en la work-bar de carta-digital: sube/quita imágenes que la carta pública muestra.
 */

import type { UIModule } from '$lib/ui-core';
import ContenidoPanel from './ContenidoPanel.svelte';

export const contenidoModule: UIModule = {
  manifest: {
    id: 'contenido',
    name: 'Imágenes',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'contenido-btn',
      icon: '🖼️',
      label: 'Imágenes',
      action: { type: 'panel', panelId: 'contenido-panel' },
      order: 7
    },
    panels: [{
      id: 'contenido-panel',
      title: 'Imágenes de productos',
      size: 'lg'
    }]
  },
  PanelComponent: ContenidoPanel
};

export default contenidoModule;

export { default as ContenidoPanel } from './ContenidoPanel.svelte';
