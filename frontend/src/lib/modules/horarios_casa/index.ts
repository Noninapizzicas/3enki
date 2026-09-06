import type { UIModule } from '$lib/ui-core';
import HorariosCasaPanel from './HorariosCasaPanel.svelte';

export const horarios_casaModule: UIModule = {
  manifest: {
    id: 'horarios_casa',
    name: 'HorariosCasa',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'horarios_casa-btn',
      icon: '📦',
      label: 'HorariosCasa',
      action: { type: 'panel', panelId: 'horarios_casa-panel' },
      order: 50
    },
    panels: [{
      id: 'horarios_casa-panel',
      title: 'HorariosCasa',
      size: 'lg'
    }]
  },
  PanelComponent: HorariosCasaPanel
};

export default horarios_casaModule;

export { default as HorariosCasaPanel } from './HorariosCasaPanel.svelte';
