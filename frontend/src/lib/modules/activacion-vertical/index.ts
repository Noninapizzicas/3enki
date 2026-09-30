/**
 * Módulo Activación de vertical — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'activacion-vertical' alimentado por su blueprint (activacion-vertical.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ActivacionVerticalPanel from './ActivacionVerticalPanel.svelte';

export const activacionVerticalModule: UIModule = {
  manifest: {
    id: 'activacion-vertical',
    name: 'Activación de vertical',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'activacion-vertical-btn',
      icon: '🗂️',
      label: 'Activar',
      action: { type: 'panel', panelId: 'activacion-vertical-panel' },
      order: 236
    },
    panels: [{
      id: 'activacion-vertical-panel',
      title: 'Activación de vertical',
      size: 'lg'
    }]
  },
  PanelComponent: ActivacionVerticalPanel
};

export default activacionVerticalModule;

export { default as ActivacionVerticalPanel } from './ActivacionVerticalPanel.svelte';
