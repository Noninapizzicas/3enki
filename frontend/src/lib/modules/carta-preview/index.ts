import type { UIModule } from '$lib/ui-core';
import CartaPreviewPanel from './CartaPreviewPanel.svelte';

export const cartaPreviewModule: UIModule = {
  manifest: {
    id: 'carta-preview',
    name: 'Preview Carta Digital',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'carta-preview-btn',
      icon: '👁️',
      label: 'Preview',
      action: { type: 'panel', panelId: 'carta-preview-panel' },
      order: 2
    },
    panels: [{
      id: 'carta-preview-panel',
      title: 'Vista Previa de la Carta',
      size: 'lg'
    }]
  },
  PanelComponent: CartaPreviewPanel
};

export default cartaPreviewModule;
