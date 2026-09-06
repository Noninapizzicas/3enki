import type { UIModule } from '$lib/ui-core';
import BuscadorWwwPanel from './BuscadorWwwPanel.svelte';

export const buscador_wwwModule: UIModule = {
  manifest: {
    id: 'buscador_www',
    name: 'BuscadorWww',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'buscador_www-btn',
      icon: '📦',
      label: 'BuscadorWww',
      action: { type: 'panel', panelId: 'buscador_www-panel' },
      order: 50
    },
    panels: [{
      id: 'buscador_www-panel',
      title: 'BuscadorWww',
      size: 'lg'
    }]
  },
  PanelComponent: BuscadorWwwPanel
};

export default buscador_wwwModule;

export { default as BuscadorWwwPanel } from './BuscadorWwwPanel.svelte';
