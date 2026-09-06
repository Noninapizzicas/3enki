import type { UIModule } from '$lib/ui-core';
import CupulaStlPanel from './CupulaStlPanel.svelte';

export const cupula_stlModule: UIModule = {
  manifest: {
    id: 'cupula_stl',
    name: 'CupulaStl',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cupula_stl-btn',
      icon: '📦',
      label: 'CupulaStl',
      action: { type: 'panel', panelId: 'cupula_stl-panel' },
      order: 50
    },
    panels: [{
      id: 'cupula_stl-panel',
      title: 'CupulaStl',
      size: 'lg'
    }]
  },
  PanelComponent: CupulaStlPanel
};

export default cupula_stlModule;

export { default as CupulaStlPanel } from './CupulaStlPanel.svelte';
