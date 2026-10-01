/**
 * Módulo Cola de criterios — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cola-declaraciones-criterio' alimentado por su blueprint (cola-declaraciones-criterio.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import ColaDeclaracionesCriterioPanel from './ColaDeclaracionesCriterioPanel.svelte';

export const ColaDeclaracionesCriterioModule: UIModule = {
  manifest: {
    id: 'cola-declaraciones-criterio',
    name: 'Cola de criterios',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'cola-declaraciones-criterio-btn',
      icon: '📋',
      label: 'Cola criterios',
      action: { type: 'panel', panelId: 'cola-declaraciones-criterio-panel' },
      order: 109
    },
    panels: [{
      id: 'cola-declaraciones-criterio-panel',
      title: 'Cola de criterios',
      size: 'lg'
    }]
  },
  PanelComponent: ColaDeclaracionesCriterioPanel
};

export default ColaDeclaracionesCriterioModule;

export { default as ColaDeclaracionesCriterioPanel } from './ColaDeclaracionesCriterioPanel.svelte';
