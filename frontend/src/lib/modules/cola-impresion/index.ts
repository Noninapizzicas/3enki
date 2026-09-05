import type { UIModule } from '$lib/ui-core';
import ColaImpresionPanel from './ColaImpresionPanel.svelte';

export const colaImpresionModule: UIModule = {
  manifest: {
    id: 'cola-impresion',
    name: 'Cola de Impresión',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'cola-impresion-btn',
      icon: '🖨️',
      label: 'Cola 3D',
      action: { type: 'panel', panelId: 'cola-impresion-panel' },
      order: 3
    },
    panels: [{
      id: 'cola-impresion-panel',
      title: 'Cola de Impresión 3D',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: ColaImpresionPanel
};

export default colaImpresionModule;
