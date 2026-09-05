import type { UIModule } from '$lib/ui-core';
import OrquestadorPanel from './OrquestadorPanel.svelte';

export const orquestadorImpresionModule: UIModule = {
  manifest: {
    id: 'orquestador-impresion',
    name: 'Orquestador de Impresión',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'orquestador-impresion-btn',
      icon: '🔁',
      label: 'Orquestador',
      action: { type: 'panel', panelId: 'orquestador-impresion-panel' },
      order: 4
    },
    panels: [{
      id: 'orquestador-impresion-panel',
      title: 'Orquestador de Impresión',
      size: 'md',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: OrquestadorPanel
};

export default orquestadorImpresionModule;
