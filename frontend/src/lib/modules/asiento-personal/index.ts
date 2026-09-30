/**
 * Módulo Asiento de personal — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'asiento-personal' alimentado por su blueprint (asiento-personal.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AsientoPersonalPanel from './AsientoPersonalPanel.svelte';

export const asientoPersonalModule: UIModule = {
  manifest: {
    id: 'asiento-personal',
    name: 'Asiento de personal',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'asiento-personal-btn',
      icon: '👤',
      label: 'Asiento pers.',
      action: { type: 'panel', panelId: 'asiento-personal-panel' },
      order: 121
    },
    panels: [{
      id: 'asiento-personal-panel',
      title: 'Asiento de personal',
      size: 'lg'
    }]
  },
  PanelComponent: AsientoPersonalPanel
};

export default asientoPersonalModule;

export { default as AsientoPersonalPanel } from './AsientoPersonalPanel.svelte';
