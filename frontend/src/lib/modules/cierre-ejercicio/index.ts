/**
 * Módulo Cierre de ejercicio — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cierre-ejercicio' alimentado por su blueprint (cierre-ejercicio.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import CierreEjercicioPanel from './CierreEjercicioPanel.svelte';

export const cierreEjercicioModule: UIModule = {
  manifest: {
    id: 'cierre-ejercicio',
    name: 'Cierre de ejercicio',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cierre-ejercicio-btn',
      icon: '🔒',
      label: 'Cierre ejercicio',
      action: { type: 'panel', panelId: 'cierre-ejercicio-panel' },
      order: 51
    },
    panels: [{
      id: 'cierre-ejercicio-panel',
      title: 'Cierre de ejercicio',
      size: 'lg'
    }]
  },
  PanelComponent: CierreEjercicioPanel
};

export default cierreEjercicioModule;

export { default as CierreEjercicioPanel } from './CierreEjercicioPanel.svelte';
