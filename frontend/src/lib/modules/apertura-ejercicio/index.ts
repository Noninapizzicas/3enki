/**
 * Módulo Apertura del ejercicio — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'apertura-ejercicio' alimentado por su blueprint (apertura-ejercicio.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AperturaEjercicioPanel from './AperturaEjercicioPanel.svelte';

export const aperturaEjercicioModule: UIModule = {
  manifest: {
    id: 'apertura-ejercicio',
    name: 'Apertura del ejercicio',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'apertura-ejercicio-btn',
      icon: '📒',
      label: 'Apertura',
      action: { type: 'panel', panelId: 'apertura-ejercicio-panel' },
      order: 54
    },
    panels: [{
      id: 'apertura-ejercicio-panel',
      title: 'Apertura del ejercicio',
      size: 'lg'
    }]
  },
  PanelComponent: AperturaEjercicioPanel
};

export default aperturaEjercicioModule;

export { default as AperturaEjercicioPanel } from './AperturaEjercicioPanel.svelte';
