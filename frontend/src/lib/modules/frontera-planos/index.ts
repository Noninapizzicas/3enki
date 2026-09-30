/**
 * Módulo Frontera de planos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'frontera-planos' alimentado por su blueprint (frontera-planos.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import FronteraPlanosPanel from './FronteraPlanosPanel.svelte';

export const fronteraPlanosModule: UIModule = {
  manifest: {
    id: 'frontera-planos',
    name: 'Frontera de planos',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'frontera-planos-btn',
      icon: '⚙️',
      label: 'Planos',
      action: { type: 'panel', panelId: 'frontera-planos-panel' },
      order: 208
    },
    panels: [{
      id: 'frontera-planos-panel',
      title: 'Frontera de planos',
      size: 'lg'
    }]
  },
  PanelComponent: FronteraPlanosPanel
};

export default fronteraPlanosModule;

export { default as FronteraPlanosPanel } from './FronteraPlanosPanel.svelte';
