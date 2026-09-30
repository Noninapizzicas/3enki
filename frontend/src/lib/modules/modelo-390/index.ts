/**
 * Módulo Modelo 390 — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'modelo-390' alimentado por su blueprint (modelo-390.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import Modelo390Panel from './Modelo390Panel.svelte';

export const modelo390Module: UIModule = {
  manifest: {
    id: 'modelo-390',
    name: 'Modelo 390',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'modelo-390-btn',
      icon: '🧾',
      label: '390',
      action: { type: 'panel', panelId: 'modelo-390-panel' },
      order: 63
    },
    panels: [{
      id: 'modelo-390-panel',
      title: 'Modelo 390',
      size: 'lg'
    }]
  },
  PanelComponent: Modelo390Panel
};

export default modelo390Module;

export { default as Modelo390Panel } from './Modelo390Panel.svelte';
