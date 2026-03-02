import type { UIModule } from '$lib/ui-core';
import CartaStatsPanel from './CartaStatsPanel.svelte';

export const cartaStatsModule: UIModule = {
  manifest: {
    id: 'carta-stats',
    name: 'Estadísticas Carta Digital',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-stats-btn',
      icon: '📊',
      label: 'Stats',
      action: { type: 'panel', panelId: 'carta-stats-panel' },
      order: 4
    },
    panels: [{
      id: 'carta-stats-panel',
      title: 'Estadísticas de Carta Digital',
      size: 'md'
    }]
  },
  PanelComponent: CartaStatsPanel
};

export default cartaStatsModule;
