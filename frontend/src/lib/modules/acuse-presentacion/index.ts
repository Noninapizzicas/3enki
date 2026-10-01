/**
 * Módulo Acuse de presentación — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'acuse-presentacion' alimentado por su blueprint (acuse-presentacion.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AcusePresentacionPanel from './AcusePresentacionPanel.svelte';

export const AcusePresentacionModule: UIModule = {
  manifest: {
    id: 'acuse-presentacion',
    name: 'Acuse de presentación',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'acuse-presentacion-btn',
      icon: '📮',
      label: 'Acuse present.',
      action: { type: 'panel', panelId: 'acuse-presentacion-panel' },
      order: 102
    },
    panels: [{
      id: 'acuse-presentacion-panel',
      title: 'Acuse de presentación',
      size: 'lg'
    }]
  },
  PanelComponent: AcusePresentacionPanel
};

export default AcusePresentacionModule;

export { default as AcusePresentacionPanel } from './AcusePresentacionPanel.svelte';
