/**
 * Módulo Variación de stock — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'variacion-stock-valorada' alimentado por su blueprint (variacion-stock-valorada.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import VariacionStockValoradaPanel from './VariacionStockValoradaPanel.svelte';

export const variacionStockValoradaModule: UIModule = {
  manifest: {
    id: 'variacion-stock-valorada',
    name: 'Variación de stock',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'variacion-stock-valorada-btn',
      icon: '📊',
      label: 'Variación',
      action: { type: 'panel', panelId: 'variacion-stock-valorada-panel' },
      order: 223
    },
    panels: [{
      id: 'variacion-stock-valorada-panel',
      title: 'Variación de stock',
      size: 'lg'
    }]
  },
  PanelComponent: VariacionStockValoradaPanel
};

export default variacionStockValoradaModule;

export { default as VariacionStockValoradaPanel } from './VariacionStockValoradaPanel.svelte';
