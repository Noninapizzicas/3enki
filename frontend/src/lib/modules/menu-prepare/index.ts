import type { UIModule } from '$lib/ui-core';
import PreparePanel from './PreparePanel.svelte';

export const menuPrepareModule: UIModule = {
  manifest: {
    id: 'menu-prepare',
    name: 'Preparar Imagen',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'menu-prepare-btn',
      icon: '🖼️',
      label: 'Preparar',
      action: { type: 'panel', panelId: 'menu-prepare-panel' },
      order: 2
    },
    panels: [{
      id: 'menu-prepare-panel',
      title: 'Preparar Imagen para OCR',
      size: 'sm'
    }]
  },
  PanelComponent: PreparePanel
};

export default menuPrepareModule;
