import type { UIModule } from '$lib/ui-core';
import CartasImpresionPanel from './CartasImpresionPanel.svelte';

export const impresionCartasModule: UIModule = {
  manifest: {
    id: 'impresion-cartas',
    name: 'Cartas Imprimibles',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'impresion-cartas-btn',
      icon: '🖨️',
      label: 'Imprimir',
      action: { type: 'panel', panelId: 'impresion-cartas-panel' },
      order: 1
    },
    panels: [{
      id: 'impresion-cartas-panel',
      title: 'Cartas Imprimibles',
      size: 'lg'
    }]
  },
  PanelComponent: CartasImpresionPanel
};

export default impresionCartasModule;
