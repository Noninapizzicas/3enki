import type { UIModule } from '$lib/ui-core';
import ProductosPanel from './ProductosPanel.svelte';

export const productosModule: UIModule = {
  manifest: {
    id: 'productos',
    name: 'Productos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'productos-btn',
      icon: '🍕',
      label: 'Productos',
      action: { type: 'panel', panelId: 'productos-panel' },
      order: 1
    },
    panels: [{
      id: 'productos-panel',
      title: 'Productos',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: ProductosPanel
};

export default productosModule;

export { default as ProductosPanel } from './ProductosPanel.svelte';
