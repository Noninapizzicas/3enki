import type { UIModule } from '$lib/ui-core';
import DisenadorParametricoPanel from './DisenadorParametricoPanel.svelte';

export const disenador_parametricoModule: UIModule = {
  manifest: {
    id: 'disenador_parametrico',
    name: 'DisenadorParametrico',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'disenador_parametrico-btn',
      icon: '📦',
      label: 'DisenadorParametrico',
      action: { type: 'panel', panelId: 'disenador_parametrico-panel' },
      order: 50
    },
    panels: [{
      id: 'disenador_parametrico-panel',
      title: 'DisenadorParametrico',
      size: 'lg'
    }]
  },
  PanelComponent: DisenadorParametricoPanel
};

export default disenador_parametricoModule;

export { default as DisenadorParametricoPanel } from './DisenadorParametricoPanel.svelte';
