/**
 * Módulo Ajuste de asiento — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'asiento-ajuste' alimentado por su blueprint (asiento-ajuste.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AsientoAjustePanel from './AsientoAjustePanel.svelte';

export const asientoAjusteModule: UIModule = {
  manifest: {
    id: 'asiento-ajuste',
    name: 'Ajuste de asiento',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'asiento-ajuste-btn',
      icon: '📒',
      label: 'Ajuste',
      action: { type: 'panel', panelId: 'asiento-ajuste-panel' },
      order: 51
    },
    panels: [{
      id: 'asiento-ajuste-panel',
      title: 'Ajuste de asiento',
      size: 'lg'
    }]
  },
  PanelComponent: AsientoAjustePanel
};

export default asientoAjusteModule;

export { default as AsientoAjustePanel } from './AsientoAjustePanel.svelte';
