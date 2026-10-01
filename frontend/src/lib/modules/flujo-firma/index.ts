/**
 * Módulo Flujo de firma — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'flujo-firma' alimentado por su blueprint (flujo-firma.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import FlujoFirmaPanel from './FlujoFirmaPanel.svelte';

export const flujoFirmaModule: UIModule = {
  manifest: {
    id: 'flujo-firma',
    name: 'Flujo de firma',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'flujo-firma-btn',
      icon: '✍️',
      label: 'Flujo firma',
      action: { type: 'panel', panelId: 'flujo-firma-panel' },
      order: 93
    },
    panels: [{
      id: 'flujo-firma-panel',
      title: 'Flujo de firma',
      size: 'lg'
    }]
  },
  PanelComponent: FlujoFirmaPanel
};

export default flujoFirmaModule;

export { default as FlujoFirmaPanel } from './FlujoFirmaPanel.svelte';
