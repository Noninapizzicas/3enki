/**
 * Módulo Masa — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las 4 zonas del panel del módulo
 * 'masa' alimentado por su blueprint (masa.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import MasaPanel from './MasaPanel.svelte';

export const masaModule: UIModule = {
  manifest: {
    id: 'masa',
    name: 'Masa',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'masa-btn',
      icon: '🍞',
      label: 'Masa',
      action: { type: 'panel', panelId: 'masa-panel' },
      order: 10
    },
    panels: [{
      id: 'masa-panel',
      title: 'Masa',
      size: 'lg'
    }]
  },
  PanelComponent: MasaPanel
};

export default masaModule;

export { default as MasaPanel } from './MasaPanel.svelte';
