/**
 * Módulo Generador de modelo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'generador-modelo' alimentado por su blueprint (generador-modelo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import GeneradorModeloPanel from './GeneradorModeloPanel.svelte';

export const generadorModeloModule: UIModule = {
  manifest: {
    id: 'generador-modelo',
    name: 'Generador de modelo',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'generador-modelo-btn',
      icon: '🧾',
      label: 'Generar modelo',
      action: { type: 'panel', panelId: 'generador-modelo-panel' },
      order: 69
    },
    panels: [{
      id: 'generador-modelo-panel',
      title: 'Generador de modelo',
      size: 'lg'
    }]
  },
  PanelComponent: GeneradorModeloPanel
};

export default generadorModeloModule;

export { default as GeneradorModeloPanel } from './GeneradorModeloPanel.svelte';
