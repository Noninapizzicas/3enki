import type { UIModule } from '$lib/ui-core';
import PuenteCrealityPanel from './PuenteCrealityPanel.svelte';

export const puente_crealityModule: UIModule = {
  manifest: {
    id: 'puente_creality',
    name: 'PuenteCreality',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'puente_creality-btn',
      icon: '📦',
      label: 'PuenteCreality',
      action: { type: 'panel', panelId: 'puente_creality-panel' },
      order: 50
    },
    panels: [{
      id: 'puente_creality-panel',
      title: 'PuenteCreality',
      size: 'lg'
    }]
  },
  PanelComponent: PuenteCrealityPanel
};

export default puente_crealityModule;

export { default as PuenteCrealityPanel } from './PuenteCrealityPanel.svelte';
