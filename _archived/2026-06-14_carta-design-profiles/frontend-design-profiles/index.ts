import type { UIModule } from '$lib/ui-core';
import DesignProfilesPanel from './DesignProfilesPanel.svelte';

export { default as DesignProfilesPanel } from './DesignProfilesPanel.svelte';

export const designProfilesModule: UIModule = {
  manifest: {
    id: 'design-profiles',
    name: 'Estilos',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'design-profiles-btn',
      icon: '🎭',
      label: 'Estilos',
      action: { type: 'panel', panelId: 'design-profiles-panel' },
      order: 2
    },
    panels: [{
      id: 'design-profiles-panel',
      title: 'Perfiles de Estilo',
      size: 'lg'
    }]
  },
  PanelComponent: DesignProfilesPanel
};

export default designProfilesModule;
