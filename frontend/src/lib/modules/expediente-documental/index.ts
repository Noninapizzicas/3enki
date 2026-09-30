/**
 * Módulo Expediente documental — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'expediente-documental' alimentado por su blueprint (expediente-documental.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ExpedienteDocumentalPanel from './ExpedienteDocumentalPanel.svelte';

export const expedienteDocumentalModule: UIModule = {
  manifest: {
    id: 'expediente-documental',
    name: 'Expediente documental',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'expediente-documental-btn',
      icon: '🗂️',
      label: 'Expediente',
      action: { type: 'panel', panelId: 'expediente-documental-panel' },
      order: 141
    },
    panels: [{
      id: 'expediente-documental-panel',
      title: 'Expediente documental',
      size: 'lg'
    }]
  },
  PanelComponent: ExpedienteDocumentalPanel
};

export default expedienteDocumentalModule;

export { default as ExpedienteDocumentalPanel } from './ExpedienteDocumentalPanel.svelte';
