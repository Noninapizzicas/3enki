/**
 * Módulo Motor de avisos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'motor-avisos' alimentado por su blueprint (motor-avisos.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import MotorAvisosPanel from './MotorAvisosPanel.svelte';

export const MotorAvisosModule: UIModule = {
  manifest: {
    id: 'motor-avisos',
    name: 'Motor de avisos',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'motor-avisos-btn',
      icon: '🔔',
      label: 'Motor avisos',
      action: { type: 'panel', panelId: 'motor-avisos-panel' },
      order: 110
    },
    panels: [{
      id: 'motor-avisos-panel',
      title: 'Motor de avisos',
      size: 'lg'
    }]
  },
  PanelComponent: MotorAvisosPanel
};

export default MotorAvisosModule;

export { default as MotorAvisosPanel } from './MotorAvisosPanel.svelte';
