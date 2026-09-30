/**
 * Módulo Informe de conciliación — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'informe-conciliacion' alimentado por su blueprint (informe-conciliacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import InformeConciliacionPanel from './InformeConciliacionPanel.svelte';

export const informeConciliacionModule: UIModule = {
  manifest: {
    id: 'informe-conciliacion',
    name: 'Informe de conciliación',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'informe-conciliacion-btn',
      icon: '🏦',
      label: 'Informe concil.',
      action: { type: 'panel', panelId: 'informe-conciliacion-panel' },
      order: 98
    },
    panels: [{
      id: 'informe-conciliacion-panel',
      title: 'Informe de conciliación',
      size: 'lg'
    }]
  },
  PanelComponent: InformeConciliacionPanel
};

export default informeConciliacionModule;

export { default as InformeConciliacionPanel } from './InformeConciliacionPanel.svelte';
