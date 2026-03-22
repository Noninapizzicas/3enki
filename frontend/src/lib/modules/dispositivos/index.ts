import type { UIModule } from '$lib/ui-core';
import DispositivosPanel from './DispositivosPanel.svelte';

export const dispositivosModule: UIModule = {
  manifest: {
    id: 'dispositivos',
    name: 'Dispositivos',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'dispositivos-btn',
      icon: '📟',
      label: 'Dispositivos',
      action: { type: 'panel', panelId: 'dispositivos-panel' },
      order: 1
    },
    panels: [{
      id: 'dispositivos-panel',
      title: 'Dispositivos',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: DispositivosPanel
};

export default dispositivosModule;
