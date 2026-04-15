import type { UIModule } from '$lib/ui-core';
import PerfilPanel from './PerfilPanel.svelte';

export const marketingPerfilModule: UIModule = {
  manifest: {
    id: 'marketing-perfil',
    name: 'Perfil de Marca',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'marketing-perfil-btn',
      icon: '🎨',
      label: 'Perfil',
      action: { type: 'panel', panelId: 'marketing-perfil-panel' },
      order: 1
    },
    panels: [{
      id: 'marketing-perfil-panel',
      title: 'Perfil de Marca',
      size: 'md'
    }]
  },
  PanelComponent: PerfilPanel
};

export default marketingPerfilModule;
