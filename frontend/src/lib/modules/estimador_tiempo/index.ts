import type { UIModule } from '$lib/ui-core';
import EstimadorTiempoPanel from './EstimadorTiempoPanel.svelte';

export const estimador_tiempoModule: UIModule = {
  manifest: {
    id: 'estimador_tiempo',
    name: 'EstimadorTiempo',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'estimador_tiempo-btn',
      icon: '📦',
      label: 'EstimadorTiempo',
      action: { type: 'panel', panelId: 'estimador_tiempo-panel' },
      order: 50
    },
    panels: [{
      id: 'estimador_tiempo-panel',
      title: 'EstimadorTiempo',
      size: 'lg'
    }]
  },
  PanelComponent: EstimadorTiempoPanel
};

export default estimador_tiempoModule;

export { default as EstimadorTiempoPanel } from './EstimadorTiempoPanel.svelte';
