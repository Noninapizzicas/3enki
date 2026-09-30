/**
 * Módulo Clave natural — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'clave-natural' alimentado por su blueprint (clave-natural.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ClaveNaturalPanel from './ClaveNaturalPanel.svelte';

export const claveNaturalModule: UIModule = {
  manifest: {
    id: 'clave-natural',
    name: 'Clave natural',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'clave-natural-btn',
      icon: '⚙️',
      label: 'Clave',
      action: { type: 'panel', panelId: 'clave-natural-panel' },
      order: 207
    },
    panels: [{
      id: 'clave-natural-panel',
      title: 'Clave natural',
      size: 'lg'
    }]
  },
  PanelComponent: ClaveNaturalPanel
};

export default claveNaturalModule;

export { default as ClaveNaturalPanel } from './ClaveNaturalPanel.svelte';
