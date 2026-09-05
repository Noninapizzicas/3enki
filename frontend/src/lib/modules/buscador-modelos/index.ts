import type { UIModule } from '$lib/ui-core';
import BuscadorPanel from './BuscadorPanel.svelte';

export const buscadorModelosModule: UIModule = {
  manifest: {
    id: 'buscador-modelos',
    name: 'Buscador de Modelos',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'buscador-modelos-btn',
      icon: '🔍',
      label: 'Buscador',
      action: { type: 'panel', panelId: 'buscador-modelos-panel' },
      order: 6
    },
    panels: [{
      id: 'buscador-modelos-panel',
      title: 'Buscador de Modelos 3D',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: BuscadorPanel
};

export default buscadorModelosModule;
