/**
 * Módulo Conciliación bancaria — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'conciliacion-bancaria' alimentado por su blueprint (conciliacion-bancaria.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ConciliacionBancariaPanel from './ConciliacionBancariaPanel.svelte';

export const conciliacionBancariaModule: UIModule = {
  manifest: {
    id: 'conciliacion-bancaria',
    name: 'Conciliación bancaria',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'conciliacion-bancaria-btn',
      icon: '🏦',
      label: 'Conciliar',
      action: { type: 'panel', panelId: 'conciliacion-bancaria-panel' },
      order: 93
    },
    panels: [{
      id: 'conciliacion-bancaria-panel',
      title: 'Conciliación bancaria',
      size: 'lg'
    }]
  },
  PanelComponent: ConciliacionBancariaPanel
};

export default conciliacionBancariaModule;

export { default as ConciliacionBancariaPanel } from './ConciliacionBancariaPanel.svelte';
