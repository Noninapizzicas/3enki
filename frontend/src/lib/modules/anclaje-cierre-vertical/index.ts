/**
 * Módulo Anclaje de cierre — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'anclaje-cierre-vertical' alimentado por su blueprint (anclaje-cierre-vertical.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AnclajeCierreVerticalPanel from './AnclajeCierreVerticalPanel.svelte';

export const anclajeCierreVerticalModule: UIModule = {
  manifest: {
    id: 'anclaje-cierre-vertical',
    name: 'Anclaje de cierre',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'anclaje-cierre-vertical-btn',
      icon: '⚙️',
      label: 'Anclaje',
      action: { type: 'panel', panelId: 'anclaje-cierre-vertical-panel' },
      order: 202
    },
    panels: [{
      id: 'anclaje-cierre-vertical-panel',
      title: 'Anclaje de cierre',
      size: 'lg'
    }]
  },
  PanelComponent: AnclajeCierreVerticalPanel
};

export default anclajeCierreVerticalModule;

export { default as AnclajeCierreVerticalPanel } from './AnclajeCierreVerticalPanel.svelte';
