/**
 * Módulo Modelo 303 — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'modelo-303' alimentado por su blueprint (modelo-303.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import Modelo303Panel from './Modelo303Panel.svelte';

export const modelo303Module: UIModule = {
  manifest: {
    id: 'modelo-303',
    name: 'Modelo 303',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'modelo-303-btn',
      icon: '🧾',
      label: '303',
      action: { type: 'panel', panelId: 'modelo-303-panel' },
      order: 62
    },
    panels: [{
      id: 'modelo-303-panel',
      title: 'Modelo 303',
      size: 'lg'
    }]
  },
  PanelComponent: Modelo303Panel
};

export default modelo303Module;

export { default as Modelo303Panel } from './Modelo303Panel.svelte';
