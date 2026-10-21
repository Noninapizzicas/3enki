/**
 * Módulo Mise en Place — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'mise-en-place' alimentado por su blueprint (mise-en-place.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import MiseEnPlacePanel from './MiseEnPlacePanel.svelte';

export const miseEnPlaceModule: UIModule = {
  manifest: {
    id: 'mise-en-place',
    name: 'Mise en Place',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'mise-en-place-btn',
      icon: '🥘',
      label: 'Mise en Place',
      action: { type: 'panel', panelId: 'mise-en-place-panel' },
      order: 12
    },
    panels: [{
      id: 'mise-en-place-panel',
      title: 'Mise en Place',
      size: 'lg'
    }]
  },
  PanelComponent: MiseEnPlacePanel
};

export default miseEnPlaceModule;

export { default as MiseEnPlacePanel } from './MiseEnPlacePanel.svelte';
