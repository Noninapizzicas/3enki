import type { UIModule } from '$lib/ui-core';
import CartaExportPanel from './CartaExportPanel.svelte';

export const cartaExportModule: UIModule = {
  manifest: {
    id: 'carta-export',
    name: 'Exportar Carta Digital',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-export-btn',
      icon: '📤',
      label: 'Exportar',
      action: { type: 'panel', panelId: 'carta-export-panel' },
      order: 3
    },
    panels: [{
      id: 'carta-export-panel',
      title: 'Exportar Carta Digital',
      size: 'md'
    }]
  },
  PanelComponent: CartaExportPanel
};

export default cartaExportModule;
