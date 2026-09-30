/**
 * Módulo Aislamiento de negocio — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'aislamiento-negocio' alimentado por su blueprint (aislamiento-negocio.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AislamientoNegocioPanel from './AislamientoNegocioPanel.svelte';

export const aislamientoNegocioModule: UIModule = {
  manifest: {
    id: 'aislamiento-negocio',
    name: 'Aislamiento de negocio',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'aislamiento-negocio-btn',
      icon: '📦',
      label: 'Aislamiento',
      action: { type: 'panel', panelId: 'aislamiento-negocio-panel' },
      order: 134
    },
    panels: [{
      id: 'aislamiento-negocio-panel',
      title: 'Aislamiento de negocio',
      size: 'lg'
    }]
  },
  PanelComponent: AislamientoNegocioPanel
};

export default aislamientoNegocioModule;

export { default as AislamientoNegocioPanel } from './AislamientoNegocioPanel.svelte';
