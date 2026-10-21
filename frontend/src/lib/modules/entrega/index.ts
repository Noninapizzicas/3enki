/**
 * Módulo Entrega — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'entrega' alimentado por su blueprint (entrega.blueprint.json, sección `ui`).
 * Reflejo del patrón masa (F7): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EntregaPanel from './EntregaPanel.svelte';

export const entregaModule: UIModule = {
  manifest: {
    id: 'entrega',
    name: 'Entrega',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'entrega-btn',
      icon: '🛵',
      label: 'Entrega',
      action: { type: 'panel', panelId: 'entrega-panel' },
      order: 11
    },
    panels: [{
      id: 'entrega-panel',
      title: 'Entrega',
      size: 'lg'
    }]
  },
  PanelComponent: EntregaPanel
};

export default entregaModule;

export { default as EntregaPanel } from './EntregaPanel.svelte';
