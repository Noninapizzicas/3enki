/**
 * Módulo Factura rectificativa — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'factura-rectificativa' alimentado por su blueprint (factura-rectificativa.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import FacturaRectificativaPanel from './FacturaRectificativaPanel.svelte';

export const facturaRectificativaModule: UIModule = {
  manifest: {
    id: 'factura-rectificativa',
    name: 'Factura rectificativa',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'factura-rectificativa-btn',
      icon: '🏭',
      label: 'Rectificativa',
      action: { type: 'panel', panelId: 'factura-rectificativa-panel' },
      order: 156
    },
    panels: [{
      id: 'factura-rectificativa-panel',
      title: 'Factura rectificativa',
      size: 'lg'
    }]
  },
  PanelComponent: FacturaRectificativaPanel
};

export default facturaRectificativaModule;

export { default as FacturaRectificativaPanel } from './FacturaRectificativaPanel.svelte';
