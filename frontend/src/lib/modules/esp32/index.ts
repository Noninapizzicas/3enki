import type { UIModule } from '$lib/ui-core';
import Esp32Panel from './Esp32Panel.svelte';

export const esp32Module: UIModule = {
  manifest: {
    id: 'esp32',
    name: 'ESP32',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'esp32-btn',
      icon: '⚡',
      label: 'ESP32',
      action: { type: 'panel', panelId: 'esp32-panel' },
      order: 2
    },
    panels: [{
      id: 'esp32-panel',
      title: 'ESP32',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: Esp32Panel
};

export default esp32Module;
