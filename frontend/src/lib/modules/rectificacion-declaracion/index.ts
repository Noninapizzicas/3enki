/**
 * Módulo Rectificación de declaración — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'rectificacion-declaracion' alimentado por su blueprint (rectificacion-declaracion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import RectificacionDeclaracionPanel from './RectificacionDeclaracionPanel.svelte';

export const rectificacionDeclaracionModule: UIModule = {
  manifest: {
    id: 'rectificacion-declaracion',
    name: 'Rectificación de declaración',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'rectificacion-declaracion-btn',
      icon: '🧾',
      label: 'Rectificar declar.',
      action: { type: 'panel', panelId: 'rectificacion-declaracion-panel' },
      order: 87
    },
    panels: [{
      id: 'rectificacion-declaracion-panel',
      title: 'Rectificación de declaración',
      size: 'lg'
    }]
  },
  PanelComponent: RectificacionDeclaracionPanel
};

export default rectificacionDeclaracionModule;

export { default as RectificacionDeclaracionPanel } from './RectificacionDeclaracionPanel.svelte';
