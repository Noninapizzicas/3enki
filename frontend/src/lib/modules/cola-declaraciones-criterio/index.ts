/**
 * Módulo Cola de decisiones — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cola-declaraciones-criterio' alimentado por su blueprint (cola-declaraciones-criterio.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ColaDeclaracionesCriterioPanel from './ColaDeclaracionesCriterioPanel.svelte';

export const colaDeclaracionesCriterioModule: UIModule = {
  manifest: {
    id: 'cola-declaraciones-criterio',
    name: 'Cola de decisiones',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'cola-declaraciones-criterio-btn',
      icon: '⚙️',
      label: 'Decisiones',
      action: { type: 'panel', panelId: 'cola-declaraciones-criterio-panel' },
      order: 210
    },
    panels: [{
      id: 'cola-declaraciones-criterio-panel',
      title: 'Cola de decisiones',
      size: 'lg'
    }]
  },
  PanelComponent: ColaDeclaracionesCriterioPanel
};

export default colaDeclaracionesCriterioModule;

export { default as ColaDeclaracionesCriterioPanel } from './ColaDeclaracionesCriterioPanel.svelte';
