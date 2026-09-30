/**
 * Módulo Motor de avisos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'motor-avisos' alimentado por su blueprint (motor-avisos.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import MotorAvisosPanel from './MotorAvisosPanel.svelte';

export const motorAvisosModule: UIModule = {
  manifest: {
    id: 'motor-avisos',
    name: 'Motor de avisos',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'motor-avisos-btn',
      icon: '🔔',
      label: 'Avisos',
      action: { type: 'panel', panelId: 'motor-avisos-panel' },
      order: 241
    },
    panels: [{
      id: 'motor-avisos-panel',
      title: 'Motor de avisos',
      size: 'lg'
    }]
  },
  PanelComponent: MotorAvisosPanel
};

export default motorAvisosModule;

export { default as MotorAvisosPanel } from './MotorAvisosPanel.svelte';
