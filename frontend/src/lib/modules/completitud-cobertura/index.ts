/**
 * Módulo Completitud y cobertura — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'completitud-cobertura' alimentado por su blueprint (completitud-cobertura.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CompletitudCoberturaPanel from './CompletitudCoberturaPanel.svelte';

export const completitudCoberturaModule: UIModule = {
  manifest: {
    id: 'completitud-cobertura',
    name: 'Completitud y cobertura',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'completitud-cobertura-btn',
      icon: '⚙️',
      label: 'Cobertura',
      action: { type: 'panel', panelId: 'completitud-cobertura-panel' },
      order: 203
    },
    panels: [{
      id: 'completitud-cobertura-panel',
      title: 'Completitud y cobertura',
      size: 'lg'
    }]
  },
  PanelComponent: CompletitudCoberturaPanel
};

export default completitudCoberturaModule;

export { default as CompletitudCoberturaPanel } from './CompletitudCoberturaPanel.svelte';
