import type { UIModule } from '$lib/ui-core';
import CartaConfigPanel from './CartaConfigPanel.svelte';

export const cartaConfigModule: UIModule = {
  manifest: {
    id: 'carta-config',
    name: 'Configuración Carta Digital',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-config-btn',
      icon: '⚙️',
      label: 'Config',
      action: { type: 'panel', panelId: 'carta-config-panel' },
      order: 1
    },
    panels: [{
      id: 'carta-config-panel',
      title: 'Configuración de Carta Digital',
      size: 'md'
    }]
  },
  PanelComponent: CartaConfigPanel
};

export default cartaConfigModule;
