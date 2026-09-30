/**
 * Módulo Valoración de existencias — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'valoracion-existencia' alimentado por su blueprint (valoracion-existencia.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ValoracionExistenciaPanel from './ValoracionExistenciaPanel.svelte';

export const valoracionExistenciaModule: UIModule = {
  manifest: {
    id: 'valoracion-existencia',
    name: 'Valoración de existencias',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'valoracion-existencia-btn',
      icon: '📦',
      label: 'Valoración',
      action: { type: 'panel', panelId: 'valoracion-existencia-panel' },
      order: 132
    },
    panels: [{
      id: 'valoracion-existencia-panel',
      title: 'Valoración de existencias',
      size: 'lg'
    }]
  },
  PanelComponent: ValoracionExistenciaPanel
};

export default valoracionExistenciaModule;

export { default as ValoracionExistenciaPanel } from './ValoracionExistenciaPanel.svelte';
