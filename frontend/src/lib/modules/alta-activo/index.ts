/**
 * Módulo Alta de activo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'alta-activo' alimentado por su blueprint (alta-activo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AltaActivoPanel from './AltaActivoPanel.svelte';

export const AltaActivoModule: UIModule = {
  manifest: {
    id: 'alta-activo',
    name: 'Alta de activo',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'alta-activo-btn',
      icon: '🏗️',
      label: 'Alta activo',
      action: { type: 'panel', panelId: 'alta-activo-panel' },
      order: 107
    },
    panels: [{
      id: 'alta-activo-panel',
      title: 'Alta de activo',
      size: 'lg'
    }]
  },
  PanelComponent: AltaActivoPanel
};

export default AltaActivoModule;

export { default as AltaActivoPanel } from './AltaActivoPanel.svelte';
