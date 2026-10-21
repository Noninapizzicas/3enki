/**
 * Módulo Panel-Trabajador — F7 (construir-interfaz) del proyecto 3D.
 * Cara OPERATIVA / rol HOY del taller. Store MQTT `panel-trabajador` + panel
 * Svelte: estado en vivo, próxima a encadenar, pendientes, controles HOY que
 * DELEGAN y últimos eventos. NADA de decisión futura (eso es panel-jefe).
 */
import type { UIModule } from '$lib/ui-core';
import PanelTrabajadorPanel from './PanelTrabajadorPanel.svelte';

export const panelTrabajadorModule: UIModule = {
  manifest: {
    id: 'panel-trabajador',
    name: 'Panel del trabajador',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'panel-trabajador-btn',
      icon: '🔧',
      label: 'Trabajador',
      action: { type: 'panel', panelId: 'panel-trabajador-panel' },
      order: 9
    },
    panels: [{
      id: 'panel-trabajador-panel',
      title: 'Panel del trabajador',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: PanelTrabajadorPanel
};

export default panelTrabajadorModule;

export { default as PanelTrabajadorPanel } from './PanelTrabajadorPanel.svelte';
