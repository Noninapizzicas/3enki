/**
 * Módulo Dashboard nichos — observabilidad solo lectura del vertical nichos.
 * BlueprintForm renderiza las 5 zonas de consulta RPC alimentadas por el blueprint.
 * moduleId="nichos" = dominio MQTT real de las RPCs del vertical.
 */

import type { UIModule } from '$lib/ui-core';
import DashboardNichosPanel from './DashboardNichosPanel.svelte';

export const dashboardNichosModule: UIModule = {
  manifest: {
    id: 'dashboard-nichos',
    name: 'Dashboard nichos',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'dashboard-nichos-btn',
      icon: '📊',
      label: 'Dashboard nichos',
      action: { type: 'panel', panelId: 'dashboard-nichos-panel' },
      order: 97
    },
    panels: [{
      id: 'dashboard-nichos-panel',
      title: 'Dashboard nichos',
      size: 'lg'
    }]
  },
  PanelComponent: DashboardNichosPanel
};

export default dashboardNichosModule;

export { default as DashboardNichosPanel } from './DashboardNichosPanel.svelte';
