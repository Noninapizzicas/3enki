import type { UIModule } from '$lib/ui-core';
import Pdf2ImgPanel from './Pdf2ImgPanel.svelte';

export const menuPdf2ImgModule: UIModule = {
  manifest: {
    id: 'menu-pdf2img',
    name: 'PDF a Imagen',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'menu-pdf2img-btn',
      icon: '📄',
      label: 'PDF→IMG',
      action: { type: 'panel', panelId: 'menu-pdf2img-panel' },
      order: 1
    },
    panels: [{
      id: 'menu-pdf2img-panel',
      title: 'PDF a Imagen',
      size: 'sm'
    }]
  },
  PanelComponent: Pdf2ImgPanel
};

export default menuPdf2ImgModule;
