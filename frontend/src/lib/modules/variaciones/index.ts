import type { UIModule } from '$lib/ui-core';
import VariacionesPanel from './VariacionesPanel.svelte';

export const variacionesModule: UIModule = {
  manifest: {
    id: 'variaciones',
    name: 'Variaciones',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'variaciones-btn',
      icon: '🔀',
      label: 'Variaciones',
      action: { type: 'panel', panelId: 'variaciones-panel' },
      order: 55
    },
    panels: [{
      id: 'variaciones-panel',
      title: 'Variaciones',
      size: 'lg'
    }]
  },
  PanelComponent: VariacionesPanel
};

export default variacionesModule;

export { default as VariacionesPanel } from './VariacionesPanel.svelte';
