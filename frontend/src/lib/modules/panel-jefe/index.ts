/**
 * Módulo Panel-Jefe — F7 (construir-interfaz) del proyecto 3D.
 * Cara AGREGADA / rol FUTURO del taller. Store MQTT `panel-jefe` + panel Svelte:
 * dashboard de conjunto, propuestas de orden y decisiones que DELEGAN
 * (aprobar/marcar prioridad/pedir reposición). CERO control de máquina (eso es
 * panel-trabajador). CERO juicio automático: PROPUESTA ≠ DECISIÓN.
 */
import type { UIModule } from '$lib/ui-core';
import PanelJefePanel from './PanelJefePanel.svelte';

export const panelJefeModule: UIModule = {
  manifest: {
    id: 'panel-jefe',
    name: 'Panel del jefe',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'panel-jefe-btn',
      icon: '🗂',
      label: 'Jefe',
      action: { type: 'panel', panelId: 'panel-jefe-panel' },
      order: 10
    },
    panels: [{
      id: 'panel-jefe-panel',
      title: 'Panel del jefe',
      size: 'lg',
      position: 'right',
      resizable: true
    }]
  },
  PanelComponent: PanelJefePanel
};

export default panelJefeModule;

export { default as PanelJefePanel } from './PanelJefePanel.svelte';
