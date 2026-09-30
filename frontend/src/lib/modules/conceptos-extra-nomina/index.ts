/**
 * Módulo Conceptos extra — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'conceptos-extra-nomina' alimentado por su blueprint (conceptos-extra-nomina.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ConceptosExtraNominaPanel from './ConceptosExtraNominaPanel.svelte';

export const conceptosExtraNominaModule: UIModule = {
  manifest: {
    id: 'conceptos-extra-nomina',
    name: 'Conceptos extra',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'conceptos-extra-nomina-btn',
      icon: '👤',
      label: 'Conceptos',
      action: { type: 'panel', panelId: 'conceptos-extra-nomina-panel' },
      order: 125
    },
    panels: [{
      id: 'conceptos-extra-nomina-panel',
      title: 'Conceptos extra',
      size: 'lg'
    }]
  },
  PanelComponent: ConceptosExtraNominaPanel
};

export default conceptosExtraNominaModule;

export { default as ConceptosExtraNominaPanel } from './ConceptosExtraNominaPanel.svelte';
