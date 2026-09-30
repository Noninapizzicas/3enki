/**
 * Módulo Control de calidad — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'control-calidad-muestreo' alimentado por su blueprint (control-calidad-muestreo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ControlCalidadMuestreoPanel from './ControlCalidadMuestreoPanel.svelte';

export const controlCalidadMuestreoModule: UIModule = {
  manifest: {
    id: 'control-calidad-muestreo',
    name: 'Control de calidad',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'control-calidad-muestreo-btn',
      icon: '⚙️',
      label: 'Calidad',
      action: { type: 'panel', panelId: 'control-calidad-muestreo-panel' },
      order: 211
    },
    panels: [{
      id: 'control-calidad-muestreo-panel',
      title: 'Control de calidad',
      size: 'lg'
    }]
  },
  PanelComponent: ControlCalidadMuestreoPanel
};

export default controlCalidadMuestreoModule;

export { default as ControlCalidadMuestreoPanel } from './ControlCalidadMuestreoPanel.svelte';
