/**
 * Módulo Variaciones — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'variaciones' alimentado por su blueprint (variaciones.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import VariacionesPanel from './VariacionesPanel.svelte';

export const variacionesModule: UIModule = {
  manifest: {
    id: 'variaciones',
    name: 'Variaciones',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'variaciones-btn',
      icon: '🔧',
      label: 'Variaciones',
      action: { type: 'panel', panelId: 'variaciones-panel' },
      order: 16
    },
    panels: [{
      id: 'variaciones-panel',
      title: 'Variaciones',
      size: 'lg'
    }]
  },
  PanelComponent: VariacionesPanel
};

export default variacionesModule;

export { default as VariacionesPanel } from './VariacionesPanel.svelte';
