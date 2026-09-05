import type { UIModule } from '$lib/ui-core';
import ColaModelosPanel from './ColaModelosPanel.svelte';

export const cola_modelosModule: UIModule = {
  manifest: {
    id: 'cola_modelos',
    name: 'ColaModelos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cola_modelos-btn',
      icon: '📦',
      label: 'ColaModelos',
      action: { type: 'panel', panelId: 'cola_modelos-panel' },
      order: 50
    },
    panels: [{
      id: 'cola_modelos-panel',
      title: 'ColaModelos',
      size: 'lg'
    }]
  },
  PanelComponent: ColaModelosPanel
};

export default cola_modelosModule;

export { default as ColaModelosPanel } from './ColaModelosPanel.svelte';
