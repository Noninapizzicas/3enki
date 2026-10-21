import type { UIModule } from '$lib/ui-core';
import CobrosPanel from './CobrosPanel.svelte';

export const cobrosModule: UIModule = {
  manifest: {
    id: 'cobros',
    name: 'Cobros',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cobros-btn',
      icon: '💳',
      label: 'Cobros',
      action: { type: 'panel', panelId: 'cobros-panel' },
      order: 42
    },
    panels: [{
      id: 'cobros-panel',
      title: 'Cobros',
      size: 'lg'
    }]
  },
  PanelComponent: CobrosPanel
};

export default cobrosModule;

export { default as CobrosPanel } from './CobrosPanel.svelte';
