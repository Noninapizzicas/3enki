import type { UIModule } from '$lib/ui-core';
import DesignGalleryPanel from './DesignGalleryPanel.svelte';

export { default as DesignGalleryPanel } from './DesignGalleryPanel.svelte';

export const designGalleryModule: UIModule = {
  manifest: {
    id: 'design-gallery',
    name: 'Diseños',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'design-gallery-btn',
      icon: '🎨',
      label: 'Diseños',
      action: { type: 'panel', panelId: 'design-gallery-panel' },
      order: 1
    },
    panels: [{
      id: 'design-gallery-panel',
      title: 'Galería de Diseños',
      size: 'lg'
    }]
  },
  PanelComponent: DesignGalleryPanel
};

export default designGalleryModule;
