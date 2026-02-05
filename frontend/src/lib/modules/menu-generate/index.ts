import type { UIModule } from '$lib/ui-core';
import GeneratePanel from './GeneratePanel.svelte';

export const menuGenerateModule: UIModule = {
  manifest: {
    id: 'menu-generate',
    name: 'Generar Carta',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'menu-generate-btn',
      icon: '✨',
      label: 'Generar',
      action: { type: 'panel', panelId: 'menu-generate-panel' },
      order: 4
    },
    panels: [{
      id: 'menu-generate-panel',
      title: 'Generar Carta',
      size: 'md'
    }]
  },
  PanelComponent: GeneratePanel
};

export default menuGenerateModule;
