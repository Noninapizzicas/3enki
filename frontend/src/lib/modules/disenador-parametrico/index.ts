import type { UIModule } from '$lib/ui-core';
import DisenadorPanel from './DisenadorPanel.svelte';

export const disenadorParametricoModule: UIModule = {
  manifest: {
    id: 'disenador-parametrico',
    name: 'Diseñador Paramétrico',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'disenador-parametrico-btn',
      icon: '📐',
      label: 'Diseñador',
      action: { type: 'panel', panelId: 'disenador-parametrico-panel' },
      order: 5
    },
    panels: [{
      id: 'disenador-parametrico-panel',
      title: 'Diseñador Paramétrico (OpenSCAD)',
      size: 'md',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: DisenadorPanel
};

export default disenadorParametricoModule;
