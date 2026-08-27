import type { UIModule } from '$lib/ui-core';
import PedidosPanel from './PedidosPanel.svelte';

export const pedidosModule: UIModule = {
  manifest: {
    id: 'pedidos',
    name: 'Pedidos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'pedidos-btn',
      icon: '📦',
      label: 'Pedidos',
      action: { type: 'panel', panelId: 'pedidos-panel' },
      order: 50
    },
    panels: [{
      id: 'pedidos-panel',
      title: 'Pedidos',
      size: 'lg'
    }]
  },
  PanelComponent: PedidosPanel
};

export default pedidosModule;

export { default as PedidosPanel } from './PedidosPanel.svelte';
