/**
 * Módulo Asiento de ajuste — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'asiento-ajuste' alimentado por su blueprint (asiento-ajuste.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AsientoAjustePanel from './AsientoAjustePanel.svelte';

export const asientoAjusteModule: UIModule = {
  manifest: {
    id: 'asiento-ajuste',
    name: 'Asiento de ajuste',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'asiento-ajuste-btn',
      icon: '🩹',
      label: 'Asiento ajuste',
      action: { type: 'panel', panelId: 'asiento-ajuste-panel' },
      order: 90
    },
    panels: [{
      id: 'asiento-ajuste-panel',
      title: 'Asiento de ajuste',
      size: 'lg'
    }]
  },
  PanelComponent: AsientoAjustePanel
};

export default asientoAjusteModule;

export { default as AsientoAjustePanel } from './AsientoAjustePanel.svelte';
