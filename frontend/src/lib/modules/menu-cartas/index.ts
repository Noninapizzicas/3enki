import type { UIModule } from '$lib/ui-core';
import CartasPanel from './CartasPanel.svelte';

export { default as CartasPanel } from './CartasPanel.svelte';

export const menuCartasModule: UIModule = {
  manifest: {
    id: 'menu-cartas',
    name: 'Cartas',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'menu-cartas-btn',
      icon: '📋',
      label: 'Cartas',
      action: { type: 'panel', panelId: 'menu-cartas-panel' },
      order: 5
    },
    panels: [{
      id: 'menu-cartas-panel',
      title: 'Cartas Generadas',
      size: 'lg'
    }]
  },
  PanelComponent: CartasPanel
};

export default menuCartasModule;
