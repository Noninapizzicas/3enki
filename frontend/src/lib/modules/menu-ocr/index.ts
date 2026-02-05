import type { UIModule } from '$lib/ui-core';
import OcrPanel from './OcrPanel.svelte';

export const menuOcrModule: UIModule = {
  manifest: {
    id: 'menu-ocr',
    name: 'OCR',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'menu-ocr-btn',
      icon: '🔍',
      label: 'OCR',
      action: { type: 'panel', panelId: 'menu-ocr-panel' },
      order: 3
    },
    panels: [{
      id: 'menu-ocr-panel',
      title: 'Extraer Texto (OCR)',
      size: 'md'
    }]
  },
  PanelComponent: OcrPanel
};

export default menuOcrModule;
