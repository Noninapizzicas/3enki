/**
 * Módulo Traza de asiento — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'traza-asiento' alimentado por su blueprint (traza-asiento.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import TrazaAsientoPanel from './TrazaAsientoPanel.svelte';

export const trazaAsientoModule: UIModule = {
  manifest: {
    id: 'traza-asiento',
    name: 'Traza de asiento',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'traza-asiento-btn',
      icon: '🧾',
      label: 'Traza asiento',
      action: { type: 'panel', panelId: 'traza-asiento-panel' },
      order: 97
    },
    panels: [{
      id: 'traza-asiento-panel',
      title: 'Traza de asiento',
      size: 'lg'
    }]
  },
  PanelComponent: TrazaAsientoPanel
};

export default trazaAsientoModule;

export { default as TrazaAsientoPanel } from './TrazaAsientoPanel.svelte';
