/**
 * Módulo Sello de cobertura — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'sello-cobertura' alimentado por su blueprint (sello-cobertura.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import SelloCoberturaPanel from './SelloCoberturaPanel.svelte';

export const selloCoberturaModule: UIModule = {
  manifest: {
    id: 'sello-cobertura',
    name: 'Sello de cobertura',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'sello-cobertura-btn',
      icon: '📊',
      label: 'Sellar',
      action: { type: 'panel', panelId: 'sello-cobertura-panel' },
      order: 227
    },
    panels: [{
      id: 'sello-cobertura-panel',
      title: 'Sello de cobertura',
      size: 'lg'
    }]
  },
  PanelComponent: SelloCoberturaPanel
};

export default selloCoberturaModule;

export { default as SelloCoberturaPanel } from './SelloCoberturaPanel.svelte';
