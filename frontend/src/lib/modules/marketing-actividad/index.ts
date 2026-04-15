import type { UIModule } from '$lib/ui-core';
import ActividadPanel from './ActividadPanel.svelte';

export const marketingActividadModule: UIModule = {
  manifest: {
    id: 'marketing-actividad',
    name: 'Actividad',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'marketing-actividad-btn',
      icon: '📊',
      label: 'Actividad',
      action: { type: 'panel', panelId: 'marketing-actividad-panel' },
      order: 2
    },
    panels: [{
      id: 'marketing-actividad-panel',
      title: 'Actividad',
      size: 'sm'
    }]
  },
  PanelComponent: ActividadPanel
};

export default marketingActividadModule;
