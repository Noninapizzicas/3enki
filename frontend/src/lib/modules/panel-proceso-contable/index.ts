/**
 * Módulo Panel del proceso — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'panel-proceso-contable' alimentado por su blueprint (panel-proceso-contable.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PanelProcesoContablePanel from './PanelProcesoContablePanel.svelte';

export const panelProcesoContableModule: UIModule = {
  manifest: {
    id: 'panel-proceso-contable',
    name: 'Panel del proceso',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'panel-proceso-contable-btn',
      icon: '🗂️',
      label: 'Proceso',
      action: { type: 'panel', panelId: 'panel-proceso-contable-panel' },
      order: 231
    },
    panels: [{
      id: 'panel-proceso-contable-panel',
      title: 'Panel del proceso',
      size: 'lg'
    }]
  },
  PanelComponent: PanelProcesoContablePanel
};

export default panelProcesoContableModule;

export { default as PanelProcesoContablePanel } from './PanelProcesoContablePanel.svelte';
