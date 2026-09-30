/**
 * Módulo Mayor y balanza — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'mayor-balanza' alimentado por su blueprint (mayor-balanza.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import MayorBalanzaPanel from './MayorBalanzaPanel.svelte';

export const mayorBalanzaModule: UIModule = {
  manifest: {
    id: 'mayor-balanza',
    name: 'Mayor y balanza',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'mayor-balanza-btn',
      icon: '📒',
      label: 'Mayor',
      action: { type: 'panel', panelId: 'mayor-balanza-panel' },
      order: 33
    },
    panels: [{
      id: 'mayor-balanza-panel',
      title: 'Mayor y balanza',
      size: 'lg'
    }]
  },
  PanelComponent: MayorBalanzaPanel
};

export default mayorBalanzaModule;

export { default as MayorBalanzaPanel } from './MayorBalanzaPanel.svelte';
