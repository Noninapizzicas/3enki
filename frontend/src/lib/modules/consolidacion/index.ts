/**
 * Módulo Consolidación del grupo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'consolidacion' alimentado por su blueprint (consolidacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ConsolidacionPanel from './ConsolidacionPanel.svelte';

export const consolidacionModule: UIModule = {
  manifest: {
    id: 'consolidacion',
    name: 'Consolidación del grupo',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'consolidacion-btn',
      icon: '📦',
      label: 'Consolidar',
      action: { type: 'panel', panelId: 'consolidacion-panel' },
      order: 133
    },
    panels: [{
      id: 'consolidacion-panel',
      title: 'Consolidación del grupo',
      size: 'lg'
    }]
  },
  PanelComponent: ConsolidacionPanel
};

export default consolidacionModule;

export { default as ConsolidacionPanel } from './ConsolidacionPanel.svelte';
