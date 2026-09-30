/**
 * Módulo Líneas de nómina — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'lineas-nomina' alimentado por su blueprint (lineas-nomina.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import LineasNominaPanel from './LineasNominaPanel.svelte';

export const lineasNominaModule: UIModule = {
  manifest: {
    id: 'lineas-nomina',
    name: 'Líneas de nómina',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'lineas-nomina-btn',
      icon: '👤',
      label: 'Líneas',
      action: { type: 'panel', panelId: 'lineas-nomina-panel' },
      order: 122
    },
    panels: [{
      id: 'lineas-nomina-panel',
      title: 'Líneas de nómina',
      size: 'lg'
    }]
  },
  PanelComponent: LineasNominaPanel
};

export default lineasNominaModule;

export { default as LineasNominaPanel } from './LineasNominaPanel.svelte';
